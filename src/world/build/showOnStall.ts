import type * as THREE from 'three';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { StockItem } from '@/economy/StockItem';
import { widestCaseOf } from '@/catalog/media';
import type { Furniture } from '../Furniture';
import { ForSaleBox, type ForSaleBoxOptions } from '../market/ForSaleBox';
import type { StallLike } from '../market/stallTypes';

/** The zone the copies are placed in (they must be placed to be clickable). */
interface StallHost {
  place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F;
  remove(item: Furniture): void;
  toLocal(point: THREE.Vector3): THREE.Vector3;
}

interface ShowOptions {
  host: StallHost;
  covers: BoxArtLoader;
  /** Each copy's box options but its pose (the stall's slot gives it): the wallet, where it is sold, who thanks. */
  boxOptions(item: StockItem): Omit<ForSaleBoxOptions, 'pose'>;
  /** A copy bought (or taken, when free): its box is gone from the stall. */
  sold?(item: StockItem): void;
}

/** The copies on show on a stall, and how to clear them off it. */
interface StallShow {
  readonly boxes: ReadonlySet<ForSaleBox>;
  /** Takes every copy still on show off the stall (the stall packed up). */
  clear(): void;
}

/**
 * Lays `items` on `stall` where its `layout()` puts them (the widest case among their platforms sets the pitch; what
 * does not fit stays off), each a `ForSaleBox` placed in the zone (as the market's floor does, `market/MarketFloor`):
 * bought, its box leaves the stall; handed back at once, a fresh box of the same copy goes back where it stood.
 * For a stall outside the market (a Fair day's pavement stall on Front Street, a shop across town).
 */
export function showOnStall(stall: StallLike, items: readonly StockItem[], options: ShowOptions): StallShow {
  const { host, covers } = options;
  const boxes = new Set<ForSaleBox>();
  let live = true;
  const width = Math.max(0.05, ...items.map((item) => widestCaseOf(item.game.platform).width));
  const slots = stall.layout(width, Math.min(items.length, stall.capacityFor(width)));
  stall.updateMatrixWorld(true);
  const show = (item: StockItem, i: number): void => {
    const slot = slots[i]!;
    const box = new ForSaleBox(item, covers, { ...options.boxOptions(item), pose: slot.pose === 'flat' ? { kind: 'flat' } : { kind: 'lean', angle: slot.angle }, behindGlass: stall.behindGlass });
    box.onSold = () => {
      boxes.delete(box);
      host.remove(box);
      box.dispose();
      options.sold?.(item);
    };
    box.restock = () => {
      if (live) show(item, i);
    };
    boxes.add(box);
    host.place(box, host.toLocal(stall.localToWorld(slot.position.clone())), stall.rotation.y + slot.yaw);
  };
  slots.forEach((_, i) => show(items[i]!, i));
  return {
    boxes,
    clear: () => {
      live = false;
      for (const box of boxes) {
        host.remove(box);
        box.dispose();
      }
      boxes.clear();
    },
  };
}
