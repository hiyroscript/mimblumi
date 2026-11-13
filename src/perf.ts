import { Rig } from './camera/rig';

/* ============================================================
   12. PERFORMANCE — drop render resolution if the device cannot hold the frame rate
   ============================================================ */
export const Perf = {
  pr: Math.min(window.devicePixelRatio || 1, 2), acc: 0, n: 0, warm: 3,
  tick(dt: number): void {
    if (this.warm > 0) { this.warm -= dt; return; }
    this.acc += dt; this.n++;
    if (this.acc < 2) return;
    const avg = this.acc / this.n; this.acc = 0; this.n = 0;
    if (avg > 0.027 && this.pr > 0.85) { this.pr = Math.max(0.85, this.pr - 0.25); Rig.resize(); this.warm = 1; }
  }
};
