import * as THREE from 'three';
import { Prop, part, matte } from './Prop';

export interface FuseBoxOptions {
  /** Outer size. Default 0.36 x 0.26. */
  width?: number;
  height?: number;
  /** Breakers in the row. Default 9. */
  breakers?: number;
}

const DEPTH = 0.085;
const CASE = matte(0xeceae4, 0.5);
const RAIL = matte(0x9a9c9e, 0.4);
const SMOKED = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false });
const BREAKER = matte(0xf6f5f1, 0.6);
const LEVER = matte(0x2b2b2d, 0.5);
const MAIN = matte(0xc0392b, 0.5);

/**
 * The flat's consumer unit: a white plastic box with a smoked hinged cover over one DIN rail of
 * breakers (the main switch in red at the left), a hand-written label strip under them, a cable
 * conduit up to the ceiling. Wall-hung: origin at the centre of the box on the wall, +z into the
 * room. Decoration: never collides.
 */
export class FuseBox extends Prop {
  constructor(options: FuseBoxOptions = {}) {
    super();
    this.name = 'FuseBox';
    const width = options.width ?? 0.36;
    const height = options.height ?? 0.26;
    const count = options.breakers ?? 9;

    part(this, width, height, DEPTH, CASE, { z: DEPTH / 2 });
    // The rail and its breakers, sunk a little behind the cover.
    part(this, width - 0.05, 0.035, 0.01, RAIL, { y: 0.01, z: DEPTH - 0.012 });
    const pitch = (width - 0.07) / count;
    for (let i = 0; i < count; i++) {
      const x = -width / 2 + 0.035 + pitch * (i + 0.5);
      part(this, pitch * 0.86, 0.08, 0.02, BREAKER, { x, y: 0.01, z: DEPTH - 0.004 });
      part(this, pitch * 0.4, 0.018, 0.012, i === 0 ? MAIN : LEVER, { x, y: 0.02, z: DEPTH + 0.008 });
    }
    // The label strip, the cover over it all, and the conduit carrying the cables up.
    part(this, width - 0.06, 0.02, 0.002, matte(0xf1e6c8, 0.8), { y: -0.055, z: DEPTH + 0.001 });
    part(this, width - 0.03, height - 0.06, 0.004, SMOKED, { y: 0, z: DEPTH + 0.02 });
    part(this, 0.04, 0.3, 0.03, CASE, { x: width * 0.3, y: height / 2 + 0.15, z: 0.015 });
    this.traverse((o) => (o.castShadow = false));
  }
}
