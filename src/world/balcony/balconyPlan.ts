import type { Doorway, RoomOptions } from '../Room';
import type { DecorEntry } from '../props/decor';

/*
 * THE BALCONY: a small stone balcony on the collection room's front wall (Front Street side, sixth
 * floor), reached through a glazed door where the room's right-hand front window used to be. Zone-local
 * coordinates, the origin on the balcony's floor at its middle; back (-z) is the building, front
 * (+z) the street. It is open air: no `Room` shell, the view all round is the painted panorama
 * (`Outdoors.material` on a surround), the building's own front stands behind it.
 */

/** The opening in the building's front: shared with the collection room's front wall (world x 2.0). */
export const BALCONY_DOOR: Pick<Doorway, 'width' | 'height'> = { width: 0.9, height: 2.3 };

/** The zone's extent: the balcony's floor and the air above it, as far as the railing. */
export const BALCONY_ROOM: RoomOptions = {
  width: 2.6,
  depth: 1.3,
  height: 2.8,
  doorways: [{ wall: 'back', along: 0, ...BALCONY_DOOR, door: false, to: 'living' }],
};

export const BALCONY_PLAN = {
  room: BALCONY_ROOM,
  /** The stone slab: thickness under the floor, how far it runs past the railing. */
  slab: { thickness: 0.18, lip: 0.06 },
  /** The wrought-iron railing along the three open sides. */
  railing: { height: 1.02, barSpacing: 0.11 },
  /**
   * The building's front around the balcony, in world metres (see `worldPlan.ts`): from our corner
   * on Park Street along Front Street past the neighbours; from the street up to the parapet. The
   * collection room's windows on it (world x of their middles, sill and head heights over the flat's
   * floor) are painted as glass: the real panes are behind it.
   */
  front: {
    x: [-3.3, 42] as [number, number],
    street: -16.3,
    top: 3.6,
    storey: 3.26,
    ourWindows: [{ x: 0.3, width: 1.2, bottom: 0.1, top: 2.5 }],
    /** Window pitch along the neighbours' part and the lower floors. */
    pitch: 2.6,
  },
  /** How far out the view's surround stands (it must clear everything of the flat). */
  surround: 45,
  /** The balcony's sun: a narrow spot this far out, aimed at the balcony's middle. */
  sun: { distance: 20, radius: 2.2 },
  decor: [
    { kind: 'plant', at: { floor: [-1.0, 0.35] }, options: { kind: 'small', pot: 'terracotta', seed: 21, collides: true } },
    { kind: 'plant', at: { floor: [1.05, 0.4] }, options: { kind: 'small', pot: 'ceramic', seed: 22, collides: true } },
  ] as DecorEntry[],
  /** The little bistro table and its two chairs, facing the street. */
  bistro: { floor: [0.45, 0.15] as [number, number] },
  /** Where the potted plants bought at the florist on Front Street stand, in the order they come home (`HomeUpgrades` 'plant'). */
  boughtPlants: [
    { floor: [-1.02, -0.38] as [number, number], kind: 'small', pot: 'terracotta', seed: 31 },
    { floor: [1.02, -0.38] as [number, number], kind: 'yucca', pot: 'ceramic', seed: 32, scale: 0.55 },
    { floor: [-0.6, 0.42] as [number, number], kind: 'small', pot: 'ceramic', seed: 33 },
  ] as const,
};
