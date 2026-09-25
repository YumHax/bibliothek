/*
 * THE AIRLOCK: the building's street entrance as a vestibule ("le sas") between the street door
 * and a glazed inner door. It stands twice, identical to the centimetre: at the end of the
 * stairwell's entrance hall and behind our building's door on Front Street. The street is a place of
 * its own (docs/zones.md), so crossing from one twin to the other with both doors shut moves the
 * player to the same spot of the other twin: nothing seen changes, and no curtain is needed.
 *
 * Sas-local metres: origin on the floor at the middle of the street door's outer face (the street
 * wall's outer plane, the facade), +z out to the street, x across (+x on the right seen from the
 * street), the sas itself at -z. Both twins face +z in their zone (yaw 0), and their zones are not
 * turned, so the move is a translation.
 *
 *   z  0      ── street door (two leaves, open outward onto the pavement) in the street wall
 *     -0.2    ── the street wall's inner face
 *              the sas: x -1.45 .. 1.45, the door release by the street door on the right wall
 *     -1.58   ── the partition's sas face, the glazed inner door in it (opens into the building)
 *     -1.7    ── the partition's building face
 */

import type { ZoneId } from '../zoneIds';

export const SAS = {
  /** Inside, wall to wall (x). */
  width: 2.9,
  /** From the facade to the partition's building face. */
  depth: 1.7,
  /** The sas's ceiling. */
  height: 2.95,
  /** The street wall's thickness: the street door stands in it. */
  wall: 0.2,
  /** The partition's thickness, and how high it runs on the building side (the entrance hall's ceiling). */
  partition: 0.12,
  partitionHeight: 3.1,
  /** How far the partition's building face runs either side (the entrance hall's walls, x 0.6 .. 3.6). */
  partitionReach: 1.5,
  /** The street door's opening (the painted entrance's: `facadePainter.paintEntrance`). */
  outerDoor: { width: 1.4, height: 2.7 },
  /** The glazed inner door's opening, centred. */
  innerDoor: { width: 0.9, height: 2.25 },
  /** The marble dado, knee high like the hall's. */
  dado: 1.0,
  /** The ceiling globe, and the door release on the right wall by the street door (centre). */
  lamp: [0, 2.83, -0.9] as readonly [x: number, y: number, z: number],
  button: { z: -0.5, y: 1.2 },
  /** The notice on the left wall (centre). */
  notice: { z: -0.9, y: 1.55 },
} as const;

/** Which twin: the one in the stairwell's entrance hall, or the one behind the facade on Front Street. */
export type TwinId = 'hall' | 'street';

/**
 * Each twin's zone and its "live" door: the one opening onto its own zone. The other door is the
 * way through: using it crosses to the twin, whose live door then opens (the hall's street door
 * opens the street's; the street's inner door opens the hall's).
 */
export const TWINS: Record<TwinId, { zone: ZoneId; live: 'inner' | 'outer'; other: TwinId }> = {
  hall: { zone: 'stairwell', live: 'inner', other: 'street' },
  street: { zone: 'street', live: 'outer', other: 'hall' },
};
