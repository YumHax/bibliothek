import { KEYS, PersistedStore } from '@/persistence';
import { findPerson, personAtDoor } from './people';
import { grapevine } from './gossip';
import { BATTERY, DRIFT, GAIN, MEMORY, TIERS, TRAITS, TRUST, WARMTH } from './socialPlan';
import { tierOf } from './tiers';
import type { Memory, PersonId, PersonState, SocialChange, TierId, Trait } from './types';

/*
 * How the player stands with everyone (docs/social.md "Two axes"): warmth (do they like you) and trust (can they
 * rely on you), what the player learned of them, what they remember. A module-level store, saved under
 * `KEYS.social`, so any feature reads or nudges it without wiring; `onSocial` hears every change (the notices,
 * the panel's chip, the journal). The old neighbours' friendship (`KEYS.neighbourFriendship`, by door) is read
 * once into warmth.
 */

interface SocialSave {
  people: Record<PersonId, PersonState>;
  /** The game day `settleDay` last ran (the drift is applied once a day). */
  settled: number;
}

let store: PersistedStore<SocialSave> | null = null;
let state: SocialSave | null = null;
const listeners = new Set<(change: SocialChange) => void>();

function loaded(): SocialSave {
  if (state) return state;
  store = new PersistedStore<SocialSave>({ key: KEYS.social, version: 1, defaults: () => ({ people: fromFriendship(), settled: 0 }), read: readSave });
  state = store.load();
  return state;
}

function save(): void {
  store?.save(loaded());
}

/** A fresh state for `id`: where their card says the warmth and trust start. */
function fresh(id: PersonId): PersonState {
  const card = findPerson(id);
  const startWarmth = card?.startWarmth ?? 0;
  return {
    warmth: startWarmth,
    trust: card?.startTrust ?? 0,
    met: card?.listed === 'always' ? 0 : null,
    known: [],
    traitsKnown: [],
    memories: [],
    last: {},
    battery: { day: -1, used: 0, warmed: 0 },
    lastSeen: 0,
    told: tierOf(startWarmth, card?.startTrust ?? 0),
    number: card?.listed === 'always' && card.phone === true,
  };
}

/** The old friendship by door (`building/friendship` v1), read once into warmth; a friend of before is trusted a little too. */
function fromFriendship(): Record<PersonId, PersonState> {
  const old = new PersistedStore<Record<string, { value: number }>>({ key: KEYS.neighbourFriendship, version: 1, defaults: () => ({}), read: (d) => (d && typeof d === 'object' ? (d as Record<string, { value: number }>) : null) });
  const out: Record<PersonId, PersonState> = {};
  for (const [door, standing] of Object.entries(old.load())) {
    const id = personAtDoor(door);
    if (!id || typeof standing?.value !== 'number') continue;
    const s = fresh(id);
    s.warmth = roundInto(standing.value, WARMTH.min, WARMTH.max);
    s.trust = standing.value >= 25 ? 30 : standing.value > 0 ? 10 : 0;
    s.met = 1;
    s.told = tierOf(s.warmth, s.trust);
    out[id] = s;
  }
  return out;
}

function readSave(data: unknown): SocialSave | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as { people?: unknown; settled?: unknown };
  const people: Record<PersonId, PersonState> = {};
  if (raw.people && typeof raw.people === 'object') {
    for (const [id, value] of Object.entries(raw.people as Record<string, unknown>)) {
      const s = readPerson(id, value);
      if (s) people[id] = s;
    }
  }
  return { people, settled: typeof raw.settled === 'number' ? raw.settled : 0 };
}

