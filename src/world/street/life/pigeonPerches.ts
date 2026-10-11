import * as THREE from 'three';
import { shopDoors } from '@/world/city/facades';
import { frontVariant, PLAIN } from '../shopfronts/shopfrontPlan';
import type { Vec2 } from '../streetPlan';

/*
 * Where the street's pigeons sit by day (`Pigeons` `perches`): along the modern lamps' arms over the road, and on the
 * cornice lip of every plain shopfront built in 3D (`frontVariant` 'plain': the far, painted fronts have no ledge to
 * sit on). Zone-local points, y up, a little over the surface the bird stands on.
 */

/** Along the arm from the pole (m), and over its top. */
const ARM_ALONG = [0.45, 0.95] as const;
const ARM_TOP = 0.07;
/** Out from the wall onto the cornice's lip, and how many birds' places along a front. */
const LIP_OUT = (PLAIN.lipOut + PLAIN.corniceOut) / 2;
const LIP_STEP = 2.4;

/** The ledges: two places on each arm lamp's arm, a few along each plain front's cornice. */
export function pigeonPerches(lamps: readonly { at: Vec2; yaw: number; design?: string }[], lampHeight: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const lamp of lamps) {
    if (lamp.design !== undefined) continue;
    for (const along of ARM_ALONG) out.push(new THREE.Vector3(lamp.at[0] + Math.sin(lamp.yaw) * along, lampHeight + ARM_TOP, lamp.at[1] + Math.cos(lamp.yaw) * along));
  }
  for (const door of shopDoors()) {
    if (frontVariant(door.facade.detail, door.shop.kind) !== 'plain') continue;
    const [ax, az] = door.from;
    const [bx, bz] = door.to;
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 1) continue;
    // Out of the wall towards the street (the face looks along `yaw`).
    const nx = Math.sin(door.yaw) * LIP_OUT;
    const nz = Math.cos(door.yaw) * LIP_OUT;
    for (let s = LIP_STEP / 2; s < length; s += LIP_STEP) {
      const t = s / length;
      out.push(new THREE.Vector3(ax + (bx - ax) * t + nx, PLAIN.lip[1] + 0.01, az + (bz - az) * t + nz));
    }
  }
  return out;
}
