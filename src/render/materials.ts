import * as THREE from 'three';
import { REDUCED } from './renderer';
import {
  MAIN_OPEN, PROJECT_VERTEX, BEGIN_VERTEX,
  TREE_VERT_MAIN, TREE_VERT_PROJECT, TREE_FRAG_MAIN,
  VEG_VERT_MAIN, VEG_VERT_BEGIN, FRONT_FACING, FRONT_FACING_ALWAYS
} from './shaders';

/* ---------- Materials ---------- */

/** Uniforms shared by the patched shaders and updated every frame. */
export interface SharedUniforms {
  uTime: THREE.IUniform<number>;
  uWind: THREE.IUniform<number>;
  /** Player position on screen (x, y in drawing-buffer pixels), its view depth, and the window radius in pixels. */
  uObs: THREE.IUniform<THREE.Vector4>;
}

export let U!: SharedUniforms;
export let matTerrain!: THREE.MeshLambertMaterial;
export let matRock!: THREE.MeshLambertMaterial;
export let matPlayer!: THREE.MeshLambertMaterial;
export let matTree!: THREE.MeshLambertMaterial;
export let matVeg!: THREE.MeshLambertMaterial;

/** Create the shared uniforms and the five materials, in their original order. */
export function initMaterials(): void {
  U = { uTime: { value: 0 }, uWind: { value: REDUCED ? 0.025 : 0.095 }, uObs: { value: new THREE.Vector4(0, 0, 1, 1) } };

  matTerrain = new THREE.MeshLambertMaterial({ vertexColors: true });
  matRock = new THREE.MeshLambertMaterial({ vertexColors: true });
  matPlayer = new THREE.MeshLambertMaterial({ vertexColors: true });

  /* Trees: anything standing between the camera and the player dissolves into a soft dithered window. */
  matTree = new THREE.MeshLambertMaterial({ vertexColors: true });
  matTree.onBeforeCompile = function (sh) {
    sh.uniforms.uObs = U.uObs;
    sh.vertexShader = sh.vertexShader
      .replace(MAIN_OPEN, TREE_VERT_MAIN)
      .replace(PROJECT_VERTEX, TREE_VERT_PROJECT);
    sh.fragmentShader = sh.fragmentShader.replace(MAIN_OPEN, TREE_FRAG_MAIN);
  };

  /* Grass and flowers: sway with one shared wind field, and shade both faces alike. */
  matVeg = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  matVeg.onBeforeCompile = function (sh) {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind;
    sh.vertexShader = sh.vertexShader
      .replace(MAIN_OPEN, VEG_VERT_MAIN)
      .replace(BEGIN_VERTEX, VEG_VERT_BEGIN);
    sh.fragmentShader = sh.fragmentShader.split(FRONT_FACING).join(FRONT_FACING_ALWAYS);
  };
}
