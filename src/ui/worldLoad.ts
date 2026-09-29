/**
 * Whether the world is ready to walk into: the first zone loaded (`bootstrap/world.startWhenReady`). The
 * start card's primary button waits for it ("Opening the door…"); a failure is announced with a Retry
 * (`bootstrap/ui`). One state for the page.
 */
export type WorldLoadState = 'loading' | 'ready' | 'failed';

let state: WorldLoadState = 'loading';
let retry: (() => void) | null = null;
const listeners = new Set<(state: WorldLoadState, retry: (() => void) | null) => void>();

function set(next: WorldLoadState, again: (() => void) | null = null): void {
  state = next;
  retry = again;
  for (const cb of [...listeners]) cb(state, retry);
}

/** Calls `cb` now and on each change (with the retry while `failed`). Returns the unsubscribe. */
export function onWorldLoad(cb: (state: WorldLoadState, retry: (() => void) | null) => void): () => void {
  listeners.add(cb);
  cb(state, retry);
  return () => listeners.delete(cb);
}

/**
 * Runs `load` and follows it: `ready` when it resolves, `failed` (with a retry running it again) when it
 * throws. The promise resolves once an attempt succeeds, however many retries it takes.
 */
export function trackWorldLoad(load: () => Promise<unknown>): Promise<void> {
  return new Promise((resolve) => {
    const attempt = (): void => {
      set('loading');
      load().then(
        () => {
          set('ready');
          resolve();
        },
        (error: unknown) => {
          console.error('[world] the first zone failed to load', error);
          set('failed', attempt);
        },
      );
    };
    attempt();
  });
}
