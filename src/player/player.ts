import * as THREE from 'three';
import { CFG, TAU } from '../config';
import { lerp, sm, damp } from '../math/util';
import { mulberry32 } from '../math/random';
import { rgb, mul } from '../color';
import type { RGB } from '../color';
import { GeoB } from '../geometry/GeoB';
import type { BoxOpts } from '../geometry/GeoB';
import { Fields } from '../world/fields';
import { World } from '../world/worldManager';
import { scene } from '../render/renderer';
import { matPlayer } from '../render/materials';

/* ============================================================
   9. PLAYER — model, movement, procedural animation
   ============================================================ */
export class PlayerState {
  root = new THREE.Group(); pos = new THREE.Vector3(0.5, 0, 0.5); vel = new THREE.Vector3(); yaw = Math.PI * 0.75; speed = 0; ph = 0; scale = 1.12;

  /* Joints, created by build(). */
  body!: THREE.Group; torso!: THREE.Group; head!: THREE.Group;
  armL!: THREE.Group; elbowL!: THREE.Group; armR!: THREE.Group; elbowR!: THREE.Group;
  legL!: THREE.Group; kneeL!: THREE.Group; legR!: THREE.Group; kneeR!: THREE.Group;
  /** Soft contact shadow under the feet. */
  blob!: THREE.Mesh;

