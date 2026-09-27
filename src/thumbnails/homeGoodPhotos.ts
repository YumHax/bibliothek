import type { HomeUpgrade } from '@/economy/homeGoods';
import { studio, type ShotView } from './ThumbnailStudio';

/** Flat things are seen from above, wall things face on; the rest from the default three-quarter view. */
const FLOOR: ShotView = { yaw: 0.35, pitch: 0.95, fill: 0.95 };
const WALL: ShotView = { yaw: 0.28, pitch: 0.08, fill: 0.92 };
const VIEWS: Partial<Record<HomeUpgrade, ShotView>> = {
  rug: FLOOR,
  livingRug: FLOOR,
  bedroomRug: FLOOR,
  kitchenRug: FLOOR,
  bathMat: FLOOR,
  framedPrint: WALL,
  poster: WALL,
  mirror: { yaw: 0.45, pitch: 0.12 },
  bed: { yaw: 0.7, pitch: 0.45 },
  kitchenTable: { yaw: 0.6, pitch: 0.5 },
  floorCushions: { yaw: 0.5, pitch: 0.5 },
  catToy: { yaw: 0.5, pitch: 0.55 },
};

/** A studio photo of `id` as the flat will have it, as an image URL; rejects when there is no model of it. */
export async function homeGoodPhoto(id: HomeUpgrade): Promise<string> {
  // The models come with the shops' chunk, fetched the first time a shop's panel wants them.
  const { buildModel } = await import('./homeGoodModels');
  return studio.shoot(`home:${id}`, () => buildModel(id), VIEWS[id]);
}
