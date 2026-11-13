// Run with node --test (no dependencies). The itch.io release's validation
// (tools/itch/validate.mjs), on small releases made here in the shape Vite
// gives the real one: a good one passes, and each kind of mistake planted in
// it fails with a message that names it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { cssReferences, htmlReferences, jsReferences, resolveReference, validateRelease } from '../../tools/itch/validate.mjs';
import { writeZip } from '../../tools/itch/zip.mjs';

const PAGE = `<!doctype html>
<html class="intro">
<head>
<meta charset="utf-8">
<title>Mavooli</title>
<link rel="icon" href="./assets/favicon-A1.ico" sizes="16x16 32x32 48x48">
<link rel="preload" as="image" href="./assets/logo-B2.png">
  <script type="module" crossorigin src="./assets/index-C3.js"></script>
  <link rel="stylesheet" crossorigin href="./assets/index-D4.css">
</head>
<body><div id="stage"></div></body>
</html>
`;
const GOOD = {
  'index.html': PAGE,
  'assets/index-C3.js': 'var a=new URL(`logo-B2.png`,import.meta.url).href;document.createElementNS(`http://www.w3.org/2000/svg`,`svg`);\n',
  'assets/index-D4.css': 'body{background:url(./bg-E5.png)}\n',
  'assets/favicon-A1.ico': Buffer.from([0, 0, 1, 0]),
  'assets/logo-B2.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  'assets/bg-E5.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]),
};

// A release in a folder of its own, with its archive beside it (made from
// `zipFiles`, the folder's files unless given), validated.
async function check(files, { zipFiles, checkZip = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'mavooli-validate-'));
  try {
    const dir = join(root, 'itch');
    for (const [name, data] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), data);
    }
    const entries = Object.entries(zipFiles ?? files).sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, data]) => ({ name, data: Buffer.from(data) }));
    const zip = join(root, 'mavooli-itch.zip');
    writeFileSync(zip, writeZip(entries));
    return await validateRelease({ dir, zip, checkZip });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const planted = (changes) => Object.fromEntries(Object.entries({ ...GOOD, ...changes }).filter(([, v]) => v !== null));
const fails = async (files, pattern, options) => {
  const { problems } = await check(files, options);
  assert.ok(problems.some((p) => pattern.test(p)), `expected a problem matching ${pattern}, got:\n${problems.join('\n') || '(none)'}`);
  return problems;
};

test('a good release, and its archive, pass', async () => {
  const { problems, warnings, stats } = await check(GOOD);
  assert.deepEqual(problems, []);
  assert.deepEqual(warnings, []);
  assert.equal(stats.files, 6);
  assert.equal(stats.references, 6, 'icon, preload, script, stylesheet, the logo from the script, the background from the stylesheet');
});

test('the references are read where Vite writes them, each against the right base', () => {
  assert.deepEqual(htmlReferences(PAGE).map((r) => [r.url, r.kind]), [
    ['./assets/favicon-A1.ico', 'image'], ['./assets/logo-B2.png', 'image'], ['./assets/index-C3.js', 'script'], ['./assets/index-D4.css', 'style'],
  ]);
  assert.equal(htmlReferences(PAGE)[2].module, true);
  assert.deepEqual(cssReferences('a{b:url("x.png")}@import "y.css";').map((r) => r.url), ['x.png', 'y.css']);
  assert.deepEqual(jsReferences('new URL(`a.png`,import.meta.url);import("./b.js");x="c/d.json"').map((r) => [r.url, r.base]),
    [['a.png', 'file'], ['./b.js', 'file'], ['c/d.json', 'page']]);
  assert.deepEqual(resolveReference('logo.png', 'assets/index.js', 'file'), { path: 'assets/logo.png' });
  assert.deepEqual(resolveReference('logo.png', 'assets/index.js', 'page'), { path: 'logo.png' });
  assert.deepEqual(resolveReference('data:image/png;base64,AA', 'index.html', 'file'), {});
});

// ---- Planted mistakes ------------------------------------------------------------

test('a root-absolute URL in the page fails', async () => {
  await fails(planted({ 'index.html': PAGE.replace('./assets/logo-B2.png', '/foo.png') }), /index\.html: \/foo\.png is root-absolute/);
});

