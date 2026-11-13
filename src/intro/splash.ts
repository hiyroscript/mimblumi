import hsUrl from '../../hs.jpg';
import logoUrl from '../../mimblumi.png';
import { CFG } from '../config';
import { Run } from './run';

/* ============================================================
   INTRO — hiyroscript logo, Mimblumi logo, loading bar, "Press to start", colour transition
   ============================================================
   The two logos play exactly like Alva's splash (js/screens/splash-screen.js): one opacity track
   (fade in, hold, fade out) plus a slow linear zoom over the whole of it, with a short black gap
   between them. Then Mimblumi's own steps: the game logo stays as the title, a loading bar under
   it follows the real start-up work, "Press to start" takes its place, and the press runs the
   background through the colours in CFG.splash.transitionColors before white fades into the game.
*/

const S = CFG.splash;

export interface IntroHooks {
  /** Settles when the start-up work is done: resolves once the world is ready to draw, rejects if it cannot be. */
  loading: Promise<void>;
  /** How far the start-up work has got, 0..1. */
  progress(): number;
  /** Start the game loop. Called under the white overlay, just before it fades away. */
  startGame(): void;
  /** The world cannot be drawn: show the fallback note. The splash is already gone. */
  fail(err: unknown): void;
  /** The intro is over and the splash is gone: hand the screen to the game. */
  done(): void;
}

/** Stops the sequence at the loading step when the world cannot load (for example, no WebGL). */
class LoadFailed extends Error {
  constructor() { super('Loading failed'); this.name = 'LoadFailed'; }
}

/** Keys that never start the game on their own: modifiers, Tab, and the F-keys (reload, full screen, dev tools). */
const IGNORED_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'Super', 'Hyper', 'Fn', 'FnLock',
  'CapsLock', 'NumLock', 'ScrollLock', 'Symbol', 'SymbolLock', 'Tab', 'Dead', 'Unidentified']);

function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** Load an image and decode it, so it can be shown without a half-drawn first frame. */
function loadImage(src: string, alt: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.alt = alt;
    img.decoding = 'async';
    img.draggable = false;
    img.onload = () => {
      img.onload = img.onerror = null;
      (typeof img.decode === 'function' ? img.decode() : Promise.resolve()).then(() => resolve(img), reject);
    };
    img.onerror = () => {
      img.onload = img.onerror = null;
      reject(new Error('Could not load ' + src));
    };
    img.src = src;
  });
}

/** Opacity keyframes: fade in, hold at 1, and (if fadeOut > 0) fade out, each fade ease-in-out. */
function fadeTrack(fadeIn: number, hold: number, fadeOut: number): Keyframe[] {
  const total = fadeIn + hold + fadeOut;
  const k: Keyframe[] = [
    { opacity: 0, offset: 0, easing: 'ease-in-out' },
    { opacity: 1, offset: fadeIn / total }
  ];
  if (fadeOut > 0) k.push({ opacity: 1, offset: (fadeIn + hold) / total, easing: 'ease-in-out' }, { opacity: 0, offset: 1 });
  else k.push({ opacity: 1, offset: 1 });
  return k;
}

const ZOOM: Keyframe[] = [{ transform: `scale(${S.zoomFrom})` }, { transform: `scale(${S.zoomTo})` }];

/**
 * Steps 0–2. Waits for both logos to load and decode, then plays the hiyroscript logo with its credit,
 * a black gap, and the Mimblumi logo, which fades in and stays. Returns the Mimblumi logo, or null when
 * the logos had to be skipped (nothing of them is left on screen then).
 */
