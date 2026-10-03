import type * as THREE from 'three';
import type { HomeUpgrade } from '@/economy/homeGoods';
import { displayPiece } from '@/world/shop/displayPieces';
import { Shelf } from '@/world/Shelf';
import { KilimRug } from '@/world/props/KilimRug';
import { LavaLamp } from '@/world/props/LavaLamp';
import { PictureFrame } from '@/world/props/PictureFrame';
import { recordCrateModel } from '@/world/vinyl/RecordCrate';
import { homeArcadeModel } from '@/world/homeArcade/homeArcadeModel';

/**
 * The flea market's household stall keeps its own display (`market/HomeGoodsDisplay`: a flat-pack box, a rolled rug),
 * so its four pieces are modelled as the flat shows them once bought; everything the Front Street shops sell is their
 * display piece (`world/shop/displayPieces`).
 */
const STALL: Partial<Record<HomeUpgrade, () => THREE.Object3D>> = {
  bookcase: () => new Shelf({ width: 0.8, depth: 0.3, rowHeights: [0.2, 0.2, 0.2, 0.2, 0.2] }),
  rug: () => new KilimRug(),
  lamp: () => new LavaLamp(),
  poster: () => new PictureFrame({ motif: 'abstract', seed: 14, width: 0.42, height: 0.58, frameColor: 0x151515 }),
  record: () => recordCrateModel(),
  // Not on the TV repair shop's floor (yet): its till's card shows the cabinet as the flat will have it.
  homeArcade: () => homeArcadeModel(),
};

/** A fresh model of `id` for the thumbnail studio; throws when there is none. */
export function buildModel(id: HomeUpgrade): THREE.Object3D {
  const model = STALL[id]?.() ?? displayPiece(id);
  if (!model) throw new Error(`no model of ${id}`);
  return model;
}
