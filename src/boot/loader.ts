/* ============================================================
   LOADER — the start-up work, as a list of weighted tasks that drive the loading bar
   ============================================================ */

/** Lets a long task say how far through it is (0..1), so the bar moves while it runs. */
export type Report = (fraction: number) => void;
/** One piece of start-up work. It may be synchronous or return a promise. */
export type TaskFn = (report: Report) => void | Promise<void>;

interface Task { label: string; weight: number; fn: TaskFn }

const tasks: Task[] = [];
let running = false;

/** Resolves once the next frame has been painted, so the page can repaint between batches of work. */
export function nextPaint(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/**
 * Anything that has to happen before the first frame goes through here, in the order it was added.
 * A new model, texture or sound is one more line, and it counts toward the loading bar on its own:
 *
 *   Loader.add('Birdsong', 2, async () => { birdsong = await loadSound(url); });
 */
export const Loader = {
  /** Queue a task. `weight` is its share of the bar, relative to the other tasks. */
  add(label: string, weight: number, fn: TaskFn): void {
    tasks.push({ label: label, weight: Math.max(0, weight), fn: fn });
  },

  /**
   * Run every queued task, one after the other, with a painted frame between them.
   * `onProgress` gets the overall weighted fraction (0..1). It never goes backwards, and it only
   * reaches 1 once every task has finished. The first task that throws stops the run and rejects it.
   */
  async run(onProgress?: (fraction: number, label: string) => void): Promise<void> {
    if (running) throw new Error('Loader.run() is already running');
    running = true;
    let done = 0, best = 0;
    const tell = (label: string, part: number): void => {
      const total = tasks.reduce((sum, t) => sum + t.weight, 0);
      const f = total > 0 ? Math.min(0.999, (done + part) / total) : 0;
      if (f > best) { best = f; if (onProgress) onProgress(f, label); }
    };
    try {
      /* Tasks added while this runs are picked up too. */
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        tell(t.label, 0);
        await t.fn(f => tell(t.label, t.weight * Math.min(1, Math.max(0, f || 0))));
        done += t.weight;
        tell(t.label, 0);
        await nextPaint();
      }
      tasks.length = 0;
      if (onProgress) onProgress(1, '');
    } finally {
      running = false;
    }
  }
};
