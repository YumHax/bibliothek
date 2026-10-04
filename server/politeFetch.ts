/**
 * One upstream host asked politely: a few requests at a time with a gap between two starts,
 * retries with a growing wait for what may pass (429, 5xx, a dropped connection), and a circuit
 * breaker: after `breakAfter` lookups in a row that failed for good, the host is left alone for
 * `pauseMs` and every call fails at once with `UpstreamPaused`, so the client falls back to its
 * generated art instead of queueing behind a dead host.
 */
interface PoliteOptions {
  /** Shortest time between two request starts (ms). */
  gapMs: number;
  /** Requests in flight at once. */
  concurrency: number;
  /** One request's timeout (ms). */
  timeoutMs: number;
  /** Waits before each retry (ms); its length is the number of retries. */
  retryDelaysMs: readonly number[];
  breakAfter: number;
  pauseMs: number;
  userAgent: string;
}

/** The host is being left alone; ask again after `retryAfterMs`. */
export class UpstreamPaused extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`upstream paused for ${Math.ceil(retryAfterMs / 1000)} s`);
  }
}

/** A 429 may say how long to wait; beyond this it is not worth holding the request. */
const MAX_RETRY_AFTER_MS = 10_000;

export class PoliteFetcher {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private lastStart = 0;
  private failures = 0;
  private pausedUntil = 0;

  constructor(private readonly options: PoliteOptions) {}

  /** Milliseconds the host is still left alone for (0: it is asked). */
  get pausedFor(): number {
    return Math.max(0, this.pausedUntil - Date.now());
  }

  /**
   * Fetches `url` and answers the first response that is not worth retrying (a 200, a 404...).
   * Throws when the retries ran out, when the host is paused, or when `deadline` (epoch ms) would pass.
   */
  async fetch(url: string, deadline = Infinity): Promise<Response> {
    const delays = this.options.retryDelaysMs;
    for (let attempt = 0; ; attempt++) {
      if (this.pausedFor > 0) throw new UpstreamPaused(this.pausedFor);
      let wait: number | null = null;
      let failure: unknown = null;
      try {
        const response = await this.slot(deadline, () =>
          fetch(url, {
            headers: { 'User-Agent': this.options.userAgent, Accept: '*/*' },
            redirect: 'follow',
            signal: AbortSignal.timeout(Math.min(this.options.timeoutMs, Math.max(1000, deadline - Date.now()))),
          }),
        );
        if (response.status !== 429 && response.status < 500) {
          this.failures = 0;
          return response;
        }
        failure = new Error(`upstream ${response.status} for ${url}`);
        const after = Number(response.headers.get('retry-after'));
        if (response.status === 429 && after > 0) wait = Math.min(after * 1000, MAX_RETRY_AFTER_MS);
        await response.body?.cancel().catch(() => undefined);
      } catch (err) {
        if (err instanceof UpstreamPaused) throw err;
        failure = err;
      }
      const delay = wait ?? delays[attempt];
      if (attempt >= delays.length || delay === undefined || Date.now() + delay > deadline) {
        if (++this.failures >= this.options.breakAfter) {
          this.pausedUntil = Date.now() + this.options.pauseMs;
          this.failures = 0;
          console.warn(`[polite] ${new URL(url).host} keeps failing: left alone for ${this.options.pauseMs / 1000} s`);
        }
        throw failure instanceof Error ? failure : new Error(String(failure));
      }
      await sleep(delay);
    }
  }

  /** Runs `task` once a slot is free and the gap since the last start has passed. */
  private async slot<T>(deadline: number, task: () => Promise<T>): Promise<T> {
    if (this.active >= this.options.concurrency) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      const start = Math.max(Date.now(), this.lastStart + this.options.gapMs);
      this.lastStart = start;
      if (start > deadline) throw new Error('out of time waiting for the upstream');
      await sleep(start - Date.now());
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
