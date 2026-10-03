import * as THREE from 'three';
import type { SessionActions } from '@/game/SessionActions';
import { KEYS, PersistedStore } from '@/persistence';
import { befriend, friendship } from '@/building/friendship';
import { arriveNextAt } from '../travel/nextArrival';
import { STAIRWELL_PLAN, landingY } from '../stairwell/stairwellPlan';
import { NEIGHBOUR_FLAT_PLAN, NEIGHBOUR_HOSTS, hostAt, type NeighbourHost } from './neighbourFlatPlan';

/*
 * Visiting the neighbours. A knock on their door while they are home counts for how well they know the player
 * (`building/friendship`, once a day); once it is enough for them (`NeighbourHost.inviteAt`), the knock gets "come
 * in" and the player travels into their flat (the `neighbourFlat` zone, dressed for them: `FlatDressing` reads
 * `currentHost`). Their door back leads onto the landing in front of theirs (`leaveFor`). Who the player visits now
 * and whose flats they have been in persist, so a reload inside comes back to the same flat.
 */

/** How much each thing done with a neighbour counts (`befriend`), once a game day each. */
export const FRIENDSHIP_NUDGES = { knock: 8, visit: 5, watch: 6 } as const;

interface State {
  current: string | null;
  visited: string[];
}

const store = new PersistedStore<State>({ key: KEYS.neighbourVisits, version: 1, defaults: () => ({ current: null, visited: [] }), read: readState });
let state: State = store.load();
const listeners = new Set<(host: NeighbourHost) => void>();

function readState(data: unknown): State | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<State>;
  return {
    current: typeof d.current === 'string' ? d.current : null,
    visited: Array.isArray(d.visited) ? d.visited.filter((k): k is string => typeof k === 'string') : [],
  };
}

/** The door key `k:i` (as `stairwell/building.doorKey`). */
function keyOf(host: NeighbourHost): string {
  return `${host.k}:${host.i}`;
}

/** Whose flat the `neighbourFlat` zone is now (the last one visited; the first host before any visit). */
export function currentHost(): NeighbourHost {
  return NEIGHBOUR_HOSTS.find((h) => keyOf(h) === state.current) ?? NEIGHBOUR_HOSTS[0]!;
}

/** Hears of a change of host (the zone redresses itself); returns the unsubscribe. */
export function onHostChange(cb: (host: NeighbourHost) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The door's key of `host`, for the friendship and the swaps. */
export function hostKey(host: NeighbourHost): string {
  return keyOf(host);
}

/** What a door on the stairs needs to know of the moment: whether they are in, the hour, the game day. */
export interface DoorMoment {
  isHome: () => boolean;
  hours: () => number;
  day: () => number;
}

/** A neighbour's door as a way into their flat: its caption when they would ask the player in, and the knock. */
export interface DoorVisit {
  /** "Mrs Roux, 5th floor · visit" while they would let the player in now; null otherwise (the door's own caption). */
  label(): string | null;
  /**
   * The knock: counts for the friendship and, once they know the player well enough, lets them in (true: handled,
   * travelling). False: the door answers as before (their line, or nobody).
   */
  knock(session: SessionActions): boolean;
}

/** The door of landing `k`, door `i` as a visit, if that neighbour is one who asks the player in. */
export function doorVisit(k: number, i: number, moment: DoorMoment): DoorVisit | undefined {
  const host = hostAt(k, i);
  if (!host) return undefined;
  const key = keyOf(host);
  const open = (): boolean => {
    const h = moment.hours();
    return moment.isHome() && h >= NEIGHBOUR_FLAT_PLAN.hours[0] && h < NEIGHBOUR_FLAT_PLAN.hours[1];
  };
  return {
    label: () => (open() && friendship(key) >= host.inviteAt ? `${host.who}, ${STAIRWELL_PLAN.floorNames[k]} floor · visit` : null),
    knock: (session) => {
      if (!open()) return false;
      const counted = befriend(key, FRIENDSHIP_NUDGES.knock, 'knock', moment.day());
      if (friendship(key) < host.inviteAt) {
        if (counted) session.tip('Neighbours who get to know you ask you in: knock now and then, say hello on the stairs, take them up on a swap.', { id: 'neighbour-knock' });
        return false;
      }
      enter(host, session);
      return true;
    },
  };
}

/** Into `host`'s flat: their welcome, the zone dressed for them, the travel behind the curtain. */
function enter(host: NeighbourHost, session: SessionActions): void {
  const key = keyOf(host);
  const first = !state.visited.includes(key);
  const changed = state.current !== key;
  state = { current: key, visited: first ? [...state.visited, key] : state.visited };
  store.save(state);
  if (changed) for (const cb of [...listeners]) cb(host);
  const { again } = host.welcome;
  session.say(first ? host.welcome.first : again[Math.floor(Math.random() * again.length)]!, host.who);
  session.travel('neighbourFlat');
}

/** Before going out of `host`'s door: the player is set down on their landing, in front of it, facing the stairwell. */
export function leaveFor(host: NeighbourHost): void {
  const { origin, doorX, ourNeighbourX, walk } = STAIRWELL_PLAN;
  const x = host.k === 0 ? ourNeighbourX : doorX[host.i]!;
  const at = new THREE.Vector3(origin[0] + x, origin[1] + landingY(host.k), origin[2] + walk.doorZ);
  arriveNextAt('stairwell', at, 0);
}
