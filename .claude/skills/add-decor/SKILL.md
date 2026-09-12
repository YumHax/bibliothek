---
name: add-decor
description: Add, move or remove something visible in the room (plant, lamp, rug, picture, table, a new kind of prop or furniture). Use for any "put a X in the room" / "move the Y" request.
---

# Add or move decoration

Read `docs/props.md` first (placement grammar, kinds, class rules). Do not read the engine or the session.

## Move / add an existing kind (most requests)

1. Open `src/world/roomPlan.ts`, find `decor`. Add or edit one line:
   `{ kind: 'plant', at: { corner: 'front-right', inset: 0.5 }, options: { kind: 'yucca', seed: 21 } },`
   Placement forms: `{ floor: [x, z], rotationY? }`, `{ ceiling: [x, z] }`, `{ corner, inset, hung? }`,
   `{ wall, along, y, offset? }`. Room is 6 x 6 x 2.8 m; keep 0.3 m off walls for floor items.
2. Check it does not stand in the shelving (back wall x >= -1, right wall except the projector picture |z| <= 1.2), on the
   TV/armchair line (z = 0, x from -2.7 to 0.5), in the door swing (back wall around x -1.5) or the cat's corner (back-left).
3. `npm run typecheck`. Done. Describe where it is; do not open a browser.

Wired props (windows, posters, seats, TV, projector, clock, pendant) also have their spots in `ROOM_PLAN`; edit the entry.

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
4. Add its plan line(s) to `ROOM_PLAN.decor`; add a row to the kinds table in `docs/props.md`.
5. `npm run typecheck && npm run build`.

## Props that need wiring (a callback, the clock, the collection)

Do not force them into `DECOR_KINDS`. Add a plan entry for the spot in `ROOM_PLAN` and a numbered step in
`furnishRoom()` (`src/world/layout.ts`) that builds it with `zone.placeAt(new Thing(...), plan.myThing)`. If another
feature needs the object (like the cat needs the seats), add it to `RoomHandle`. Subscriptions go through `zone.onUnload()`.
