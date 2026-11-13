// What the itch.io release (tools/itch/build.mjs) shares with its validation
// (validate.mjs) and its check over HTTP and in a browser (verify.mjs):
// where things are, the platform's limits, what is development-only, and the
// content types a static host serves the release's files with.
//
// GitHub Pages stays the site: `npm run build` makes dist/ for /moo/, as
// before (.github/workflows/deploy.yml). The release is the same game built
// by Vite in its `itch` mode (vite.config.ts): every URL relative, written to
// dist/itch/, then zipped with index.html at the archive's root. Nothing here
// edits the source, and the release is never edited by hand: it is rebuilt
// (docs/itch-release.md).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// The game's name, in the report and the archive's name.
export const GAME = 'Mavooli';

// The release, and its archive beside it (never inside it). Both are
// generated and ignored by Git (.gitignore: dist).
export const DIST = 'dist';
export const OUT_DIR = `${DIST}/itch`;
export const ZIP_PATH = `${DIST}/mavooli-itch.zip`;

// The Vite mode that builds the release (vite.config.ts): base './',
// outDir dist/itch. The default mode is GitHub Pages' build.
export const VITE_MODE = 'itch';

// Where GitHub Pages serves the game (vite.config.ts's default base). It
// never appears in the release: on itch.io there is no /moo/.
export const PAGES_BASE = '/moo/';

// What is development-only and never part of the release, wherever it
// sits: the TypeScript sources, the tools, tests and documentation, npm,
// Git, editor and system files (any name starting with a dot), source maps,
// TypeScript and Markdown files, the archive itself, the repository's own
// configuration and the task file `max`. Vite copies none of it; the
// validation fails a release holding any.
export const DEVELOPMENT_ONLY = Object.freeze([
  /(^|\/)(src|tools|tests?|docs|node_modules|dist|public)(\/|$)/,
  /(^|\/)\./,
  /\.(map|ts|tsx|mts|cts|mjs|cjs|md|log|zip)$/i,
  /(^|\/)(package(-lock)?\.json|tsconfig(\.[^/]*)?\.json|vite\.config\.[^/]*|max|README[^/]*|LICENSE[^/]*|Thumbs\.db|desktop\.ini)$/i,
  /\.test\./,
]);
export const isDevelopmentOnly = (path) => DEVELOPMENT_ONLY.some((re) => re.test(path));

// itch.io's limits for an HTML5 game's ZIP (as extracted), and the margin
// the release keeps below the file limit.
// https://itch.io/docs/creators/html5
export const LIMITS = Object.freeze({
  files: 1000,
  comfortableFiles: 950,
  totalBytes: 500 * 1024 * 1024,
  fileBytes: 200 * 1024 * 1024,
  pathLength: 240,
});

// The content type a static host (itch.io's game host among them) serves
// each extension the release may hold with. verify.mjs's server uses the
// same table, and checks every file the page loads is served as what it is
// loaded as (a module script as JavaScript, a stylesheet as CSS, an image
// as an image). An extension missing here would be served as
// application/octet-stream, which a browser refuses for a module script.
export const CONTENT_TYPES = Object.freeze({
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  webmanifest: 'application/manifest+json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  webm: 'video/webm',
  wasm: 'application/wasm',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  bin: 'application/octet-stream',
  txt: 'text/plain; charset=utf-8',
});
export const extensionOf = (path) => (path.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase();
export const contentTypeOf = (path) => CONTENT_TYPES[extensionOf(path)] ?? 'application/octet-stream';

export const read = (path) => readFileSync(`${ROOT}${path}`, 'utf8');

// The release's version: package.json's `version`, the one place it is
// written. butler's --userversion is this with the commit's short SHA
// (.github/workflows/itch-release.yml).
export function releaseVersion(pkg = JSON.parse(read('package.json'))) {
  const version = pkg?.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`package.json's version should be MAJOR.MINOR.PATCH, not ${JSON.stringify(version)}`);
  }
  return version;
}
