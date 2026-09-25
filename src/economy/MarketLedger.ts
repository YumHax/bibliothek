import type { Game, PlatformId } from '@/catalog/types';

export const LEDGER_STORAGE_KEY = 'bibliothek.market.v1';

/** A game sold at the WE BUY desk goes on its platform's stall the next day, and stays this many days. */
export const CONSIGNMENT_DAYS = 3;
/** Notice-board cards dealt with are remembered this many market days (longer than any card stays up). */
const CARD_MEMORY_DAYS = 7;

/** A second-hand copy ordered at the mail-order counter: on its stall from `day`, deposit paid, the price agreed. */
export interface MarketOrder {
  game: Game;
  /** The market day it turns up (and stays on the stall from). */
  day: number;
  deposit: number;
  price: number;
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
  /** Copies held for the player: the deposit paid per game id. */
  holds: Record<string, number>;
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

  constructor(
    private readonly storage: Storage | null = safeLocalStorage(),
    private readonly key = LEDGER_STORAGE_KEY,
  ) {
    this.state = this.load() ?? { today: emptyDay(0), consigned: [], orders: [], cards: {} };
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
    return this.on(day)?.holds[id];
  }

  hold(day: number, id: string, deposit: number): void {
    this.edit(day, (t) => ({ ...t, holds: { ...t.holds, [id]: deposit } }));
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
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.state));
    } catch (err) {
      console.warn('[market] could not persist the ledger', err);
    }
  }

  private load(): LedgerFile | null {
    const text = this.storage?.getItem(this.key);
    if (!text) return null;
    try {
      const file = JSON.parse(text) as Partial<LedgerFile> & { day?: number; haggles?: Record<string, number> };
      if (!Array.isArray(file.consigned)) return null;
      // v1 kept only the day's haggles, at the top level.
      const today = file.today ?? { ...emptyDay(file.day ?? 0), haggles: file.haggles ?? {} };
      return { today: { ...emptyDay(today.day), ...today }, consigned: file.consigned, orders: Array.isArray(file.orders) ? file.orders : [], cards: file.cards ?? {} };
    } catch {
      return null;
    }
  }
}

function emptyDay(day: number): Today {
  return { day, haggles: {}, mood: {}, rivalSold: [], holds: {}, caught: [], coffee: false, lot: false };
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
