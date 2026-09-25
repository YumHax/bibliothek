---
name: add-decor
description: Add, move or remove something visible in the room (plant, lamp, rug, picture, table, a new kind of prop or furniture). Use for any "put a X in the room" / "move the Y" request.
---

# Add or move decoration

Read `docs/props.md` first (placement grammar, kinds, class rules). Do not read the engine or the session.

## Move / add an existing kind (most requests)

1. Open the room's plan, find `decor`: `src/world/roomPlan.ts` for the collection room, `src/world/<kind>/<kind>Plan.ts`
   for the hallway, bathroom, bedroom or kitchen (its header comment gives the room's size and which wall is which). Add or edit one line:
   `{ kind: 'plant', at: { corner: 'front-right', inset: 0.5 }, options: { kind: 'yucca', seed: 21 } },`
   Placement forms: `{ floor: [x, z], rotationY? }`, `{ ceiling: [x, z] }`, `{ corner, inset, hung? }`,
   `{ wall, along, y, offset? }`, all zone-local. The collection room is 6 x 6 x 2.8 m; keep 0.3 m off walls for floor items.
2. Check it does not stand in the shelving (collection room: back wall x >= -1, right wall except the projector picture
   |z| <= 1.2), on the TV/armchair line (z = 0, x from -2.7 to 0.5), in a door swing (the leaf lies against the wall on its
   hinge side once open; see the plan's doorway comments) or the cat's corner (back-left of the collection room).
3. `npm run typecheck`. Done. Describe where it is; do not open a browser.

Wired props (windows, posters, seats, TV, projector, clock, pendant, a room's own furniture) also have their spots in the
room's plan; edit the entry.

## Add a new kind of prop

1. Write `src/world/props/MyThing.ts`: `export class MyThing extends Prop` (decoration, never collides) or
   `extends THREE.Group implements Furniture` with a real `footprint`. Options interface `MyThingOptions` with defaults.
   Build with `part()` / `matte()` from `./Prop`, `cylinderMesh` / `invisibleHitbox` from `../meshUtils`.
   Floor items: base at local y = 0. Wall items: back at local z = 0, facing +z.
2. Clickable? `implements Interactable`: `hitboxes`, `label(player)`, `activate(session: SessionActions)`. A lamp:
   `extends SwitchableLamp`, implement `render(on, hovered)`, call `setOn(initial)` at the end of the constructor.
   Animated? `update(dt: number)`.
3. Register it: one line in `DECOR_KINDS` (`src/world/props/decor.ts`): `myThing: (o: MyThingOptions = {}) => new MyThing(o),`
   and export the class from `src/world/props/index.ts`.
4. Add its plan line(s) to the room's `decor`; add a row to the kinds table in `docs/props.md`.
5. `npm run typecheck && npm run build`.

## Props that need wiring (a callback, the clock, the collection) or exist once (a bed, a bathtub)

Do not force them into `DECOR_KINDS`. Add a plan entry for the spot in the room's plan and a step in its builder
(`furnishRoom()` in `src/world/layout.ts`, or `src/world/<kind>/furnish<Kind>.ts`) that builds it with
`zone.placeAt(new Thing(...), plan.myThing)`. If another feature needs the object (like the cat needs the seats), add it to
the builder's handle (`RoomHandle`). Subscriptions go through `zone.onUnload()`; the helpers in `src/world/build/` already
do: its sound `placeWith(zone, thing, pointSound(ctx, voice, { maxDistance: 5 }), local)`, a home good hidden until bought
`showWhenUpgraded(zone, upgrades, 'lamp', thing)` (or `followUpgrades(zone, upgrades, apply)`), a clock `placeClock`, a
game left on a surface `placeStrayBox`.
