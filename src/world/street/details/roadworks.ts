import * as THREE from 'three';
import { STREET_PLAN } from '../streetPlan';
import { FRONT, PARK_PARKING, PARK_STREET, WORKS, WORKS_LIFT, setFrontStreetEnd } from '@/world/measures/street';

/** A span across a street (zone-local metres on the across axis), low to high. */
export type Span = readonly [number, number];

/**
 * One of the roadworks that close the walkable street, in its own frame: local x runs along the
 * street (the works and everything past them are +x, the walkable street -x), local z across it in
 * the street's zone-local coordinate (z for Front Street, x for Park Street), y up from the pavement.
 */
export interface Closure {
  id: 'front' | 'park';
  /** Local -> zone-local. */
  frame: THREE.Matrix4;
  /** Zone-local yaw of the frame (a local yaw plus this is the zone-local one; yaw 0 looks +z). */
  rotation: number;
  pavements: readonly Span[];
  parking: readonly Span[];
  /** The traffic lanes between the parking lanes: the gap the cars drive through, and the roadworker stands in. */
  lanes: Span;
  /** The lines the cones stand along, past the works. */
  coneLines: readonly number[];
  /** Where the cars drive through the lanes' gap (the traffic's lines, local z): the cones on the works' line keep clear. */
  carLines: readonly number[];
}

const span = (a: number, b: number): Span => [Math.min(a, b), Math.max(a, b)];

/** Across Front Street at x `x` (`WORKS.front`, or `WORKS_LIFT.front` once the works moved on): past it (+x) the road runs on to the side street. */
function frontWorks(x: number): Closure {
  return {
    id: 'front',
    frame: new THREE.Matrix4().makeTranslation(x, 0, 0),
    rotation: 0,
    pavements: [span(FRONT.ourLine, FRONT.nearKerb), span(FRONT.farKerb, FRONT.farLine)],
    parking: [span(FRONT.nearKerb, -STREET_PLAN.parkingLine), span(STREET_PLAN.parkingLine, FRONT.farKerb)],
    lanes: span(-STREET_PLAN.parkingLine, STREET_PLAN.parkingLine),
    coneLines: [-STREET_PLAN.parkingLine - 0.05, STREET_PLAN.parkingLine + 0.05],
    carLines: [-1.6, 1.6],
  };
}

/** Across Park Street at z `WORKS.park`: past it (-z) the street runs on south. Local +x is zone -z, local z is zone x. */
const PARK_WORKS: Closure = {
  id: 'park',
  frame: new THREE.Matrix4().makeTranslation(0, 0, WORKS.park).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)),
  rotation: Math.PI / 2,
  pavements: [span(PARK_STREET.line, PARK_STREET.nearKerb), span(PARK_STREET.farKerb, PARK_STREET.hedge)],
  parking: [span(PARK_STREET.nearKerb, PARK_STREET.nearKerb - PARK_PARKING), span(PARK_STREET.farKerb + PARK_PARKING, PARK_STREET.farKerb)],
  lanes: span(PARK_STREET.nearKerb - PARK_PARKING, PARK_STREET.farKerb + PARK_PARKING),
  coneLines: [PARK_STREET.nearKerb - PARK_PARKING - 0.05, PARK_STREET.farKerb + PARK_PARKING + 0.05],
  carLines: [-31, -27.4],
};

let frontX: number = WORKS.front;
let current: readonly Closure[] = [frontWorks(frontX), PARK_WORKS];

/**
 * Where the works stand on market day `gameDay`: Front Street's moves on to `WORKS_LIFT.front` from
 * `WORKS_LIFT.afterGameDay`, and the walkable street's end with it (`setFrontStreetEnd`). Called before the street (or
 * a view of it) is built; the works never move back.
 */
export function syncWorks(gameDay: number): void {
  const x = gameDay >= WORKS_LIFT.afterGameDay ? WORKS_LIFT.front : WORKS.front;
  if (x !== frontX) {
    frontX = x;
    current = [frontWorks(x), PARK_WORKS];
  }
  setFrontStreetEnd(x);
}

/** Whether Front Street's works have moved on past the first stretch (its doors walked to). */
export function frontWorksMoved(): boolean {
  return frontX !== WORKS.front;
}

/** The roadworks closing the walkable street now: across Front Street, then across Park Street. */
export function closures(): readonly Closure[] {
  return current;
}

/** The zone-local box of a local box (x0..x1 along, z0..z1 across, y0..y1 up) in a closure's frame. */
export function closureBox(closure: Closure, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number): THREE.Box3 {
  const corners = [
    new THREE.Vector3(x0, y0, z0),
    new THREE.Vector3(x1, y1, z1),
    new THREE.Vector3(x0, y0, z1),
    new THREE.Vector3(x1, y1, z0),
  ].map((p) => p.applyMatrix4(closure.frame));
  return new THREE.Box3().setFromPoints(corners);
}
