import { KEYS, PersistedStore, safeStorage } from '@/persistence';

export const ARCADE_HABITS_KEY = KEYS.arcadeHabits;

/** How many plays per machine the HUD keeps spelling out what the keys do next (walk away, play again). */
export const HINTED_PLAYS = 3;

interface HabitsFile {
  /** Plays started per machine (by game id), counted to one past `HINTED_PLAYS`. */
  plays: Record<string, number>;
  /** The claw's misses in a row (its pity grip comes after `PITY_AFTER`: `claw/ClawSim`). */
  clawMisses: number;
}

/**
 * What the arcade remembers of how the player plays, across visits: how many times they have played each
 * machine (the HUD's "E walks away" and end-of-play tips stop after the first few) and the claw's misses in a
 * row, so its honest grip after a run of misses is not lost by leaving the hall.
 */
export class ArcadeHabits {
  private readonly store: PersistedStore<HabitsFile>;

  constructor(storage: Storage | null = safeStorage()) {
    // Version 1: `{ plays, clawMisses }`.
    this.store = new PersistedStore<HabitsFile>({ key: ARCADE_HABITS_KEY, version: 1, storage, defaults: () => ({ plays: {}, clawMisses: 0 }), read: readHabits });
  }

  /** Read from storage each time: the Session's arcade play and the claw each hold one, and neither may write over the other's part. */
  private get state(): HabitsFile {
    return this.store.load();
  }

  /** Plays started on `gameId`'s machine (counted to one past `HINTED_PLAYS`: enough to know the tips are done). */
  plays(gameId: string): number {
    return this.state.plays[gameId] ?? 0;
  }

  /** A play started on `gameId`'s machine. */
  played(gameId: string): void {
    const state = this.state;
    const n = state.plays[gameId] ?? 0;
    if (n > HINTED_PLAYS) return;
    this.store.save({ ...state, plays: { ...state.plays, [gameId]: n + 1 } });
  }

  get clawMisses(): number {
    return this.state.clawMisses;
  }

  set clawMisses(misses: number) {
    const state = this.state;
    const n = Math.max(0, Math.floor(misses));
    if (n !== state.clawMisses) this.store.save({ ...state, clawMisses: n });
  }
}

function readHabits(data: unknown): HabitsFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<Record<keyof HabitsFile, unknown>>;
  const plays = typeof d.plays === 'object' && d.plays !== null && !Array.isArray(d.plays)
    ? Object.fromEntries(Object.entries(d.plays).filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n > 0).map(([id, n]) => [id, Math.floor(n as number)]))
    : {};
  const clawMisses = typeof d.clawMisses === 'number' && Number.isFinite(d.clawMisses) ? Math.max(0, Math.floor(d.clawMisses)) : 0;
  return { plays, clawMisses };
}
