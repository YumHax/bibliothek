import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import type { Furniture } from '../Furniture';
import { markShared } from '../props/Prop';

/**
 * Height of the blobs over the floor: clear of a rug's top (12 mm, `Rug`; so what stands on one
 * keeps its shadow without the two fighting), below anything's feet.
 */
const LIFT = 0.015;
/** Darkness right under the object. */
const OPACITY = 0.5;
/** The blob reaches this much beyond the object's feet on each side (share of its size, plus a margin in metres). */
const SPREAD = 1.12;
const MARGIN = 0.06;
/** Only the parts of an object this close to the floor say where it touches it (a table's legs, not its top). */
const CONTACT_HEIGHT = 0.15;
/** Flat things (a rug) and huge ones (a whole room) get none. */
const MIN_HEIGHT = 0.06;
const MAX_AREA = 8;
const INITIAL_CAPACITY = 64;

let blobTexture: THREE.CanvasTexture | null = null;
let blobMaterial: THREE.MeshBasicMaterial | null = null;

/** A soft rounded rectangle, dark in the middle, fading out towards the edges (alpha in the green channel). */
function texture(): THREE.CanvasTexture {
  if (blobTexture) return blobTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Distance outside an inner rectangle, in texture units: 0 inside the core, 1 at the edge.
      const dx = Math.max(0, Math.abs((x + 0.5) / size - 0.5) - 0.2) / 0.3;
      const dy = Math.max(0, Math.abs((y + 0.5) / size - 0.5) - 0.2) / 0.3;
      const d = Math.min(1, Math.hypot(dx, dy));
      const alpha = Math.pow(1 - d * d * (3 - 2 * d), 1.6);
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.round(alpha * 255);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  blobTexture = markShared(new THREE.CanvasTexture(canvas));
  blobTexture.colorSpace = THREE.NoColorSpace;
  return blobTexture;
}

/** The one material of every blob: black, alpha from the texture, drawn over the floor without writing depth. */
function material(): THREE.MeshBasicMaterial {
  blobMaterial ??= markShared(new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: texture(),
    transparent: true,
    opacity: OPACITY,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }));
  return blobMaterial;
}

/** A unit square lying flat, facing up. */
const FLAT_SQUARE = markShared(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));

/**
 * A soft dark blob `width` x `depth` to add under something that moves (the cat, a shopper):
 * a child of it at floor level. Null when contact shadows are off.
 */
export function blobShadow(width: number, depth: number, opacity = 1): THREE.Mesh | null {
  if (!QUALITY.contactShadows) return null;
  const mat = opacity === 1 ? material() : material().clone();
  if (opacity !== 1) mat.opacity = OPACITY * opacity;
  const mesh = new THREE.Mesh(FLAT_SQUARE, mat);
  mesh.scale.set(width, 1, depth);
  mesh.position.y = LIFT;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -1;
  mesh.name = 'ContactShadow';
  // Its geometry is shared by every blob; a clone of the material (other opacity) is its own.
  mesh.userData.sharedResources = mat === material();
  if (!mesh.userData.sharedResources) mesh.geometry = FLAT_SQUARE.clone();
  return mesh;
}

/**
 * The contact shadows of a zone's standing furniture: where a chair's legs or a cabinet's plinth
 * meet the floor, the ambient light cannot reach, and a shadow map at room scale is far too
 * coarse to show it. One instanced mesh per zone (one draw call for all), each instance a blob
 * the size of the object's feet (the parts of it within `CONTACT_HEIGHT` of the floor), laid
 * when the object is placed. Anything that moves opts out (`Furniture.contactShadow = false`) and
 * carries its own `blobShadow()`.
 */
export class ContactShadows {
  private instanced: THREE.InstancedMesh;
  private readonly slots = new Map<Furniture, number>();
  private readonly owners: Furniture[] = [];

  private readonly inverse = new THREE.Matrix4();
  private readonly relative = new THREE.Matrix4();
  private readonly box = new THREE.Box3();
  private readonly part = new THREE.Box3();
  private readonly matrix = new THREE.Matrix4();

