---
name: add-room
description: Add a new zone to the world - another room, a corridor, a balcony, the street - that loads when the player approaches and unloads when they leave. Use for "add a bedroom", "let the player go into the hallway / outside".
---

# Add a zone (room, corridor, outside)

Read `docs/zones.md` first (model, the flat's map, how two zones share a doorway, open points). Do not touch the engine,
`Zone.ts` or `ZoneManager.ts` for content. `src/world/hallway/` is the smallest complete example; `src/world/bedroom/`,
`bathroom/`, `kitchen/` are full rooms.

## Steps

1. **Folder** `src/world/<kind>/` with two files:
   - `<kind>Plan.ts`, data only, zone-local coordinates (the zone's origin is the centre of its floor). Export
     `<KIND>_ROOM: RoomOptions` (`width`, `depth`, `height`, `doorways`, `opaqueWalls`, and `finish` when it is not a room of
     the flat: `floor: 'concrete' | 'carpet'`, wall / ceiling / trim colours, `moulding: false`; see the market, the arcade) and `<KIND>_PLAN` (the room, the
     spots of its wired props, a `decor` list of `DecorEntry`). Doorways use `...DOOR_LEAF` from `roomPlan.ts`.
   - `furnish<Kind>.ts`: `export function furnish<Kind>(zone: Zone, ctx: BuildContext): ZoneHandle` (both types from
     `src/world/buildContext.ts`, never from `layout.ts`: the builders must not import each other through it; the context is
     grouped: `ctx.sky`, `ctx.listener`..., then `ctx.collection.games`, `ctx.home.upgrades`, `ctx.money.wallet`,
     `ctx.arcade.scores`, `ctx.market.stock`). Start with
     `const room = furnishShell(zone, ctx.sky, plan.room, { leafColor })` (Room + sky + the doors this zone hangs), then
     `placeRoomLight(zone, room, 'pendant' | 'flush', plan.pendant, plan.lightSwitch)` (fixture + wall switch), the room's
     own furniture with `zone.placeAt(new X(opts), plan.x)`, then `furnishDecor(zone, ctx, plan.decor)` (decor + radiator
     ticks); return `{ room }`. The shared pieces are in `src/world/build/`: `roomParts.ts` (`placeRoomLight`,
     `placeClock`, `furnishDecor`, `placeStrayBox`), `hearing.ts` (`pointSound(ctx, voice, volume?)` for a `PointSound`,
     `heardBy(ctx)` for a `Television`'s / `Projector`'s options), `follow.ts` (`followDaylight` for a frosted pane,
     `followUpgrades` / `showWhenUpgraded` for home goods, `curtainsToSkylight`); each releases its subscription on
     unload. Windows: `new RoomWindow(sky.outdoors, { ...size, onCurtainsChange: curtainsToSkylight(room, windows) })` at
     `{ wall, along, y: RoomWindow.mountY(height) }`; never `drivesClock`. Any other subscription goes through `zone.onUnload()`.
2. **The doorway, on both sides.** The neighbour's shell gets the same opening at the same world spot (its `along` in its
   own frame). Both sides name the zone across it in `to` (the portal the view is culled through). One side hangs the
   leaf, the other says `door: false`. The leaf swings away from the hanging room and lies against the far wall on the
   hinge side: `hinge: 'right'` if the left side runs into a corner; a room too narrow for the swing hangs its own door so
   it opens into the corridor.
3. **Light-tight walls.** List every wall without a window in `opaqueWalls`, or the lamps shine through the wall plane into
   the room next door.
4. **Id and kind**: add the id to `ZoneId` in `src/world/zoneIds.ts` (a doorway's `to`, a travel door's `to` and
   `world.zone(id)` only take those; `ui/menu/zoneNames.ts` then asks for its name), the kind to `ZoneKind` in
   `src/world/worldPlan.ts` and the builder to `ZONE_BUILDERS` in `layout.ts`. A room of the flat is imported there as is;
   a zone reached by travel is `lazy(() => import('./<kind>/furnish<Kind>').then((m) => m.furnish<Kind>))`, a chunk of
   its own that `Travel` fetches behind the curtain (never import its builder anywhere else, or it is bundled again).
   The handle's type follows from the builder's return type: `world.handle('<id>')` is typed, no cast. Anything the
   rest of the game needs from it goes on the handle and is read in `src/bootstrap/world.ts` (shelves of the collection:
   return them as `shelving`, the Session's `ShelvingGroup` picks them up; nothing to wire).
5. **World plan**: add the zone to `ZONES` in `worldPlan.ts`: `<id>: { kind, origin: [x, 0, z], extent: <KIND>_ROOM, neighbours }`
   (`satisfies` checks every `ZoneId` has an entry and nothing else does), and
   for a room of the flat add its id to `FLAT` and give it `neighbours: flatBut('<id>')` (the flat is always active as a
   whole, or the light count changes at doorways and every shader recompiles). Origin arithmetic: two
   zones sharing a wall keep `WALL_GAP` (0.06) between their wall planes; a room of depth D behind a wall at world z = Z has
   `origin z = Z - WALL_GAP - D / 2`. Check the map in `worldPlan.ts` for overlaps.
6. `persistent: true` for a room of the flat (kept in memory, never rebuilt: a rebuild is a hitch in a doorway). Leave it
   off for something big that the player rarely returns to (the street).
7. `npm run typecheck && npm run build`. Describe how to check: walk through the door, the new zone appears lit by its own
   lamp; the ambient follows the player (only the current room's hemisphere is on, and only its lamp shadows update every
   frame); walk back, the zone goes dormant (out of the scene, not ticked).

## Not a room?

Outside, a balcony, a stairwell: same steps, but the builder places its own shell (no `Room`) and returns
`{ lightLevel }` instead of `{ room }`. `src/world/street/` is the example: its own rig (`StreetLighting`: sun, a
hemisphere only while occupied, the fog), a `SkyDome`, invisible walls (`StreetBounds`). Keep the `Sky` as the single
source of time and sun direction; never add or remove lights at runtime (dim them).

## Not walkable to? (a teleport destination like the arcade or the market)

Skip step 2 (no shared doorway): `doorways` empty, every wall in `opaqueWalls`, `neighbours: []`, no `persistent`. Add
`travel: { label, arrival: [x, z], yaw }` to the `WORLD_PLAN` entry (arrival zone-local, yaw 0 looks down -z) and place
a `TravelDoor({ style, label, to })` on a wall as the way back (`to: 'street'`; without `to` it opens the travel menu).
Several arrival spots keyed by the zone left: `travel.arrivals` (see the street).
Put the zone far from the flat along +x (40, 80...) so nothing overlaps. See `src/world/arcade/` and `docs/economy.md`.
A room with no window onto the outside should not darken at night: `furnishShell(zone, sky, room, { fixedDaylight: 0.8 })`.
