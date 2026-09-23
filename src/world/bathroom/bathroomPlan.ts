import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import { WAINSCOT_THICKNESS, type TiledWainscotOptions } from '../props/TiledWainscot';
import { DOOR_LEAF } from '../roomPlan';
import { CISTERN_DEPTH, CISTERN_TOP } from '../props/Toilet';

/*
 * THE BATHROOM PLAN, zone-local coordinates (origin at the centre of its floor). Walls as named
 * from the collection room's spawn: front = +z (the hallway is through it), back = -z, left = -x
 * (the kitchen is behind it), right = +x (the bedroom is behind it). 1.8 x 2.4 m, 2.8 m under the ceiling.
 * World: x from -3.0 to -1.2, z from -6.82 to -4.42; the door to the hallway is at world x -2.1.
 *
 * The tub takes the whole back wall; the WC is on the left wall and the basin faces it on the
 * right, leaving a 0.73 m gangway between them down to the bath mat. Everything hung below
 * the tiles stands off the wall by their thickness. The strip inside the door
 * (x -0.5..0.5, z 0.6..1.2) stays clear: the basket is in the front-left corner, the towels hang
 * on the front wall right of the door.
 */

export const BATHROOM_ROOM: RoomOptions = {
  width: 1.8,
  depth: 2.4,
  height: 2.8,
  // Rooms on three sides; only the back wall faces outside (a small window may go there).
  opaqueWalls: ['front', 'left', 'right'],
  // Too narrow for a leaf to swing in: this room hangs the door and it opens out into the corridor.
  doorways: [{ wall: 'front', along: 0, ...DOOR_LEAF, to: 'hallway' }],
};

/** Local `along` of the WC on the left wall; the plant on its cistern is placed relative to it. */
const TOILET_ALONG = 0.05;

export const BATHROOM_PLAN = {
  room: BATHROOM_ROOM,
  /** Off-white like the corridor's other doors. */
  leafColor: 0xf1ede6,
  /** The fixture of the room's ceiling light. */
  light: { ceiling: [0, 0] } as Placement,
  /** Its switch inside the door, on the wall left of the architrave (x -0.9..-0.485), above the tiles' cap rail. */
  lightSwitch: { wall: 'front', along: -0.68, y: 1.4 } as Placement,

  /** White metro tiles up to 1.2 m round the room, a sage top row and cap rail; they stop at the door's architrave. */
  wainscot: { height: 1.2, accent: 0x9db3a6 } as TiledWainscotOptions,

  /** The tub along the back wall, 5 cm short of each side wall; tap, riser and screen at its left end. */
  bathtub: { wall: 'back', along: 0, y: 0, offset: WAINSCOT_THICKNESS } as Placement,
  /** A small frosted window high above the tub, clear of the shower riser (at x -0.55). */
  window: { wall: 'back', along: 0.35, y: 2.0 } as Placement,

  /** The basin on the right wall, its bottle shelf on the door side; the WC facing it on the left wall. */
  washbasin: { wall: 'right', along: 0.05, y: 0, offset: WAINSCOT_THICKNESS } as Placement,
  toilet: { wall: 'left', along: TOILET_ALONG, y: 0, offset: WAINSCOT_THICKNESS } as Placement,

  /** Towels by the door, on the front wall right of the architrave (x 0.485..0.9), the rail just under the tiles' cap. */
  towelRail: { wall: 'front', along: 0.69, y: 1.12, offset: WAINSCOT_THICKNESS } as Placement,
  /** The laundry basket in the corner inside the door, clear of the doormat. */
  laundryBasket: { corner: 'front-left', inset: 0.24 } as Placement,

  decor: [
    // A plain cotton bath mat between the WC and the basin, in front of the tub.
    { kind: 'rug', at: { floor: [0.12, -0.2] }, options: { width: 0.68, depth: 0.42, field: 0x8fa3ad, border: 0x8fa3ad, motif: 0x8fa3ad } },
    // A small fern on the cistern lid, away from the flush button (which sits towards -along, the tub side).
    {
      kind: 'plant',
      at: { wall: 'left', along: TOILET_ALONG + 0.12, y: CISTERN_TOP, offset: WAINSCOT_THICKNESS + CISTERN_DEPTH / 2 },
      options: { kind: 'small', pot: 'ceramic', seed: 31, collides: false, scale: 0.9 },
    },
    // The scale on the floor under the towels, in the front-right corner, out of the strip inside the door (x -0.5..0.5).
    { kind: 'bathroomScale', at: { floor: [0.65, 0.95], rotationY: Math.PI } },
  ] as DecorEntry[],
};
