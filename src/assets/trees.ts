import type * as THREE from 'three';
import { TAU } from '../config';
import { mul, mixc } from '../color';
import type { RGB } from '../color';
import { pick } from '../math/random';
import type { Rng } from '../math/random';
import { GeoB } from '../geometry/GeoB';
import { LEAF, BARK } from '../world/palette';

/* ============================================================
   4. ASSETS — trees, rocks, flowers, grass
   ============================================================ */

/** One clump of leaves. `flat`, when given, replaces the random height factor. */
export function leafBlob(g: GeoB, x: number, y: number, z: number, s: number, pal: RGB[], rng: Rng, flat?: number): void {
  const c = mul(pick(pal, rng), 0.94 + rng() * 0.12);
  g.box({ x: x, y: y, z: z, w: s * (0.9 + rng() * 0.25), h: s * (flat || (0.74 + rng() * 0.26)), d: s * (0.9 + rng() * 0.25),
          c: c, c2: mul(c, 1.16), shade: 0.66, jit: 0.07, taper: 0.9 + rng() * 0.1,
          ry: rng() * 1.2, rx: (rng() - 0.5) * 0.22, rz: (rng() - 0.5) * 0.22 });
}

export function makeOak(rng: Rng): THREE.BufferGeometry {
  const g = new GeoB(rng), th = 1.7 + rng() * 0.9, tw = 0.42 + rng() * 0.14;
  g.box({ x: 0, y: 0.13, z: 0, w: tw * 1.75, h: 0.3, d: tw * 1.75, taper: 0.6, c: mul(BARK.oak, 0.85), shade: 0.7, ry: rng() * 1.5, noBottom: true });
  g.box({ x: 0, y: th / 2, z: 0, w: tw, h: th, d: tw, taper: 0.8, c: BARK.oak, shade: 0.72, ry: rng() * 0.6, noBottom: true });
  const top = th + 1.0, nb = 2 + ((rng() * 2) | 0);
  for (let b = 0; b < nb; b++) {
    const end = g.limb(0, th * (0.7 + rng() * 0.2), 0, rng() * TAU, 0.6 + rng() * 0.45, 0.9 + rng() * 0.6, tw * 0.5, mul(BARK.oak, 0.92), { shade: 0.8 });
    leafBlob(g, end[0], end[1] + 0.25, end[2], 1.0 + rng() * 0.5, LEAF.oak, rng);
  }
  const n = 6 + ((rng() * 4) | 0);
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, rad = Math.pow(rng(), 0.7) * 1.45;
    leafBlob(g, Math.cos(a) * rad, top + (rng() - 0.4) * 1.3, Math.sin(a) * rad, 1.85 - rad * 0.5 + rng() * 0.4, LEAF.oak, rng);
  }
  return g.build();
}

export function makePine(rng: Rng): THREE.BufferGeometry {
  const g = new GeoB(rng), n = 4 + ((rng() * 2) | 0), w0 = 2.4 + rng() * 0.6;
  g.box({ x: 0, y: 0.7, z: 0, w: 0.36, h: 1.4, d: 0.36, taper: 0.8, c: BARK.pine, shade: 0.7, ry: rng(), noBottom: true });
  let y = 1.0;
  for (let k = 0; k < n; k++) {
    const f = k / n, w = w0 * (1 - f * 0.76), h = 0.9 + rng() * 0.2;
    const c = mul(mixc(LEAF.pine[0], LEAF.pine[2], f), 0.95 + rng() * 0.1);
    g.box({ x: (rng() - 0.5) * 0.12, y: y + h / 2, z: (rng() - 0.5) * 0.12, w: w, h: h, d: w, taper: 0.44,
            c: mul(c, 0.82), c2: mul(c, 1.18), shade: 0.8, jit: 0.04, ry: k * 0.42 + rng() * 0.3 });
    y += h * 0.7;
  }
  g.box({ x: 0, y: y + 0.32, z: 0, w: 0.3, h: 0.7, d: 0.3, taper: 0.25, c: mul(LEAF.pine[2], 1.1), shade: 0.8, ry: rng() });
  return g.build();
}

