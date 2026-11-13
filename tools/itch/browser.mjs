// A headless Chrome (or Chromium, or Edge) for verify.mjs, driven over the
// DevTools protocol on a pipe (--remote-debugging-pipe): no WebSocket, no
// port and no package to install. It uses a browser the machine already
// has: CHROME_PATH if set, else the usual places (GitHub's ubuntu-latest
// runners have Google Chrome). Software WebGL (SwiftShader) is turned on, so
// the game draws on a machine with no GPU.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

// The browser to use, or null when there is none.
export function findBrowser() {
  const given = process.env.CHROME_PATH;
  if (given) return existsSync(given) ? given : null;
  const win = process.platform === 'win32';
  const names = win ? ['chrome.exe', 'msedge.exe']
    : ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'chrome', 'microsoft-edge'];
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const name of names) if (existsSync(join(dir, name))) return join(dir, name);
  }
  const fixed = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    win32: [
      ...['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA'].map((v) => process.env[v] && join(process.env[v], 'Google', 'Chrome', 'Application', 'chrome.exe')),
      ...['PROGRAMFILES(X86)', 'PROGRAMFILES'].map((v) => process.env[v] && join(process.env[v], 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    ],
    linux: ['/opt/google/chrome/chrome', '/opt/pw-browsers/chromium'],
  }[process.platform] ?? [];
  return fixed.find((p) => p && existsSync(p)) ?? null;
}

// One DevTools connection: send(method, params, sessionId) answers with the
// result (or throws the error), on(method, fn) hears every event of that
// name as fn(params, sessionId).
class Connection {
  constructor(input, output) {
    this.input = input;
    this.id = 0;
    this.waiting = new Map();
    this.listeners = new Map();
    this.closed = false;
    let pending = '';
    output.setEncoding('utf8');
    output.on('data', (chunk) => {
      pending += chunk;
      let end;
      while ((end = pending.indexOf('\0')) >= 0) {
        const message = JSON.parse(pending.slice(0, end));
        pending = pending.slice(end + 1);
        this.dispatch(message);
      }
    });
    output.on('close', () => this.fail(new Error('the browser closed its DevTools pipe')));
  }

  dispatch(message) {
    if (message.id !== undefined) {
      const w = this.waiting.get(message.id);
      if (!w) return;
      this.waiting.delete(message.id);
      if (message.error) w.reject(new Error(`${w.method}: ${message.error.message}`));
      else w.resolve(message.result);
      return;
    }
    for (const fn of this.listeners.get(message.method) ?? []) fn(message.params, message.sessionId);
  }

  fail(err) {
    this.closed = true;
    for (const w of this.waiting.values()) w.reject(err);
    this.waiting.clear();
  }

  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error(`${method}: the browser is gone`));
    const id = ++this.id;
    const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject, method });
      this.input.write(`${JSON.stringify(message)}\0`);
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
}

// A promise that settles after `ms` without holding the process open.
const after = (ms, fn) => new Promise((resolve, reject) => setTimeout(() => {
  try { resolve(fn?.()); } catch (err) { reject(err); }
}, ms).unref());

// Starts the browser headless; resolves with { cdp, close(), version }.
export async function launch(executable, { width = 1280, height = 900 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'mavooli-verify-'));
  const args = [
    '--headless=new',
    '--remote-debugging-pipe',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--mute-audio',
    // Every frame drawn while the check runs, as on a screen.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    // The cross-origin game frame in a process of its own, as on itch.io.
    '--site-per-process',
    // WebGL with no GPU: SwiftShader, the software renderer Chrome ships.
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    // Linux CI runners cannot always start Chrome's sandbox; the page is the
    // game's own files on this machine.
    ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
    'about:blank',
  ];
  const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const cdp = new Connection(child.stdio[3], child.stdio[4]);
  child.stdio[3].on('error', () => {});

  const close = async () => {
    try {
      await Promise.race([cdp.send('Browser.close'), after(3000)]);
    } catch { /* already gone */ }
    if (child.exitCode === null) child.kill('SIGKILL');
    await Promise.race([exited, after(3000)]);
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  };

  try {
    const version = await Promise.race([
      cdp.send('Browser.getVersion'),
      exited.then((code) => { throw new Error(`the browser exited (${code}) before it answered:\n${stderr}`); }),
      after(30000, () => { throw new Error(`the browser did not answer within 30 s:\n${stderr}`); }),
    ]);
    return { cdp, close, version: version.product };
  } catch (err) {
    await close();
    throw err;
  }
}
