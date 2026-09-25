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
  30 s unless it is `persistent`. `onZoneChange(listener)` subscribes (any number; returns the unsubscribe). A zone
  whose builder is lazy and not loaded yet is fetched first (`Zone.load`): the current zone stays current meanwhile.
- **`World`** owns the scene, the `CollisionWorld`, the live `interactables` list and the zones (`addZone`, `zone(id)`).
  It has no `place()` any more: content goes through a zone. It is a `World<ZoneHandleById>`: `zone(id)` only takes a
  `ZoneId` and `handle(id)` / `build(id)` are typed with what that zone's builder returns (no casts).
- **`Sky`** (`src/world/Sky.ts`): the one `DayNight` clock + `Outdoors` panorama, created in `bootstrap/services.ts` and ticked by the
  engine, shared by every window in every zone. Windows no longer drive the clock.
- **`WORLD_PLAN`** (`src/world/worldPlan.ts`): the zones by id (`ZONES`: `kind`, `origin`, `extent`, `neighbours`,
  `persistent`; `satisfies` a record over `ZoneId`, so an id without an entry or an entry without an id fails to
  compile) and the start zone, with a map of the flat in its header comment. `ZoneId` (`src/world/zoneIds.ts`, a leaf
  type) is what every doorway's and travel door's `to` and the travel menu name. `ZONE_BUILDERS[kind]` in `layout.ts`
  builds each kind from its own plan file (`ROOM_PLAN` for `collectionRoom`, `src/world/<kind>/<kind>Plan.ts` +
  `furnish<Kind>.ts` for the others) with the shared `BuildContext` (`src/world/buildContext.ts`: the scene's services,
  then `collection`, `home`, `money`, `arcade`, `market`). Every builder returns at least a `ZoneHandle` (`{ room }`);
  `ZoneHandleById` is what each zone's returns. The zones reached by travel (arcade, market, street) have `lazy`
  builders, a chunk each: `Travel` fetches the destination's while the curtain falls, `startWhenReady` the rest at idle.
- **`furnishShell()`** (`src/world/shell.ts`): what every room zone starts with: the `Room` at the origin, its lighting
  following the sky, and a `Door` in each doorway the zone owns.

## The flat

Five rooms: the collection room (`living`, persistent), the `hallway` behind its back-wall door, and off the corridor the
`bathroom` and `bedroom` (back wall) and the `kitchen` (left end); with the `balcony` and the `stairwell` they make
`FLAT`. The flat's front door at the corridor's right end is a real door (`hallway/FrontDoor`, locked from inside
without the keys from the bowl, self-closing) onto our landing: the stairwell (see "The stairwell"), whose street door
travels (fade, `Travel.go`) to the `street` (x 140, see "The street"), whose doors lead to the `arcade` (x 40) and the
`market` (x 80), two windowless, doorless halls with no neighbours, not persistent (rebuilt on return: the market's
stock is fetched again, cached per day). Each carries a `travel: { label, arrival, yaw }` in `WORLD_PLAN`; their exit
doors travel back to the street. In the flat every zone neighbours every other
(`FLAT` in `worldPlan.ts`), so they are always active together: a zone coming or going changes the scene's light
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
`{ lightLevel }` instead of a room (`ZoneHandle.lightLevel`, read by the graphics through `zoneHandle.lightLevelOf`). The cat may walk out.

## The stairwell (walked, not travelled)

`src/world/stairwell/`: the building's staircase from our landing (level with the flat, world y 0) down five storeys of
3.26 m to the entrance hall on the street's level (world y -16.3), east of the bedroom and behind the collection room's
right wall (map in `stairwellPlan.ts`). A zone of `FLAT` (persistent, always active: its lights are compiled with the
flat's) with no `Room`: `Staircase` (plaster shaft, stone landings, ten flights of nine steps round the well, the iron
balustrade, our landing's strip from the front door, the hall's cabochon tiles; walls and the well's sides are its
`colliders`), `Lift` (an iron cage the full height, a wooden car that rides between our landing and the hall with the
player in it, folding gates whose colliders come and go; brass buttons on both stops and in the car), `StairLights`
(globes on every landing lit by a sensor while someone is there, two shadowless point lights following the player,
dimmed to 0 otherwise because lights ignore walls; a hemisphere only while occupied; the skylight), the neighbours'
doors and floor names, the mailboxes, and at the street door the sas (see "The sas"). Travel still lands in the hall
(the menu's "Go home", `STAIRWELL_PLAN.arrival`, in front of the sas's glass door).
- **The player's ground.** `FirstPersonController.setGround(fn)` gives the floor's height under (x, z) for the feet's
  current height (`GroundHeight`): flights stack, so the surface is the highest one no more than a step above the feet.
  The stairwell's handle provides it (`StairwellHandle.ground`, world metres; the car's floor while inside), `bootstrap/world.ts`
  hands it to the player; everywhere else it leaves the feet where they are (0). The eye is `feet + height`, the
  collision probes are relative to the feet, and `Travel` passes the arrival's height (`setPosition(x, z, feet)`).
