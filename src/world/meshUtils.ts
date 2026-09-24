import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { QUALITY } from '@/graphics/quality';

export interface MeshPosition {
  x?: number;
  y?: number;
  z?: number;
}

/** Edge radius of a bevelled box: a few millimetres, never more than this share of its thinnest side. */
const BEVEL_RADIUS = 0.005;
const BEVEL_SHARE = 0.18;
/** Thinner than this, or longer than that, a box stays sharp (a sheet, a wire, a wall-sized slab). */
const BEVEL_MIN_SIDE = 0.012;
const BEVEL_MAX_SIDE = 3;

/**
 * A shadow-casting, shadow-receiving box at `position` (its centre). With `QUALITY.bevels` its
 * edges are rounded by a few millimetres so they catch a highlight, as real joinery does; the
 * face groups (one material per face) survive the rounding.
 */
export function boxMesh(width: number, height: number, depth: number, material: THREE.Material, position: MeshPosition = {}): THREE.Mesh {
  return shadowed(new THREE.Mesh(boxGeometry(width, height, depth, material), material), position);
}

function boxGeometry(width: number, height: number, depth: number, material: THREE.Material): THREE.BufferGeometry {
  const thinnest = Math.min(width, height, depth);
  const drawn = material.visible && material.colorWrite;
  if (!QUALITY.bevels || !drawn || thinnest < BEVEL_MIN_SIDE || Math.max(width, height, depth) > BEVEL_MAX_SIDE) {
    return new THREE.BoxGeometry(width, height, depth);
  }
  return new RoundedBoxGeometry(width, height, depth, 1, Math.min(BEVEL_RADIUS, thinnest * BEVEL_SHARE));
}

/** A shadow-casting, shadow-receiving upright cylinder at `position` (its centre). `radiusBottom` defaults to `radiusTop`. */
export function cylinderMesh(
  radiusTop: number,
  height: number,
  material: THREE.Material,
  position: MeshPosition = {},
  { radiusBottom = radiusTop, segments = 20 }: { radiusBottom?: number; segments?: number } = {},
): THREE.Mesh {
  return shadowed(new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material), position);
}

/**
 * An invisible box the crosshair ray can hit: the click target of an `Interactable` when its
 * visible parts are too thin or too many to test one by one. Draws nothing, casts no shadow.
 */
export function invisibleHitbox(width: number, height: number, depth: number, position: MeshPosition = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshBasicMaterial({ visible: false }));
  mesh.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  mesh.castShadow = false;
  return mesh;
}

function shadowed(mesh: THREE.Mesh, position: MeshPosition): THREE.Mesh {
  mesh.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
