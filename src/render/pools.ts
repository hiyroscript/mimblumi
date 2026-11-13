import * as THREE from 'three';
import { CFG } from '../config';
import { mulberry32 } from '../math/random';
import { makeOak, makePine, makeBlossom, makeBirch, makeBush } from '../assets/trees';
import { makeRock } from '../assets/rocks';
import type { RockKind } from '../assets/rocks';
import { FLOWERS, makeFlower } from '../assets/flowers';
import { makeGrass } from '../assets/grass';
import { matTree, matRock, matVeg } from './materials';

/* ============================================================
   6. INSTANCE POOLS — one draw call per asset for the whole world
   ============================================================ */

/** Every pool, in creation order. A chunk's `inst[k]` holds its instances for `pools[k]`. */
export const pools: THREE.InstancedMesh[] = [];

/** Pool indices for each kind of asset. */
export interface PoolKinds {
  oak: number[]; pine: number[]; blossom: number[]; birch: number[]; bush: number[];
  rock: number[]; flower: number[];
  gShort: number; gTall: number; gLeafy: number;
}
export const KIND: PoolKinds = { oak: [], pine: [], blossom: [], birch: [], bush: [], rock: [], flower: [], gShort: -1, gTall: -1, gLeafy: -1 };

export function addPool(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, cast: boolean): number {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  m.count = 0; m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true;
  m.matrixAutoUpdate = false; m.userData.cap = cap;
  scene.add(m); pools.push(m);
  return pools.length - 1;
}

/*
 * Build every asset variant and its pool. All of them draw from ONE random stream, so the
 * order below (and the order of rng() calls inside each make* function) defines the world.
 * Must run exactly once, before the first makeChunk().
 */
export function buildPools(scene: THREE.Scene): void {
  if (pools.length) throw new Error('buildPools() must only run once');
  const rng = mulberry32(CFG.seed ^ 0x51ed270b);
  for (let i = 0; i < 3; i++) KIND.oak.push(addPool(scene, makeOak(rng), matTree, 420, true));
  for (let i = 0; i < 3; i++) KIND.pine.push(addPool(scene, makePine(rng), matTree, 420, true));
  for (let i = 0; i < 2; i++) KIND.blossom.push(addPool(scene, makeBlossom(rng), matTree, 320, true));
  for (let i = 0; i < 3; i++) KIND.birch.push(addPool(scene, makeBirch(rng), matTree, 420, true));
  for (let i = 0; i < 2; i++) KIND.bush.push(addPool(scene, makeBush(rng), matTree, 700, true));
  for (const k of ['round', 'round', 'tall', 'flat', 'round'] as RockKind[]) KIND.rock.push(addPool(scene, makeRock(rng, k), matRock, 700, true));
  for (const sp of FLOWERS) KIND.flower.push(addPool(scene, makeFlower(rng, sp), matVeg, 1800, false));
  KIND.gShort = addPool(scene, makeGrass(rng, 'short'), matVeg, 16000, false);
  KIND.gTall = addPool(scene, makeGrass(rng, 'tall'), matVeg, 9000, false);
  KIND.gLeafy = addPool(scene, makeGrass(rng, 'leafy'), matVeg, 4500, false);
}
