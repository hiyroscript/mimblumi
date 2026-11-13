import { CFG } from './config';
import { clamp } from './math/util';
import { stage, failNote, splash, home as homeEl } from './dom';
import { createRenderer, createScene, renderer, scene, camera } from './render/renderer';
import { initLights, lightFollow } from './render/lights';
import { initMaterials } from './render/materials';
import { buildPools } from './render/pools';
import { World } from './world/worldManager';
import { setWorldSeed, randomSeed } from './world/fields';
import { Player, createPlayer } from './player/player';
import { Rig } from './camera/rig';
import { Input } from './input/input';
import { startLoop, setLoopState, clearCanopyWindow } from './loop';
import { Loader } from './boot/loader';
import { playIntro } from './intro/splash';
import { openHome } from './home/home';
import type { HomeScreen } from './home/home';
import { Flyover } from './home/flyover';
import { Game, setGameMode, isGameMode } from './game/mode';
import type { GameMode } from './game/mode';

/** What a hot-reload host keeps across reloads: where the player stood, how far the camera was zoomed, and the mode. */
interface Saved { x?: number; z?: number; zoom?: number; mode?: GameMode }

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

/** Where the player starts a new game. */
const START_X = 0.5, START_Z = 0.5;
/** Where the Home Screen's flyover starts gliding (in its own random world). */
const HOME_X = 0.5, HOME_Z = 0.5;

/*
 * All the work before the first frame, as loader tasks so the loading bar can follow it.
 * The order is the original one: renderer (the bail-out point), scene and camera, lights, materials,
 * instance pools, player, then the first ring of chunks. three.js sorts draws partly by object and
 * material creation order, and the world depends on the order of random draws, so this order is part
 * of what keeps the image identical.
 *
 * With `forHome`, the first ring is the Home Screen's: a fresh random world around the flyover's start,
 * with the player hidden. Otherwise (a hot reload) it is the game's own world around the saved position.
 */
function addLoadTasks(saved: Saved | null | undefined, forHome: boolean): void {
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
    if (forHome) Player.show(false);
  });
  /* The first ring of chunks: the same World.step() calls as before, in batches between painted frames. */
  Loader.add('World', 12, async report => {
    if (forHome) {
      setWorldSeed(randomSeed());          // a different world every time the Home Screen opens
      await World.build(HOME_X, HOME_Z, report);
    } else {
      await World.build(sx, sz, report);
    }
  });
  Loader.add('Instances', 1, () => {
    World.refill();
    Rig.resize();
    if (forHome) Flyover.start(HOME_X, HOME_Z); else Rig.snap();
  });
  /*
   * Compile every shader now, then draw one frame out of sight (under the splash) so the shadow and
   * depth programs compile and the buffers upload too. Rig.update(0) only places the camera; with a
   * zero time step it moves nothing, so the first real frame is the same as before.
   */
  Loader.add('Shaders', 3, () => {
    renderer.compile(scene, camera);
    if (forHome) { lightFollow(Flyover.update(0)); clearCanopyWindow(); } else lightFollow(Rig.update(0));
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

/** Hot reload with a saved position: no intro and no Home Screen, straight back into the world. */
async function quickStart(saved: Saved): Promise<void> {
  endIntro();
  try { await Loader.run(); } catch (err) { showFail(err); return; }
  setGameMode(isGameMode(saved.mode) ? saved.mode : 'survival');
  Input.init(stage);
  wireResize();
  startLoop('game');
}

/**
 * A mode was picked on the Home Screen: the cards lift away under white, the game's world is built
 * under the white with the player in it, and the white fades away. Input only starts listening at the
 * end, so the press that picked the mode can never move the player.
 */
async function enterGame(home: HomeScreen | null, mode: GameMode): Promise<void> {
  setGameMode(mode);
  try {
    if (home) await home.leave();
    setLoopState('paused');                // nothing is drawn while the world is swapped
    Flyover.stop();
    /*
     * Survival and Creative play the fixed world, CFG.seed, as the game always has. To play the Home
     * Screen's random world instead, delete the next two lines: World.build() then only adds the chunks
     * around the player to the ones the flyover left behind.
     */
    setWorldSeed(CFG.seed);
    World.reset();
    await World.build(START_X, START_Z);
    World.refill();
    Player.place(START_X, START_Z);
    Player.show(true);
    Rig.snap();
    setLoopState('game');
  } catch (err) {
    console.error('[Mavooli] Could not set up the game cleanly.', err);
    setLoopState('game');
  }
  if (home) { try { await home.close(); } catch (err) { console.error(err); } }
  Input.init(stage);
}

/** Under the intro's white: open the Home Screen and start its world drifting. If it cannot open, start the game. */
function showHome(): HomeScreen | null {
  startLoop('home');
  try {
    const home = openHome(homeEl);
    void home.chosen.then(mode => enterGame(home, mode));
    return home;
  } catch (err) {
    console.error('[Mavooli] The Home Screen failed to open; starting the game.', err);
    homeEl.hidden = true;
    void enterGame(null, 'survival');
    return null;
  }
}

/** Normal start: the full intro, with the Home Screen's world loading behind it from the first moment. */
function coldStart(): void {
  let progress = 0;
  let home: HomeScreen | null = null;
  const loading = Loader.run(f => { progress = f; });
  loading.then(wireResize, () => undefined);   // keep the canvas sized while the intro is still showing
  playIntro(splash, {
    loading: loading,
    progress: () => progress,
    showHome: () => { home = showHome(); },
    revealHome: () => { if (home) home.enter(); },
    fail: showFail,
    done: wireResize
  }).catch(err => console.error(err));
}

function hasSaved(s?: Saved | null): boolean {
  return !!s && [s.x, s.z, s.zoom].some(v => typeof v === 'number' && isFinite(v));
}

let launched = false;
function launch(saved?: Saved | null): void {
  if (launched) return;
  launched = true;
  const quick = hasSaved(saved);
  addLoadTasks(saved, !quick);
  if (quick) void quickStart(saved as Saved); else coldStart();
}

function boot(): void {
  const hot = window.claude && window.claude.hot;
  /* Until a game is being played (during the intro and on the Home Screen) there is nothing to keep, so the next load plays the intro. */
  if (hot && hot.snapshot) hot.snapshot(() => (Player && Game.mode ? { x: Player.pos.x, z: Player.pos.z, zoom: Rig.want, mode: Game.mode } : {}));
  try {
    if (hot && hot.ready) hot.ready(launch); else launch((hot && hot.data) || {});
  } catch (err) {
    showFail(err);
  }
}

boot();
