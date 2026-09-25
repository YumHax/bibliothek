import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { BrowseSpot } from '../people/Shopper';
import type { Furniture } from '../Furniture';

/** A shopper as the rivals see them: where they browse, and the moment they buy. */
export interface RivalShopper {
  readonly browsing: BrowseSpot | null;
  buy(): void;
}

export interface RivalBuyersOptions {
  shoppers: readonly RivalShopper[];
  /** Seconds between two purchases on average, per shopper browsing. */
  meanSeconds: number;
  /** How keen the crowd is right now (1 a normal day; less in the rain, at night). */
  keenness: () => number;
  /** Whether another purchase is still allowed today (the day's cap). */
  mayBuy: () => boolean;
  /** The shopper at `spot` buys something from the stall there; false when nothing could be bought. */
  buyAt: (spot: BrowseSpot) => boolean;
}

/**
 * The other shoppers buy too: while one stands browsing at a stall, now and then (a random wait
 * around `meanSeconds`, longer when the crowd is less keen) they make up their mind and a copy
 * leaves that stall (`buyAt` picks it: never one held for the player). Capped per day, so the
 * stalls are never stripped. Nothing to see of its own, never collides.
 */
export class RivalBuyers extends THREE.Object3D implements Furniture, Updatable {
  readonly contactShadow = false;

  constructor(private readonly options: RivalBuyersOptions) {
    super();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const { shoppers, meanSeconds, keenness, mayBuy, buyAt } = this.options;
    const chance = (dt / meanSeconds) * keenness();
    for (const shopper of shoppers) {
      const spot = shopper.browsing;
      if (!spot || Math.random() >= chance || !mayBuy()) continue;
      if (buyAt(spot)) shopper.buy();
    }
  }
}
