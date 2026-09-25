import * as THREE from 'three';
import { shareShadowCaster, type Zone } from './zone/Zone';
import type { Sky } from './Sky';
import { Room, type Doorway, type RoomOptions } from './Room';
import { resolvePlacement } from './Placement';
import { Door } from './props/Door';

export interface ShellOptions {
  /** Colour of the painted leaves of the doors this zone hangs. Default the `Door`'s slate green. */
  leafColor?: number;
  /**
   * A room with no window on the outside (the arcade): its ambient holds this daylight (0..1)
   * instead of following the sky, so it looks the same at noon and at midnight.
   */
  fixedDaylight?: number;
}

/** Half-depth of a portal box through the wall: covers the gap between the two shells and a step either side. */
const PORTAL_HALF_DEPTH = 0.15;

/**
 * The part every room zone starts with: the `Room` shell at the zone's origin, its base lighting
 * following the sky, a `Door` hung in each doorway this zone owns (`Doorway.door !== false`), its
 * leaf moving its own collider through the zone's scoped set, and a portal registered for each
 * doorway that leads to another zone (`Doorway.to`), so the view is culled through it. Shell and
 * doors go on the shared shadow layer: the walls' casters and the leaves are what keeps one room's
 * light out of the next, whichever room's lamp is rendering. Returns the room so the builder can
 * wire its lamp switch.
 */
export function furnishShell(zone: Zone, sky: Sky, options: RoomOptions, { leafColor, fixedDaylight }: ShellOptions = {}): Room {
  const room = zone.place(new Room(options), new THREE.Vector3());
  shareShadowCaster(room);
  if (fixedDaylight !== undefined) room.setDaylight(fixedDaylight);
  else zone.onUnload(sky.dayNight.onChange((state) => room.setDaylight(state.daylight, state.ambient)));
  for (const doorway of options.doorways ?? []) {
    let door: Door | undefined;
    if (doorway.door !== false) {
      door = zone.placeAt(new Door(doorway, { collisions: zone.collisions, leafColor }), { wall: doorway.wall, along: doorway.along, y: 0 });
      shareShadowCaster(door);
    }
    if (doorway.to) zone.addPortal({ to: doorway.to, bounds: portalBounds(zone, options, doorway), door });
  }
  return room;
}

/** World-space box of a doorway's opening, through the wall. */
function portalBounds(zone: Zone, room: RoomOptions, doorway: Doorway): THREE.Box3 {
  const { position } = resolvePlacement(room, { wall: doorway.wall, along: doorway.along, y: 0 });
  const alongX = doorway.wall === 'front' || doorway.wall === 'back';
  const half = new THREE.Vector3(alongX ? doorway.width / 2 : PORTAL_HALF_DEPTH, 0, alongX ? PORTAL_HALF_DEPTH : doorway.width / 2);
  const min = position.clone().sub(half);
  const max = position.clone().add(half).setY(doorway.height);
  return new THREE.Box3(min, max).applyMatrix4(zone.group.matrixWorld);
}
