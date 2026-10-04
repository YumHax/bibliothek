import { KEYS } from '@/persistence/keys';
import { PersistedStore } from '@/persistence/PersistedStore';

/*
 * "Done today", kept in one place. A thing that happens once a day (the cat's treat, the radio's chronicle, the
 * concierge's tip, the day's post collected, the market day's coin picked up) used to keep its own marker in its own
 * store, each with its own empty value (`-1`, `0`, `null`, `-99`, `''`); they all live here now, under a name, in
 * `daily.v1`. A marker follows the day its feature follows: a GAME day is a number (`Today.gameDay`), a REAL day a
 * `dayKey` string (`Today.realDay`); the type of `day` says which. Nothing else is remembered: a feature that needs
 * more than "done" (what was done, how many) keeps that itself and asks here only whether today is done.
 */

interface DailyState {
  /** Marker -> the last game day it was done. */
  game: Record<string, number>;
  /** Marker -> the last real day (`dayKey`) it was done. */
  real: Record<string, string>;
}

function read(data: unknown): DailyState | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as { game?: unknown; real?: unknown };
  const game: Record<string, number> = {};
  const real: Record<string, string> = {};
  if (typeof raw.game === 'object' && raw.game !== null) {
    for (const [id, day] of Object.entries(raw.game as Record<string, unknown>)) if (typeof day === 'number' && Number.isFinite(day)) game[id] = day;
  }
  if (typeof raw.real === 'object' && raw.real !== null) {
    for (const [id, day] of Object.entries(raw.real as Record<string, unknown>)) if (typeof day === 'string') real[id] = day;
  }
  return { game, real };
}

class OncePerDay {
  private state: DailyState | null = null;

  constructor(private readonly store = new PersistedStore<DailyState>({ key: KEYS.daily, version: 1, defaults: () => ({ game: {}, real: {} }), read })) {}

  /** Whether `id` was done on `day` (a game day number, or a real `dayKey`). */
  done(id: string, day: number | string): boolean {
    const s = this.load();
    return typeof day === 'number' ? s.game[id] === day : s.real[id] === day;
  }

  /** Marks `id` done on `day`; a later `done(id, day)` is true until the day turns. */
  mark(id: string, day: number | string): void {
    const s = this.load();
    if (typeof day === 'number') s.game[id] = day;
    else s.real[id] = day;
    this.store.save(s);
  }

  /** The last day `id` was done, or null (a game day number, or a real `dayKey`, as `mark` was given). */
  lastDone(id: string): number | string | null {
    const s = this.load();
    return s.game[id] ?? s.real[id] ?? null;
  }

  /**
   * Takes over a marker from the store that used to keep it: `oldDay` is what that store saved (its own empty value
   * means never). Nothing is written when this store already knows the marker, so the old field is read once and can
   * then go.
   */
  adopt(id: string, oldDay: number | string | null | undefined, empty: number | string | null = -1): void {
    if (oldDay === null || oldDay === undefined || oldDay === empty || oldDay === '') return;
    const s = this.load();
    if (typeof oldDay === 'number') {
      if (!Number.isFinite(oldDay) || id in s.game) return;
      s.game[id] = oldDay;
    } else {
      if (id in s.real) return;
      s.real[id] = oldDay;
    }
    this.store.save(s);
  }

  private load(): DailyState {
    return (this.state ??= this.store.load());
  }
}

/** The one book of what was done today (`KEYS.daily`). */
export const oncePerDay = new OncePerDay();
