import type * as THREE from 'three';
import { CFG, CH } from '../config';
import { makeChunk } from './chunk';
import type { Chunk } from './chunk';
import { pools } from '../render/pools';
import { scene } from '../render/renderer';

/* ============================================================
   8. CHUNK MANAGER — load ahead of the player, drop what falls behind
   ============================================================ */

interface ChunkRequest { k: string; cx: number; cz: number; d: number }

export const World = {
  chunks: new Map<string, Chunk>(), queue: [] as ChunkRequest[], sig: '', dirty: false, wait: 0, pcx: 0, pcz: 0,
  key: (cx: number, cz: number): string => cx + ',' + cz,
  plan(px: number, pz: number, dx: number, dz: number): void {
    const pcx = Math.floor(px / CH), pcz = Math.floor(pz / CH);
    const acx = Math.floor((px + dx * CH) / CH), acz = Math.floor((pz + dz * CH) / CH);
    const sig = pcx + ',' + pcz + ',' + acx + ',' + acz;
    if (sig === this.sig) return;
    this.sig = sig; this.pcx = pcx; this.pcz = pcz;
    for (const [k, ch] of this.chunks) {
      if (Math.max(Math.abs(ch.cx - pcx), Math.abs(ch.cz - pcz)) > CFG.keepR) {
        scene.remove(ch.mesh); ch.mesh.geometry.dispose(); this.chunks.delete(k); this.dirty = true;
      }
    }
    const want = new Map<string, ChunkRequest>(), R = CFG.loadR;
    for (const c of [[pcx, pcz], [acx, acz]])
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        const cx = c[0] + i, cz = c[1] + j, k = this.key(cx, cz);
        if (!this.chunks.has(k) && !want.has(k)) want.set(k, { k: k, cx: cx, cz: cz, d: (cx - pcx) * (cx - pcx) + (cz - pcz) * (cz - pcz) });
      }
    this.queue = Array.from(want.values()).sort((a, b) => a.d - b.d);
  },
  step(): boolean {                          // at most one new chunk per frame
    while (this.queue.length) {
      const q = this.queue.shift() as ChunkRequest;
      if (this.chunks.has(q.k) || Math.max(Math.abs(q.cx - this.pcx), Math.abs(q.cz - this.pcz)) > CFG.keepR) continue;
      const ch = makeChunk(q.cx, q.cz);
      this.chunks.set(q.k, ch); scene.add(ch.mesh); this.dirty = true;
      return true;
    }
    return false;
  },
  update(px: number, pz: number, dx: number, dz: number): void {
    this.plan(px, pz, dx, dz);
    this.step();
    if (this.dirty && (this.queue.length === 0 || ++this.wait >= 8)) this.refill();
  },
  /* Copy every loaded chunk's instances into the shared pools, nearest chunks first. */
  refill(): void {
    this.dirty = false; this.wait = 0;
    const list = Array.from(this.chunks.values());
    const pcx = this.pcx, pcz = this.pcz;
    list.sort((a, b) => ((a.cx - pcx) * (a.cx - pcx) + (a.cz - pcz) * (a.cz - pcz)) - ((b.cx - pcx) * (b.cx - pcx) + (b.cz - pcz) * (b.cz - pcz)));
    for (let k = 0; k < pools.length; k++) {
      const m = pools[k], ic = m.instanceColor as THREE.InstancedBufferAttribute;   // every pool has one (see addPool)
      const cap = m.userData.cap as number, ma = m.instanceMatrix.array as Float32Array, ca = ic.array as Float32Array;
      let off = 0;
      for (let c = 0; c < list.length && off < cap; c++) {
        const d = list[c].inst[k];
        if (!d) continue;
        const n = Math.min(d.n, cap - off);
        ma.set(n === d.n ? d.m : d.m.subarray(0, n * 16), off * 16);
        ca.set(n === d.n ? d.c : d.c.subarray(0, n * 3), off * 3);
        off += n;
      }
      m.count = off;
      m.instanceMatrix.updateRange.offset = 0; m.instanceMatrix.updateRange.count = Math.max(16, off * 16);
      ic.updateRange.offset = 0; ic.updateRange.count = Math.max(3, off * 3);
      m.instanceMatrix.needsUpdate = true; ic.needsUpdate = true;
    }
  },
  /* Push a circle out of trunks, bushes and boulders nearby. */
  collide(pos: THREE.Vector3, pr: number): void {
    const pcx = Math.floor(pos.x / CH), pcz = Math.floor(pos.z / CH);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const ch = this.chunks.get(this.key(pcx + i, pcz + j));
      if (!ch) continue;
      const c = ch.colliders;
      for (let k = 0; k < c.length; k += 3) {
        const dx = pos.x - c[k], dz = pos.z - c[k + 1], rr = c[k + 2] + pr, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2), push = (rr - d) / d; pos.x += dx * push; pos.z += dz * push; }
      }
    }
  }
};
