import { CFG } from '../config';
import { lerp, sm } from '../math/util';
import { hash01 } from '../math/random';
import { makeNoise } from '../math/noise';
import { PAL } from './palette';

/* ============================================================
   2. WORLD FIELDS  (everything is sampled in world space, so chunks always agree)
   ============================================================ */
export const N2 = makeNoise(CFG.seed);

export const Fields = {
  height(x: number, z: number): number {
    let h = N2(x / 120, z / 120) * 4.4            // broad rolling hills
          + N2(x / 47 + 31.7, z / 47 - 17.3) * 1.7 // knolls and dips
          + N2(x / 18 - 50.1, z / 18 + 80.4) * 0.5 // uneven ground
          + N2(x / 6.7 + 9.2, z / 6.7 + 300.5) * 0.13;
    h += sm(0.22, 0.5, N2(x / 78 + 200.3, z / 78 + 211.9)) * 1.6; // occasional raised shelves
    return h;
  },
  /** Height of terrain tile (ix, iz), snapped to quarter steps. */
  cell(ix: number, iz: number): number { return Math.round(Fields.height(ix + 0.5, iz + 0.5) * 4) / 4; },
  /** Smoothed walking height at a world position. */
  ground(x: number, z: number): number {
    const fx = x - 0.5, fz = z - 0.5, i = Math.floor(fx), j = Math.floor(fz);
    const tx = sm(0.28, 0.72, fx - i), tz = sm(0.28, 0.72, fz - j);
    const a = Fields.cell(i, j), b = Fields.cell(i + 1, j), c = Fields.cell(i, j + 1), d = Fields.cell(i + 1, j + 1);
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  },
  forest: (x: number, z: number): number => N2(x / 88 + 500.5, z / 88 + 3.1) * 0.72 + N2(x / 29 + 7.7, z / 29 + 500.2) * 0.28,
  glade: (x: number, z: number): number => N2(x / 15 + 820.1, z / 15 - 410.6),
  moist: (x: number, z: number): number => N2(x / 150 + 900.9, z / 150 - 900.4),
  dirt: (x: number, z: number): number => N2(x / 40 - 300.2, z / 40 + 120.8) * 0.8 + N2(x / 9.5 + 60.3, z / 9.5 - 44.4) * 0.3,
  grass: (x: number, z: number): number => N2(x / 24 + 77.7, z / 24 - 33.3) * 0.65 + N2(x / 7.3 - 12.1, z / 7.3 + 8.8) * 0.35,
  patch: (x: number, z: number): number => N2(x / 27 + 410.4, z / 27 - 95.6),
  flower: (x: number, z: number): number => N2(x / 52 - 600.6, z / 52 + 640.2),
  rock: (x: number, z: number): number => N2(x / 62 + 333.3, z / 62 - 222.2),
  blossom: (x: number, z: number): number => N2(x / 58 + 1234.5, z / 58 + 77.1),
  /* out = [r, g, b, bareGround 0..1, grassDensity -1..1] for one terrain tile */
  cellColor(wx: number, wz: number, o: number[]): void {
    const x = wx + 0.5, z = wz + 0.5, P = PAL;
    const t = sm(-0.55, 0.55, Fields.moist(x, z));
    let r = lerp(P.olive[0], P.forest[0], t), g = lerp(P.olive[1], P.forest[1], t), b = lerp(P.olive[2], P.forest[2], t);
    const s = sm(0.15, 0.75, Fields.patch(x, z)) * 0.55;
    r = lerp(r, P.sage[0], s); g = lerp(g, P.sage[1], s); b = lerp(b, P.sage[2], s);
    const f = sm(0.15, 0.6, Fields.forest(x, z)) * 0.45;
    r = lerp(r, P.floor[0], f); g = lerp(g, P.floor[1], f); b = lerp(b, P.floor[2], f);
    const d = sm(0.42, 0.66, Fields.dirt(x, z));
    if (d > 0) {
      const k = hash01(wx * 3 + 11, wz * 5 - 7) * 0.6;
      r = lerp(r, lerp(P.sand[0], P.earth[0], k), d);
      g = lerp(g, lerp(P.sand[1], P.earth[1], k), d);
      b = lerp(b, lerp(P.sand[2], P.earth[2], k), d);
    }
    const j = 0.93 + 0.14 * hash01(wx, wz) + (((wx + wz) & 1) ? 0.012 : -0.012);
    o[0] = r * j; o[1] = g * j; o[2] = b * j; o[3] = d; o[4] = Fields.grass(x, z);
  }
};
