import type { BuildContext } from '../buildContext';
import { placerFor } from '../build/owned';
import { ROOM_PLAN } from '../roomPlan';
import type { Zone } from '../zone/Zone';
import { DisplayColumn } from './DisplayColumn';
import { Pedestal } from './Pedestal';
import type { ShowcaseStand } from './stand';

/**
 * The collection room's displays (`ROOM_PLAN.showcase`): the display case by the door and the pedestal, staged till
 * bought (`placerFor`), then movable about the room (never out of it: their boxes are the room's) and filled with the
 * games the player put in them (`Showcases`). Nothing without the flat's displays and box pool (a build without them).
 */
export function furnishShowcases(zone: Zone, ctx: BuildContext): void {
  const { collection: { showcases, boxes }, home: { upgrades, furnishings } } = ctx;
  if (!showcases || !boxes) return;
  const plan = ROOM_PLAN.showcase;
  const stands: [string, ShowcaseStand, typeof plan.displayCase][] = [
    ['displayCase', new DisplayColumn(), plan.displayCase],
    ['pedestal', new Pedestal(), plan.pedestal],
  ];
  for (const [key, stand, { at, upgrade }] of stands) {
    const placer = placerFor(zone, upgrades, upgrade);
    placer.placeAt(stand, at);
    furnishings?.register(zone, stand, { key, at, owned: upgrade, keepsRoom: true });
    zone.onUnload(showcases.register(zone, key, stand, boxes, () => placer.owned));
    placer.onOwned(() => showcases.refresh());
  }
}
