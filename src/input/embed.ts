/* ============================================================
   EMBEDDED — playing inside another page (itch.io shows the game in an <iframe>)
   ============================================================
   On GitHub Pages the game is the whole page and none of this changes anything. Inside a frame:
   - Keys only reach the game once its frame has the focus. A press on the intro or on the world gives it
     (focusGame); the browser usually does that on its own, this makes sure.
   - A key the frame does not cancel scrolls the page around it: the arrows, Space, Page Up/Down, Home
     and End would move the itch.io page and could scroll the game out of view, where the browser stops
     drawing it. holdPageKeys() cancels them for the whole game, except where a control needs its own
     keys (Space or Enter on a focused button presses it). It only cancels the scroll: everything that
     listens for these keys (the Home Screen's arrows, Home and End, the game's arrows) still gets them.
*/

/** Keys that scroll a page by default. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown', 'Home', 'End']);

/** Elements whose own default action for Space is not a scroll (pressing, ticking, typing). */
const PRESSABLE = 'button, a[href], summary, input, select, textarea, [contenteditable]:not([contenteditable="false"])';
/** Elements that use the arrows, Home and End themselves (moving a caret or a selection). */
const EDITABLE = 'input, select, textarea, [contenteditable]:not([contenteditable="false"])';

function within(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && !!target.closest(selector);
}

let held = false;

/** Cancel the scroll that a scrolling key would make, for as long as the page is open. Safe to call twice. */
export function holdPageKeys(): void {
  if (held) return;
  held = true;
  window.addEventListener('keydown', e => {
    if (e.defaultPrevented || !SCROLL_KEYS.has(e.code) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (within(e.target, e.code === 'Space' ? PRESSABLE : EDITABLE)) return;
    e.preventDefault();
  });
}

/** Give the game's frame the keyboard focus, from a press (a page may only take the focus on a user gesture). */
export function focusGame(): void {
  try { window.focus(); } catch (err) { /* not allowed here: the press itself focuses the frame */ }
}
