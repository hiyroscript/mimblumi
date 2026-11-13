// Checks the built itch.io release against the GitHub Pages build, then the
// way itch.io serves it: `npm run verify:itch` (after `npm run build:itch`).
// `-- --no-browser` skips step 4.
//
// 1. The release and its archive are valid (validate.mjs).
// 2. The same game as on GitHub Pages (equivalence.mjs): the Pages build of
//    the repository, made in a temporary folder, and the release differ in
//    nothing but how their URLs are written, byte for byte.
// 3. Over HTTP: dist/itch/ served by a tiny static server under a nested,
//    unrelated path (/html/16180339/, like itch.io's
//    https://html-classic.itch.zone/html/<upload>/), with nothing at the
//    server's root. The page and every file it loads (validate.mjs:
//    pageReferences), requested by the URL the browser would resolve, must
//    answer 200 with the content type it is loaded as: a module script as
//    JavaScript, a stylesheet as CSS, an image as an image.
// 4. In a browser (browser.mjs: a headless Chrome the machine already has):
//    the game inside a cross-origin <iframe allow="fullscreen"> on a taller
//    page of another site, as on itch.io. The intro must reach "Press to
//    start" with its logos; a click must give the frame the keyboard and
//    open the Home Screen; a click on Survival must start the game; keys
//    (arrows, Space, Page Down, End, W) must reach the game and never scroll
//    the page around it, nor must the mouse wheel; a click outside and back
//    on the world must give the keys back to the game. No console error, no
//    uncaught exception, no failed request, nothing requested outside the
//    nested path. With no browser on the machine, step 4 is skipped with a
//    warning, except in CI (the CI variable set), where it fails.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { ROOT, GAME, OUT_DIR, contentTypeOf } from './release.mjs';
import { listFiles, pageReferences, validateRelease } from './validate.mjs';
import { findBrowser, launch } from './browser.mjs';
import { compareWithPages } from './equivalence.mjs';

const BASE = '/html/16180339/';
const noBrowser = process.argv.includes('--no-browser');
const DIR = join(ROOT, OUT_DIR);

const problems = [];
const notes = [];
const fail = (message) => problems.push(message);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const started = Date.now();

// What each kind of file must be served as.
const SERVED_AS = {
  page: /^text\/html\b/,
  script: /^(?:text|application)\/(?:javascript|ecmascript)\b/,
  style: /^text\/css\b/,
  image: /^image\//,
  font: /^font\//,
  audio: /^audio\//,
  video: /^video\//,
  manifest: /^application\/(?:manifest\+)?json\b/,
};

// ---- The servers ---------------------------------------------------------------

function listen(server, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve(server.address().port));
  });
}

// dist/itch under BASE and nothing anywhere else, every request logged.
function gameServer(log) {
  return createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let status = 404;
    let body = 'Not found';
    let type = 'text/plain; charset=utf-8';
    if (req.method !== 'GET' && req.method !== 'HEAD') status = 405;
    else if (path.startsWith(BASE)) {
      const name = path.slice(BASE.length) || 'index.html';
      const file = normalize(join(DIR, name));
      if (file.startsWith(DIR + sep) && existsSync(file) && statSync(file).isFile()) {
        status = 200;
        body = readFileSync(file);
        type = contentTypeOf(name);
      }
    }
    log.push({ path, status, type });
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
}

