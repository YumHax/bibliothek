import { KEYS, PersistedStore } from '@/persistence';
import type { GiftKind, PersonId } from '../types';

/*
 * What the social web's life keeps (docs/social.md "Favours, birthdays, introductions"), saved under
 * `KEYS.socialLife`: the favours asked and done, the birthdays known and wished, how much closer two people grew by
 * meeting at the player's gatherings, the go-betweens asked. A leaf (nothing of `social/` but types), so
 * `gossip.ts` can read the ties without a cycle.
 */

/** What a favour asks. */
export type FavourKind = 'fetch' | 'findGame' | 'lend' | 'checkIn' | 'parcel';

/** A favour asked by someone: offered, maybe accepted, then done, failed or let go. */
export interface Favour {
  id: string;
  person: PersonId;
  kind: FavourKind;
  /** The game day it was offered. */
  day: number;
  /** The game day the player said yes, or null while only offered. */
  accepted: number | null;
  /** The player asked what it was (the panel then offers yes / no). */
  asked: boolean;
  /** The last game day it can be done on. */
  due: number;
  /** What to bring (`fetch`). */
  thing?: GiftKind;
  /** The game wanted (`findGame`) or lent (`lend`). */
  game?: { id: string; title: string; platform: string };
  /** `parcel`: collected at the lodge. `lend`: handed over (the game is out). */
  stage: number;
  /** `lend`: the game day it comes back. */
  back?: number;
  /** Offered by someone cross with the player, to make up. */
  amends?: boolean;
  /** How it ended: done (the day), failed (the day), declined. */
  done?: number;
  failed?: number;
  declined?: boolean;
}

interface LifeState {
  favours: Favour[];
  /** Whose birthday the player knows. */
  birthdays: PersonId[];
  /** The game day each was last wished a happy birthday. */
  wished: Record<PersonId, number>;
  /** How much closer two people grew ("a|b", sorted ids) -> tie offset. */
  ties: Record<string, number>;
  /** Pairs met at a gathering, by where and day ("a|b@where" -> day): once a day each. */
  met: Record<string, number>;
  /** The pairs whose friendship became news (the event told once). */
  events: string[];
  /** The game day each go-between last put in a word. */
  mediated: Record<PersonId, number>;
  /** Those who offered a make-amends favour (once each). */
  amends: PersonId[];
  /** Favours offered so far (for the ids). */
  serial: number;
}

const fresh = (): LifeState => ({ favours: [], birthdays: [], wished: {}, ties: {}, met: {}, events: [], mediated: {}, amends: [], serial: 0 });

let store: PersistedStore<LifeState> | null = null;
let state: LifeState | null = null;

/** The state, loaded on first use. */
export function life(): LifeState {
  if (state) return state;
  store = new PersistedStore<LifeState>({ key: KEYS.socialLife, version: 1, defaults: fresh, read: readLife });
  state = store.load();
  return state;
}

export function saveLife(): void {
  if (state) store?.save(state);
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function numbers(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isFinite(n)) out[k] = n;
  return out;
}

function readLife(data: unknown): LifeState | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<Record<keyof LifeState, unknown>>;
  const favours = Array.isArray(d.favours)
    ? d.favours.filter((f): f is Favour => !!f && typeof f === 'object' && typeof (f as Favour).id === 'string' && typeof (f as Favour).person === 'string' && typeof (f as Favour).day === 'number')
    : [];
  return {
    favours,
    birthdays: strings(d.birthdays),
    wished: numbers(d.wished),
    ties: numbers(d.ties),
    met: numbers(d.met),
    events: strings(d.events),
    mediated: numbers(d.mediated),
    amends: strings(d.amends),
    serial: typeof d.serial === 'number' ? d.serial : favours.length,
  };
}

/** The key of the pair `a`, `b` (either order). */
export function pairKey(a: PersonId, b: PersonId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** How much closer `a` and `b` grew at the player's gatherings (0 when never). */
export function tieOffset(a: PersonId, b: PersonId): number {
  return life().ties[pairKey(a, b)] ?? 0;
}

/** Everyone `id` grew closer to, with the offset. */
export function offsetTiesOf(id: PersonId): [PersonId, number][] {
  const out: [PersonId, number][] = [];
  for (const [key, offset] of Object.entries(life().ties)) {
    const [a, b] = key.split('|') as [string, string];
    if (a === id) out.push([b, offset]);
    else if (b === id) out.push([a, offset]);
  }
  return out;
}
