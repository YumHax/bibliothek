import * as THREE from 'three';
import { surfaceOfRoom, type FootSurface } from '@/audio/footSurface';
import type { Zone } from '../zone/Zone';
import { Rug } from '../props/Rug';
import { KilimRug } from '../props/KilimRug';
import { WORLD_PLAN } from '../worldPlan';

const local = new THREE.Vector3();

/**
 * A room's `ZoneHandle.surfaceAt`: soft underfoot over any rug laid in it (a pile `Rug` or a
 * `KilimRug`, standing: a rug not bought yet is staged, hidden, and not walked on), else the room's
 * floor finish. The rugs are looked up on each step (a room holds a few), so one bought later counts.
 */
export function rugsUnderfoot(zone: Zone): (at: THREE.Vector3) => FootSurface {
  const plan = WORLD_PLAN.zones.find((p) => p.id === zone.id);
  const floor = surfaceOfRoom(plan?.extent ?? {});
  return (at) => {
    for (const item of zone.group.children) {
      if (!(item instanceof Rug || item instanceof KilimRug) || !item.visible) continue;
      // Into the rug's own frame (the zone's group is its parent): its footprint is centred there, length along x.
      local.copy(at).sub(item.position).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -item.rotation.y);
      if (Math.abs(local.x) <= item.size.x / 2 && Math.abs(local.z) <= item.size.y / 2) return 'carpet';
    }
    return floor;
  };
}
