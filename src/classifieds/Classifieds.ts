import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { SELLERS_BUILDING, adsPostedOn, clockOf, scriptedAd, type Ad, type ScriptedAd } from './ads';
import { CLASSIFIEDS, SELLERS } from './rules';

/** A visit agreed on the phone: whose ad, on which game day (their window that day, `Ad.hours`). */
export interface Booking {
  adId: string;
  day: number;
}

/** What the mansion block's door says now: let up to a seller, too early, or nobody expecting the player. */
export type DoorState =
  | { kind: 'open'; ad: Ad }
  | { kind: 'early'; ad: Ad; from: number }
  | { kind: 'none' };

interface ClassifiedsState {
  /** Ads read in the paper, and the day they were read. */
  seen: { id: string; day: number }[];
  booking: Booking | null;
  /** The visit under way: the player was let up, and may go back up until `until` (hours of the clock) that day. */
  visit: { adId: string; day: number; until: number } | null;
  /** Sellers met: their ads are out of the paper. */
  visited: { id: string; day: number }[];
  /** What was bought from each seller's lot (game ids), and whether their console was. */
  bought: Record<string, string[]>;
  consoles: string[];
  /** A haggle's agreed share per `${adId}|${gameId}`; insults per seller. */
  haggles: Record<string, number>;
  soured: Record<string, number>;
  /** Ads other features put in the paper (`inject`). */
  scripted: ScriptedAd[];
}

const defaults = (): ClassifiedsState => ({ seen: [], booking: null, visit: null, visited: [], bought: {}, consoles: [], haggles: {}, soured: {}, scripted: [] });

/** Game days a drawn ad's leftovers (what was bought, the haggles) are kept after it ran. */
const FORGET_AFTER = 14;

/**
 * The small ads of THE GAMING WEEKLY (docs/economy.md "Small ads and the seller's flat"): a few private sellers a game
 * day, drawn from the day (`ads.adsPostedOn`), in the paper `CLASSIFIEDS.lasts` days, plus the ads other features put
 * in (`inject`, a quest's clue). The player reads them at the newsstand (`markSeen`), rings the seller from the
 * bedroom's phone (`slotFor` / `book`: today if enough of their window is left, else tomorrow), and is let up at Park
 * Corner Mansions while the window is open (`door`, `arrive`). A visit missed is no harm: the booking lapses and the
 * ad can be rung again while it runs. Persisted (`KEYS.classifieds`); `subscribe` for changes.
 */
export class Classifieds {
  private state: ClassifiedsState;
  private readonly store: PersistedStore<ClassifiedsState>;
  private readonly listeners = new Set<() => void>();
  private readonly visitListeners = new Set<(ad: Ad) => void>();

