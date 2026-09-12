import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { boxMesh, type MeshPosition } from '../meshUtils';

/**
 * Base class for decoration. Props go through `Zone.place()` like any furniture so they are
 * ticked when Updatable and made clickable when Interactable, but they must never block the
 * player: the footprint is an *empty* Box3. `Box3.applyMatrix4` leaves an empty box empty and
 * `Box3.intersectsSphere` clamps against [+∞, -∞], giving an infinite distance, so the collider
 * registered by `place()` can never be hit.
 */
export class Prop extends THREE.Group implements Furniture {
  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }
}

/** `boxMesh` added straight to `parent`; the workhorse of every procedural prop. */
export function part(parent: THREE.Object3D, width: number, height: number, depth: number, material: THREE.Material, position: MeshPosition = {}): THREE.Mesh {
  const mesh = boxMesh(width, height, depth, material, position);
  parent.add(mesh);
  return mesh;
}

/** Matte material shared by props; `roughness` defaults to a plastic-like 0.6. */
export function matte(color: THREE.ColorRepresentation, roughness = 0.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

/** Frees the geometries and materials of `root` and its descendants (textures included). */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Partial<THREE.Mesh>;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of materials) {
      const textured = m as THREE.MeshStandardMaterial;
      textured.map?.dispose();
      textured.emissiveMap?.dispose();
      m.dispose();
    }
  });
}
