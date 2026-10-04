import * as THREE from 'three';

/** Classes that say nothing about what a thing is: left out of a path. */
const PLAIN = new Set(['Mesh', 'Group', 'Object3D', 'InstancedMesh']);

/** A readable path from `root` down to `obj`: names where set, class names otherwise (as `surface/zfight` keys its meshes). */
export function pathOf(obj: THREE.Object3D, root: THREE.Object3D): string {
  const parts: string[] = [];
  for (let o: THREE.Object3D | null = obj; o && o !== root; o = o.parent) {
    if (o.name) parts.push(o.name);
    else if (!PLAIN.has(o.constructor.name)) parts.push(o.constructor.name);
  }
  return parts.reverse().join(' > ') || obj.constructor.name;
}

/** What the plan called a placed item (`userData.lint`, set by the catalogue: `plant#2`), else its path from `root`. */
export function labelOf(item: THREE.Object3D, root: THREE.Object3D): string {
  const label: unknown = item.userData.lint;
  return typeof label === 'string' ? label : pathOf(item, root);
}

/** What `disposeTree` frees and `markShared` protects. */
export type Resource = THREE.Material | THREE.BufferGeometry | THREE.Texture;

/** A resource by what it is, never by its uuid: `MeshStandardMaterial #b9b3a8`, `BoxGeometry 0.12x0.5x0.02 m`, `CanvasTexture 64x64`. */
export function describeResource(resource: Resource): string {
  const name = resource.name ? ` '${resource.name}'` : '';
  if (resource instanceof THREE.BufferGeometry) {
    if (!resource.boundingBox) resource.computeBoundingBox();
    const box = resource.boundingBox;
    const size = box && !box.isEmpty() ? box.getSize(new THREE.Vector3()) : null;
    const dims = size ? ` ${[size.x, size.y, size.z].map((v) => Math.round(v * 1000) / 1000).join('x')} m` : '';
    return `${resource.type}${name}${dims}`;
  }
  if (resource instanceof THREE.Texture) {
    const image = resource.image as { width?: number; height?: number } | undefined;
    const px = image?.width && image.height ? ` ${image.width}x${image.height}` : '';
    return `${resource.constructor.name}${name}${px}`;
  }
  const color = (resource as Partial<THREE.MeshStandardMaterial>).color;
  const hex = color instanceof THREE.Color ? ` #${color.getHexString()}` : '';
  return `${resource.type}${name}${hex}`;
}
