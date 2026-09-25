import type { Replay } from './Replay';

export const REPLAYS_KEY = 'bibliothek.arcadeReplays.v1';

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

  constructor(
    private readonly storage: Storage | null = safeLocalStorage(),
    private readonly key = REPLAYS_KEY,
  ) {
    this.state = this.load();
  }

  get(gameId: string): Replay | null {
    return this.state[gameId] ?? null;
  }

  save(gameId: string, replay: Replay): void {
    this.state = { ...this.state, [gameId]: replay };
    this.commit();
  }

  drop(gameId: string): void {
    if (!this.state[gameId]) return;
    const { [gameId]: _dropped, ...rest } = this.state;
    this.state = rest;
    this.commit();
  }

  private commit(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.state));
    } catch (err) {
      console.warn('[arcade] could not persist the replays', err);
    }
  }

  private load(): Record<string, Replay> {
    try {
      const parsed = JSON.parse(this.storage?.getItem(this.key) ?? 'null') as Record<string, Partial<Replay>> | null;
      const out: Record<string, Replay> = {};
      if (!parsed || typeof parsed !== 'object') return out;
      for (const [id, r] of Object.entries(parsed)) {
        if (typeof r?.seed !== 'number' || typeof r.score !== 'number' || !Array.isArray(r.runs)) continue;
        out[id] = { seed: r.seed, score: r.score, initials: typeof r.initials === 'string' ? r.initials : 'YOU', runs: r.runs.filter((n) => typeof n === 'number'), aim: r.aim === true };
      }
      return out;
    } catch {
      return {};
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
