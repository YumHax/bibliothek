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
  /**
   * Where it belongs now, when that changed while it was in hand (its shelf rebuilt, the player putting it on
   * another one): the Inspector brings it back there, `restPosition` being in that object's space. Absent or
   * null: where it was taken from.
   */
  readonly home?: THREE.Object3D | null;
  /** How far out of its row it must slide (m, along its front) before it can fly to the hand clear of the board above. */
  readonly slideOut: number;
  /** Set by the Inspector while it carries the object: called when the object is disposed under it (its shelf rebuilt). */
  onDisposed: (() => void) | null;
  readonly isOpen: boolean;
  /** 0 shut .. 1 open: the hand shifts as it opens so what it shows stays in view. */
  readonly openness: number;
  /** How far the hand moves (camera metres, x right, y up) once it is fully open; absent: right by half its width (a book-like spread). */
  readonly openShift?: { readonly x: number; readonly y: number };
  readonly dimensions: { readonly width: number };
  setHovered(hovered: boolean): void;
  /** In hand: the openable version (back, cartridge, manual); out of it, the resting one. */
  setInHand(inHand: boolean): void;
  snapClosed(): void;
  toggleOpen(): void;
  close(): void;
  tick(dt: number): void;
}
