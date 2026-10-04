import * as THREE from 'three';
import { part } from './Prop';
import type { MeshPosition } from '../meshUtils';
import { layMesh, type SurfaceLayer } from '../surface/layers';

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

/** A length grown to stand `PROUD` out on each side (`sides` of them). */
export function proud(length: number, sides = 2): number {
  return length + sides * PROUD;
}

/** The world-free top of a part made by `part` / `boxMesh` (its local y + half its height), in its parent's space. */
function topOf(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return mesh.position.y + geometry.boundingBox!.max.y * mesh.scale.y;
}

/** The front (+z) face of a part made by `part` / `boxMesh` (its local z + half its depth), in its parent's space. */
function frontOf(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return mesh.position.z + geometry.boundingBox!.max.z * mesh.scale.z;
}

/**
 * A flat `face` (a board's printed or lit face, a screen) laid on the front of `backing` (both children
 * of one parent): `layer`'s lift out from it, with the layer's offset (`surface/layers`). Never a hand-set z.
 */
export function faceOn<T extends THREE.Mesh>(face: T, backing: THREE.Mesh, layer: SurfaceLayer): T {
  face.position.z = frontOf(backing) + layer.lift;
  return layMesh(face, layer);
}

/** A box part's own size (its geometry's bounds times its scale): what `bandAround` grows. */
function sizeOf(mesh: THREE.Mesh): THREE.Vector3 {
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(mesh.scale);
}

/**
 * A band `height` tall round `body` (an unrotated box part, both children of `parent`), its middle at `y`:
 * `PROUD` out of all four sides, so its faces never lie in the body's. A strap round a carton, a sash on a
 * throw, a label round a crate.
 */
export function bandAround(parent: THREE.Object3D, body: THREE.Mesh, y: number, height: number, material: THREE.Material): THREE.Mesh {
  const size = sizeOf(body);
  return part(parent, proud(size.x), height, proud(size.z), material, { x: body.position.x, y, z: body.position.z });
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
