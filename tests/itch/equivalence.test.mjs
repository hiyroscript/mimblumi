// Run with node --test (after npm ci: the last test runs Vite). The itch.io
// build against the GitHub Pages build (tools/itch/equivalence.mjs): two
// builds that differ only in how they write their URLs pass, and anything
// else that differs fails, saying where.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { build } from 'vite';
import { ROOT, VITE_MODE } from '../../tools/itch/release.mjs';
import { compareBuilds, normalize, unhashed } from '../../tools/itch/equivalence.mjs';

// The two builds of a small game, in the shapes Vite gives them: the same
// images and stylesheet under the same names, the script and page under
// other hashes, their URLs written each build's way.
const PAGE = (base, js) => `<!doctype html>
<html><head>
<link rel="icon" href="${base}assets/favicon-A1b2C3d4.ico">
<link rel="preload" as="image" href="${base}assets/logo-B2c3D4e5.png">
  <script type="module" crossorigin src="${base}assets/index-${js}.js"></script>
  <link rel="stylesheet" crossorigin href="${base}assets/index-D4e5F6g7.css">
</head><body></body></html>
`;
const CODE = (logo) => `var a=${logo},b=document.createElementNS(\`http://www.w3.org/2000/svg\`,\`svg\`);class C{static getDataURL(e){return e}}\n`;
const ITCH = {
  'index.html': PAGE('./', 'Itch1234'),
  'assets/index-Itch1234.js': CODE('new URL(`logo-B2c3D4e5.png`,import.meta.url).href'),
  'assets/index-D4e5F6g7.css': 'body{margin:0}\n',
  'assets/favicon-A1b2C3d4.ico': Buffer.from([0, 0, 1, 0]),
  'assets/logo-B2c3D4e5.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
};
const PAGES = {
  'index.html': PAGE('/moo/', 'Page5678'),
  'assets/index-Page5678.js': CODE('`/moo/assets/logo-B2c3D4e5.png`'),
  'assets/index-D4e5F6g7.css': ITCH['assets/index-D4e5F6g7.css'],
  'assets/favicon-A1b2C3d4.ico': ITCH['assets/favicon-A1b2C3d4.ico'],
  'assets/logo-B2c3D4e5.png': ITCH['assets/logo-B2c3D4e5.png'],
};

function write(dir, files) {
  for (const [name, data] of Object.entries(files)) {
    if (data === null) continue;
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), data);
  }
}
function compare(itch, pages) {
  const root = mkdtempSync(join(tmpdir(), 'mavooli-equivalence-'));
  try {
    write(join(root, 'itch'), itch);
    write(join(root, 'pages'), pages);
    return compareBuilds(join(root, 'itch'), join(root, 'pages'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const fails = (itch, pages, pattern) => {
  const { problems } = compare(itch, pages);
  assert.ok(problems.some((p) => pattern.test(p)), `expected a problem matching ${pattern}, got:\n${problems.join('\n') || '(none)'}`);
};

test('a file\'s name without its content hash', () => {
  assert.equal(unhashed('assets/index-C47tRTA_.js'), 'assets/index.js');
  assert.equal(unhashed('assets/apple-touch-icon-D5GfYeQu.png'), 'assets/apple-touch-icon.png');
  assert.equal(unhashed('assets/index-1dZkV-0l.js'), 'assets/index.js');
  assert.equal(unhashed('index.html'), 'index.html');
});

test('each build\'s URLs become the same placeholder, and nothing else is touched', () => {
  const itch = normalize(ITCH['assets/index-Itch1234.js'], 'assets/index-Itch1234.js', 'itch');
  const pages = normalize(PAGES['assets/index-Page5678.js'], 'assets/index-Page5678.js', 'pages');
  assert.equal(itch.text, pages.text);
  assert.equal(itch.count, 1);
  assert.match(itch.text, /getDataURL\(e\)/, 'a function named like url() in the script is left alone');
  const page = normalize(ITCH['index.html'], 'index.html', 'itch');
  assert.equal(page.text, normalize(PAGES['index.html'], 'index.html', 'pages').text);
  assert.equal(page.count, 4);
  assert.equal(normalize('a{b:url(./bg-E5f6G7h8.png)}', 'assets/x.css', 'itch').text, normalize('a{b:url(/moo/assets/bg-E5f6G7h8.png)}', 'assets/x.css', 'pages').text);
});

test('two builds that differ only in their URLs are the same game', () => {
  const { problems, stats } = compare(ITCH, PAGES);
  assert.deepEqual(problems, []);
  assert.deepEqual(stats, { files: 5, same: 3, rewritten: 2, urls: 5 });
});

// ---- Planted differences ---------------------------------------------------------

test('code only in one build fails, saying where', () => {
  fails({ ...ITCH, 'assets/index-Itch1234.js': `${ITCH['assets/index-Itch1234.js']}console.info("itch only");` }, PAGES,
    /assets\/index-Itch1234\.js differs from GitHub Pages' assets\/index-Page5678\.js in more than its URLs, at character \d+: itch\.io has ".*itch only/);
});

test('a URL written another way than Vite writes it fails', () => {
  fails({ ...ITCH, 'assets/index-Itch1234.js': CODE('new URL(`logo-B2c3D4e5.png`,import.meta.url)') }, PAGES, /in more than its URLs/);
  fails({ ...ITCH, 'assets/index-Itch1234.js': CODE('new URL(`other-B2c3D4e5.png`,import.meta.url).href') }, PAGES, /in more than its URLs/);
});

test('an image, an icon or a stylesheet that differs fails', () => {
  fails({ ...ITCH, 'assets/logo-B2c3D4e5.png': Buffer.from([1, 2, 3]) }, PAGES, /assets\/logo-B2c3D4e5\.png differs from GitHub Pages'.*not a text file/);
  fails({ ...ITCH, 'assets/index-D4e5F6g7.css': 'body{margin:1px}\n' }, PAGES, /index-D4e5F6g7\.css differs from GitHub Pages'/);
});

test('a file in one build only fails', () => {
  fails({ ...ITCH, 'assets/extra-X1y2Z3w4.png': 'x' }, PAGES, /assets\/extra-X1y2Z3w4\.png is in the itch\.io build only/);
  fails(ITCH, { ...PAGES, 'robots.txt': 'x' }, /robots\.txt is in the GitHub Pages build only/);
  fails({ ...ITCH, 'assets/favicon-A1b2C3d4.ico': null }, PAGES, /favicon-A1b2C3d4\.ico is in the GitHub Pages build only/);
});

// ---- The real builds ---------------------------------------------------------------

test('the real itch.io build is the real GitHub Pages build, but for its URLs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mavooli-builds-'));
  try {
    for (const [mode, dir] of [[VITE_MODE, 'itch'], ['production', 'pages']]) {
      await build({ root: ROOT, mode, logLevel: 'silent', build: { outDir: join(root, dir), emptyOutDir: true } });
    }
    const { problems, stats } = compareBuilds(join(root, 'itch'), join(root, 'pages'));
    assert.deepEqual(problems, []);
    assert.ok(stats.same >= 5, 'the images, the icons and the stylesheet byte for byte');
    assert.equal(stats.rewritten, 2, 'the script and the page');
    assert.ok(stats.urls >= 8, 'the page\'s six URLs and the script\'s two images');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
