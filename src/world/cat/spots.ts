import * as THREE from 'three';
import { pickWeighted, random } from '@/random';
import type { Seat } from '../Seat';
import type { CatBedLike } from './types';
import type { FloorNav } from '../nav/FloorNav';

/**
 * What the cat needs from a window (`RoomWindow` fits structurally): where to sit to look out,
 * where its sun patch lands on the floor, and where the glass is (to face it).
 */
export interface WindowLookout {
  lookoutSpot(out: THREE.Vector3): THREE.Vector3;
  sunSpotOnFloor(out: THREE.Vector3): THREE.Vector3 | null;
  getWorldPosition(out: THREE.Vector3): THREE.Vector3;
}

export type RestingSpotKind = 'bed' | 'seat' | 'perch' | 'rug' | 'sun' | 'floor';

/**
 * Somewhere elsewhere in the flat the cat naps on (the bed in the bedroom; `Bed` fits), up off the
 * floor or on it (a warm patch in front of a radiator: `restingSpot` then lies on the floor).
 */
export interface CatPerch {
  restingSpot(out: THREE.Vector3): THREE.Vector3;
  /** The floor point it hops up from. */
  approachPoint(out: THREE.Vector3): THREE.Vector3;
  /** World height of what the hop must clear on the way (a bathtub's rim); by default only the two ends count. */
  readonly hopApex?: number;
  /** False while the spot cannot be slept in (the tub being filled, the basin's tap running): not offered, and a cat there gets out. */
  available?(): boolean;
  /** How much the cat likes it, by night or by day; default 3 at night, 1 by day. */
  catWeight?(night: boolean): number;
}

/** Somewhere the cat lies down. Elevated spots (seats, the bed) are reached by a hop from `approach`. */
export interface RestingSpot {
  kind: RestingSpotKind;
  /** Body-centre position (world). Above the floor for the bed and the seats. */
  position: THREE.Vector3;
  /** Floor point the cat walks to first; equals `position` for floor spots. */
  approach: THREE.Vector3;
  /** Point to face once settled, or null for any direction. */
  facing: THREE.Vector3 | null;
  /** The armchair, when the spot is one: the cat leaves it when the player sits there. */
  seat: Seat | null;
  /** A perch's `hopApex` and `available`, carried along while the cat goes there and lies on it. */
  hopApex?: number;
  available?: () => boolean;
}

/** A spot is elevated when the cat must hop to reach it. */
export function isElevated(spot: RestingSpot): boolean {
  return spot.position.y > 0.05;
}

interface RestingSpotSources {
  nav: FloorNav;
  bounds: THREE.Box2;
  seats: readonly Seat[];
  /** The armchair the player sits in, never offered. */
  playerSeat: Seat | null;
  bed?: CatBedLike;
  windows?: readonly WindowLookout[];
  /** Other places to nap, up off the floor, reached through the flat's doorways when they are open. */
  perches?: readonly CatPerch[];
  /** A floor point on the rug (the TV watching spot), if there is a rug. */
  rugPoint?: THREE.Vector3;
  /** Where the cat is now (a lazy cat may just drop on the floor nearby). */
  from: THREE.Vector3;
  night: boolean;
}

/**
 * Picks a place to sleep by weighted random: the bed (favoured, doubly so at night), an armchair
 * the player is not in, the rug, a sun patch when a window throws one, or the floor nearby.
 * Allocates: only called when the cat decides to lie down.
 */
export function pickRestingSpot(sources: RestingSpotSources): RestingSpot | null {
  const shrunk = sources.bounds.clone().expandByScalar(-0.2);
  const centre2d = shrunk.getCenter(new THREE.Vector2());
  const room: RoomFloor = { shrunk, centre: new THREE.Vector3(centre2d.x, 0, centre2d.y) };
  const candidates = CANDIDATES.flatMap((candidatesOf) => candidatesOf(sources, room));
  // None when every weight is zero (nowhere worth going).
  const weighted = candidates.filter((c) => c.weight > 0);
  return weighted.length ? pickWeighted(random, weighted, (c) => c.weight).spot : null;
}

/** A place the cat might lie, and how much it fancies it. */
interface Candidate {
  spot: RestingSpot;
  weight: number;
}

/** The room's floor the places are judged against: its bounds stepped in from the walls, and its middle. */
interface RoomFloor {
  shrunk: THREE.Box2;
  centre: THREE.Vector3;
}

