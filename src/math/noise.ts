import { mulberry32 } from './random';

/** A 2D noise function, output roughly in [-1, 1]. */
export type Noise2 = (x: number, y: number) => number;

/* Seeded 2D simplex noise, output roughly in [-1, 1]. */
export function makeNoise(seed: number): Noise2 {
  const rng = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const GX = [1, -1, 1, -1, 1, -1, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1, -1];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return function (x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0, a = 0.5 - x0 * x0 - y0 * y0, g;
    if (a > 0) { a *= a; g = perm[ii + perm[jj]] & 7; n += a * a * (GX[g] * x0 + GY[g] * y0); }
    a = 0.5 - x1 * x1 - y1 * y1;
    if (a > 0) { a *= a; g = perm[ii + i1 + perm[jj + j1]] & 7; n += a * a * (GX[g] * x1 + GY[g] * y1); }
    a = 0.5 - x2 * x2 - y2 * y2;
    if (a > 0) { a *= a; g = perm[ii + 1 + perm[jj + 1]] & 7; n += a * a * (GX[g] * x2 + GY[g] * y2); }
    return 70 * n;
  };
}
