# Zones: loading and unloading parts of the world

Read this before adding a room, a corridor or the outside. The recipe is in the `add-room` skill.

## Why

Rendering cost is roughly: draw calls (one per mesh per light pass) x shadow maps (every `RoomWindow` sun and every lamp
with shadows re-renders the scene from its point of view each frame) + per-frame `update()` ticks (cat, door, curtains,
screens) + GPU memory (textures: covers, painted canvases). A second room doubles all of that if it stays in the scene.
three.js frustum-culls meshes outside the camera, but lights, shadow passes and updatables are not culled. So a room the
player cannot see must be *out of the scene*, not just behind a wall.

## Model (`src/world/zone/`)

- **`Zone`**: a part of the world that loads and unloads as one. Everything in it is a child of `zone.group`, positioned
  at the zone's `origin`, so plans use zone-local coordinates and one `scene.remove(group)` takes the whole room out.
  It records every placed `Furniture` with its world-space colliders, and knows three states:
  - `empty`: not built. Costs nothing. The builder runs on first activation.
  - `dormant`: built, kept in memory, but out of the scene, not ticked, not collidable, not clickable.
  - `active`: plugged into the scene, the `CollisionWorld`, the engine loop and the `Interactor`.
- **`zone.collisions`** is a scoped view of the world's collision set: boxes added there (the door leaf, anything that
  moves its own collider) follow the zone's activation. Furniture and creatures get this, never the world's set.
- **`ZoneManager`** (an `Updatable`): finds the zone whose `bounds` contain the camera (with 0.4 m hysteresis so a doorway
  does not flicker), keeps *current + its `neighbours`* active, deactivates the rest, and unloads a dormant zone after
  30 s unless it is `persistent`. Fires `events.onZoneChange`.
- **`World`** owns the scene, the `CollisionWorld`, the live `interactables` list and the zones (`addZone`, `zone(id)`).
  It has no `place()` any more: content goes through a zone.
- **`Sky`** (`src/world/Sky.ts`): the one `DayNight` clock + `Outdoors` panorama, created in `main.ts` and ticked by the
  engine, shared by every window in every zone. Windows no longer drive the clock.
- **`WORLD_PLAN`** (`src/world/worldPlan.ts`): the list of zones (`id`, `kind`, `origin`, `extent`, `neighbours`,
  `persistent`) and the start zone. `ZONE_BUILDERS[kind]` in `layout.ts` builds each kind from its own plan file
  (`ROOM_PLAN` for `collectionRoom`) with the shared `BuildContext` (css layer, collection, covers, sky, callbacks).

## Rules for zone content

- Positions are zone-local. Convert with `zone.toWorld()` / `zone.toLocal()` when mixing with world-space objects
  (`getWorldPosition`, `localToWorld` of a placed item).
- A builder returns a handle (whatever main or other features need: the collection room returns `RoomHandle`). Anything
  created that is not furniture but must be cleaned up (subscriptions, a `Shelving`) is registered with `zone.onUnload()`.
- Furniture holding subscriptions, audio or timers implements `Furniture.dispose()` (see `RoomWindow`); geometry,
  materials and textures are freed by the zone.
- `persistent: true` for the collection room: its shelving is live-bound to the collection and the cat lives there.
- The cat's world is its zone (`zone.floorBounds`); it never follows the player out.

## What is not done yet (for the first real second zone)

1. **Portals.** Two adjacent zones must agree on the opening: the doorway in the living room's back wall (`FRONT_DOOR`,
   x -1.5) and a matching opening in the next zone's shell, and their `origin`s must line the openings up. Today the
   `Hallway` behind the door is a prop of the living room (built by `Door`); the natural first step is to turn it into
   a `hallway` zone kind with its own plan, mark `living` <-> `hallway` as neighbours, and remove the hallway from `Door`.
2. **Bounds through walls.** Zone bounds are the room's extent; the wall thickness and the doorway belong to nobody. The
   hysteresis covers the threshold, but two rooms sharing a wall should overlap their bounds by the wall thickness.
3. **The outside.** The painted `Outdoors` panorama is a 40 m sphere seen through glass; walking outside means an outdoor
   zone with real geometry (or a much larger painted world) and a different lighting rig (no room hemisphere/lamp). Treat it
   as a zone kind with its own builder and keep `Sky` as the source of time and sun direction.
4. **Session parts.** `shelving` in the Session is the home zone's; a second room with shelves would need the Session to
   ask the current zone. Search / random pick assume the home shelving.
5. **Audio.** `CrtSpeaker` and `CatVoice` fade by distance already; a deactivated zone stops ticking them, which is what
   we want. Check that a playing TV in a deactivated zone is stopped (`Session.stopScreen`) on `onZoneChange`.
6. **Spawn / return.** The player spawns at (0, 1.5) in the living room; a save of the current zone + position is not implemented.