async function playLogos(root: HTMLElement, run: Run, reduced: boolean): Promise<HTMLImageElement | null> {
  const added: Element[] = [];
  try {
    const timeout = run.wait(S.imageTimeout).then(() => {
      throw new Error('The logos did not load within ' + S.imageTimeout + ' ms');
    });
    const [hs, logo] = await Promise.race([
      Promise.all([loadImage(hsUrl, 'hiyroscript'), loadImage(logoUrl, 'Mimblumi')]),
      timeout
    ]);

    hs.className = 'splash-logo splash-studio';
    const credit = make('p', 'splash-credit', 'a game by hiyroscript');
    logo.className = 'splash-logo splash-game';
    root.append(hs, credit, logo);       // all three start invisible (opacity 0 in the stylesheet)
    added.push(hs, credit, logo);

    /*
     * Both logos are scheduled up front, the second one with a delay, so the whole sequence runs on the
     * compositor and keeps exact time even while the world is being generated on the main thread.
     */
    const hold = reduced ? S.reducedMotionHold : S.hold;
    const studioMs = S.fadeIn + hold + S.fadeOut;
    const studio: KeyframeAnimationOptions = { duration: studioMs, fill: 'forwards' };
    const studioFade = run.animate(hs, fadeTrack(S.fadeIn, hold, S.fadeOut), studio);
    run.animate(credit, fadeTrack(S.fadeIn, hold, S.fadeOut), studio);    // fades with the logo, never zooms
    if (!reduced) run.animate(hs, ZOOM, { ...studio, easing: 'linear' });

    /* Unlike Alva's, the game logo does not fade out: it stays, at the end of its zoom, as the title. */
    const game: KeyframeAnimationOptions = { duration: S.fadeIn + hold, delay: studioMs + S.betweenImages, fill: 'both' };
    const gameFade = run.animate(logo, fadeTrack(S.fadeIn, hold, 0), game);
    if (!reduced) run.animate(logo, ZOOM, { ...game, easing: 'linear' });

    void run.ended(studioFade).then(() => { hs.remove(); credit.remove(); });
    await run.ended(gameFade);
    return logo;
  } catch (err) {
    console.error('[Mimblumi] Splash unavailable; skipping the logos.', err);
    for (const e of added) e.remove();
    root.classList.add('no-logo');       // the loading bar and "Press to start" sit in the middle instead
    return null;
  }
}

interface LoadState { loaded: boolean; failed: boolean }

/**
 * Step 3. Fades the loading bar in under the logo and eases its fill toward the real progress until the
 * world is ready. Returns the bar and the (still hidden) "Press to start" line that shares its spot.
 */
async function playLoading(root: HTMLElement, run: Run, state: LoadState, progress: () => number): Promise<{ bar: HTMLElement; prompt: HTMLElement }> {
  if (state.failed) throw new LoadFailed();
  const under = make('div', 'splash-under');
  const bar = make('div', 'splash-bar');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Loading');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  bar.setAttribute('aria-valuenow', '0');
  const fill = make('div', 'splash-bar-fill');
  bar.append(fill);
  const prompt = make('p', 'splash-prompt', 'Press to start');
  prompt.setAttribute('aria-hidden', 'true');   // the whole screen is the button and carries the label
  under.append(bar, prompt);
  root.append(under);

  run.animate(bar, [{ opacity: 0 }, { opacity: 1 }], { duration: S.barFadeIn, easing: 'ease-in-out', fill: 'forwards' });
  const shownAt = performance.now();
  let shown = 0, last = shownAt, pct = 0;
  await new Promise<void>((resolve, reject) => {
    const tick = (now: number): void => {
      if (state.failed) { reject(new LoadFailed()); return; }
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      /* Ease toward the real progress, never backwards, and only reach the end once loading has. */
      const target = state.loaded ? 1 : Math.min(0.99, progress());
      if (shown < target) shown = Math.min(target, shown + Math.max(0.5 * dt, (target - shown) * (1 - Math.exp(-7 * dt))));
      fill.style.width = (shown * 100).toFixed(2) + '%';
      const p = Math.round(shown * 100);
      if (p !== pct) { pct = p; bar.setAttribute('aria-valuenow', String(p)); }
      if (shown >= 1 && now - shownAt >= S.barMinShow) resolve();
      else run.frame(tick);
    };
    run.frame(tick);
  });
  return { bar: bar, prompt: prompt };
}

/**
 * Step 4. Cross-fades the bar into a gently pulsing "Press to start" and waits for one press: a pointer
 * down anywhere on the splash or a key. The splash sits above the stage and Input is not listening yet,
 * so the press never reaches the player. Returns the pulse (if any) so step 5 can stop it.
 */
