import { CFG } from '../config';
import { Run } from '../intro/run';
import type { GameMode } from '../game/mode';
import { globeIcon, playIcon, toolsIcon } from './icons';

/* ============================================================
   HOME SCREEN — three glass cards over a drifting, random world
   ============================================================
   "Play with friends!" (online, not available yet), "Survival" (the larger middle card) and
   "Creative mode", side by side. The cards fall in from above the top of the screen, all together with
   a tiny stagger. Picking a mode lifts them away under a white cover; the game is set up under the white,
   and close() fades it away. The world behind the cards is drawn by the frame loop (home/flyover.ts).
   Every timer, animation and listener goes through a Run, so nothing outlives the Home Screen.
*/

const H = CFG.home;

export interface HomeScreen {
  /** Let the cards fall in. Only the first call does anything. */
  enter(): void;
  /** Resolves with the mode the player picked. */
  chosen: Promise<GameMode>;
  /** The cards rise and fade away while white fades in over everything. Resolves once the screen is white. */
  leave(): Promise<void>;
  /** Waits for two frames (so the world under the white has been drawn), fades the white away and removes the Home Screen. */
  close(): Promise<void>;
}

interface CardSpec {
  mode: GameMode | null;      // null: not available
  label: string;
  note?: string;
  icon: () => SVGSVGElement;
  cls: string;
}

const CARDS: CardSpec[] = [
  { mode: null, label: 'Play with friends!', note: 'Unavailable right now', icon: globeIcon, cls: 'home-card--online' },
  { mode: 'survival', label: 'Survival', icon: playIcon, cls: 'home-card--main' },
  { mode: 'creative', label: 'Creative mode', icon: toolsIcon, cls: 'home-card--creative' }
];

/** Keys that move the focus along the row of cards. */
const STEP: Record<string, number | undefined> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** Build the Home Screen inside `root` (the #home element) and show it, cards hidden until enter(). */
export function openHome(root: HTMLElement): HomeScreen {
  const run = new Run();
  const reduced = !!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.replaceChildren();
  root.className = 'home is-waiting';
  root.hidden = false;

  const row = make('div', 'home-cards');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Choose how to play');
  const toast = make('p', 'home-toast');
  toast.setAttribute('role', 'status');
  root.append(row, toast);
  /*
   * The white the game is set up under. It lives on <body>, not in #home: #home is padded for the safe
   * areas (and is a size container and a grid), and a cover inside it can end up sized to that padded
   * box, leaving a strip of the world visible around the notch and the edges. On its own it is a plain
   * fixed layer over the whole screen. close() removes it.
   */
  const veil = make('div', 'home-veil');
  veil.setAttribute('aria-hidden', 'true');
  document.body.append(veil);

  const buttons: HTMLButtonElement[] = [];
  for (const c of CARDS) {
    const b = make('button', 'home-card glass glass--panel ' + c.cls);
    b.type = 'button';
    b.append(c.icon(), make('span', 'home-label', c.label));
    if (c.note) b.append(make('span', 'home-note', c.note));
    if (!c.mode) b.setAttribute('aria-disabled', 'true');
    row.append(b);
    buttons.push(b);
  }

  let resolveChoice!: (m: GameMode) => void;
  const chosen = new Promise<GameMode>(resolve => { resolveChoice = resolve; });
  let picked = false, entered = false;

  /* "Coming soon", briefly, under the cards; pressing again restarts it. */
  let toastAnim: Animation | null = null;
  function comingSoon(card: HTMLElement): void {
    if (!reduced) run.animate(card, [
      { transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' },
      { transform: 'translateX(-3px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }
    ], { duration: 360, easing: 'ease-in-out' });
    toast.textContent = 'Coming soon';
    if (toastAnim) toastAnim.cancel();
    toastAnim = run.animate(toast, [
      { opacity: 0, offset: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0, offset: 1 }
    ], { duration: 1800, easing: 'ease-in-out' });
  }

  buttons.forEach((b, i) => {
    const mode = CARDS[i].mode;
    run.on(b, 'click', e => {
      e.preventDefault();
      if (picked) return;
      if (!mode) { comingSoon(b); return; }
      picked = true;
      resolveChoice(mode);
    });
  });
  /* Arrow keys move along the row. With no card focused yet (nothing is focused on arrival, so pointer
     users see no focus ring), the first arrow press lands on Survival. */
  run.on(window, 'keydown', e => {
    const k = e as KeyboardEvent;
    if (!entered || picked || k.altKey || k.ctrlKey || k.metaKey) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let to = -1;
    if (STEP[k.key] !== undefined) to = at < 0 ? 1 : Math.min(buttons.length - 1, Math.max(0, at + (STEP[k.key] as number)));
    else if (k.key === 'Home') to = 0;
    else if (k.key === 'End') to = buttons.length - 1;
    if (to < 0) return;
    k.preventDefault();
    buttons[to].focus();
  });
  /* Taps on the world behind the cards do nothing (Input is not listening yet, and nothing else should). */
  for (const ev of ['contextmenu', 'dblclick', 'selectstart', 'gesturestart'])
    run.on(root, ev, e => e.preventDefault(), { passive: false });

  function enter(): void {
    if (entered) return;
    entered = true;
    root.classList.remove('is-waiting');
    buttons.forEach((b, i) => {
      if (reduced) {
        run.animate(b, [{ opacity: 0 }, { opacity: 1 }], { duration: H.reducedFade, easing: 'ease-out', fill: 'backwards' });
        return;
      }
      /* Both tracks hold their first keyframe through the stagger (fill: backwards) and hand back to the
         stylesheet when they end, so the hover lift still works afterwards. */
      const timing: KeyframeAnimationOptions = { duration: H.cardFallMs, delay: i * H.cardStagger, fill: 'backwards' };
      run.animate(b, [
        { transform: 'translateY(calc(-50vh - 100% - 24px))' }, { transform: 'translateY(0)' }
      ], { ...timing, easing: 'cubic-bezier(0.22, 1.2, 0.36, 1)' });
      run.animate(b, [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 1 }], { ...timing, easing: 'linear' });
    });
  }

  async function leave(): Promise<void> {
    enter();                                  // in case it never ran
    root.classList.add('is-leaving');         // no more presses or hover
    const ms = reduced ? H.reducedFade : H.leaveMs;
    buttons.forEach((b, i) => {
      const lift = reduced ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-36px)' }];
      run.animate(b, lift, { duration: ms, delay: reduced ? 0 : i * H.cardStagger * 0.5, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'both' });
    });
    if (toastAnim) toastAnim.cancel();
    await run.ended(run.animate(veil, [{ opacity: 0 }, { opacity: 1 }], {
      duration: reduced ? H.reducedFade : H.whiteFadeIn, easing: 'ease-in-out', fill: 'forwards'
    }));
    row.hidden = true;
  }

  async function close(): Promise<void> {
    await run.frames2();
    root.style.pointerEvents = 'none';        // the game can be touched while the white goes
    await run.ended(run.animate(veil, [{ opacity: 1 }, { opacity: 0 }], {
      duration: reduced ? H.reducedFade : H.whiteFadeOut, easing: 'ease-in-out', fill: 'forwards'
    }));
    run.clear();
    veil.remove();
    root.replaceChildren();
    root.className = '';
    root.style.pointerEvents = '';
    root.hidden = true;
  }

  return { enter: enter, chosen: chosen, leave: leave, close: close };
}
