import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { disposeTree, isShared } from '../materials/sharedResources';
import type { Finding } from './finding';
import { describeResource, type Resource } from './naming';
import { resourcesOf } from './sharing';

interface Disposable {
  dispose(): void;
}

interface DisposalReport {
  findings: Finding[];
  /** What the item's own `dispose()` threw, headless (it needed the running game); the tree was freed all the same. */
  error: unknown;
}

/**
 * Frees `item` the way its zone does on unload (its own `dispose()`, then `disposeTree`) with three's dispose methods
 * watched: a palette or cached resource freed here is freed under every other user (the first zone to unload would
 * break the others' materials); a resource of the item's own left alive is a leak.
 */
export function lintDisposal(item: THREE.Object3D): DisposalReport {
  const own = resourcesOf(item);
  const disposed = new Set<object>();
  const prototypes: Disposable[] = [THREE.Material.prototype, THREE.BufferGeometry.prototype, THREE.Texture.prototype];
  const originals = prototypes.map((p) => p.dispose);
  prototypes.forEach((p, i) => {
    p.dispose = function (this: object) {
      disposed.add(this);
      originals[i]!.call(this);
    };
  });
  let error: unknown = null;
  try {
    try {
      (item as Partial<Furniture>).dispose?.();
    } catch (e) {
      error = e;
    }
    disposeTree(item);
  } finally {
    prototypes.forEach((p, i) => {
      p.dispose = originals[i]!;
    });
  }
  const findings: Finding[] = [];
  for (const resource of disposed) {
    if (isShared(resource)) findings.push({ check: 'shared disposed', key: describeResource(resource as Resource), detail: 'freed on unload while every other zone still uses it' });
  }
  for (const resource of own) {
    if (isShared(resource) || disposed.has(resource)) continue;
    if (resource instanceof THREE.Texture && resource.isRenderTargetTexture) continue;
    findings.push({ check: 'leak', key: describeResource(resource), detail: 'neither dispose() nor disposeTree freed it' });
  }
  return { findings, error };
}
