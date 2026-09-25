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
  `persistent`) and the start zone, with a map of the flat in its header comment. `ZONE_BUILDERS[kind]` in `layout.ts`
  builds each kind from its own plan file (`ROOM_PLAN` for `collectionRoom`, `src/world/<kind>/<kind>Plan.ts` +
  `furnish<Kind>.ts` for the hallway, bathroom, bedroom and kitchen) with the shared `BuildContext` (css layer,
  collection, covers, sky, callbacks). Every builder returns at least a `ZoneHandle` (`{ room }`).
- **`furnishShell()`** (`src/world/shell.ts`): what every room zone starts with: the `Room` at the origin, its lighting
  following the sky, and a `Door` in each doorway the zone owns.

## The flat

Five zones: the collection room (`living`, persistent), the `hallway` behind its back-wall door, and off the corridor the
`bathroom` and `bedroom` (back wall) and the `kitchen` (left end). The flat's front door at the corridor's right end is a
`TravelDoor` (`to: 'street'`): clicking it teleports (fade, `Travel.go`) down to the `street` (x 140, see "The street"),
whose doors lead to the `arcade` (x 40) and the `market` (x 80), two windowless, doorless halls with no neighbours, not
persistent (rebuilt on return: the market's stock is fetched again, cached per day). Each carries a
`travel: { label, arrival, yaw }` in `WORLD_PLAN`; their exit doors travel back to the street. In the flat every room neighbours every other
(`FLAT` in `worldPlan.ts`), so the five rooms are always active together: a zone coming or going changes the scene's light
count, which recompiles every shader program (a freeze of seconds at a doorway). The `PortalCuller` still draws only what
is seen, and idle rooms refresh their shadow maps twice a second, so an active room out of sight costs little.
The cat belongs to the collection room's zone but walks the whole flat (its nav grid spans every room, see `docs/cat.md`);
it is `seenFromNextDoor` so culling its zone never hides it in the corridor.

## The balcony (open air in the flat)

`src/world/balcony/`: a zone of the flat (in `FLAT`, persistent) with no `Room`, through a glazed door where the
collection room's right-hand front window was (`BALCONY_DOORWAY` in `roomPlan.ts`, `door: false`; the balcony hangs the
`BalconyDoor`, which opens into the room). Its portal is registered with a door that is always open (`{ openness: 1 }`):
the glass is clear, so each side sees the other shut. `BalconySlab` (slab, railing = the colliders), `BuildingFront` (the
building's own front round the door, world-planned in `BALCONY_PLAN.front`: plaster, our windows painted as glass over
the real panes, the neighbours' windows lit at night by curfew, the door cut out), `OpenAir` (the panes' shader on a
45 m BackSide sphere drawn after everything opaque so the depth test culls it, a shadow-casting sun spot aimed at the
balcony that is 0 when the sun is behind the building, a hemisphere on only while occupied). The builder returns
`{ lightLevel }` instead of a room (`ZoneHandle.lightLevel`, read by the graphics in `main.ts`). The cat may walk out.

## How two zones share a doorway

- Both shells cut the same opening (`doorways` in each `RoomOptions`, same world spot, same size); the zone origins keep
  `WALL_GAP` (0.06 m) between the two wall planes so they do not z-fight, and the `Door`'s lining bridges the gap.
- Exactly one side hangs the leaf: the other marks its doorway `door: false`. `hinge: 'right'` mirrors the leaf; it swings
  away from the hanging room and ends nearly flat against the far wall on the hinge side, so pick the side with the longer
  wall. Too narrow a room (the bathroom) hangs its own door so it opens into the corridor. Both sides name the zone across
  the opening in `to`: that is the portal the view is culled through.
- Light does not stop at a wall plane: a room's lamps would pour through it. `RoomOptions.opaqueWalls` lays an invisible
  shadow caster just outside each listed wall (cut by its doorways); list every wall without a window.
- A `HemisphereLight` lights the whole scene, so `Room` keeps its sky ambient off until `setOccupied(true)`. `main.ts`
  calls `Zone.setOccupied()` on `onZoneChange`, which reaches every `OccupancyAware` item of the zone: the room, its
  shelf lamps and its windows re-render their shadow maps every frame only while occupied (a point light's shadow is six
  passes), and refresh them twice a second, out of phase, otherwise. Each lamp's shadow reaches 1.5x its own floor
  diagonal, no further. `?stats` in the URL logs fps, draw calls and the light count every 2 s.
- Shadow maps do not know about walls: a lamp renders every caster in range, the collection room's shelving included,
  even from behind a wall. So each zone has its own shadow layer (`Zone.shadowLayer`, set on everything placed in it),
  every shell and every door is also on `SHARED_SHADOW_LAYER` (`furnishShell`), and every shadow-casting light placed in
  a zone renders those two layers only (`Zone.adopt`). A lamp's shadow pass costs its own room, not the flat.
