import type * as THREE from 'three';
import type { MemorySet } from '@/memories/memoryReel';
import { presentPeople } from './presentPeople';

/** The player's cat and its things (by their names): Félix never had one, so they are of today. */
const THE_CAT = new Set(['Cat', 'CatBed', 'CatToy', 'CatFly', 'FoodBowl', 'WaterBowl', 'Scratcher']);

/**
 * Félix's flat for a memory filmed in it (the collection room, `living`): the dream of it as the opening shows it
 * (every piece shown, every bookcase full, `set.dream()`), the player's cat and its things put aside, and whoever is
 * round today (a friend visiting) kept out of the picture. `hold` is called every frame from the scene's `beat`,
 * `release` from its `strike`. The cat is taken off the camera's layers rather than hidden: its outing shows and hides
 * it by `visible` (a cat back from the window mid-film would walk into 1998), and nothing of it touches its layers.
 */
export function stageFelixFlat(set: MemorySet): { hold(): void; release(): void } {
  set.dream();
  const cat: THREE.Object3D[] = [];
  set.zone.group.traverse((obj) => {
    if (THE_CAT.has(obj.name)) cat.push(obj);
  });
  /** Every part of the cat taken off the layers, and the layers it had. */
  const unseen = new Map<THREE.Object3D, number>();
  const holdCat = (): void => {
    for (const root of cat) {
      root.traverse((obj) => {
        if (!unseen.has(obj)) unseen.set(obj, obj.layers.mask);
        obj.layers.disableAll();
      });
    }
  };
  holdCat();
  const today = presentPeople(set.zone);
  return {
    hold: () => {
      holdCat();
      today.hold();
    },
    release: () => {
      for (const [obj, mask] of unseen) obj.layers.mask = mask;
      unseen.clear();
      today.release();
    },
  };
}
