import * as THREE from 'three';
import { part } from './Prop';
import type { MeshPosition } from '../meshUtils';

/*
 * How the parts of a prop meet, so no two of them ever share a face (two faces in one plane
 * z-fight: the grain, the colour or the shading of each flickers through the other). Three ways,
 * pick one per joint and never "flush":
 * - buried: one part runs `INSET` into the other (a rail into a leg, a back into the sides);
 * - proud:  one part stands `PROUD` out of the other (a top over its carcass, a rim over a body);
 * - apart:  they stop `SEAM` short of each other (two drawer fronts side by side).
 * `bibliothek.zfight()` (`?debug`) lists the joints that got it wrong.
 */

/** A gap between two parts side by side (m): invisible, and held apart in depth to about 30 m. */
export const SEAM = 0.0005;
/** How far a part runs into the one it meets (m). */
export const INSET = 0.001;
/** How far a part stands out of the one under or behind it (m): a top over its carcass, a cap over a post. */
export const PROUD = 0.002;

/** A length shortened to stop `INSET` inside what it meets at each end (`ends` of them). */
export function inset(length: number, ends = 2): number {
  return length - ends * INSET;
}

/** A length grown to stand `PROUD` out on each side (`sides` of them). */
export function proud(length: number, sides = 2): number {
  return length + sides * PROUD;
}

/** The world-free top of a part made by `part` / `boxMesh` (its local y + half its height), in its parent's space. */
export function topOf(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return mesh.position.y + geometry.boundingBox!.max.y * mesh.scale.y;
}

/**
 * A `width` x `height` x `depth` part set on top of `below` (both children of `parent`), `SEAM`
 * above it so their faces never meet: a lid on a box, a cushion on a seat, a book on a shelf.
 */
export function partOn(
  parent: THREE.Object3D,
  below: THREE.Mesh,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  position: Omit<MeshPosition, 'y'> = {},
): THREE.Mesh {
  return part(parent, width, height, depth, material, { ...position, y: topOf(below) + SEAM + height / 2 });
}
