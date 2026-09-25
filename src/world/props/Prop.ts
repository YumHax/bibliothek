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

/** Materials, textures and geometries that outlive any one zone (module-level caches): `disposeTree` leaves them alone. */
const sharedResources = new WeakSet<object>();

/**
 * Marks a material, texture or geometry as shared across zones (a module-level material, a cached
 * canvas): `disposeTree` never frees it, so a zone unloading does not make every other user
 * re-upload or recompile it. A shared material keeps its textures too. Returns `resource`.
 */
export function markShared<T extends THREE.Material | THREE.Texture | THREE.BufferGeometry>(resource: T): T {
  sharedResources.add(resource);
  return resource;
}

export function isShared(resource: object): boolean {
  return sharedResources.has(resource);
}

/**
 * Frees the GPU side of `root` and its descendants: geometries, materials, every texture a
 * material holds (its maps and its `ShaderMaterial` uniforms), and what three's own objects keep
 * (an `InstancedMesh`'s buffers, a light's shadow map, a `Reflector`'s render target). Skips what
 * is `markShared`, and whole objects flagged `userData.sharedResources` (the contact shadows, which
 * outlive the zone). Render-target textures are left to their target's owner.
 */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj.userData.sharedResources) return;
    const mesh = obj as Partial<THREE.Mesh>;
    if (mesh.geometry && !sharedResources.has(mesh.geometry)) mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of materials) disposeMaterial(m);
    if (ownsGpuResources(obj)) obj.dispose();
  });
}

function disposeMaterial(material: THREE.Material): void {
  if (sharedResources.has(material)) return;
  for (const value of Object.values(material)) disposeTexture(value);
  const uniforms = (material as Partial<THREE.ShaderMaterial>).uniforms;
  if (uniforms) for (const uniform of Object.values(uniforms)) {
    const value: unknown = uniform?.value;
    if (Array.isArray(value)) value.forEach(disposeTexture);
    else disposeTexture(value);
  }
  material.dispose();
}

function disposeTexture(value: unknown): void {
  if (value instanceof THREE.Texture && !value.isRenderTargetTexture && !sharedResources.has(value)) value.dispose();
}

/**
 * three.js objects whose `dispose()` frees GPU memory of their own. Only these: a placed piece of
 * furniture's `dispose()` releases subscriptions and is called by its zone, once.
 */
function ownsGpuResources(obj: THREE.Object3D): obj is THREE.Object3D & { dispose(): void } {
  const o = obj as THREE.Object3D & { isInstancedMesh?: boolean; isBatchedMesh?: boolean; isLight?: boolean; isReflector?: boolean; dispose?: unknown };
  return typeof o.dispose === 'function' && !!(o.isInstancedMesh || o.isBatchedMesh || o.isLight || o.isReflector);
}
