import { defineConfig } from 'vite';

// Two builds of the same game, chosen by mode:
//
// - The default (`vite build`): GitHub Pages serves this project from https://hiyroscript.github.io/moo/,
//   so every asset URL has to start with /moo/. Written to dist/.
// - `vite build --mode itch` (run by `npm run build:itch`, tools/itch/build.mjs): itch.io serves the game
//   inside an <iframe> from a path of its own choosing on its game host, so every URL is relative (./).
//   Written to dist/itch/, which the itch.io ZIP is made from (docs/itch-release.md).
//
// Nothing else differs: the same code, the same assets, the same options.
export default defineConfig(({ mode }) => {
  const itch = mode === 'itch';
  return {
    base: itch ? './' : '/moo/',
    build: {
      outDir: itch ? 'dist/itch' : 'dist',
      // Ship the stylesheet exactly as written (it is ~1.5 kB). The minifier reorders
      // declarations and adds helper variables, which is equivalent but harder to audit.
      cssMinify: false,
      // three.js r128 is ~520 kB minified on its own (the old page loaded the 600 kB
      // three.min.js from cdnjs), so the single bundle is expected to be over 500 kB.
      chunkSizeWarningLimit: 700
    }
  };
});