// The page around the game, on another site: taller than the window, the
// game's frame at its top, like a game's page on itch.io.
function parentServer(frameUrl) {
  const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>${GAME} on a page of another site</title></head>
<body style="margin:0;height:3000px;background:#333">
<iframe id="game" src="${frameUrl}" width="960" height="540" allow="fullscreen" style="border:0;display:block"></iframe>
<p style="color:#ccc;font:14px sans-serif;margin:16px">The page around the game (verify.mjs).</p>
</body></html>`;
  return createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(page);
    } else {
      res.writeHead(204);
      res.end();
    }
  });
}

// ---- 3. Over HTTP --------------------------------------------------------------

async function checkHttp(origin) {
  const files = listFiles(DIR);
  const bytes = new Map(files.map((f) => [f, readFileSync(join(DIR, f))]));
  const { refs } = pageReferences(bytes);
  const page = new URL(BASE, origin);
  const wanted = [{ url: page.href, path: 'index.html', kind: 'page' }, { url: new URL('index.html', page).href, path: 'index.html', kind: 'page' }];
  // Each URL as the browser resolves it: against the file that names it, or
  // (a plain string in the script) against the page.
  for (const r of refs) wanted.push({ ...r, url: new URL(r.url, r.base === 'page' ? page : new URL(r.from, page)).href });
  let checked = 0;
  for (const w of wanted) {
    const res = await fetch(w.url);
    const body = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') ?? '';
    const where = `${w.url.slice(origin.length)}${w.from ? ` (named by ${w.from})` : ''}`;
    if (res.status !== 200) fail(`HTTP: ${where} answered ${res.status}`);
    else if (SERVED_AS[w.kind] && !SERVED_AS[w.kind].test(type)) fail(`HTTP: ${where} is served as ${type}, but loaded as a ${w.kind}`);
    else if (!body.equals(bytes.get(w.path))) fail(`HTTP: ${where} is not ${w.path}`);
    else checked++;
  }
  // Nothing at the server's root: a root-absolute URL would fail here, as on itch.io.
  const root = await fetch(new URL('/index.html', origin));
  if (root.status !== 404) fail(`HTTP: the server answers ${root.status} at /index.html; it should serve only under ${BASE}`);
  return { checked, files: files.length };
}

// ---- 4. In a browser -----------------------------------------------------------

const KEYS = {
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
  PageDown: { key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 },
  End: { key: 'End', code: 'End', windowsVirtualKeyCode: 35 },
  KeyW: { key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, text: 'w' },
};

async function checkBrowser(executable, frameUrl, parentUrl) {
  const { cdp, close, version } = await launch(executable, { width: 1280, height: 900 });
  const errors = [];
  const warnings = [];
  const steps = [];
  const step = (text) => steps.push(text);
  let page;
  let game = null;
  const describe = (args = []) => args.map((a) => a.value ?? a.description ?? a.type).join(' ');

  // Every console error, uncaught exception and failed load, in the page or the game's frame.
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => errors.push(`uncaught: ${d.exception?.description ?? d.text}`));
  cdp.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type === 'error' || type === 'assert') errors.push(`console.${type}: ${describe(args)}`);
    else if (type === 'warning') warnings.push(`console.warn: ${describe(args)}`);
  });
  cdp.on('Log.entryAdded', ({ entry }) => {
    const text = `${entry.source}: ${entry.text}${entry.url ? ` (${entry.url})` : ''}`;
    if (entry.level === 'error') errors.push(text);
    else if (entry.level === 'warning') warnings.push(text);
  });
  // The game's frame, held at its start until it is watched too.
  cdp.on('Target.attachedToTarget', async ({ sessionId, targetInfo }) => {
    try {
      if (targetInfo.type === 'iframe') {
        await cdp.send('Runtime.enable', {}, sessionId);
        await cdp.send('Log.enable', {}, sessionId);
        if (!game) game = sessionId;
      }
    } finally {
      cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
    }
  });

  const evaluate = async (sessionId, expression) => {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (exceptionDetails) throw new Error(`${expression}: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
    return result.value;
  };
  const until = async (what, seconds, test) => {
    const end = Date.now() + seconds * 1000;
    for (;;) {
      const value = await test().catch(() => false);
      if (value) return value;
      if (Date.now() > end) throw new Error(`${what}: not within ${seconds} s`);
      await sleep(150);
    }
  };
  const click = async (x, y) => {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }, page);
    }
  };
  const press = async (name) => {
    const k = KEYS[name];
    await cdp.send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...k }, page);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k, text: undefined }, page);
  };
  const frameBox = () => evaluate(page, `(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const scrolled = async () => { await sleep(700); return evaluate(page, 'Math.round(scrollY)'); };

  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    ({ sessionId: page } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
    await cdp.send('Runtime.enable', {}, page);
    await cdp.send('Log.enable', {}, page);
    await cdp.send('Page.enable', {}, page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, page);
    await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, page);
    await cdp.send('Page.navigate', { url: parentUrl }, page);
    await until('the game\'s frame', 20, async () => game);

    const framed = await evaluate(game, `(() => { try { void top.location.href; return 'same-origin'; } catch { return window.top !== window ? 'cross-origin' : 'top'; } })()`);
    if (framed !== 'cross-origin') throw new Error(`the game is not in a cross-origin frame (${framed})`);
    step(`${GAME} loads in a cross-origin <iframe> at ${frameUrl}`);

    // The intro: logos, loading bar, then "Press to start".
    await until('the loading bar', 30, () => evaluate(game, `!!document.querySelector('.splash-bar') || !!document.querySelector('#splash[role=button]') || !document.getElementById('fail').hidden`));
    const ready = await until('"Press to start"', 120, () => evaluate(game,
      `document.getElementById('fail').hidden ? (document.querySelector('#splash[role=button]') ? 'ready' : false) : 'no-webgl'`));
    if (ready === 'no-webgl') throw new Error('the game shows its no-WebGL note: this browser has no WebGL here');
    const logo = await evaluate(game, `(() => { const s = document.getElementById('splash'); const i = s.querySelector('.splash-game'); return s.classList.contains('no-logo') ? 'skipped' : i && i.complete && i.naturalWidth > 0 ? i.currentSrc : 'missing'; })()`);
    if (!logo.startsWith('http')) fail(`browser: the intro's ${GAME} logo did not load (${logo})`);
    step(`intro: logos and loading bar, then "Press to start" (logo from ${logo.replace(/^https?:\/\/[^/]+/, '')})`);

    // The press: focus moves into the frame, the Home Screen opens.
    const box = await frameBox();
    await click(box.x + box.w / 2, box.y + box.h / 2);
    if (!(await evaluate(game, 'document.hasFocus()'))) fail('browser: the press on "Press to start" did not give the game\'s frame the keyboard focus');
    await until('the Home Screen', 30, () => evaluate(game,
      `!document.getElementById('splash') && !document.getElementById('home').hidden && !document.getElementById('home').classList.contains('is-waiting') && document.querySelectorAll('#home .home-card').length === 3`));
    await until('the cards to settle', 10, () => evaluate(game, `[...document.querySelectorAll('#home .home-card')].every((c) => c.getAnimations().length === 0)`));
    step('"Press to start" pressed: the frame has the keyboard, the Home Screen shows its three cards');

    // Survival.
    const card = await evaluate(game, `(() => { const r = document.querySelector('.home-card--main').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await click(box.x + card.x, box.y + card.y);
    await until('the game', 60, () => evaluate(game, `document.getElementById('home').hidden && !document.querySelector('.home-veil')`));
    step('Survival picked: the game starts');

    // Keys reach the game and never scroll the page around it.
    await evaluate(game, `window.__verifyKeys = []; addEventListener('keydown', (e) => __verifyKeys.push(e.code + (e.defaultPrevented ? '' : ' (not cancelled)'))); true`);
    await evaluate(page, 'scrollTo(0, 0); true');
    const names = ['ArrowDown', 'ArrowRight', 'Space', 'PageDown', 'End', 'KeyW'];
    for (const name of names) await press(name);
    const after = await scrolled();
    if (after !== 0) fail(`browser: keys in the game scrolled the page around it to ${after}px`);
    const seen = await evaluate(game, '__verifyKeys');
    if (seen.join() !== names.join()) fail(`browser: the game saw the keys ${JSON.stringify(seen)}, not ${JSON.stringify(names)} each cancelled`);
    step(`keys reach the game and are cancelled there (${names.join(', ')}); the page stays at the top`);

    // The wheel zooms the game, never scrolls the page.
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x + box.w / 2, y: box.y + box.h / 2, deltaX: 0, deltaY: 400 }, page);
    const wheeled = await scrolled();
    if (wheeled !== 0) fail(`browser: the mouse wheel over the game scrolled the page to ${wheeled}px`);
    step('the mouse wheel over the game zooms it; the page stays at the top');

    // Focus away and back.
    await click(box.x + box.w / 2, box.y + box.h + 200);
    if (await evaluate(game, 'document.hasFocus()')) notes.push('a click on the page around the game left the focus in the frame');
    await click(box.x + box.w / 2, box.y + box.h / 2);
    if (!(await evaluate(game, 'document.hasFocus()'))) fail('browser: a click on the world did not give the keyboard back to the game');
    await evaluate(game, '__verifyKeys = []; true');
    await press('ArrowUp');
    if ((await evaluate(game, '__verifyKeys')).join() !== 'ArrowUp') fail('browser: after a click away and back, keys do not reach the game');
    if (await scrolled() !== 0) fail('browser: after a click away and back, a key scrolled the page');
    step('a click outside the game and back on the world gives the keyboard back');
    await sleep(500);
  } catch (err) {
    fail(`browser: ${err.message}`);
  } finally {
    await close();
  }
  for (const e of errors) fail(`browser console: ${e}`);
  return { version, steps, warnings };
}

// ---- The run -------------------------------------------------------------------

async function main() {
  console.log(`\n${GAME}: itch.io release, served and played`);
  console.log('─'.repeat(64));

  const { problems: invalid } = await validateRelease();
  if (invalid.length) {
    for (const p of invalid) console.error(`problem: ${p}`);
    console.log('─'.repeat(64));
    console.log('FAILED: the release is not valid; build it first (npm run build:itch).');
    process.exitCode = 1;
    return;
  }
  console.log('release         dist/itch/ and dist/mavooli-itch.zip valid (validate.mjs)');

  const same = await compareWithPages();
  for (const p of same.problems) fail(`equivalence: ${p}`);
  const { files, same: identical, rewritten, urls } = same.stats;
  if (!same.problems.length) {
    console.log(`GitHub Pages    the same game: ${identical} of ${files} files byte for byte, ${rewritten} differing only in ${urls} URLs (equivalence.mjs)`);
  }

  const log = [];
  const game = gameServer(log);
  const gamePort = await listen(game, '127.0.0.1');
  const gameOrigin = `http://127.0.0.1:${gamePort}`;
  const frameUrl = `${gameOrigin}${BASE}index.html`;
  const parent = parentServer(frameUrl);
  const parentPort = await listen(parent, 'localhost');
  const parentUrl = `http://localhost:${parentPort}/`;

  try {
    const http = await checkHttp(gameOrigin);
    console.log(`HTTP            ${http.checked} requests under ${BASE}: 200, each with its content type (${http.files} files)`);

    if (noBrowser) {
      notes.push('the browser check was skipped (--no-browser)');
    } else {
      const executable = findBrowser();
      if (!executable) {
        const message = 'no Chrome, Chromium or Edge found (set CHROME_PATH): the browser check was skipped';
        if (process.env.CI) fail(`${message}, and CI needs it`);
        else notes.push(message);
      } else {
        log.length = 0;
        const { version, steps, warnings } = await checkBrowser(executable, frameUrl, parentUrl);
        console.log(`browser         ${version}, headless, software WebGL; the game's page on another site:`);
        for (const s of steps) console.log(`                · ${s}`);
        const outside = log.filter((r) => !r.path.startsWith(BASE));
        const failed = log.filter((r) => r.status !== 200);
        for (const r of outside) fail(`browser: requested ${r.path}, outside ${BASE}`);
        for (const r of failed.filter((r) => r.path.startsWith(BASE))) fail(`browser: ${r.path} answered ${r.status}`);
        const loaded = new Set(log.filter((r) => r.status === 200).map((r) => r.path));
        console.log(`                · ${loaded.size} files loaded, all under ${BASE}`);
        if (warnings.length) notes.push(`${warnings.length} browser warning(s), not counted: ${[...new Set(warnings)].slice(0, 3).join(' | ')}`);
      }
    }
  } catch (err) {
    fail(err.message);
  } finally {
    game.close();
    parent.close();
  }

  for (const n of notes) console.warn(`note: ${n}`);
  for (const p of problems) console.error(`problem: ${p}`);
  console.log('─'.repeat(64));
  if (problems.length) {
    console.log(`FAILED: ${problems.length} problem(s).`);
    process.exitCode = 1;
  } else {
    console.log(`OK (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
