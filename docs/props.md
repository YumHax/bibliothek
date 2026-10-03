# Props and furniture

Read this to add or change something visible in the room. The recipe is in the `add-decor` skill.

## Three tiers

1. **Decor** (no wiring): plants, rug, picture frames, floor lamps, side tables. Listed in a plan's `decor`
   (`ROOM_PLAN` in `src/world/roomPlan.ts`, `<KIND>_PLAN` in `src/world/<kind>/<kind>Plan.ts`) as `{ kind, at, options }`;
   kinds registered in `src/world/props/decor.ts`. `holiday: 'christmas' | 'halloween' | 'newyear'` on an entry puts it up
   only then (`placeDecor` skips it otherwise): the real date or `?holiday=` (`newyear`: Christmas plus the streamers),
   read from `currentFestivities()` (`time/season.ts`, set by `Sky` before any zone is built). No holiday prop has a
   light (the light count must not change, docs/zones.md): the bulbs and candles are unlit colours that flicker. The street
   has a `decor` list too (lights across Front Street, doorstep pumpkins) and a `Snowman` shown while the snow lies.
   `upgrade` on an entry of the flat stands it only once bought (the flat starts bare, docs/economy.md "The bare flat"):
   a `HOME_GOODS` id (`'sideboard'`), the nth of a piece with several spots (`{ good: 'houseplant', nth: 3 }`), or a list
   of both. Till then it is staged (`build/owned.placerFor`: hidden, lights kept dark, not colliding, not clickable); the
   wired props use the same placers in their builders (`placerFor(zone, upgrades, plan.upgrades.x)`).
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
- Build with `part()` / `boxMesh` / `cylinderMesh` (shadow-casting); textures via `createCanvas` (or `canvasFor`) + `toTexture` /
  `canvasTexture` from `covers/generated/canvasUtils` (docs/graphics.md "Textures": anisotropy by intent, density). See "Materials, joints and layers" below: they are what keeps z-fighting and
  recompiles away.
- Their geometries are cached and shared (one per size for the page): never `translate` / `rotateX` / edit
  `mesh.geometry` in place; move the mesh, or `clone()` the geometry first.
