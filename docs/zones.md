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
  30 s unless it is `persistent` or one of the `keepRecent` (2) travel zones (lazy builders) left most recently: going
  back to the street from a shop is then instant (no rebuild, repaint, re-upload or recompile). `onZoneChange(listener)` subscribes (any number; returns the unsubscribe). A zone
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
`bathroom` and `bedroom` (back wall) and the `kitchen` (left end); with the `balcony`, Mrs Roux's two rooms (`annex`,
`annexStudy`: see "Mrs Roux's rooms") and the `stairwell` they make `FLAT`. The flat's front door at the corridor's right end is a real door (`hallway/FrontDoor`, locked from inside
without the keys from the bowl, self-closing) onto our landing: the stairwell (see "The stairwell"), whose street door
travels (fade, `Travel.go`) to the `street` (x 140, see "The street"), whose doors lead to the `arcade` (x 40), the
`market` (x 80) and the four walk-in shops (x 600, 615, 630, 645, clear of Front Street's far end: one `shop` kind, `SHOP_PLANS`), doorless halls with no neighbours, not persistent (rebuilt on return: the market's
stock is fetched again, cached per day). Each carries a `travel: { label, arrival, yaw }` in `WORLD_PLAN`; their exit
doors (`TravelDoor` with `shopfront`, as big as the street's door: 1.3, 1.4, 1.6 x 2.5, captioned with the street
they open on) travel back to the street. A travel door's leaf swings ajar onto a dark gap as the curtain falls, a
shop's bell bobbing on its spring, and is shut again when its zone comes back (`travel/doorSwing`); the street's shop
doors (`StreetDoor`) are real leaves too, frames in the shop's joinery colour round the painted glass. A
travel sounds like a door (`travel/travelSounds`: the latch, a shop's bell when either end is a shop, the arcade or
the market, the door shut on arrival) and crossfades the room's sound under its curtain (`audio/audioContext.duckScene`). In the flat every zone neighbours every other
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

## Mrs Roux's rooms (`src/world/annex/`, joined to the flat)

Our neighbour on the landing moves out and her flat becomes ours: the arc (her lines, the sale, the move, the works,
the joining) is `building/rouxMove`, docs/building.md "Mrs Roux's move". `?debug`'s furnished flat owns it, joined.

- **Two zones of the flat** from the start (`annex`: the room on the street, x 3.06..7.96, z -0.66..3; `annexStudy`
  behind it against the stairwell, z -3..-0.72; `annexPlan.ts`), persistent, declared before the stairwell (whose box
  spans theirs) so walking in from the collection room finds them first. Their lamps and windows are compiled with the
  flat whether bought or not: a purchase recompiles nothing. Both lamps start off; the study's back wall carries her old
  front door, locked (`OldFrontDoor`).
