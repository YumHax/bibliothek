import type { Game, PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { SEED_GAMES } from '@/catalog';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { COLLECTOR_SETS, normaliseTitle, setProgress } from './collectorSets';

/** A set of the collectors' club completed, or every game of a console's built-in list. */
export type HonourKind = 'set' | 'console';

export interface Honour {
  /** `set:<club set id>` or `console:<platform>`. */
  id: string;
  kind: HonourKind;
  /** The set's name, or the console's. */
  name: string;
  platform: PlatformId;
  /** The in-game day it was completed. */
  day: number;
  /** The club came round to see it. */
  visited: boolean;
}

interface HonoursState {
  /** In the order they were earned: an honour stays earned (a game sold later does not put the neon out). */
  earned: Honour[];
}

/** Changes gathered for this long before the collection is looked at again (a job lot adds five games at once). */
const SETTLE_MS = 400;

/** Something that changes and says so, with its games. */
interface Watched {
  subscribe(cb: () => void): () => void;
  readonly games: readonly Game[];
}

/**
 * What the collection has completed for good (`KEYS.honours`): a set of the collectors' club (`collectorSets`), or a
 * console's whole built-in list (every game of `SEED_GAMES` on it, matched by title like the club's sets). Each lights
 * a neon over the living room's bookcases (`world/collector/honours`) and brings the club's visitor round once
 * (`visitors/gathering/ClubVisit`). Watches the collection itself; `subscribe` hears a new one.
 */
export class Honours {
  private state: HonoursState;
  private readonly store: PersistedStore<HonoursState>;
  private readonly listeners = new Set<(fresh: readonly Honour[]) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly collection: Watched,
    private readonly day: () => number,
    storage: Storage | null = safeStorage(),
  ) {
    this.store = new PersistedStore<HonoursState>({ key: KEYS.honours, version: 1, storage, defaults: () => ({ earned: [] }), read: readHonours });
    this.state = this.store.load();
    collection.subscribe(() => this.soon());
    this.soon();
  }

  /** Every honour earned, in the order they were. */
  get earned(): readonly Honour[] {
    return this.state.earned;
  }

  /** The first honour the club has not come to see yet. */
  get unvisited(): Honour | null {
    return this.state.earned.find((h) => !h.visited) ?? null;
  }

  /** The club came round to see `id`. */
  visited(id: string): void {
    const earned = this.state.earned.map((h) => (h.id === id ? { ...h, visited: true } : h));
    this.state = { earned };
    this.store.save(this.state);
  }

  /** Hears new honours (none at start: those earned before are in `earned`); returns an unsubscribe function. */
  subscribe(cb: (fresh: readonly Honour[]) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Looks at the collection now: what it completes that was not earned yet is, from today. */
  refresh(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const have = new Set(this.state.earned.map((h) => h.id));
    const fresh = completed(this.collection.games, this.day()).filter((h) => !have.has(h.id));
    if (!fresh.length) return;
    this.state = { earned: [...this.state.earned, ...fresh] };
    this.store.save(this.state);
    for (const cb of [...this.listeners]) cb(fresh);
  }

  private soon(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => this.refresh(), SETTLE_MS);
  }
}

/** A console's built-in list (`SEED_GAMES`) as the collector's book ticks it: each game, and whether a copy is here. */
interface ConsoleChecklist {
  platform: PlatformId;
  name: string;
  entries: { game: Game; have: boolean }[];
}

/**
 * Every console's built-in list against `games` (matched by title, the wishlist left out), the book's Consoles page:
 * a console whose list is all ticked is an honour (a neon over the bookcases). Lists of fewer than two are left out.
 */
export function consoleChecklists(games: readonly Game[]): ConsoleChecklist[] {
  const owned = new Set(games.filter((g) => g.status !== 'wishlist').map((g) => `${g.platform}:${normaliseTitle(g.title)}`));
  const lists = new Map<PlatformId, Game[]>();
  for (const game of SEED_GAMES) lists.set(game.platform, [...(lists.get(game.platform) ?? []), game]);
  return [...lists]
    .filter(([, list]) => list.length >= 2)
    .map(([platform, list]) => ({ platform, name: getPlatform(platform).name, entries: list.map((game) => ({ game, have: owned.has(`${game.platform}:${normaliseTitle(game.title)}`) })) }));
}

/** The consoles whose whole built-in list is in `games`, and the club's sets they complete, as honours of `day`. */
function completed(games: readonly Game[], day: number): Honour[] {
  const mine = games.filter((g) => g.status !== 'wishlist');
  const out: Honour[] = [];
  for (const set of COLLECTOR_SETS) {
    if (!setProgress(set, mine).every((p) => p.have)) continue;
    out.push({ id: `set:${set.id}`, kind: 'set', name: set.name, platform: set.pieces[0]!.platform, day, visited: false });
  }
  for (const list of consoleChecklists(mine)) {
    if (!list.entries.every((e) => e.have)) continue;
    out.push({ id: `console:${list.platform}`, kind: 'console', name: list.name, platform: list.platform, day, visited: false });
  }
  return out;
}

function readHonours(data: unknown): HonoursState | null {
  const raw = data as { earned?: unknown } | null;
  if (typeof raw !== 'object' || raw === null) return null;
  const earned = (Array.isArray(raw.earned) ? raw.earned : []).filter(
    (h): h is Honour => typeof h === 'object' && h !== null && typeof (h as Honour).id === 'string' && ((h as Honour).kind === 'set' || (h as Honour).kind === 'console') && typeof (h as Honour).platform === 'string' && typeof (h as Honour).day === 'number',
  ).map((h) => ({ id: h.id, kind: h.kind, name: typeof h.name === 'string' ? h.name : h.id, platform: h.platform, day: h.day, visited: h.visited === true }));
  return { earned };
}
