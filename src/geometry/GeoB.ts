import * as THREE from 'three';
import type { RGB } from '../color';
import type { Rng } from '../math/random';

/* ============================================================
   3. GEOMETRY BUILDER  (chunky boxes with tapered, nudged corners; flat quads for leaves)
   ============================================================ */

/**
 * Options for GeoB.box.
 * x,y,z centre; w,h,d size; c colour; c2 top colour; taper; rx,ry,rz or q; jit; shade; fj; noBottom; noTop
 */
export interface BoxOpts {
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  /** Bottom colour (and top colour when c2 is not set). */
  c: RGB;
  /** Top colour. */
  c2?: RGB;
  /** Scale of the top face relative to the bottom (default 1). */
  taper?: number;
  rx?: number; ry?: number; rz?: number;
  /** Rotation; takes precedence over rx/ry/rz. */
  q?: THREE.Quaternion;
  /** Random corner jitter, as a fraction of the size. */
  jit?: number;
  /** Brightness of the bottom corners (default 0.8). */
  shade?: number;
  /** Random per-face brightness jitter (default 0.07). */
  fj?: number;
  noBottom?: boolean;
  noTop?: boolean;
}

export const FACES = [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]];
const _v = new THREE.Vector3(), _e = new THREE.Euler(), _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
export const AXY = new THREE.Vector3(0, 1, 0), AXZ = new THREE.Vector3(0, 0, 1);
const _cs = new Float32Array(24);

export class GeoB {
  rng: Rng; p: number[]; n: number[]; c: number[]; i: number[]; v: number;
  constructor(rng: Rng) { this.rng = rng; this.p = []; this.n = []; this.c = []; this.i = []; this.v = 0; }
  _quad(): void { const v = this.v; this.i.push(v, v + 1, v + 2, v, v + 2, v + 3); this.v += 4; }
  /* o: x,y,z centre; w,h,d size; c colour; c2 top colour; taper; rx,ry,rz or q; jit; shade; fj; noBottom; noTop */
  box(o: BoxOpts): void {
    const rng = this.rng, hw = o.w / 2, hh = o.h / 2, hd = o.d / 2;
    const tp = o.taper == null ? 1 : o.taper, jit = o.jit || 0;
    const q = o.q || ((o.rx || o.ry || o.rz) ? _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0)) : null);
    for (let k = 0; k < 8; k++) {
      const top = k & 2;
      let x = (k & 1 ? hw : -hw) * (top ? tp : 1), y = top ? hh : -hh, z = (k & 4 ? hd : -hd) * (top ? tp : 1);
      if (jit) { x += (rng() - 0.5) * jit * o.w; y += (rng() - 0.5) * jit * o.h; z += (rng() - 0.5) * jit * o.d; }
      if (q) { _v.set(x, y, z).applyQuaternion(q); x = _v.x; y = _v.y; z = _v.z; }
      _cs[k * 3] = x + o.x; _cs[k * 3 + 1] = y + o.y; _cs[k * 3 + 2] = z + o.z;
    }
    const cb = o.c, ct = o.c2 || o.c, sh = o.shade == null ? 0.8 : o.shade, fj = o.fj == null ? 0.07 : o.fj;
    for (let f = 0; f < 6; f++) {
      if ((f === 3 && o.noBottom) || (f === 2 && o.noTop)) continue;
      const F = FACES[f], a = F[0] * 3, b = F[1] * 3, c = F[2] * 3;
      const ux = _cs[b] - _cs[a], uy = _cs[b + 1] - _cs[a + 1], uz = _cs[b + 2] - _cs[a + 2];
      const vx = _cs[c] - _cs[a], vy = _cs[c + 1] - _cs[a + 1], vz = _cs[c + 2] - _cs[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const fm = 1 + (rng() - 0.5) * fj;
      for (let m = 0; m < 4; m++) {
        const k = F[m], top = k & 2, col = top ? ct : cb, mu = (top ? 1 : sh) * fm;
        this.p.push(_cs[k * 3], _cs[k * 3 + 1], _cs[k * 3 + 2]);
        this.n.push(nx, ny, nz);
        this.c.push(col[0] * mu, col[1] * mu, col[2] * mu);
      }
      this._quad();
    }
  }
  /* A box grown from a base point along a tilted direction. Returns the far end. */
  limb(bx: number, by: number, bz: number, az: number, tilt: number, len: number, w: number, c: RGB, extra?: Partial<BoxOpts>): [number, number, number] {
    _qa.setFromAxisAngle(AXY, az).multiply(_qb.setFromAxisAngle(AXZ, -tilt));
    const dx = Math.sin(tilt) * Math.cos(az), dy = Math.cos(tilt), dz = -Math.sin(tilt) * Math.sin(az);
    this.box(Object.assign({ x: bx + dx * len / 2, y: by + dy * len / 2, z: bz + dz * len / 2, w: w, h: len, d: w, c: c, q: _qa }, extra || {}));
    return [bx + dx * len, by + dy * len, bz + dz * len];
  }
  /* Flat quad lit as if it faced the sky, so leaves and petals shade like the ground they sit on. */
  quad(pts: number[], c0: RGB, c1: RGB, c2: RGB, c3: RGB): void {
    const cs = [c0, c1, c2, c3];
    for (let m = 0; m < 4; m++) {
      this.p.push(pts[m * 3], pts[m * 3 + 1], pts[m * 3 + 2]);
      this.n.push(0, 1, 0);
      this.c.push(cs[m][0], cs[m][1], cs[m][2]);
    }
    this._quad();
  }
  petal(cx: number, cy: number, cz: number, a: number, r0: number, len: number, wi: number, wo: number, lift: number, c: RGB, ct: RGB): void {
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    const ix = cx + dx * r0, iz = cz + dz * r0, ox = cx + dx * (r0 + len), oz = cz + dz * (r0 + len);
    this.quad([ix + px * wi, cy, iz + pz * wi, ix - px * wi, cy, iz - pz * wi,
               ox - px * wo, cy + lift, oz - pz * wo, ox + px * wo, cy + lift, oz + pz * wo], c, c, ct, ct);
  }
  blade(bx: number, bz: number, a: number, h: number, w: number, lean: number): void {
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz * w / 2, pz = dx * w / 2;
    const mx = bx + dx * lean * 0.35, mz = bz + dz * lean * 0.35, my = h * 0.55;
    const v = this.v;
    this.p.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz,
                mx - px * 0.75, my, mz - pz * 0.75, mx + px * 0.75, my, mz + pz * 0.75,
                bx + dx * lean, h, bz + dz * lean);
    for (let m = 0; m < 5; m++) this.n.push(0, 1, 0);
    this.c.push(0.56, 0.6, 0.52, 0.56, 0.6, 0.52, 0.9, 0.93, 0.84, 0.9, 0.93, 0.84, 1.2, 1.2, 0.98);
    this.i.push(v, v + 1, v + 3, v, v + 3, v + 2, v + 2, v + 3, v + 4);
    this.v += 5;
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}
