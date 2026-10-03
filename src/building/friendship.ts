import { KEYS, PersistedStore } from '@/persistence';

/*
 * How well the player stands with each resident of the building, by their door's key
 * (`stairwell/building.doorKey(k, i)`: landing k, door i): -100 (cold) .. 100 (friends), 0 to start.
 * A chat, a swap, a favour, a gift raise it; noise late at night (`building/noiseComplaints`) lowers
 * it. The rest of the building reads it: an invitation in (`world/neighbourFlat`), a friendlier
 * price, a cold hello. A module-level store, so any feature can read or nudge it without wiring.
 */

/** A door's standing, and the last game day each kind of nudge was given (one a day of each). */
interface Standing {
  value: number;
  /** `reason` -> the game day it last counted. */
  last: Record<string, number>;
}

type State = Record<string, Standing>;

/** The range of a standing. */
export const FRIENDSHIP_MIN = -100;
export const FRIENDSHIP_MAX = 100;
/** From this standing on, a resident counts as a friend (an invitation, a kind word). */
export const FRIENDLY = 25;
/** At or under this standing, a resident is cross with the player (a curt hello, no invitation). */
export const COLD = -15;

let store: PersistedStore<State> | null = null;
let state: State | null = null;
const listeners = new Set<(key: string, value: number) => void>();

function loaded(): State {
  if (state) return state;
  store = new PersistedStore<State>({ key: KEYS.neighbourFriendship, version: 1, defaults: () => ({}), read: readState });
  state = store.load();
  return state;
}

function readState(data: unknown): State | null {
  if (!data || typeof data !== 'object') return null;
  const out: State = {};
  for (const [key, raw] of Object.entries(data as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const { value, last } = raw as { value?: unknown; last?: unknown };
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const days: Record<string, number> = {};
    if (last && typeof last === 'object') for (const [r, d] of Object.entries(last as Record<string, unknown>)) if (typeof d === 'number') days[r] = d;
    out[key] = { value: clamp(value), last: days };
  }
  return out;
}

function clamp(value: number): number {
  return Math.max(FRIENDSHIP_MIN, Math.min(FRIENDSHIP_MAX, Math.round(value)));
}

/** The standing with whoever lives behind door `key` (0 when nothing happened yet). */
export function friendship(key: string): number {
  return loaded()[key]?.value ?? 0;
}

/** Whether the resident behind `key` counts as a friend. */
export function isFriend(key: string): boolean {
  return friendship(key) >= FRIENDLY;
}

/**
 * Raises (or lowers, `amount` < 0) the standing with `key`. With `reason` and `day` (the game day),
 * the same reason counts once a day only (a dozen chats in a row are one chat). Returns whether it counted.
 */
export function befriend(key: string, amount: number, reason?: string, day?: number): boolean {
  const all = loaded();
  const standing = all[key] ?? { value: 0, last: {} };
  if (reason !== undefined && day !== undefined) {
    if (standing.last[reason] === day) return false;
    standing.last[reason] = day;
  }
  standing.value = clamp(standing.value + amount);
  all[key] = standing;
  store!.save(all);
  for (const cb of listeners) cb(key, standing.value);
  return true;
}

/** The game day `reason` last counted for `key`, or null. */
export function lastCounted(key: string, reason: string): number | null {
  return loaded()[key]?.last[reason] ?? null;
}

/** Called with the door's key and its new standing on every change; returns the unsubscribe. */
export function onFriendship(cb: (key: string, value: number) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
