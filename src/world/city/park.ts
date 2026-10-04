import { PARK_SECTION, inFlatFrame } from './frontage';
import { STREET_PLAN } from '../street/streetPlan';

/*
 * The park across Park Street, in the flat's frame (metres from the collection room's floor centre,
 * -x out of the left windows): its lawn from the hedge (`PARK_EDGE`) out to the blocks on its far side
 * (`PARK_FAR`), the pond with its fountain, the bandstand, the playground, the flower beds, the
 * willows and the gravel paths. The window view paints it (`props/outdoors/Park`); the walkable
 * street plants its trees clear of the same things (`city/trees`).
 */

/** The park's near edge is Park Street's far frontage (its hedge); its far edge is lined with mid-rise blocks. */
export const PARK_EDGE = -PARK_SECTION.hedge;
export const PARK_FAR = 250;

/** The pond: an ellipse on the lawn. */
export const POND = { x: -115, z: -25, rx: 40, rz: 26 };
/** The fountain in the middle of the pond (`Life` animates its plume). */
export const FOUNTAIN = { x: POND.x, z: POND.z };
export const BANDSTAND = { x: -88, z: 54, width: 6 };
export const PLAYGROUND = { x: -55, z: -48, radius: 13 };
/** Round flower beds: centre and radius. */
export const FLOWER_BEDS: readonly [number, number, number][] = [[-37, 10, 3], [-41, -37, 2.5], [-63, 17, 3.5], [-48, 63, 3], [-90, 12, 2.5], [-33, 46, 2]];
/** Weeping willows leaning over the pond's banks. */
export const WILLOWS: readonly [number, number][] = [[-74, -36], [-121, 5], [-150, -38]];
/** Where the gate in the railings on Park Street is (z): the walkable street's (`STREET_PLAN.parkGate`). */
const PARK_GATE_Z = inFlatFrame(STREET_PLAN.parkGate.at)[1];
/**
 * Gravel paths across the lawn, as polylines (the walkers of `Life` follow them): one from the gate,
 * one from the far corner behind Front Street's block, and one branching off the first towards the south.
 */
export const PARK_PATHS: [number, number][][] = [
  [[-PARK_EDGE, PARK_GATE_Z], [-70, -30], [-110, -72], [-160, -62], [-210, -20], [-PARK_FAR, 0]],
  [[-PARK_EDGE, 30], [-60, 45], [-85, 40], [-120, 15], [-150, 40], [-200, 80], [-PARK_FAR, 90]],
  [[-44, -21], [-55, -90], [-90, -130], [-140, -170], [-200, -200]],
];
/** The lit fir put up in the park at Christmas, near the gate (both the painted view and the walkable street's), and its size. */
export const PARK_FIR = { x: -46, z: -2, height: 13, radius: 4.2 };
/** How wide the paths are. */
export const PATH_WIDTH = 3;

export function insidePond(x: number, z: number, margin: number): boolean {
  const dx = (x - POND.x) / (POND.rx + margin);
  const dz = (z - POND.z) / (POND.rz + margin);
  return dx * dx + dz * dz < 1;
}

/** Whether (x, z) is free lawn, `margin` metres clear of the pond, the bandstand, the playground and the beds. */
export function onLawn(x: number, z: number, margin: number): boolean {
  if (insidePond(x, z, margin) || Math.hypot(x - BANDSTAND.x, z - BANDSTAND.z) < 5 + margin) return false;
  if (Math.hypot(x - PLAYGROUND.x, z - PLAYGROUND.z) < PLAYGROUND.radius + margin) return false;
  return FLOWER_BEDS.every(([bx, bz, r]) => Math.hypot(x - bx, z - bz) > r + margin);
}

/** Whether (x, z) is `margin` metres clear of every path's edge. */
export function offPaths(x: number, z: number, margin: number): boolean {
  for (const path of PARK_PATHS) {
    for (let i = 1; i < path.length; i++) {
      const [x0, z0] = path[i - 1]!;
      const [x1, z1] = path[i]!;
      const dx = x1 - x0;
      const dz = z1 - z0;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz)));
      if (Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)) < PATH_WIDTH / 2 + margin) return false;
    }
  }
  return true;
}
