import * as THREE from 'three';

/* ============================================================
   5. RENDERER, SCENE, LIGHT
   ============================================================ */

/*
 * These are assigned by the init functions below, which main.ts calls in the original
 * order. ES module live bindings make the assigned values visible to every importer.
 */
export let renderer!: THREE.WebGLRenderer;
export let COARSE: boolean | undefined;
export let REDUCED: boolean | undefined;
export let scene!: THREE.Scene;
export let fog!: THREE.Fog;
export let camera!: THREE.PerspectiveCamera;

export const HAZE = 0xcdd2bd;

/**
 * Create the WebGL renderer and put its canvas on the stage.
 * Returns false when WebGL is unavailable; nothing else should be set up in that case.
 */
export function createRenderer(stage: HTMLElement): boolean {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (err) { return false; }
  /* matchMedia can be missing in old or embedded browsers; then both flags stay falsy. */
  COARSE = (window as Partial<Window>).matchMedia && matchMedia('(pointer: coarse)').matches;
  REDUCED = (window as Partial<Window>).matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', e => e.preventDefault());
  return true;
}

/** Create the scene (with its haze background and fog) and the camera. */
export function createScene(): void {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(HAZE);
  scene.fog = fog = new THREE.Fog(new THREE.Color(HAZE).convertSRGBToLinear(), 20, 100);

  camera = new THREE.PerspectiveCamera(34, 1, 0.5, 400);
}
