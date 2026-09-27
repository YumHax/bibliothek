import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { Zone } from '../zone/Zone';
import { Prop } from '../props/Prop';

/**
 * Keeps `item` (already placed, where it belongs) in `zone` only while `shown()` says so, following
 * `subscribe` (released on unload): out of the zone it is neither drawn, nor clickable, nor in the
 * way of a click. For things without a light that come and go (the kit on the kitchen table, a cake):
 * one with a light must stay placed from the start (a light added mid-game recompiles every shader).
 */
export function presentWhile(zone: Zone, item: Furniture, shown: () => boolean, subscribe: (cb: () => void) => () => void): void {
  const position = item.position.clone();
  const yaw = item.rotation.y;
  let placed = true;
  const apply = (): void => {
    const want = shown();
    if (want === placed) return;
    placed = want;
    if (want) zone.place(item, position.clone(), yaw);
    else zone.remove(item);
  };
  apply();
  zone.onUnload(subscribe(apply));
}

/** Calls `onRise` each time `test()` turns true (checked every frame while the zone is active): a radio switched on. */
export function onRise(zone: Zone, test: () => boolean, onRise: () => void): void {
  zone.place(new RiseWatch(test, onRise), new THREE.Vector3());
}

class RiseWatch extends Prop implements Updatable {
  private was: boolean;

  constructor(private readonly test: () => boolean, private readonly rise: () => void) {
    super();
    this.name = 'RiseWatch';
    this.was = test();
  }

  update(): void {
    const now = this.test();
    if (now && !this.was) this.rise();
    this.was = now;
  }
}