function readPerson(id: PersonId, value: unknown): PersonState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<PersonState>;
  if (typeof v.warmth !== 'number' || !Number.isFinite(v.warmth)) return null;
  const s = fresh(id);
  s.warmth = roundInto(v.warmth, WARMTH.min, WARMTH.max);
  s.trust = typeof v.trust === 'number' ? roundInto(v.trust, TRUST.min, TRUST.max) : s.trust;
  s.met = typeof v.met === 'number' ? v.met : null;
  s.known = Array.isArray(v.known) ? v.known.filter((k): k is string => typeof k === 'string') : [];
  s.traitsKnown = Array.isArray(v.traitsKnown) ? v.traitsKnown.filter((t): t is Trait => typeof t === 'string' && t in TRAITS) : [];
  s.memories = Array.isArray(v.memories) ? v.memories.filter((m): m is Memory => !!m && typeof m.text === 'string' && typeof m.day === 'number' && typeof m.weight === 'number') : [];
  if (v.last && typeof v.last === 'object') for (const [r, d] of Object.entries(v.last)) if (typeof d === 'number') s.last[r] = d;
  if (v.battery && typeof v.battery.day === 'number' && typeof v.battery.used === 'number') s.battery = { day: v.battery.day, used: v.battery.used, warmed: typeof v.battery.warmed === 'number' ? v.battery.warmed : 0 };
  s.lastSeen = typeof v.lastSeen === 'number' ? v.lastSeen : 0;
  s.told = typeof v.told === 'string' ? v.told : tierOf(s.warmth, s.trust);
  s.number = v.number === true;
  return s;
}

/** `value` rounded to a tenth (small gains near the top add up instead of rounding away) and held within `min`..`max`. */
function roundInto(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value * 10) / 10));
}

/** The live state of `id` (made on first touch). */
function entry(id: PersonId): PersonState {
  const all = loaded().people;
  let s = all[id];
  if (!s) {
    s = fresh(id);
    all[id] = s;
  }
  return s;
}

/** How the player stands with `id` (read-only: change it through `nudge` and the rest). */
export function standing(id: PersonId): Readonly<PersonState> {
  return loaded().people[id] ?? fresh(id);
}

export function warmth(id: PersonId): number {
  return standing(id).warmth;
}

/** Their tier now. */
export function tier(id: PersonId): TierId {
  const s = standing(id);
  return tierOf(s.warmth, s.trust);
}

/** What a nudge asks: the change, why (the chip), once a day per `reason`, a memory, whether the grapevine hears of it. */
interface Nudge {
  warmth?: number;
  trust?: number;
  /** The chip's words: "loved the flowers". */
  why?: string;
  /** Counts once a game day for this reason (a dozen chats are one chat). */
  reason?: string;
  /** The game day (for `reason`, the drift's clock and the memory). */
  day: number;
  /** Something they will remember ("you lent me Zelda"), and how much it mattered (default: the warmth moved). */
  memory?: string;
  memoryWeight?: number;
  /** The people tied to them hear of it (`gossip.grapevine`). Default false. */
  gossip?: boolean;
}

/**
 * Moves the player's standing with `id`. Returns what changed (null when `reason` already counted today). A
 * tier crossed since the last told is in the change (`before` / `after`), once.
 */
export function nudge(id: PersonId, n: Nudge): SocialChange | null {
  const s = entry(id);
  if (n.reason !== undefined) {
    if (s.last[n.reason] === n.day) return null;
    s.last[n.reason] = n.day;
  }
  const change = apply(id, s, n.warmth ?? 0, n.trust ?? 0, n.day, n.why);
  if (n.memory) remember(s, n.day, n.memory, n.memoryWeight ?? n.warmth ?? 0);
  save();
  emit(change);
  if (n.gossip) {
    for (const heard of grapevine(id, n.warmth ?? 0)) {
      const other = entry(heard.id);
      const c = apply(heard.id, other, heard.warmth, 0, n.day, `heard about it from ${findPerson(id)?.short ?? findPerson(id)?.name ?? id}`);
      c.heard = true;
      save();
      emit(c);
    }
  }
  return change;
}

/** What a gain of warmth is worth at `warmth` (`GAIN`: the warmer, the less a kindness moves them). */
function warmthGain(warmth: number): number {
  return Math.max(GAIN.floor, Math.pow(Math.max(0, 1 - Math.max(0, warmth) / GAIN.span), GAIN.power));
}

/** A change as it lands on `s`: gains slowed as they grow (`GAIN`), losses whole. */
function slowed(s: Readonly<PersonState>, dw: number, dt: number): [number, number] {
  return [dw > 0 ? dw * warmthGain(s.warmth) : dw, dt > 0 ? dt * Math.max(GAIN.trustFloor, 1 - s.trust / GAIN.trustSpan) : dt];
}

