import * as THREE from 'three';
import { FACADES, type FacadeSpec, type Vec2 } from '../street/streetPlan';

/*
 * Which of the street's facades a window sees (`streetOutlook` builds them): light, so a zone can say what its window
 * sees without loading the street's classes (they come in the street's chunk, when the view is built).
 */

/** How far from the window a facade is built (m: down Front Street to its far end, `frontEnd`), and within what distance it is painted at the street's finest. */
const REACH = 150;
const FINE_WITHIN = 35;
const FINE_DETAIL = 34;

/** The facades of our own building: the windows looking out are in them (their backs would stand in the view). */
export const OUR_BUILDING = ['ours', 'oursBay', 'oursSide', 'oursBack', 'oursBackW', 'oursWell', 'oursWellE', 'oursWellW'];

/**
 * The facades seen from `eye`: within `REACH` of it, their face turned towards it, less `without`; the near ones
 * painted as finely as the street's nearest (a courtyard's rear building is seen from 15 m, not from the far pavement).
 */
export function facadesInView(eye: Vec2, without: readonly string[]): FacadeSpec[] {
  const [ex, ez] = eye;
  const seen: FacadeSpec[] = [];
  for (const spec of FACADES) {
    if (without.includes(spec.id)) continue;
    const [ax, az] = spec.from;
    const dx = spec.to[0] - ax;
    const dz = spec.to[1] - az;
    const length = Math.hypot(dx, dz);
    // Its face is the left-hand normal of from -> to.
    if (-dz * (ex - ax) + dx * (ez - az) <= 0) continue;
    const t = THREE.MathUtils.clamp(((ex - ax) * dx + (ez - az) * dz) / (length * length), 0, 1);
    const distance = Math.hypot(ax + dx * t - ex, az + dz * t - ez);
    if (distance > REACH) continue;
    seen.push(distance < FINE_WITHIN ? { ...spec, detail: Math.max(spec.detail, FINE_DETAIL) } : spec);
  }
  return seen;
}

/**
 * The facades seen from any window of our building (the flat's, the stairwell's, the neighbours' flats' on both
 * sides): those facing a point just outside one of our own facades, within reach of it, less our building itself
 * (its kitchen wing, `oursWing`, stays: the kitchen's and the courtyard's windows see it). One view serves them all
 * (`homeOutlook`): the street is built once for the whole building.
 */
export function homeFacades(): FacadeSpec[] {
  const eyes: Vec2[] = [];
  for (const spec of FACADES) {
    if (!OUR_BUILDING.includes(spec.id)) continue;
    const [ax, az] = spec.from;
    const dx = spec.to[0] - ax;
    const dz = spec.to[1] - az;
    const length = Math.hypot(dx, dz) || 1;
    // Half a metre out of the face (its left-hand normal), at both ends and the middle.
    const nx = -dz / length;
    const nz = dx / length;
    for (const t of [0.05, 0.5, 0.95]) eyes.push([ax + dx * t + nx * 0.5, az + dz * t + nz * 0.5]);
  }
  const seen = new Map<string, FacadeSpec>();
  for (const eye of eyes) {
    for (const spec of facadesInView(eye, OUR_BUILDING)) {
      const had = seen.get(spec.id);
      if (!had || spec.detail > had.detail) seen.set(spec.id, spec);
    }
  }
  return FACADES.filter((spec) => seen.has(spec.id)).map((spec) => seen.get(spec.id)!);
}
