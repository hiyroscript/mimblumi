// Validates the itch.io release (dist/itch) and its archive
// (dist/mavooli-itch.zip) before either counts as done: run by the build, or
// on its own (`node tools/itch/validate.mjs`) to check an existing release.
//
// It checks the platform's limits (files, total and per-file size, path
// length, names), that nothing development-only was packaged (sources,
// tools, tests, docs, source maps, npm, Git), that the page loads everything
// it needs from the release itself under its exact, case-sensitive name and
// by a relative URL (never /moo/, never root-absolute), that every file of
// the release is something the page loads, that nothing is loaded from
// another host (hosts.mjs), and that the archive extracts to exactly the
// folder, with index.html at its root.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { isAbsolute, join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, OUT_DIR, ZIP_PATH, LIMITS, PAGES_BASE, isDevelopmentOnly, extensionOf } from './release.mjs';
import { hostProblems } from './hosts.mjs';
import { readZip } from './zip.mjs';

// Every file under `dir`, as relative paths with their names' real case.
export function listFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = `${prefix}${e.name}`;
    return e.isDirectory() ? listFiles(`${dir}/${e.name}`, `${path}/`) : [path];
  }).sort();
}

const SAFE_PATH = /^[A-Za-z0-9._\-/]+$/;
const TEXT = new Set(['html', 'css', 'js', 'mjs', 'json', 'webmanifest', 'svg', 'txt']);
const ASSET_EXT = 'png|jpe?g|gif|webp|avif|svg|ico|bmp|ogg|mp3|wav|m4a|flac|mp4|webm|json|webmanifest|css|js|mjs|wasm|glb|gltf|bin|ktx2|hdr|ttf|otf|woff2?|html|txt';

// What a file is loaded as, from its extension: what verify.mjs holds its
// content type to.
const KIND_BY_EXT = {
  js: 'script', mjs: 'script', css: 'style', html: 'page',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image', svg: 'image', ico: 'image', bmp: 'image',
  woff: 'font', woff2: 'font', ttf: 'font', otf: 'font',
  ogg: 'audio', mp3: 'audio', wav: 'audio', m4a: 'audio', flac: 'audio',
  mp4: 'video', webm: 'video', webmanifest: 'manifest',
};
export const kindOf = (path) => KIND_BY_EXT[extensionOf(path)] ?? 'other';

// ---- What each kind of file names --------------------------------------------
// Each reference: { url, kind, base }, base 'file' (relative to the file that
// names it) or 'page' (relative to the page: what an <img>.src set from a
// script resolves against).

