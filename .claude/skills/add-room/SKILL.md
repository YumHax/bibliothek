---
name: add-room
description: Add a new zone to the world - another room, a corridor, a balcony, the street - that loads when the player approaches and unloads when they leave. Use for "add a bedroom", "let the player go into the hallway / outside".
---

# Add a zone (room, corridor, outside)

Read `docs/zones.md` first (model, rules, open points). Do not touch the engine, `Zone.ts` or `ZoneManager.ts` for content.

## Steps

1. **Plan file** `src/world/<name>Plan.ts`, data only, zone-local coordinates (the zone's origin is the centre of its floor).
   Copy the shape of `roomPlan.ts`: a `RoomOptions` shell (`width`, `depth`, `height`, `doorways`) and a `decor` list of
   `DecorEntry`. Every doorway that leads to another zone must have a twin in that zone's shell at the same world spot.
2. **Builder** in `src/world/layout.ts`: `export function furnish<Name>(zone: Zone, ctx: BuildContext): <Name>Handle`.
   Start with `zone.place(new Room(plan.room), new THREE.Vector3())`, register the sky with
   `zone.onUnload(ctx.sky.dayNight.onChange((s) => room.setDaylight(s.daylight, s.ambient)))`, hang a `Door` in each
   doorway with `collisions: zone.collisions`, then `placeDecor(zone, plan.decor)`. Anything with a subscription goes
   through `zone.onUnload()`. Windows: `new RoomWindow(ctx.sky.outdoors, {...})`.
3. **Kind**: add the name to `ZoneKind` in `src/world/worldPlan.ts` and the builder to `ZONE_BUILDERS` in `layout.ts`.
4. **World plan**: add the zone to `WORLD_PLAN.zones`: `{ id, kind, origin: [x, 0, z], extent: plan.room, neighbours: ['living'] }`
   and add its id to the neighbour's `neighbours` (both ways, or the view through the door is missing from one side).
   Origin arithmetic: the living room is 6 x 6 at the origin, back wall at z = -3, door at x = -1.5. A room behind it of
   depth D has `origin: [x, 0, -3 - D / 2]` (plus wall thickness if you want the walls not to overlap) and a doorway on
   its `front` wall at the matching `along`.
5. Leave `persistent` off (the zone unloads 30 s after the player leaves) unless something in it must survive.
6. `npm run typecheck && npm run build`. Describe how to check: walk through the door, the new zone appears; walk back,
   after 30 s the console shows nothing (there is no log), but memory returns.

## Not a room?

Outside, a balcony, a stairwell: same steps, but the builder places its own shell (no `Room`: no hemisphere lamp rig).
Keep the `Sky` as the single source of time and sun direction; see the open points in `docs/zones.md`.
