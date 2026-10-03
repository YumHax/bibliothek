import type { Furnishings } from '@/furnishing/Furnishings';
import type { Zone } from '../zone/Zone';
import type { ShelvingOptions } from '../shelving/Shelving';
import { slotCount } from '../shelving/Shelving';
import { ROOM_PLAN } from '../roomPlan';
import { annexJoined } from '@/building/rouxMove';
import { ANNEX_PLAN } from '../annex/annexPlan';

/** The collection room's shelving, as `layout.ts` builds it (bar the overflow list): the run along the back and right walls. */
export function livingShelvingOptions(): Omit<ShelvingOptions, 'overflow'> {
  const plan = ROOM_PLAN;
  const pictureHalf = plan.projectorPicture.width / 2 + plan.projectorPicture.margin;
  return { room: plan.room, ...plan.shelving, rightWallKeepClear: { minZ: -pictureHalf, maxZ: pictureHalf } };
}

let livingSlots: number | null = null;

/**
 * Where the bookcases stand, with `bought` of them bought (`HomeUpgrades` 'bookcase'): the collection room has one from
 * the start and takes the bought ones along its walls until they are full, the bedroom's slot the next, and once Mrs
 * Roux's two rooms are the flat's (`joined`: the wall knocked through) the annex's run the rest. The opening takes the
 * collection room's last slot (the right wall's front one): its bookcase goes to the annex then.
 */
export function bookcasesIn(bought: number, joined: boolean = annexJoined()): { living: number; bedroom: number; annex: number } {
  livingSlots ??= slotCount(livingShelvingOptions());
  const total = 1 + bought;
  const living = Math.min(joined ? livingSlots - 1 : livingSlots, total);
  const bedroom = Math.min(1, total - living);
  const annex = joined ? Math.min(ANNEX_PLAN.shelving.slots.length, total - living - bedroom) : 0;
  return { living, bedroom, annex };
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