function apply(id: PersonId, s: PersonState, dw: number, dt: number, day: number, why?: string, raw = false): SocialChange {
  const before = s.told;
  const w0 = s.warmth;
  const t0 = s.trust;
  if (!raw) [dw, dt] = slowed(s, dw, dt);
  s.warmth = roundInto(s.warmth + dw, WARMTH.min, WARMTH.max);
  s.trust = roundInto(s.trust + dt, TRUST.min, TRUST.max);
  s.lastSeen = Math.max(s.lastSeen, day);
  const after = raw ? tierOf(s.warmth, s.trust) : toldTier(s);
  s.told = after;
  return { id, warmth: s.warmth - w0, trust: s.trust - t0, why, before, after };
}

/** Warmth a standing may slip under its told tier's floor before the drop is news (no banner, card, banner at a boundary). */
const TIER_SLACK = 3;

/** The tier to tell for `s`: its tier now, except a slip of `TIER_SLACK` or less under the one last told. */
function toldTier(s: PersonState): TierId {
  const now = tierOf(s.warmth, s.trust);
  const told = TIERS.find((t) => t.id === s.told);
  if (told && TIERS.indexOf(told) > TIERS.findIndex((t) => t.id === now) && s.warmth >= told.from - TIER_SLACK && s.trust >= told.trust) return s.told;
  return now;
}

function remember(s: PersonState, day: number, text: string, weight: number): void {
  s.memories.unshift({ day, text, weight });
  if (s.memories.length > MEMORY.keep) {
    // The mildest goes first, not the oldest: a grudge outlives a chat.
    let mildest = 0;
    s.memories.forEach((m, i) => {
      if (Math.abs(m.weight) <= Math.abs(s.memories[mildest]!.weight)) mildest = i;
    });
    s.memories.splice(mildest, 1);
  }
}

function emit(change: SocialChange): void {
  // A meeting moves nothing but is news (the journal's "Met …").
  if (change.warmth === 0 && change.trust === 0 && change.before === change.after && change.why !== 'met') return;
  for (const listener of [...listeners]) listener(change);
}

