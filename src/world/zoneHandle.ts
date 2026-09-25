import type * as THREE from 'three';
import { surfaceOfRoom, type FootSurface } from '@/audio/footSurface';
import type { Zone } from './zone/Zone';
import type { ZoneHandle } from './buildContext';
import { WORLD_PLAN } from './worldPlan';

/*
 * What any zone's handle says, for code that only knows "the zone the player is in" (the
 * `ZoneManager`'s current zone): every builder returns at least a `ZoneHandle`. A zone known by id
 * is read typed through `World.handle(id)` instead.
 */

/** The handle zone `zone`'s builder returned; null until it is built. */
export function handleOf(zone: Zone): ZoneHandle | null {
  return zone.handle as ZoneHandle | null;
}

/** How lit the zone is, 0 dark .. 1 full day: its handle's `lightLevel`, else its room's, else full (reflections and haze follow it). */
export function lightLevelOf(zone: Zone): number {
  const handle = handleOf(zone);
  return handle?.lightLevel?.() ?? handle?.room?.lightLevel ?? 1;
}

/** What is underfoot at `at` (world) in `zone`: the zone's to say (the street), else its room's floor finish. */
export function surfaceUnderfoot(zone: Zone, at: THREE.Vector3): FootSurface {
  const own = handleOf(zone)?.surfaceAt?.(zone.toLocal(at.clone()));
  if (own) return own;
  const plan = WORLD_PLAN.zones.find((p) => p.id === zone.id);
  return plan?.kind === 'balcony' ? 'stone' : surfaceOfRoom(plan?.extent ?? {});
}
