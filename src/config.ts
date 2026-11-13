/* ============================================================
   1. CONFIG + MATH
   ============================================================ */
export const CFG = {
  seed: 20261111,
  chunk: 32,          // world units per chunk side (1 unit = 1 terrain tile)
  loadR: 2,           // chunks generated around the player (and around where they are heading)
  keepR: 3,           // chunks further than this are disposed
  walk: 2.8, run: 6.8,
  zoom: 21, zoomMin: 12, zoomMax: 34,
  yaw: 0.62,

  /* The intro (src/intro/splash.ts). Times are in milliseconds. */
  splash: {
    /* Copied from Alva's CONFIG.splash, so both games open the same way. */
    fadeIn: 900, hold: 1600, fadeOut: 800,
    zoomFrom: 0.96, zoomTo: 1.04,
    betweenImages: 220, finalBlackHold: 200, reducedMotionHold: 1000,

    /* Mimblumi's own steps. */
    imageTimeout: 10000,   // logos that have not loaded and decoded by then are skipped
    barFadeIn: 350,        // the loading bar fades in under the logo...
    barMinShow: 300,       // ...and stays at least this long, so it never just flickers
    crossfade: 400,        // loading bar -> "Press to start"
    pulse: 1400,           // one "Press to start" pulse, 1 -> 0.25 -> 1
    pressFadeOut: 400,     // logo and prompt fade out after the press
    /* The background after the press, each colour cross-fading into the next. The green and brown are the
       world's own oak leaf (LEAF.oak[1]) and earth (PAL.earth). */
    transitionColors: ['#000000', '#0399FF', '#5F8F43', '#7D5F42', '#FFFFFF'],
    transitionMs: 2700,
    reducedTransitionMs: 600,  // reduced motion: one black -> white cross-fade instead
    revealMs: 900              // the white fades away to show the running game
  }
};
export const CH = CFG.chunk;
export const TAU = Math.PI * 2;
