import { CFG } from './config';
import { clamp } from './math/util';
import { stage, failNote } from './dom';
import { createRenderer, createScene, scene } from './render/renderer';
import { initLights } from './render/lights';
import { initMaterials } from './render/materials';
import { buildPools } from './render/pools';
import { World } from './world/worldManager';
import { Player, createPlayer } from './player/player';
import { Rig } from './camera/rig';
import { Input } from './input/input';
import { startLoop } from './loop';

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

function start(saved?: Saved | null): void {
  Player.build();
  const sx = saved && isFinite(saved.x as number) ? saved.x as number : 0.5, sz = saved && isFinite(saved.z as number) ? saved.z as number : 0.5;
  if (saved && isFinite(saved.zoom as number)) Rig.want = clamp(saved.zoom as number, CFG.zoomMin, CFG.zoomMax);
  Player.place(sx, sz);
  World.plan(sx, sz, 0, 0);
  while (World.step()) { /* build the first ring of chunks before the first frame */ }
  World.refill();
  Rig.resize(); Rig.snap();
  Input.init(stage);
  window.addEventListener('resize', () => Rig.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => Rig.resize(), 60));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => Rig.resize());
  if (window.ResizeObserver) new ResizeObserver(() => Rig.resize()).observe(stage);
  startLoop();
}

/*
 * Set-up runs in the same order as the original single script: renderer (the bail-out point),
 * scene and camera, lights, materials, instance pools, player. three.js sorts draws partly by
 * object and material creation order, so this order is part of what keeps the image identical.
 */
function boot(): void {
  if (!createRenderer(stage)) { failNote.hidden = false; return; }
  createScene();
  initLights(scene);
  initMaterials();
  buildPools(scene);
  createPlayer();

  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ x: Player.pos.x, z: Player.pos.z, zoom: Rig.want }));
  try {
    if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
  } catch (err) {
    console.error(err);
    failNote.hidden = false;
  }
}

boot();
