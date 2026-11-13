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
    betweenImages: 220, reducedMotionHold: 1000,

    /* Mavooli's own steps. */
    imageTimeout: 10000,   // logos that have not loaded and decoded by then are skipped
    barFadeIn: 350,        // the loading bar fades in under the logo...
    barMinShow: 300,       // ...and stays at least this long, so it never just flickers
    crossfade: 400,        // loading bar -> "Press to start"
    pulse: 1400,           // one "Press to start" pulse, 1 -> 0.25 -> 1
    /* After the press: white fades in over the logo, holds while the Home Screen is set up under it,
       then fades out to show the Home Screen. */
    whiteFadeIn: 600,
    whiteHold: 150,
    whiteFadeOut: 700,
    reducedWhiteFade: 250  // reduced motion: both fades this long, and no hold
  },

  /* The Home Screen (src/home/). Times are in milliseconds, distances in world units. */
  home: {
    scrollSpeed: 2.4,      // how fast the camera drifts over the world (units per second; walking is 2.8)
    cameraZoom: 30,        // camera distance, like CFG.zoom (further out than the game's 21, to show more of the world)
    direction: 0.45,       // drift heading in radians from straight up the screen (away from the viewer); + turns right
    swayYaw: 0.07,         // the camera's slow side-to-side turn, in radians either way...
    swayPeriod: 38,        // ...over this many seconds
    cardFallMs: 650,       // each card's fall from above the top of the screen
    cardStagger: 70,       // between one card's fall and the next (left, middle, right)
    cardStartAt: 0.45,     // the fall starts when the white has faded this far (0..1)
    leaveMs: 380,          // a picked mode: the cards rise and fade away...
    whiteFadeIn: 450,      // ...while white fades in over the Home Screen; the game is set up under it...
    whiteFadeOut: 800,     // ...and the white fades away to show the game
    reducedFade: 250       // reduced motion: every Home Screen fade is this long and nothing moves
  }
};
export const CH = CFG.chunk;
export const TAU = Math.PI * 2;
