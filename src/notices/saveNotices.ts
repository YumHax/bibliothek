import { onCorruptSave, onOtherTab, onWriteFailure } from '@/persistence';

/** A repeated warning (every save fails once storage is full) is shown at most this often. */
const REPEAT_MS = 60_000;
const SHOW_MS = 9000;

interface Notifier {
  alert(text: string, ms?: number): void;
}

/**
 * Tells the player when their progress is at risk, in the alert bar: a save that did not reach
 * storage, a damaged save set aside (those found while loading, before the UI existed, included),
 * another tab playing on the same save. Each kind of warning is repeated once a minute at most.
 * Called once by the `Notices`; returns the unsubscribe.
 */
export function announceSaveProblems(notices: Notifier): () => void {
  const last = new Map<string, number>();
  const say = (kind: string, text: string) => {
    const now = performance.now();
    if (now - (last.get(kind) ?? -Infinity) < REPEAT_MS) return;
    last.set(kind, now);
    notices.alert(text, SHOW_MS);
  };
  const stops = [
    onWriteFailure(() => say('write', 'Could not save: the browser’s storage is full or blocked.\nWhat you do now will not survive a reload.')),
    onCorruptSave((e) => say(`corrupt:${e.key}`, `A damaged save (${e.key}) was set aside: that part starts afresh.`)),
    onOtherTab((signal) => say(
      `tab:${signal}`,
      signal === 'open'
        ? 'The game is open in another tab: play in one only, or each will save over the other.'
        : 'Another tab just saved over this game’s progress.',
    )),
  ];
  return () => stops.forEach((stop) => stop());
}
