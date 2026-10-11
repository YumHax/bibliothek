import * as THREE from 'three';
import type { BuildContext } from '../buildContext';
import type { Zone } from '../zone/Zone';
import { placeWith } from '../zone/attach';
import { Cushion } from '../props/Cushion';
import { ROOM_PLAN } from '../roomPlan';
import { FelixShelf } from './FelixShelf';
import { KeepsakeProp } from './KeepsakeProp';
import { keepsakeLine, type KeepsakeId } from '@/grandma/keepsakeLines';
import { catalogueCard } from '@/grandma/catalogueCard';
import { lotsHome } from '@/economy/felixLots';

/**
 * WHAT MÉMÉ GAVE, AT HOME (docs/grandma.md "What the memories leave behind"): each keepsake given (`Keepsakes`) comes
 * into the collection room the moment it is given (the flat's zones never unload): Félix's shelf goes up on the front
 * wall with the first small one, each standing on it in its spot (`ROOM_PLAN.keepsakes`), riding it; his cushion lies
 * on the TV rug. The shelf and the cushion are the flat's furniture (right-click: moved, put away). A keepsake with
 * something to read opens its card on a click; the catalogue's is written from the collection (his lots ticked).
 */
export function placeKeepsakes(zone: Zone, ctx: Pick<BuildContext, 'keepsakes' | 'notices' | 'collection' | 'home'>): void {
  const keepsakes = ctx.keepsakes;
  if (!keepsakes) return;
  const plan = ROOM_PLAN.keepsakes;
  const furnishings = ctx.home.furnishings;
  const placed = new Set<KeepsakeId>();
  let shelf: FelixShelf | null = null;

  const shelfUp = (): FelixShelf => {
    if (shelf) return shelf;
    shelf = zone.placeAt(new FelixShelf(plan.shelf), plan.shelf.at);
    furnishings?.register(zone, shelf, { key: 'felixShelf', at: plan.shelf.at, name: 'Félix’s shelf' });
    return shelf;
  };

  const put = (id: KeepsakeId): void => {
    if (placed.has(id)) return;
    placed.add(id);
    const line = keepsakeLine(id);
    if (id === 'cushion') {
      const cushion = zone.placeAt(new Cushion(plan.cushion.look), plan.cushion.at);
      furnishings?.register(zone, cushion, { key: 'felixCushion', at: plan.cushion.at, name: line.name });
      return;
    }
    const card = line.card;
    const read = id === 'catalogue' ? () => ctx.notices.read(catalogueCard(lotsHome(ctx.collection.games.games))) : card ? () => ctx.notices.read(card) : null;
    const [x, board, z, yaw] = plan.spots[id];
    const item = new KeepsakeProp(id, line.name, read);
    item.rotation.y = yaw;
    placeWith(zone, shelfUp(), item, new THREE.Vector3(x, board * plan.shelf.spacing, z));
  };

  const refresh = (): void => {
    for (const id of keepsakes.given) put(id);
  };
  refresh();
  zone.onUnload(keepsakes.subscribe(refresh));
}
