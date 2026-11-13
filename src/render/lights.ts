import * as THREE from 'three';
import { CFG } from '../config';
import { AXY } from '../geometry/GeoB';
import { COARSE } from './renderer';
import { Rig } from '../camera/rig';

/* Camera basis on the ground plane (the camera never rotates, so these are constant). */
export const FWD = new THREE.Vector3(-Math.sin(CFG.yaw), 0, -Math.cos(CFG.yaw));
export const RIGHT = new THREE.Vector3(Math.cos(CFG.yaw), 0, -Math.sin(CFG.yaw));
export const SUN = new THREE.Vector3().addScaledVector(RIGHT, -0.72).addScaledVector(FWD, 0.25).add(new THREE.Vector3(0, 0.95, 0)).normalize();
export const SUNH = (() => { const l = Math.hypot(SUN.x, SUN.z); return { x: SUN.x / l, z: SUN.z / l }; })();

export let hemi!: THREE.HemisphereLight;
export let sun!: THREE.DirectionalLight;
export let bounce!: THREE.DirectionalLight;
export let SHADOW_RES!: number;

/** Create the sky/ground fill, the shadow-casting sun and the bounce light, and add them to the scene. */
export function initLights(scene: THREE.Scene): void {
  hemi = new THREE.HemisphereLight(new THREE.Color(0xe3e8ee).convertSRGBToLinear(), new THREE.Color(0x77724f).convertSRGBToLinear(), 0.56);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(new THREE.Color(0xffe3b6).convertSRGBToLinear(), 1.0);
  sun.castShadow = true;
  SHADOW_RES = COARSE ? 1536 : 2048;
  sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.035;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 260;
  scene.add(sun); scene.add(sun.target);
  bounce = new THREE.DirectionalLight(new THREE.Color(0xb9c9d6).convertSRGBToLinear(), 0.14); // cool fill from the far side
  bounce.position.set(-SUN.x, 0.6, -SUN.z);
  scene.add(bounce);
}

/* Light-space axes, used to move the shadow frustum in whole texels (no shimmer while walking). */
export const L_X = new THREE.Vector3().crossVectors(AXY, SUN).normalize();
export const L_Y = new THREE.Vector3().crossVectors(SUN, L_X).normalize();
let shadowExt = 0;
const _lp = new THREE.Vector3();

/** Fit the sun's shadow frustum to the view at camera distance d, snapped to whole shadow-map texels. */
export function lightFollow(d: number): void {
  const ext = Math.ceil(d * 1.65 / 8) * 8;
  const cam = sun.shadow.camera;
  if (ext !== shadowExt) { shadowExt = ext; cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext; cam.updateProjectionMatrix(); }
  const texel = 2 * ext / SHADOW_RES;
  _lp.copy(Rig.focus).addScaledVector(FWD, d * 0.32);
  const a = Math.round(_lp.dot(L_X) / texel) * texel, b = Math.round(_lp.dot(L_Y) / texel) * texel, c = _lp.dot(SUN);
  _lp.set(0, 0, 0).addScaledVector(L_X, a).addScaledVector(L_Y, b).addScaledVector(SUN, c);
  sun.target.position.copy(_lp);
  sun.position.copy(_lp).addScaledVector(SUN, 120);
  sun.target.updateMatrixWorld();
}
