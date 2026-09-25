import type { BoxCondition, Edition, Game, PlatformId } from '@/catalog/types';
import { PLATFORMS } from '@/catalog/platforms';
import { canonicalGameId } from '@/catalog';
import { readGame } from '@/catalog/validate';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { CARD_MEMORY_DAYS, CONSIGNMENT_DAYS } from './pricing';
import type { StockSource } from './StockItem';

export const LEDGER_STORAGE_KEY = KEYS.market;

export { CONSIGNMENT_DAYS } from './pricing';

/** A second-hand copy ordered at the mail-order counter: on its stall from `day`, deposit paid, the price agreed. */
export interface MarketOrder {
  game: Game;
  /** The market day it turns up (and stays on the stall from). */
  day: number;
  deposit: number;
  price: number;
}

/** The copy a hold is on, as it was on the stall: the day's stock puts it back whatever the draw gives. */
export interface HeldCopy {
  game: Game;
  condition: BoxCondition;
  source: StockSource;
  /** Its list price (before any haggle) when the hold was paid. */
  list: number;
  edition?: Edition;
  repro?: boolean;
  gem?: boolean;
}

/** A hold: the deposit paid, and the copy (absent for holds saved before copies were kept). */
export interface Hold {
  deposit: number;
  copy?: HeldCopy;
}

/** What the market remembers of one market day; forgotten when the next one starts. */
interface Today {
  day: number;
  /** Price factor agreed per game id (1 = the stallholder would not move). */
  haggles: Record<string, number>;
  /** How soured each stall is after insulting offers (0 = fine). */
  mood: Partial<Record<PlatformId, number>>;
  /** Copies other shoppers bought, gone from the stalls for the day. */
  rivalSold: string[];
  /** Copies held for the player, per game id. */
  holds: Record<string, Hold>;
  /** Reproductions the player found out while still on the stall. */
  caught: string[];
  /** A coffee was had. */
  coffee: boolean;
  /** The job lot was bought. */
  lot: boolean;
}

interface LedgerFile {
  today: Today;
  /** Games sold to the market, with the day they were sold on. */
  consigned: { game: Game; day: number }[];
  /** Second-hand copies ordered, until bought. */
  orders: MarketOrder[];
  /** Notice-board cards dealt with (a wanted ad answered, a private sale bought): card id -> the day, kept a week. */
  cards: Record<string, number>;
}

/**
 * The market's memory across visits and reloads: what happened today (haggles, soured stalls,
 * what other shoppers bought, the player's holds, found-out fakes, the coffee, the job lot), the
 * notice-board cards dealt with, the games the player sold, which come back on the stalls, and
 * the copies ordered at the counter. Persisted to localStorage.
 */
export class MarketLedger {
  private state: LedgerFile;
  private readonly store: PersistedStore<LedgerFile>;

  constructor(
    storage: Storage | null = safeStorage(),
    key: string = LEDGER_STORAGE_KEY,
  ) {
    // Version 2: a hold keeps its copy. Version 1 held deposits only (and its first form only the day's haggles, at the top level).
    this.store = new PersistedStore<LedgerFile>({
      key,
      version: 2,
      storage,
      defaults: () => ({ today: emptyDay(0), consigned: [], orders: [], cards: {} }),
      read: readLedger,
      migrate: { 1: fromVersion1 },
    });
    this.state = this.store.load();
  }

  /** The factor agreed on `id` today, or undefined when not haggled yet. */
  haggleOf(day: number, id: string): number | undefined {
    return this.on(day)?.haggles[id];
  }

  recordHaggle(day: number, id: string, factor: number): void {
    this.edit(day, (t) => ({ ...t, haggles: { ...t.haggles, [id]: factor } }));
  }

  /** How soured `platform`'s stallholder is today. */
  moodOf(day: number, platform: PlatformId): number {
    return this.on(day)?.mood[platform] ?? 0;
  }

  sour(day: number, platform: PlatformId): void {
    this.edit(day, (t) => ({ ...t, mood: { ...t.mood, [platform]: (t.mood[platform] ?? 0) + 1 } }));
  }

  /** Copies other shoppers bought today. */
  rivalSold(day: number): ReadonlySet<string> {
    return new Set(this.on(day)?.rivalSold ?? []);
  }

  recordRivalSale(day: number, id: string): void {
    this.edit(day, (t) => ({ ...t, rivalSold: [...t.rivalSold, id] }));
  }

  /** The deposit on a copy held for the player today, or undefined. */
  holdOf(day: number, id: string): number | undefined {
    return this.on(day)?.holds[id]?.deposit;
  }

  /** The copies held today whose copy is known (every hold paid since copies were kept). */
  heldCopies(day: number): (HeldCopy & { deposit: number })[] {
    return Object.values(this.on(day)?.holds ?? {}).flatMap((h) => (h.copy ? [{ ...h.copy, deposit: h.deposit }] : []));
  }

  /** A deposit was paid on `id` today; `copy` is the copy as it stands on the stall (so the day's stock can always put it back). */
  hold(day: number, id: string, deposit: number, copy?: HeldCopy): void {
    this.edit(day, (t) => ({ ...t, holds: { ...t.holds, [id]: copy ? { deposit, copy } : { deposit } } }));
  }

  /** The copy was bought (or handed back): its hold is spent. */
  release(day: number, id: string): void {
    this.edit(day, (t) => {
      const { [id]: _gone, ...holds } = t.holds;
      return { ...t, holds };
    });
  }

  isCaught(day: number, id: string): boolean {
    return this.on(day)?.caught.includes(id) ?? false;
  }

  catchRepro(day: number, id: string): void {
    this.edit(day, (t) => ({ ...t, caught: [...t.caught, id] }));
  }

