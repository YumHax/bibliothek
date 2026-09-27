import type { Prize } from '@/economy/Prizes';
import { prizeModel } from '@/world/prizes/prizeModel';
import { studio, type ShotView } from './ThumbnailStudio';

/** Kinds better seen from the front (a flat poster roll, a pennant) or from higher up (the cat's feather wand lies flat). */
const VIEWS: Partial<Record<Prize['kind'], ShotView>> = {
  poster: { yaw: 0.9, pitch: 0.45 },
  pennant: { yaw: 0.2, pitch: 0.12 },
  catToy: { yaw: 0.6, pitch: 0.75 },
  keyring: { yaw: 0.45, pitch: 0.4 },
};

/** A studio photo of `prize`'s own model (the one on the prize shelf at home), as an image URL. */
export function prizePhoto(prize: Prize): Promise<string> {
  return studio.shoot(`prize:${prize.kind}:${prize.color.toString(16)}`, () => prizeModel(prize.kind, prize.color), VIEWS[prize.kind]);
}
