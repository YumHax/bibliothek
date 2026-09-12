# Props and furniture

Read this to add or change something visible in the room. The recipe is in the `add-decor` skill.

## Three tiers

1. **Decor** (no wiring): plants, rug, picture frames, floor lamps, side tables. Listed in `ROOM_PLAN.decor`
   (`src/world/roomPlan.ts`) as `{ kind, at, options }`; kinds registered in `src/world/props/decor.ts`.
2. **Wired props** (need a callback or another object): door (doorways), windows (the shared Sky, skylight), posters
   and consoles (follow the collection), wall clock (DayNight), pendant (Room light), screens, seats. Their spots are still
   plan entries (`ROOM_PLAN.tv`, `.windows`, `.posters`...); `layout.ts` builds them in numbered steps.
3. **Classes** (`src/world/props/*.ts`, `src/world/Seat.ts`, ...): geometry only. A class never knows where it stands.

## Placement (`src/world/Placement.ts`)

```ts
{ floor: [x, z], rotationY? }                 // standing on the floor
{ ceiling: [x, z], rotationY? }               // hanging from the ceiling
{ corner: 'back-left', inset: 0.45, hung? }   // that far from both walls; hung = ceiling
{ wall: 'front', along: 0.3, y: 1.65, offset? } // flat on a wall, local +z into the room; y: 0 = on the floor against it
```
`along` is x for front/back walls, z for left/right, all zone-local (the room is centred on its zone's origin).
`zone.placeAt(item, placement)` resolves and places; `zone.place(item, position, yaw)` takes a local position.

## Writing a prop class

- Decoration: `extends Prop` (empty footprint, never collides). Real furniture: `extends THREE.Group implements Furniture`
  with a `footprint: Box3` in local space (+ optional `colliders` list for L-shapes).
- Build with `part()` / `boxMesh` / `cylinderMesh` (shadow-casting) and `matte()` materials; textures via
  `createCanvas` + `toTexture` from `covers/generated/canvasUtils`.
- Clickable: `implements Interactable` with `hitboxes` (an `invisibleHitbox` around the thing), `label(player)`, `activate(session)`.
  A lamp: `extends SwitchableLamp`, implement `render(on, hovered)` and list `hitboxes`; `setOn(initial)` at the end of the constructor.
- Animated: implement `update(dt)`; `place()` registers it while the zone is active.
- Holding a subscription, audio or timer: implement `dispose()`; the zone calls it on unload (geometry is freed for you).
- Wall-hung classes have their back at local z = 0 and face +z; floor classes have their base at local y = 0.
- Material constants at module level are shared across instances; per-instance state (emissive toggles) must be own materials.
- Nothing decorative casts shadows unless it matters; point-light `shadow.camera.far` at room scale (see gotchas).

## Existing kinds and their options

| kind | options | notes |
| --- | --- | --- |
| `plant` | `kind: yucca/fig/small/monstera/hanging`, `pot: ceramic/terracotta`, `seed`, `scale`, `collides` | floor plants collide at the pot; `hanging` goes on a `ceiling`/`hung` placement |
| `rug` | `width`, `depth`, `field`, `border`, `motif` (colours) | flat slab, never collides |
| `pictureFrame` | `motif: mountains/sunset/abstract`, `seed`, `width`, `height`, `frameColor`, `frameWidth`, `matWidth` | wall placement |
| `floorLamp` | `poleHeight`, `intensity`, `on` | clickable switch, own PointLight |
| `sideTable` | `radius`, `height`, `wood`, `mug` | collides |

Wired classes: `Seat` (+ `Cushion` via `mountCushion`), `Television(cssLayer, listener)`, `Projector(cssLayer, { pictureWidth, listener })`,
`RoomWindow(outdoors, { width, height, drivesClock, sunlight, onCurtainsChange })`, `Poster(width, height, painter)` with
`Poster.bibliothek()` / `Poster.platform()`, `WallClock(dayNight)`, `PendantLamp({ onSwitch })`, `Door(doorway, { collisions })`,
`ConsoleStand` + `Console(slotWidth, onSelectPlatform)` (one style per platform in `consoleStyles.ts`).

## Room shell

`DEFAULT_ROOM` 6 x 6 x 2.8 m with `FRONT_DOOR` on the back wall at x -1.5 (0.83 x 2.04). `Room` cuts the doorways out of the
walls, baseboard and wall colliders; the layout hangs a `Door` in each, opening onto the `Hallway` behind it. Shelving fills the
back wall from `ROOM_PLAN.shelving.backWallMinX` then the right wall, skipping the projector picture.
