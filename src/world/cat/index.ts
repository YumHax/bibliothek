import * as THREE from 'three';
import type { World } from '../World';
import type { Seat } from '../Seat';
import type { Television } from '../Television';
import type { RoomWindow } from '../props/Window';
import { CatVoice } from '@/audio/CatVoice';
import { Cat } from './Cat';
import { CatModel } from './CatModel';
import { FoodBowl } from './FoodBowl';
import { WaterBowl } from './WaterBowl';
import { CatBed } from './CatBed';
import { Scratcher } from './Scratcher';
import { CatToy } from './CatToy';
import type { CatSettingsStore } from './catSettings';
import type { CatClock, CatPlayerView } from './types';

export { Cat } from './Cat';
export { CatModel } from './CatModel';
export { FoodBowl } from './FoodBowl';
export { WaterBowl } from './WaterBowl';
export { CatBed } from './CatBed';
export { Scratcher } from './Scratcher';
export { CatToy } from './CatToy';
export { CatSettingsStore, CAT_STORAGE_KEY } from './catSettings';
export * from './types';

export interface CatFurnishOptions {
  /** Name and coat; the cat follows later changes. */
  settings: CatSettingsStore;
  player: CatPlayerView;
  clock: CatClock;
  seats: Seat[];
  windows: RoomWindow[];
  tv: Television;
}

/**
 * Moves the cat in: its corner at the back of the shelf-free left third (bowls on a mat between the
 * fig and the front door, its bed round the corner under the left wall's back window), a scratching
 * post by the front wall, a ball on the rug, and the cat itself asleep in its bed. Everything goes through `world.place()`; call it after the rest of the
 * furniture so the cat's occupancy grid sees the room as it stands.
 */
export function furnishCat(world: World, options: CatFurnishOptions): Cat {
  const { width, depth } = world.room.options;
  const back = -depth / 2;
  const front = depth / 2;
  const left = -width / 2;

  // The corner: food and water side by side on one mat between the fig and the door; the bed round
  // the corner against the left wall, in the back window's sun.
  const bowl = world.place(new FoodBowl({ mat: true }), new THREE.Vector3(left + 0.78, 0, back + 0.45));
  const water = world.place(new WaterBowl(), new THREE.Vector3(left + 0.93, 0, back + 0.45));
  const bed = world.place(new CatBed(), new THREE.Vector3(left + 0.45, 0, back + 1.15));
  // Scratching post against the front wall, the cat works it from the room side.
  const scratcher = world.place(new Scratcher(), new THREE.Vector3(left + 1.4, 0, front - 0.45), Math.PI);
  // A ball left on the rug in front of the TV.
  const toy = world.place(
    new CatToy({ bounds: world.room.bounds, collisions: world.collisions }),
    new THREE.Vector3(left + 1.3, 0, 0.8),
  );

  const { tv } = options;
  const tvFacing = tv.getWorldDirection(new THREE.Vector3());
  const watchingSpot = tv.position.clone().setY(0).addScaledVector(tvFacing, 0.75);
  watchingSpot.z += 0.3; // off the chair's line of sight

  const body = new CatModel(options.settings.settings.coat);
  const cat = new Cat(body, {
    settings: options.settings.settings,
    collisions: world.collisions,
    bounds: world.room.bounds,
    player: options.player,
    clock: options.clock,
    seats: options.seats,
    bowl,
    water,
    bed,
    scratcher,
    toy,
    windows: options.windows,
    tv: {
      isPlaying: () => tv.state === 'playing',
      watchingSpot: (out) => out.copy(watchingSpot),
      screenPoint: (out) => tv.getWorldPosition(out).setY(0.9),
    },
    voice: new CatVoice(),
  });
  options.settings.subscribe((s) => cat.applySettings(s));

  const start = bed.restingSpot(new THREE.Vector3()).setY(0);
  world.place(cat, start, Math.PI / 2);
  return cat;
}