- **The opening** is `ANNEX_DOORWAY` in the collection room's right wall (z 2.3, 1.1 x 2.2, no leaf either side): cut in
  both shells from the start, walled up until `joined`. The collection room owns its look (`AnnexOpening`, placed by
  `furnishRoom`: plaster in the hole with a painted-over door's outline and a collider, the works' sheet, then the
  archway's architraves, lining and threshold). Its portal's door is `ANNEX_PASSAGE` (openness 0 till joined), so the
  `PortalCuller` never draws the annex from the living room before.
- **Bookcases**: once joined the collection room gives up its front-right slot (the opening) and its bookcase moves on
  along the chain (the bedroom's slot, then next door); `bookcasesIn` gives `annex` up to six (four in the room, two in the study), the bookcase's `max` is 10 with
  the `annex` owned (`HomeGood.until`, `HomeUpgrades.limit`). The overflow chains living -> bedroom (`ANNEX_OVERFLOW`) ->
  annex (`STUDY_OVERFLOW`) -> study; their arrangement ids are `annex` and `annexStudy`. A kit leans at the next empty slot.
- **Outside**: her two French windows are the flat's on the street's `ours` facade (`room: 'annex'`, lit of an evening
  while she lives there, dark once she has gone, then as the room is left) and on the balcony's `BuildingFront`.
- The cat's rooms include them (a visit there fails till the wall is down); a piece of furniture may be carried in.

## The stairwell (walked, not travelled)

`src/world/stairwell/`: the building's staircase from our landing (level with the flat, world y 0) down five storeys of
3.26 m to the entrance hall on the street's level (world y -16.3), east of the bedroom and behind the collection room's
right wall (map in `stairwellPlan.ts`). A zone of `FLAT` (persistent, always active: its lights are compiled with the
flat's) with no `Room`: `Staircase` (plaster shaft, stone landings, ten flights of nine steps round the well, the iron
balustrade, our landing's strip from the front door, the hall's cabochon tiles; walls and the well's sides are its
`colliders`), `Lift` (an iron cage the full height, a wooden car that stops on every landing, the player in it at
`liftSpeed` 3.5 m/s, ~6 s from top to bottom, folding gates (0.45 s) whose colliders come and go; at the two ends it
runs itself (`Lift.autoPilot`): idle elsewhere, it sets off for the player as soon as they stand on our landing or in
the hall (the front door opened, the sas crossed), folds its gate open when they walk up (on any landing), and leaves
for the other end 0.6 s after they step in (not again until the rider it brought has stepped out; sent off by itself
and they step back out, it stays). The floors between never draw it by themselves (the stairs run past them): their
landing's brass button calls it. The car's panel has a button a floor and sends it at once, even turning it on its way. Residents and the postman ride
it for real when it idles empty (`Lift.carry`: called to their landing, they step in, it rides, they step out; busy,
they fade at the gate and come out the ride's time later). Its hum and clank are on the world bus), `StairLights`
(a timer globe on every landing, each with its own sensor: lit `LIT_S` after the player, a resident or the postman left
it (`watch`), a relay clack at each switch, so a climb leaves a trail of landings going dark one by one; two shadowless
point lights fade from lit globe to lit globe near the player, reaching a storey and a bit (never the landing above or
below through the slabs), dimmed with their intensity, to 0 while nobody is here because lights ignore walls; a
hemisphere only while occupied; the skylight tinted by the sky and the weather), `StairWindows` (a courtyard window on
every half landing, the courtyard built in 3D through it: `outlook/`, docs/outdoors.md "Views onto the street"), what is heard (`stairSounds`: the hall's air, a TV, a piano or a dog behind a
neighbour's door while they are home, the street behind the street door; one-shots echo in the stone; the third step
of the 4th floor's flight creaks, `STAIRWELL_PLAN.creak`), the neighbours' doors (each in its resident's colour, with
its doormat and brass name plate, its knock line and sound: `STAIRWELL_PLAN.doors`; a knock is always heard, and nobody
answers while they are out), the floor names, the mailboxes (ours first, the residents' surnames, the concierge; our
flap, `OurMailbox`, hands over the day's post, read on the spot, and the mat at home then gets none that day:
`building/postCollected`, whichever comes first), and
at the street door the sas (see "The sas"). Underfoot: tiles in the hall and the sas, stone (`concrete`: `stone` is an
outdoor surface, it would splash on a rainy day) on the flights and landings. The menu's "Go home" lands in the
hallway (`HALLWAY_PLAN.arrival`); travel to the stairwell (the entrance hall, `STAIRWELL_PLAN.arrival`, in front of
the sas's glass door) is only the street's home door when the sas is not connected.
- **The player's ground.** `FirstPersonController.setGround(fn)` gives the floor's height under (x, z) for the feet's
  current height (`GroundHeight`): flights stack, so the surface is the highest one no more than a step above the feet.
  On a flight it is the tread's top under the feet (`Staircase.floorAt`, stepped), so the controller's easing and its
  dip stepping down make each step felt; the residents' feet follow the slope instead (a tread at a time they would hop).
  The stairwell's handle provides it (`StairwellHandle.ground`, world metres; the car's floor while inside), `bootstrap/world.ts`
  hands it to the player; everywhere else it leaves the feet where they are (0). The eye is `feet + height`, the
  collision probes are relative to the feet, and `Travel` passes the arrival's height (`setPosition(x, z, feet)`).
- **Bounds.** Its box (x 1.03..8.17, z -8.45..3.25, y -16.3..2.8) overlaps the living room's and the bedroom's corners at
  the flat's level, and holds Mrs Roux's two rooms (declared before it, so they are found first); harmless, since the
  current zone stays current while the player is inside it, and walls keep them apart. The cat's rooms leave it out;
  `PositionMemory` does not restore onto the stairs (a floor plan cannot say which flight), so a reload there wakes up at home.
- **Coming home** walking in through the front door counts for `Homecoming` (within 1.2 m of the door, as the teleport's
  arrival spot does): keys back in the bowl, the mail on the mat. From the landing the door always lets the player in.
- **People on the stairs.** `Neighbours` (the residents of `STAIRWELL_PLAN.residents`: out in the morning, home in the
  evening, a lift user or two) are only met while the player is in the stairwell (its occupancy): on entering, someone
  whose hour it is (or on an errand) comes out of their door and walks the flights down to the street door (`stairRoutes`:
  across the landings, down the middle of each flight), or in and up; nobody walks unseen, their day just says where
  they are. `StairWalker` is a `Walker` whose feet follow `Staircase.floorAt` and that fades at doors (the door's latch
  heard on the landing) and the lift's gate (the car rides for them when it is free, see `Lift.carry`). No colliders. They say
  hello in passing and chat when clicked. The `Postman` comes up in the lift onto our landing with the mail orders
  (`MailPost`), rings, and waits clear of the front door's swing.
- **The doorstep** (`hallway/Doorstep`, in `BuildContext.building` with the post, the swaps and their panel,
  `stairwell/building.ts`): the front door's `visitors` slot. Whoever rings (the postman; the friends through `also`)
  is answered by opening the door from inside, keys or not; notes slipped under the door land on the hall's mat. A
  neighbour with a swap going (`NeighbourTrades`) has their door on the landing open the swap panel.
- **The flat and the stairs hear each other** (`stairwell/flatHeard`, `noiseAndCat`). The stairwell has no `Room`, so its
  walls and slabs are not occluders: a straight ray from the flat's TV to a landing below would cross no wall. A
  `SoundRoute` (`SoundOcclusion.addRoute`) answers instead for every pair with one end in the flat and one in the stairwell:
  the walls from the flat to just inside the front door, the door's leaf (a wall shut, nothing open), and 0.8 of a wall a
  storey down the well (on our landing, the straight line if it is shorter). Every sound counts this way (the longplay's
  volume, the radio, the cat's miaows, the neighbours' doors heard from home). From inside the flat the building is heard
  through the floor and ceiling too (`building/throughWalls`, data `building/neighbourNoisePlan`): Mrs Moreau's piano and TV
  downstairs, the attic student's music some nights, steps upstairs; only while the player is in the flat, their neighbour
  in, the TV and the music silent in a power cut. `BuildingSpaces` says what is the flat and what the stairwell.
- **Noise after ten** (`building/noiseComplaints`): a loud flat at night gets A. Leclerc's broom, then his knock, then
  the syndic's notice: docs/building.md "Noise".
- **Who comes up to the door** (`stairwell/DoorVisitor`): one person per visitor (him; Mrs Dubois bringing the cat back,
  docs/cat.md "Out on the stairs"), up flight A from the half landing below ours to the postman's spot, knocking through
  the `Doorstep` (one caller at a time: they wait for the postman or a friend to be done), clickable on the landing too.

- **The stairwell's look** (`Staircase`, `stairFinish`, `StairRunner`). Light is baked in by position, not lit: the
  walls are one merged `wall` mesh whose vertices carry `aStair` (the floor lines under the wall: p + i·STOREY, linear
  between the stair's breaks, see `stairWalls`), so the shader knows the height over the floor (or the flight's slope)
  everywhere. That gives the two-tone paint (a dark dado to 1.1 m, a thin line, plaster above, `STAIR_PAINTS`), the
  creases at the floor, the soffit above and the corners, and the lower storeys a shade darker. The treads, the hall's
  tiles and the shaft's stone (`stairFloors`) get darker along the walls and under the last flight. They are worn pale
  and glossier where feet go: the middle of the flights (only on bare stone), the residents' line across the landings,
  the hall from the street door. The plaster has the walls' bump. A red runner with brass rods covers every flight (one
  merged mesh, the rods one `InstancedMesh`). The balusters are one instanced turned bar. There is a newel post with a
  volute at the foot, stepped cornices under every landing's ceiling, the shaft's top and the hall's, and the skylight's
  cast-iron frame and glazing bars under `StairLights`' glass. No light, no shadow, about four more draw calls.
- **The hall's life** (`stairwell/hall/hallLife`):
  - The building's notice board on the hall's west wall (`HallBoard`) is one canvas, repainted from `building/boardNotes`.
    Each feature pins its own source: the house rules and the residents' small ads (`building/houseNotes`), the
    meeting's agenda and minutes, the estate sale, the party, the quiet hours and so on. Clicking it reads them.
  - The ballot box under it opens the co-owners' postal vote (`CoproPanel`, `BuildingServices.copro`).
  - The concierge's lodge (`Lodge`) is behind the east wall. Seen through a window with a lace half-curtain, it has a
    glazed door with a LOGE plate and a sign while she is out ("Back at 3 pm", "On the stairs", "Closed"), and her
    Christmas box on the sill (`TipBox`).
  - Mme Pereira (`Concierge`, `STAIRWELL_PLAN.concierge`) stands behind the glass in her hours, mops a landing some
    mornings, and holds the cellar key (`building/keys`): docs/building.md "The concierge and the cellar key".
  - A timer button is on every floor landing's north wall (`TimerButton`). It lights every globe for the timer's time
    (`StairLights.pressTimer`), and its orange pilot glows while the landing is dark. Both are dead in a power cut.
- **The co-owners' meeting** (`building/coproMeeting`, `coproLook`, `MeetingSetup`): every 14 game days, voted by post
  at the ballot box; its results repaint the walls, recolour or lift the runner and show or hide the plants, bikes,
  mirror, doormat, fibre box and lift plate: docs/building.md "The co-owners' meeting".
- **Drawn only when seen.** The `PortalCuller` already hides the whole stairwell while the front door is shut and the
  player is in the flat (the hallway's portal carries the door), so its merged storeys cost nothing from home. The
  courtyard windows render the outlook only on their two panes nearest the eye (`StairWindows`, `LIVE`; the others,
  storeys away through the well, are frosted glass in the sky's colour), panes in one plane share one render, and the
  outlook frees its scene after 90 s undrawn (`OutlookView`, docs/outdoors.md).
- **Visiting the neighbours** (`neighbourFlat/visits`): past their friendship's `inviteAt` a knock while they are home
  travels into their flat (see "The neighbours' flats"; docs/building.md "Friendship"), and their door there leads back
  onto their landing (`travel/nextArrival`).
- **The estate sale** (`building/estateSale`, `world/estateSale`): Mr Lambert's games in the hall for 3 days from game
  day 25, once (`STAIRWELL_PLAN.estateSale`): docs/building.md "The estate sale".
- **The power cut** (`building/mains`, `blackout`, `stairwell/downAndDark`, `stairwell/powerCut/`): on some stormy
  evenings the building's circuit goes dark (the flat's lamps and screens, the lift, the globes, the cellars' bulbs),
  candles on the landings, the lift perhaps stranded with Mrs Moreau in it, a fuse to reset in the hall or the cellars:
  docs/building.md "The power cut". `?debug`: `bibliothek.blackout()`.
- **The endless stairs** (`stairwell/endless/`, data `endlessPlan`):
  - **When.** Some nights between 23:00 and 04:00 (0.3 of nights, drawn per night, a night being the game day it ends
    in), the player stands on our landing alone and sets off down. Then the flight under the 3rd floor leads back onto
    the 4th's.
  - **How.** Nothing is built for it. On flight A below the 3rd floor's landing, the player is moved up one storey onto
    the same tread (`FirstPersonController.shiftVertically`, wired through `StairwellHandle.connectPlayer` in
    `bootstrap/world.ts`). The building repeats itself storey for storey.
  - **As it goes on:**
    - plates over the two landings' floor names read wrong (4th/4th, then 5th/5th, then blank);
    - the globes only flicker (`StairLights.setHaunted`);
    - every tread creaks;
    - from the 3rd time round, a nameless grey door (`StrangeDoor`) stands on the lower landing: it knocks back, and
      a piano plays the 4th floor's tune backwards behind it;
    - the player's thoughts come as reactions.
  - **The way out.** Walking back up past the 4th floor, or taking the lift, ends it for the night. Anyone else on the
    stairs (a resident, the postman) ends it too, or keeps it from starting.
  - **Debug.** `?debug`: `bibliothek.endlessStairs()` makes tonight one, whatever the hour.

## The neighbours' flats (`src/world/neighbourFlat/`, travelled)

One lazy zone at x 320 for every flat the player is asked into: the same 6.4 x 5.2 m shell (parquet, mouldings, a
window without a sun light of its own, a pendant and its switch, a vestibule inside the door, a ticking clock, a TV with
its side table and two armchairs facing it), dressed by `FlatDressing` for whoever lives there (`visits.currentHost`,
persisted in `bibliothek.neighbourVisits.v1`): the walls in their paint (`Room.paintWalls`), their things
(`NeighbourHost.dressing`: the shops' static models of the flat's pieces, `buildPiece`, and decor entries, lights taken
out; their own `flatProps`: the budgies' cage, the piano, the Vectrex, a dog's basket, painted posters), their shelf
(`GameShelf`: their own games, drawn once from the index by their door's seed, `ShelfCopy`s with no tag and never for
sale: hovered "<who>'s copy", clicked the host tells its story (`NEIGHBOUR_FLAT_PLAN.shelfTalk`, the first print's
first); one of theirs comes home only through their swap, which the caption names), their favourite game by the TV (`FavouriteGame`: its longplay on their TV, watched together;
never for sale), and themselves (`HostWalker`, the stairs' look from their seed, in their armchair or standing at their
spot, chatting in turn; a click with their swap standing opens it). A host's things are built at their first visit and
kept (taken out of the zone, put back on the next): the zone's lights never change with the host, so nothing
recompiles. The zone is `unlisted` (`TravelPlan.unlisted`: never in the travel menu).
- **The window** shows what the host's real flat sees (`FlatOutlook`, the window's `glass`), not the panorama (its eye is
  our living room, the zone 320 m off): the street built in 3D through the glass (`outlook/`), seen from their floor
  (`landingY(k)`) on their side of the building (`NeighbourHost.side`: Mrs Roux and Mrs Dubois on Front Street, the
  others on the courtyard), where `NEIGHBOUR_FLAT_PLAN.outlook` puts the window. One view a side, built only once its
  pane is seen, freed like the others; a change of host moves the eye.

## A small ad's seller (`src/world/sellerFlat/`, travelled)

One lazy zone at x 520 (`unlisted`) for the private sellers of the paper's small ads (docs/economy.md "Small ads and the
seller's flat"): a 5.2 x 4.4 m living room in Park Corner Mansions, reached by the bell plate at the block's street door
(`street/MansionBell`: `Classifieds.arrive`, then `travel('sellerFlat')`) and left by its landing door back to Front
Street (`STREET_PLAN.arrivals.sellerFlat`). The shell (pendant, a window without a sun light, sideboard and set, two
armchairs, the dining table, the box of spares) is built once; the host's things (their kind's decor, the seller, the
lot on the table, their console, a scripted ad's note) are laid by a `Visit` prop the first frame it sees a new host
(`Classifieds.host`), the last host's taken away and freed: the zone may wake up dormant (`keepRecent`). No lights in
the host's things.

## The courtyard (`src/world/courtyard/`, reached by travel)

Our block's yard behind the building, walked: the same place the stairwell's windows look down on, built from the same
plan and classes (`COURTYARD_YARD`, `Courtyard`, the street's `Buildings` for the facades round it with their lit
windows' lives, `building/rearWindows`: docs/outdoors.md "Lives behind the windows"). A lazy zone at x 400
(`neighbours: []`, `unlisted`), so nothing of it is built while the player is in the flat. The way in is a travel door
at the foot of the stairs, on the shaft's east wall across the ground floor's landing (`STAIRWELL_PLAN.courtyardDoor`,
placed by `courtyard/courtyardDoor.placeCourtyardDoor`, kept out of the yard's chunk); the way back is our back door
(`COURTYARD_PLAN.backDoor`), arriving in front of the stairwell's (the stairwell's travel `arrivals.courtyard`).
- **Its frame** is the yard's middle (`COURTYARD_CENTRE`); every spot of `COURTYARD_PLAN` is in the street's frame, like
  `COURTYARD_YARD`, and the builder places the street's classes at `-COURTYARD_CENTRE` (`inYard` for one spot). The
  outdoor rig (`StreetLighting`, its sun's shadow), the `SkyDome` and the rain follow the camera from the zone's origin.
- **Bounds**: `StreetBounds` behind the facades, `YardBounds` for the workshop's back wall, the bins, shed, sandpit,
  bikes, rack and the chestnut's trunk. Underfoot the setts (`stone`), the lawn (`grass`).
- **What is there**: the concierge's pots by our door, the bags by the bins on bin day (one game day in seven).
- **The neighbours' party** (`building/neighboursParty`, `courtyard/NeighboursParty`): one game day in 28 and on the real
  Fête des voisins (the last Friday of May). From 14:00 the trestle tables, the residents' sale table (they buy games
  off the player: `WorldPanels.partySale`, a `SellPanel` with the party's buyer, docs/economy.md) and the old cabinet
  of the tournament are out, with the bulbs strung across the yard (`StringLights`: one merged wire and one instanced
  mesh of unlit glass); from 17:00 to midnight the residents are down (`Vendor`s with the stairwell's looks, their
  lines and the party's; a chat counts towards their `friendship` once a party), the bulbs and the party's one
  shadowless lamp come up, a radio and the chatter play. The hall's noticeboard pins the poster four days ahead
  (`partyNotes`, through `boardNotes`). What is set out is decided when the yard is built, and again at each new game
  day while the player is there (`today.onNewGameDay`): the tables, sale, cabinet, bulbs and sounds are cleared away
  when the party's day is over, or set out when a party day begins.
- **Hooks.** Another feature dresses the yard with `courtyard/huntHook.dressCourtyard((zone, spots) => …)`, called at each
  build with `COURTYARD_PLAN.huntSpots` turned zone-local: `chestnut`, on the trunk's bark facing our back door (the
  treasure hunt's carving).

## The cellars (`src/world/cellar/`, reached by travel)

The building's cellars, under the entrance hall. The hall's cellar door (`CellarDoor.cellarDoor`, a `TravelDoor` with
a guard) is locked until the concierge has given the player the key (`building/keys`). With the key it travels into
the `cellar` zone, at x 360 (`unlisted`: never offered by the menu). The player arrives at the foot of the stairs.
Clicking the steps (`StairsUp`) goes back up and sets the player down in front of the cellar door
(`travel/nextArrival`). There is no `Room`: the builder returns its light level and `concrete` underfoot.

- **The maze** (`cellarPlan.ts`: `MAP`, a 9 × 7 grid of 1.6 m cells). `CellarVaults` merges everything into two
  draws (brick, flags):
  - brick walls wherever an open cell meets solid ground;
  - a low groin vault over every cell, springing at 2.0 m with a crown at 2.45 m;
  - the stairs' tunnel with its steps and a door at the top.
  Light is baked into the vertex colours: damp-dark at the walls' foot, soot under the springs. The walls are its
  `colliders`, and so is the stairs' mouth (the stairs are clicked, not walked).
- **The storage boxes** (`CellarBox`, `CELLAR_PLAN.boxes`). Each has a slatted wooden front with a door, a padlock,
  and a tag with its number and the owner's name. Clutter shows through the slats. The fronts are colliders: boxes are
  reached into, never walked into.
  - Ours (No 5) opens once with the flat's key. The opening is saved.
  - Two abandoned ones hang open: No 2, and No 8, the late Mr Lambert's.
  - The rest are padlocked and say what is seen inside.
  - Each box with a `find` has a carton holding one game, drawn per box (`MarketStock.randomGames`, not owned). It is
    free: a `ForSaleBox` at 0 coins, bought as at a stall. Taken, it is gone for good (`cellarFinds`,
    `bibliothek.cellar.v1`).
- **The light** (`CellarLights`):
  - The player's torch is a shadowless spot held at the right hand and aimed where they look. It is always on and on
    batteries.
  - Six bare bulbs are on the timer. Any wall button (`TimerButton`, orange pilot) lights them all for 60 s. They are
    dead in a power cut.
  - Two shadowless point lights stand over the lit bulbs nearest the player.
  - A faint hemisphere is on only while the player is down here.
- **The rest:**
  - the boiler room in the dead end at (2, 2): `Boiler`, its hum, and the main fuse board (a `FuseBox`: a power cut
    is reset here too);
  - a `Rat` that scurries along the south passage now and then, squeaking;
  - water dripping from the vault (`cellarSounds`).
- **Hooks.** Another feature dresses the cellars with `huntHook.dressCellar((zone, spots) => …)`, called at each build
  with `CELLAR_PLAN.huntSpots`: `chalk`, a bare patch of brick in the dead end at (6, 0); `box5`, our box's floor.

## The attic (`src/world/attic/`, reached by the lift's code)

Our building is dressed stone with a slate mansard (`facadeStyle` seed 11), and the attic is the maids' rooms under
it. The zone stands where it would be, over the flat, one storey above our landing (world y 3.26). Its lift car is
right over the stairwell's. It is a travel zone (`unlisted`) with no `Room`. Its builder returns its light level and the
floor underfoot (tomettes in the corridor, boards in the collector's room).

- **Getting up.** Press the car's panel buttons in `ATTIC_PLAN.liftCode` order (4th, 2nd, 5th, 2nd, 1st, G), each
  within 6 s of the last, from inside the car (`stairwell/liftCode`, the ride itself `stairwell/liftAttic`). The car then goes to our landing, climbs 0.5 m
  past it with its lamp stuttering, and `Lift` asks the Session to travel to `attic`. Its default arrival is in the
  attic's car.
  - The code is scratched faintly under the car's mirror, and a resident (k 3) passes on the rumour.
  - When the stairwell loses its occupancy, the car parks back on our landing, shut (`parkFromAttic`). Its gate opens
    when the player comes back down.
  - If the co-owners voted the lift's overhaul (`coproChoice('lift')`), the car runs 1.5 times as fast and its gates
    no longer clank. The code still works.
- **Going down.** The attic's car (`AtticLift`) has one live button. The gate shuts and the motor groans. Then
  `travel/nextArrival` sets the player down in the stairwell's car on our landing.
- **The corridor:**
  - the maids' doors (`AtticDoor`), knocked for lines; the student's music plays behind No 6 (`MusicUpstairs`, the
    bass the flat hears through its ceiling);
  - the wardrobe across the service stair;
  - bare bulbs and one shadowless light (`AtticLights`);
  - the steel ladder to the roof hatch (`HatchLadder`, travel to `roof`).
- **The collector's room (Albert Vasseur's):**
  - **STARFALL**, his prototype cabinet: COMET DASH under a green phosphor skin (`Starfall`). It is an `atHome`
    cabinet (free, pays nothing), and its table is his own five scores (`CollectorScores`, kept with the arcade's under
    `starfall`). The first best over his top one leaves his prize at its foot, once: the grail `ATTIC_PLAN.prize`,
    taken as a `ForSaleBox` at 0. Already owned, the club pays coins instead (docs/economy.md).
  - his notebook on the desk;
  - sheeted furniture, a dusty shelf, framed magazine covers, cobwebs, dust motes in the roof windows' light;
  - the trunk (`CombinationChest`): four number wheels, each clicked on its own (`ChestWheel`). `chest.code` (1991, as
    the notebook hints) opens it and gives `chest.game`, a sealed copy with his note. **This is the end of the
    building's treasure hunt** (see "The sixth floor" below), which keeps this code and this game.
- **State** (`atticState`, `bibliothek.attic.v1`): `found`, `prize`, `chest`. A reload never restores the player up
  here (`bootstrap/player`: the restore puts the feet at 0). The player's ground up here is the zone's floor:
  `bootstrap/world` skips the stairwell's ground in the attic and on the roof, which both stand over its shaft.

## The roof (`src/world/roof/`, through the attic's hatch)

The zinc top of the mansard (world y 7.1: our six storeys' parapet, less `ROOF_FOOT`, plus the mansard's rise). It is
a travel zone (`unlisted`), reached through the attic's ladder and left through `RoofHatch` (back at the ladder's foot,
`attic/hatchArrival`).

- **The city round it** is the street's, laid in the street's frame (`ROOF_PLAN.street`): `StreetGround`,
  `StreetPark`, every facade and its roof (`Buildings`, its night windows following the residents), and `Roofscape`,
  a top behind each Front Street front so the blocks are not hollow seen from above. The light is `StreetLighting`
  centred on the player (one sun shadow, a hemisphere while occupied), with the street's `SkyDome`, rain and snow
  (`Precipitation`), and the wind (`RoofWind`).
- **The roof itself** (`RoofTop`): zinc with standing seams, a railing just inside the edges (its colliders keep the
  player on the zinc), three chimney stacks with their pots, duckboards, and the gable down to the lower roof next door.
  The pigeons on the chimney tops fly off when the player comes near (`RoofPigeons`). The fireworks over the park run
  on 14 July, 31 December and the small hours of 1 January (real date), 22:00 to past midnight (`Fireworks`: points
  drawn additive with the alpha kept, no light).
- **The aerial** (`Aerial`) turns a step per click, out of 16. Its meter swings with the signal. At each channel's step
  (`roof/channels`, `CHANNELS`) the channel is found for good (`bibliothek.aerial.v1`). The fibre's channel comes with
  the co-owners' fibre vote instead (`coproChoice('fibre')`). In the collection room, `ChannelDial` (an old tuner on
  the TV stand, shown once a channel is found) turns to the next found channel each click. The TV then shows that
  channel's longplay: one of its platforms' games, drawn by game day and two-hour slot (`showOn`, through
  `SessionActions.playOn`, which takes anything with a `game`). Past the last channel it switches off.

## The sixth floor (the building's treasure hunt, `src/building/hunt/`, `src/world/hunt/`)

The story: Albert Vasseur, a collector, lived in the attic, where no stair goes any more. His friend Henri Lambert was
his paperboy in 1961 and later became the 3rd floor's collector (the estate sale's Mr Lambert). Lambert kept the way
up, in pieces, round the building. On 24 December 1991 the two of them locked Albert's last good games in his trunk,
and Albert left for Lyon. The words are in `huntPlan.ts` (`HUNT`). The state is in `BuildingHunt.ts`, a module-level
store (`bibliothek.buildingHunt.v1`: the clues found, the day of the last). `world/hunt/placeHunt.ts` lays it out once
at boot (`bootstrap/world`). It stays apart from d7's prototype trail (docs/story.md): no post, no market, no radio,
no arcade, no friends' visits.

| Clue | Where, and how it is found | Needs | Gives |
| --- | --- | --- | --- |
| `letter` | Henri's note under the door from game day 4 (`HUNT.startDay`). Past his death (the estate sale's mourning), his niece's cover note instead | | Albert, the sixth floor, "the far end of the cellars" |
| `chalk` | Chalk on the cellars' far wall (`cellar/huntHook`, spot `chalk`), clicked. Fallback: his note with the chalk's words after 6 days | letter | the code's first half (4th, 2nd, 5th) |
| `mailbox` | A card in the nameless mailbox, the hall's bottom-right flap, clicked | chalk | the rest (2nd, 1st, G); "where he looked at himself" (the car's mirror) |
| `board` | His card on the hall's board (`boardNotes`, `onRead`), found when the board is read | mailbox | "under the chestnut" |
| `chestnut` | A.V. + H.L. 1961 carved in the courtyard's chestnut (`courtyard/huntHook`, spot `chestnut`), clicked | board | 24·XII·1991, "same number as the year" |
| `memory` | Mrs Roux (R. Haddad once she has moved out), at the first chat after the letter (`huntSays`, in `Neighbours.says` before her move's lines, so her move never hides it) | letter | "the year you lock your treasure away", 1991 |
| `cat` | A corner of his photo, the first time the cat brings something back (`cat/escapes.addCatFind`) | letter | "A.V. 1991" and the four-wheel padlock |
| `attic` | Reached through the lift (`atticState().found`) | | |
| `aerial` | A brass tag on the roof's aerial, read on finding a channel (`roof/channels.onChannels`) | attic | "A. VASSEUR · 6e · 1991" |
| `chest` | The trunk opened (`atticState().chest`, `ATTIC_PLAN.chest`: 1991, a sealed Super Mario World) | | Henri's thank-you, read a moment after the game |

- **Found** (`findClue`): saved, with a journal line (kind `hunt`). The "new lead" word comes at once, a moment later
  (after a resident's line), or not at all when the clue's card says it.
- **Seen** (`ClueMark`): a canvas face, shown only once the clue is open, and clicked to read its card. Read again,
  the card comes back.
- **The journal** shows the file (`huntFile`, through `JournalPanelOptions.files`): every clue in the player's words,
  and where to look next (vague). Once the trunk is open, the file reads "(solved)".

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
  (`TWINS`). In the hall, the far door and the door release (the brass DOOR button by the street door) cross; in the
  street, the release just opens the street door.
- **A crossing** (`AirlockLink.cross`): only from inside (`holdsViewer`); the live door swings shut behind the player,
  the release buzzes (`doorSounds`, at least 0.4 s; the leaves swing in 0.9 s, the glass door in 0.75 s) while `World.prepareZone` builds the other twin's zone and its
  neighbours if need be (loading a lazy builder's module first) and compiles them out of the scene, in a stand-in holding only their own lights (programs are
  cached per material, so switching back compiles nothing); the other twin's doors are shut at once, the player moved
  (feet on its floor: `setPosition(x, z, floor)`), the `ZoneManager` switches on its next tick, `World.primeAsync`
  compiles any straggler while the doors are still shut, the lock clacks and the other twin's live door opens. The
  street is built ahead: once the player is down the last two flights or in the hall, `StreetAhead` (`bootstrap/world`)
  builds it dormant and compiles it at idle moments, one zone per idle slice (`World.prepareZone`'s `between`: the
  street, then each of its neighbours, then the upload and compile) and holds it loaded while they stay
  down there (`ZoneManager.hold`), so the crossing only switches; climbing back up lets it go. `bootstrap/player`
  connects the link (`airlockLink.connect`); unconnected (a test page), a crossing falls back on travel (the curtain).
- **Sound.** The street's sounds (and the busker's tune) go through `outdoorsInput` (a low-pass and a gain before the
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
  calls `Zone.setOccupied()` on `onZoneChange`, which reaches every `OccupancyAware` item of the zone: the room's lit
  lamp and its sunny windows redraw their shadow maps regularly only while occupied (`lighting/ShadowRefresh`, at
  `QUALITY.shadowRefreshHz`: a point light's shadow is six passes), and twice a second, out of phase, otherwise, never
  while the lamp is off or their zone is undrawn (a refresh would render the hidden room as an empty map;
  `DrawnAware.setZoneDrawn` forces one when it is drawn again). A room's ceiling lamp has a finite range (2.5x its
  farthest corner, the shadow's `far` too). Beyond it the light adds nothing, but three.js still runs its lighting sums for
  every fragment, dark or not: that is the `LightCuller`'s job (`World.lightCuller`, `QUALITY.lights`). Each frame it keeps a
  fixed number of point, spot and hemisphere lights, the player's room first, then the zones drawn, lit and near before
  dark and far, and hides the rest. The counts never change, so nothing recompiles. Owners never set a light's `visible`.
  `?stats` in the URL logs fps, draw calls and the light count every 2 s.
- Shadow maps do not know about walls: a lamp renders every caster in range, the collection room's shelving included,
  even from behind a wall. So each zone has its own shadow layer (`Zone.shadowLayer`, set on everything placed in it),
  every shell and every door is also on `SHARED_SHADOW_LAYER` (`furnishShell`), and every shadow-casting light placed in
  a zone renders those two layers only (`Zone.adopt`). A lamp's shadow pass costs its own room, not the flat.
- Neither does the camera: three.js culls by frustum, not by walls, so from the corridor the whole flat behind its walls
  was drawn. `PortalCuller` (an `Updatable`, `bootstrap/world.ts`) walks the `Doorway.to` portals from the player's zone: a zone
  is drawn only if reached through open doors whose openings are in view (`Zone.setDrawn`). Undrawn zones keep their
  lights (removing a light recompiles every shader) and their doors (both rooms see a door); only their meshes hide,
  and their interactables leave the crosshair (the ray ignores `visible`). Measured in the corridor with the doors shut: 36 draw calls instead of 950.
  Their `Updatable` items tick at `UNDRAWN_TICK_HZ` (20), handed the time they missed (`Zone.tick`/`retime`): out of
  sight, 60 Hz buys nothing. A door (`seenFromNextDoor`) or an item with `tickEveryFrame` keeps every frame.
- `Zone.place` freezes the local matrices of the parts of an item nothing animates (`freezeStatic`: not `Updatable`, not
  clickable, no `dispose`, no light or skeleton, no `userData.live` part): composed once instead of every frame. The scene
  and every zone group never move (`matrixAutoUpdate = false`), so only what moves pushes world-matrix updates down. A
  live item whose parts never move on their own may merge them itself (`Plant` merges its foliage: the sway turns the group).
- Each zone takes a shadow layer (three.js has 32): `World.addZone` throws past 29 zones.
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
- A piece the zone holds without it being placed right now is handed over with `zone.keep(item)`: staged until bought
  (`build/owned`, hidden in the group) or taken out while unwanted (`build/presence`, out of the group). Unload calls its
  `dispose()` and, out of the group, `disposeTree` on it, so neither leaks.
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
walkable (`WALKABLE_AREAS`) from the park's railings to the roadworks at x 38 (from market day `WORKS_LIFT.afterGameDay`
the works move on to x 110, short of the side street: `details/roadworks.syncWorks`, called before the street is built,
moves `WALKABLE`'s end, and that stretch's shop doors get their clicks), down Park Street to its own roadworks at
z -47, into the bay at our corner, and in the park's hours (`parkGate.hours`) through its gate into the gardens behind
it (`PARK_WALK`, closed by a low hoop fence; the gate's leaves swing in and its box leaves `zone.collisions`, never shutting
on the player still inside). Walked past the zone's box (x ±40), the street stays the current zone: nothing else stands
there (the walk-in shops' zones are at x 600+, `PARK_WALK` keeps clear of the arcade's and market's at world z ±5). No
invisible wall: `StreetBounds` is a thin box behind every facade, the railings collide (`StreetFurniture`, with the
park's gate the walkers leave by), both roadworks (`details/roadworks.closures()`, one frame per closure) have hoardings
over the pavements and barriers over the parking lanes that collide, the works beyond (trench, plates, spoil, generator,
mesh fencing, amber lamps blinking at night: `StreetDetails`), and in the traffic lanes' gap a roadworker in his shift
(`details/Flagger`, `flaggerHours`: hi-vis, STOP/GO board, a collider across the lanes, a word in his bubble for anyone
walking up the road, the reason when clicked; gone home, a ROAD CLOSED board and two red portable signals stand there,
the collider stays). The layout is the painted
view's: Park Street runs south from a T junction at our corner with the park on its far side, the block across Front
Street closes its end (`fA`, `fB`), Front Street runs on east past the roadworks to a side street on our side and a
building across its end (x 136). The flat is our corner building's top floor (`FLAT_IN_STREET`): the painted view's
row across Front Street is painted from `FACADES` (`props/outdoors/Facades.paintFrontBlock`), so RETRO GAMES and its
neighbours are where the windows show them, and looking up from the street the flat's window and balcony are where
they are (`FacadeSpec.flat`, on every face the flat has: blank there when it has no window). Our building follows the
flat's footprint: Park Street's building line is the kitchen wing's outer face (x -19.26), the collection room's left
wall with its two windows stands 3.26 m back round the corner bay (`CORNER_BAY`, open to the roof, the kitchen wing's
blind front across its back, where the panes paint `KITCHEN_WING`), the kitchen's window is on the wing's side. Behind
it the block's courtyard (`COURTYARD`, the panes' `COURT_*`), closed on Park Street by a one-storey workshop so the
upper floors round it show: our back wall with the bedroom's frosted window and, in a light well, the bathroom's
(`frosted` windows), the neighbour's wing, the rear building. Walked into from the stairwell through the sas (see
"The sas"; our facade has a hole there, `FacadeSpec.openings`, which `StreetBounds` leaves open), or reached by travel from the arcade and the
market: `TravelPlan.arrivals` (keyed by the zone left) sets the player down in front of the door they came out of; the
arcade's and RETRO GAMES' `StreetDoor`s travel straight on (`SessionActions.travel(to)`, no menu; a `guard` may refuse:
RETRO GAMES keeps `SHOP_HOURS`).
- **Traffic** (`traffic/`): `StreetTraffic` is what road users agree on (the signalled crossing's cycle, obstacles
  drivers stop for, vehicles for the queues, `busAtStop`, the `sirens`, the road's `grip` from the weather). The
  driving rules are `driving.allowedSpeed` (the player, obstacles, the car ahead, red and amber at the lights, giving
  way at the plain zebra, pulling over for a siren behind; braking distances by `grip`; no closures a frame), shared by
  `StreetCars` (three car shapes, instanced per shape: one pool for parked and driving cars), `ScriptedVehicle`
  subclasses (`StreetBus` on a real-time floor, the `DeliveryVan` with its driver carrying crates in the morning and
  again after lunch, the same class as the parcel van (`cargo: 'parcel'`, `STREET_PLAN.parcels`), the `BinLorry`
  stopping at the bins morning and afternoon (`later`); standing, they are colliders and obstacles; an
  `EmergencyVehicle` (`Ambulance`, `PoliceCar`, `FireEngine`, one out at a time) takes either route, crawls through a
  red light and passes the drivers pulled over for it), `StreetBikes` (riders, racks) and `Motorbikes` (scooters,
  motorbikes, couriers in the car lanes, leaning into the bends: `twoWheelers.ts`). `SignalHeads` (unlit HDR lamps),
  `Spray` behind wet wheels.
  - **The cars** (`StreetCars`): each driver keeps its own pace, more of them in the rush hours (`city/traffic`
    `rushAt`). Now and then (`traffic.manoeuvres`) a parked car pulls out of its bay (indicator, then into the lane
    once it is clear) or a driver stops past a free bay, pulled aside so the traffic passes, and reverses in; never the
    stray cat's car, never with a parked car's middle within 7 m in front. Parked cars are solid through
    `zone.collisions` (their box comes and goes with them); `PARKED_CARS` stays the day's start, so the window view
    agrees at load. Taxis pull in at `STREET_PLAN.taxi.stops` to drop off or pick up `cars.fare` (a `Walker` placed
    by `furnishStreet`). A player standing in the road gets three toots, then a word in a bubble (`speaks`), and the
    driver swings out and creeps past.
  - **Lamps and wheels**: every vehicle's lamps are one `traffic/lampMaterial` (role per face from `carModel`'s
    `LampSet`: head, tail brighter when braking, indicators, reversing, plates and grille unlit), per instance
    (`lampState`) or one `setState`; tyres and their spoked rims turn about their axles in the vertex shader
    (`traffic/wheelSpin`). Car glass is tinted and see-through, with the cabin and a driver behind it; the road under
    each car, parked or driving, is darkened (`StreetCars` shades, `GROUND.carShade`). Instanced vehicles share one live
    bounding sphere (no `frustumCulled = false`). The bus keeps its own lamps and wheels (its geometry has no lamp roles).
  - **For the sound**: every `CarVoice` carries `kind` (`car`, `van`, `bus`, `lorry`, `bike`, `scooter`, `moto`,
    `courier`, `ambulance`, `police`, `fire`) and a `honks` counter, and may carry `braking`, `reversing`,
    `doorSlams` (a counter), `siren`, `model` and `taxi`. The cars' voices are a pool lent to whichever cars move.
- **People and animals** (`StreetCrowd`, `life/`): passers-by from door to door and down Park Street, crossing at the
  lights on the green man or at the zebra (then they are `RoadObstacle`s), fading in and out (alpha hash) at doors and
  over the last `fade` metres of `drawDistance`. Who walks is `life/crowdCast` (the regulars `crowd.seeds`, the game
  day's strangers, some old, a child by day or a friend beside someone, a dog or two, dressed for the season:
  `randomLook(seed, role, { season, age })`), made only when first sent out; how many follows `time/wakefulness`
  `streetBusyAt(hours, weekdayOf(gameDay))` (the rushes, Saturday, a slow Sunday; Sunday is the saleroom's day), the
  rain, the Grand Flea Fair (`boost`). In the rush most are commuters (`rushAt`: quicker, a phone); others stop at a
  shop window (`crowdTrips.windowStops` from the painted fronts, clear of `life/pavementClutter`), the newsstand, the
  busker, the Morris column (`crowd.attractions`); out of a shop they carry what they bought (`held.ts`: a bag, a
  baguette, flowers); by night pairs leave the bars (`night` routes). The painted doors open for them (`DoorGaps`, which
  also finds where the painter put a shop's door: the routes' ends snap to it) and only shop doors ring a bell; they
  keep right to pass each other and step round the player (`Walker` `crowd`), stop to answer a click (`stopsToTalk`)
  with lines by role (`streetTalk(role)`); the building's residents (`STAIRWELL_PLAN.residents`, `crowd.residents`) come
  out of our door at their hour and go home before theirs (nobody else uses our door). `StandingPeople` (on the phone,
  on the bench, a queue at the bus stop in the rush who board in turn, up to `alightMax` getting off); `Loiterers`
  (smokers outside the bars of an evening, neighbours catching up); `ShopQueue` (the bakery's morning queue);
  `Terraces` (tables out in opening hours and dry weather, `life/terraceWeather`, stacked otherwise; their colliders come
  and go through `zone.collisions`; customers walk up, are served by the waiter, leave; `seated(i)` for the chatter);
  `Pigeons` that take off (for dogs too) and coo; the dogs pull towards them and the `StrayCat` and bark.
- **Facades in relief** (`relief/`, `details/`): `Buildings.fronts` feeds 3D awnings (wound up at closing and at
  night: each folds towards its fixing in the vertex shader, its shadow too), balconies with the residents' pots and
  chairs, sills, door surrounds, the steps before the residents' doors, the downpipes and our balcony as bought
  (`FacadeRelief`, `HomeUpgrades`), the pharmacy's cross and the newsagent's diamond on brackets (`BladeSigns`), RETRO
  GAMES' and the arcade's fronts flush in relief (`shopfronts/LandmarkFronts`), interior-mapped shop windows
  (`ShopInteriors`: two looks per kind, someone inside while open; rooms only on low), roller shutters that roll down at
  closing (`Shutters`), light pools in front of open shops (`ShopGlow`), wet streaks, puddles and, on
  `QUALITY.reflections`, a masked `Reflector` hidden while dry (`WetGround`), autumn leaves (`Leaves`), manholes,
  hydrants, bollards, a Morris column and the roadworks (`StreetDetails`), the flickering lamp's buzz (`LampBuzz`).
  `snowCovered()` (`snowCover.ts`, uniform written by `StreetGround`) whitens up-facing faces of everything.
- **The walk-in shops' fronts** (`shopfronts/`, data in `shopfrontPlan`): their display windows stand 0.45 m out of
  the wall on stall risers (tiles, panels, enamel), the door set back between them on a mosaic step, pilasters, head and
  fascia mouldings per kind, a sign on a bracket, lines lettered on the glass, window displays behind it (TV sets in
  snow, the cat asleep, bouquets, an armchair under a lit lamp: `windowDisplays`), the door's OPEN / CLOSED card turned
  with `SHOP_HOURS` (`ShopfrontRelief`, colliding, also in the outlook). No shutter (`Shutters` skips them): the displays
  stay softly lit after closing. Through the glass `ShopInteriors` paints their real rooms (`relief/walkInInteriors`).
  What they put out on the pavement while open (`STREET_PLAN.shopSpill`, `ShopSpill`) collides only while out; keep it
  and the fronts clear of the crowd's lanes (SECOND HOME's moved the far lane to z 11.2). TV REPAIR's name is a neon
  (`STREET_PLAN.signs`; its board is painted bare: `ShopLook.signed`).
- **Shops** (`shops/`): `ShopEntrance` on every shop door along the walkable pavements (caption, `SHOP_HOURS`, a word,
  or an offer: the café's coffee = the market's coffee of the day plus the barista's tip, the newsagent's scratch cards in
  `ui/ScratchCardPanel`, a croissant, a lemonade and gossip); the furniture shop, the TV repair shop, the pet shop and
  the florist are walked into (`SHOP_ZONE_OF`: a `StreetDoor` to their `shop` zone, `src/world/shop/`, at x 600 to
  645 like the arcade: no neighbours, not persistent, arrivals in front of their doors; inside, the shop window
  lit by the sky sets the room's daylight and shows the street itself as its door looks out on it (`ShopWindow`: the
  street's own pieces built in 3D behind the glass, `outlook/`, docs/outdoors.md "Views onto the street": the row across
  Front Street, or Park Street and the park's trees, the cars going by), lettered with the shop's name in its street
  colours (`SHOP_LOOKS`); a clerk who goes off on chores, another customer now and then
  (never walking in while the player stands at the door), each fixture's sound from something there (the clock, the
  radio set, the budgies' cage, the tank, the TV wall), rugs on show soft underfoot, and price tags bought in two
  clicks, faded when the wallet is short),
  `DroppedCoins` (a few a day), `GiveawayBox` (some days, one free worn game once the stock is drawn), `Trader` (Victor
  Crane, the rival collector, some days, with copies taken off the market's stalls: buy, haggle, swap; his state is
  `economy/rivalCollector`). Coins go in through `BuildContext.money.purse`. See `docs/economy.md`.
- **Sound** (`StreetSound`, `audio/`): every street sound is a `SoundGraph` (its master into `streetBus.streetInput`:
  `outdoorsInput` plus the facades' faint slapback; every looping source kept, all stopped on dispose and while the zone
  is dormant, `setZoneActive(false)`, rebuilt on the next update) placed by one `StreetEar` (side by `stereoPan`, behind
  the head duller by `rearOf`, through `SpatialOut`). `StreetSound`: the rumble, rain (giving way under a shelter to
  `RainOnRoofs`' drumming and drips), wind, sirens far off, church bells on the hour (8:00 to 21:00), the birds by
  season and hour (`StreetBirds`: dawn chorus, summer swifts, winter robins and crows, none over snow but the hardy),
  and one `VehicleVoice` per road user (engine by kind and model through its gears, Doppler, wet tyres and puddle
  splashes; bikes a freewheel and a bell, never an engine; `roles` marks the bus, van and lorry for their air brakes,
  doors (`traffic.busAtStop`), crates, compactor and bins). `ShopSounds`: the arcade's door, cafés and bars (a jukebox's
  bass through the bars' doors from 18:00, `BarMusic`), their terraces (`life/terraceWeather`, the tables' own rule;
  `seated` for who sits there), the laundry, and `ring` for `onDoor` (a shop's bell, a house door's latch and thud).
  `StreetCues`: wings and coos (`coo`), barks (`barkers`, `barkAt`), the stray's `meow` and `catHiss`, the crossing's
  beeper, shutters, each siren of `sirens` (own `tones`). `PeopleSounds`: the walkers' footfalls (`playFootfall` on
  `streetSurfaceAt`) and a murmur by how many are about. `RoadworksSound`: generator, hammer, reversing beeper and
  shovel in working hours (`weekdayOf`: none on Sunday, Saturday mornings). `BuskerTune`: his own tune plus four of the
  real day's, a pause between songs (`betweenSongs`).
- **Rig instead of a shell** (`StreetLighting`): a shadow-casting `DirectionalLight` from `sky.outdoors.lightDirection`,
  shadow camera a square around the player snapped to texels, its map redrawn at `QUALITY.shadowRefreshHz` while occupied (`lighting/ShadowRefresh`); a `HemisphereLight` only while occupied; it overrides
  the scene's `Haze` fog every frame with the weather's (`streetAir`), and returns `lightLevel` in its handle (what
  `zoneHandle.lightLevelOf` reads when there is no `room`). `SkyDome` (radius 90, inside the camera's 100 m far plane, drawn last of the opaque things on the far plane with the depth test on, so only where the sky shows) draws the sky,
  with the window view's towers on its horizon (`SkylineSilhouette`: `city/SKYLINE` seen from the player, a 1D texture
  re-baked on the CPU every 0.5 m walked) and the neighbourhood's nearer blocks ray-cast in front of them
  (`city/skyline` `BACKDROP_BLOCKS`). Past the shadow square (laid ahead of where the player looks) the rows' far shadow
  is analytic (`shadowFade`, `lighting.far`), so the far end of the street is shaded too.
- **The same as from the windows**: everything the painted view shows of the street comes from `src/world/city/`
  (docs/outdoors.md "One neighbourhood, two pictures"): each facade's look is `city/facadeStyle` from its plan `seed`
  (`facadePainter`; a sloping roof in that style is built behind its parapet by `Buildings`, its band painted over the
  facade's in the atlas), the trees are `city/trees`, the parked cars `city/parkedCars`, the small print
  `STREET_PLAN.details`. A new thing in the street goes into `streetPlan.ts` and, if the windows see it, is painted from
  there (never a second list of positions).
- **Cost**: every building face is one mesh with a canvas atlas (`Buildings`: `paintFacade` and its roof, the party
  walls' own slots, night windows on a quarter-size emissive atlas, each light repainted alone with its room behind it
  and only its rect uploaded (`city/regionUpload`), curfews as the painted view, shops by `SHOP_HOURS`), what stands on
  the roofs one more (`RoofClutter`, from `city/roofFurniture`; our own roof is `world/roof`'s); lamps, trees, cars are
  instanced; four point lights move to the lamps nearest the player (never added or removed). People are the costly
  part (~33 draw calls each): whatever is built, the `PeopleBudget` draws only the nearest `crowd.budgetByQuality`
  (6 / 10 / 13; every walker placed through `placeWalker` with `fade` joins it, the rest ease out, `Walker.setAllowance`:
  the crowd, the standing, terraces, queues, loiterers, roadworkers, the vans' drivers, the collector), no shadows of their
  own, culled once faded beyond 40 m; a faded-out walker is not posed (`Walker.update`). The busker culls himself past
  40 m. Building the street is steps (`furnishStreetSteps`, a generator yielding between its sections; `furnishStreet`
  runs them at once): got ready from the stairs (`World.prepareZone` with `between`), `Zone.buildSliced` spreads them over
  idle moments; an activation meanwhile finishes them.
- **One scenery, two scenes** (`streetScenery.ts`): the ground, park, facades (`buildStreetBase`), their relief, landmark
  fronts, bracket signs, shopfronts, shutters and glow (`buildStreetFronts`), the lamps, trees, cars and furniture
  (`buildStreetFixtures`) are built by the same calls in the street (`zone.place`) and behind a window
  (`outlook/streetOutlook`, `scene.add`); only the options differ (the lamps' real lights, colliders, manoeuvres, the
  gate's hours). Anisotropy follows `QUALITY.anisotropy` (`sceneryAnisotropy`).
- **Finding the way, riding, sitting** (`wayfinding/`, `details/BenchSeats`, `STREET_PLAN.busRide`, `WAYFINDING`): a
  fingerpost by our door (an arm per place, pointing at it), the "you are here" plan on the wall by the residents' door
  (painted from `FACADES`; clicked, the directions with each shop's hours), a pillar clock by RETRO GAMES keeping the game's
  time (clicked: the time, what opens or shuts soon), the bus stop's pole and timetable (clicked: how often, when the next
  is due from `StreetBus.dueIn`). Line 38 is boarded while its doors stand open (`StreetBus` is `Interactable`: the fare
  through `SessionActions.pay`, then `travel` to the first of `busRide.destinations` open now, the Old Market Hall in
  RETRO GAMES' hours; shut, the caption says when the first bus there runs; its hitbox is only raycast while it has a
  caption). The benches and
  the shelter's bench are `BenchSeat`s (`Seating`; the reader's bench is taken while they sit).
- **What's on, the Fair** (`events/`): a bill on the Morris column and the shelter's lit poster (`WhatsOnBills`, its `ad`
  handed to `StreetFurniture`) read `whatsOnItems` (the next Grand Flea Fair, today's arcade challenge, the Saturday
  tournament), repainted as the market day turns, clicked for the details; on the Fair's day (`isBrocante`) `FairDay` slings
  bunting across the street by RETRO GAMES, hangs a banner and an A-board, and has a few people waiting at its door.
- **The park** (`StreetPark` + `StreetParkFeatures`, `city/park`): the pond in its stone kerb with the fountain, the
  bandstand, the playground, the willows, the far shrubbery where the lawn ends (`LAWN_REACH`), as the window view paints
  them; in the walkable street (`walkable`) the gardens' fence, trees and playground frames collide.
- Extras: `Newsstand` (THE GAMING WEEKLY, `ui/NewsPanel` through `openPanel`, tips from `market.peekToday()`),
  `Busker` (`audio/BuskerTune`, tips via `SessionActions.pay`, 3 a day), `GarageSale` (one day in three, 2 to 4 of
  today's stock as bin-priced `ForSaleBox`es once the stock is drawn, else a sign pointing to the market).

## What is not done yet

1. **Bounds through walls.** Zone bounds are the room's extent; the `WALL_GAP` and the doorway belong to nobody. The
   hysteresis (0.4 m) covers the threshold.
2. **The street under the flat.** Walked all the way now (the stairs, then the sas: see "The sas"), but the street is
   still a place of its own at x 140 behind the sas's twin: putting it under the flat would make it the stairwell's
   neighbour, and its lights would join the flat's. The painted view and the walkable street share one neighbourhood
   (`src/world/city/`, docs/outdoors.md "One neighbourhood, two pictures"): the rows, trees, parked cars and lamps the
   windows show are the street's own, derived from the same plan. The grade eases from `home` to `street` while the player stands in
   the street's twin (the look follows the zone).
3. **Session parts.** Done for the shelves: the Session's `shelving` is a `ShelvingGroup` of every flat zone handle's
   `shelving` (the collection room's first, leading the sort), so a new room with shelves needs no wiring.
4. **Audio.** Done: a dormant zone gets `setZoneActive(false)` (`zone/lifecycle.ts`): voices, screens, the CRT hiss and
   the cat's purr go silent; any travel also stops the playing screen (`Screens.stopActive` in `GoingOut`).
5. **Spawn / return.** Done: `player/PositionMemory` saves the zone, the floor point and the look (`bibliothek.position.v1`,
   wiped by New game), restores them on load (`?fresh` starts in the living room); never while seated, travelling or
   asleep, never onto the stairs, the attic or the roof. Not saved outside a zone's box either: in the park's gardens or
   Front Street's opened stretch past x 40 the street stays current, but a reload puts the player back at the last
   spot inside it (growing the street's box there would take in the arcade's and the market's rooms). The keys are not saved: restored outside, they are in the bowl (the front door lets
   the player in from the landing anyway).
6. **Light count.** Lights change shader programs: any zone reachable on foot must be active whenever its neighbours
   are (a new room of the flat joins `FLAT`), and a light is never added, removed or given `castShadow` at runtime:
   dim it to 0 instead (the collection room hangs a shelf spot over every bookcase slot, `parked` until a bookcase stands
   there). `World.prime()` compiles every material with the flat's lights, at start-up; `Travel` calls
   `World.primeAsync()` behind the curtain for the zone it lands in, and the sas `World.prepareZone()` before the move.
