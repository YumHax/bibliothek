import type { ZoneSpec } from './zone/Zone';
import { DEFAULT_ROOM } from './roomPlan';

/*
 * THE WORLD PLAN: the zones (rooms, corridors, the street one day) and how they connect. Each zone
 * has a `kind`, built by `ZONE_BUILDERS[kind]` in `layout.ts` from its own plan (`ROOM_PLAN` for
 * the collection room). Zone-local coordinates inside a zone; `origin` places the zone in the world.
 * The player only ever has the current zone and its `neighbours` loaded (see `zone/ZoneManager.ts`).
 */

/** What a zone is; one builder per kind in `layout.ts`. */
export type ZoneKind = 'collectionRoom';

export interface ZonePlan extends ZoneSpec {
  kind: ZoneKind;
}

/**
 * World yaw the sun's azimuth is expressed against: the collection room's front wall (+z, rotation π).
 * One value for the whole world so every window agrees on where the sun is.
 */
export const SUN_ROTATION_Y = Math.PI;

export const WORLD_PLAN = {
  start: 'living',
  zones: [
    {
      id: 'living',
      kind: 'collectionRoom',
      origin: [0, 0, 0],
      extent: DEFAULT_ROOM,
      neighbours: [],
      persistent: true,
    },
  ] as ZonePlan[],
};
