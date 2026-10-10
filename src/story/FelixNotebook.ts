import type { Game } from '@/catalog/types';
import { SEED_GAMES } from '@/catalog';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';

/**
 * UNCLE FÉLIX'S NOTEBOOK (docs/story.md "Félix's notebook"): a school exercise book of his, found at the back of a
 * drawer of the flat, listing the games he loved most with a line beside each in his hand. Found, it puts every one
 * the player lacks on the wishlist (the stalls, the dreams and the wish cards look out for them); each one bought
 * back is ticked, and his line about it is read in the journal's notebook page. No rule, no reward but the line and the
 * shelf filling up as he had it: the frame's "putting the place back", one game at a time.
 */

/** One of his games: the seed game, and what he wrote beside it. */
interface Entry {
  id: string;
  line: string;
}

/** The games in the notebook, his words beside each (the seed collection's, so the art and the stalls know them). */
const ENTRIES: readonly Entry[] = [
  { id: 'nes-super-mario-bros-3', line: 'Christmas 1990. Played it till the tape on the box gave up.' },
  { id: 'nes-legend-of-zelda', line: 'The gold one. Mapped the whole thing on squared paper, the map is still in it somewhere.' },
  { id: 'nes-mega-man-2', line: 'Did it on Difficult to prove a point to Bernard. Point proven.' },
  { id: 'snes-chrono-trigger', line: 'Imported from a shop in London that is a sandwich bar now. Worth every franc.' },
  { id: 'snes-super-metroid', line: 'Lights off, sound up. Never with anyone watching.' },
  { id: 'snes-earthbound', line: 'The big box. Nobody here had heard of it. Everybody here should have.' },
  { id: 'megadrive-gunstar-heroes', line: 'Two players with the neighbours’ boy, Saturday mornings. He beat me at the end, I let him think it.' },
  { id: 'megadrive-phantasy-star-4', line: 'The last one I finished in a single week of holidays.' },
  { id: 'gb-zelda-links-awakening', line: 'On the train to Lyon and back, every month for a year. The battery cover is held on with tape.' },
  { id: 'gb-pokemon-red', line: 'Swapped a Mew for it in a café. Not proud. Not sorry either.' },
  { id: 'n64-zelda-ocarina-of-time', line: 'Bought the day it came out, in the rain, third in the queue.' },
  { id: 'ps1-castlevania-sotn', line: 'The upside-down castle. I still dream of the library.' },
];

/** How many of the still-missing titles the journal names as the next to look out for. */
const NEXT_SHOWN = 3;

interface NotebookState {
  /** The game day it was found, or null while it lies in its drawer. */
  found: number | null;
  /** His games bought back since, in the order they came home. */
  ticked: string[];
}

/** The collection as the notebook reads and writes it. */
interface Collection {
  readonly games: readonly Game[];
  owns(id: string): boolean;
  want(game: Game): void;
  subscribe(cb: () => void): () => void;
}

/** One of his games just come home: its title and his line, for the notices. */
interface Ticked {
  title: string;
  line: string;
  /** All of them home now. */
  last: boolean;
}

/** His games as the seed list has them (an id the catalogue lost is left out). */
function entries(): { entry: Entry; game: Game }[] {
  return ENTRIES.flatMap((entry) => {
    const game = SEED_GAMES.find((g) => g.id === entry.id);
    return game ? [{ entry, game }] : [];
  });
}

export class FelixNotebook {
  private state: NotebookState;
  private readonly store: PersistedStore<NotebookState>;
  private readonly listeners = new Set<(ticked: Ticked) => void>();

  constructor(private readonly collection: Collection, storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<NotebookState>({ key: KEYS.felixNotebook, version: 1, storage, defaults: () => ({ found: null, ticked: [] }), read: readState });
    this.state = this.store.load();
    collection.subscribe(() => this.tickOwned());
  }

  /** Whether it was found (it lies in its drawer until then). */
  get found(): boolean {
    return this.state.found !== null;
  }

  /** Found on game day `day`: every game of his the player lacks goes on the wishlist; those already home are ticked quietly. */
  find(day: number): void {
    if (this.found) return;
    const home = entries().filter(({ game }) => this.collection.owns(game.id)).map(({ game }) => game.id);
    this.commit({ found: day, ticked: home });
    for (const { game } of entries()) if (!this.collection.owns(game.id)) this.collection.want(game);
  }

  /** Hears each of his games coming home after the notebook was found. Returns the unsubscribe. */
  onTicked(cb: (ticked: Ticked) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** The journal's page for it: his lines for the games home again, the next few to look out for, or done. */
  file(): { title: string; clues: string[]; total: number; next?: string; done?: boolean } | null {
    if (!this.found) return null;
    const all = entries();
    const total = all.length;
    const clues = this.state.ticked.flatMap((id) => {
      const it = all.find(({ game }) => game.id === id);
      return it ? [`${it.game.title}: “${it.entry.line}”`] : [];
    });
    const missing = all.filter(({ game }) => !this.state.ticked.includes(game.id));
    const title = 'Uncle Félix’s notebook';
    if (!missing.length) return { title, clues, total, done: true };
    const named = missing.slice(0, NEXT_SHOWN).map(({ game }) => game.title).join(', ');
    const more = missing.length > NEXT_SHOWN ? ` and ${missing.length - NEXT_SHOWN} more` : '';
    // No clue yet: the journal draws the empty trail itself (a dot a game, none filled).
    return { title, clues, total, next: `still to find: ${named}${more}` };
  }

  /** His games the collection holds now and the notebook has not ticked: ticked, each told. */
  private tickOwned(): void {
    if (!this.found) return;
    const fresh = entries().filter(({ game }) => this.collection.owns(game.id) && !this.state.ticked.includes(game.id));
    if (!fresh.length) return;
    this.commit({ ...this.state, ticked: [...this.state.ticked, ...fresh.map(({ game }) => game.id)] });
    const done = this.state.ticked.length >= entries().length;
    fresh.forEach(({ game, entry }, i) => {
      for (const cb of [...this.listeners]) cb({ title: game.title, line: entry.line, last: done && i === fresh.length - 1 });
    });
  }

  private commit(state: NotebookState): void {
    this.state = state;
    this.store.save(state);
  }
}

function readState(data: unknown): NotebookState | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as { found?: unknown; ticked?: unknown };
  return {
    found: typeof raw.found === 'number' && Number.isFinite(raw.found) ? raw.found : null,
    ticked: Array.isArray(raw.ticked) ? raw.ticked.filter((id): id is string => typeof id === 'string') : [],
  };
}
