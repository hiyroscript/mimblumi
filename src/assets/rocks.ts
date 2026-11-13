import type * as THREE from 'three';
import { TAU } from '../config';
import { mul } from '../color';
import { pick } from '../math/random';
import type { Rng } from '../math/random';
import { GeoB } from '../geometry/GeoB';
import { STONE, MOSS } from '../world/palette';

export type RockKind = 'round' | 'tall' | 'flat';

export function makeRock(rng: Rng, kind: RockKind): THREE.BufferGeometry {
  const g = new GeoB(rng), base = pick(STONE, rng);
  const w = kind === 'tall' ? 0.72 : kind === 'flat' ? 1.3 : 1.0;
  const h = kind === 'tall' ? 1.25 + rng() * 0.3 : kind === 'flat' ? 0.34 + rng() * 0.1 : 0.62 + rng() * 0.28;
  const d = w * (0.72 + rng() * 0.3);
  g.box({ x: 0, y: h / 2 - 0.1, z: 0, w: w, h: h, d: d, taper: 0.62 + rng() * 0.2, jit: 0.22, c: base, c2: mul(base, 1.12),
          shade: 0.64, fj: 0.14, ry: rng() * TAU, rx: (rng() - 0.5) * 0.3, rz: (rng() - 0.5) * 0.3 });
  if (rng() < 0.45) g.box({ x: (rng() - 0.5) * 0.15, y: h - 0.12, z: (rng() - 0.5) * 0.15, w: w * 0.55, h: 0.09, d: d * 0.55, c: MOSS, c2: mul(MOSS, 1.15), jit: 0.2, ry: rng(), shade: 0.9, noBottom: true });
  const n = 1 + ((rng() * 3) | 0);
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, rad = w * (0.42 + rng() * 0.3), s = 0.32 + rng() * 0.36, c = mul(pick(STONE, rng), 0.95 + rng() * 0.1);
    g.box({ x: Math.cos(a) * rad, y: s * 0.3 - 0.06, z: Math.sin(a) * rad, w: s, h: s * (0.6 + rng() * 0.4), d: s * (0.7 + rng() * 0.4),
            taper: 0.65 + rng() * 0.2, jit: 0.24, c: c, c2: mul(c, 1.1), shade: 0.64, fj: 0.14, ry: rng() * TAU, rx: (rng() - 0.5) * 0.4 });
  }
  return g.build();
}
