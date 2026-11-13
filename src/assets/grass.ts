import type * as THREE from 'three';
import { TAU } from '../config';
import type { Rng } from '../math/random';
import { GeoB } from '../geometry/GeoB';

export type GrassKind = 'short' | 'tall' | 'leafy';

export function makeGrass(rng: Rng, kind: GrassKind): THREE.BufferGeometry {
  const g = new GeoB(rng);
  const n = kind === 'tall' ? 8 : 6;
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, r = rng() * (kind === 'leafy' ? 0.05 : 0.17);
    const h = kind === 'tall' ? 0.55 + rng() * 0.42 : kind === 'leafy' ? 0.16 + rng() * 0.12 : 0.2 + rng() * 0.2;
    const w = kind === 'leafy' ? 0.13 + rng() * 0.04 : 0.055 + rng() * 0.03;
    const lean = kind === 'tall' ? 0.2 + rng() * 0.22 : kind === 'leafy' ? 0.2 + rng() * 0.1 : 0.08 + rng() * 0.1;
    const dir = kind === 'leafy' ? k * TAU / n + rng() * 0.5 : rng() * TAU;
    g.blade(Math.cos(a) * r, Math.sin(a) * r, dir, h, w, lean);
  }
  return g.build();
}
