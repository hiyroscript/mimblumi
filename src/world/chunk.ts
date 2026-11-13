import * as THREE from 'three';
import { CH, TAU } from '../config';
import { clamp, sm } from '../math/util';
import { mulberry32, hashInt, hash01, pick } from '../math/random';
import { Fields } from './fields';
import { PAL } from './palette';
import { pools, KIND } from '../render/pools';
import { SUNH } from '../render/lights';
import { matTerrain } from '../render/materials';

/* ============================================================
   7. CHUNK GENERATION — terrain mesh + object placement, a pure function of (cx, cz, seed)
   ============================================================ */

/** One chunk's instances of one pool: `n` instances, 16 matrix floats and 3 colour floats each. */
export interface InstData { m: Float32Array; c: Float32Array; n: number }
/** Instances collected while a chunk is generated, before they are packed into typed arrays. */
interface InstDraft { m: number[]; c: number[] }

export interface Chunk {
  cx: number;
  cz: number;
  /** Terrain mesh, positioned at the chunk's world origin. */
  mesh: THREE.Mesh;
  /** Instances per pool, indexed like `pools`; null where the chunk has none. */
  inst: (InstData | null)[];
  /** Flat [x, z, r, ...] circles in world space. */
  colliders: Float32Array;
}

type TreeType = 'oak' | 'pine' | 'birch' | 'blossom';
/** [x, z, r] */
type Solid = [number, number, number];

/* Scratch buffers shared by every makeChunk call; each chunk copies out what it uses. */
const MAXV = CH * CH * 12;
const S = { pos: new Float32Array(MAXV * 3), nor: new Float32Array(MAXV * 3), col: new Float32Array(MAXV * 3), idx: new Uint16Array(MAXV / 4 * 6) };
const _cc = [0, 0, 0, 0, 0];

