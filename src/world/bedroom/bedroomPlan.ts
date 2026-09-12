import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import { DOOR_LEAF } from '../roomPlan';

/*
 * THE BEDROOM PLAN, zone-local coordinates (origin at the centre of its floor). Walls as named
 * from the collection room's spawn: front = +z (the hallway is through it), back = -z, left = -x
 * (the bathroom is behind it), right = +x. 3.4 x 3.6 m, 2.8 m under the ceiling.
 * World: x from -1.1 to 2.3, z from -8.02 to -4.42; the door to the hallway is at world x -0.5.
 *
 * The door (front wall, x -1.1) swings in, hinged at x -0.685, and ends flat along the front wall
 * towards +x: nothing stands in x -1.5..0.1, z 1.0..1.8. The bed has its head to the back wall
 * with a nightstand each side, the wardrobe is on the left wall, a chair by the right wall, the
 * dresser on the front wall right of the door. No window: the right wall is the neighbour's side
 * (the collection room's right wall is blind for the same reason, the flat's entrance is at x 1)
 * and the back wall looks into the courtyard, which the outdoors panorama does not paint.
 */

export const BEDROOM_ROOM: RoomOptions = {
  width: 3.4,
  depth: 3.6,
  height: 2.8,
  // No windows: every wall keeps the light in (the hallway and the bathroom are behind the front and left walls).
  opaqueWalls: ['front', 'back', 'left', 'right'],
  doorways: [{ wall: 'front', along: -1.1, ...DOOR_LEAF, door: false, to: 'hallway' }],
};

export const BEDROOM_PLAN = {
  room: BEDROOM_ROOM,
  /** The fixture of the room's ceiling light (the `Room` puts its point light at the centre of the ceiling). */
  pendant: { ceiling: [0, 0] } as Placement,

  /**
   * The double bed, head to the back wall, right of centre: between its left side (x -0.4) and
   * the wardrobe's doors (x -1.15) stays a passage wide enough for the player (0.3 m radius).
   */
  bed: { wall: 'back', along: 0.4, y: 0 } as Placement,
  /** A nightstand either side of the bed (1.6 wide, so its edges are at x -0.4 and 1.2), each with a lamp on it. */
  nightstands: [
    { wall: 'back', along: -0.68, y: 0 },
    { wall: 'back', along: 1.47, y: 0 },
  ] as Placement[],

  /** The wardrobe on the left wall, short of the door's swing. */
  wardrobe: { at: { wall: 'left', along: 0.3, y: 0 } as Placement, depth: 0.55 },
  /** The chest of drawers on the front wall, right of where the open door ends, short of the chair. */
  dresser: { at: { wall: 'front', along: 0.6, y: 0 } as Placement, width: 0.8 },
  /** A chair in the front-right corner by the bare right wall, turned towards the bed, clothes over it. */
  chair: { floor: [1.36, 1.36], rotationY: -Math.PI * 0.75 } as Placement,

  decor: [
    // A rug at the foot of the bed, between it and the door's swing.
    { kind: 'rug', at: { floor: [0.4, 0.65] }, options: { width: 1.6, depth: 0.7, field: 0xb9a68a, border: 0x6e5a48, motif: 0x8c7358 } },
    // A wide landscape over the headboard, a small one over the dresser.
    { kind: 'pictureFrame', at: { wall: 'back', along: 0.4, y: 1.7 }, options: { motif: 'mountains', seed: 7, width: 0.9, height: 0.5, matWidth: 0.05 } },
    { kind: 'pictureFrame', at: { wall: 'front', along: 0.6, y: 1.55 }, options: { motif: 'sunset', seed: 12, width: 0.42, height: 0.32 } },
    // A fig in the back-left corner, behind the left nightstand.
    { kind: 'plant', at: { corner: 'back-left', inset: 0.38 }, options: { kind: 'fig', pot: 'terracotta', seed: 21, scale: 0.9 } },
  ] as DecorEntry[],
};
