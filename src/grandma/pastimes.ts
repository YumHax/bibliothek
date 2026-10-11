import { KEYS, PersistedStore, safeStorage } from '@/persistence';

/*
 * WHAT THE PLAYER DOES WITH MÉMÉ (docs/grandma.md "Things to do with her"): the afternoon's quiz on her set, the
 * morning's crossword, a game of cards in the evening, holding the wool while she knits. Each once a game day but the
 * cards; the wool's sessions knit the player's scarf (`WOOL_FOR_SCARF`); the cards' tally, kept on the back of an
 * envelope. Saved as `bibliothek.grandmaPastimes.v1`.
 */

/** What can be done with her: each its hour (`world/grandma/visit/pastimes`). */
type Pastime = 'quiz' | 'crossword' | 'wool';

/** Sessions holding the wool, on different days, before the scarf is done. */
export const WOOL_FOR_SCARF = 3;

/** What each does for her standing (once a game day each): warmth, and the chip's words. */
export const PASTIME_DEEDS = {
  quiz: { warmth: 4, why: 'loved shouting at the quiz with you' },
  crossword: { warmth: 3, why: 'glad of the help with her crossword' },
  cards: { warmth: 4, why: 'enjoyed the cards' },
  wool: { warmth: 5, why: 'loved the company while she knitted' },
} as const;

/** The quiz's coin for being clever: this many good answers, and ahead of her. */
export const QUIZ_COIN = { from: 4, coins: 2 } as const;

interface PastimesState {
  /** The game day each was last done (once a day). */
  last: Record<Pastime, number | null>;
  /** Sessions holding the wool, all told. */
  wool: number;
  /** The quiz's questions already asked and the crossword's words already found (ids), so the next ones are new. */
  asked: string[];
  solved: string[];
  /** The cards: games she won, games the player won. */
  cards: { her: number; you: number };
}

const fresh = (): PastimesState => ({ last: { quiz: null, crossword: null, wool: null }, wool: 0, asked: [], solved: [], cards: { her: 0, you: 0 } });

class MemePastimes {
  private state: PastimesState;
  private readonly store: PersistedStore<PastimesState>;

  constructor(storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<PastimesState>({ key: KEYS.grandmaPastimes, version: 1, storage, defaults: fresh, read: readState });
    this.state = this.store.load();
  }

  /** Whether `pastime` was done already on game day `day`. */
  doneOn(pastime: Pastime, day: number): boolean {
    return this.state.last[pastime] === day;
  }

  /** `pastime` done on game day `day`. */
  done(pastime: Pastime, day: number): void {
    this.commit({ ...this.state, last: { ...this.state.last, [pastime]: day } });
  }

  /** A session holding the wool, on `day`: returns the sessions all told. */
  heldWool(day: number): number {
    const wool = this.state.wool + 1;
    this.commit({ ...this.state, wool, last: { ...this.state.last, wool: day } });
    return wool;
  }

  get woolSessions(): number {
    return this.state.wool;
  }

  get asked(): readonly string[] {
    return this.state.asked;
  }

  get solved(): readonly string[] {
    return this.state.solved;
  }

  /** The quiz's questions `ids` asked (the oldest forgotten once every one has been). */
  ask(ids: readonly string[], bank: number): void {
    const asked = [...this.state.asked, ...ids];
    this.commit({ ...this.state, asked: asked.slice(Math.max(0, asked.length - (bank - 5))) });
  }

  /** The crossword's word `id` found (the oldest forgotten once every one has been). */
  solve(id: string, bank: number): void {
    const solved = [...this.state.solved, id];
    this.commit({ ...this.state, solved: solved.slice(Math.max(0, solved.length - (bank - 1))) });
  }

  /** The cards' tally on the back of her envelope. */
  get tally(): { readonly her: number; readonly you: number } {
    return this.state.cards;
  }

  /** A game of cards over: who went out first. */
  cardsWon(by: 'her' | 'you'): void {
    const cards = { ...this.state.cards, [by]: this.state.cards[by] + 1 };
    this.commit({ ...this.state, cards });
  }

  /** `?debug`: every pastime open again today; with `nearScarf`, one session of wool short of the scarf. */
  debugAgain(nearScarf: boolean): void {
    this.commit({ ...this.state, last: { quiz: null, crossword: null, wool: null }, wool: nearScarf ? WOOL_FOR_SCARF - 1 : this.state.wool });
  }

  private commit(state: PastimesState): void {
    this.state = state;
    this.store.save(state);
  }
}

function readState(data: unknown): PastimesState | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Partial<Record<keyof PastimesState, unknown>>;
  const day = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string') : []);
  const last = (typeof raw.last === 'object' && raw.last !== null ? raw.last : {}) as Partial<Record<Pastime, unknown>>;
  const cards = (typeof raw.cards === 'object' && raw.cards !== null ? raw.cards : {}) as Partial<Record<'her' | 'you', unknown>>;
  return {
    last: { quiz: day(last.quiz), crossword: day(last.crossword), wool: day(last.wool) },
    wool: count(raw.wool),
    asked: ids(raw.asked),
    solved: ids(raw.solved),
    cards: { her: count(cards.her), you: count(cards.you) },
  };
}

let shared: MemePastimes | null = null;

/** The one record of what the player did with her (her flat's visits and `?debug` read the same). */
export function memePastimes(): MemePastimes {
  return (shared ??= new MemePastimes());
}
