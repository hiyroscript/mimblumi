/*
 * One run of the intro. Every timer, frame callback, animation and listener the intro makes goes
 * through a Run, so clear() stops all of them at once and nothing can fire twice or leak into the game
 * (the same idea as Alva's run / active() / clear()).
 */
export class Run {
  private live = true;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private frames = new Set<number>();
  private anims = new Set<Animation>();
  private offs = new Set<() => void>();

  /** False once clear() has been called. */
  active(): boolean { return this.live; }

  /** Resolves after `ms` (straight away once cleared, so an await never hangs). */
  wait(ms: number): Promise<void> {
    return new Promise(resolve => {
      if (!this.live) { resolve(); return; }
      const id = setTimeout(() => { this.timers.delete(id); resolve(); }, Math.max(0, ms));
      this.timers.add(id);
    });
  }

  /** requestAnimationFrame, cancelled by clear(). */
  frame(fn: (now: number) => void): void {
    if (!this.live) return;
    const id = requestAnimationFrame(now => { this.frames.delete(id); if (this.live) fn(now); });
    this.frames.add(id);
  }

  /** Resolves after the next two frames: by then the frame drawn in between has been shown. */
  frames2(): Promise<void> {
    return new Promise(resolve => {
      if (!this.live) { resolve(); return; }
      this.frame(() => this.frame(() => resolve()));
    });
  }

  /** Element.animate, cancelled by clear(). */
  animate(el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation {
    const a = el.animate(keyframes, options);
    this.anims.add(a);
    if (!this.live) a.cancel();
    return a;
  }

  /** Resolves when `a` ends, or is cancelled. */
  ended(a: Animation): Promise<void> {
    return a.finished.then(() => undefined, () => undefined);
  }

  /** addEventListener, removed by clear() (or by the returned function). */
  on(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): () => void {
    if (!this.live) return () => undefined;
    target.addEventListener(type, fn, opts);
    const off = (): void => { target.removeEventListener(type, fn, opts); this.offs.delete(off); };
    this.offs.add(off);
    return off;
  }

  /** Stop everything this run started. Safe to call more than once. */
  clear(): void {
    this.live = false;
    for (const id of this.timers) clearTimeout(id);
    for (const id of this.frames) cancelAnimationFrame(id);
    for (const a of this.anims) { try { a.cancel(); } catch (err) { /* already gone */ } }
    for (const off of Array.from(this.offs)) off();
    this.timers.clear(); this.frames.clear(); this.anims.clear();
  }
}
