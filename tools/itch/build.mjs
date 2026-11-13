// Builds the itch.io release: `npm run build:itch` (after `npm ci`).
//
// 1. Empties dist/itch and removes the last archive.
// 2. Type-checks the game (tsc --noEmit, as `npm run build` does).
// 3. Builds it with Vite in its itch mode (vite.config.ts: base './',
//    outDir dist/itch), after checking the config still says so: the same
//    game as on GitHub Pages, with every URL relative.
// 4. Validates the folder (validate.mjs) and, if it is valid, writes
//    dist/mavooli-itch.zip with index.html at its root (no enclosing
//    folder), then validates the archive against the folder.
// 5. Prints the report. A problem fails the build (exit code 1) and leaves
//    no archive behind. A good build ends by printing OK.
//
// Deterministic: the same commit makes the same files (Vite names them by
// their content) and, with the same zlib, the same archive (zip.mjs). The
// source is never written to.

import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve, relative } from 'node:path';
import { ROOT, GAME, OUT_DIR, ZIP_PATH, VITE_MODE, LIMITS, releaseVersion } from './release.mjs';
import { listFiles, validateRelease } from './validate.mjs';
import { writeZip } from './zip.mjs';

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const seconds = (since) => `${((Date.now() - since) / 1000).toFixed(1)} s`;

// The type check `npm run build` runs, with the repository's own tsc.
function typeCheck() {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve('typescript/package.json');
  const bin = JSON.parse(readFileSync(pkgPath, 'utf8')).bin.tsc;
  const result = spawnSync(process.execPath, [join(dirname(pkgPath), bin), '--noEmit'], { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`the type check failed (tsc --noEmit exited with ${result.status ?? result.signal})`);
}

// Vite's itch build, refused unless the config makes a relative build into
// dist/itch: anything else would write over the Pages build in dist/ or
// make a release that cannot run on itch.io.
async function viteBuild() {
  const { build, resolveConfig } = await import('vite');
  const config = await resolveConfig({ root: ROOT, mode: VITE_MODE, logLevel: 'warn' }, 'build', 'production', 'production');
  const outDir = relative(ROOT, resolve(ROOT, config.build.outDir)).replaceAll('\\', '/');
  if (config.base !== './') throw new Error(`vite.config.ts gives the ${VITE_MODE} mode base ${JSON.stringify(config.base)}: it must be './'`);
  if (outDir !== OUT_DIR) throw new Error(`vite.config.ts gives the ${VITE_MODE} mode outDir ${JSON.stringify(outDir)}: it must be ${OUT_DIR}`);
  await build({ root: ROOT, mode: VITE_MODE, logLevel: 'warn' });
}

async function main() {
  const started = Date.now();
  rmSync(join(ROOT, OUT_DIR), { recursive: true, force: true });
  rmSync(join(ROOT, ZIP_PATH), { force: true });

  let report;
  let checked = '';
  let built = '';
  let version = '';
  try {
    version = releaseVersion();
    const t0 = Date.now();
    typeCheck();
    checked = seconds(t0);
    const t1 = Date.now();
    await viteBuild();
    built = seconds(t1);

    // The folder first: an invalid release makes no archive.
    report = await validateRelease({ checkZip: false });
    if (!report.problems.length) {
      const out = join(ROOT, OUT_DIR);
      const files = listFiles(out);
      mkdirSync(dirname(join(ROOT, ZIP_PATH)), { recursive: true });
      writeFileSync(join(ROOT, ZIP_PATH), writeZip(files.map((name) => ({ name, data: readFileSync(join(out, name)) }))));
      report = await validateRelease();
    }
  } catch (err) {
    report = { problems: [err.message], warnings: [], stats: null };
  }
  if (report.problems.length && existsSync(join(ROOT, ZIP_PATH))) rmSync(join(ROOT, ZIP_PATH));

  const { problems, warnings, stats } = report;
  console.log(`\n${GAME}: itch.io release`);
  console.log('─'.repeat(64));
  if (version) console.log(`version         ${version} (package.json)`);
  if (checked) console.log(`type check      tsc --noEmit, no errors (${checked})`);
  if (built) console.log(`vite build      --mode ${VITE_MODE}: base ./ → ${OUT_DIR}/ (${built})`);
  if (stats) {
    console.log('\nfiles');
    for (const { path, bytes } of stats.sizes) console.log(`  ${kb(bytes).padStart(10)}  ${path}`);
    console.log(`\nfiles           ${stats.files} (itch.io: fewer than ${LIMITS.files})`);
    console.log(`size            ${mb(stats.totalBytes)} extracted (limit ${mb(LIMITS.totalBytes)})`);
    console.log(`largest file    ${stats.largest}, ${mb(stats.sizes.find((s) => s.path === stats.largest).bytes)} (limit ${mb(LIMITS.fileBytes)} each)`);
    console.log(`longest path    ${stats.longestPath.length} characters (limit ${LIMITS.pathLength})`);
    console.log(`references      ${stats.references} in the page, its stylesheet and its script: all relative, all in the release`);
    if (stats.zipBytes) console.log(`archive         ${ZIP_PATH} (${mb(stats.zipBytes)}), index.html at its root`);
  }
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const p of problems) console.error(`problem: ${p}`);
  console.log('─'.repeat(64));
  if (problems.length) {
    console.log(`FAILED: ${problems.length} problem(s); no archive was written.`);
    process.exitCode = 1;
  } else {
    console.log(`Upload ${ZIP_PATH} to itch.io as an HTML game (docs/itch-release.md).`);
    console.log(`OK (${seconds(started)})`);
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error(err);
  rmSync(join(ROOT, ZIP_PATH), { force: true });
  process.exitCode = 1;
});