- Neither does the camera: three.js culls by frustum, not by walls, so from the corridor the whole flat behind its walls
  was drawn. `PortalCuller` (an `Updatable` in `main.ts`) walks the `Doorway.to` portals from the player's zone: a zone
  is drawn only if reached through open doors whose openings are in view (`Zone.setDrawn`). Undrawn zones keep their
  lights (removing a light recompiles every shader) and their doors (both rooms see a door); only their meshes hide.
  Measured in the corridor with the doors shut: 36 draw calls instead of 950.
- `World.prime()` (called once in `main.ts`) activates every zone, compiles every shader and uploads every texture before
  the first frame, so no doorway triggers a compile. The flat's rooms are all `persistent`: they go dormant (out of the
  scene) but are never rebuilt.

## Rules for zone content

- Positions are zone-local. Convert with `zone.toWorld()` / `zone.toLocal()` when mixing with world-space objects
  (`getWorldPosition`, `localToWorld` of a placed item).
- A builder returns a handle (whatever main or other features need: the collection room returns `RoomHandle`). Anything
  created that is not furniture but must be cleaned up (subscriptions, a `Shelving`) is registered with `zone.onUnload()`.
- Furniture holding subscriptions, audio or timers implements `Furniture.dispose()` (see `RoomWindow`); geometry,
  materials and textures are freed by the zone.
- `persistent: true` for the collection room: its shelving is live-bound to the collection and the cat lives there.
- The cat's world is its zone (`zone.floorBounds`); it never follows the player out.

## The street (`src/world/street/`)

Front Street outside the building, a zone without a `Room` (the map is in `streetPlan.ts`): 24 m between building lines,
walkable from the park's hedge to where the cross street turns out of sight (invisible walls, `StreetBounds`). Reached by
travel only: `TravelPlan.arrivals` (keyed by the zone left) sets the player down in front of the door they came out of;
its `StreetDoor`s travel straight on (`SessionActions.travel(to)`, no menu; a `TravelDoor` without `to` still opens it).
- **Rig instead of a shell** (`StreetLighting`): a shadow-casting `DirectionalLight` from `sky.outdoors.lightDirection`,
  shadow camera a square around the player snapped to texels; a `HemisphereLight` only while occupied; it overrides
  the scene's `Haze` fog every frame with the weather's (`streetAir`), and returns `lightLevel` in its handle (what
  `main.ts` reads when there is no `room`). `SkyDome` (radius 90, inside the camera's 100 m far plane) draws the sky.
- **Cost**: every building face is one mesh with a canvas atlas (`Buildings`: `paintFacade`, night windows on a
  quarter-size emissive atlas re-uploaded at most every 6 s, curfews as the painted view); lamps, trees, cars are
  instanced; four point lights move to the lamps nearest the player (never added or removed). People are the costly
  part (~33 draw calls each): two passers-by, no shadow, not drawn beyond 38 m; the busker.
- Extras: `Newsstand` (THE GAMING WEEKLY, `ui/NewsPanel` through `openPanel`, tips from `market.peekToday()`),
  `Busker` (`audio/BuskerTune`, tips via `SessionActions.pay`, 3 a day), `GarageSale` (one day in three, 2 to 4 of
  today's stock as bin-priced `ForSaleBox`es once the stock is drawn, else a sign pointing to the market).

## What is not done yet

1. **Bounds through walls.** Zone bounds are the room's extent; the `WALL_GAP` and the doorway belong to nobody. The
   hysteresis (0.4 m) covers the threshold.
2. **Stairs.** The street is reached by travel; the building has no walkable stairwell, and the street does not match
   the windows' painted view metre for metre (same layout and sun, its own shops).
3. **Session parts.** `shelving` in the Session is the home zone's; a second room with shelves would need the Session to
   ask the current zone. Search / random pick assume the home shelving.
4. **Audio.** `CrtSpeaker` and `CatVoice` fade by distance already; a deactivated zone stops ticking them, which is what
   we want. Check that a playing TV in a deactivated zone is stopped (`Session.stopScreen`) on `onZoneChange`.
5. **Spawn / return.** The player spawns at (0, 1.5) in the living room; a save of the current zone + position is not implemented.
6. **Light count.** Lights change shader programs: any zone reachable on foot must be active whenever its neighbours
   are (a new room of the flat joins `FLAT`), and a light is never added, removed or given `castShadow` at runtime:
   dim it to 0 instead. `World.prime()` compiles every material with the flat's lights, at start-up.
