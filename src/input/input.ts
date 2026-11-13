import { CFG } from '../config';
import { clamp } from '../math/util';
import { Rig } from '../camera/rig';
import { focusGame } from './embed';

/* ============================================================
   11. INPUT — drag anywhere to walk, two fingers to zoom, nothing drawn on screen
   ============================================================ */

interface Point { x: number; y: number }

export const Input = {
  pts: new Map<number, Point>(), moveId: null as number | null, ax: 0, ay: 0, mx: 0, my: 0, pinch0: 0, zoom0: 0, keys: new Set<string>(),
  init(el: HTMLElement): void {
    const opt = { passive: false };
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      focusGame();                          // embedded (itch.io), the keys follow the press into the game
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pts.size === 1) { this.moveId = e.pointerId; this.ax = e.clientX; this.ay = e.clientY; this.mx = this.my = 0; }
      else if (this.pts.size === 2) { this.moveId = null; this.mx = this.my = 0; this.pinch0 = this.spread(); this.zoom0 = Rig.want; }
    }, opt);
    el.addEventListener('pointermove', e => {
      const p = this.pts.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      p.x = e.clientX; p.y = e.clientY;
      if (this.pts.size >= 2) {
        const d = this.spread();
        if (this.pinch0 > 8 && d > 8) Rig.want = clamp(this.zoom0 * this.pinch0 / d, CFG.zoomMin, CFG.zoomMax);
      } else if (e.pointerId === this.moveId) {
        const R = clamp(Math.min(Rig.w, Rig.h) * 0.17, 56, 120);
        let dx = p.x - this.ax, dy = p.y - this.ay, len = Math.hypot(dx, dy);
        if (len > R) {                      // the anchor trails the finger, so reversing direction is instant
          this.ax += dx * (1 - R / len); this.ay += dy * (1 - R / len);
          dx = p.x - this.ax; dy = p.y - this.ay; len = R;
        }
        const dead = 0.1, m = len / R;
        if (m < dead) { this.mx = this.my = 0; }
        else { const k = ((m - dead) / (1 - dead)) / len; this.mx = dx * k; this.my = dy * k; }
      }
    }, opt);
    const up = (e: PointerEvent): void => {
      if (!this.pts.delete(e.pointerId)) return;
      if (e.pointerId === this.moveId) { this.moveId = null; this.mx = this.my = 0; }
      if (this.pts.size === 1) {            // pinch ended: the finger left down starts a fresh drag from where it is
        const [id, p] = this.pts.entries().next().value as [number, Point];
        this.moveId = id; this.ax = p.x; this.ay = p.y; this.mx = this.my = 0;
      } else if (this.pts.size >= 2) { this.pinch0 = this.spread(); this.zoom0 = Rig.want; }
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    el.addEventListener('wheel', e => { e.preventDefault(); Rig.want = clamp(Rig.want * Math.exp(e.deltaY * 0.0012), CFG.zoomMin, CFG.zoomMax); }, opt);
    for (const ev of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'contextmenu', 'dblclick', 'selectstart'])
      el.addEventListener(ev, e => e.preventDefault(), opt);
    window.addEventListener('keydown', e => { if (KEYMAP[e.code]) { this.keys.add(e.code); e.preventDefault(); } });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.pts.clear(); this.moveId = null; this.mx = this.my = 0; });
  },
  /** Distance between the first two pointers. */
  spread(): number { const it = this.pts.values(), a = it.next().value as Point, b = it.next().value as Point; return Math.hypot(a.x - b.x, a.y - b.y); },
  /* Screen-space intent (x right, y down), length 0..1. */
  read(out: Point): void {
    let x = this.mx, y = this.my;
    if (!x && !y && this.keys.size) {
      for (const k of this.keys) { const m = KEYMAP[k]; if (m && m.length) { x += m[0]; y += m[1]; } }
      const l = Math.hypot(x, y);
      if (l > 0) { const m = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) ? 1 : 0.5; x = x / l * m; y = y / l * m; }
    }
    out.x = x; out.y = y;
  }
};
/** Key code → screen direction [x, y]. Shift has no direction; it only turns walking into running. */
export const KEYMAP: Record<string, number[] | undefined> = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0], ShiftLeft: [], ShiftRight: [] };
