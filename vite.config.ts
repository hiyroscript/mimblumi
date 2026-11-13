import { defineConfig } from 'vite';

// GitHub Pages serves this project from https://hiyroscript.github.io/moo/,
// so every asset URL has to start with /moo/.
export default defineConfig({
  base: '/moo/',
  build: {
    outDir: 'dist',
    // Ship the stylesheet exactly as written (it is ~1.5 kB). The minifier reorders
    // declarations and adds helper variables, which is equivalent but harder to audit.
    cssMinify: false,
    // three.js r128 is ~520 kB minified on its own (the old page loaded the 600 kB
    // three.min.js from cdnjs), so the single bundle is expected to be over 500 kB.
    chunkSizeWarningLimit: 700
  }
});