test('a GitHub Pages build (/moo/) fails, naming the mode to use', async () => {
  const problems = await fails(planted({ 'index.html': PAGE.replaceAll('./assets/', '/moo/assets/') }), /GitHub Pages' \/moo\//);
  assert.ok(problems.some((p) => /root-absolute/.test(p)));
  await fails(planted({ 'assets/index-C3.js': 'var a="/moo/assets/logo-B2.png";' }), /a Pages build, not the itch\.io one/);
});

test('a source map fails, as development-only and as a pointer from the script', async () => {
  const problems = await fails(planted({
    'assets/index-C3.js': `${GOOD['assets/index-C3.js']}//# sourceMappingURL=index-C3.js.map\n`,
    'assets/index-C3.js.map': '{"version":3}',
  }), /assets\/index-C3\.js\.map: development-only/);
  assert.ok(problems.some((p) => /points to a source map/.test(p)));
});

test('a script, a style, an image or a socket from another host fails', async () => {
  await fails(planted({ 'index.html': PAGE.replace('</head>', '<script src="https://cdn.example.com/x.js"></script>\n</head>') }), /loads https:\/\/cdn\.example\.com\/x\.js from another host/);
  await fails(planted({ 'index.html': PAGE.replace('</head>', '<script src="//cdn.example.com/x.js"></script>\n</head>') }), /from another host/);
  await fails(planted({ 'assets/index-D4.css': '@import url(https://fonts.example.com/f.css);' }), /another host/);
  await fails(planted({ 'assets/index-C3.js': `${GOOD['assets/index-C3.js']}new WebSocket("wss://rooms.example.com");` }), /wss:\/\/rooms\.example\.com is another host/);
});

test('a missing file, or one named in another case, fails', async () => {
  await fails(planted({ 'assets/bg-E5.png': null }), /index-D4\.css names \.\/bg-E5\.png, which is not in the release/);
  await fails(planted({ 'assets/index-C3.js': 'var a=new URL(`Logo-B2.png`,import.meta.url).href;' }), /but the release has assets\/logo-B2\.png: names are case-sensitive/);
  await fails(planted({ 'assets/index-C3.js': 'img.src="./levels/one.json";' }), /names \.\/levels\/one\.json, which is not in the release/);
});

test('a URL that leaves the release fails', async () => {
  await fails(planted({ 'assets/index-D4.css': 'a{b:url(../../secret.png)}' }), /points outside the release/);
});

test('a file nothing loads fails', async () => {
  await fails(planted({ 'assets/unused-F6.png': Buffer.from([1]) }), /assets\/unused-F6\.png: nothing in the page loads it/);
});

test('development-only files fail wherever they are', async () => {
  for (const name of ['src/main.ts', 'package.json', 'max', 'README.md', '.DS_Store', 'tools/itch/build.mjs', 'docs/itch-release.md', 'assets/.gitkeep', 'node_modules/three/package.json']) {
    await fails(planted({ [name]: 'x' }), new RegExp(`${name.replace(/[.]/g, '\\.')}: development-only`));
  }
});

test('a page with no module script, or in quirks mode, fails', async () => {
  await fails(planted({ 'index.html': PAGE.replace(' type="module"', '') }), /loads no module script/);
  await fails(planted({ 'index.html': PAGE.replace('<!doctype html>\n', '') }), /<!doctype html>/);
});

test('itch.io\'s limits: names, path length, case, file count', async () => {
  await fails(planted({ 'assets/a b.png': 'x' }), /a character outside/);
  await fails(planted({ [`assets/${'x'.repeat(240)}.png`]: 'x' }), /path longer than 240 characters/);
  await fails(planted({ 'assets/LOGO-B2.png': 'x' }), /differ only in case/);
  const many = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`assets/f${i}.png`, 'x']));
  await fails(planted(many), /1006 files: itch\.io accepts fewer than 1000/, { checkZip: false });
});

test('the archive must be exactly the folder, index.html at its root', async () => {
  await fails(GOOD, /mavooli-itch\.zip: assets\/bg-E5\.png differs from/, { zipFiles: { ...GOOD, 'assets/bg-E5.png': 'other' } });
  await fails(GOOD, /mavooli-itch\.zip: assets\/bg-E5\.png is missing/, { zipFiles: planted({ 'assets/bg-E5.png': null }) });
  await fails(GOOD, /mavooli-itch\.zip: extra\.txt is not in/, { zipFiles: { ...GOOD, 'extra.txt': 'x' } });
  await fails(GOOD, /no index\.html at its root/, { zipFiles: Object.fromEntries(Object.entries(GOOD).map(([k, v]) => [`mavooli/${k}`, v])) });
  await fails(GOOD, /unsafe entry \.\.\/evil\.js/, { zipFiles: { ...GOOD, '../evil.js': 'x' } });
});

test('a release that was never built says so', async () => {
  const { problems } = await validateRelease({ dir: join(tmpdir(), 'mavooli-no-such-release'), checkZip: false });
  assert.match(problems[0], /index\.html is missing: build the release first/);
});
