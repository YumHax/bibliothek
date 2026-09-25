import type * as THREE from 'three';
import type { Furniture } from '../Furniture';

/** Where one copy goes on a stall (stall-local): leaning on something behind it, or lying face up. */
export interface DisplaySlot {
  position: THREE.Vector3;
  /** `lean`: tipped back against a support (nearly upright on a riser); `flat`: face up. */
  pose: 'lean' | 'flat';
  /** A lying box is never quite square to the table edge. */
  yaw: number;
  /** For a leaning box: how far it tips back (radians); the default lean when absent. */
  angle?: number;
}

/**
 * Anything a stallholder sells from: a trestle table, a glass case, a blanket on the floor, a
 * set of risers. The market's builder asks it where the day's copies go (`layout`) and where the
 * stallholder stands (`vendorAt`); it never knows what is on sale. Local +z faces the aisle.
 */
export interface StallLike extends Furniture {
  /** Where `count` boxes `boxWidth` wide go, stall-local, never more than `capacityFor(boxWidth)`; the first slot is the showpiece's. */
  layout(boxWidth: number, count: number): DisplaySlot[];
  /** Boxes `boxWidth` wide it shows at most. */
  capacityFor(boxWidth: number): number;
  /** A spot for something small to stand on (the radio, the demo telly), stall-local; `x` along the stall. */
  crateTop(x: number): THREE.Vector3;
  /** Where the stallholder stands (or sits), stall-local floor point. */
  readonly vendorAt: [x: number, z: number];
  /** True when its copies sit behind glass: the stallholder must hand them over (see the reputation rules). */
  readonly behindGlass?: boolean;
  /** Top of a riser or pole the stall's wishlist pennant hangs from, stall-local; none when absent. */
  readonly pennantAt?: THREE.Vector3;
}

/** The kinds of stall a spot in `MARKET_PLAN.stalls` can hold. */
export type StallStyle = 'table' | 'glass' | 'blanket' | 'risers';
