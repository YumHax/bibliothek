import type * as THREE from 'three';
import type { HomeUpgrade, HomeUpgrades } from '@/economy/HomeUpgrades';
import type { Zone } from '../zone/Zone';
import type { Sky } from '../Sky';
import type { Room } from '../Room';
import type { RoomWindow } from '../props/Window';

/** Anything lit by the time of day: a `Room`, a frosted pane. */
export interface DaylightFollower {
  setDaylight(daylight: number, skyHue?: THREE.Color): void;
}

/** `target` follows the sky's daylight and hue for as long as the zone is loaded. */
export function followDaylight(zone: Zone, sky: Sky, target: DaylightFollower): void {
  zone.onUnload(sky.dayNight.onChange((state) => target.setDaylight(state.daylight, state.ambient)));
}

/** Runs `apply` now and whenever something is bought for the flat, until the zone unloads. */
export function followUpgrades(zone: Zone, upgrades: HomeUpgrades, apply: () => void): void {
  apply();
  zone.onUnload(upgrades.subscribe(apply));
}

/**
 * Shows `shown` only once upgrade `id` has been bought (and `instead`, when given, until then), following
 * the purchases live: the home goods that stand in the flat from the start, hidden until bought. The
 * mirror of `showWhenOwned` for the arcade's prizes.
 */
export function showWhenUpgraded(zone: Zone, upgrades: HomeUpgrades, id: HomeUpgrade, shown: THREE.Object3D, instead?: THREE.Object3D): void {
  followUpgrades(zone, upgrades, () => {
    const bought = upgrades.count(id) > 0;
    shown.visible = bought;
    if (instead) instead.visible = !bought;
  });
}

/**
 * The room's skylight following how open the curtains (or blinds) of `windows` are, on average: the
 * windows' `onCurtainsChange`. `windows` may still be filling when this is made.
 */
export function curtainsToSkylight(room: Room, windows: readonly RoomWindow[]): () => void {
  return () => room.setSkylight(windows.reduce((sum, w) => sum + w.curtainOpenness, 0) / windows.length);
}
