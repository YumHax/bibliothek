import { KEYS, PersistedStore } from '@/persistence';

/*
 * What the player had won at the arcade when each visit began (`KEYS.arcadeVisits`), so Gus can remark on the last
 * one: a medal, a gold, a plush from the claw, the league's pennant, the Saturday cup. A visit is a new game day's
 * first look at the hall; another on the same day remembers the same last visit.
 */

/** What the player has won at the arcade, counted. */
export interface ArcadeWins {
  medals: number;
  golds: number;
  plush: number;
  pennants: number;
  cups: number;
}

interface VisitsFile {
  /** The game day of the visit now under way (-1: none yet). */
  day: number;
  /** The wins when it began. */
  at: ArcadeWins;
  /** What the visit before it won (from its start to this one's). */
  last: ArcadeWins;
}

const NONE: ArcadeWins = { medals: 0, golds: 0, plush: 0, pennants: 0, cups: 0 };
const KINDS = Object.keys(NONE) as (keyof ArcadeWins)[];

let store: PersistedStore<VisitsFile> | null = null;

function loaded(): PersistedStore<VisitsFile> {
  store ??= new PersistedStore<VisitsFile>({ key: KEYS.arcadeVisits, version: 1, defaults: () => ({ day: -1, at: { ...NONE }, last: { ...NONE } }), read: readVisits });
  return store;
}

/**
 * The hall opened on game day `day` with the player's wins at `now`: what their last visit won (nothing on the first
 * ever). A new day starts a new visit; the same day keeps the one under way.
 */
export function lastVisitWins(day: number, now: ArcadeWins): ArcadeWins {
  const file = loaded().load();
  if (file.day === day) return file.last;
  const last = file.day < 0 ? { ...NONE } : (Object.fromEntries(KINDS.map((k) => [k, Math.max(0, now[k] - file.at[k])])) as unknown as ArcadeWins);
  loaded().save({ day, at: { ...now }, last });
  return last;
}

function readVisits(data: unknown): VisitsFile | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<VisitsFile>;
  return { day: typeof d.day === 'number' ? d.day : -1, at: wins(d.at), last: wins(d.last) };
}

function wins(value: unknown): ArcadeWins {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof ArcadeWins, unknown>>;
  return Object.fromEntries(KINDS.map((k) => [k, typeof v[k] === 'number' ? v[k] : 0])) as unknown as ArcadeWins;
}