  constructor(private readonly group: THREE.Object3D) {
    this.instanced = this.createMesh(INITIAL_CAPACITY);
  }

  /** The instanced mesh holding every blob (replaced when it grows). */
  get mesh(): THREE.InstancedMesh {
    return this.instanced;
  }

  /** Lays a blob under `item` (already parented and positioned in the zone) if it stands on the floor. */
  add(item: Furniture): void {
    if (!QUALITY.contactShadows || item.contactShadow === false || this.slots.has(item)) return;
    const feet = this.feet(item);
    if (!feet) return;
    let mesh = this.mesh;
    if (this.owners.length >= mesh.instanceMatrix.count) mesh = this.grow();
    const index = this.owners.length;
    this.owners.push(item);
    this.slots.set(item, index);
    mesh.setMatrixAt(index, feet);
    mesh.count = this.owners.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  remove(item: Furniture): void {
    const index = this.slots.get(item);
    if (index === undefined) return;
    // The last blob moves into the freed slot.
    const lastIndex = this.owners.length - 1;
    const last = this.owners[lastIndex];
    if (index !== lastIndex) {
      this.mesh.getMatrixAt(lastIndex, this.matrix);
      this.mesh.setMatrixAt(index, this.matrix);
      this.owners[index] = last;
      this.slots.set(last, index);
    }
    this.owners.pop();
    this.slots.delete(item);
    this.mesh.count = this.owners.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.owners.length = 0;
    this.slots.clear();
    this.mesh.count = 0;
  }

  /**
   * The blob's matrix in the zone's frame, or null when `item` does not stand on the floor: the
   * item-local box of its visible meshes that come within `CONTACT_HEIGHT` of the floor.
   */
  private feet(item: Furniture): THREE.Matrix4 | null {
    item.updateWorldMatrix(true, true);
    this.inverse.copy(item.matrixWorld).invert();
    const box = this.box.makeEmpty();
    let top = -Infinity;
    item.traverseVisible((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!materials.some((m) => m.visible && m.colorWrite && !m.transparent)) return;
      mesh.geometry.boundingBox ?? mesh.geometry.computeBoundingBox();
      this.relative.multiplyMatrices(this.inverse, mesh.matrixWorld);
      const part = this.part.copy(mesh.geometry.boundingBox!).applyMatrix4(this.relative);
      top = Math.max(top, part.max.y);
      if (part.min.y + item.position.y < CONTACT_HEIGHT) box.union(part);
    });
    if (box.isEmpty() || box.min.y + item.position.y > 0.05 || top - box.min.y < MIN_HEIGHT) return null;
    const width = (box.max.x - box.min.x) * SPREAD + MARGIN;
    const depth = (box.max.z - box.min.z) * SPREAD + MARGIN;
    if (width * depth > MAX_AREA) return null;
    // In the zone's frame: the item's own placement, then the blob centred under its feet on the floor.
    this.matrix.makeScale(width, 1, depth).setPosition((box.min.x + box.max.x) / 2, LIFT - item.position.y, (box.min.z + box.max.z) / 2);
    item.updateMatrix();
    return this.matrix.premultiply(item.matrix);
  }

  private createMesh(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(FLAT_SQUARE, material(), capacity);
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = -1;
    mesh.name = 'ContactShadows';
    mesh.frustumCulled = false;
    mesh.userData.sharedResources = true;
    this.group.add(mesh);
    return mesh;
  }

  /** Doubles the capacity: a new instanced mesh with the blobs so far (the old one leaves the group). */
  private grow(): THREE.InstancedMesh {
    const old = this.mesh;
    const mesh = this.createMesh(old.instanceMatrix.count * 2);
    for (let i = 0; i < this.owners.length; i++) {
      old.getMatrixAt(i, this.matrix);
      mesh.setMatrixAt(i, this.matrix);
    }
    mesh.visible = old.visible;
    this.group.remove(old);
    old.dispose();
    this.instanced = mesh;
    return mesh;
  }
}
