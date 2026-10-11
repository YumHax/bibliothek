import { KEYS, PersistedStore } from '@/persistence';
import { weekdayOf } from '@/time/wakefulness';

/** A manual ordered at CORNER BOOKS: the copy it is for, and the game day it comes in. */
interface ManualOrder {
  gameId: string;
  ready: number;
  /** The coins paid when it was ordered (given back if the copy is gone or complete by the time it comes in). */
  paid?: number;
}

interface StreetShopsState {
  orders: ManualOrder[];
  /** The strategy guides bought (their ids), each read once. */
  guides: string[];
  /** Game days the player sat through THE ANCHOR's gig. */
  gigs: number[];
  /** The last quiz night played at THE LOCAL, and how many answers were right. */
  quiz: { day: number; right: number } | null;
  /** Today's darts at THE LOCAL: the game day, the goes thrown, the player's best of the night, whether it paid. */
  darts: { day: number; goes: number; best: number; paid: boolean };
  /** Game days whose issue of THE GAMING WEEKLY the player bought (or found on the mat), the last month's. */
  issues: number[];
  /** The cover cards collected (`COVER_CARDS` ids), and whether the full set was handed in. */
  cards: string[];
  setDone: boolean;
  /** The last game day the subscription covers (-1: none). */
  subscribed: number;
  /** Game weeks Karim swapped a game with the player. */
  karimWeeks: number[];
}

const defaults = (): StreetShopsState => ({ orders: [], guides: [], gigs: [], quiz: null, darts: { day: -1, goes: 0, best: 0, paid: false }, issues: [], cards: [], setDone: false, subscribed: -1, karimWeeks: [] });

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numbers = (v: unknown): number[] => (Array.isArray(v) ? v.filter(isCount) : []);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

const store = new PersistedStore<StreetShopsState>({
  key: KEYS.streetShops,
  version: 1,
  defaults,
  read: (data) => {
    if (!data || typeof data !== 'object') return null;
    const o = data as Partial<Record<keyof StreetShopsState, unknown>>;
    const base = defaults();
    const orders = Array.isArray(o.orders) ? o.orders.filter((x): x is ManualOrder => !!x && typeof x === 'object' && typeof (x as ManualOrder).gameId === 'string' && isCount((x as ManualOrder).ready)).map((x) => ({ gameId: x.gameId, ready: x.ready, ...(isCount(x.paid) ? { paid: x.paid } : {}) })) : [];
    const q = o.quiz as { day?: unknown; right?: unknown } | null | undefined;
    const d = o.darts as { day?: unknown; goes?: unknown; best?: unknown; paid?: unknown } | undefined;
    return {
      ...base,
      orders,
      guides: strings(o.guides),
      gigs: numbers(o.gigs),
      quiz: q && isCount(q.day) && isCount(q.right) ? { day: q.day, right: q.right } : null,
      darts: d && isCount(d.day) && isCount(d.goes) && isCount(d.best) ? { day: d.day, goes: d.goes, best: d.best, paid: d.paid === true } : base.darts,
      issues: numbers(o.issues),
      cards: strings(o.cards),
      setDone: o.setDone === true,
      subscribed: isCount(o.subscribed) ? o.subscribed : -1,
      karimWeeks: numbers(o.karimWeeks),
    };
  },
});

let state: StreetShopsState = store.load();
const listeners = new Set<() => void>();

function commit(patch: Partial<StreetShopsState>): void {
  state = { ...state, ...patch };
  store.save(state);
  for (const cb of [...listeners]) cb();
}

/** The game week of `day` (Monday to Sunday, `time/wakefulness`'s week): what the weekly draws go by. */
export function gameWeekOf(day: number): number {
  return Math.floor((day - weekdayOf(day)) / 7);
}

/**
 * What Front Street's counters remember (`KEYS.streetShops`): the manuals ordered, the guides bought, the bars' nights,
 * the paper's issues, cards and subscription, Karim's swaps. One store for the whole game, like the pocket.
 */
export const streetShops = {
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },

  // --- CORNER BOOKS --------------------------------------------------------------------------

  /** The manual ordered for `gameId`, if one is on its way or in. */
  orderFor(gameId: string): ManualOrder | undefined {
    return state.orders.find((o) => o.gameId === gameId);
  },
  order(gameId: string, ready: number, paid: number): void {
    commit({ orders: [...state.orders.filter((o) => o.gameId !== gameId), { gameId, ready, paid }] });
  },
  /** The orders in by `day` (taken off the list as they are handed over). */
  takeReady(day: number): ManualOrder[] {
    const ready = state.orders.filter((o) => o.ready <= day);
    if (ready.length) commit({ orders: state.orders.filter((o) => o.ready > day) });
    return ready;
  },
  hasGuide(id: string): boolean {
    return state.guides.includes(id);
  },
  addGuide(id: string): void {
    if (!this.hasGuide(id)) commit({ guides: [...state.guides, id] });
  },

  // --- the bars --------------------------------------------------------------------------------

  wentToGig(day: number): boolean {
    return state.gigs.includes(day);
  },
  gigsSeen(): number {
    return state.gigs.length;
  },
  markGig(day: number): void {
    if (!this.wentToGig(day)) commit({ gigs: [...state.gigs.filter((d) => d > day - 60), day] });
  },
  quizPlayed(day: number): boolean {
    return state.quiz?.day === day;
  },
  markQuiz(day: number, right: number): void {
    commit({ quiz: { day, right } });
  },
  /** Today's darts (a new day starts afresh). */
  darts(day: number): { goes: number; best: number; paid: boolean } {
    const d = state.darts;
    return d.day === day ? { goes: d.goes, best: d.best, paid: d.paid } : { goes: 0, best: 0, paid: false };
  },
  /** A go thrown on `day` for `score`; `paid`: it beat the board. */
  markDarts(day: number, score: number, paid: boolean): void {
    const d = this.darts(day);
    commit({ darts: { day, goes: d.goes + 1, best: Math.max(d.best, score), paid: d.paid || paid } });
  },

  // --- the newsagent ---------------------------------------------------------------------------

  hasIssue(day: number): boolean {
    return state.issues.includes(day);
  },
  addIssue(day: number): void {
    if (!this.hasIssue(day)) commit({ issues: [...state.issues.filter((d) => d > day - 30), day] });
  },
  get cards(): readonly string[] {
    return state.cards;
  },
  addCard(id: string): boolean {
    if (state.cards.includes(id)) return false;
    commit({ cards: [...state.cards, id] });
    return true;
  },
  get setDone(): boolean {
    return state.setDone;
  },
  markSetDone(): void {
    commit({ setDone: true });
  },
  /** Whether the paper comes to the mat on `day`. */
  subscribedOn(day: number): boolean {
    return day <= state.subscribed;
  },
  get subscribedUntil(): number {
    return state.subscribed;
  },
  subscribeUntil(day: number): void {
    commit({ subscribed: Math.max(state.subscribed, day) });
  },

  // --- Karim -----------------------------------------------------------------------------------

  karimSwapsIn(week: number): number {
    return state.karimWeeks.filter((w) => w === week).length;
  },
  markKarimSwap(week: number): void {
    commit({ karimWeeks: [...state.karimWeeks.filter((w) => w > week - 8), week] });
  },
};
