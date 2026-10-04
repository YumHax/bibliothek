import { ROOT_PREFIX, onCorruptSave, onOtherTab, onWriteFailure } from '@/persistence';

/** A repeated warning (every save fails once storage is full) is shown at most this often. */
const REPEAT_MS = 60_000;
const SHOW_MS = 9000;

/** What each save is, in the player's words (the key's name, without its prefix and version). */
const SAVE_NAMES: Readonly<Record<string, string>> = {
  settings: 'your settings', quality: 'the graphics level', cat: 'the cat’s settings',
  collection: 'your collection', deliveries: 'the parcels on their way', wallet: 'your wallet', prizes: 'your prizes',
  home: 'your flat’s furniture', market: 'the flea market', standing: 'your name at the market', notices: 'the market’s notice board',
  calendar: 'the market calendar', arcade: 'your arcade scores', arcadeDaily: 'the arcade’s daily challenge', arcadeMedals: 'your arcade medals',
  arcadeLeague: 'the arcade league', arcadeJackpot: 'the arcade jackpot', arcadeTournament: 'the arcade tournament',
  arcadeReplays: 'your arcade replays', arcadeHabits: 'the arcade’s tips and the claw’s luck', payoutStats: 'the arcade’s payout figures', position: 'where you stood',
  moodLamp: 'the mood lamp', busker: 'the busker', finds: 'your finds', giveaway: 'the giveaway box', garageSale: 'the garage sale',
  trader: 'the travelling trader', scratch: 'your scratch cards', scratchCard: 'your scratch card', visitors: 'your friends’ visits',
  journal: 'your journal', milestones: 'your milestones', valueHistory: 'your collection’s value history', firstDay: 'the first day’s to-do list',
  post: 'your mail', neighbourTrades: 'the neighbours’ swaps', household: 'the flat’s household',
};

/** `bibliothek.wallet.v1` → "your wallet" (the debug save's keys too); an unknown key is "part of your progress". */
function saveName(key: string): string {
  const name = key.replace(ROOT_PREFIX, '').replace(/^debug\./, '').replace(/\.v\d+$/, '');
  return SAVE_NAMES[name] ?? 'part of your progress';
}

interface Notifier {
  alert(text: string, ms?: number): void;
}

/**
 * Tells the player when their progress is at risk, in the alert bar: a save that did not reach
 * storage, a damaged save set aside or one saved by a newer version (those found while loading, before
 * the UI existed, included), named in the player's words ("your wallet"),
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
    onCorruptSave((e) => {
      const what = saveName(e.key);
      const What = what[0]!.toUpperCase() + what.slice(1);
      say(
        `corrupt:${e.key}`,
        e.newer
          ? `${What} was saved by a newer version of the game. This older version plays on from what it understands, so what you do now will not carry back to the newer one${e.backup ? ' (a copy of the newer save is kept)' : ''}.`
          : `${What} could not be read, so it starts afresh (a copy of the damaged save is kept).`,
      );
    }),
    onOtherTab((signal) => say(
      `tab:${signal}`,
      signal === 'open'
        ? 'The game is open in another tab: play in one only, or each will save over the other.'
        : 'Another tab just saved over this game’s progress.',
    )),
  ];
  return () => stops.forEach((stop) => stop());
}