const TAG = /<(script|link|img|source|audio|video|iframe|embed|object)\b([^>]*)>/gi;
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function attributes(text) {
  const attrs = {};
  for (const m of text.matchAll(ATTR)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return attrs;
}

function linkKind(attrs) {
  const rel = (attrs.rel ?? '').toLowerCase().split(/\s+/);
  if (rel.includes('stylesheet')) return 'style';
  if (rel.includes('modulepreload')) return 'script';
  if (rel.includes('manifest')) return 'manifest';
  if (rel.includes('icon') || rel.includes('apple-touch-icon')) return 'image';
  if (rel.includes('preload') || rel.includes('prefetch')) {
    return { image: 'image', script: 'script', style: 'style', font: 'font', audio: 'audio', video: 'video' }[attrs.as] ?? 'other';
  }
  return 'other';
}

// The page's src, href and srcset URLs, with what each is loaded as.
export function htmlReferences(html) {
  const refs = [];
  for (const [, tag, rest] of html.matchAll(TAG)) {
    const attrs = attributes(rest);
    const name = tag.toLowerCase();
    const kind = name === 'script' ? 'script' : name === 'link' ? linkKind(attrs)
      : name === 'img' ? 'image' : name === 'iframe' ? 'page' : 'other';
    for (const key of ['src', 'href']) {
      if (attrs[key] !== undefined) refs.push({ url: attrs[key], kind: kind === 'other' ? kindOf(attrs[key]) : kind, base: 'file', module: name === 'script' && attrs.type === 'module' });
    }
    for (const key of ['srcset', 'imagesrcset']) {
      for (const part of (attrs[key] ?? '').split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (url) refs.push({ url, kind: 'image', base: 'file' });
      }
    }
  }
  return refs;
}

// The stylesheet's url() and @import URLs.
export function cssReferences(css) {
  const refs = [];
  for (const m of css.matchAll(/url\(\s*(["']?)([^"')]+?)\1\s*\)/gi)) refs.push({ url: m[2], kind: kindOf(m[2]), base: 'file' });
  for (const m of css.matchAll(/@import\s+(["'])([^"']+)\1/gi)) refs.push({ url: m[2], kind: 'style', base: 'file' });
  return refs;
}

const NEW_URL = /new\s+URL\(\s*(["'`])([^"'`$]+?)\1\s*,\s*import\.meta\.url\s*\)/g;
const IMPORT = /\bimport\s*\(\s*(["'`])([^"'`$]+?)\1\s*\)|\b(?:from|import)\s*(["'`])((?:\.{1,2}\/|\/)[^"'`$]+?)\3/g;
const LITERAL = new RegExp(`(["'\`])((?:\\.{0,2}/)*[A-Za-z0-9_\\-.][A-Za-z0-9_\\-./]*\\.(?:${ASSET_EXT}))\\1`, 'gi');

// The script's URLs: what Vite writes as new URL('x', import.meta.url) and
// the modules it imports, both relative to the script itself, and any other
// string naming a file by its extension, relative to the page.
export function jsReferences(js) {
  const refs = [];
  let rest = js;
  const blank = (m) => ' '.repeat(m.length);
  for (const m of js.matchAll(NEW_URL)) refs.push({ url: m[2], kind: kindOf(m[2]), base: 'file' });
  rest = rest.replace(NEW_URL, blank);
  for (const m of rest.matchAll(IMPORT)) refs.push({ url: m[2] ?? m[4], kind: 'script', base: 'file' });
  rest = rest.replace(IMPORT, blank);
  for (const m of rest.matchAll(LITERAL)) refs.push({ url: m[2], kind: kindOf(m[2]), base: 'page' });
  return refs;
}

// Where `url`, named by `from` (a path in the release), points in the
// release: { path } or { problem }, or {} for nothing to load (data:, #).
export function resolveReference(url, from, base) {
  const u = url.trim();
  if (!u || u.startsWith('#') || /^data:/i.test(u)) return {};
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return { problem: `loads ${u} from another host` };
  if (u.startsWith('/')) {
    return { problem: `${u} is root-absolute${u.startsWith(PAGES_BASE) ? ` (GitHub Pages' ${PAGES_BASE}: a Pages build, not the itch.io one)` : ''}: every URL must be relative` };
  }
  let clean = u.replace(/[?#].*$/, '');
  try {
    clean = decodeURI(clean);
  } catch {
    return { problem: `${u} is not a valid URL` };
  }
  const dir = base === 'page' || !from.includes('/') ? '' : from.slice(0, from.lastIndexOf('/'));
  const path = posix.normalize(posix.join(dir, clean));
  if (path === '..' || path.startsWith('../')) return { problem: `${u} points outside the release` };
  return { path };
}

// Everything the page loads, from index.html through its stylesheets and
// scripts: { refs: [{ from, url, path, kind, base, module }], reached: Set
// of paths, problems }. `bytes`: path -> Buffer, every file of the release.
export function pageReferences(bytes) {
  const refs = [];
  const problems = [];
  const reached = new Set(['index.html']);
  const queue = ['index.html'];
  const lower = new Map([...bytes.keys()].map((f) => [f.toLowerCase(), f]));
  while (queue.length) {
    const file = queue.shift();
    const text = bytes.get(file).toString('utf8');
    const ext = extensionOf(file);
    const found = ext === 'html' ? htmlReferences(text) : ext === 'css' ? cssReferences(text) : ext === 'js' || ext === 'mjs' ? jsReferences(text) : [];
    for (const ref of found) {
      const { path, problem } = resolveReference(ref.url, file, ref.base);
      if (problem) {
        problems.push(`${file}: ${problem}`);
        continue;
      }
      if (!path) continue;
      if (!bytes.has(path)) {
        const other = lower.get(path.toLowerCase());
        problems.push(other
          ? `${file} names ${ref.url}, but the release has ${other}: names are case-sensitive on itch.io`
          : `${file} names ${ref.url}, which is not in the release`);
        continue;
      }
      refs.push({ from: file, url: ref.url, path, kind: ref.kind, base: ref.base, module: !!ref.module });
      if (!reached.has(path)) {
        reached.add(path);
        if (['html', 'css', 'js', 'mjs'].includes(extensionOf(path))) queue.push(path);
      }
    }
  }
  return { refs, reached, problems };
}

const sameBytes = (a, b) => a.length === b.length && a.equals(b);
const fromRoot = (p) => (isAbsolute(p) ? p : join(ROOT, p));

export async function validateRelease({ dir = OUT_DIR, zip = ZIP_PATH, checkZip = true } = {}) {
  const problems = [];
  const warnings = [];
  const fail = (message) => problems.push(message);
  const base = fromRoot(dir);
  if (!existsSync(`${base}/index.html`)) {
    fail(`${dir}/index.html is missing: build the release first (npm run build:itch)`);
    return { problems, warnings, stats: null };
  }
  const files = listFiles(base);
  const fileSet = new Set(files);
  const bytes = new Map(files.map((f) => [f, readFileSync(`${base}/${f}`)]));

  // The platform's limits, with a margin below the file count.
  const totalBytes = [...bytes.values()].reduce((n, b) => n + b.length, 0);
  if (files.length >= LIMITS.files) fail(`${files.length} files: itch.io accepts fewer than ${LIMITS.files}`);
  else if (files.length > LIMITS.comfortableFiles) warnings.push(`${files.length} files: above the ${LIMITS.comfortableFiles} margin`);
  if (totalBytes > LIMITS.totalBytes) fail(`${totalBytes} bytes in all: over ${LIMITS.totalBytes}`);
  const lower = new Map();
  for (const f of files) {
    if (bytes.get(f).length > LIMITS.fileBytes) fail(`${f}: over ${LIMITS.fileBytes} bytes`);
    if (f.length > LIMITS.pathLength) fail(`${f}: path longer than ${LIMITS.pathLength} characters`);
    if (!SAFE_PATH.test(f)) fail(`${f}: a character outside A-Z a-z 0-9 . _ - /`);
    const key = f.toLowerCase();
    if (lower.has(key)) fail(`${f} and ${lower.get(key)} differ only in case`);
    lower.set(key, f);
    if (isDevelopmentOnly(f)) fail(`${f}: development-only, never part of the release`);
  }

  // The page and everything it loads: each by a relative URL, each a file of
  // the release under its exact name; and nothing in the release that the
  // page does not load.
  const { refs, reached, problems: refProblems } = pageReferences(bytes);
  for (const p of refProblems) fail(p);
  const html = bytes.get('index.html').toString('utf8');
  const scripts = refs.filter((r) => r.from === 'index.html' && r.kind === 'script');
  if (!scripts.some((r) => r.module && extensionOf(r.path) === 'js')) fail('index.html loads no module script (<script type="module" src="./…js">)');
  if (!/^<!doctype html>/i.test(html.trimStart())) fail('index.html does not start with <!doctype html> (quirks mode)');
  for (const f of files) if (!reached.has(f)) fail(`${f}: nothing in the page loads it (remove it, or load it from the page)`);

  // Text files: no Pages path, no source map, no other host.
  for (const f of files.filter((p) => TEXT.has(extensionOf(p)))) {
    const text = bytes.get(f).toString('utf8');
    if (text.includes(`"${PAGES_BASE}`) || text.includes(`'${PAGES_BASE}`) || text.includes(`\`${PAGES_BASE}`)) {
      fail(`${f} names GitHub Pages' ${PAGES_BASE} path: this is a Pages build, not the itch.io one (vite build --mode itch)`);
    }
    if (/[#@]\s*sourceMappingURL=/.test(text)) fail(`${f} points to a source map`);
    for (const problem of hostProblems(text, f)) fail(problem);
  }

  // The archive: exactly the folder, index.html at its root.
  let zipBytes = 0;
  if (checkZip) {
    const zipFile = fromRoot(zip);
    if (!existsSync(zipFile)) fail(`${zip} is missing`);
    else {
      zipBytes = statSync(zipFile).size;
      try {
        const entries = readZip(readFileSync(zipFile));
        const names = entries.map((e) => e.name);
        if (!names.includes('index.html')) fail(`${zip}: no index.html at its root`);
        if (new Set(names).size !== names.length) fail(`${zip}: duplicate entries`);
        for (const e of entries) {
          if (e.name.startsWith('/') || e.name.includes('\\') || /^[A-Za-z]:/.test(e.name) || e.name.split('/').includes('..')) fail(`${zip}: unsafe entry ${e.name}`);
          else if (e.name.endsWith('/')) fail(`${zip}: directory entry ${e.name}`);
          else if (!fileSet.has(e.name)) fail(`${zip}: ${e.name} is not in ${dir}`);
          else if (!sameBytes(e.data, bytes.get(e.name))) fail(`${zip}: ${e.name} differs from ${dir}`);
        }
        const inZip = new Set(names);
        for (const f of files) if (!inZip.has(f)) fail(`${zip}: ${f} is missing`);
      } catch (err) {
        fail(`${zip}: ${err.message}`);
      }
    }
  }

  const stats = {
    files: files.length,
    sizes: files.map((f) => ({ path: f, bytes: bytes.get(f).length })),
    totalBytes,
    zipBytes,
    largest: files.reduce((a, f) => (bytes.get(f).length > bytes.get(a).length ? f : a), files[0]),
    longestPath: files.reduce((a, f) => (f.length > a.length ? f : a), files[0]),
    references: refs.length,
  };
  return { problems, warnings, stats };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { problems, warnings, stats } = await validateRelease();
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const p of problems) console.error(`problem: ${p}`);
  if (stats) console.log(`${stats.files} files, ${stats.totalBytes} bytes; archive ${stats.zipBytes} bytes`);
  console.log(problems.length ? `The release is NOT valid (${problems.length} problem(s)).` : 'The release is valid.');
  process.exitCode = problems.length ? 1 : 0;
}
