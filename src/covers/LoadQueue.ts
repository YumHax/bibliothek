interface Job {
  priority: () => number;
  /** `priority()` as of submission or the last `reprioritize()`. */
  value: number;
  seq: number;
  start: () => void;
}

/** Lowest priority value first; ties keep submission order. */
const before = (a: Job, b: Job): boolean => a.value < b.value || (a.value === b.value && a.seq < b.seq);

/**
 * Runs async tasks at most `concurrency` at a time, lowest priority value first. A task's priority
 * is a function evaluated when it is submitted and again on `reprioritize()` (call it when what
 * the priorities depend on moves, e.g. the camera, about once a second): the waiting jobs stay
 * sorted, so a free slot takes the first one without asking every job again. Ties keep submission order.
 */
export class LoadQueue {
  /** Waiting jobs, sorted: the next one to start is first. */
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
      this.insert({
        priority,
        value: priority(),
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

  /** Asks every waiting job for its priority again and re-sorts them. */
  reprioritize(): void {
    for (const job of this.pending) job.value = job.priority();
    this.pending.sort((a, b) => (before(a, b) ? -1 : before(b, a) ? 1 : 0));
  }

  /** Binary insertion keeps `pending` sorted. */
  private insert(job: Job): void {
    let lo = 0;
    let hi = this.pending.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (before(this.pending[mid], job)) lo = mid + 1;
      else hi = mid;
    }
    this.pending.splice(lo, 0, job);
  }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length) this.pending.shift()!.start();
  }
}