export function makeChunk(cx: number, cz: number): Chunk {
  const N = CH, ox = cx * N, oz = cz * N, W = N + 2, CW = N + 1;
  const rng = mulberry32(hashInt(cx * 7 + 1, cz * 13 - 5));

  /* Tile heights, with a one-tile border so edges match the neighbours exactly. */
  const H = new Float32Array(W * W);
  for (let j = -1; j <= N; j++) for (let i = -1; i <= N; i++) H[(i + 1) + (j + 1) * W] = Fields.cell(ox + i, oz + j);
  const hL = (i: number, j: number): number => H[(i + 1) + (j + 1) * W];
  const hW = (wx: number, wz: number): number => {
    const i = Math.floor(wx) - ox, j = Math.floor(wz) - oz;
    return (i >= -1 && i <= N && j >= -1 && j <= N) ? hL(i, j) : Fields.cell(Math.floor(wx), Math.floor(wz));
  };

  const col = new Float32Array(CW * CW * 3), dirtA = new Float32Array(CW * CW), grassA = new Float32Array(CW * CW);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    Fields.cellColor(ox + i, oz + j, _cc);
    const k = i + j * CW;
    col[k * 3] = _cc[0]; col[k * 3 + 1] = _cc[1]; col[k * 3 + 2] = _cc[2]; dirtA[k] = _cc[3]; grassA[k] = _cc[4];
  }

  /* ---- object placement ---- */
  const inst = new Array<InstDraft | InstData | null>(pools.length).fill(null);
  const put = (k: number, x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number, r: number, g: number, b: number): void => {
    const d = (inst[k] || (inst[k] = { m: [], c: [] })) as InstDraft;
    const c = Math.cos(ry), s = Math.sin(ry);
    d.m.push(c * sx, 0, -s * sx, 0, 0, sy, 0, 0, s * sz, 0, c * sz, 0, x, y, z, 1);
    d.c.push(r, g, b);
  };
  const colliders: number[] = [];    // flat [x, z, r, ...] in world space
  const solids: Solid[] = [];        // [x, z, r] keeps things from growing inside each other
  const shade = new Float32Array(N * N).fill(1);   // soft contact shadow baked into the ground
  const stamp = (wx: number, wz: number, rad: number, str: number): void => {
    const lx = wx - ox, lz = wz - oz;
    const i0 = Math.max(0, Math.floor(lx - rad)), i1 = Math.min(N - 1, Math.floor(lx + rad));
    const j0 = Math.max(0, Math.floor(lz - rad)), j1 = Math.min(N - 1, Math.floor(lz + rad));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i + 0.5 - lx, j + 0.5 - lz);
      if (d < rad) { const v = 1 - str * (1 - d / rad); if (v < shade[i + j * N]) shade[i + j * N] = v; }
    }
  };
  const blocked = (x: number, z: number, pad: number): boolean => {
    for (let k = 0; k < solids.length; k++) { const s = solids[k]; if (Math.hypot(x - s[0], z - s[1]) < s[2] + pad) return true; }
    return false;
  };

  /* Trees: a jittered lattice thinned by the forest field, so groves, loners and clearings all appear. */
  for (let gj = 0; gj < 8; gj++) for (let gi = 0; gi < 8; gi++) {
    const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng();
    const x = ox + (gi + 0.14 + 0.72 * r1) * 4, z = oz + (gj + 0.14 + 0.72 * r2) * 4;
    if (x * x + z * z < 49) continue;                       // keep the spawn glade open
    const F = Fields.forest(x, z);
    let p = 0.03 + 0.78 * sm(0.0, 0.55, F);
    if (Fields.glade(x, z) > 0.4) p *= 0.12;
    const li = Math.floor(x) - ox, lj = Math.floor(z) - oz;
    if (dirtA[li + lj * CW] > 0.6) p *= 0.2;
    if (r3 > p) continue;
    const h = hL(li, lj);
    if (Math.max(Math.abs(h - hL(li + 1, lj)), Math.abs(h - hL(li - 1, lj)), Math.abs(h - hL(li, lj + 1)), Math.abs(h - hL(li, lj - 1))) > 0.5) continue;
    if (blocked(x, z, 2.2)) continue;
    const M = Fields.moist(x, z);
    const wOak = 1, wPine = 2.3 * sm(0.0, 0.5, M), wBirch = 1.7 * sm(0.0, 0.5, -M), wBlos = 0.1 + 3.2 * sm(0.42, 0.7, Fields.blossom(x, z));
    let t = r4 * (wOak + wPine + wBirch + wBlos), type: TreeType;
    if ((t -= wOak) < 0) type = 'oak'; else if ((t -= wPine) < 0) type = 'pine'; else if ((t -= wBirch) < 0) type = 'birch'; else type = 'blossom';
    const s = (0.82 + 0.45 * r5) * (F < 0.05 ? 1.16 : 1);
    put(pick(KIND[type], rng), x, h - 0.05, z, rng() * TAU, s, s * (0.92 + rng() * 0.2), s, 0.9 + rng() * 0.2, 0.92 + rng() * 0.16, 0.88 + rng() * 0.2);
    colliders.push(x, z, 0.3 * s);
    solids.push([x, z, 0.35 * s]);
    stamp(x, z, (type === 'pine' ? 1.9 : type === 'birch' ? 1.6 : 2.5) * s, 0.24);
  }
  /* Bushes gather along forest edges. */
  for (let k = 0; k < 12; k++) {
    const x = ox + 1 + rng() * (N - 2), z = oz + 1 + rng() * (N - 2), r = rng(), sc = 0.8 + rng() * 0.7, ry = rng() * TAU, tn = 0.9 + rng() * 0.2;
    const F = Fields.forest(x, z);
    if (r > 0.06 + 0.5 * sm(-0.15, 0.1, F) * (1 - sm(0.3, 0.6, F))) continue;
    if (x * x + z * z < 16 || blocked(x, z, 1.1)) continue;
    put(pick(KIND.bush, rng), x, hW(x, z) - 0.03, z, ry, sc, sc, sc, tn, tn, tn * 0.96);
    solids.push([x, z, 0.4 * sc]); colliders.push(x, z, 0.38 * sc);
    stamp(x, z, 1.1 * sc, 0.2);
  }

  /* Rocks: outcrops where the rock field is strong, stray pebbles everywhere else. */
  const placeRock = (x: number, z: number, sc: number): void => {
    if (x < ox + 0.6 || z < oz + 0.6 || x > ox + N - 0.6 || z > oz + N - 0.6) return;
    if (x * x + z * z < 20 || blocked(x, z, 0.45 * sc + 0.3)) return;
    const e = 0.4 * sc;
    const y = Math.min(hW(x, z), hW(x + e, z), hW(x - e, z), hW(x, z + e), hW(x, z - e));
    const tn = 0.9 + rng() * 0.2;
    put(pick(KIND.rock, rng), x, y - 0.03 * sc, z, rng() * TAU, sc * (0.85 + rng() * 0.3), sc * (0.8 + rng() * 0.45), sc * (0.85 + rng() * 0.3), tn, tn * 0.99, tn * 0.97);
    if (sc >= 0.55) { colliders.push(x, z, 0.52 * sc); solids.push([x, z, 0.6 * sc]); stamp(x, z, 1.0 * sc + 0.5, 0.22); }
  };
  {
    const R = Fields.rock(ox + N / 2, oz + N / 2);
    const clusters = R > 0.3 ? 1 + ((rng() * 2.4) | 0) : (rng() < 0.3 ? 1 : 0);
    for (let c = 0; c < clusters; c++) {
      const x = ox + 3 + rng() * (N - 6), z = oz + 3 + rng() * (N - 6);
      const big = R > 0.45 && rng() < 0.65, sc = big ? 1.5 + rng() * 1.0 : 0.65 + rng() * 0.5;
      placeRock(x, z, sc);
      const n = 2 + ((rng() * 5) | 0);
      for (let k = 0; k < n; k++) {
        const a = rng() * TAU, d = sc * (0.75 + rng() * 1.3);
        placeRock(x + Math.cos(a) * d, z + Math.sin(a) * d, sc * (0.18 + rng() * 0.42));
      }
    }
    const pebbles = 3 + ((rng() * 6) | 0);
    for (let k = 0; k < pebbles; k++) placeRock(ox + rng() * N, oz + rng() * N, 0.14 + rng() * 0.22);
  }

  /* Flowers: drifts of one species, with a few strangers mixed in. */
  {
    const Fl = Fields.flower(ox + N / 2, oz + N / 2);
    const drifts = Fl > 0.15 ? 2 + ((rng() * 4 * sm(0.15, 0.7, Fl)) | 0) : (rng() < 0.35 ? 1 : 0);
    for (let c = 0; c < drifts; c++) {
      const x0 = ox + 2 + rng() * (N - 4), z0 = oz + 2 + rng() * (N - 4);
      const main = (rng() * KIND.flower.length) | 0, rad = 1.2 + rng() * 2.2;
      const n = 5 + ((rng() * (Fl > 0.55 ? 22 : 11)) | 0);
      for (let k = 0; k < n; k++) {
        const a = rng() * TAU, d = rad * rng() * Math.sqrt(rng()), kind = rng() < 0.82 ? main : (rng() * KIND.flower.length) | 0;
        const sc = 1.05 + rng() * 0.6, ry = rng() * TAU, tn = 0.92 + rng() * 0.16;
        const x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d;
        if (x < ox + 0.3 || z < oz + 0.3 || x > ox + N - 0.3 || z > oz + N - 0.3) continue;
        const li = Math.floor(x) - ox, lj = Math.floor(z) - oz;
        if (dirtA[li + lj * CW] > 0.75 || blocked(x, z, 0.15)) continue;
        put(KIND.flower[kind], x, hL(li, lj), z, ry, sc, sc, sc, tn, tn, tn);
      }
    }
  }

  /* Grass: thick where the grass field is high, thin on bare earth and under dense canopy. */
  for (let k = 0; k < 540; k++) {
    const x = ox + rng() * N, z = oz + rng() * N, r = rng(), r2 = rng(), sc = 0.85 + rng() * 0.6, ry = rng() * TAU, tn = 1.2 + rng() * 0.36, warm = rng();
    const li = Math.min(N - 1, Math.floor(x) - ox), lj = Math.min(N - 1, Math.floor(z) - oz), ci = li + lj * CW;
    const G = grassA[ci];
    const p = (0.14 + 0.86 * sm(-0.4, 0.3, G)) * (1 - sm(0.3, 0.6, dirtA[ci])) * (0.55 + 0.45 * shade[li + lj * N]);
    if (r > p || blocked(x, z, 0.05)) continue;
    const kind = (G > 0.3 && r2 < 0.55) ? KIND.gTall : (r2 > 0.9 ? KIND.gLeafy : KIND.gShort);
    put(kind, x, hL(li, lj), z, ry, sc, sc * (0.85 + warm * 0.4), sc,
        col[ci * 3] * tn * (1 + warm * 0.12), col[ci * 3 + 1] * tn, col[ci * 3 + 2] * tn * (1 - warm * 0.15));
  }

  /* ---- terrain mesh: flat tile tops plus the little walls between height steps ---- */
  const P = S.pos, Nn = S.nor, Cc = S.col, I = S.idx;
  let v = 0, ii = 0;
  const pv = (x: number, y: number, z: number, nx: number, ny: number, nz: number, r: number, g: number, b: number): void => {
    const o = v * 3;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; Nn[o] = nx; Nn[o + 1] = ny; Nn[o + 2] = nz; Cc[o] = r; Cc[o + 1] = g; Cc[o + 2] = b; v++;
  };
  const qi = (): void => { I[ii++] = v - 4; I[ii++] = v - 3; I[ii++] = v - 2; I[ii++] = v - 4; I[ii++] = v - 2; I[ii++] = v - 1; };
  const WE = PAL.wallEarth;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = hL(i, j), ci = (i + j * CW) * 3;
    const gx = (hL(i + 1, j) - hL(i - 1, j)) * 0.5, gz = (hL(i, j + 1) - hL(i, j - 1)) * 0.5;
    const lit = clamp(1 - (gx * SUNH.x + gz * SUNH.z) * 0.5, 0.8, 1.2) * shade[i + j * N];
    const r = col[ci] * lit, g = col[ci + 1] * lit, b = col[ci + 2] * lit;
    for (let c = 0; c < 4; c++) {
      const di = c >> 1, dj = (c === 1 || c === 2) ? 1 : 0, sx = di ? 1 : -1, sz = dj ? 1 : -1;
      const cnt = (hL(i + sx, j) > h ? 1 : 0) + (hL(i, j + sz) > h ? 1 : 0) + (hL(i + sx, j + sz) > h ? 1 : 0);
      const ao = 1 - 0.085 * cnt;
      pv(i + di, h, j + dj, 0, 1, 0, r * ao, g * ao, b * ao);
    }
    qi();
    for (let e = 0; e < 2; e++) {           // e = 0: edge toward +x, e = 1: edge toward +z
      const hb = e ? hL(i, j + 1) : hL(i + 1, j);
      if (hb === h) continue;
      const hi = Math.max(h, hb), lo = Math.min(h, hb);
      const k = h > hb ? ci : (e ? (i + (j + 1) * CW) * 3 : (i + 1 + j * CW) * 3);
      const tr = col[k] * 0.8, tg = col[k + 1] * 0.8, tb = col[k + 2] * 0.8;
      const deep = hi - lo > 0.5, jt = 0.9 + 0.2 * hash01(ox + i + e * 977, oz + j - e * 311);
      const br = deep ? WE[0] * jt : col[k] * 0.64, bg = deep ? WE[1] * jt : col[k + 1] * 0.64, bb = deep ? WE[2] * jt : col[k + 2] * 0.64;
      if (!e) {
        const x = i + 1;
        if (h > hb) { pv(x, lo, j, 1, 0, 0, br, bg, bb); pv(x, hi, j, 1, 0, 0, tr, tg, tb); pv(x, hi, j + 1, 1, 0, 0, tr, tg, tb); pv(x, lo, j + 1, 1, 0, 0, br, bg, bb); }
        else { pv(x, lo, j, -1, 0, 0, br, bg, bb); pv(x, lo, j + 1, -1, 0, 0, br, bg, bb); pv(x, hi, j + 1, -1, 0, 0, tr, tg, tb); pv(x, hi, j, -1, 0, 0, tr, tg, tb); }
      } else {
        const z = j + 1;
        if (h > hb) { pv(i, lo, z, 0, 0, 1, br, bg, bb); pv(i + 1, lo, z, 0, 0, 1, br, bg, bb); pv(i + 1, hi, z, 0, 0, 1, tr, tg, tb); pv(i, hi, z, 0, 0, 1, tr, tg, tb); }
        else { pv(i, lo, z, 0, 0, -1, br, bg, bb); pv(i, hi, z, 0, 0, -1, tr, tg, tb); pv(i + 1, hi, z, 0, 0, -1, tr, tg, tb); pv(i + 1, lo, z, 0, 0, -1, br, bg, bb); }
      }
      qi();
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P.slice(0, v * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(Nn.slice(0, v * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(Cc.slice(0, v * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(I.slice(0, ii), 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, matTerrain);
  mesh.position.set(ox, 0, oz);
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  mesh.receiveShadow = true;

  for (let k = 0; k < inst.length; k++) {
    const d = inst[k] as InstDraft | null;
    if (d) inst[k] = { m: new Float32Array(d.m), c: new Float32Array(d.c), n: d.c.length / 3 };
  }
  return { cx: cx, cz: cz, mesh: mesh, inst: inst as (InstData | null)[], colliders: new Float32Array(colliders) };
}