  build(): void {
    const rng = mulberry32(7);
    const C = { tunic: rgb(0xb5553c), tunicD: rgb(0x8f4230), scarf: rgb(0xe6d5a8), trouser: rgb(0x4a4034), boot: rgb(0x33291f),
                skin: rgb(0xe0b48e), hair: rgb(0x2e2520), belt: rgb(0x5c4630), eye: rgb(0x231c18) };
    const part = (fn: (g: GeoB) => void): THREE.Mesh => { const g = new GeoB(rng); fn(g); const m = new THREE.Mesh(g.build(), matPlayer); m.castShadow = true; m.receiveShadow = true; return m; };
    const B = (g: GeoB, x: number, y: number, z: number, w: number, h: number, d: number, c: RGB, o?: Partial<BoxOpts>): void => g.box(Object.assign({ x: x, y: y, z: z, w: w, h: h, d: d, c: c, shade: 0.82, fj: 0.04 }, o || {}));

    const body = this.body = new THREE.Group(); body.position.y = 0.8; this.root.add(body);
    const torso = this.torso = new THREE.Group(); body.add(torso);
    torso.add(part(g => {
      B(g, 0, 0.04, 0, 0.47, 0.17, 0.31, C.tunicD, { taper: 0.9 });
      B(g, 0, 0.3, 0, 0.4, 0.42, 0.25, C.tunic, { taper: 1.1, c2: mul(C.tunic, 1.08) });
      B(g, 0, 0.13, 0, 0.44, 0.06, 0.29, C.belt);
      B(g, 0, 0.545, 0, 0.36, 0.11, 0.31, C.scarf, { ry: 0.1 });
      B(g, -0.09, 0.42, -0.165, 0.11, 0.24, 0.05, mul(C.scarf, 0.92), { rz: 0.12 });
    }));
    const head = this.head = new THREE.Group(); head.position.y = 0.58; torso.add(head);
    head.add(part(g => {
      B(g, 0, 0.2, 0, 0.38, 0.36, 0.36, C.skin, { taper: 0.95, shade: 0.9 });
      B(g, 0, 0.39, -0.01, 0.43, 0.13, 0.41, C.hair, { taper: 0.9, c2: mul(C.hair, 1.5) });
      B(g, 0, 0.22, -0.17, 0.42, 0.34, 0.1, C.hair);
      B(g, 0.2, 0.27, -0.04, 0.05, 0.24, 0.3, C.hair);
      B(g, -0.2, 0.27, -0.04, 0.05, 0.24, 0.3, C.hair);
      B(g, 0.03, 0.335, 0.185, 0.4, 0.1, 0.05, C.hair, { rz: 0.08 });
      B(g, 0.085, 0.2, 0.182, 0.05, 0.07, 0.012, C.eye, { fj: 0 });
      B(g, -0.085, 0.2, 0.182, 0.05, 0.07, 0.012, C.eye, { fj: 0 });
    }));
    const arm = (side: number): [THREE.Group, THREE.Group] => {
      const sh = new THREE.Group(); sh.position.set(0.285 * side, 0.47, 0); torso.add(sh);
      sh.add(part(g => B(g, 0, -0.125, 0, 0.135, 0.28, 0.15, C.tunic, { taper: 1.08 })));
      const el = new THREE.Group(); el.position.y = -0.25; sh.add(el);
      el.add(part(g => { B(g, 0, -0.1, 0, 0.11, 0.21, 0.12, C.skin); B(g, 0, -0.235, 0.005, 0.12, 0.09, 0.13, mul(C.skin, 0.93)); }));
      return [sh, el];
    };
    const leg = (side: number): [THREE.Group, THREE.Group] => {
      const hip = new THREE.Group(); hip.position.set(0.115 * side, 0, 0); body.add(hip);
      hip.add(part(g => B(g, 0, -0.19, 0, 0.175, 0.4, 0.195, C.trouser)));
      const kn = new THREE.Group(); kn.position.y = -0.38; hip.add(kn);
      kn.add(part(g => { B(g, 0, -0.15, 0, 0.15, 0.3, 0.17, mul(C.trouser, 0.94)); B(g, 0, -0.345, 0.04, 0.18, 0.13, 0.28, C.boot, { c2: mul(C.boot, 1.3) }); }));
      return [hip, kn];
    };
    [this.armL, this.elbowL] = arm(1); [this.armR, this.elbowR] = arm(-1);
    [this.legL, this.kneeL] = leg(1); [this.legR, this.kneeR] = leg(-1);
    this.root.scale.setScalar(this.scale);
    scene.add(this.root);

    /* Soft contact shadow under the feet. */
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d') as CanvasRenderingContext2D, gr = cx.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    const blob = this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, color: 0x1a1f12, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    blob.rotation.x = -Math.PI / 2; blob.renderOrder = 1;
    scene.add(blob);
  }
  place(x: number, z: number): void { this.pos.set(x, Fields.ground(x, z), z); this.vel.set(0, 0, 0); }
  update(dt: number, dirX: number, dirZ: number, mag: number, time: number): void {
    const target = mag <= 0 ? 0 : (mag < 0.5 ? CFG.walk * (mag / 0.5) : CFG.walk + (CFG.run - CFG.walk) * ((mag - 0.5) / 0.5));
    const rate = target > 0 ? 9 : 11;
    this.vel.x = damp(this.vel.x, dirX * target, rate, dt);
    this.vel.z = damp(this.vel.z, dirZ * target, rate, dt);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    World.collide(this.pos, 0.3);
    this.pos.y = damp(this.pos.y, Fields.ground(this.pos.x, this.pos.z), 16, dt);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.speed > 0.2) {
      let d = Math.atan2(this.vel.x, this.vel.z) - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-12 * dt));
    }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.blob.position.set(this.pos.x, this.pos.y + 0.04, this.pos.z);
    this.animate(dt, time);
  }
  animate(dt: number, t: number): void {
    const sp = this.speed, mv = sm(0.05, 1.2, sp), run = sm(3.2, 6.2, sp), idle = 1 - mv;
    this.ph += sp * dt * TAU / (lerp(1.9, 3.5, run) * this.scale);    // phase follows distance, so feet do not skate
    const s = Math.sin(this.ph), c = Math.cos(this.ph), br = Math.sin(t * 1.9);
    const A = lerp(0.5, 0.95, run) * mv, K = lerp(0.6, 1.5, run) * mv, B = lerp(0.42, 1.0, run) * mv;
    this.legL.rotation.x = -s * A; this.legR.rotation.x = s * A;
    this.kneeL.rotation.x = K * Math.max(0, c) + 0.04; this.kneeR.rotation.x = K * Math.max(0, -c) + 0.04;
    this.armL.rotation.x = s * B; this.armR.rotation.x = -s * B;
    this.armL.rotation.z = 0.09 + idle * 0.02 * br; this.armR.rotation.z = -0.09 - idle * 0.02 * br;
    const eb = -(0.12 + 0.25 * mv + 1.05 * run);
    this.elbowL.rotation.x = eb - Math.max(0, s) * 0.25 * mv; this.elbowR.rotation.x = eb - Math.max(0, -s) * 0.25 * mv;
    this.body.position.y = 0.8 - mv * (0.025 + 0.05 * run) * (0.5 + 0.5 * Math.cos(2 * this.ph)) + idle * 0.008 * br;
    this.body.rotation.x = mv * (0.05 + 0.2 * run);
    this.torso.rotation.y = -s * 0.14 * mv; this.torso.rotation.z = c * 0.03 * mv;
    this.torso.scale.y = 1 + idle * 0.014 * br;
    this.head.rotation.y = idle * 0.22 * Math.sin(t * 0.45) + s * 0.07 * mv;
    this.head.rotation.x = -run * 0.12 + idle * 0.03 * Math.sin(t * 0.8);
  }
}

/**
 * The one player. It is created by createPlayer() after the instance pools, exactly where the
 * original script created it, so three.js objects keep their original creation order.
 */
export let Player!: PlayerState;
export function createPlayer(): void { Player = new PlayerState(); }