/** Hears every change of standing (direct or through the grapevine). Returns the unsubscribe. */
export function onSocial(listener: (change: SocialChange) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether `reason` already counted for `id` on `day`. */
export function countedToday(id: PersonId, reason: string, day: number): boolean {
  return standing(id).last[reason] === day;
}

/** The game day `reason` last counted for `id`, or null. */
export function lastCounted(id: PersonId, reason: string): number | null {
  return standing(id).last[reason] ?? null;
}

/** The player was introduced to `id` (their name is known from now). True the first time. */
export function meet(id: PersonId, day: number): boolean {
  const s = entry(id);
  if (s.met !== null) return false;
  s.met = day;
  s.lastSeen = Math.max(s.lastSeen, day);
  save();
  emit({ id, warmth: 0, trust: 0, why: 'met', before: s.told, after: s.told });
  return true;
}

export function isMet(id: PersonId): boolean {
  return standing(id).met !== null;
}

/** The player learned fact `fact` of `id`. True when it was new. */
export function learn(id: PersonId, fact: string): boolean {
  const s = entry(id);
  if (s.known.includes(fact)) return false;
  s.known.push(fact);
  save();
  return true;
}

/** The player found out one of `id`'s traits. True when it was new. */
export function learnTrait(id: PersonId, trait: Trait): boolean {
  const s = entry(id);
  if (s.traitsKnown.includes(trait)) return false;
  s.traitsKnown.push(trait);
  save();
  return true;
}

/** The player was given `id`'s number: the phone can ring them. */
export function giveNumber(id: PersonId): void {
  const s = entry(id);
  if (s.number) return;
  s.number = true;
  save();
}

export function hasNumber(id: PersonId): boolean {
  return standing(id).number;
}

/** A memory of `id`'s, without moving the standing. */
export function addMemory(id: PersonId, day: number, text: string, weight: number): void {
  remember(entry(id), day, text, weight);
  save();
}

/** The social battery `id` has in them on `day` (`BATTERY.perDay` × their traits), and what is left. */
function batteryOf(id: PersonId, day: number): { size: number; left: number } {
  const card = findPerson(id);
  const factor = (card?.traits ?? []).reduce((f, t) => f * (TRAITS[t].battery ?? 1), 1);
  const size = Math.max(2, Math.round(BATTERY.perDay * factor));
  const s = standing(id);
  return { size, left: s.battery.day === day ? Math.max(0, size - s.battery.used) : size };
}

/** How much talk `id` has left in them on `day`, read only (the conversation shows them restless, then wanting to go). */
export function talkLeft(id: PersonId, day: number): number {
  return batteryOf(id, day).left;
}

/** Draws `cost` from `id`'s battery on `day`; returns whether it was past empty (the talk then costs warmth). */
export function drawBattery(id: PersonId, day: number, cost: number): boolean {
  const { left } = batteryOf(id, day);
  const s = entry(id);
  if (s.battery.day !== day) s.battery = { day, used: 0, warmed: 0 };
  s.battery.used += cost;
  save();
  return cost > 0 && left < cost;
}

/**
 * How much of `wanted` warmth from talk `id` still takes on `day` (`GAIN.talkPerDay` a day), recorded as taken.
 * A loss is never capped.
 */
export function talkWarmth(id: PersonId, day: number, wanted: number): number {
  if (wanted <= 0) return wanted;
  const s = entry(id);
  if (s.battery.day !== day) s.battery = { day, used: 0, warmed: 0 };
  const take = Math.max(0, Math.min(wanted, GAIN.talkPerDay - s.battery.warmed));
  s.battery.warmed += take;
  save();
  return take;
}

/** Everyone with a standing saved (met or touched), for the book and the debug table. */
export function allStandings(): Record<PersonId, Readonly<PersonState>> {
  return loaded().people;
}

/**
 * A new game day: warmth drifts back towards rest for whoever has not been seen in `DRIFT.graceDays` (slower for a
 * close friend, slower back up for a grudge-holder), and mild memories are forgotten. Run once per day, however
 * many days were skipped (each counts).
 */
export function settleDay(day: number): void {
  const all = loaded();
  if (all.settled >= day) return;
  // Never settled (a new save, or one from before the social layer, migrated people included): today is the start,
  // not 60 days of drift for whoever was never "seen".
  if (all.settled === 0) {
    for (const s of Object.values(all.people)) if (s.met !== null) s.lastSeen = Math.max(s.lastSeen, day);
    all.settled = day;
    save();
    return;
  }
  const from = Math.max(all.settled + 1, day - 60);
  for (const [id, s] of Object.entries(all.people)) {
    if (s.met === null) continue;
    const card = findPerson(id);
    const grudge = Math.max(1, ...(card?.traits ?? []).map((t) => TRAITS[t].grudge ?? 1));
    for (let d = from; d <= day; d++) {
      if (d - s.lastSeen <= DRIFT.graceDays) continue;
      const rest = DRIFT.rest;
      const t = tierOf(s.warmth, s.trust);
      const pace = t === 'close' ? DRIFT.closeShare : 1;
      if (s.warmth > rest) s.warmth = Math.max(rest, s.warmth - DRIFT.perDay * pace);
      else if (s.warmth < rest && (d % grudge === 0)) s.warmth = Math.min(rest, s.warmth + DRIFT.perDay);
    }
    s.warmth = Math.round(s.warmth * 10) / 10;
    s.memories = s.memories.filter((m) => Math.abs(m.weight) >= MEMORY.strong || day - m.day <= MEMORY.fadeDays);
    const now = toldTier(s);
    if (now !== s.told) {
      const before = s.told;
      s.told = now;
      emit({ id, warmth: 0, trust: 0, why: 'drifted apart', before, after: now });
    }
  }
  all.settled = day;
  save();
}

/** `?debug`: sets `id`'s warmth and trust outright (the debug console's `bibliothek.social.set`). */
export function setStanding(id: PersonId, warmthValue: number, trustValue: number, day: number): void {
  const s = entry(id);
  if (s.met === null) s.met = day;
  const change = apply(id, s, warmthValue - s.warmth, trustValue - s.trust, day, 'debug', true);
  save();
  emit(change);
}
