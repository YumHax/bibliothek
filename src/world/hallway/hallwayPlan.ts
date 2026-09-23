import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import { DOOR_LEAF } from '../roomPlan';

/*
 * THE HALLWAY PLAN: the flat's corridor behind the collection room's door, in zone-local
 * coordinates (origin at the centre of its floor). Walls as named from the collection room's
 * spawn: front = +z (the collection room is through it), back = -z (bathroom and bedroom doors),
 * left = -x (the kitchen at the end), right = +x (the flat's front door: a teleport, it never swings).
 * The corridor is 4 m long and 1.3 m wide under a dropped 2.6 m ceiling.
 */

/** The doorway shared with the collection room; the collection room hangs the leaf. */
export const HALLWAY_LIVING_DOOR = { wall: 'front', along: -0.5, ...DOOR_LEAF, door: false, to: 'living' } as const;

export const HALLWAY_ROOM: RoomOptions = {
  width: 4,
  depth: 1.3,
  height: 2.6,
  // No windows: every wall keeps the light in.
  opaqueWalls: ['front', 'back', 'left', 'right'],
  doorways: [
    HALLWAY_LIVING_DOOR,
    // Across the corridor: the bathroom on the left (too small for a door to swing in: it hangs
    // its own, opening into the corridor) and the bedroom on the right (hung here, swinging in,
    // hinged away from the bedroom's corner).
    { wall: 'back', along: -1.1, ...DOOR_LEAF, door: false, to: 'bathroom' },
    { wall: 'back', along: 0.5, ...DOOR_LEAF, hinge: 'right', to: 'bedroom' },
    // The kitchen at the left end: hinged away from the kitchen's front corner.
    { wall: 'left', along: 0, ...DOOR_LEAF, hinge: 'right', to: 'kitchen' },
  ],
};

export const HALLWAY_PLAN = {
  room: HALLWAY_ROOM,

  /** The corridor's doors are painted off-white, like every interior door of the flat but the collection room's green one. */
  leafColor: 0xf1ede6,

  /** Flush ceiling light in the middle of the corridor. */
  light: { ceiling: [0, 0] } as Placement,
  /** Its switch on our wall, on the latch side of the collection room's door (the open leaf covers the hinge side, x -1.75..-0.9). */
  lightSwitch: { wall: 'front', along: 0.05, y: 1.1 } as Placement,

  /** The console (mail, keys, mirror) against the far wall by the entrance, the coat corner facing it on our wall. */
  console: { wall: 'back', along: 1.5, y: 0 } as Placement,
  coatRack: { wall: 'front', along: 1.25, y: 0 } as Placement,

  /** The flat's front door at the right end: it never swings, clicking it teleports (arcade, market). */
  entrance: { wall: 'right', along: 0, y: 0 } as Placement,
  /** Coming home: set down in front of the entrance, facing down the corridor (-x). */
  arrival: { at: [1.2, 0.08] as [number, number], yaw: Math.PI / 2 },

  decor: [
    // A runner down the middle: dark red border round a faded field. It stops short of the kitchen
    // and bedroom doors' mats (each 0.42 m into the corridor), which lie at the same height and would z-fight with it.
    { kind: 'rug', at: { floor: [-0.675, 0] }, options: { width: 1.55, depth: 0.7, field: 0x9c6a5a, border: 0x6b2f2a, motif: 0x7a4a40 } },
    // A framed picture on our wall between the collection room's door and the coats (left of the door the open leaf would cover it).
    { kind: 'pictureFrame', at: { wall: 'front', along: 0.4, y: 1.5 }, options: { motif: 'abstract', seed: 4, width: 0.42, height: 0.32 } },
    // A small photo on the far wall in the stretch between the kitchen door and the bathroom door (x -2..-1.5);
    // the bathroom's leaf opens into the corridor and lies over the wall right of its opening, so nothing hangs there.
    { kind: 'pictureFrame', at: { wall: 'back', along: -1.76, y: 1.5 }, options: { motif: 'sunset', seed: 9, width: 0.24, height: 0.3, matWidth: 0.025 } },
    // Umbrellas in the corner by the front door, past the end of the coat rack (which ends at x 1.6).
    { kind: 'umbrellaStand', at: { corner: 'front-right', inset: 0.22 } },
    // Smoke detector on the corridor's ceiling, off the flush light.
    { kind: 'smokeDetector', at: { ceiling: [0.9, 0] } },
  ] as DecorEntry[],
};
