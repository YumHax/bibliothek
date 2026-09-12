import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { part, matte } from './Prop';

export interface BedOptions {
  /** Width of the frame across the room (a double is 1.6). */
  width?: number;
  /** Length from the headboard to the foot (2.0 for a standard double). */
  length?: number;
  /** Colour of the duvet cover. */
  duvet?: number;
  /** Colour of the throw folded across the foot. */
  throw?: number;
  /** Which side the slippers are kicked off on, seen from the foot facing the headboard. */
  slippers?: 'left' | 'right' | 'none';
}

/** Frame: legs, a low platform and the headboard. */
const LEG = 0.1;
const PLATFORM = 0.22;
const HEADBOARD_H = 1.0;
const HEADBOARD_T = 0.05;
/** Mattress inset inside the frame on each side, and its thickness. */
const MATTRESS_INSET = 0.04;
const MATTRESS_H = 0.2;
/** How far from the headboard the duvet is turned back (the sheet and pillows show above it). */
const DUVET_FOLD = 0.7;
const DUVET_H = 0.11;
const PILLOW_W = 0.62;
const PILLOW_D = 0.42;
const PILLOW_H = 0.13;

const OAK = matte(0x9c7a52, 0.55);
const SLATS = matte(0x7d6141, 0.7);
const TICKING = matte(0xf2eee6, 0.9);
const LINEN = matte(0xfaf7f0, 0.95);
const FELT = matte(0x5a4a3e, 1);

/**
 * A double bed with its head against a wall: oak platform frame on short legs, a plain
 * headboard, a mattress with the sheet showing, a duvet turned back below two pillows leaning
 * on the headboard, a throw folded across the foot and a pair of slippers kicked off beside it.
 * Wall-hung with `y: 0`: origin on the floor at the middle of the headboard, +z down the bed
 * into the room. Collides over the whole frame (mattress height).
 */
export class Bed extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: BedOptions = {}) {
    super();
    this.name = 'Bed';
    const width = options.width ?? 1.6;
    const length = options.length ?? 2.0;
    const duvet = matte(options.duvet ?? 0x6c7f93, 0.95);
    const throwCloth = matte(options.throw ?? 0xc48a4a, 0.95);
    const slippers = options.slippers ?? 'left';

    // Frame: a platform on four stubby legs, the headboard standing on the floor against the wall.
    const platformY = LEG + PLATFORM / 2;
    part(this, width, PLATFORM, length, OAK, { y: platformY, z: length / 2 });
    for (const dx of [-width / 2 + 0.06, width / 2 - 0.06])
      for (const dz of [0.06, length - 0.06]) part(this, 0.07, LEG, 0.07, SLATS, { x: dx, y: LEG / 2, z: dz });
    part(this, width + 0.06, HEADBOARD_H, HEADBOARD_T, OAK, { y: HEADBOARD_H / 2, z: HEADBOARD_T / 2 });

    // Mattress, with the fitted sheet reading as its top; the frame's ledge shows all round.
    const mattressY = LEG + PLATFORM;
    const mw = width - 2 * MATTRESS_INSET;
    const ml = length - MATTRESS_INSET - HEADBOARD_T;
    const mattress = part(this, mw, MATTRESS_H, ml, TICKING, { y: mattressY + MATTRESS_H / 2, z: HEADBOARD_T + ml / 2 });
    mattress.receiveShadow = true;
    const top = mattressY + MATTRESS_H;
    part(this, mw, 0.012, ml, LINEN, { y: top + 0.006, z: HEADBOARD_T + ml / 2 }).castShadow = false;

    // The duvet: a soft slab from the fold to the foot, hanging a little over the sides, its
    // turned-back edge a thicker roll.
    const duvetFrom = DUVET_FOLD;
    const duvetLen = length - duvetFrom + 0.05;
    part(this, mw + 0.12, DUVET_H, duvetLen, duvet, { y: top + DUVET_H / 2, z: duvetFrom + duvetLen / 2 });
    part(this, mw + 0.12, DUVET_H + 0.05, 0.22, duvet, { y: top + (DUVET_H + 0.05) / 2, z: duvetFrom + 0.11 });
    // Its sides drape past the mattress edge down the frame.
    for (const dx of [-(mw + 0.12) / 2 + 0.015, (mw + 0.12) / 2 - 0.015]) part(this, 0.03, 0.14, duvetLen, duvet, { x: dx, y: top - 0.04, z: duvetFrom + duvetLen / 2 });

    // Two pillows leaning against the headboard, one plumper than the other.
    for (const [dx, tilt, squash] of [
      [-width / 4, 0.32, 1],
      [width / 4, 0.42, 0.85],
    ] as const) {
      const pillow = part(this, PILLOW_W, PILLOW_H * squash, PILLOW_D, LINEN, { x: dx, y: top + 0.12, z: HEADBOARD_T + 0.2 });
      pillow.rotation.x = -tilt;
    }

    // A throw folded in three across the foot, and the slippers on the floor by the side.
    part(this, mw * 0.8, 0.045, 0.4, throwCloth, { y: top + DUVET_H + 0.022, z: length - 0.3 });
    part(this, mw * 0.8, 0.02, 0.36, throwCloth, { y: top + DUVET_H + 0.055, z: length - 0.29 }).castShadow = false;
    if (slippers !== 'none') {
      const side = slippers === 'left' ? -1 : 1;
      const x = side * (width / 2 + 0.16);
      for (const [dz, yaw] of [
        [0, 0.1],
        [0.14, -0.25],
      ] as const) {
        const slipper = part(this, 0.1, 0.035, 0.27, FELT, { x, y: 0.018, z: length * 0.55 + dz });
        slipper.rotation.y = side * yaw;
        slipper.castShadow = false;
      }
    }

    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2 - 0.03, 0, 0), new THREE.Vector3(width / 2 + 0.03, top + DUVET_H, length + 0.03));
  }
}
