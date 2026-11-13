import { CFG } from './config';
import { clamp } from './math/util';
import { stage, failNote, splash } from './dom';
import { createRenderer, createScene, renderer, scene, camera } from './render/renderer';
import { initLights, lightFollow } from './render/lights';
import { initMaterials } from './render/materials';
import { buildPools } from './render/pools';
import { World } from './world/worldManager';
import { Player, createPlayer } from './player/player';
import { Rig } from './camera/rig';
import { Input } from './input/input';
import { startLoop } from './loop';
import { Loader, nextPaint } from './boot/loader';
import { playIntro } from './intro/splash';

/** What a hot-reload host keeps across reloads: where the player stood and how far the camera was zoomed. */
interface Saved { x?: number; z?: number; zoom?: number }

declare global {
  interface Window {
    /** Optional hot-reload host. When present it restores the last snapshot instead of a fresh start. */
    claude?: {
      hot?: {
        data?: Saved;
        snapshot?: (fn: () => Saved) => void;
        ready?: (fn: (saved?: Saved | null) => void) => void;
      };
    };
  }
}

/** The first loader task throws this when there is no WebGL, so the page shows #fail instead of the world. */
class NoWebGL extends Error {
  constructor() { super('WebGL is not available'); this.name = 'NoWebGL'; }
}

/** How long chunk generation may hold the main thread before it lets a frame paint (ms). */
const CHUNK_BATCH_MS = 10;

/*
 * All the work before the first frame, as loader tasks so the loading bar can follow it.
 * The order is the original one: renderer (the bail-out point), scene and camera, lights, materials,
 * instance pools, player, then the first ring of chunks. three.js sorts draws partly by object and
 * material creation order, and the world depends on the order of random draws, so this order is part
 * of what keeps the image identical.
 */
function addLoadTasks(saved?: Saved | null): void {
  const sx = saved && isFinite(saved.x as number) ? saved.x as number : 0.5, sz = saved && isFinite(saved.z as number) ? saved.z as number : 0.5;

  Loader.add('Renderer', 1, () => {
    if (!createRenderer(stage)) throw new NoWebGL();
    createScene();
    initLights(scene);
    initMaterials();
  });
  Loader.add('Trees, rocks and flowers', 4, () => buildPools(scene));
  Loader.add('Player', 1, () => {
    createPlayer();
    Player.build();
    if (saved && isFinite(saved.zoom as number)) Rig.want = clamp(saved.zoom as number, CFG.zoomMin, CFG.zoomMax);
    Player.place(sx, sz);
  });
  /* The first ring of chunks: the same World.step() calls as before, in batches between painted frames. */
  Loader.add('World', 12, async report => {
    World.plan(sx, sz, 0, 0);
    const total = Math.max(1, World.queue.length);
    let built = 0, t0 = performance.now();
    while (World.step()) {
      report(++built / total);
      if (performance.now() - t0 >= CHUNK_BATCH_MS) { await nextPaint(); t0 = performance.now(); }
    }
  });
  Loader.add('Instances', 1, () => {
    World.refill();
    Rig.resize(); Rig.snap();
  });
  /*
   * Compile every shader now, then draw one frame out of sight (under the splash) so the shadow and
   * depth programs compile and the buffers upload too. Rig.update(0) only places the camera; with a
   * zero time step it moves nothing, so the first real frame is the same as before.
   */
  Loader.add('Shaders', 3, () => {
    renderer.compile(scene, camera);
    lightFollow(Rig.update(0));
    renderer.render(scene, camera);
  });
}

let resizeWired = false;
function wireResize(): void {
  if (resizeWired) return;
  resizeWired = true;
  window.addEventListener('resize', () => Rig.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => Rig.resize(), 60));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => Rig.resize());
  if (window.ResizeObserver) new ResizeObserver(() => Rig.resize()).observe(stage);
}

function endIntro(): void {
  splash.remove();
  document.documentElement.classList.remove('intro');
}

function showFail(err: unknown): void {
  if (!(err instanceof NoWebGL)) console.error(err);
  endIntro();
  failNote.hidden = false;
}

/** Hot reload with a saved position: no intro, straight back into the world. */
async function quickStart(): Promise<void> {
  endIntro();
  try { await Loader.run(); } catch (err) { showFail(err); return; }
  Input.init(stage);
  wireResize();
  startLoop();
}

/** Normal start: the full intro, with the world loading behind it from the first moment. */
function coldStart(): void {
  let progress = 0;
  const loading = Loader.run(f => { progress = f; });
  loading.then(wireResize, () => undefined);   // keep the canvas sized while the intro is still showing
  playIntro(splash, {
    loading: loading,
    progress: () => progress,
    startGame: startLoop,
    fail: showFail,
    done: () => { Input.init(stage); wireResize(); }   // only now, so the press that started the game cannot move the player
  }).catch(err => console.error(err));
}

function hasSaved(s?: Saved | null): boolean {
  return !!s && [s.x, s.z, s.zoom].some(v => typeof v === 'number' && isFinite(v));
}

let launched = false;
function launch(saved?: Saved | null): void {
  if (launched) return;
  launched = true;
  addLoadTasks(saved);
  if (hasSaved(saved)) void quickStart(); else coldStart();
}

function boot(): void {
  const hot = window.claude && window.claude.hot;
  /* Before the player exists (early in the intro) there is nothing to keep, so the next load plays the intro. */
  if (hot && hot.snapshot) hot.snapshot(() => (Player ? { x: Player.pos.x, z: Player.pos.z, zoom: Rig.want } : {}));
  try {
    if (hot && hot.ready) hot.ready(launch); else launch((hot && hot.data) || {});
  } catch (err) {
    showFail(err);
  }
}

boot();
