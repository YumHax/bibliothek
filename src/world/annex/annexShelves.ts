import * as THREE from 'three';
import { GameList } from '@/collection/GameList';
import { BOOKCASE_PRICE } from '@/economy/pricing';
import { annexJoined, onRouxPhase } from '@/building/rouxMove';
import type { Zone } from '../zone/Zone';
import type { BuildContext } from '../buildContext';
import type { RoomOptions } from '../Room';
import { resolvePlacement, type Placement } from '../Placement';
import { Shelving } from '../shelving/Shelving';
import { bookcasesIn, movableBookcases } from '../build/bookcases';
import { labelledBookcases } from '../labels/labelledBookcases';
import { BookcaseKit } from '../bedroom/BookcaseKit';
import { followUpgrades } from '../build/follow';
import { ANNEX_PLAN } from './annexPlan';

/**
 * The games the bedroom's bookcase has no room for, which the new room's bookcases show (its `overflow`), and what those
 * have no room for, the study's. One of each for the flat, as the collection room's `overflow` is (`bootstrap/services`).
 */
export const ANNEX_OVERFLOW = new GameList();
export const STUDY_OVERFLOW = new GameList();

/** How many of the annex's bookcases (`bookcasesIn`'s `annex`) stand in the new room, and how many in the study. */
export function annexSplit(bought: number): { room: number; study: number } {
  const annex = bookcasesIn(bought).annex;
  const room = Math.min(ANNEX_PLAN.shelving.here.length, annex);
  return { room, study: annex - room };
}

interface AnnexShelvingSpec {
  /** Its name in the player's arrangement. */
  id: 'annex' | 'annexStudy';
  room: RoomOptions;
  slots: readonly Placement[];
  width: number;
  /** The games it shows (the bedroom's leftovers, or the new room's), and where its own leftovers go (the study's). */
  source: GameList;
  overflow?: GameList;
  /** How many bookcases stand here with `bought` bookcases bought. */
  count: (bought: number) => number;
}

/**
 * A run of the annex's bookcases: a `Shelving` over the games the rooms before it had no room for, standing as many
 * bookcases as `count` gives (none before the wall is down), each movable like the flat's others; and the kit that
 * buys the next one, leaning at the first empty slot while the next bookcase bought would stand here. No ceiling spots
 * (a light added mid-game would recompile every shader). Null without the flat's purchases.
 */
export function placeAnnexShelving(zone: Zone, ctx: Pick<BuildContext, 'covers' | 'collection' | 'home'>, spec: AnnexShelvingSpec): Shelving | null {
  const { covers, collection: { arrangement, boxes, shelved }, home: { upgrades, furnishings, shelfLabels } } = ctx;
  if (!upgrades) return null;
  const slots = spec.slots.map((at) => {
    const { position, rotationY } = resolvePlacement(spec.room, at);
    return { position, rotationY, facing: new THREE.Vector3(Math.sin(rotationY), 0, Math.cos(rotationY)) };
  });
  const here = (bought = upgrades.count('bookcase')): number => spec.count(bought);
  const shelving = new Shelving(zone, covers, spec.source, {
    id: spec.id,
    ...labelledBookcases(movableBookcases(zone, furnishings), shelfLabels, spec.id),
    ...(arrangement ? { arrangement } : {}),
    ...(boxes ? { pool: boxes } : {}),
    ...(shelved ? { rowsFrom: shelved } : {}),
    ...(spec.overflow ? { overflow: spec.overflow } : {}),
    room: spec.room,
    layout: { slots, width: spec.width },
    capacity: here(),
    minBookcases: here(),
    lamps: false,
  });
  zone.onUnload(() => shelving.dispose());
  // The kit leans at the first empty slot (against the wall, where the bookcase's back will be).
  const kit = zone.placeAt(new BookcaseKit({ price: BOOKCASE_PRICE, onBought: () => upgrades.add('bookcase'), title: 'A bookcase for the rooms next door', for: 'the rest of the flat' }), kitSpot(spec.slots[0]!));
  const refresh = (): void => {
    const standing = here();
    shelving.setCapacity(standing);
    const next = spec.slots[standing];
    const available = annexJoined() && next !== undefined && upgrades.canBuy('bookcase') && here(upgrades.count('bookcase') + 1) > standing;
    if (next) {
      const { position, rotationY } = resolvePlacement(spec.room, kitSpot(next));
      zone.move(kit, position, rotationY);
    }
    kit.setAvailable(available);
  };
  followUpgrades(zone, upgrades, refresh);
  zone.onUnload(onRouxPhase(refresh));
  return shelving;
}

/** A bookcase slot's spot on its wall, without the bookcase's offset: where its kit leans. */
function kitSpot(at: Placement): Placement {
  return 'wall' in at ? { wall: at.wall, along: at.along, y: 0 } : at;
}
