import type { PlatformId } from '@/catalog/types';
import { PLATFORMS } from '@/catalog/platforms';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { HOUSEHOLD } from './rules';
import { isOutfitId, type OutfitId } from './outfits';

/** What the cat left by its kitchen bowl: a few coins, or the lost booklet of a game on the shelves. */
export type CatGift = { kind: 'coins'; coins: number } | { kind: 'manual'; gameId: string; title: string };

interface HouseholdState {
  /** The cleaning kit was fetched from the bathroom cabinet: it lives on the kitchen table since. */
  kit: boolean;
  /** Market day and count of the boxes cleaned that day. */
  restored: { day: number; n: number };
  /** A bath was taken and no haggle has used its calm yet. */
  soaked: boolean;
  /** Market day the cake was baked (-1: none out), and whether a friend finished it. */
  cake: { day: number; eaten: boolean };
  /** Market day the cat had its last treat. */
  treatDay: number;
  /** What the cat left, from its market day on, until picked up. */
  gift: { day: number; gift: CatGift } | null;
  /** Game ids whose manual was read in the reading chair, per platform. */
  read: Partial<Record<PlatformId, string[]>>;
  outfit: OutfitId;
  /** Hour of the clock the alarm wakes the player at. */
  wakeHour: number;
  /** Market days of the last dream told, of the radio's last chronicle, of the last friend asked round, of the first sale used. */
  dreamDay: number;
  radioDay: number;
  inviteDay: number;
  firstSaleDay: number;
}

function defaults(): HouseholdState {
  return {
    kit: false,
    restored: { day: -1, n: 0 },
    soaked: false,
    cake: { day: -1, eaten: false },
    treatDay: -1,
    gift: null,
    read: {},
    outfit: 'everyday',
    wakeHour: HOUSEHOLD.alarm.initial,
    dreamDay: -1,
    radioDay: -1,
    inviteDay: -1,
    firstSaleDay: -1,
  };
}

/**
 * What was done around the flat that the game remembers (docs/household.md): the kit fetched, the
 * boxes cleaned, the bath's calm, the cake, the cat's treat and what it left, the manuals read,
 * what is worn, the alarm, and which once-a-day things were done today. Days are market days
 * (`MarketStock.day`). Persisted (`KEYS.household`); consumers `subscribe` and re-read.
 */
export class Household {
  private state: HouseholdState;
  private readonly store: PersistedStore<HouseholdState>;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly day: () => number, storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<HouseholdState>({ key: KEYS.household, version: 1, storage, defaults, read: readState });
    this.state = this.store.load();
  }

  get today(): number {
    return this.day();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // --- the cleaning kit and the workbench ------------------------------------------------------

  get hasKit(): boolean {
    return this.state.kit;
  }

  takeKit(): void {
    if (this.state.kit) return;
    this.commit({ kit: true });
  }

  /** Boxes still to clean today. */
  get restoresLeft(): number {
    const { day, n } = this.state.restored;
    return HOUSEHOLD.restorePerDay - (day === this.day() ? n : 0);
  }

  markRestored(): void {
    const today = this.day();
    const n = this.state.restored.day === today ? this.state.restored.n : 0;
    this.commit({ restored: { day: today, n: n + 1 } });
  }

  // --- the bath ------------------------------------------------------------------------------

  get soaked(): boolean {
    return this.state.soaked;
  }

  /** A bath taken: false when its calm is still unused (one at a time). */
  soak(): boolean {
    if (this.state.soaked) return false;
    this.commit({ soaked: true });
    return true;
  }

  /** A haggle used the bath's calm. */
  useSoak(): void {
    if (this.state.soaked) this.commit({ soaked: false });
  }

  // --- the cake ------------------------------------------------------------------------------

  /** A cake on the kitchen table, not finished and not stale. */
  get cakeOut(): boolean {
    const { day, eaten } = this.state.cake;
    return day >= 0 && !eaten && this.day() - day < HOUSEHOLD.cake.days;
  }

  /** Bakes one: false when one is already out. */
  bake(): boolean {
    if (this.cakeOut) return false;
    this.commit({ cake: { day: this.day(), eaten: false } });
    return true;
  }

  /** A friend finished it. */
  eatCake(): void {
    if (this.cakeOut) this.commit({ cake: { ...this.state.cake, eaten: true } });
  }

  // --- the cat's treat and its gift --------------------------------------------------------------

  get treatedToday(): boolean {
    return this.state.treatDay === this.day();
  }

  /** Today's treat; `gift` (drawn by the caller) turns up by the bowl tomorrow. Nothing replaces a gift not yet picked up. */
  giveTreat(gift: CatGift | null): void {
    const today = this.day();
    this.commit({ treatDay: today, gift: this.state.gift ?? (gift ? { day: today + 1, gift } : null) });
  }

  /** What lies by the bowl now, if anything. */
  get gift(): CatGift | null {
    const g = this.state.gift;
    return g && g.day <= this.day() ? g.gift : null;
  }

  takeGift(): CatGift | null {
    const gift = this.gift;
    if (gift) this.commit({ gift: null });
    return gift;
  }

  // --- the reading chair -----------------------------------------------------------------------

  hasRead(platform: PlatformId, gameId: string): boolean {
    return this.state.read[platform]?.includes(gameId) ?? false;
  }

  /** The manuals read for `platform`. */
  manualsRead(platform: PlatformId): number {
    return this.state.read[platform]?.length ?? 0;
  }

  /** A manual read: the platform's count after it (unchanged when it was read before). */
  read(platform: PlatformId, gameId: string): number {
    if (this.hasRead(platform, gameId)) return this.manualsRead(platform);
    this.commit({ read: { ...this.state.read, [platform]: [...(this.state.read[platform] ?? []), gameId] } });
    return this.manualsRead(platform);
  }

  // --- the wardrobe and the alarm ------------------------------------------------------------

  get outfit(): OutfitId {
    return this.state.outfit;
  }

  wear(outfit: OutfitId): void {
    if (outfit !== this.state.outfit) this.commit({ outfit });
  }

  get wakeHour(): number {
    return this.state.wakeHour;
  }

  /** The alarm's next setting (round the list); the new hour. */
  cycleAlarm(): number {
    const hours = HOUSEHOLD.alarm.hours;
    const i = hours.indexOf(this.state.wakeHour);
    const wakeHour = hours[(i + 1) % hours.length]!;
    this.commit({ wakeHour });
    return wakeHour;
  }

  // --- once a day ------------------------------------------------------------------------------

  /** True the first time it is asked on a market day (the dream, the radio's chronicle, a friend asked round, the first sale). */
  once(what: 'dream' | 'radio' | 'invite' | 'firstSale'): boolean {
    const key = ONCE_KEYS[what];
    const today = this.day();
    if (this.state[key] === today) return false;
    this.commit({ [key]: today } as Partial<HouseholdState>);
    return true;
  }

  /** Takes back today's `once(what)` (a first sale handed back at the stall): it may happen again today. */
  forgetToday(what: 'firstSale'): void {
    const key = ONCE_KEYS[what];
    if (this.state[key] === this.day()) this.commit({ [key]: -1 } as Partial<HouseholdState>);
  }

  /** Whether `what` was done today already (without doing it). */
  doneToday(what: 'dream' | 'radio' | 'invite' | 'firstSale'): boolean {
    return this.state[ONCE_KEYS[what]] === this.day();
  }

  private commit(patch: Partial<HouseholdState>): void {
    this.state = { ...this.state, ...patch };
    this.store.save(this.state);
    for (const cb of [...this.listeners]) cb();
  }
}

