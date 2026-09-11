import type { Doorway, RoomOptions } from './Room';

/**
 * The flat's front door: on the back wall, in the shelf-free stretch left of the bookcases (which
 * start at x = -1), a standard 83 cm leaf. It opens onto the flat's hallway.
 */
export const FRONT_DOOR: Doorway = { wall: 'back', along: -1.5, width: 0.83, height: 2.04 };

/** The room shell everything else is laid out in: 6 x 6 m, 2.8 m under the ceiling, one door. */
export const DEFAULT_ROOM: RoomOptions = { width: 6, depth: 6, height: 2.8, doorways: [FRONT_DOOR] };
