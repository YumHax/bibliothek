import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { SUNDAY_WEEKDAY, weekdayOf } from '@/time/wakefulness';
import { GRANDMA } from './grandma';
import { MEMORIES, type Memory, type MemoryFacts } from './memories';

/*
 * THE VISITS TO MÉMÉ'S (docs/story.md "Mémé"): how many, the last Sunday she gave the envelope, the memories of her
 * album already seen, what she was given and what she has heard of the player's doings. Saved as `bibliothek.grandma.v1`.
 */

/** What can be handed to her: a bunch from the florist's, a slice of the cake at home, the latest game shown. */
export type GrandmaGift = 'cake' | 'flowers' | 'game';

/** What happens at hers, for whoever listens (the social layer: docs/social.md). */
export type GrandmaEvent = { kind: 'visit'; sunday: boolean } | { kind: 'gift'; gift: GrandmaGift } | { kind: 'memory'; id: string };

/** What she has heard of: the news she may bring up, most telling first (`GRANDMA_TALK.news`). */
type GrandmaNews = 'prototype' | 'trail' | 'crane' | 'roomFull' | 'manyGames' | 'notebook' | 'medal' | 'games' | 'fewGames';

/** The stores' side of things, read live (`bootstrap/services`). */
interface GrandmaWorld {
  facts(): Omit<MemoryFacts, 'visits' | 'felixHome' | 'seen'> & {
    /** Times the rival collector was beaten to a copy. */
    craneBeaten: number;
    /** The prototype's trail under way. */
    trailStarted: boolean;
  };
  /** A cake out on the kitchen table at home. */
  cakeOut(): boolean;
  /** The florist's bunches in the pocket: whether one is, and taking it. */
  flowers: { carried(): boolean; take(): boolean };
  /** The game last come into the collection (shown to her once). */
  latestFind(): { id: string; title: string } | null;
}

interface GrandmaState {
  visits: number;
  /** The game day of the last Sunday envelope, or null. */
  envelope: number | null;
  /** The memories seen (`MEMORIES` ids), in the order they played. */
  seen: string[];
  /** A game of Félix's notebook came home after it was found (memory `sale`). */
  felixHome: boolean;
  /** The game days she was last given flowers and cake, and the id of the last game shown her. */
  flowers: number | null;
  cake: number | null;
  shown: string | null;
  /** The news she has told on the way in (each once). */
  told: GrandmaNews[];
  /** `?debug`: every filmed memory ready in turn, whatever unlocks it. */
  everyMemory: boolean;
  /** She has knitted the player's scarf: kept for good, whatever the standing does after. */
  scarf: boolean;
}

/** What an arrival at her door brings. */
interface Arrival {
  /** The first visit ever. */
  first: boolean;
  /** Coins in the Sunday envelope (0: not a Sunday, or given already today). */
  envelope: number;
}

const NEWS: readonly GrandmaNews[] = ['prototype', 'trail', 'crane', 'roomFull', 'manyGames', 'notebook', 'medal', 'games', 'fewGames'];

const fresh = (): GrandmaState => ({ visits: 0, envelope: null, seen: [], felixHome: false, flowers: null, cake: null, shown: null, told: [], everyMemory: false, scarf: false });

/**
 * The memories taken as filmed before her flat is first built this session (the album registers its reels then,
 * `setFilmed`): all of them, so the journal and her phone know of a memory waiting without a visit first.
 */
const FILMED_FIRST = new Set(MEMORIES.map((memory) => memory.id));

export class GrandmaVisits {
  private state: GrandmaState;
  private readonly store: PersistedStore<GrandmaState>;
  private readonly listeners = new Set<(event: GrandmaEvent) => void>();
  private filmed: (id: string) => boolean = (id) => FILMED_FIRST.has(id);

  constructor(private readonly world: GrandmaWorld | null = null, storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<GrandmaState>({ key: KEYS.grandma, version: 1, storage, defaults: fresh, read: readState });
    this.state = this.store.load();
  }

