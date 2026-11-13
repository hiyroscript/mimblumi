// The itch.io build against the GitHub Pages build: the same game, with only
// its URLs written another way. Run by `npm run verify:itch` (verify.mjs),
// or on its own (`node tools/itch/equivalence.mjs`) after
// `npm run build:itch`.
//
// Alva re-bundles its modules for itch.io, so it plays the bundle against
// the source. Mavooli is always built by Vite, and both builds are one
// compile of the same code, with two modes (vite.config.ts): GitHub Pages'
// (base /moo/) and itch.io's (base ./). So the question here is whether the
// two builds differ in anything but their URLs, and that is answered byte
// for byte, with no browser:
//
// - Every file of one build has its counterpart in the other: the same
//   name, or the same name with another content hash (Vite names each
//   asset name-hash.ext; a script that names its images differently has
//   another hash).
// - A file under the same name in both is byte for byte the same (the
//   images, the icons, the stylesheet).
// - A file under another hash (the script, the page) is the same once each
//   URL is written one way: Pages' "/moo/assets/x-hash.png" and itch.io's
//   new URL("x-hash.png", import.meta.url).href in the script, or
//   href="/moo/assets/…" and href="./assets/…" in the page, become one
//   placeholder naming the file the URL resolves to, its hash left out.
//   Anything else that differs (code that branches on the mode, an
//   .env.itch, a plugin, a Vite upgrade that rewrites more than URLs) fails
//   the check, with where.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, OUT_DIR, PAGES_BASE, extensionOf } from './release.mjs';
import { listFiles } from './validate.mjs';

const TEXT = new Set(['html', 'css', 'js', 'mjs', 'json', 'webmanifest', 'svg', 'txt']);

// A file's name without Vite's content hash: assets/index-C47tRTA_.js is
// assets/index.js, assets/apple-touch-icon-D5GfYeQu.png is
// assets/apple-touch-icon.png.
export const unhashed = (path) => path.replace(/-[A-Za-z0-9_-]{8}(\.[A-Za-z0-9]+)$/, '$1');

const placeholder = (path) => `\u0000asset(${unhashed(path)})\u0000`;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PAGES = escape(PAGES_BASE);

