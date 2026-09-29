import * as THREE from 'three';
import type { HomeUpgrade, HomeUpgrades } from '@/economy/HomeUpgrades';
import type { Furniture } from '../Furniture';
import type { Placement } from '../Placement';
import type { Zone } from '../zone/Zone';
import { resolvePlacement } from '../Placement';
import { setShownKeepingLights } from '../lighting/keepLights';

/**
 * What a plan entry needs bought before it stands in the flat: a piece of `HOME_GOODS` (`'sideboard'`), the `nth` of
 * one that stands in several spots (`{ good: 'armchair', nth: 1 }`: the second armchair; counted from 0), or all of a
 * list (`['lamp', 'sideTable']`: the lava lamp, on the side table it stands on).
 */
export type Owned = HomeUpgrade | { good: HomeUpgrade; nth: number } | readonly Owned[];

/** Whether `owned` is bought (always true without a store: a build with no purchases shows everything). */
export function isOwned(upgrades: HomeUpgrades | undefined, owned: Owned | undefined): boolean {
  if (!owned || !upgrades) return true;
  if (typeof owned === 'string') return upgrades.has(owned);
  if (isList(owned)) return owned.every((o) => isOwned(upgrades, o));
  return upgrades.has(owned.good, owned.nth);
}

function isList(owned: Owned): owned is readonly Owned[] {
  return Array.isArray(owned);
}

/** `Zone`'s placing calls, for pieces that stand only once bought (`placerFor`). */
export interface Placer {
  /** Bought already. */
  readonly owned: boolean;
  place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F;
  placeAt<F extends Furniture>(item: F, at: Placement): F;
  /** `zone/attach.placeWith`: at `local` in `host`'s frame (host placed or staged by this placer or another). */
  placeWith<F extends Furniture>(host: THREE.Object3D, item: F, local?: THREE.Vector3): F;
  /** `zone/attach.placeLeaves`: every leaf of a host (drawers, doors). */
  placeLeaves(host: THREE.Object3D & { readonly leaves: readonly Furniture[] }): void;
  /** Runs `cb` once the piece is bought: now if it is, or on the purchase (wiring that needs it standing: a seat for the cat). */
  onOwned(cb: () => void): void;
}

interface Staged {
  item: Furniture;
  position: THREE.Vector3;
  rotationY: number;
}

/**
 * Places what `owned` needs bought: straight into the zone when it is (or when nothing is needed), else *staged*: hung in
 * the zone's group where it will stand, hidden with its lights kept dark (`setShownKeepingLights`), neither colliding,
 * ticking nor clickable; on the purchase the meshes and lights come back and it is `zone.place`d where it hung. So the
 * flat's lights (and the texture units their shadow maps take) are the same bought or not, and a purchase never
 * recompiles a shader (see CLAUDE.md "Gotchas": a light added mid-game recompiles every lit program).
 */
export function placerFor(zone: Zone, upgrades: HomeUpgrades | undefined, owned: Owned | undefined): Placer {
  const direct = isOwned(upgrades, owned);
  const staged: Staged[] = [];
  const callbacks: (() => void)[] = [];
  let isBought = direct;

  const put = <F extends Furniture>(item: F, position: THREE.Vector3, rotationY = 0): F => {
    if (isBought) return zone.place(item, position, rotationY);
    item.position.copy(position);
    item.rotation.y = rotationY;
    zone.group.add(item);
    item.updateWorldMatrix(true, true);
    setShownKeepingLights(item, false);
    staged.push({ item, position: position.clone(), rotationY });
    // Not placed, still the zone's: disposed on unload even if never bought.
    zone.keep(item);
    return item;
  };

  const placer: Placer = {
    get owned() {
      return isBought;
    },
    place: put,
    placeAt: (item, at) => {
      const { position, rotationY } = resolvePlacement(zone.spec.extent, at);
      return put(item, position, rotationY);
    },
    placeWith: (host, item, local = item.position) => {
      host.updateWorldMatrix(true, false);
      return put(item, zone.toLocal(host.localToWorld(local.clone())), host.rotation.y + item.rotation.y);
    },
    placeLeaves: (host) => {
      for (const leaf of host.leaves) placer.placeWith(host, leaf);
    },
    onOwned: (cb) => {
      if (isBought) cb();
      else callbacks.push(cb);
    },
  };

  if (!direct && upgrades) {
    const unsubscribe = upgrades.subscribe(() => {
      if (isBought || !isOwned(upgrades, owned)) return;
      isBought = true;
      unsubscribe();
      for (const { item, position, rotationY } of staged.splice(0)) {
        setShownKeepingLights(item, true);
        zone.place(item, position, rotationY);
      }
      for (const cb of callbacks.splice(0)) cb();
    });
    zone.onUnload(unsubscribe);
  }
  return placer;
}
