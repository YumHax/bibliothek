import { CACHE_PREFIX, CORRUPT_PREFIX, DEBUG_SAVE, ROOT_PREFIX, SAVE_PREFIX } from './keys';

/** How another tab showed itself: it is open on the same save, or it just wrote to it. */
export type OtherTabSignal = 'open' | 'write';

type Message = { type: 'hello' | 'here'; from: string };

const listeners = new Set<(signal: OtherTabSignal) => void>();
const me = Math.random().toString(36).slice(2);
let seen = false;
let started = false;

/**
 * Another tab plays on the same save: both would write their own state over the other's. Emits
 * only (the UI decides what to say): 'open' when a tab on this save answers or says hello
 * (BroadcastChannel), 'write' when one writes a save key (the `storage` event). Returns the unsubscribe.
 */
export function onOtherTab(cb: (signal: OtherTabSignal) => void): () => void {
  start();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Whether another tab on this save has shown itself since this one started. */
export function otherTabSeen(): boolean {
  start();
  return seen;
}

function emit(signal: OtherTabSignal): void {
  seen = true;
  for (const cb of [...listeners]) cb(signal);
}

/** Says hello on the save's channel, answers the others' hellos, and watches their writes. Once, on import. */
function start(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(`${SAVE_PREFIX}tabs`);
      channel.onmessage = (event: MessageEvent<Message>) => {
        const message = event.data;
        if (!message || message.from === me) return;
        if (message.type === 'hello') channel.postMessage({ type: 'here', from: me } satisfies Message);
        emit('open');
      };
      channel.postMessage({ type: 'hello', from: me } satisfies Message);
    } catch {
      // no channel (an old browser, a sandboxed frame): the storage event still tells
    }
  }
  window.addEventListener('storage', (event) => {
    const key = event.key;
    if (!key?.startsWith(SAVE_PREFIX) || key.startsWith(CACHE_PREFIX) || key.startsWith(CORRUPT_PREFIX)) return;
    if (!DEBUG_SAVE && key.startsWith(`${ROOT_PREFIX}debug.`)) return;
    emit('write');
  });
}

start();
