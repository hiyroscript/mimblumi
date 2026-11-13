import { CFG } from '../config';

/** A seeded generator returning floats in [0, 1). */
export type Rng = () => number;

/*
 * The integer math below relies on Math.imul, >>> and |0 exactly as written.
 * World generation depends on the exact sequence these produce: do not "simplify".
 */
export function mulberry32(a: number): Rng {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function hashInt(x: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(CFG.seed, 1442695041);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return (h ^ h >>> 16) >>> 0;
}
export const hash01 = (x: number, z: number): number => hashInt(x, z) / 4294967296;
export const pick = <T>(arr: readonly T[], rng: Rng): T => arr[(rng() * arr.length) | 0];
