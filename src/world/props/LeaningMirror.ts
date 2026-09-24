import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { part } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';
import { mirrorGlass } from './MirrorGlass';

export interface LeaningMirrorOptions {
  /** Outer size of the frame. Default 0.5 x 1.6. */
  width?: number;
  height?: number;
  /** Frame colour. Default dark walnut. */
  frameColor?: number;
  /** Lean back against the wall, radians. Default ~8 degrees. */
  lean?: number;
}

const FRAME = 0.035;
const FRAME_DEPTH = 0.03;
const GLASS = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, roughness: 0.08, metalness: 0.2 });

/**
 * A full-length mirror standing on the floor, leaning back against a wall: its foot a little way
 * out, its top edge on the wall. Wall-hung with `y: 0`: origin on the floor at the wall, +z into
 * the room. Collides over the wedge it takes up. The glass reflects through `mirrorGlass` (a true reflection on high quality).
 */
export class LeaningMirror extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: LeaningMirrorOptions = {}) {
    super();
    this.name = 'LeaningMirror';
    const width = options.width ?? 0.5;
    const height = options.height ?? 1.6;
    const lean = options.lean ?? 0.14;
    const wood = woodMaterial(options.frameColor ?? 0x3c2f24, 0.5);

    // The frame is built upright with its back at local z = 0, then tipped about its bottom back edge:
    // the top moves towards the wall, so the foot must start off the wall by what the top travels.
    const tilt = new THREE.Group();
    tilt.position.z = Math.sin(lean) * height + FRAME_DEPTH;
    tilt.rotation.x = -lean;
    part(tilt, width, FRAME, FRAME_DEPTH, wood, { y: FRAME / 2, z: FRAME_DEPTH / 2 });
    part(tilt, width, FRAME, FRAME_DEPTH, wood, { y: height - FRAME / 2, z: FRAME_DEPTH / 2 });
    for (const sx of [-1, 1]) part(tilt, FRAME, height - 2 * FRAME, FRAME_DEPTH, wood, { x: (sx * (width - FRAME)) / 2, y: height / 2, z: FRAME_DEPTH / 2 });
    const glass = part(tilt, width - 2 * FRAME, height - 2 * FRAME, 0.006, GLASS, { y: height / 2, z: FRAME_DEPTH - 0.004 });
    glass.castShadow = false;
    const silver = mirrorGlass(width - 2 * FRAME, height - 2 * FRAME);
    silver.position.set(0, height / 2, FRAME_DEPTH - 0.0005);
    tilt.add(silver);
    this.add(tilt);

    const depth = Math.sin(lean) * height + FRAME_DEPTH + 0.01;
    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2, 0, 0), new THREE.Vector3(width / 2, height, depth));
  }
}
