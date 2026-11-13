import * as THREE from 'three';
import { renderer, scene, camera } from './render/renderer';
import { FWD, RIGHT, lightFollow } from './render/lights';
import { U } from './render/materials';
import { World } from './world/worldManager';
import { Player } from './player/player';
import { Rig } from './camera/rig';
import { Input } from './input/input';
import { Perf } from './perf';
import { Flyover } from './home/flyover';

/* ============================================================
   13. BOOT + LOOP
   ============================================================ */
const _in = { x: 0, y: 0 }, _p = new THREE.Vector3(), _buf = new THREE.Vector2();
let last = 0, time = 0;

/**
 * What the frame loop is doing:
 * - 'home': the Home Screen. The flyover moves the camera over the world; no player, no input.
 * - 'game': the game, as it always played: input moves the player and the camera follows.
 * - 'paused': nothing is updated or drawn, while a white cover hides the world being swapped.
 */
export type LoopState = 'home' | 'game' | 'paused';
let state: LoopState = 'game';
let running = false;

export function setLoopState(s: LoopState): void { state = s; }
export function loopState(): LoopState { return state; }

/** The game: input moves the player, the world loads around them, the camera follows. */
function gameFrame(dt: number): void {
  Input.read(_in);
  const mag = Math.min(1, Math.hypot(_in.x, _in.y));
  let dx = 0, dz = 0;
  if (mag > 0) {                              // screen drag -> ground direction relative to the camera
    dx = (RIGHT.x * _in.x - FWD.x * _in.y) / mag; dz = (RIGHT.z * _in.x - FWD.z * _in.y) / mag;
  }
  Player.update(dt, dx, dz, mag, time);

  const sp = Player.speed;
  World.update(Player.pos.x, Player.pos.z, sp > 0.5 ? Player.vel.x / sp : 0, sp > 0.5 ? Player.vel.z / sp : 0);

  const d = Rig.update(dt);
  lightFollow(d);

  /* Where the player sits on screen, for the see-through window in tree canopies. */
  camera.updateMatrixWorld();
  _p.set(Player.pos.x, Player.pos.y + 0.95, Player.pos.z);
  const depth = -_p.clone().applyMatrix4(camera.matrixWorldInverse).z;
  _p.project(camera);
  renderer.getDrawingBufferSize(_buf);
  U.uObs.value.set((_p.x * 0.5 + 0.5) * _buf.x, (_p.y * 0.5 + 0.5) * _buf.y, depth,
                   1.7 / (depth * Math.tan(camera.fov * Math.PI / 360)) * _buf.y * 0.5);
}

/** No see-through window in the canopies: nothing is ever nearer than this depth. */
export function clearCanopyWindow(): void { U.uObs.value.set(0, 0, -1e6, 1); }

/** The Home Screen: the flyover glides on and streams chunks ahead of itself. */
function homeFrame(dt: number): void {
  lightFollow(Flyover.update(dt));
  clearCanopyWindow();
}

function frame(ms: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (ms - last) / 1000) || 0.016);
  last = ms; time += dt;
  if (state === 'paused') return;

  if (state === 'home') homeFrame(dt); else gameFrame(dt);
  U.uTime.value = time;

  renderer.render(scene, camera);
  Perf.tick(dt);
}

/** Start the animation loop in state `s` (the game, unless the Home Screen is up); the first frame's timestamp becomes the time origin. */
export function startLoop(s: LoopState = 'game'): void {
  state = s;
  if (running) return;
  running = true;
  requestAnimationFrame(t => { last = t; frame(t); });
}
