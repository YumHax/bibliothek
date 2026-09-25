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
   - `furnish<Kind>.ts`: `export function furnish<Kind>(zone: Zone, { sky }: BuildContext): ZoneHandle`. Start with
     `const room = furnishShell(zone, sky, plan.room, { leafColor })` (Room + sky + the doors this zone hangs), place a
     `PendantLamp` or `FlushLamp` with `onSwitch: (on) => room.setLampOn(on)`, the room's own furniture with
     `zone.placeAt(new X(opts), plan.x)`, then `placeDecor(zone, plan.decor)`; return `{ room }`. Windows:
     `new RoomWindow(sky.outdoors, { ...size, onCurtainsChange })` at `{ wall, along, y: RoomWindow.mountY(height) }`,
     wiring `room.setSkylight` like `furnishRoom` does; never `drivesClock`. Anything with a subscription goes through `zone.onUnload()`.
2. **The doorway, on both sides.** The neighbour's shell gets the same opening at the same world spot (its `along` in its
   own frame). Both sides name the zone across it in `to` (the portal the view is culled through). One side hangs the
   leaf, the other says `door: false`. The leaf swings away from the hanging room and lies against the far wall on the
   hinge side: `hinge: 'right'` if the left side runs into a corner; a room too narrow for the swing hangs its own door so
   it opens into the corridor.
3. **Light-tight walls.** List every wall without a window in `opaqueWalls`, or the lamps shine through the wall plane into
   the room next door.
4. **Kind**: add the name to `ZoneKind` in `src/world/worldPlan.ts` and the builder to `ZONE_BUILDERS` in `layout.ts`.
5. **World plan**: add the zone to `WORLD_PLAN.zones`: `{ id, kind, origin: [x, 0, z], extent: <KIND>_ROOM, neighbours }`, and
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
