import type * as THREE from 'three';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { GameSource } from '@/collection/GameSource';
import type { ModalLike } from '@/game/SessionParts';
import type { Milestones } from '@/economy/Milestones';
import type { CollectorWatch } from '@/economy/CollectorWatch';
import { plaqueTier } from '@/economy/milestoneList';
import type { Zone } from '../zone/Zone';
import type { Placement } from '../Placement';
import { ROOM_PLAN } from '../roomPlan';
import { CollectorsBook } from './CollectorsBook';
import { BrassPlaque } from './BrassPlaque';
import { HomeVitrine, VITRINE_CAPACITY } from './HomeVitrine';

/** The collector's book's services, as the collection room shows them (`BuildContext.collector`, assembled in `main.ts`). */
export interface CollectorHome {
  /** The book's panel, opened by the binder. */
  book: ModalLike;
  milestones: Milestones;
  watch: CollectorWatch;
}

export interface CollectorCornerOptions {
  covers: BoxArtLoader;
  /** The sideboard the plaque stands on: it rides it when the player moves it. */
  sideboard?: THREE.Object3D;
  /** What stands on the shelves at home: only those go in the display cabinet (not the parcel's, not the lent ones). */
  shelved: GameSource;
}

/**
 * The collector's binder (it opens the book): on the sideboard when there is one, else on the floor where it will
 * stand; `moveToSideboard` puts it up there once the sideboard is bought. Up there it rides `sideboard` (moved by the player).
 */
export function placeCollectorsBook(zone: Zone, home: CollectorHome, onSideboard: boolean, sideboard?: THREE.Object3D): { moveToSideboard(): void } {
  const plan = ROOM_PLAN.collector;
  const book = new CollectorsBook({ panel: home.book, unclaimed: () => home.milestones.unclaimed });
  const put = (spot: { at: Placement; yaw: number }): void => {
    zone.placeAt(book, spot.at);
    book.rotation.y += spot.yaw;
    if (spot === plan.book && sideboard) zone.ride(sideboard, book);
  };
  put(onSideboard ? plan.book : plan.bookOnFloor);
  let up = onSideboard;
  return {
    moveToSideboard: () => {
      if (up) return;
      up = true;
      zone.remove(book);
      put(plan.book);
    },
  };
}

/**
 * Places what the collector's book brings into the collection room, from `ROOM_PLAN.collector` (the binder is
 * `placeCollectorsBook`'s): the brass plaque on the sideboard once 25 games are reached
 * (engraved again at 50, 100, 250), and the glass display cabinet against the front wall once 50
 * are, holding the most valuable copies on the shelves. The cabinet is only placed once earned (no
 * light, so placing it later costs no recompile), so it never stands invisible in the way.
 */
export function furnishCollectorCorner(zone: Zone, home: CollectorHome, options: CollectorCornerOptions): void {
  const plan = ROOM_PLAN.collector;
  const { milestones, watch } = home;

  const plaque = zone.placeAt(new BrassPlaque(), plan.plaque);
  if (options.sideboard) zone.ride(options.sideboard, plaque);
  let engraved = -1;
  const engrave = (): void => {
    const tier = milestones.hasHome('plaque') ? plaqueTier((id) => milestones.has(id)) : 0;
    if (tier === engraved) return;
    engraved = tier;
    plaque.engrave(tier, formatDay(milestones.reachedOn('games-25') ?? ''));
  };

  let vitrine: HomeVitrine | null = null;
  const fill = (): void => {
    if (!vitrine && milestones.hasHome('vitrine')) vitrine = zone.placeAt(new HomeVitrine({ covers: options.covers }), plan.vitrine);
    vitrine?.show(watch.showpieces(VITRINE_CAPACITY, options.shelved.games.filter((g) => g.status !== 'lent')));
  };

  const follow = (): void => {
    engrave();
    fill();
  };
  follow();
  zone.onUnload(milestones.subscribe(follow));
  zone.onUnload(watch.subscribe(fill));
  zone.onUnload(options.shelved.subscribe(fill));
}

/** "25 Sep 2026" from a `dayKey` (empty stays empty). */
function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
