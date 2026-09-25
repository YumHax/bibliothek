import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import type { Zone } from './Zone';

/**
 * Places `item` in `zone` at the pose it holds in `host`'s local space (`local`, or its own
 * `position`, and its `rotation.y`): what belongs to a placed piece of furniture but must be placed
 * furniture itself to be ticked and clickable, like a cupboard's doors or the hum of a fridge.
 * `host` must already stand in `zone`, turned about y only.
 */
export function placeWith<F extends Furniture>(zone: Zone, host: THREE.Object3D, item: F, local: THREE.Vector3 = item.position): F {
  host.updateWorldMatrix(true, false);
  const position = zone.toLocal(host.localToWorld(local.clone()));
  return zone.place(item, position, host.rotation.y + item.rotation.y);
}

/** `placeWith` for every leaf of a host that has some (a fridge, a wardrobe, a row of cupboards). */
export function placeLeaves(zone: Zone, host: THREE.Object3D & { readonly leaves: readonly Furniture[] }): void {
  for (const leaf of host.leaves) placeWith(zone, host, leaf);
}

/** A plan's zone-local floor points `[x, z]` as world points. */
export function floorPointsToWorld(zone: Zone, points: readonly (readonly [number, number])[]): THREE.Vector3[] {
  return points.map(([x, z]) => zone.toWorld(new THREE.Vector3(x, 0, z)));
}
