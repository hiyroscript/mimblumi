import * as THREE from 'three';
import { CFG, TAU } from '../config';
import { damp } from '../math/util';
import { FWD, RIGHT } from '../render/lights';
import { Fields } from '../world/fields';
import { World } from '../world/worldManager';
import { Rig } from '../camera/rig';

/* ============================================================
   FLYOVER — the camera drifting on its own over the Home Screen's world
   ============================================================
   No player, no input: a point on the ground glides at CFG.home.scrollSpeed in one direction, the camera
   follows it at CFG.home.cameraZoom with the game's own pitch, and turns slowly from side to side. Chunks
   stream in ahead of it through World.update(), exactly as they do ahead of a walking player.
*/

const H = CFG.home;
/* How far ahead the ground is sampled to set the glide height, so the camera rides over bumps instead of
   following each one. */
const LOOK_AHEAD = [0, 6, 12, 18];

const dir = new THREE.Vector3();
function groundAhead(x: number, z: number): number {
  let h = 0;
  for (const a of LOOK_AHEAD) h += Fields.ground(x + dir.x * a, z + dir.z * a);
  return h / LOOK_AHEAD.length;
}

export const Flyover = {
  active: false,
  /** The ground point the camera looks at. */
  ct: new THREE.Vector3(),
  /** Seconds since start(). */
  t: 0,

  /** Start gliding from (x, z). The world around it should already be built (World.build). */
  start(x: number, z: number): void {
    const a = H.direction;
    dir.copy(FWD).multiplyScalar(Math.cos(a)).addScaledVector(RIGHT, Math.sin(a)).normalize();
    this.ct.set(x, 0, z);
    this.ct.y = groundAhead(x, z);
    this.t = 0;
    this.active = true;
    this.update(0);
  },

  stop(): void { this.active = false; },

  /** Move on by `dt` seconds and place the camera; returns the camera distance (for lightFollow). */
  update(dt: number): number {
    const c = this.ct;
    if (this.active && dt > 0) {
      this.t += dt;
      c.x += dir.x * H.scrollSpeed * dt;
      c.z += dir.z * H.scrollSpeed * dt;
      c.y = damp(c.y, groundAhead(c.x, c.z), 1.2, dt);
      World.update(c.x, c.z, dir.x, dir.z);
    }
    const s = H.swayYaw * Math.sin(this.t * TAU / H.swayPeriod);
    const cs = Math.cos(s), sn = Math.sin(s);
    const d = H.cameraZoom * (Rig.portrait ? 1.1 : 1);
    Rig.aim(c, H.cameraZoom, d, FWD.x * cs + RIGHT.x * sn, FWD.z * cs + RIGHT.z * sn);
    return d;
  }
};
