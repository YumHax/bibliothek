import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import type { Replay } from './Replay';

export const REPLAYS_KEY = KEYS.arcadeReplays;

/** Where a cabinet keeps and finds the player's best run on its game. */
export interface ReplayShelf {
  get(gameId: string): Replay | null;
  save(gameId: string, replay: Replay): void;
  drop(gameId: string): void;
}

/**
 * The player's best run per cabinet game, persisted: kept when a play sets a new personal best,
 * shown by the cabinet's attract screen ("YOUR BEST RUN"), dropped when it no longer replays to
 * its score (the game's rules changed since). A few kilobytes a game.
 */
export class ReplayStore implements ReplayShelf {
  private state: Record<string, Replay>;
  private readonly store: PersistedStore<Record<string, Replay>>;

  constructor(storage: Storage | null = safeStorage(), key: string = REPLAYS_KEY) {
    // Version 1: game id -> `{ seed, score, initials, runs, aim }`. A run that cannot be read is dropped alone.
    this.store = new PersistedStore<Record<string, Replay>>({ key, version: 1, storage, defaults: () => ({}), read: readReplays });
    this.state = this.store.load();
  }

  get(gameId: string): Replay | null {
    return this.state[gameId] ?? null;
  }

  save(gameId: string, replay: Replay): void {
    this.state = { ...this.state, [gameId]: replay };
    this.store.save(this.state);
  }

  drop(gameId: string): void {
    if (!this.state[gameId]) return;
    const { [gameId]: _dropped, ...rest } = this.state;
    this.state = rest;
    this.store.save(this.state);
  }
}

function readReplays(data: unknown): Record<string, Replay> | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const out: Record<string, Replay> = {};
  for (const [id, value] of Object.entries(data as Record<string, unknown>)) {
    const r = value as Partial<Replay> | null;
    if (typeof r?.seed !== 'number' || typeof r.score !== 'number' || !Array.isArray(r.runs)) continue;
    out[id] = { seed: r.seed, score: r.score, initials: typeof r.initials === 'string' ? r.initials : 'YOU', runs: r.runs.filter((n) => typeof n === 'number'), aim: r.aim === true };
  }
  return out;
}