const ONCE_KEYS = { dream: 'dreamDay', radio: 'radioDay', invite: 'inviteDay', firstSale: 'firstSaleDay' } as const;

function readState(data: unknown): HouseholdState | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<Record<keyof HouseholdState, unknown>>;
  const state = defaults();
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  state.kit = d.kit === true;
  if (typeof d.restored === 'object' && d.restored) {
    const r = d.restored as { day?: unknown; n?: unknown };
    state.restored = { day: num(r.day, -1), n: num(r.n, 0) };
  }
  state.soaked = d.soaked === true;
  if (typeof d.cake === 'object' && d.cake) {
    const c = d.cake as { day?: unknown; eaten?: unknown };
    state.cake = { day: num(c.day, -1), eaten: c.eaten === true };
  }
  state.treatDay = num(d.treatDay, -1);
  state.gift = readGift(d.gift);
  if (typeof d.read === 'object' && d.read) {
    for (const [platform, ids] of Object.entries(d.read as Record<string, unknown>)) {
      if (platform in PLATFORMS && Array.isArray(ids)) state.read[platform as PlatformId] = ids.filter((id): id is string => typeof id === 'string');
    }
  }
  if (isOutfitId(d.outfit)) state.outfit = d.outfit;
  const wake = num(d.wakeHour, HOUSEHOLD.alarm.initial);
  state.wakeHour = HOUSEHOLD.alarm.hours.includes(wake) ? wake : HOUSEHOLD.alarm.initial;
  state.dreamDay = num(d.dreamDay, -1);
  state.radioDay = num(d.radioDay, -1);
  state.inviteDay = num(d.inviteDay, -1);
  state.firstSaleDay = num(d.firstSaleDay, -1);
  return state;
}

function readGift(value: unknown): HouseholdState['gift'] {
  if (typeof value !== 'object' || value === null) return null;
  const { day, gift } = value as { day?: unknown; gift?: unknown };
  if (typeof day !== 'number' || typeof gift !== 'object' || gift === null) return null;
  const g = gift as { kind?: unknown; coins?: unknown; gameId?: unknown; title?: unknown };
  if (g.kind === 'coins' && typeof g.coins === 'number') return { day, gift: { kind: 'coins', coins: g.coins } };
  if (g.kind === 'manual' && typeof g.gameId === 'string' && typeof g.title === 'string') return { day, gift: { kind: 'manual', gameId: g.gameId, title: g.title } };
  return null;
}
