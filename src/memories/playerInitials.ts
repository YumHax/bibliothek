import { Listeners } from '@/core/Listeners';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';

/*
 * THE PLAYER'S INITIALS as they typed them at fourteen (docs/grandma.md "In the films"): the three letters of the
 * record beaten in Mémé's memory "Three letters", typed in the film itself. Kept for the arcade: its spaceships
 * cabinet still has them on its table, and its initials screens start from them. Saved as `bibliothek.initials.v1`.
 */

interface InitialsState {
  /** Three letters, or null until typed in the film. */
  initials: string | null;
}

/** Three capital letters or digits: what an arcade table takes. */
function clean(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
}

export class PlayerInitials {
  private state: InitialsState;
  private readonly store: PersistedStore<InitialsState>;
  private readonly listeners = new Listeners<[initials: string]>();

  /** `fallback`: the letters to offer before any were typed in the film (the arcade's last signed), or null. */
  constructor(private readonly fallback: () => string | null = () => null, storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<InitialsState>({
      key: KEYS.playerInitials,
      version: 1,
      storage,
      defaults: () => ({ initials: null }),
      read: (data) => {
        const raw = (data as Partial<InitialsState> | null)?.initials;
        return { initials: typeof raw === 'string' && clean(raw).length === 3 ? clean(raw) : null };
      },
    });
    this.state = this.store.load();
  }

  /** The letters typed in the film, or null. */
  get value(): string | null {
    return this.state.initials;
  }

  /** What the film's entry starts from: the letters typed before, else the arcade's, else AAA. */
  suggested(): string {
    const other = clean(this.fallback() ?? '');
    return this.state.initials ?? (other.length === 3 ? other : 'AAA');
  }

  /** The letters typed (three letters or digits; anything else is ignored). */
  set(text: string): void {
    const initials = clean(text);
    if (initials.length !== 3 || initials === this.state.initials) return;
    this.state = { initials };
    this.store.save(this.state);
    this.listeners.emit(initials);
  }

  subscribe(fn: (initials: string) => void): () => void {
    return this.listeners.add(fn);
  }
}

/**
 * The record of that Saturday about 2003 on the arcade's spaceships cabinet (`invaders`), on its table to this day once
 * the initials are typed: the player's, and Félix's just under it (the score the kid beat). Read live, never saved
 * with the arcade's (`ArcadeScores.setPast`).
 */
export const RECORD_OF_2003 = { game: 'invaders', score: 3150, felix: { name: 'FLX', score: 2950 } } as const;

/** The two entries of that record, the player's under `initials`. */
export function recordOf2003(initials: string): { name: string; score: number; you?: boolean }[] {
  return [{ name: initials, score: RECORD_OF_2003.score, you: true }, { ...RECORD_OF_2003.felix }];
}