export function makeBlossom(rng: Rng): THREE.BufferGeometry {
  const g = new GeoB(rng), a0 = rng() * TAU;
  g.box({ x: 0, y: 0.1, z: 0, w: 0.62, h: 0.24, d: 0.62, taper: 0.6, c: mul(BARK.dark, 0.9), shade: 0.7, ry: rng(), noBottom: true });
  const e1 = g.limb(0, 0, 0, a0, 0.2 + rng() * 0.12, 1.3 + rng() * 0.3, 0.34, BARK.dark, { shade: 0.75, taper: 0.82 });
  const e2 = g.limb(e1[0], e1[1] - 0.05, e1[2], a0 + 2.2 + rng(), 0.4 + rng() * 0.2, 0.95 + rng() * 0.3, 0.25, BARK.dark, { shade: 0.85 });
  const ends = [e2], nb = 2 + ((rng() * 2) | 0);
  for (let b = 0; b < nb; b++)
    ends.push(g.limb(e1[0], e1[1] - 0.1, e1[2], a0 + b * (TAU / nb) + rng() * 0.8, 0.85 + rng() * 0.3, 0.9 + rng() * 0.5, 0.17, mul(BARK.dark, 0.95), { shade: 0.85 }));
  for (const e of ends) {
    const m = 2 + ((rng() * 2) | 0);
    for (let k = 0; k < m; k++)
      leafBlob(g, e[0] + (rng() - 0.5) * 1.0, e[1] + 0.2 + rng() * 0.5, e[2] + (rng() - 0.5) * 1.0, 0.95 + rng() * 0.6, LEAF.blossom, rng, 0.62 + rng() * 0.2);
  }
  return g.build();
}

export function makeBirch(rng: Rng): THREE.BufferGeometry {
  const g = new GeoB(rng), th = 3.4 + rng() * 1.0;
  g.box({ x: 0, y: th / 2, z: 0, w: 0.25, h: th, d: 0.25, taper: 0.7, c: BARK.birch, shade: 0.8, ry: rng(), noBottom: true });
  for (let k = 0; k < 5; k++) {
    const y = 0.3 + rng() * (th * 0.55);
    g.box({ x: (rng() - 0.5) * 0.06, y: y, z: (rng() - 0.5) * 0.06, w: 0.265, h: 0.05 + rng() * 0.05, d: 0.265, c: BARK.mark, shade: 1, fj: 0, ry: rng() * 0.3, noBottom: true, noTop: true });
  }
  for (let b = 0; b < 2; b++) {
    const e = g.limb(0, th * (0.55 + rng() * 0.25), 0, rng() * TAU, 0.7 + rng() * 0.3, 0.7 + rng() * 0.4, 0.1, BARK.birch, { shade: 0.9 });
    leafBlob(g, e[0], e[1] + 0.15, e[2], 0.7 + rng() * 0.3, LEAF.birch, rng);
  }
  const n = 6 + ((rng() * 3) | 0);
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, rad = 0.25 + rng() * 0.7;
    leafBlob(g, Math.cos(a) * rad, th * (0.55 + (k / n) * 0.55) + rng() * 0.3, Math.sin(a) * rad, 0.75 + rng() * 0.45, LEAF.birch, rng);
  }
  return g.build();
}

export function makeBush(rng: Rng): THREE.BufferGeometry {
  const g = new GeoB(rng), n = 3 + ((rng() * 4) | 0);
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, rad = k ? 0.25 + rng() * 0.4 : 0, s = 0.5 + rng() * 0.45;
    leafBlob(g, Math.cos(a) * rad, s * 0.38, Math.sin(a) * rad, s, LEAF.bush, rng);
  }
  return g.build();
}
