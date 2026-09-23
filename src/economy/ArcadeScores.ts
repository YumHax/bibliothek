export const ARCADE_SCORES_KEY = 'bibliothek.arcade.v1';

/** Best score per arcade game, persisted; the cabinets show it in their attract mode. */
export class ArcadeScores {
  private best: Record<string, number>;

  constructor(
    private readonly storage: Storage | null = safeLocalStorage(),
    private readonly key = ARCADE_SCORES_KEY,
  ) {
    this.best = this.load();
  }

  bestOf(gameId: string): number {
    return this.best[gameId] ?? 0;
  }

  /** Records `score`; true when it is a new best. */
  submit(gameId: string, score: number): boolean {
    if (score <= this.bestOf(gameId)) return false;
    this.best = { ...this.best, [gameId]: score };
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.best));
    } catch (err) {
      console.warn('[arcade] could not persist scores', err);
    }
    return true;
  }

  private load(): Record<string, number> {
    try {
      const parsed = JSON.parse(this.storage?.getItem(this.key) ?? 'null') as unknown;
      if (typeof parsed !== 'object' || parsed === null) return {};
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) if (typeof v === 'number') out[k] = v;
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
