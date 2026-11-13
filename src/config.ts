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
  yaw: 0.62
};
export const CH = CFG.chunk;
export const TAU = Math.PI * 2;
