import type { Furnishings } from '@/furnishing/Furnishings';
import type { Zone } from '../zone/Zone';
import type { ShelvingOptions } from '../shelving/Shelving';
import { slotCount } from '../shelving/Shelving';
import { ROOM_PLAN } from '../roomPlan';

/** The collection room's shelving, as `layout.ts` builds it (bar the overflow list): the run along the back and right walls. */
export function livingShelvingOptions(): Omit<ShelvingOptions, 'overflow'> {
  const plan = ROOM_PLAN;
  const pictureHalf = plan.projectorPicture.width / 2 + plan.projectorPicture.margin;
  return { room: plan.room, ...plan.shelving, rightWallKeepClear: { minZ: -pictureHalf, maxZ: pictureHalf } };
}

let livingSlots: number | null = null;

/**
 * Where the bookcases stand, with `bought` of them bought (`HomeUpgrades` 'bookcase'): the collection room has one from
 * the start and takes the bought ones along its walls until they are full, the bedroom's slot the rest.
 */
export function bookcasesIn(bought: number): { living: number; bedroom: number } {
  livingSlots ??= slotCount(livingShelvingOptions());
  const living = Math.min(livingSlots, 1 + bought);
  return { living, bedroom: Math.max(0, 1 + bought - living) };
}

/**
 * A shelving's `onBookcase` making each of its bookcases a movable piece of `zone` (keyed by slot, `bookcase:0`...:
 * a rebuild puts the new one where the player moved the old), or nothing without the flat's furnishings.
 */
export function movableBookcases(zone: Zone, furnishings: Furnishings | undefined): Pick<ShelvingOptions, 'onBookcase'> {
  if (!furnishings) return {};
  return {
    onBookcase: (shelf, index) => {
      furnishings.register(zone, shelf, { key: `bookcase:${index}`, name: 'Bookcase', keepsRoom: true });
      return () => furnishings.unregister(shelf);
    },
  };
}
