/**
 * Runs cheap synchronous jobs (canvas drawing, texture creation) in idle time, a few
 * milliseconds per turn, so building hundreds of generated covers never stalls a frame.
 * Uses `requestIdleCallback` where the browser has it and a zero timeout elsewhere.
 */
export class FrameBudget {
  private readonly jobs: Array<() => void> = [];
  private scheduled = false;

  constructor(private readonly budgetMs = 6) {}

  get size(): number {
    return this.jobs.length;
  }

  run<T>(job: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.jobs.push(() => {
        try {
          resolve(job());
        } catch (err) {
          reject(err);
        }
      });
      this.schedule();
    });
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback((deadline) => this.flush(Math.min(this.budgetMs, deadline.timeRemaining())), { timeout: 100 });
    } else {
      setTimeout(() => this.flush(this.budgetMs), 0);
    }
  }

  private flush(budgetMs: number): void {
    this.scheduled = false;
    const deadline = performance.now() + Math.max(1, budgetMs);
    do {
      this.jobs.shift()?.();
    } while (this.jobs.length && performance.now() < deadline);
    if (this.jobs.length) this.schedule();
  }
}
