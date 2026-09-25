import { Vector3 } from 'three';
import { WORLD_PLAN } from '../worldPlan';
import type { ZoneId } from '../zoneIds';
import type { TravelStop } from './Travel';

/** What the stops are placed with: each zone's zone-local -> world conversion. */
export interface ZonePlacer {
  zone(id: ZoneId): { toWorld(point: Vector3): Vector3 };
}

/**
 * Every place a travel door can take the player: the zones that declare a `travel` arrival in
 * `WORLD_PLAN`, their arrival spots in world space; the street's per-door spots keyed by the zone left.
 */
export function travelStops(world: ZonePlacer): TravelStop[] {
  return WORLD_PLAN.zones.flatMap((plan) => {
    if (!plan.travel) return [];
    const zone = world.zone(plan.id);
    const [x, z] = plan.travel.arrival;
    // The street sets the player down in front of the door they came out of (keyed by the zone left).
    const from: TravelStop['from'] = Object.fromEntries(Object.entries(plan.travel.arrivals ?? {}).map(([id, { at, yaw }]) => [id, { position: zone.toWorld(new Vector3(at[0], 0, at[1])), yaw }]));
    return [{ id: plan.id, label: plan.travel.label, position: zone.toWorld(new Vector3(x, 0, z)), yaw: plan.travel.yaw, from }];
  });
}
