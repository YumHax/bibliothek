import { KEYS, PersistedStore, safeStorage } from '@/persistence';

/** How many lines said to the player are kept to read again. */
const KEEP = 30;

/** A line someone said to the player: who (when named) and what; `card`: a card read (a letter, the radio, a plaque), `name` its writer or title. */
interface SaidLine {
  name?: string;
  text: string;
  card?: boolean;
  /** When it was said (ms since the epoch): "What was said" groups by it ("a few minutes ago", "yesterday"). */
  at?: number;
}

/** Kept over a reload: a letter put down too fast is still there to read the next evening. */
const store = new PersistedStore<SaidLine[]>({
  key: KEYS.saidLog,
  version: 1,
  storage: safeStorage(),
  defaults: () => [],
  read: (data) =>
    Array.isArray(data)
      ? data
          .filter((l): l is SaidLine => !!l && typeof l === 'object' && typeof (l as SaidLine).text === 'string')
          .map((l) => ({ text: l.text, ...(typeof l.name === 'string' ? { name: l.name } : {}), ...(l.card === true ? { card: true } : {}), ...(typeof l.at === 'number' ? { at: l.at } : {}) }))
          .slice(-KEEP)
      : null,
});

let lines: SaidLine[] | null = null;

function kept(): SaidLine[] {
  return (lines ??= store.load());
}

/** A line said to the player (`SpeechLayer`) or a card read (`ReadingCard`), kept for "What was said" (the oldest goes past `KEEP`). */
export function noteSaid(line: SaidLine): void {
  const all = kept();
  const last = all[all.length - 1];
  if (last && last.text === line.text && last.name === line.name) return; // a line said again is one line
  all.push({ ...line, at: Date.now() });
  if (all.length > KEEP) all.shift();
  store.save(all);
}

/** The lines said to the player, newest first. */
export function saidLines(): readonly SaidLine[] {
  return kept().slice().reverse();
}
