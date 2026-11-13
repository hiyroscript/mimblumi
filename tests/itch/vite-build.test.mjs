// Run with node --test (after npm ci: it runs Vite). The two builds of the
// game (vite.config.ts): GitHub Pages' keeps every URL under /moo/ in dist/,
// the itch.io mode makes every URL relative in dist/itch/. Each is built
// here into a folder of its own, so dist/ is never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, resolveConfig } from 'vite';
import { ROOT, OUT_DIR, VITE_MODE } from '../../tools/itch/release.mjs';
import { htmlReferences, validateRelease } from '../../tools/itch/validate.mjs';

async function buildInto(mode) {
  const outDir = mkdtempSync(join(tmpdir(), `mavooli-${mode}-`));
  await build({ root: ROOT, mode, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  return outDir;
}

test('the config: /moo/ into dist/ by default, ./ into dist/itch/ in the itch mode', async () => {
  const pages = await resolveConfig({ root: ROOT, logLevel: 'silent' }, 'build', 'production', 'production');
  assert.equal(pages.base, '/moo/');
  assert.equal(pages.build.outDir, 'dist');
  const itch = await resolveConfig({ root: ROOT, mode: VITE_MODE, logLevel: 'silent' }, 'build', 'production', 'production');
  assert.equal(itch.base, './');
  assert.equal(itch.build.outDir, OUT_DIR);
  for (const c of [pages, itch]) {
    assert.equal(c.build.cssMinify, false);
    assert.equal(c.build.chunkSizeWarningLimit, 700);
  }
});

test('the itch build: every URL of the page relative, everything it loads present, nothing from elsewhere', async () => {
  const dir = await buildInto(VITE_MODE);
  try {
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const refs = htmlReferences(html);
    assert.ok(refs.length >= 6, 'favicon, touch icon, two preloads, the script and the stylesheet');
    for (const { url } of refs) assert.match(url, /^\.\/assets\/[A-Za-z0-9_-]+\.(?:ico|png|jpg|js|css)$/, url);
    assert.doesNotMatch(html, /(?:src|href)="(?:\/|https?:)/);
    const { problems } = await validateRelease({ dir, checkZip: false });
    assert.deepEqual(problems, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the Pages build keeps /moo/, and the validation refuses it for itch.io', async () => {
  const dir = await buildInto('production');
  try {
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    for (const { url } of htmlReferences(html)) assert.match(url, /^\/moo\/assets\//, url);
    const { problems } = await validateRelease({ dir, checkZip: false });
    assert.ok(problems.some((p) => /root-absolute \(GitHub Pages' \/moo\//.test(p)), problems.join('\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
