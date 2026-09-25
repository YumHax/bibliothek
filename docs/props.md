# Props and furniture

Read this to add or change something visible in the room. The recipe is in the `add-decor` skill.

## Three tiers

1. **Decor** (no wiring): plants, rug, picture frames, floor lamps, side tables. Listed in a plan's `decor`
   (`ROOM_PLAN` in `src/world/roomPlan.ts`, `<KIND>_PLAN` in `src/world/<kind>/<kind>Plan.ts`) as `{ kind, at, options }`;
   kinds registered in `src/world/props/decor.ts`. `holiday: 'christmas' | 'halloween' | 'newyear'` on an entry puts it up
   only then (`placeDecor` skips it otherwise): the real date or `?holiday=` (`newyear`: Christmas plus the streamers),
   read from `currentFestivities()` (`outdoors/season.ts`, set by `Sky` before any zone is built). No holiday prop has a
   light (the light count must not change, docs/zones.md): the bulbs and candles are unlit colours that flicker. The street
   has a `decor` list too (lights across Front Street, doorstep pumpkins) and a `Snowman` shown while the snow lies.
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
- A door that opens (fridge, wardrobe, cupboard): a `SwingLeaf` per door. The host builds the face into `leaf.panel`
  (`leaf.edge(d)` is the x at `d` from the hinge), sets the leaf's `position` / `rotation.y` in its own space (hinge line at
  the bottom of the leaf's back face) and exposes `leaves`; the builder calls `placeLeaves(zone, host)` (`zone/attach.ts`),
  since only placed furniture is ticked and clickable. Carcasses are open boxes; what is inside goes in one group shown by
  `revealWhileOpen` only while a leaf is ajar (no draw call behind a shut door). No lights inside: an emissive liner.
  A drawer that slides out (the nightstand's): a `SlideDrawer`, the host builds its face into `drawer.front` and the box
  and contents into `drawer.inside` (drawn only while out), exposes `drawers`; the builder `placeWith`s each.
  A door hinged at its bottom edge (an oven): a `DropDoor`, face into `door.panel`, `onOpenness` like a leaf. `KitchenRun`
  mixes all three in its `leaves` (doors, drawers, the oven), so one `placeLeaves` places them.
- Something that belongs to a placed host but must be placed itself (a lamp on a nightstand, a TV on a dresser, a sound):
  set its pose in the host's space and `placeWith(zone, host, item, local?)`.
- A room's own sound (hum, tick, drip): a `PointSound(voice, { listener, occlusion })` placed like a prop, with an
  `AmbientVoice` from `src/audio/ambient.ts` (synthesised; built on first need after a user gesture; silent when its zone
  stops being ticked). The building's own sounds are in `src/audio/flatSounds.ts`: `RadiatorTick`, `NeighbourVoices`
  (the bedroom's party wall, muffled in the voice itself, so its `PointSound` stands just inside the wall) and
  `StairwellSounds` (behind the front door, placed outside the hallway so the wall muffles it).
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
| `mirrorPillar` | `size`, `height`, `neon` | floor-to-ceiling square column, mirrored faces in chrome frames, a neon band; collides |
| `mirrorBall` | `radius`, `drop`, `rpm`, `seed` | `ceiling` placement; a faceted ball turning on a rod, glints from an emissive speckle map (no light) |
| `hangingBanner` | `title`, `line`, `width`, `height`, `drop`, `color`, `ink`, `accent` | `ceiling` placement (+ `rotationY`); a vinyl sheet on two wires, printed on both faces |
| `duct` | `length`, `radius`, `drop`, `ventEvery` | `ceiling` placement (+ `rotationY`); a round steel duct along local x on straps, vents underneath |
| `carpetBorder` | `width`, `depth` (the room's), `band`, `inset`, `colors` | `floor: [0, 0]`; a neon chevron band woven into the carpet round the room, a little in from the walls |
| `drapedTowel` | `width`, `edge` (thickness of what it hangs over), `drop`, `inner`, `color`, `skew` | origin on the middle of the edge's top, the edge along local x, the long fall towards +z (a tub's rim: `wall` placement, `y` = rim height, `offset` to the rim's centre); never collides |
| `wallShelf` | `width`, `tiers`, `spacing`, `depth`, `wood`, `items: mugs/jars/mixed`, `seed` | wall placement, `y` = top of the lowest board; open oak boards on black brackets with mugs / jars on them |
| `spiceRack` | `width`, `rows`, `wood`, `seed` | wall placement (origin mid-back); rows of little labelled jars behind front rails |
| `wallCalendar` | `width`, `height`, `seed`, `accent` | wall placement; paper calendar on a nail, open at the real current month, today ringed |
| `noticeboard` | `width`, `height`, `notes`, `seed` | wall placement; cork pinboard, sticky notes, arcade tickets, a photo, all painted |
| `wallSconce` | `intensity`, `reach`, `on`, `onSwitch` | wall placement; brass wall light, clickable; own shadow-less `SpotLight` leaning out of the wall and short (`reach`) so it lights neither the room behind nor the one across |
| `intercom` | `color` | wall placement; door phone, clickable (nobody is ever there) |
| `fuseBox` | `width`, `height`, `breakers` | wall placement; consumer unit with a smoked cover and a conduit up |
| `shoeRack` | `width`, `wood` | wall placement with `y: 0`; two slatted oak tiers of shoes; collides |
| `doormat` | `width`, `depth`, `text`, `wear`, `seed` | floor placement, long side along local x; worn coir on rubber, 18 mm thick (`DOORMAT_THICKNESS`) |
| `kilimRug` | `width`, `depth`, `colors`, `seed` | floor placement; flat-woven stepped lozenges, fringes past both ends along x; never collides |
| `pumpkin` | `radius`, `carved`, `seed`, `lift` | Halloween; ribbed, a carved face that glows with a candle's flicker (a canvas, no light) |
| `cobweb` | `size`, `spread: left/right`, `seed` | wall placement with its origin in the top corner; line segments spreading towards local -x (`left`) or +x |
| `sweetsBowl` | `radius`, `color`, `seed` | a bowl of wrapped sweets; a wall placement's `y` puts it on a console top |
| `christmasTree` | `height`, `radius`, `baubles`, `lights`, `presents`, `seed` | stacked cones in a pot, baubles, a spiral of twinkling bulbs (no light), a star, presents; collides |
| `fairyLights` | `length`, `height`, `sag`, `spacing`, `colors`, `bulb`, `twinkle`, `seed` | like `garland`'s bulbs but coloured and twinkling; from the origin along local +x |
| `wreath` | `radius`, `seed` | wall-hung; the front door's is hung on its leaf's landing side (`Door.attachToLeaf(..., far)`) |
| `balloons` | `count`, `colors`, `height`, `seed` | a bunch on strings tied to a floor weight, swaying |
| `radiator` | `style: column/panel/towel`, `width`, `height`, `lift`, `color`, `valve`, `standoff`, `catCradle` | `wall` placement with `y: 0` (`offset` over tiles); body on brackets, pipes into the floor, a TRV; merged meshes, collides; the builder's `tickRadiators` gives each its ticking `PointSound`; with `catCradle` a fleece sling the cat naps in (a `CatPerch`) |

Clickable fittings (bathroom): `Washbasin({ onTap })` runs a `WaterStream` from its mixer; `Bathtub({ onWater })` fills
and drains (its `plugSpot` is a `ClickSpot`, a second click target placed with `placeWith`); `Toilet({ onFlush })` flushes
once per `flushSeconds` and lifts its lid through `lidSpot`; `MirrorCabinet` has a mirrored `SwingLeaf` door. The builder
turns the callbacks into `RunningWater` / `ToiletFlush` voices (`src/audio/water.ts`) on `PointSound`s. A room floor can
be tiled: `finish: { floor: 'tiles', floorTiles: { pattern: 'square' | 'checker' | 'hex', size, tile, alt, grout } }`.

Home goods (`economy/homeGoods.ts`, bought at the market): each has a `homeGoods` slot in its room's plan and shows once
`upgrades.count(id) > 0` (`upgrades.subscribe`, unsubscribed on unload): the hallway's kilim and poster, the living room's
`LavaLamp` on the TV armchair's side table (emissive wax blobs, no light, warms up from cold once shown), the kitchen's portable CRT on the
fridge (a `Television`: its glow is a light, so the set hangs in the zone from the start with its meshes hidden, and is
`zone.place`d, clickable and playable, once bought).

Games left out (`src/world/strays/`): `StrayGames` wraps what the shelves show and takes one owned game a day off them per
`StrayBox` slot (the kitchen table, the sleeper's nightstand; `strayBox` in their plans); the slot shows it as a real
`GameBox` lying cover up. Picked up, the game is handed over as its shelf's own box (moved to where the stray lay), so
putting it down sends it home.

Working appliances (kitchen): `Kettle` (boils: `Steam` puffs from the spout, one alpha-safe `Points` call), `Toaster`
(lever down, ticks, pops) and `Radio` (on/off, the `RadioTune` stream) each expose `sound`, a voice from
`src/audio/kitchenSounds.ts` the builder puts on a `PointSound` with `placeWith`.

Wired classes: `Seat` (+ `Cushion` via `mountCushion`), `Television(cssLayer, listener)`, `Projector(cssLayer, { pictureWidth, listener })`,
`RoomWindow(outdoors, { width, height, drivesClock, sunlight, curtains, blind, onCurtainsChange })` (`blind`: a `RollerBlind` that stops at the glass, for a window over a sink), `Poster(width, height, painter)` with
`Poster.bibliothek()` / `Poster.platform()` / `shopPoster()`, `WallClock(dayNight)` (click says the time, a second click within 2 s sets an alarm an hour on), `PendantLamp({ onSwitch })`, `FlushLamp({ onSwitch, on })`,
`WallSwitch({ lamp })` (a rocker by the door that toggles the room's pendant / flush lamp; every room plan has a `lightSwitch` spot),
`Door(doorway, { collisions, leafColor })` (hung by `furnishShell`), `ConsoleStand` + `Console(slotWidth, onSelectPlatform)` (one style per
platform in `consoleStyles.ts`). Placed by the room builders without wiring: `ShutDoor({ style })` (a door that never opens),
`HallConsole({ width, mirror, keys })` (+ its `bowl` spot for the hallway's clickable `HouseKeys`, which the front door's `TravelDoor({ guard })` asks for), `MailDrop` (flyers on the doormat, `deliver()` on the way home), `CoatRack({ shoeRack })`, and each room's own furniture classes. The arcade's machines are wired by
`furnishArcade` (see docs/economy.md, "The arcade"); the bedroom's `PrizeShelf({ prizes })` follows the prize store; its `Phone` and `NightLight` glow after dark
(`setNight`, emissive only), the `Bed` swaps made / slept-in bedding (`setMade`), the `BedroomChair` heaps the day's clothes
(`setDay`), all from the clock in `furnishBedroom`, and a `ReadingLamp` (shadow-less, limited reach) stands on the side table. People:
`Vendor({ viewer, lines, seed, label, focus })` stands still and talks (a stallholder, an attendant), `Shopper({ viewer, spots, aisle })`
wanders, `Walker({ viewer, seed, lines })` goes where it is told (`walk(path, then)`, `stand(yaw, pose, focus, hands, lean)`, `say(text)`). `PersonModel.reach([a, b])` puts the hands on two world points (a
two-bone arm solver, elbows out and down) and `lean(angle)` bends the upper body: a machine's `Station.handsAt()` / `lean`
drive them for whoever plays it. Two wrap the whole shell and are
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
shelving fills the back wall from `ROOM_PLAN.shelving.backWallMinX` then the right wall, skipping the projector picture;
what does not fit goes to its `overflow`, shown by the bedroom's bought bookcases (`BEDROOM_PLAN.bookcase`, a `Shelving`
with an explicit `layout`, `capacity` = bookcases bought, no ceiling spots). The other rooms' shells are in their plan
files; the flat's map is in `worldPlan.ts`.
