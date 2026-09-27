import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merges the parts of a static item (see `freezeStatic` in `Zone`) that share a material into one
 * mesh per material: a plant of forty leaves in two greens draws twice, not forty times. Only
 * opaque, visible, single-material meshes with the same shadow flags, layers, render order and
 * attributes merge; the rest stay as they are. The item itself keeps its transform and its place
 * in the zone (hiding it, or `Zone.setDrawn`, hides the merged meshes like the parts). A class
 * whose parts must stay separate sets `userData.keepParts`.
 */
export function mergeStaticParts(item: THREE.Object3D): void {
  if (item.userData.keepParts) return;
  item.updateMatrixWorld(true);
  const toItem = new THREE.Matrix4().copy(item.matrixWorld).invert();
  const groups = new Map<string, THREE.Mesh[]>();
  const relative = new THREE.Matrix4();
  item.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mergeable(mesh, item)) return;
    relative.multiplyMatrices(toItem, mesh.matrixWorld);
    // A mirrored part would come out inside out (the merge keeps the winding).
    if (relative.determinant() < 0) return;
    // A patched shader may read object-space positions (the wood grain runs along each board's own x): only a
    // part merely moved, not turned or scaled, keeps its look.
    if (isPatched(mesh.material as THREE.Material) && !translationOnly(relative)) return;
    const key = keyOf(mesh);
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(mesh);
  });
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const first = meshes[0]!;
    const indexed = meshes.every((m) => m.geometry.index !== null);
    const parts = meshes.map((m) => {
      const g = indexed ? m.geometry.clone() : m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.clearGroups();
      return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toItem, m.matrixWorld));
    });
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const merged = new THREE.Mesh(geometry, first.material);
    merged.name = `merged:${meshes.length}`;
    merged.castShadow = first.castShadow;
    merged.receiveShadow = first.receiveShadow;
    merged.layers.mask = first.layers.mask;
    merged.renderOrder = first.renderOrder;
    merged.matrixAutoUpdate = false;
    merged.updateMatrix();
    for (const mesh of meshes) mesh.removeFromParent();
    item.add(merged);
  }
  // Groups left empty by the merge.
  const empty: THREE.Object3D[] = [];
  item.traverse((obj) => {
    if (obj !== item && obj.children.length === 0 && !(obj as THREE.Mesh).isMesh && obj.type === 'Group') empty.push(obj);
  });
  for (const obj of empty) obj.removeFromParent();
}

function mergeable(mesh: THREE.Mesh, item: THREE.Object3D): boolean {
  if (!mesh.isMesh || mesh === (item as THREE.Mesh)) return false;
  const special = mesh as THREE.Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean; isBatchedMesh?: boolean; isReflector?: boolean };
  if (special.isInstancedMesh || special.isSkinnedMesh || special.isBatchedMesh || special.isReflector) return false;
  if (Array.isArray(mesh.material) || mesh.geometry.morphAttributes.position) return false;
  const material = mesh.material;
  if (material.transparent || !material.visible || mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
  for (let o: THREE.Object3D | null = mesh; o && o !== item; o = o.parent) if (!o.visible || o.userData.keepParts) return false;
  return true;
}

function isPatched(material: THREE.Material): boolean {
  return Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile');
}

const scratchPosition = new THREE.Vector3();
const scratchRotation = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();

function translationOnly(matrix: THREE.Matrix4): boolean {
  matrix.decompose(scratchPosition, scratchRotation, scratchScale);
  return Math.abs(Math.abs(scratchRotation.w) - 1) < 1e-6 && Math.abs(scratchScale.x - 1) < 1e-6 && Math.abs(scratchScale.y - 1) < 1e-6 && Math.abs(scratchScale.z - 1) < 1e-6;
}

function keyOf(mesh: THREE.Mesh): string {
  const attributes = Object.keys(mesh.geometry.attributes)
    .sort()
    .map((name) => `${name}:${mesh.geometry.getAttribute(name).itemSize}`)
    .join(',');
  const material = mesh.material as THREE.Material;
  return `${material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.layers.mask}|${mesh.renderOrder}|${attributes}`;
}
