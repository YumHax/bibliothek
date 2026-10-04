import * as THREE from 'three';
import { isInteractable } from '@/interaction/Interactable';
import type { Finding } from './finding';
import { labelOf, pathOf } from './naming';

/** The highest point the player can click: eye height 1.7 m and an arm up. */
const REACH = 2.2;

/**
 * Every clickable thing in a room subject (`built`: the catalogue's group of placed items) whose hitboxes all hang
 * above `REACH`: the plan put it where no one can click it.
 */
export function lintReach(built: THREE.Object3D): Finding[] {
  built.updateWorldMatrix(true, true);
  const findings: Finding[] = [];
  const box = new THREE.Box3();
  const hit = new THREE.Box3();
  built.traverse((obj) => {
    if (!isInteractable(obj) || obj.hitboxes.length === 0) return;
    box.makeEmpty();
    for (const hitbox of obj.hitboxes) box.union(hit.setFromObject(hitbox));
    if (box.isEmpty() || box.min.y <= REACH) return;
    findings.push({ check: 'reach', key: keyOf(obj, built), detail: `its lowest clickable point is ${box.min.y.toFixed(2)} m up` });
  });
  return findings;
}

/** The plan's label of the placed item holding `obj`, then the path down to it when it is a part of that item. */
function keyOf(obj: THREE.Object3D, built: THREE.Object3D): string {
  let item: THREE.Object3D = obj;
  while (item.parent && item.parent !== built) item = item.parent;
  const label = labelOf(item, built);
  return item === obj ? label : `${label} > ${pathOf(obj, item)}`;
}
