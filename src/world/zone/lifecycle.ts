/**
 * What a zone tells the furniture placed in it, besides ticking it. Each hook is optional: the
 * zone looks for it on every placed item (duck-typed, like `isUpdatable`) and calls it on change.
 *
 * - occupied: the player is in this zone (`Zone.setOccupied`, from `main.ts` on zone change; also once on `place()`).
 * - drawn: the zone's meshes are drawn this frame (`Zone.setDrawn`, from the `PortalCuller`).
 * - active: the item is plugged into the engine with its zone (`Zone.activate` / `deactivate`, `place` / `remove`).
 */

/**
 * Furniture whose per-frame cost follows whether the player is in its zone: a room's sky ambient
 * (scene-wide), a lamp's shadow map (re-rendered every frame only where the player is, now and
 * then elsewhere). The zone calls it on every change of the player's zone, and once on `place()`.
 */
export interface OccupancyAware {
  setOccupied(occupied: boolean): void;
}

export function isOccupancyAware(obj: object): obj is OccupancyAware {
  return typeof (obj as Partial<OccupancyAware>).setOccupied === 'function';
}

/**
 * Furniture that wants to know when its zone stops or starts being drawn (`Zone.setDrawn`): a
 * shadow-casting light skips its idle shadow refresh while its zone's meshes are hidden (it would
 * render an empty map) and refreshes as soon as they are back. Called on every change, not on `place()`.
 */
export interface DrawnAware {
  /** Not `setDrawn`: curtains and blinds already mean "pulled shut" by that. */
  setZoneDrawn(drawn: boolean): void;
}

export function isDrawnAware(obj: object): obj is DrawnAware {
  return typeof (obj as Partial<DrawnAware>).setZoneDrawn === 'function';
}

/**
 * Furniture that must act when its zone leaves the engine loop or comes back (`Zone.deactivate` /
 * `activate`, the `ZoneManager` deciding). A dormant zone is no longer ticked, so anything that
 * sets its own loudness in `update()` would go on sounding at its last level: a sound goes silent
 * here (`PointSound`, the `CrtSpeaker`), a screen lets its video go (`VideoSurface`), and they pick
 * up again on activation. Active means plugged: true when the zone plugs it in (activation, or
 * `place()` into an active zone), false when it is unplugged (deactivation, `remove()`) and on
 * `place()` into a zone that is not active (a builder runs before its zone's first activation).
 */
export interface ActivityAware {
  setZoneActive(active: boolean): void;
}

export function isActivityAware(obj: object): obj is ActivityAware {
  return typeof (obj as Partial<ActivityAware>).setZoneActive === 'function';
}
