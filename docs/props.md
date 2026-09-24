# Props and furniture

Read this to add or change something visible in the room. The recipe is in the `add-decor` skill.

## Three tiers

1. **Decor** (no wiring): plants, rug, picture frames, floor lamps, side tables. Listed in a plan's `decor`
   (`ROOM_PLAN` in `src/world/roomPlan.ts`, `<KIND>_PLAN` in `src/world/<kind>/<kind>Plan.ts`) as `{ kind, at, options }`;
   kinds registered in `src/world/props/decor.ts`.
2. **Wired props** (need a callback or another object, or exist once): door (doorways), windows (the shared Sky, skylight),
   posters and consoles (follow the collection), wall clock (DayNight), pendant / flush lamp (Room light), screens, seats,
   and a room's one-off furniture (bed, bathtub, kitchen run...). Their spots are still plan entries (`ROOM_PLAN.tv`,
   `.windows`, `BEDROOM_PLAN.bed`...); the room's builder (`layout.ts`, `furnish<Kind>.ts`) places them.
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
- Nothing decorative casts shadows unless it matters; point-light `shadow.camera.far` at room scale (see gotchas). A prop
  with a shadow-casting light implements `OccupancyAware` (`setOccupied`) like `ShelfLamp`: per-frame shadow updates only
  in the player's zone, `IDLE_SHADOW_INTERVAL` refreshes elsewhere.
- Something the crosshair must not see through (a wall, a partition) lists its meshes in `occluders`.

## Existing kinds and their options

| kind | options | notes |
| --- | --- | --- |
| `plant` | `kind: yucca/fig/small/monstera/hanging`, `pot: ceramic/terracotta`, `seed`, `scale`, `collides` | floor plants collide at the pot; `hanging` goes on a `ceiling`/`hung` placement |
| `rug` | `width`, `depth`, `field`, `border`, `motif` (colours) | flat slab, never collides |
| `pictureFrame` | `motif: mountains/sunset/abstract`, `seed`, `width`, `height`, `frameColor`, `frameWidth`, `matWidth` | wall placement |
| `floorLamp` | `poleHeight`, `intensity`, `on` | clickable switch, own PointLight |
| `sideTable` | `radius`, `height`, `wood`, `mug` | collides |
| `garland` | `style: bulbs/bunting`, `length`, `height`, `sag`, `spacing`, `colors`, `seed` | a slack string from the origin along local +x; `floor` placement + `height`; no light, bulbs only glow |
| `crate` | `style: wood/cardboard`, `width`, `height`, `depth`, `stack`, `seed`, `label` | a pile of stock; collides |
| `flyer` | `style: paper/cloth`, `title`, `lines`, `width`, `height`, `paper`, `ink`, `accent`, `tilt`, `seed` | wall placement; paper is pinned and askew, cloth is a banner |
| `chalkboard` | `lines`, `width`, `height`, `wood`, `slate`, `seed` | pavement A-board, same words both faces; collides |
| `industrialPendant` | `drop`, `color`, `intensity`, `on`, `onSwitch` | `ceiling` placement; clickable, own shadow-less PointLight; a builder chains a row through `onSwitch` (the market) |
| `neonSign` | `text`, `color`, `width`, `height`, `intensity`, `flicker`, `font`, `seed` | wall placement; glass-tube lettering on a black panel, own coloured PointLight (`intensity: 0` for none), stutters now and then |
| `neonTube` | `length`, `color`, `radius`, `intensity`, `standoff` | wall placement; a straight tube along local x on brackets (cove light along a wall top); glows, lights only with `intensity` |
| `cushion` | `width`, `depth`, `thickness`, `color`, `tilt` | a floor cushion (the same class a `Seat` mounts); never collides |
| `speaker` | `height`, `wood` | slim hi-fi floor-stander, baffle facing local +z; collides |
| `sideboard` | `width`, `depth`, `height`, `wood`, `turntable`, `records` | low cabinet, turntable + record pile on top; `wall` placement with `y: 0`; collides |
| `smokeDetector` | `period` | `ceiling` placement; white puck, LED blinks red every `period` s (Updatable) |
| `umbrellaStand` | `color`, `umbrellas` | open tube with furled umbrellas; collides |
| `leaningMirror` | `width`, `height`, `frameColor`, `lean` | full-length mirror leaning on a wall; `wall` placement with `y: 0`; collides over its wedge |
| `pedalBin` | `radius`, `height` | steel bin, pedal facing local +z; collides |
| `bathroomScale` | `color` | flat glass scale on the floor, display facing local +z; never collides |
| `wallSocket` | `height`, `gangs: 1/2`, `cables: [x, y, z][]`, `cableColor` | `wall` placement with `y: 0`; each cable runs from its plug down to the floor and on to a wall-local device point |

Wired classes: `Seat` (+ `Cushion` via `mountCushion`), `Television(cssLayer, listener)`, `Projector(cssLayer, { pictureWidth, listener })`,
`RoomWindow(outdoors, { width, height, drivesClock, sunlight, onCurtainsChange })`, `Poster(width, height, painter)` with
`Poster.bibliothek()` / `Poster.platform()`, `WallClock(dayNight)`, `PendantLamp({ onSwitch })`, `FlushLamp({ onSwitch, on })`,
`WallSwitch({ lamp })` (a rocker by the door that toggles the room's pendant / flush lamp; every room plan has a `lightSwitch` spot),
`Door(doorway, { collisions, leafColor })` (hung by `furnishShell`), `ConsoleStand` + `Console(slotWidth, onSelectPlatform)` (one style per
platform in `consoleStyles.ts`). Placed by the room builders without wiring: `ShutDoor({ style })` (a door that never opens),
`HallConsole({ width, mirror })`, `CoatRack({ shoeRack })`, the arcade's `Pinball` / `ClawMachine` / `ChangeMachine` (animated, a
line on click, `standAt` + `focus` for a `Vendor` playing them) and each room's own furniture classes. People: `Vendor({ viewer, lines, seed,
label, focus })` stands still and talks (a stallholder, an attendant, someone at a machine), `Shopper({ viewer, spots, aisle })` wanders. Two wrap the whole shell and are
placed at the zone's origin with `zone.place(x, new THREE.Vector3())`: `TiledWainscot(room, options)` (metro tiles, or bricks with
`tileWidth/tileHeight/bevel: false/variance/roughness`) and the market's `HallRoof(room, options)` (trusses + roof light, `setDaylight` wired to `sky.dayNight`).

## Room shell

`Room(options)` builds floor, ceiling, four walls cut by the `doorways`, baseboard, wall colliders with gaps at the doorways,
(`options.finish` picks the surfaces: `floor: 'parquet' | 'concrete' | 'carpet'` (`Parquet.ts`, `Concrete.ts`, the arcade's neon-confetti `Carpet.ts`),
`walls` / `ceiling` / `trim` colours, `moulding: false` for a hall),
an invisible shadow caster outside each `opaqueWalls` wall (keeps the lamps in), the hemisphere ambient (on only while
`setOccupied(true)`) and the shadow-casting ceiling lamp. `furnishShell(zone, sky, options, { leafColor })` places it,
follows the sky and hangs a `Door` in each doorway with `door !== false` (`hinge` picks the side). The collection room is
`DEFAULT_ROOM` 6 x 6 x 2.8 m with `FRONT_DOOR` on the back wall at x -1.5 (`DOOR_LEAF` 0.83 x 2.04), the hallway zone behind it;
shelving fills the back wall from `ROOM_PLAN.shelving.backWallMinX` then the right wall, skipping the projector picture. The
other rooms' shells are in their plan files; the flat's map is in `worldPlan.ts`.