  hadCoffee(day: number): boolean {
    return this.on(day)?.coffee ?? false;
  }

  recordCoffee(day: number): void {
    this.edit(day, (t) => ({ ...t, coffee: true }));
  }

  lotBought(day: number): boolean {
    return this.on(day)?.lot ?? false;
  }

  recordLot(day: number): void {
    this.edit(day, (t) => ({ ...t, lot: true }));
  }

  /** Whether a notice-board card was dealt with (a card id names its day: wanted ads stay up several days). */
  cardDone(id: string): boolean {
    return id in this.state.cards;
  }

  recordCard(day: number, id: string): void {
    const cards = Object.fromEntries(Object.entries(this.state.cards).filter(([, d]) => day - d <= CARD_MEMORY_DAYS));
    this.state = { ...this.state, cards: { ...cards, [id]: day } };
    this.save();
  }

  /** The player sold `game` on `day`: it goes on sale from the day after. A copy sold again replaces the older entry. */
  consign(game: Game, day: number): void {
    const consigned = this.state.consigned.filter((c) => c.game.id !== game.id && day - c.day <= CONSIGNMENT_DAYS);
    this.state = { ...this.state, consigned: [...consigned, { game, day }] };
    this.save();
  }

  /** What the player sold that is on the stalls on `day`, oldest first. */
  consignedOn(day: number): Game[] {
    return this.state.consigned.filter((c) => c.day < day && day - c.day <= CONSIGNMENT_DAYS).map((c) => c.game);
  }

  /** Every copy on order, due or not. */
  get orders(): readonly MarketOrder[] {
    return this.state.orders;
  }

  order(order: MarketOrder): void {
    this.state = { ...this.state, orders: [...this.state.orders.filter((o) => o.game.id !== order.game.id), order] };
    this.save();
  }

  /** The ordered copy was bought: the order is done. */
  fulfil(id: string): void {
    this.state = { ...this.state, orders: this.state.orders.filter((o) => o.game.id !== id) };
    this.save();
  }

  private on(day: number): Today | null {
    return this.state.today.day === day ? this.state.today : null;
  }

  private edit(day: number, change: (today: Today) => Today): void {
    this.state = { ...this.state, today: change(this.on(day) ?? emptyDay(day)) };
    this.save();
  }

  private save(): void {
    this.store.save(this.state);
  }
}

function emptyDay(day: number): Today {
  return { day, haggles: {}, mood: {}, rivalSold: [], holds: {}, caught: [], coffee: false, lot: false };
}

/** Version 1 -> 2: a hold was its deposit; the first form of the file kept only the day's haggles at the top level. */
function fromVersion1(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data;
  const file = data as { today?: unknown; day?: unknown; haggles?: unknown };
  const today = (typeof file.today === 'object' && file.today !== null ? file.today : { day: file.day, haggles: file.haggles }) as { holds?: unknown };
  const holds = Object.fromEntries(Object.entries(record(today.holds)).map(([id, deposit]) => [id, { deposit }]));
  return { ...data, today: { ...today, holds } };
}

/** The ledger as saved, every part checked (what cannot be read is dropped part by part), old seed ids mapped. */
function readLedger(data: unknown): LedgerFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const file = data as Partial<Record<keyof LedgerFile, unknown>>;
  const t = record(file.today);
  const id = canonicalGameId;
  const today: Today = {
    day: typeof t.day === 'number' ? t.day : 0,
    haggles: Object.fromEntries(Object.entries(record(t.haggles)).filter(([, f]) => typeof f === 'number').map(([k, f]) => [id(k), f as number])),
    mood: Object.fromEntries(Object.entries(record(t.mood)).filter(([p, n]) => p in PLATFORMS && typeof n === 'number')),
    rivalSold: strings(t.rivalSold).map(id),
    holds: Object.fromEntries(Object.entries(record(t.holds)).flatMap(([k, h]) => {
      const hold = readHold(h);
      return hold ? [[id(k), hold]] : [];
    })),
    caught: strings(t.caught).map(id),
    coffee: t.coffee === true,
    lot: t.lot === true,
  };
  const consigned = (Array.isArray(file.consigned) ? file.consigned : []).flatMap((c: { game?: unknown; day?: unknown }) => {
    const game = readGame(c?.game);
    return game && typeof c.day === 'number' ? [{ game, day: c.day }] : [];
  });
  const orders = (Array.isArray(file.orders) ? file.orders : []).flatMap((o: Partial<Record<keyof MarketOrder, unknown>>) => {
    const game = readGame(o?.game);
    return game && typeof o.day === 'number' && typeof o.deposit === 'number' && typeof o.price === 'number'
      ? [{ game, day: o.day, deposit: o.deposit, price: o.price }]
      : [];
  });
  // A card id names its game last ("w:12:<game id>").
  const cards = Object.fromEntries(Object.entries(record(file.cards)).filter(([, d]) => typeof d === 'number').map(([k, d]) => {
    const [kind, day, ...game] = k.split(':');
    return [game.length ? `${kind}:${day}:${id(game.join(':'))}` : k, d as number];
  }));
  return { today, consigned, orders, cards };
}

function readHold(value: unknown): Hold | null {
  const h = record(value);
  if (typeof h.deposit !== 'number') return null;
  const c = record(h.copy);
  const game = readGame(c.game);
  if (!game || typeof c.list !== 'number' || typeof c.source !== 'string' || typeof c.condition !== 'string') return { deposit: h.deposit };
  const copy: HeldCopy = { game, condition: c.condition as BoxCondition, source: c.source as StockSource, list: c.list };
  if (typeof c.edition === 'string') copy.edition = c.edition as Edition;
  if (c.repro === true) copy.repro = true;
  if (c.gem === true) copy.gem = true;
  return { deposit: h.deposit, copy };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
