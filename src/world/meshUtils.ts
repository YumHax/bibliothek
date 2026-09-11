import * as THREE from 'three';

export interface MeshPosition {
  x?: number;
  y?: number;
  z?: number;
}

/** A shadow-casting, shadow-receiving box at `position` (its centre). */
export function boxMesh(width: number, height: number, depth: number, material: THREE.Material, position: MeshPosition = {}): THREE.Mesh {
  return shadowed(new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material), position);
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
