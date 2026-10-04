import type { Zone } from '../zone/Zone';
import type { CELLAR_PLAN } from './cellarPlan';

/*
 * What another feature puts in the cellars when they are built (the treasure hunt's chalk clue on the wall,
 * something in our box): it registers a builder here, once, at boot; `furnishCellar` calls every one with the zone
 * and the cellar's named spots (`CELLAR_PLAN.huntSpots`, zone-local). A leaf module, so registering does not pull the
 * cellar's chunk in.
 */

type CellarSpots = (typeof CELLAR_PLAN)['huntSpots'];

/** Builds something into the cellars' zone at its spots; anything it subscribes to goes through `zone.onUnload`. */
type CellarDresser = (zone: Zone, spots: CellarSpots) => void;

const dressers = new Set<CellarDresser>();

/** Registers `dress` to run each time the cellars are built; returns the unregister. */
export function dressCellar(dress: CellarDresser): () => void {
  dressers.add(dress);
  return () => dressers.delete(dress);
}

/** Every registered dresser, for the builder. */
export function cellarDressers(): readonly CellarDresser[] {
  return [...dressers];
}
