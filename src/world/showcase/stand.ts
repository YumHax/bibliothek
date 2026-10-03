import * as THREE from 'three';
import type { BoxDimensions } from '@/catalog/types';
import type { Furniture } from '../Furniture';

/** Air between a leaning box's top edge and the support behind it (m). */
const LEAN_GAP = 0.003;

/**
 * One place on a display for one box: `holder` is its frame (the box's `home`, its rest pose local to it), its origin
 * on the slot's floor at the support's face, +z out towards the viewer. A box leans back `lean` radians: against a
 * wall behind it (`support: 'wall'`, a vertical face at z 0: the taller the box, the further out its foot), or on an
 * easel's plate leaning with it (`'plate'`: its foot on the plate's foot line, at the origin).
 */
export interface StandSlot {
  readonly holder: THREE.Object3D;
  /** The widest and tallest box it takes (m). */
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly lean: number;
  readonly support: 'wall' | 'plate';
}

/**
 * A piece of furniture that shows boxes face out, one per slot (`DisplayColumn`, `Pedestal`): the player puts any box
 * of the collection in it (`Showcases`), and friends come to look.
 */
export interface ShowcaseStand extends Furniture {
  readonly slots: readonly StandSlot[];
  /** What the captions and the friends call it ("the display case"). */
  readonly standName: string;
  /** Where a friend stands to look at it: a floor point in its own frame, in front of it. */
  readonly viewpoint: THREE.Vector3;
}

/** Where a box of `dims` rests in `slot` (local to its holder): leaning back on its support, its bottom-back edge the pivot. */
export function restInSlot(slot: StandSlot, dims: BoxDimensions, position: THREE.Vector3, quaternion: THREE.Quaternion): void {
  const { height, depth } = dims;
  const turn = new THREE.Euler(-slot.lean, 0, 0);
  quaternion.setFromEuler(turn);
  // Against a wall the tipped-back top just clears it; on a plate the back face lies on the plate.
  const pivotZ = slot.support === 'wall' ? height * Math.sin(slot.lean) + LEAN_GAP : 0.001;
  position.set(0, height / 2, depth / 2).applyQuaternion(quaternion);
  position.z += pivotZ;
  position.y += 0.001;
}

/** Whether a box of `dims` goes in `slot`. */
export function fitsSlot(slot: StandSlot, dims: BoxDimensions): boolean {
  return dims.width <= slot.maxWidth + 1e-6 && dims.height <= slot.maxHeight + 1e-6;
}
