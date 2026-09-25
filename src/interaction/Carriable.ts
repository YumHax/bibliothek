import type * as THREE from 'three';

/**
 * What the `Inspector` carries: an object it takes off its parent into the hand, turns, opens and
 * puts back where it rests (a `GameBox`). Only what the Inspector uses, so the interaction layer
 * does not depend on the world's box class.
 */
export interface Carriable extends THREE.Object3D {
  /** Where it rests in its parent's space: the Inspector brings it back there. */
  readonly restPosition: THREE.Vector3;
  readonly restQuaternion: THREE.Quaternion;
  readonly isOpen: boolean;
  /** 0 shut .. 1 open: the hand shifts right as it opens so the spread stays in view. */
  readonly openness: number;
  readonly dimensions: { readonly width: number };
  setHovered(hovered: boolean): void;
  /** In hand: the openable version (back, cartridge, manual); out of it, the resting one. */
  setInHand(inHand: boolean): void;
  snapClosed(): void;
  toggleOpen(): void;
  close(): void;
  tick(dt: number): void;
}
