import type { Game, PlatformId } from '@/catalog/types';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import type { Views } from './Fame';
import { shopPrice } from './pricing';
import { seeded } from './seeded';

/** Who lives behind a door on the stairs: the door's key (`landing:index`), the name, the floor's name. */
export interface Resident {
  door: string;
  who: string;
  floor: string;
}

/** A neighbour's swap: they want one of the player's games and would give one of theirs for it. */
export interface TradeOffer {
  /** `day:door`: unique. */
  id: string;
  door: string;
  who: string;
  floor: string;
  wants: { id: string; title: string; platform: PlatformId };
  gives: Game;
  /** The market day it was made, and the last one it stands. */
  day: number;
  until: number;
}

interface State {
  /** The market day last looked at (one draw a day). */
  day: number;
  offer: TradeOffer | null;
  /** Offers swapped or turned down. */
  done: string[];
}

export interface NeighbourTradesOptions {
  collection: { readonly games: readonly Game[]; owns(id: string): boolean; find?(id: string): Game | undefined };
  /** The market: its in-game day, and games from the index at large (seeded). */
  market: { readonly day: number; randomGames(seed: string, count: number): Promise<Game[]> };
  fame: { lookup(game: Pick<Game, 'id' | 'title' | 'platform'>): Promise<Views> };
  residents: readonly Resident[];
  storage?: Storage | null;
}

/** Share of market days a neighbour slips a note under the door. */
const ODDS = 0.35;
/** Market days an offer stands. */
const LASTS = 3;
/** Owned games before anyone asks for one. */
const MIN_OWNED = 3;
/** Games of theirs the neighbour considers giving. */
const CANDIDATES = 10;
/** What they give is worth this share of what they get: fair, a little generous at best. */
const FAIR: readonly [number, number] = [0.8, 1.35];
const IDEAL = 1.05;

/**
 * The neighbours' swaps. Some market days (`ODDS`, drawn per day, the same whenever looked at) one
 * of the residents wants a game the player owns (not lent) and offers one of theirs of about the
 * same worth (`shopPrice` with its fame, within `FAIR`) that the player does not have. The offer
 * stands `LASTS` days at their door on the stairs; `onOffer` hears of each new one (the note under
 * the door). `complete` / `decline` end it. The day's draw and the offers dealt with persist.
 */
export class NeighbourTrades {
  private state: State;
  private readonly store: PersistedStore<State>;
  private drawing = false;
  private readonly listeners = new Set<(offer: TradeOffer) => void>();

  constructor(private readonly options: NeighbourTradesOptions) {
    this.store = new PersistedStore<State>({ key: KEYS.neighbourTrades, version: 1, storage: options.storage === undefined ? safeStorage() : options.storage, defaults: () => ({ day: 0, offer: null, done: [] }), read: readState });
    this.state = this.store.load();
  }

  /** The offer standing now, if any (not dealt with, not expired). */
  get offer(): TradeOffer | null {
    const offer = this.state.offer;
    if (!offer || this.state.done.includes(offer.id) || offer.until < this.options.market.day) return null;
    return offer;
  }

  /** The standing offer at `door`, if it is that neighbour's. */
  offerAt(door: string): TradeOffer | null {
    const offer = this.offer;
    return offer?.door === door ? offer : null;
  }

  /** Whether the player can make the swap now: they still own what is wanted (not lent) and not what is offered. */
  canSwap(offer: TradeOffer): boolean {
    const { collection } = this.options;
    const mine = collection.find?.(offer.wants.id) ?? collection.games.find((g) => g.id === offer.wants.id);
    return !!mine && mine.status !== 'lent' && mine.status !== 'wishlist' && !collection.owns(offer.gives.id);
  }

  /** Hears of each new offer (and, once, of the one standing when it subscribes). Returns the unsubscribe. */
  onOffer(listener: (offer: TradeOffer) => void): () => void {
    this.listeners.add(listener);
    const standing = this.offer;
    if (standing) listener(standing);
    return () => this.listeners.delete(listener);
  }

  /** Looks at the day: a new one may bring an offer (drawn in the background). Cheap: call it often. */
  refresh(): void {
    const day = this.options.market.day;
    if (day === this.state.day || this.drawing) return;
    const random = seeded(`neighbours:${day}`);
    if (this.offer || random() >= ODDS) {
      this.state = { ...this.state, day };
      this.store.save(this.state);
      return;
    }
    this.drawing = true;
    void this.draw(day, random).then((offer) => {
      this.drawing = false;
      if (this.options.market.day !== day) return;
      this.state = { ...this.state, day, offer: offer ?? this.state.offer };
      this.store.save(this.state);
      if (offer) for (const listener of [...this.listeners]) listener(offer);
    }, () => {
      this.drawing = false;
    });
  }

  /** The swap was made (call inside the swap's save: `Transactions.swapWithNeighbour`'s `alsoDo`). */
  complete(offer: TradeOffer): void {
    this.close(offer);
  }

  /** The player said no: the neighbour asks someone else. */
  decline(offer: TradeOffer): void {
    this.close(offer);
  }

  private close(offer: TradeOffer): void {
    if (this.state.done.includes(offer.id)) return;
    this.state = { ...this.state, done: [...this.state.done.slice(-40), offer.id] };
    this.store.save(this.state);
  }

  private async draw(day: number, random: () => number): Promise<TradeOffer | null> {
    const { collection, market, fame, residents } = this.options;
    const owned = collection.games.filter((g) => (g.status ?? 'owned') === 'owned' && !g.repro);
    if (owned.length < MIN_OWNED || !residents.length) return null;
    const wants = owned[Math.floor(random() * owned.length)]!;
    const resident = residents[Math.floor(random() * residents.length)]!;
    const worth = shopPrice(wants, await fame.lookup(wants));
    const candidates = (await market.randomGames(`neighbours:${day}:${resident.door}`, CANDIDATES)).filter((g) => g.id !== wants.id && !collection.owns(g.id));
    let best: { game: Game; score: number } | null = null;
    for (const game of candidates) {
      const ratio = shopPrice(game, await fame.lookup(game)) / worth;
      if (ratio < FAIR[0] || ratio > FAIR[1]) continue;
      const score = Math.abs(ratio - IDEAL);
      if (!best || score < best.score) best = { game, score };
    }
    if (!best) return null;
    return {
      id: `${day}:${resident.door}`,
      door: resident.door,
      who: resident.who,
      floor: resident.floor,
      wants: { id: wants.id, title: wants.title, platform: wants.platform },
      gives: { ...best.game, status: 'owned' },
      day,
      until: day + LASTS - 1,
    };
  }
}

function readState(data: unknown): State | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<State>;
  const offer = d.offer && typeof d.offer === 'object' && typeof d.offer.id === 'string' && typeof d.offer.door === 'string' && d.offer.gives && d.offer.wants ? d.offer : null;
  return {
    day: typeof d.day === 'number' ? d.day : 0,
    offer,
    done: Array.isArray(d.done) ? d.done.filter((id): id is string => typeof id === 'string') : [],
  };
}