async function playPrompt(root: HTMLElement, run: Run, reduced: boolean, bar: HTMLElement, prompt: HTMLElement): Promise<Animation | null> {
  const cross: KeyframeAnimationOptions = { duration: S.crossfade, easing: 'ease-in-out', fill: 'forwards' };
  run.animate(bar, [{ opacity: 1 }, { opacity: 0 }], cross);
  const show = run.animate(prompt, [{ opacity: 0 }, { opacity: 1 }], cross);

  root.setAttribute('role', 'button');
  root.setAttribute('aria-label', 'Press to start');
  root.tabIndex = 0;
  root.focus({ preventScroll: true });

  let pressed = false, pulse: Animation | null = null;
  if (!reduced) {
    void run.ended(show).then(() => {
      if (pressed || !run.active()) return;
      pulse = run.animate(prompt, [
        { opacity: 1, easing: 'ease-in-out' }, { opacity: 0.25, easing: 'ease-in-out' }, { opacity: 1 }
      ], { duration: S.pulse, iterations: Infinity });
    });
  }

  await new Promise<void>(resolve => {
    const press = (e: Event): void => {
      if (pressed) return;
      if (e instanceof KeyboardEvent && (e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey ||
          IGNORED_KEYS.has(e.key) || /^F\d+$/.test(e.key))) return;
      pressed = true;
      e.preventDefault();
      e.stopPropagation();
      offPointer(); offKey();
      resolve();
    };
    const offPointer = run.on(root, 'pointerdown', press);
    const offKey = run.on(window, 'keydown', press, { capture: true });
  });
  return pulse;
}

/**
 * Step 5. Fades the logo and prompt out, holds black for a moment, runs the background through the
 * transition colours, starts the game under the white, and fades the white away.
 */
async function playTransition(root: HTMLElement, run: Run, reduced: boolean, logo: HTMLElement | null,
                              prompt: HTMLElement, pulse: Animation | null, startGame: () => void): Promise<void> {
  const out: KeyframeAnimationOptions = { duration: S.pressFadeOut, easing: 'ease-in-out', fill: 'forwards' };
  const from = parseFloat(getComputedStyle(prompt).opacity);    // wherever the pulse was
  if (pulse) pulse.cancel();
  const fades = [run.animate(prompt, [{ opacity: isFinite(from) ? from : 1 }, { opacity: 0 }], out)];
  if (logo) fades.push(run.animate(logo, [{ opacity: 1 }, { opacity: 0 }], out));
  await Promise.all(fades.map(a => run.ended(a)));
  await run.wait(S.finalBlackHold);

  /* One animation through every colour; each step eases in and out, so each colour cross-fades into the next. */
  const all = S.transitionColors;
  const colors = reduced ? [all[0], all[all.length - 1]] : all;
  const keys: Keyframe[] = colors.map((c, i) => i < colors.length - 1 ? { backgroundColor: c, easing: 'ease-in-out' } : { backgroundColor: c });
  await run.ended(run.animate(root, keys, { duration: reduced ? S.reducedTransitionMs : S.transitionMs, fill: 'forwards' }));

  /* On white: start the world underneath, let its first frame land, then fade the white away. */
  startGame();
  await run.frames2();
  await run.ended(run.animate(root, [{ opacity: 1 }, { opacity: 0 }], { duration: S.revealMs, easing: 'ease-in-out', fill: 'forwards' }));
}

/**
 * Play the whole intro on `root` (the #splash overlay) while the start-up work runs. Never throws and
 * never leaves the page on a black screen: whatever goes wrong, it ends in the game or in the fallback note.
 */
export async function playIntro(root: HTMLElement, hooks: IntroHooks): Promise<void> {
  const run = new Run();
  const reduced = !!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state: LoadState = { loaded: false, failed: false };
  hooks.loading.then(() => { state.loaded = true; }, () => { state.failed = true; });

  let started = false;
  const startGame = (): void => { if (!started) { started = true; hooks.startGame(); } };
  const teardown = (): void => {
    root.remove();
    run.clear();
    document.documentElement.classList.remove('intro');
  };

  try {
    const logo = await playLogos(root, run, reduced);
    const { bar, prompt } = await playLoading(root, run, state, hooks.progress);
    const pulse = await playPrompt(root, run, reduced, bar, prompt);
    await playTransition(root, run, reduced, logo, prompt, pulse, startGame);
  } catch (err) {
    if (!(err instanceof LoadFailed)) console.error('[Mimblumi] The intro failed; going straight to the game.', err);
    try {
      await hooks.loading;
    } catch (loadErr) {
      teardown();
      hooks.fail(loadErr);
      return;
    }
    startGame();
  }
  teardown();
  hooks.done();
}