  /** Hears her visits, gifts and memories (docs/social.md). Returns the unsubscribe. */
  subscribe(listener: (event: GrandmaEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The player came in on game day `day`: counted, and on a Sunday the envelope (once that Sunday). */
  arrive(day: number): Arrival {
    const first = this.state.visits === 0;
    const isSunday = weekdayOf(day) === SUNDAY_WEEKDAY;
    const envelope = isSunday && this.state.envelope !== day;
    this.commit({ ...this.state, visits: this.state.visits + 1, envelope: envelope ? day : this.state.envelope });
    this.emit({ kind: 'visit', sunday: isSunday });
    return { first, envelope: envelope ? GRANDMA.sundayCoins : 0 };
  }

  /** Which memories have a film (the album's reels): only those are ever due. */
  setFilmed(hasReel: (id: string) => boolean): void {
    this.filmed = hasReel;
  }

  /** The first memory unlocked, filmed and not seen yet, or null. */
  get due(): Memory | null {
    const facts = this.facts();
    const { seen, everyMemory } = this.state;
    return MEMORIES.find((memory) => this.filmed(memory.id) && !seen.includes(memory.id) && (everyMemory || memory.unlocked(facts))) ?? null;
  }

  /** The memories seen, to watch again from the album (newest last). */
  get seen(): Memory[] {
    return this.state.seen.flatMap((id) => MEMORIES.filter((memory) => memory.id === id));
  }

  /** Whether the memory `id` has been seen (what she can bring herself to talk about). */
  hasSeen(id: string): boolean {
    return this.state.seen.includes(id);
  }

  /** What she says back in the room after `memory`: the first time, or watched again. */
  afterLine(memory: Memory): string {
    return this.hasSeen(memory.id) ? memory.againAfter : memory.after;
  }

  /** A memory played to its end. */
  markSeen(id: string): void {
    if (this.state.seen.includes(id)) return;
    this.commit({ ...this.state, seen: [...this.state.seen, id] });
    this.emit({ kind: 'memory', id });
  }

  /** A game of Félix's notebook came home after it was found (`FelixNotebook.onTicked`). */
  felixGameHome(): void {
    if (!this.state.felixHome) this.commit({ ...this.state, felixHome: true });
  }

  /** What the memories' unlocking reads. */
  facts(): MemoryFacts {
    const world = this.world?.facts();
    return {
      visits: this.state.visits,
      felixHome: this.state.felixHome,
      seen: this.state.seen.length,
      gamesOwned: world?.gamesOwned ?? 0,
      arcadeMedals: world?.arcadeMedals ?? 0,
      notebookFound: world?.notebookFound ?? false,
      clubSet: world?.clubSet ?? false,
      prototypeFound: world?.prototypeFound ?? false,
    };
  }

  /** The news she could bring up now, most telling first. */
  news(): GrandmaNews[] {
    const world = this.world?.facts();
    if (!world) return [];
    const holds: Record<GrandmaNews, boolean> = {
      prototype: world.prototypeFound,
      trail: world.trailStarted && !world.prototypeFound,
      crane: world.craneBeaten > 0,
      roomFull: world.gamesOwned >= 120,
      manyGames: world.gamesOwned >= 50,
      notebook: world.notebookFound,
      medal: world.arcadeMedals > 0,
      games: world.gamesOwned >= 10,
      fewGames: world.gamesOwned < 10,
    };
    return NEWS.filter((news) => holds[news]);
  }

  /** The most telling news not told on the way in yet, marked told; or null. */
  tellNews(): GrandmaNews | null {
    const news = this.news().find((n) => !this.state.told.includes(n)) ?? null;
    if (news) this.commit({ ...this.state, told: [...this.state.told, news] });
    return news;
  }

  /** What she can be given now on game day `day`, first of: flowers, cake, the latest game; or null. */
  forHer(day: number): GrandmaGift | null {
    const world = this.world;
    if (!world) return null;
    if (this.state.flowers !== day && world.flowers.carried()) return 'flowers';
    if (this.state.cake !== day && world.cakeOut()) return 'cake';
    const find = world.latestFind();
    if (find && find.id !== this.state.shown) return 'game';
    return null;
  }

  /** The latest game's title (the one a `game` gift shows her), or null. */
  latestTitle(): string | null {
    return this.world?.latestFind()?.title ?? null;
  }

  /** `gift` handed over on game day `day` (the flowers out of the pocket): the game's title for a game, else ''; null when it was not there. */
  give(gift: GrandmaGift, day: number): string | null {
    const world = this.world;
    if (!world) return null;
    if (gift === 'flowers') {
      if (!world.flowers.take()) return null;
      this.commit({ ...this.state, flowers: day });
    } else if (gift === 'cake') {
      if (!world.cakeOut()) return null;
      this.commit({ ...this.state, cake: day });
    }
    let title = '';
    if (gift === 'game') {
      const find = world.latestFind();
      if (!find) return null;
      this.commit({ ...this.state, shown: find.id });
      title = find.title;
    }
    this.emit({ kind: 'gift', gift });
    return title;
  }

  /** The scarf she knits once the player is close (`close`: her `knitsScarf` in force now): once knitted, for good. */
  scarfKnitted(close: boolean): boolean {
    if (close && !this.state.scarf) this.commit({ ...this.state, scarf: true });
    return this.state.scarf;
  }

  // --- `?debug` (the debug panel's Now) --------------------------------------------------------------

  /** Mémé as on the first day: no visit, no envelope, no memory seen, nothing given or told. */
  debugReset(): void {
    this.commit(fresh());
  }

  /** Every filmed memory ready in turn, whatever unlocks it. */
  debugEveryMemory(): void {
    this.commit({ ...this.state, everyMemory: true });
  }

  /** Every memory seen (her talk opens up; the album plays them again). */
  debugSeeAll(): void {
    this.commit({ ...this.state, seen: MEMORIES.map((memory) => memory.id) });
  }

  /** The Sunday envelope given again on the next Sunday visit (today's, if today is one). */
  debugSundayAgain(): void {
    this.commit({ ...this.state, envelope: null });
  }

  private emit(event: GrandmaEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  private commit(state: GrandmaState): void {
    this.state = state;
    this.store.save(state);
  }
}

function readState(data: unknown): GrandmaState | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Partial<Record<keyof GrandmaState, unknown>>;
  const day = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    visits: typeof raw.visits === 'number' && Number.isFinite(raw.visits) ? Math.max(0, Math.floor(raw.visits)) : 0,
    envelope: day(raw.envelope),
    seen: Array.isArray(raw.seen) ? raw.seen.filter((id): id is string => typeof id === 'string') : [],
    felixHome: raw.felixHome === true,
    flowers: day(raw.flowers),
    cake: day(raw.cake),
    shown: typeof raw.shown === 'string' ? raw.shown : null,
    told: Array.isArray(raw.told) ? raw.told.filter((n): n is GrandmaNews => NEWS.includes(n as GrandmaNews)) : [],
    everyMemory: raw.everyMemory === true,
    scarf: raw.scarf === true,
  };
}