- **Bounds.** Its box (x 1.03..8.17, z -8.45..3.25, y -16.3..2.8) overlaps the living room's and the bedroom's corners at
  the flat's level; harmless, since the current zone stays current while the player is inside it, and walls keep them
  apart. The cat's rooms leave it out; `PositionMemory` does not restore onto the stairs (a floor plan cannot say which
  flight), so a reload there wakes up at home.
- **Coming home** walking in through the front door counts for `Homecoming` (within 1.2 m of the door, as the teleport's
  arrival spot does): keys back in the bowl, the mail on the mat. From the landing the door always lets the player in.
- **People on the stairs.** `Neighbours` (the residents of `STAIRWELL_PLAN.residents`: out in the morning, home in the
  evening, a lift user or two) are only met while the player is in the stairwell (its occupancy): on entering, someone
  whose hour it is (or on an errand) comes out of their door and walks the flights down to the street door (`stairRoutes`:
  across the landings, down the middle of each flight), or in and up; nobody walks unseen, their day just says where
  they are. `StairWalker` is a `Walker` whose feet follow `Staircase.floorAt` and that fades at doors and the lift's gate
  (the car is not ridden: they fade at one stop and come out at the other after the ride's time). No colliders. They say
  hello in passing and chat when clicked. The `Postman` steps out of the lift onto our landing with the mail orders
  (`MailPost`), rings, and waits clear of the front door's swing.
- **The doorstep** (`hallway/Doorstep`, in `BuildContext.building` with the post, the swaps and their panel,
  `stairwell/building.ts`): the front door's `visitors` slot. Whoever rings (the postman; the friends through `also`)
  is answered by opening the door from inside, keys or not; notes slipped under the door land on the hall's mat. A
  neighbour with a swap going (`NeighbourTrades`) has their door on the landing open the swap panel.

## The sas (walked, not travelled, not joined)

`src/world/airlock/`: the building's street entrance, a vestibule between the street door and a glazed inner door,
built twice to the centimetre from `airlockPlan.ts` (`SAS`): at the end of the stairwell's entrance hall (`twin:
'hall'`, its street door on the hall's end wall) and behind our door on Front Street (`twin: 'street'`, its partition in
the void behind the facade). The street stays a place of its own (its lights never join the flat's), yet nothing
is teleported in view: with both doors shut, the player is moved from one twin to the same spot and look in the other.
- **Why it cannot show.** Everything seen from inside with the doors shut is unlit (`MeshBasicMaterial`) and carries its
  light in its vertex colours, baked from the ceiling globe (`sasFinish.bakedLight`): no lamp of the stairwell, no sun
  or weather of the street reaches it, so the two copies are the same image. Textures are painted once and shared. What
  faces the zone outside (the street door's street face, the glass door's hall face, the partition seen from the hall)
  is lit like the rest of its zone. Rain and snow skip the sas (`Precipitation`'s `shelter`); underfoot it is tiles.
- **Each twin's doors.** Its *live* door opens onto its own zone (the hall's glass door, the street's street door: both
  swing away from the sas, `SasDoor`) and swings shut once the player has walked off; its *far* door is the way through
  (`TWINS`). In the hall, the far door and the door release (the brass PORTE button by the street door) cross; in the
  street, the release just opens the street door.
- **A crossing** (`AirlockLink.cross`): only from inside (`holdsViewer`); the live door swings shut behind the player,
  the release buzzes (`doorSounds`, at least 0.7 s) while `World.prepareZone` builds the other twin's zone and its
  neighbours if need be (loading a lazy builder's module first) and compiles them out of the scene, in a stand-in holding only their own lights (programs are
  cached per material, so switching back compiles nothing); the other twin's doors are shut at once, the player moved
  (feet on its floor: `setPosition(x, z, floor)`), the `ZoneManager` switches on its next tick, `World.primeAsync`
  compiles any straggler while the doors are still shut, the lock clacks and the other twin's live door opens. The
  first crossing of a visit builds the street while the buzzer sounds: a still frame in a shut box. `bootstrap/player`
  connects the link (`airlockLink.connect`); unconnected (a test page), a crossing falls back on travel (the curtain).
- **Sound.** The street's `StreetSound` and `ShopSounds` go through `outdoorsInput` (a low-pass and a gain before the
  world bus); the street's twin closes it round the player inside (`setOutdoorsMuffle`), less as the street door opens.
- **Bounds.** The street's extent reaches z -15 so its sas is the street's; the hall's sas is inside the stairwell's box.

## How two zones share a doorway

- Both shells cut the same opening (`doorways` in each `RoomOptions`, same world spot, same size); the zone origins keep
  `WALL_GAP` (0.06 m) between the two wall planes so they do not z-fight, and the `Door`'s lining bridges the gap.
- Exactly one side hangs the leaf: the other marks its doorway `door: false`. `hinge: 'right'` mirrors the leaf; it swings
  away from the hanging room and ends nearly flat against the far wall on the hinge side, so pick the side with the longer
  wall. Too narrow a room (the bathroom) hangs its own door so it opens into the corridor. Both sides name the zone across
  the opening in `to`: that is the portal the view is culled through.
- Light does not stop at a wall plane: a room's lamps would pour through it. `RoomOptions.opaqueWalls` lays an invisible
  shadow caster just outside each listed wall (cut by its doorways); list every wall without a window.
- A `HemisphereLight` lights the whole scene, so `Room` keeps its sky ambient off until `setOccupied(true)`. `bootstrap/world.ts`
  calls `Zone.setOccupied()` on `onZoneChange`, which reaches every `OccupancyAware` item of the zone: the room, its
  shelf lamps and its windows re-render their shadow maps every frame only while occupied (a point light's shadow is six
  passes), and refresh them twice a second, out of phase, otherwise, never while their zone is undrawn (a refresh would
  render the hidden room as an empty map; `DrawnAware.setZoneDrawn` forces one when it is drawn again). A room's ceiling
  lamp has a finite range (2.5x its farthest corner, the shadow's `far` too): beyond it no fragment pays for its shadow
  lookup. `?stats` in the URL logs fps, draw calls and the light count every 2 s.
- Shadow maps do not know about walls: a lamp renders every caster in range, the collection room's shelving included,
  even from behind a wall. So each zone has its own shadow layer (`Zone.shadowLayer`, set on everything placed in it),
  every shell and every door is also on `SHARED_SHADOW_LAYER` (`furnishShell`), and every shadow-casting light placed in
  a zone renders those two layers only (`Zone.adopt`). A lamp's shadow pass costs its own room, not the flat.
- Neither does the camera: three.js culls by frustum, not by walls, so from the corridor the whole flat behind its walls
  was drawn. `PortalCuller` (an `Updatable`, `bootstrap/world.ts`) walks the `Doorway.to` portals from the player's zone: a zone
  is drawn only if reached through open doors whose openings are in view (`Zone.setDrawn`). Undrawn zones keep their
  lights (removing a light recompiles every shader) and their doors (both rooms see a door); only their meshes hide,
  and their interactables leave the crosshair (the ray ignores `visible`). Measured in the corridor with the doors shut: 36 draw calls instead of 950.
- `World.prime()` (called once in `bootstrap/world.ts`) activates every zone, compiles every shader and uploads every texture before
  the first frame, so no doorway triggers a compile. The flat's rooms are all `persistent`: they go dormant (out of the
  scene) but are never rebuilt.

## Rules for zone content

- Positions are zone-local. Convert with `zone.toWorld()` / `zone.toLocal()` when mixing with world-space objects
  (`getWorldPosition`, `localToWorld` of a placed item).
- A builder returns a handle (whatever the bootstrap or other features need: the collection room returns `RoomHandle`;
  a zone with shelves of the collection returns them as `shelving`, and the Session's `ShelvingGroup` takes every one). Anything
  created that is not furniture but must be cleaned up (subscriptions, a `Shelving`) is registered with `zone.onUnload()`.
- Furniture holding subscriptions, audio or timers implements `Furniture.dispose()` (see `RoomWindow`); geometry,
  materials and textures (every map, `ShaderMaterial` uniforms, shadow maps, reflector targets) are freed by the zone
  (`disposeTree`). A module-level material, texture or geometry used by more than one zone is `markShared()` (`props/Prop.ts`)
  so an unload leaves it alone; generated floor canvases are painted once per page (`materials/paintedTiles.ts`).
- Lifecycle hooks (`zone/lifecycle.ts`, duck-typed on every *placed* item, like `Updatable`; a composite forwards them
  to its parts): `OccupancyAware.setOccupied` (the player is in this zone: per-frame costs, sounds only heard in the
  room), `DrawnAware.setZoneDrawn` (the `PortalCuller` hides or shows the zone's meshes), `ActivityAware.setZoneActive`
  (the item is plugged into the loop, or not: activation, deactivation, `place`/`remove`). A dormant zone is not
  ticked, so anything that sets its own loudness in `update()` must go silent in `setZoneActive(false)`: `PointSound`
  does it for every `AmbientVoice` (`Voice` fades out, lets its sources go, comes back at its level), a
  `VideoSurface` unloads its iframe and reloads it on activation where the video would be had it played on (the
  `Television` and `Projector` forward it, and their `dispose()` frees the iframe and the `CrtSpeaker`). A new sound
  or screen in a zone is either driven by a `PointSound`, silent while unoccupied, or `ActivityAware`.
- `persistent: true` for the collection room: its shelving is live-bound to the collection and the cat lives there.
- The cat's world is its zone (`zone.floorBounds`); it never follows the player out.

## The street (`src/world/street/`)

Front Street outside the building, a zone without a `Room` (the map is in `streetPlan.ts`): 24 m between building lines,
walkable from the park's hedge to the roadworks (x 38; invisible walls, `StreetBounds`). The layout is the painted
view's: Park Street runs south from a T junction at our corner with the park on its far side, the block across Front
Street closes its end (`fA`, `fB`), Front Street runs on east past the roadworks to a side street on our side and a
building across its end (x 136). The flat is our corner building's top floor (`FLAT_IN_STREET`): the painted view's
row across Front Street is painted from `FACADES` (`props/outdoors/Facades.paintFrontBlock`), so RÉTRO JEUX and its
neighbours are where the windows show them, and looking up from the street the flat's window and balcony are where
they are (`FacadeSpec.flat`). Walked into from the stairwell through the sas (see "The sas"; our facade has a hole
there, `FacadeSpec.openings`, and `StreetBounds` a gap, `OUR_LINE_GAPS`), or reached by travel from the arcade and the
market: `TravelPlan.arrivals` (keyed by the zone left) sets the player down in front of the door they came out of; the
arcade's and RÉTRO JEUX's `StreetDoor`s travel straight on (`SessionActions.travel(to)`, no menu; a `guard` may refuse:
RÉTRO JEUX keeps `SHOP_HOURS`).
- **Traffic** (`traffic/`): `StreetTraffic` is what road users agree on (the signalled crossing's cycle, obstacles
  drivers stop for, vehicles for the queues, `busAtStop`). The driving rules are `driving.allowedSpeed` (the player,
  obstacles, the car ahead, red and amber at the lights, giving way at the plain zebra), shared by `StreetCars` (three
  car shapes, instanced per shape), `ScriptedVehicle` subclasses (`StreetBus` on a real-time floor, the morning
  `DeliveryVan` with its driver carrying crates, the `BinLorry` stopping at the bins; standing, they are colliders and
  obstacles) and `StreetBikes` (riders, racks). `SignalHeads` (unlit HDR lamps), `Spray` behind wet wheels. Every
  `CarVoice` carries `kind` and a `honks` counter for `StreetSound`.
- **People and animals** (`StreetCrowd`, `life/`): passers-by from door to door and down Park Street, crossing at the
  lights on the green man or at the zebra (then they are `RoadObstacle`s), fading in and out (alpha hash) at doors and
  over the last `fade` metres of `drawDistance`, fewer at night, with lines from `life/streetTalk` (the weather, the
  market's theme and stock, the arcade's tables); a dog walker; `StandingPeople` (on the phone, on the bench, the bus
  stop's passenger who boards the bus); `Terraces` (tables out in opening hours and dry weather, stacked otherwise; their
  colliders come and go through `zone.collisions`; seated customers); `Pigeons` that take off; the `StrayCat`.
- **Facades in relief** (`relief/`, `details/`): `Buildings.fronts` feeds 3D awnings, balconies, sills and door surrounds
  (`FacadeRelief`), interior-mapped shop windows (`ShopInteriors`, off on low), roller shutters that roll down at
  closing (`Shutters`), light pools in front of open shops (`ShopGlow`), wet streaks, puddles and, on
  `QUALITY.reflections`, a masked `Reflector` hidden while dry (`WetGround`), autumn leaves (`Leaves`), manholes,
  hydrants, bollards, a Morris column and the roadworks (`StreetDetails`), the flickering lamp's buzz (`LampBuzz`).
  `snowCovered()` (`snowCover.ts`, uniform written by `StreetGround`) whitens up-facing faces of everything.
- **Shops** (`shops/`): `ShopEntrance` on every shop door along the walkable pavements (caption, `SHOP_HOURS`, a word,
  or an offer: the café's coffee = the market's coffee of the day plus the barista's tip, the tabac's scratch cards in
  `ui/ScratchCardPanel`, the florist's potted plants for the balcony, a croissant, a lemonade and gossip),
  `DroppedCoins` (a few a day), `GiveawayBox` (some days, one free worn game once the stock is drawn), `Trader` (a rival
  collector some days, with three copies taken off the market's stalls: buy, haggle, swap). Coins go in through
  `BuildContext.money.purse`. See `docs/economy.md`.
- **Sound** (`StreetSound`, `audio/`): traffic, horns, the bus and lorry's diesel, sirens far off, church bells on the
  hour (8:00 to 21:00), sparrows; `ShopSounds` (the arcade's door, cafés and bars and their terraces, the laundry, shop
  bells rung by `StreetCrowd.onDoor`). `streetSurfaceAt` tells the footsteps paving from asphalt and grass.
- **Rig instead of a shell** (`StreetLighting`): a shadow-casting `DirectionalLight` from `sky.outdoors.lightDirection`,
  shadow camera a square around the player snapped to texels; a `HemisphereLight` only while occupied; it overrides
  the scene's `Haze` fog every frame with the weather's (`streetAir`), and returns `lightLevel` in its handle (what
  `zoneHandle.lightLevelOf` reads when there is no `room`). `SkyDome` (radius 90, inside the camera's 100 m far plane) draws the sky.
- **Cost**: every building face is one mesh with a canvas atlas (`Buildings`: `paintFacade`, night windows on a
  quarter-size emissive atlas re-uploaded at most every 6 s, curfews as the painted view); lamps, trees, cars are
  instanced; four point lights move to the lamps nearest the player (never added or removed). People are the costly
  part (~33 draw calls each): up to about ten (four walkers, the standing ones, terrace customers, the busker, the
  trader, the van's driver), no shadows of their own, culled once faded beyond 40 m, fewer on low quality.
- Extras: `Newsstand` (THE GAMING WEEKLY, `ui/NewsPanel` through `openPanel`, tips from `market.peekToday()`),
  `Busker` (`audio/BuskerTune`, tips via `SessionActions.pay`, 3 a day), `GarageSale` (one day in three, 2 to 4 of
  today's stock as bin-priced `ForSaleBox`es once the stock is drawn, else a sign pointing to the market).

## What is not done yet

1. **Bounds through walls.** Zone bounds are the room's extent; the `WALL_GAP` and the doorway belong to nobody. The
   hysteresis (0.4 m) covers the threshold.
2. **The street under the flat.** Walked all the way now (the stairs, then the sas: see "The sas"), but the street is
   still a place of its own at x 140 behind the sas's twin: putting it under the flat would make it the stairwell's
   neighbour, and its lights would join the flat's. Only the far row and our facade match the painted view; the painted
   street furniture (parked cars, lamps) is its own. The grade eases from `home` to `street` while the player stands in
   the street's twin (the look follows the zone).
3. **Session parts.** Done for the shelves: the Session's `shelving` is a `ShelvingGroup` of every flat zone handle's
   `shelving` (the collection room's first, leading the sort), so a new room with shelves needs no wiring.
4. **Audio.** Done: a dormant zone gets `setZoneActive(false)` (`zone/lifecycle.ts`): voices, screens, the CRT hiss and
   the cat's purr go silent; any travel also stops the playing screen (`Screens.stopActive` in `GoingOut`).
5. **Spawn / return.** Done: `player/PositionMemory` saves the zone, the floor point and the look (`bibliothek.position.v1`,
   wiped by New game), restores them on load (`?fresh` starts in the living room); never while seated, travelling or
   asleep, never onto the stairs. The keys are not saved: restored outside, they are in the bowl (the front door lets
   the player in from the landing anyway).
6. **Light count.** Lights change shader programs: any zone reachable on foot must be active whenever its neighbours
   are (a new room of the flat joins `FLAT`), and a light is never added, removed or given `castShadow` at runtime:
   dim it to 0 instead (the collection room hangs a shelf spot over every bookcase slot, `parked` until a bookcase stands
   there). `World.prime()` compiles every material with the flat's lights, at start-up; `Travel` calls
   `World.primeAsync()` behind the curtain for the zone it lands in, and the sas `World.prepareZone()` before the move.
