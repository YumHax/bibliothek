import type * as THREE from 'three';
import type { Zone } from '../zone/Zone';

/*
 * What another feature puts in the courtyard when it is built (the treasure hunt's carving in the
 * chestnut): it registers a builder here, once, at boot; `furnishCourtyard` calls every one with the
 * zone and the yard's named spots (`COURTYARD_PLAN.huntSpots`, zone-local here). A leaf module, as the
 * cellars' (`cellar/huntHook`), so registering does not pull the courtyard's chunk in.
 */

/** The yard's spots, zone-local: where and which way (yaw) something of another feature goes. */
export interface CourtyardSpots {
  chestnut: { at: THREE.Vector3; yaw: number };
}

/** Builds something into the courtyard's zone at its spots; anything it subscribes to goes through `zone.onUnload`. */
export type CourtyardDresser = (zone: Zone, spots: CourtyardSpots) => void;

const dressers = new Set<CourtyardDresser>();

/** Registers `dress` to run each time the courtyard is built; returns the unregister. */
export function dressCourtyard(dress: CourtyardDresser): () => void {
  dressers.add(dress);
  return () => dressers.delete(dress);
}

/** Every registered dresser, for the builder. */
export function courtyardDressers(): readonly CourtyardDresser[] {
  return [...dressers];
}