  constructor(private readonly clock: { day: () => number; hours: () => number }, storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<ClassifiedsState>({ key: KEYS.classifieds, version: 1, storage, defaults, read: readState });
    this.state = this.store.load();
    this.forget();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** The game day the ads are read against. */
  get today(): number {
    return this.clock.day();
  }

  /** Hears each seller met (the player let up into their flat): a quest's scripted ad watches for its own. */
  onVisit(cb: (ad: Ad) => void): () => void {
    this.visitListeners.add(cb);
    return () => this.visitListeners.delete(cb);
  }

  // --- the paper --------------------------------------------------------------------------------

  /** The ads in the paper on `day`: those still running, newest first, less the sellers already met. */
  inPaper(day = this.clock.day()): Ad[] {
    const met = new Set(this.state.visited.map((v) => v.id));
    const drawn: Ad[] = [];
    for (let d = day; d > day - CLASSIFIEDS.lasts; d--) if (d >= 1) drawn.push(...adsPostedOn(d));
    const scripted = this.state.scripted.map(scriptedAd).filter((ad) => ad.day <= day);
    return [...scripted, ...drawn].filter((ad) => ad.until >= day && !met.has(ad.id));
  }

  /** The ads of the paper on `day` the player has read. */
  seenAds(day = this.clock.day()): Ad[] {
    const seen = new Set(this.state.seen.map((s) => s.id));
    return this.inPaper(day).filter((ad) => seen.has(ad.id));
  }

  /** The paper was read: its ads are known (the phone lists them). */
  markSeen(ads: readonly Ad[]): void {
    const known = new Set(this.state.seen.map((s) => s.id));
    const fresh = ads.filter((ad) => !known.has(ad.id));
    if (!fresh.length) return;
    const day = this.clock.day();
    this.commit({ seen: [...this.state.seen, ...fresh.map((ad) => ({ id: ad.id, day }))] });
  }

  /** An ad by id: in the paper, or the one booked or being visited (gone from the paper since). */
  find(id: string): Ad | undefined {
    const day = this.clock.day();
    for (const d of [day, day - 1, this.state.booking?.day, this.state.visit?.day]) {
      if (d === undefined) continue;
      const ad = this.inPaper(d).find((a) => a.id === id) ?? this.allOn(d).find((a) => a.id === id);
      if (ad) return ad;
    }
    return undefined;
  }

  /** Puts a scripted ad in the paper from its `fromDay` (idempotent by id: a second inject with the same id changes nothing). */
  inject(spec: ScriptedAd): void {
    if (this.state.scripted.some((s) => s.id === spec.id)) return;
    this.commit({ scripted: [...this.state.scripted, spec] });
  }

  // --- the phone --------------------------------------------------------------------------------

  /** The visit agreed, while it can still happen (a window gone by lapses quietly). */
  get booking(): { ad: Ad; day: number } | null {
    const booking = this.state.booking;
    if (!booking) return null;
    const ad = this.find(booking.adId);
    if (!ad || this.lapsed(ad, booking.day)) return null;
    return { ad, day: booking.day };
  }

  /** When the seller of `ad` would see the player: today if enough of their window is left, else tomorrow. */
  slotFor(ad: Ad): { day: number; from: number; to: number } {
    const day = this.clock.day();
    const hours = this.clock.hours() % 24;
    const [from, to] = ad.hours;
    return to - Math.max(hours, from) >= CLASSIFIEDS.todayIfLeft ? { day, from, to } : { day: day + 1, from, to };
  }

  /** Rings the seller of `ad` and agrees a visit (replacing any other): what they say. */
  book(ad: Ad): string {
    const slot = this.slotFor(ad);
    this.commit({ booking: { adId: ad.id, day: slot.day } });
    const when = slot.day === this.clock.day() ? 'today' : 'tomorrow';
    return `“Lovely. Come round ${when} between ${clockOf(slot.from)} and ${clockOf(slot.to)}: ${ad.flat}, ${SELLERS_BUILDING}, over the greengrocer’s. Ring the bell.”`;
  }

  /** Calls the booking off (the phone). */
  cancel(): void {
    if (this.state.booking) this.commit({ booking: null });
  }

  // --- the door ---------------------------------------------------------------------------------

  /** What the mansion block's bell does now: a visit under way or due lets the player up. */
  door(): DoorState {
    const day = this.clock.day();
    const hours = this.clock.hours() % 24;
    const visit = this.state.visit;
    if (visit && visit.day === day && hours <= visit.until) {
      const ad = this.find(visit.adId);
      if (ad) return { kind: 'open', ad };
    }
    const booking = this.booking;
    if (!booking || booking.day !== day) return { kind: 'none' };
    const [from, to] = booking.ad.hours;
    if (hours < from - CLASSIFIEDS.visit.early) return { kind: 'early', ad: booking.ad, from };
    if (hours <= to + CLASSIFIEDS.visit.late) return { kind: 'open', ad: booking.ad };
    return { kind: 'none' };
  }

  /** The player was let up to `ad`'s seller: the visit begins (the ad leaves the paper, the booking is spent). */
  arrive(ad: Ad): void {
    const day = this.clock.day();
    const until = Math.min(23.9, ad.hours[1] + CLASSIFIEDS.visit.late);
    const first = !this.state.visited.some((v) => v.id === ad.id);
    this.commit({
      booking: this.state.booking?.adId === ad.id ? null : this.state.booking,
      visit: { adId: ad.id, day, until },
      visited: first ? [...this.state.visited, { id: ad.id, day }] : this.state.visited,
    });
    if (first) for (const cb of [...this.visitListeners]) cb(ad);
  }

  /** The seller whose flat the player is in or going into (the flat's builder reads it), else the last one met. */
  get host(): Ad | null {
    const visit = this.state.visit;
    const id = visit?.adId ?? this.state.booking?.adId ?? this.state.visited[this.state.visited.length - 1]?.id;
    return id ? this.find(id) ?? null : null;
  }

  // --- the lot ----------------------------------------------------------------------------------

  boughtFrom(adId: string): readonly string[] {
    return this.state.bought[adId] ?? [];
  }

  recordBought(adId: string, gameId: string): void {
    const list = this.boughtFrom(adId);
    if (list.includes(gameId)) return;
    this.commit({ bought: { ...this.state.bought, [adId]: [...list, gameId] } });
  }

  /** A copy handed back at once (U): it is the seller's again. */
  unrecordBought(adId: string, gameId: string): void {
    const list = this.boughtFrom(adId);
    if (!list.includes(gameId)) return;
    this.commit({ bought: { ...this.state.bought, [adId]: list.filter((id) => id !== gameId) } });
  }

  consoleSold(adId: string): boolean {
    return this.state.consoles.includes(adId);
  }

  recordConsole(adId: string): void {
    if (!this.consoleSold(adId)) this.commit({ consoles: [...this.state.consoles, adId] });
  }

  haggleOf(adId: string, gameId: string): number | undefined {
    return this.state.haggles[`${adId}|${gameId}`];
  }

  recordHaggle(adId: string, gameId: string, factor: number): void {
    this.commit({ haggles: { ...this.state.haggles, [`${adId}|${gameId}`]: factor } });
  }

  souredBy(adId: string): number {
    return this.state.soured[adId] ?? 0;
  }

  sour(adId: string): void {
    this.commit({ soured: { ...this.state.soured, [adId]: this.souredBy(adId) + 1 } });
  }

  // --- inside -----------------------------------------------------------------------------------

  /** Every ad that ran on `day`, met or not (drawn and scripted). */
  private allOn(day: number): Ad[] {
    const drawn: Ad[] = [];
    for (let d = day; d > day - CLASSIFIEDS.lasts; d--) if (d >= 1) drawn.push(...adsPostedOn(d));
    return [...this.state.scripted.map(scriptedAd), ...drawn];
  }

  private lapsed(ad: Ad, day: number): boolean {
    const today = this.clock.day();
    if (day < today) return true;
    return day === today && this.clock.hours() % 24 > ad.hours[1] + CLASSIFIEDS.visit.late;
  }

  /** Drops what is too old to matter: ads read long ago, sellers met long ago and what was bought from them. */
  private forget(): void {
    const day = this.clock.day();
    const old = (d: number) => d < day - FORGET_AFTER;
    const keep = new Set(this.state.visited.filter((v) => !old(v.day)).map((v) => v.id));
    const live = (id: string) => keep.has(id) || !/^\d+:\d+$/.test(id) || Number(id.split(':')[0]) >= day - FORGET_AFTER;
    const pick = <T>(record: Record<string, T>, idOf: (key: string) => string) => Object.fromEntries(Object.entries(record).filter(([key]) => live(idOf(key))));
    const seen = this.state.seen.filter((s) => s.day >= day - CLASSIFIEDS.seenDays);
    const visited = this.state.visited.filter((v) => !old(v.day));
    if (seen.length === this.state.seen.length && visited.length === this.state.visited.length) return;
    this.state = {
      ...this.state,
      seen,
      visited,
      bought: pick(this.state.bought, (key) => key),
      haggles: pick(this.state.haggles, (key) => key.split('|')[0]!),
      soured: pick(this.state.soured, (key) => key),
      consoles: this.state.consoles.filter(live),
    };
    this.store.save(this.state);
  }

  private commit(patch: Partial<ClassifiedsState>): void {
    this.state = { ...this.state, ...patch };
    this.store.save(this.state);
    for (const cb of [...this.listeners]) cb();
  }
}

/** A save as it was written; anything malformed is dropped field by field (never the whole save). */
function readState(data: unknown): ClassifiedsState | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Partial<Record<keyof ClassifiedsState, unknown>>;
  const base = defaults();
  const isDayEntry = (v: unknown): v is { id: string; day: number } => !!v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' && typeof (v as { day?: unknown }).day === 'number';
  const record = <T>(v: unknown, ok: (x: unknown) => x is T): Record<string, T> => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, T] => ok(e[1]))) : {});
  const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  const isIds = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string');
  const booking = raw.booking as Partial<Booking> | null | undefined;
  const visit = raw.visit as Partial<ClassifiedsState['visit']> | null | undefined;
  return {
    seen: Array.isArray(raw.seen) ? raw.seen.filter(isDayEntry) : base.seen,
    booking: booking && typeof booking.adId === 'string' && isNumber(booking.day) ? { adId: booking.adId, day: booking.day } : null,
    visit: visit && typeof visit.adId === 'string' && isNumber(visit.day) && isNumber(visit.until) ? { adId: visit.adId, day: visit.day, until: visit.until } : null,
    visited: Array.isArray(raw.visited) ? raw.visited.filter(isDayEntry) : base.visited,
    bought: record(raw.bought, isIds),
    consoles: isIds(raw.consoles) ? raw.consoles : base.consoles,
    haggles: record(raw.haggles, isNumber),
    soured: record(raw.soured, isNumber),
    scripted: Array.isArray(raw.scripted) ? raw.scripted.filter(isScripted) : base.scripted,
  };
}

function isScripted(v: unknown): v is ScriptedAd {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<ScriptedAd>;
  return typeof s.id === 'string' && typeof s.fromDay === 'number' && typeof s.kind === 'string' && s.kind in SELLERS && typeof s.name === 'string' && typeof s.text === 'string';
}
