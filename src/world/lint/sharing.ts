import * as THREE from 'three';
import { isShared } from '../materials/sharedResources';
import type { Finding } from './finding';
import { describeResource, type Resource } from './naming';

/**
 * Every geometry, material and texture reachable from `root` the way `disposeTree` reaches them (a material's maps
 * and a ShaderMaterial's uniform textures included; whole objects flagged `userData.sharedResources` left out).
 */
export function resourcesOf(root: THREE.Object3D): Set<Resource> {
  const found = new Set<Resource>();
  root.traverse((obj) => {
    if (obj.userData.sharedResources) return;
    const mesh = obj as Partial<THREE.Mesh>;
    if (mesh.geometry) found.add(mesh.geometry);
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      found.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) found.add(value);
      const uniforms = (material as Partial<THREE.ShaderMaterial>).uniforms;
      if (!uniforms) continue;
      for (const uniform of Object.values(uniforms)) {
        const value: unknown = uniform?.value;
        for (const texture of Array.isArray(value) ? value : [value]) if (texture instanceof THREE.Texture) found.add(texture);
      }
    }
  });
  return found;
}

interface SharedFinding extends Finding {
  /** The subject whose build first held the resource: the finding is filed under it, whatever later build met it again. */
  subject: string;
}

/**
 * Which build first held each resource. A resource two builds hold (the same prop built twice, two kinds drawing on
 * one module-level geometry or texture) outlives any one zone, so it must be `markShared`: `disposeTree` frees
 * whatever is not marked, and the first zone to unload would free it under everyone else.
 */
export class SharingLedger {
  private readonly firstHolder = new Map<Resource, string>();
  private readonly reported = new Set<Resource>();

  /** Notes `root`'s resources as held by `build` (a subject's name); returns a finding per resource another build held before, not marked shared. */
  note(root: THREE.Object3D, build: string): SharedFinding[] {
    const findings: SharedFinding[] = [];
    for (const resource of resourcesOf(root)) {
      const first = this.firstHolder.get(resource);
      if (first === undefined) {
        this.firstHolder.set(resource, build);
        continue;
      }
      if (first === build || isShared(resource) || this.reported.has(resource)) continue;
      this.reported.add(resource);
      findings.push({ check: 'unshared cache', key: describeResource(resource), detail: `held by ${first} and ${build}: freed under the other when one unloads`, subject: first });
    }
    return findings;
  }
}