// How each build writes a URL, by the kind of file it is in: the pattern,
// and the release path a match resolves to (`local` resolves a path
// relative to the file itself).
const URL_FORMS = {
  itch: {
    // The script: new URL("x", import.meta.url).href, relative to the script.
    js: [[/new\s+URL\(\s*(["'`])([^"'`$]+?)\1\s*,\s*import\.meta\.url\s*\)\.href/g, (m, local) => local(m[2])]],
    // The page: src="./x" and href="./x".
    html: [[/\b(src|href)="\.\/([^"]+)"/g, (m, local) => local(m[2]), (m, p) => `${m[1]}="${p}"`]],
    // The stylesheet: url(x), relative to the stylesheet.
    css: [[/url\(\s*(["']?)(?![a-z]+:|\/)([^"')]+)\1\s*\)/gi, (m, local) => local(m[2]), (m, p) => `url(${p})`]],
  },
  pages: {
    // Everywhere, from the site's root: "/moo/x" in the script,
    // src="/moo/x" in the page, url(/moo/x) in the stylesheet.
    js: [[new RegExp(`(["'\`])${PAGES}([^"'\`]+)\\1`, 'g'), (m) => m[2]]],
    html: [[new RegExp(`\\b(src|href)="${PAGES}([^"]+)"`, 'g'), (m) => m[2], (m, p) => `${m[1]}="${p}"`]],
    css: [[new RegExp(`url\\(\\s*(["']?)${PAGES}([^"')]+)\\1\\s*\\)`, 'gi'), (m) => m[2], (m, p) => `url(${p})`]],
  },
};
URL_FORMS.itch.mjs = URL_FORMS.itch.js;
URL_FORMS.pages.mjs = URL_FORMS.pages.js;

// The text of `file` with every URL in it written as one placeholder: the
// release path it resolves to, its hash left out. `build` ('itch' or
// 'pages') says how that build writes its URLs; `count` is how many were
// rewritten. Only the forms for the file's own kind are rewritten.
export function normalize(text, file, build) {
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
  const local = (url) => posix.normalize(posix.join(dir, url));
  let count = 0;
  let out = text;
  for (const [pattern, resolve, wrap = (m, p) => p] of URL_FORMS[build][extensionOf(file)] ?? []) {
    out = out.replace(pattern, (...m) => {
      count++;
      return wrap(m, placeholder(resolve(m, local)));
    });
  }
  return { text: out, count };
}

// Where two texts first differ, with a little of each around it.
function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const show = (s) => JSON.stringify(s.slice(Math.max(0, i - 40), i + 60).replaceAll('\u0000', '¦'));
  return `at character ${i}: itch.io has ${show(a)}, GitHub Pages has ${show(b)}`;
}

// The itch.io build in `itchDir` against the GitHub Pages build in
// `pagesDir`: { problems, stats }.
export function compareBuilds(itchDir, pagesDir) {
  const problems = [];
  const itch = listFiles(itchDir);
  const pages = listFiles(pagesDir);
  const pagesByKey = new Map();
  for (const f of pages) {
    const key = unhashed(f);
    if (pagesByKey.has(key)) problems.push(`GitHub Pages build: ${f} and ${pagesByKey.get(key)} are the same file under two hashes`);
    pagesByKey.set(key, f);
  }
  const paired = new Set();
  let same = 0;
  let rewritten = 0;
  let urls = 0;
  for (const f of itch) {
    const other = pages.includes(f) ? f : pagesByKey.get(unhashed(f));
    if (!other) {
      problems.push(`${f} is in the itch.io build only`);
      continue;
    }
    if (paired.has(other)) {
      problems.push(`${f}: its GitHub Pages counterpart ${other} is already paired with another file`);
      continue;
    }
    paired.add(other);
    const a = readFileSync(join(itchDir, f));
    const b = readFileSync(join(pagesDir, other));
    if (a.equals(b)) {
      same++;
      continue;
    }
    if (!TEXT.has(extensionOf(f))) {
      problems.push(`${f} differs from GitHub Pages' ${other}, and it is not a text file whose URLs could explain it`);
      continue;
    }
    const x = normalize(a.toString('utf8'), f, 'itch');
    const y = normalize(b.toString('utf8'), other, 'pages');
    if (x.text !== y.text) {
      problems.push(`${f} differs from GitHub Pages' ${other} in more than its URLs, ${firstDifference(x.text, y.text)}`);
      continue;
    }
    if (x.count !== y.count) problems.push(`${f}: ${x.count} URLs in the itch.io build, ${y.count} in GitHub Pages'`);
    rewritten++;
    urls += x.count;
  }
  for (const f of pages) if (!paired.has(f)) problems.push(`${f} is in the GitHub Pages build only`);
  return { problems, stats: { files: itch.length, same, rewritten, urls } };
}

// The GitHub Pages build of the repository as it is, made in a folder of
// its own (dist/ is never touched), compared with the itch.io build in
// `itchDir`.
export async function compareWithPages(itchDir = join(ROOT, OUT_DIR)) {
  const { build } = await import('vite');
  const pagesDir = mkdtempSync(join(tmpdir(), 'mavooli-pages-'));
  try {
    await build({ root: ROOT, mode: 'production', logLevel: 'silent', build: { outDir: pagesDir, emptyOutDir: true } });
    return compareBuilds(itchDir, pagesDir);
  } finally {
    rmSync(pagesDir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { problems, stats } = await compareWithPages();
  for (const p of problems) console.error(`problem: ${p}`);
  console.log(`${stats.files} files: ${stats.same} byte for byte the same, ${stats.rewritten} the same but for ${stats.urls} URLs`);
  console.log(problems.length
    ? `The itch.io build is NOT the GitHub Pages build (${problems.length} problem(s)).`
    : 'The itch.io build is the GitHub Pages build, with only its URLs written for itch.io.');
  process.exitCode = problems.length ? 1 : 0;
}
