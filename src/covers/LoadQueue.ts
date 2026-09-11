interface Job {
  priority: () => number;
  seq: number;
  start: () => void;
}

/**
 * Runs async tasks at most `concurrency` at a time, lowest priority value first. Priorities are
 * functions re-evaluated each time a slot frees up, so a task's urgency can follow the camera.
 * Ties keep submission order.
 */
export class LoadQueue {
  private readonly pending: Job[] = [];
  private active = 0;
  private seq = 0;

  constructor(readonly concurrency = 6) {}

  /** Tasks waiting or running. */
  get size(): number {
    return this.pending.length + this.active;
  }

  run<T>(task: () => Promise<T>, priority: () => number = () => 0): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        priority,
        seq: this.seq++,
        start: () => {
          this.active++;
          Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(() => {
              this.active--;
              this.pump();
            });
        },
      });
      this.pump();
    });
  }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length) {
      let best = 0;
      let bestPriority = this.pending[0].priority();
      for (let i = 1; i < this.pending.length; i++) {
        const p = this.pending[i].priority();
        if (p < bestPriority || (p === bestPriority && this.pending[i].seq < this.pending[best].seq)) {
          best = i;
          bestPriority = p;
        }
      }
      const [job] = this.pending.splice(best, 1);
      job.start();
    }
  }
}