/** Where a cat might lie, each kind of place its own finder; in this order, since the rug and the floor draw random points. */
const CANDIDATES: readonly ((sources: RestingSpotSources, room: RoomFloor) => Candidate[])[] = [
  bedCandidates,
  perchCandidates,
  seatCandidates,
  rugCandidates,
  sunCandidates,
  floorCandidates,
];

/** The cat's bed: favoured, doubly so at night; approached from the room side so the little hop onto the padding reads. */
function bedCandidates(sources: RestingSpotSources, room: RoomFloor): Candidate[] {
  if (!sources.bed) return [];
  const position = sources.bed.restingSpot(new THREE.Vector3());
  const approach = position.clone().setY(0);
  const toCentre = room.centre.clone().sub(approach).setY(0);
  if (toCentre.lengthSq() > 1e-4) approach.addScaledVector(toCentre.normalize(), 0.3);
  return [{ spot: { kind: 'bed', position, approach, facing: room.centre.clone(), seat: null }, weight: sources.night ? 6 : 2.5 }];
}

/** The perches up off the floor that are open and reachable; the people's bed is a treat at night, by day the cat has its own. */
function perchCandidates(sources: RestingSpotSources): Candidate[] {
  const candidates: Candidate[] = [];
  for (const perch of sources.perches ?? []) {
    if (perch.available && !perch.available()) continue;
    const position = perch.restingSpot(new THREE.Vector3());
    const approach = perch.approachPoint(new THREE.Vector3());
    if (!sources.nav.isFree(approach)) continue;
    // On the floor (in front of a radiator) the spot itself must be free too: it walks there and lies down.
    if (position.y <= 0.05 && !sources.nav.isFree(position)) continue;
    const available = perch.available ? () => perch.available!() : undefined;
    const weight = perch.catWeight?.(sources.night) ?? (sources.night ? 3 : 1);
    candidates.push({ spot: { kind: 'perch', position, approach, facing: null, seat: null, hopApex: perch.hopApex, available }, weight });
  }
  return candidates;
}

/** An armchair nobody is in or heading for: the player's, or a visiting friend's, is never offered. */
function seatCandidates(sources: RestingSpotSources): Candidate[] {
  const candidates: Candidate[] = [];
  for (const seat of sources.seats) {
    if (seat === sources.playerSeat || seat.guest) continue;
    const approach = seat.approachPoint(new THREE.Vector3());
    if (!sources.nav.isFree(approach)) continue;
    const position = seat.restingSpot(new THREE.Vector3());
    candidates.push({ spot: { kind: 'seat', position, approach, facing: approach.clone(), seat }, weight: 2.5 });
  }
  return candidates;
}

/** Somewhere on the rug, a little off its middle. */
function rugCandidates(sources: RestingSpotSources): Candidate[] {
  if (!sources.rugPoint) return [];
  const position = sources.rugPoint.clone();
  position.x += THREE.MathUtils.randFloatSpread(0.5);
  position.z += THREE.MathUtils.randFloatSpread(0.5);
  position.y = 0;
  return sources.nav.isFree(position) ? [{ spot: { kind: 'rug', position, approach: position, facing: null, seat: null }, weight: 1 }] : [];
}

/** A sun patch a window throws on the floor, by day, facing the window. */
function sunCandidates(sources: RestingSpotSources, room: RoomFloor): Candidate[] {
  if (!sources.windows || sources.night) return [];
  const candidates: Candidate[] = [];
  for (const window of sources.windows) {
    const position = window.sunSpotOnFloor(new THREE.Vector3());
    if (!position) continue;
    position.y = 0;
    if (!room.shrunk.containsPoint(new THREE.Vector2(position.x, position.z)) || !sources.nav.isFree(position)) continue;
    candidates.push({ spot: { kind: 'sun', position, approach: position, facing: window.getWorldPosition(new THREE.Vector3()), seat: null }, weight: 2.5 });
  }
  return candidates;
}

/** The floor nearby, for a lazy cat. */
function floorCandidates(sources: RestingSpotSources): Candidate[] {
  const floor = sources.nav.randomFreePoint(new THREE.Vector3(), sources.from, 1.2);
  return floor ? [{ spot: { kind: 'floor', position: floor, approach: floor, facing: null, seat: null }, weight: 0.4 }] : [];
}
