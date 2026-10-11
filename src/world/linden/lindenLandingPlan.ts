import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import { DOOR_LEAF } from '../roomPlan';

/*
 * MÉMÉ'S LANDING at number 14, Linden Avenue (docs/grandma.md "Around her flat"), zone-local (origin at the centre of
 * its floor; front = +z, her door; back = -z, Mr Ferrand's across; left = -x, the stairs down). Her flat's door is a
 * real doorway onto her room (`GRANDMA_FLAT_ROOM.doorways`: the landing hangs the leaf, it opens into her flat); the
 * stairs down to the street door are a glazed travel door (the avenue, `lindenAvenue`). From below, through the
 * well, Mrs Bassot's Biscotte barking at her radiator.
 *
 * World: her flat's back wall is at world z -2.3, its door at world x 558 (her flat's along -2.0, origin x 560); this
 * room's front wall sits `WALL_GAP` behind it, the door at along -0.6 (the zone's origin at x 558.6).
 */

type Vec2 = [number, number];
type Vec3 = [number, number, number];

export const LINDEN_LANDING_ROOM: RoomOptions = {
  width: 3.2,
  depth: 2.2,
  height: 2.75,
  doorways: [{ wall: 'front', along: -0.6, ...DOOR_LEAF, hinge: 'right', swing: 90, to: 'grandmaFlat' }],
  opaqueWalls: ['front', 'back', 'left', 'right'],
  finish: { floor: 'concrete', walls: 0xd8c8a4, ceiling: 0xf0ead8, trim: 0x6a5238, moulding: false },
};

export const LINDEN_LANDING_PLAN = {
  room: LINDEN_LANDING_ROOM,
  /** Up the stairs from the street door: by the stairs' door, turned to hers. */
  arrival: { at: [-0.9, -0.25] as Vec2, yaw: Math.PI },
  /** The stairs' glazed door down to the avenue (out of number 14's street door). */
  stairs: { wall: 'left', along: 0.1, y: 0 } as Placement,
  /** Mr Ferrand's door across the landing, and its colour. */
  ferrand: { at: { wall: 'back', along: 0.55, y: 0 } as Placement, colour: 0x5a3a2a, mat: 0x6a5a3a },
  /** The timer light over the landing and its button by the stairs' door. */
  light: { ceiling: [0, 0] } as Placement,
  lightSwitch: { wall: 'left', along: -0.75, y: 1.1 } as Placement,
  /** Where Biscotte is heard from: down the well, under the stairs' door. */
  barking: [-1.5, -1.2, 0.1] as Vec3,
  decor: [
    { kind: 'doormat', at: { floor: [-0.6, 0.78] }, options: { width: 0.75, depth: 0.42, seed: 31 } },
    { kind: 'plant', at: { corner: 'front-right', inset: 0.32 }, options: { kind: 'small', pot: 'terracotta', seed: 77 } },
    { kind: 'radiator', at: { wall: 'right', along: -0.3, y: 0 }, options: { style: 'column', width: 0.6 } },
  ] as DecorEntry[],
};
