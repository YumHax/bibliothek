import * as THREE from 'three';
import type { Seat } from '../Seat';
import type { CatBedLike } from './types';
import type { CatNav } from './CatNav';

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

export interface RestingSpotSources {
  nav: CatNav;
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
  const candidates: { spot: RestingSpot; weight: number }[] = [];
  const shrunk = sources.bounds.clone().expandByScalar(-0.2);
  const centre2d = shrunk.getCenter(new THREE.Vector2());
  const centre = new THREE.Vector3(centre2d.x, 0, centre2d.y);

  if (sources.bed) {
    const position = sources.bed.restingSpot(new THREE.Vector3());
    // Step in from the room side of the bed so the little hop onto the padding reads.
    const approach = position.clone().setY(0);
    const toCentre = centre.clone().sub(approach).setY(0);
    if (toCentre.lengthSq() > 1e-4) approach.addScaledVector(toCentre.normalize(), 0.3);
    candidates.push({ spot: { kind: 'bed', position, approach, facing: centre.clone(), seat: null }, weight: sources.night ? 6 : 2.5 });
  }

  for (const perch of sources.perches ?? []) {
    if (perch.available && !perch.available()) continue;
    const position = perch.restingSpot(new THREE.Vector3());
    const approach = perch.approachPoint(new THREE.Vector3());
    if (!sources.nav.isFree(approach)) continue;
    // On the floor (in front of a radiator) the spot itself must be free too: it walks there and lies down.
    if (position.y <= 0.05 && !sources.nav.isFree(position)) continue;
    const available = perch.available ? () => perch.available!() : undefined;
    // The people's bed is a treat at night; by day the cat has its own.
    const weight = perch.catWeight?.(sources.night) ?? (sources.night ? 3 : 1);
    candidates.push({ spot: { kind: 'perch', position, approach, facing: null, seat: null, hopApex: perch.hopApex, available }, weight });
  }

  for (const seat of sources.seats) {
    if (seat === sources.playerSeat) continue;
    const approach = seat.approachPoint(new THREE.Vector3());
    if (!sources.nav.isFree(approach)) continue;
    const position = seat.restingSpot(new THREE.Vector3());
    candidates.push({ spot: { kind: 'seat', position, approach, facing: approach.clone(), seat }, weight: 2.5 });
  }

  if (sources.rugPoint) {
    const position = sources.rugPoint.clone();
    position.x += THREE.MathUtils.randFloatSpread(0.5);
    position.z += THREE.MathUtils.randFloatSpread(0.5);
    position.y = 0;
    if (sources.nav.isFree(position)) candidates.push({ spot: { kind: 'rug', position, approach: position, facing: null, seat: null }, weight: 1 });
  }

  if (sources.windows && !sources.night) {
    for (const window of sources.windows) {
      const position = window.sunSpotOnFloor(new THREE.Vector3());
      if (!position) continue;
      position.y = 0;
      if (!shrunk.containsPoint(new THREE.Vector2(position.x, position.z)) || !sources.nav.isFree(position)) continue;
      candidates.push({ spot: { kind: 'sun', position, approach: position, facing: window.getWorldPosition(new THREE.Vector3()), seat: null }, weight: 2.5 });
    }
  }

  const floor = sources.nav.randomFreePoint(new THREE.Vector3(), sources.from, 1.2);
  if (floor) candidates.push({ spot: { kind: 'floor', position: floor, approach: floor, facing: null, seat: null }, weight: 0.4 });

  return pickWeighted(candidates)?.spot ?? null;
}

/** Weighted random choice; null when every weight is zero. */
export function pickWeighted<T extends { weight: number }>(items: readonly T[]): T | null {
  let total = 0;
  for (const item of items) total += Math.max(0, item.weight);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const item of items) {
    r -= Math.max(0, item.weight);
    if (r <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}
