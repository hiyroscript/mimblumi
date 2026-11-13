import type * as THREE from 'three';
import { TAU } from '../config';
import { rgb, mul, mixc } from '../color';
import type { RGB } from '../color';
import { lerp } from '../math/util';
import type { Rng } from '../math/random';
import { GeoB } from '../geometry/GeoB';
import { STEM, LEAFG, POLLEN } from '../world/palette';

interface FlowerBase {
  /** Stem height. */
  h: number;
  /** Bloom colour, inner. */
  c: RGB;
  /** Bloom colour, tips. */
  ct: RGB;
  /** Stems per plant (default 2). */
  stems?: number;
}
/** A flower with a ring of flat petals around a core. */
export interface PetalFlower extends FlowerBase {
  spike?: undefined;
  petals: number; len: number; wi: number; wo: number; lift: number;
  core: RGB;
}
/** A flower with stacked blooms up the top of the stem. */
export interface SpikeFlower extends FlowerBase {
  spike: true;
}
export type FlowerSpecies = PetalFlower | SpikeFlower;

export const FLOWERS: FlowerSpecies[] = [
  { h: 0.42, petals: 9, len: 0.1, wi: 0.018, wo: 0.034, lift: 0.015, c: rgb(0xf2efe6), ct: rgb(0xffffff), core: POLLEN },                 // daisy
  { h: 0.3, petals: 5, len: 0.075, wi: 0.03, wo: 0.055, lift: 0.045, c: rgb(0xd9b848), ct: rgb(0xecd272), core: rgb(0xc99a2e) },         // buttercup
  { h: 0.5, petals: 7, len: 0.12, wi: 0.022, wo: 0.046, lift: 0.02, c: rgb(0xcf8fa8), ct: rgb(0xe6bccb), core: POLLEN },                 // cosmos
  { h: 0.62, spike: true, c: rgb(0x8f7ab8), ct: rgb(0xb09ad0) },                                                                         // lupine
  { h: 0.22, petals: 5, len: 0.05, wi: 0.02, wo: 0.034, lift: 0.01, c: rgb(0x9fb6d6), ct: rgb(0xc3d3e8), core: POLLEN, stems: 3 },       // forget-me-not
  { h: 0.45, petals: 4, len: 0.1, wi: 0.04, wo: 0.075, lift: 0.05, c: rgb(0xcf7a62), ct: rgb(0xe09c84), core: rgb(0x3a2f2a) }            // poppy
];

export function makeFlower(rng: Rng, sp: FlowerSpecies): THREE.BufferGeometry {
  const g = new GeoB(rng), n = sp.stems || 2;
  for (let s = 0; s < n; s++) {
    const a = rng() * TAU, off = s ? 0.1 + rng() * 0.12 : 0, bx = Math.cos(a) * off, bz = Math.sin(a) * off;
    const H = sp.h * (0.72 + rng() * 0.42);
    const e = g.limb(bx, 0, bz, rng() * TAU, 0.06 + rng() * 0.14, H, 0.032, STEM, { shade: 0.65, noBottom: true, noTop: true, fj: 0 });
    for (let l = 0; l < 2; l++)
      g.petal(lerp(bx, e[0], 0.25), H * (0.18 + rng() * 0.2), lerp(bz, e[2], 0.25), rng() * TAU, 0.01, 0.11 + rng() * 0.05, 0.012, 0.04, 0.06, mul(LEAFG, 0.8), LEAFG);
    if (sp.spike) {
      for (let k = 0; k < 6; k++) {
        const f = k / 5, t = 0.5 + f * 0.56, w = lerp(0.115, 0.04, f);
        g.box({ x: lerp(bx, e[0], t), y: H * t, z: lerp(bz, e[2], t), w: w, h: H * 0.1, d: w, c: mixc(sp.c, sp.ct, f * 0.7 + rng() * 0.3), shade: 0.8, ry: rng() * 1.5, taper: 0.8, noBottom: true });
      }
    } else {
      const rot = rng() * TAU;
      for (let k = 0; k < sp.petals; k++)
        g.petal(e[0], e[1] + 0.012, e[2], rot + k * TAU / sp.petals, 0.018, sp.len * (0.9 + rng() * 0.2), sp.wi, sp.wo, sp.lift, sp.c, sp.ct);
      g.box({ x: e[0], y: e[1] + 0.02, z: e[2], w: 0.05, h: 0.04, d: 0.05, c: sp.core, shade: 0.85, fj: 0, ry: rot, noBottom: true });
    }
  }
  return g.build();
}
