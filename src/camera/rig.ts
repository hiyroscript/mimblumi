import * as THREE from 'three';
import { CFG } from '../config';
import { clamp, lerp, sm, damp } from '../math/util';
import { stage } from '../dom';
import { renderer, camera, fog } from '../render/renderer';
import { FWD } from '../render/lights';
import { Player } from '../player/player';
import { Perf } from '../perf';

/* ============================================================
   10. CAMERA RIG — fixed heading, high angle, smooth follow, pinch zoom
   ============================================================ */
export const Rig = {
  dist: CFG.zoom, want: CFG.zoom, ct: new THREE.Vector3(), focus: new THREE.Vector3(), portrait: false, w: 1, h: 1,
  snap(): void { this.ct.copy(Player.pos); this.dist = this.want; },
  resize(): void {
    const r = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    this.w = w; this.h = h; this.portrait = h > w;
    renderer.setPixelRatio(Perf.pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    /* Keep the horizontal view near 34 degrees, so portrait screens gain height instead of losing width. */
    camera.fov = clamp(2 * Math.atan(Math.tan(17 * Math.PI / 180) / camera.aspect) * 180 / Math.PI, 34, 58);
    camera.updateProjectionMatrix();
  },
  /** Move the camera for this frame; returns the effective camera distance. */
  update(dt: number): number {
    this.dist = damp(this.dist, this.want, 9, dt);
    const d = this.dist * (this.portrait ? 1.1 : 1);
    const p = Player.pos, v = Player.vel;
    this.ct.x = damp(this.ct.x, p.x + v.x * 0.3, 6, dt);
    this.ct.z = damp(this.ct.z, p.z + v.z * 0.3, 6, dt);
    this.ct.y = damp(this.ct.y, p.y, 3, dt);
    this.aim(this.ct, this.dist, d, FWD.x, FWD.z);
    return d;
  },
  /**
   * Place the camera looking at ground point `ct` from distance `d`, heading along the ground direction
   * (fx, fz). `zoom` sets the pitch, as the game's zoom does. Also moves the fog and sets `focus`, which
   * the shadow frustum follows. The game always heads along FWD; the Home Screen's flyover sways a little.
   */
  aim(ct: THREE.Vector3, zoom: number, d: number, fx: number, fz: number): void {
    const pitch = lerp(0.86, 0.96, sm(CFG.zoomMin, CFG.zoomMax, zoom));   // closer in, the view drops a little
    const ch = Math.cos(pitch) * d, cv = Math.sin(pitch) * d;
    this.focus.copy(ct); this.focus.x += fx * (d * 0.1); this.focus.z += fz * (d * 0.1); this.focus.y += 0.9;
    camera.position.set(this.focus.x - fx * ch, this.focus.y + cv, this.focus.z - fz * ch);
    camera.lookAt(this.focus);
    fog.near = d * 0.95; fog.far = d * 4.6;
  }
};