- Clickable: `implements Interactable` with `hitboxes` (an `invisibleHitbox` around the thing), `label(player)`, `activate(session)`.
  A lamp: `extends SwitchableLamp`, implement `render(level, hovered)` (`level` 0..1, eased over ~0.1 s after a switch: scale
  the light and the glows by it; `SwitchableLamp.warmGlow` tints a bulb from an ember's orange as it warms) and list
  `hitboxes`; `setOn(initial)` at the end of the constructor (shown at once). The `Room`'s ceiling lamp and its ambient ease the same way.
- The hover cue is one for the whole flat: the part a hand reaches for glints (`HoverGlint` in `props/hoverGlint.ts`:
  `HoverGlint.of(handle, knob)` or `HoverGlint.fittings(root)`, the small metal parts found on first hover), never a whole
  material (a dark shade or a fabric seat lit up). `SwingLeaf`, `SlideDrawer`, `DropDoor` and `SwitchableLamp` do it for you;
  every door does it too (the travel and street doors' push bars and handles, the neighbours' doors, the sas's handles).
- Furniture is heard: `src/audio/furnitureSounds.ts` has the one-shots (latch, hinge creak, wood knock, soft thud, fridge
  seal, rocker click, plastic lid click, curtain rings, intercom line). `LidMotion(angle, seconds, onSettle)` calls
  `onSettle(open)` at the end of each travel (a door's latch, a box lid's click); `SwingLeaf({ seal: true })` is a fridge door.
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
- A material a class changes at runtime (a glow on hover, an emissive toggle, a fade) is its own (`matte()`, `new
  THREE.Mesh*Material`); every other look comes from the palette (below).
- Nothing decorative casts shadows unless it matters; point-light `shadow.camera.far` at room scale (see gotchas). A prop
  with a shadow-casting light implements `OccupancyAware` (`setOccupied`) like `ShelfLamp`: per-frame shadow updates only
  in the player's zone, `IDLE_SHADOW_INTERVAL` refreshes elsewhere.
- Something the crosshair must not see through (a wall, a partition) lists its meshes in `occluders`.

## Materials, joints and layers

- **Materials: the palette** (`world/materials/palette.ts`). `paint(color, roughness)` (the shared twin of `matte()`),
  `timber()` (of `wood()`), `standard({...})` / `basic({...})` (any parameters: identical ones anywhere are the same
  material), `METAL.brass()` / `agedBrass()` / `steel()` / `satinSteel()` / `chrome()`, `shared(key, make)` for anything
  else (a `fabric()`, a patched shader). Metalness is 0 or 1: raw metal 1 (the roughness tells the finish), painted,
  enamelled or blackened metal, glass and plastic 0 (docs/graphics.md). One material per look for the page, marked shared so no zone's unload frees it,
  so looks alike batch and never recompile. Never mutate a palette material. A module-level material must be one of them
  (or `markShared`): `npm run typecheck` refuses a bare one. Glass is `world/materials/glass`: `GLASS.clear` (a case's
  pane), `.pane` (a door's, a lodge's), `.shelf`, `.screen` (shower screen, bathroom shelves), `.ware` (jars, glasses),
  `.mirror`; `asGlass(mesh)` puts a see-through pane in the glass band (no shadow, clicked through). Roof and frosted
  glass lit by the sky: `skyGlassColour` / `daylitGlass` + `lightDaylitGlass`, one formula for every such pane.
- **Joints** (`world/props/joinery.ts`): two parts never share a face. Pick per joint: *buried* (`INSET`, 1 mm into the
  other), *proud* (`PROUD`, 2 mm out: a top over its carcass, a rim over a body), *apart* (`SEAM`, 0.5 mm: two fronts side
  by side); `inset()`, `proud()`, `topOf(mesh)`, `partOn(parent, below, ...)` (a part resting on another, a seam above),
  `capOn(parent, below, height, material)` (a top `PROUD` out on all four sides of its carcass, a seam above) and
  `bandAround(parent, body, y, height, material)` (a strap, a sash, a label band `PROUD` round a box part): never type a
  second part with the same width or depth as the one it sits on or wraps,
  `frontOf(mesh)` and `faceOn(face, backing, layer)` (a board's printed or lit face on the front of its frame, never a
  hand-set z). A window's pane sits `WALL.pane` over its wall, its reflection (`PaneReflection.over`) `WALL.paneReflection`.
- **Layers** (`world/surface/layers.ts`): anything flat on a floor, the ground, a wall or a street facade takes its
  height from the `FLOOR` / `GROUND` / `WALL` / `FACADE` table (rug, mat, glow pool, contact shadow; marking, patch,
  grate, puddle, leaves; paper, print, notice, flyer; a facade's pane, lettering, card, trim...) and draws as that layer:
  `layMesh(mesh, layer)` for a mesh already built (a printed panel, a screen, a marquee `layer.lift` off a face),
  `onSurface(material, layer)` for a material (a polygon offset of 4 units per rank, which is what holds at any distance;
  it copies a palette material rather than change it), or `decal(w, h, material, layer)`. A bare `X.y.lift` in a file
  that never does one of those fails the typecheck; a solid slab whose top is the layer (a rug, a doormat) says so with
  `// convention-ok: <why>`. A new kind of flat thing adds a named layer to its table, with the next integer rank where
  its lift falls (ranks follow the lifts). Things scattered at random heights get a band of their own (the leaves'
  `leaf`..`leafTop`), never a random lift across other layers. Inside one merged mesh, where no offset applies, two
  parallel faces stand `gapAt(distance)` apart. Transparent things draw in a `RENDER_ORDER` band, never a bare number
  (the typecheck refuses one). Hand-picked millimetre offsets are counted per file against
  `scripts/offset-baseline.json`: the count may only go down.
- **Check, headless**: `npm run zfight` (also the last step of `npm run typecheck`, about 3 s) builds every decor kind,
  shop prop and named piece on its own, each room as its plan lays it out (shell, decor, a shop's fixtures) and the
  street's built parts, in Node at high quality (`world/surface/zfightCatalogue.ts`, `scripts/zfight.mjs`), and runs
  the same detector. A pair not in `scripts/zfight-baseline.json` fails it; `--list` prints every pair, `--only <name>`
  one subject, `--write-baseline` accepts what is there (only for a pair that can never be seen). A new kind of
  piece the plans do not name goes in the catalogue's `PIECES`. What needs the running game (shelves of boxes, seats in
  place, people, traffic, the market's stock) is still the browser's check below.
- **Check**: `?debug` (or `?stats`) logs `[zfight] <zone>: N pairs` the first time each zone is shown, and
  `bibliothek.zfight()` in the console lists the overlapping coplanar faces of the player's zone (paths, gap, area,
  out to how far it holds, where); `bibliothek.zfight('<zone or registered root>')` another. Under `?debug` the street's
  builders also warn about their own coplanar faces as they build. Run it after adding a prop. What it leaves out on
  purpose (`world/surface/zfight.ts`): two plain materials that look the same, two that both skip the depth write, a
  face pressed against (or sunk up to 3 mm into) another solid's opposite face, an overlap too thin to show 1.5 px wide at the distance judged,
  the inside of a closed double-sided solid (a glass box, a full-turn lathe), a mesh flagged `userData.zfightIgnore`
  (shells the shader pushes out: the cat's fur) and the back of a double-sided material flagged
  `userData.zfightFrontOnly` (a room's walls: nobody stands behind them). A new false positive is a rule there, never
  a flag on the one prop.
- **Contact**: a piece stood against a wall runs through the skirting (`mouldings.ts` `SKIRTING`: 8 cm tall, 2 cm proud)
  and a wainscot; that is an intersection, not a fight. What fights is a face that lands on theirs by chance: a plinth
  top at exactly the skirting's height, a front 2 cm off the wall below it. Keep such heights off `SKIRTING.height` (the
  check finds them). A street builder (`TriBuilder`) leaves out the faces nobody sees: `hideGround(y)` (bottoms on the
  pavement), `hideAgainst(normal, point, bounds)` (backs against a facade, `FacadeFrame.wall(top)`; a balcony slab, a
  display floor). It also saves the triangles.
- **Lights**: never hide a light or a subtree holding one with `visible` (the light count changes, every lit shader
  recompiles): `setShownKeepingLights(root, shown)` (`world/lighting/keepLights.ts`), or `intensity = 0`. A glow that
  lights only its surroundings (a screen, a neon's spill) is a `PooledLight` (`world/lighting/LightPool.ts`): its zone's
  `LightPool` lends the nearest few a real light. `?stats` / `?debug` log every change of the drawn lights.
- **Static parts are frozen**: `Zone.place` composes once the local matrices of the parts of an item that nothing
  animates (not `Updatable`, not clickable, no `dispose`, no light). A class that moves a part later from an event gives
  it `userData.live = true` or calls `updateMatrix()`.

## Existing kinds and their options

| kind | options | notes |
| --- | --- | --- |
| `plant` | `kind: yucca/fig/small/monstera/hanging`, `pot: ceramic/terracotta`, `seed`, `scale`, `collides` | floor plants collide at the pot; `hanging` goes on a `ceiling`/`hung` placement |
| `rug` | `width`, `depth`, `field`, `border`, `motif` (colours) | flat slab with rounded corners and a fringe past both short ends (x); never collides; a room builder's `surfaceAt: rugsUnderfoot(zone)` (`build/rugsUnderfoot.ts`) makes the footsteps soft over it (kilims too) |
| `pictureFrame` | `motif: mountains/sunset/abstract/roofs/botanical`, `seed`, `width`, `height`, `frameColor`, `frameWidth`, `matWidth` | wall placement; give each print of the flat its own motif and frame colour (no motif more than twice) |
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
| `speaker` | `height`, `wood` | slim hi-fi floor-stander, baffle facing local +z; collides; LED and woofer follow `screen/nowPlaying` |
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
and drains (its `plugSpot` is a `ClickSpot`, a second click target placed with `placeWith`; its water drifts a ripple
normal map, `WaterRipples` rings spread under the running spout, a full bath steams with a slow `Steam`); `Toilet({ onFlush })` flushes
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
`src/audio/kitchenSounds.ts` the builder puts on a `PointSound` with `placeWith`. The fridge's bulb and the oven's lamp
are `PooledLight`s inside what their doors hide: the kitchen's one-light `LightPool` lends them a real light while a door is open.

Wired classes: `Seat` (+ `Cushion` via `mountCushion`), `Television(cssLayer, listener)`, `Projector(cssLayer, { pictureWidth, listener })`,
`RoomWindow(outdoors, { width, height, drivesClock, sunlight, curtains, blind, onCurtainsChange })` (`blind`: a `RollerBlind` that stops at the glass, for a window over a sink; the `Curtains` are sheets folded in real pleats, deeper as they gather, weave mapped in metres, the hem swinging after a pull; the sun spot re-aims in whole shadow texels), `Poster(width, height, painter)` with
`Poster.bibliothek()` / `Poster.platform()` / `shopPoster()`, `WallClock(dayNight, { onSecond })` (click says the time, a second click within 2 s sets an alarm an hour on; a red second hand steps each real second and `onSecond` strikes the `ClockTick` with it, `build/roomParts.placeClock`), `PendantLamp({ onSwitch })`, `FlushLamp({ onSwitch, on })`,
`WallSwitch({ lamp })` (a rocker by the door that toggles the room's pendant / flush lamp; every room plan has a `lightSwitch` spot),
`Door(doorway, { collisions, leafColor })` (hung by `furnishShell`), `ConsoleStand` + `Console(slotWidth, onSelectPlatform)` (one style per
platform in `consoleStyles.ts`). Placed by the room builders without wiring: `ShutDoor({ style, leafColor, matColor })` (a door that never opens; its
`leaf` group is hinged on the left edge, so a subclass may swing it ajar, as `TravelDoor` does under the curtain),
`HallConsole({ width, mirror, keys })` (+ its `bowl` spot for the hallway's clickable `HouseKeys`, which the front door's `TravelDoor({ guard })` asks for), `MailDrop` (flyers on the doormat, `deliver()` on the way home), `CoatRack({ shoeRack })`, and each room's own furniture classes. The arcade's machines are wired by
`furnishArcade` (see docs/economy.md, "The arcade"); the bedroom's `PrizeShelf({ prizes })` follows the prize store; its `Phone` and `NightLight` glow after dark
(`setDark(duskDarkness(sunHeight))`, emissive only, eased through the dusk), the `Bed` swaps made / slept-in bedding (`setMade`), the `BedroomChair` heaps the day's clothes
(`setDay`), all from the clock in `furnishBedroom`; the bed and the chair change only unseen (`UnseenSwap`: at once while the
player is elsewhere, else once they are out of the view's frustum), and a `ReadingLamp` (shadow-less, limited reach) stands on the side table. People:
`Vendor({ viewer, lines, seed, label, focus })` stands still and talks (a stallholder, an attendant), `Shopper({ viewer, spots, aisle })`
wanders, `Walker({ viewer, seed, lines })` goes where it is told (`walk(path, then)`, `stand(yaw, pose, focus, hands, lean)`, `say(text)`; a focus of `'viewer'` is a conversation, never a stare). All three look at the player through `people/attention` only: nobody gazes at the camera directly. `PersonModel.reach([a, b])` puts the hands on two world points (a
two-bone arm solver, elbows out and down) and `lean(angle)` bends the upper body: a machine's `Station.handsAt()` / `lean`
drive them for whoever plays it. Two wrap the whole shell and are
placed at the zone's origin with `zone.place(x, new THREE.Vector3())`: `TiledWainscot(room, options)` (metro tiles, or bricks with
`tileWidth/tileHeight/bevel: false/variance/roughness`) and the market's `HallRoof(room, options)` (trusses + roof light, `setDaylight` wired to `sky.dayNight`).

## Room shell

`Room(options)` builds floor, ceiling, four walls cut by the `doorways`, baseboard, wall colliders with gaps at the doorways,
(`options.finish` picks the surfaces: `floor: 'parquet' | 'concrete' | 'carpet'` (`Parquet.ts`, `Concrete.ts`, the arcade's neon-confetti `Carpet.ts`),
`walls` / `ceiling` / `trim` colours, `moulding: false` for a hall),
an invisible shadow caster outside each `opaqueWalls` wall (keeps the lamps in), the hemisphere ambient (on only while
`setOccupied(true)`, easing in and out over ~0.4 s) and the shadow-casting ceiling lamp (its normal bias in texels of its
map, `props/shadowTexels.ts`; the ceiling's fake bounce falls off from over the lamp towards the walls). `furnishShell(zone, sky, options, { leafColor })` places it,
follows the sky and hangs a `Door` in each doorway with `door !== false` (`hinge` picks the side). The collection room is
`DEFAULT_ROOM` 6 x 6 x 2.8 m with `FRONT_DOOR` on the back wall at x -1.5 (`DOOR_LEAF` 0.83 x 2.04), the hallway zone behind it;
shelving fills the back wall from `ROOM_PLAN.shelving.backWallMinX` then the right wall, skipping the projector picture;
a bookcase (`Shelf`) stands on a recessed plinth, with a hardboard back, an overhanging top and banded edges, merged
into three draws; the last box of a partly filled row leans on its neighbour. A re-sort that leaves every bookcase's rows
as they are slides the boxes to their new spots (`Shelving.reorder`, ticked by a `BoxMotion`, which also eases the hover
pop); wishlist games are a gap holding a handwritten `WishCard`, the box shows (ghosted) only in hand.
What does not fit goes to its `overflow`, shown by the bedroom's bought bookcases (`BEDROOM_PLAN.bookcase`, a `Shelving`
with an explicit `layout`, `capacity` = bookcases bought, no ceiling spots). The other rooms' shells are in their plan
files; the flat's map is in `worldPlan.ts`.
