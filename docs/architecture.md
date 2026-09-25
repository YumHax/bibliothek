# Architecture

First-person 3D game collection room. three.js + Vite + TypeScript, no framework. Units are metres,
real scale (NES box 0.127 x 0.178 x 0.025, eye height 1.7). Axes: x right, y up, z towards the spawn.
Walls as seen from the spawn: back = -z (shelves, door), front = +z, left = -x (TV), right = +x (projector).

## Layers, outermost first

| Layer | Files | Role |
| --- | --- | --- |
| Plan (data) | `src/world/worldPlan.ts`, `src/world/roomPlan.ts`, `src/world/<kind>/<kind>Plan.ts` | `WORLD_PLAN`: the zones and how they connect; `ROOM_PLAN`: every position in the collection room; one plan per other room (hallway, bathroom, bedroom, kitchen). No three.js at runtime. |
| Layout | `src/world/layout.ts`, `src/world/shell.ts`, `src/world/<kind>/furnish<Kind>.ts` | `ZONE_BUILDERS` / `furnishRoom()` and the per-room builders read the plans and build a zone; the only places that wire props together. `furnishShell()` is the common start (Room + sky + doors). |
| Zones | `src/world/zone/`, `src/world/World.ts`, `src/world/Sky.ts` | `Zone` (load/unload unit, zone-local coordinates), `ZoneManager` (current + neighbours active), `Sky` (the one clock + outdoors). See docs/zones.md. |
| Furniture | `src/world/**`, `src/world/props/**` | Classes: `Furniture` (+ `Interactable`, `Updatable`). Know nothing about the plan or the session's rules. |
| Engine | `src/core/`, `src/player/`, `src/input/`, `src/interaction/` | Loop, input, collisions, raycast. Never touched for content. |
| Rules | `src/game/` | `Session`: what clicks and keys do. Reaches features through `SessionParts` interfaces. |
| Data | `src/catalog/`, `src/collection/`, `src/covers/`, `src/video/`, `src/economy/`, `server/`, `api/` | Games, platforms, art, longplays, money and stock. |

## Folder map

```
src/main.ts             construction only: engine, providers, collection, world, player, input devices, interaction, UI, session
src/core/               Engine (renderer at pixel ratio <= 1.5, loop gated by a GPU fence so a slow frame throttles the loop instead of
                        drowning Firefox's GPU process, Updatable registry, LayerRenderer hook), Input (held keys + onPress, virtual keys/axes),
                        Collider (CollisionWorld: AABB set, add/remove), CssLayer, PerfLog (`?stats`: fps, draw calls, lights per 2 s)
src/graphics/           quality (QUALITY: low / medium / high, `?quality=`), PostFx (HDR target, SSAO, depth of field, bloom, light meter,
                        tone map + grade), grade (Look per zone), Environment (PMREM reflections), Haze (fog per look); see docs/graphics.md
src/player/             FirstPersonController (yaw/pitch, sliding collisions against CollisionWorld only, sit/stand, crouch Shift, sprint double-tap
                        forward), PointerLockFlow (start card <-> lock; modes pointer | gamepad | touch)
src/input/              Gamepad (standard mapping -> virtual keys + synthetic mouse), TouchControls, SyntheticMouse, deviceDetect
src/game/               Session (rules + click/key routing), SessionParts (structural interfaces of optional features), SessionActions
                        (what an Interactable may ask), Highlighter (emissive pulse), playerPose, Sleep (fade, wind the clock to 7:00, fade back)
src/interaction/        Interactable (hitboxes + label + activate), Interactor (crosshair raycast -> owner), Inspector (carry/rotate/return/open)
src/world/              World (scene + CollisionWorld + live interactables + zones: addZone/zone), Sky (DayNight + Weather + Outdoors, ticked once), worldPlan (WORLD_PLAN,
                        WALL_GAP, SUN_ROTATION_Y), roomPlan (ROOM_PLAN, DOOR_LEAF), Placement (floor/ceiling/corner/wall -> position+yaw), layout (BuildContext,
                        ZoneHandle, roomOf, furnishRoom, ZONE_BUILDERS), shell (furnishShell: Room + sky + owned doors), Room (a Furniture: walls cut by doorways,
                        opaque-wall shadow casters, colliders, setDaylight/setSkylight/setLampOn/setOccupied), Furniture (footprint, colliders, dispose?), Seat,
                        GameBox, Television, Projector, Shelf, meshUtils (boxMesh, cylinderMesh, invisibleHitbox), Parquet
src/world/hallway/      hallwayPlan (HALLWAY_ROOM, HALLWAY_PLAN) + furnishHallway: the corridor (console + mirror, keys the front door asks
                        for, coats, shoe rack, noticeboard, sconces, entrance door, runner / bought kilim), Homecoming (keys back in the bowl,
                        the mail on the mat when the player comes home), mail (which flyers a day brings)
src/world/bathroom/     bathroomPlan + furnishBathroom (running tap, flush, bath that fills and drains, mirror cabinet, hex-tiled floor)
src/world/bedroom/      bedroomPlan + furnishBedroom (bed made or slept-in by the hour, sliding drawers, reading corner, night light)
src/world/kitchen/      kitchenPlan + furnishKitchen (cabinets, oven and fridge that open, kettle, toaster, radio, roller blind, calendar)
src/world/strays/       StrayGames (a few owned games lent off the shelves each day to spots round the flat), StrayBox (one of them, lying
                        cover-up: picking it up hands over its shelf box)
src/world/arcade/       arcadePlan (+ TICKET_GAMES / DEMO_CABINETS, the crowd's nav graph) + furnishArcade. The machines, each an
                        `ArcadeMachineLike` (SessionActions) and a `Station` (someone stands at it; a regular can `occupy` it):
                        ArcadeCabinet (CRT glass via crtScreen; attract loop with demo and best-run replay, playing / initials / over
                        / demo, fixed-step game, moving controls, TicketStrip, jingle, medal lamps, instruction card, glow pool, wear,
                        out-of-order days, a second stick for two players, a CabinetAttachment: LightGun, DancePad), Pinball (+
                        pinball/PinballSim, the 2D sim), AlleyRoller (the ball alley), ClawMachine (steer, drop, win a plush),
                        TicketMachine (what the newer physical machines share) with HoopShot (the basketball cage) and TicketWheel
                        (luck, a progressive jackpot). replay/ (Replay: the recorder and player, REPLAY_STEP; ReplayStore),
                        InitialsEntry (the three-letter screen), scoreTable (structural ScoreTable / TodaysChallenge / MedalBook),
                        MedalRow, InstructionCard, GlowPool, PrizeCounter (the prizes in its case; `wallBehind` for an attendant),
                        ScoreBoard (the top fives, paged), ChallengeBoard, LeagueBoard, ChangeMachine (works some days), Jukebox,
                        ArcadeCrowd (regulars coming and going by the hour and signing the board, the kid watching and taking player
                        two), ArcadeAmbience (murmur following the crowd + hum), payoutSim (the cabinet games on autopilot, for
                        `PAYOUT`), games/ (ArcadeGame contract with `takeSounds` / `autopilot` / `gun` / `demoable` / `setOpponent`,
                        BaseGame with its seeded `rand()`, Breakout, Invaders, Stacker, ArrowRush, Snake, Comets, Duel, StepBeat,
                        NeonSheriff, LexiPunk (its game in a web page, `RemoteScreen`), registry). See docs/economy.md
src/world/prizes/       prizeModel (a small model per PrizeKind), PrizeShelf (the bedroom's shelf of prizes, following the PrizeStore), the
                        prizes that live at home, hidden until won (ownedPrize): ArcadePoster, MoodLamp (bedroom), FeatherWand (calls the cat)
src/world/market/       marketPlan + furnishMarket, MarketStall (trestle table under a striped awning, `layout()`: a leaning row + a lying row),
                        ForSaleBox (GameBox + price tag, owns the click: hands the box over for inspection), BargainBin, OrderCounter (opens
                        the catalogue), BuyBackDesk (opens the sell panel), TransistorRadio, CrowdSound, stallTalk (stallholders' lines
                        from their table), HallRoof (iron trusses + roof light following the sky). See docs/economy.md
src/world/people/       PersonModel (the rig at real scale: hips/knees/ankles, waist, shoulders/elbows, neck; gait, breathing, arm
                        poses, head + eye gaze, blinking; each bone's pieces merged per material by `geometry.Parts`), body
                        (proportions, the trunk as superellipse rings following `TRUNK` for build and figure, tapered limbs,
                        hands with fingers), head (`headRadius(d)`: the skull and face sculpted radially, so hair and paint can
                        ask where the skin is; ears, hats, glasses), eyes (balls that turn, lids that blink), hair (shells over
                        the skin that feather at the hairline, long hair, bun, ponytail, full beard), shoes, faceTexture (the
                        head's canvas: flush, shade, stubble, brows, lips) and clothTexture (the trunk's canvas: trousers,
                        tee/stripes/flannel/hoodie/jacket/shirt, apron, weave; `paintCloth` for sleeves and legs), looks (seeded
                        looks by role: `randomLook(seed, 'vendor' | 'shopper')`), poses (arm angles: stand, crossed, hips,
                        think, pockets, play, cheer), Vendor (stands behind a stall, changes stance, meets the player's eye, clickable for a
                        line), Shopper (walks the aisle between `BrowseSpot`s, browses hand-at-chin, lingers; no collider), Walker
                        (walks a path it is given, stands in a pose looking at a point, says a word in a SpeechBubble; the arcade's
                        people, directed by `ArcadeCrowd`).
                        Placed by `furnishMarket` / `furnishArcade` from their plans; the camera (`BuildContext.listener`) is
                        the viewer.
src/world/street/       streetPlan (Front Street's map and every spot) + furnishStreet: an outdoor zone without a Room. StreetLighting
                        (sun, sky ambient, fog), SkyDome, StreetGround, Buildings (+ facadePainter: the facade atlas, night windows),
                        StreetLamps, StreetTrees, StreetCars (+ carModel; parked and driving), StreetFurniture, StreetDoor, StreetBounds,
                        Newsstand (+ gamingWeekly), Busker, GarageSale, StreetCrowd, Precipitation, StreetSound. See docs/zones.md
src/world/travel/       TravelDoor (a ShutDoor that asks the Session to travel, straight to `to` or via the menu), Travel (fade, teleport to
                        a zone's `travel.arrival`, or its `arrivals[zone left]`)
src/world/zone/         Zone (group at origin, place()/placeAt()/remove(), scoped collisions, empty/dormant/active, build/activate/deactivate/unload,
                        own shadow layer, portals, setOccupied/setDrawn), ZoneManager (Updatable: player position -> current zone, neighbours
                        active, unload after 30 s unless persistent), PortalCuller (Updatable: draws only zones seen through open doorways),
                        attach (placeWith / placeLeaves: furniture posed in a placed host's space; floorPointsToWorld)
src/world/screen/       VideoScreen (interface the Session drives), VideoSurface (message glass or CSS3D iframe cut-out, proximity volume
                        damped per wall in between)
src/world/acoustics/    SoundOcclusion (walls between the listener and a screen: a ray against the world's occluders, i.e. every loaded
                        room's walls and the door leaves; `proximityVolume` keeps `wallGain` of the volume per wall), PointSound (a
                        room's own sound: distance + walls -> an `AmbientVoice`'s level)
src/world/shelving/     Shelving (bookcases sized from the collection, `minBookcases` standing empty from the start, live rebuild, sort modes, one
                        ShelfLamp per bookcase unless `lamps: false`, explicit `layout` + buyable `capacity`, what does not fit -> `overflow`),
                        ShelvingGroup (the collection room's and the bedroom's shelvings as one for the Session), plan, slots, sort
src/world/materials/    shaderPatch (onBeforeCompile helpers), finishes (wood, fabric, plastic, scuffed), surfaces (walls, floor and
                        ceiling edges, floor wear), GlossyFloor
src/world/box/          BoxShell, Cartridge, Manual, LentTag, LidMotion, shellLayout, slabs
src/world/props/        Prop (base: empty footprint), decor (DECOR_KINDS registry + placeDecor), wallMount, SwitchableLamp (base of PendantLamp,
                        FlushLamp, FloorLamp, ShelfLamp), Door (hinged either side, swings out of the hanging room), ShutDoor (decorative), Window
                        (+Curtains), DayNight, Poster, PictureFrame, WallClock, WallSwitch (toggles a room's SwitchableLamp), Rug, ConsoleStand,
                        Console (+consoleStyles), Plant, SideTable, Cushion, Speaker, Sideboard, SmokeDetector, HallConsole, CoatRack, UmbrellaStand,
                        LeaningMirror, PedalBin, BathroomScale, SwingLeaf (a door that opens on a click: fridge, wardrobe, cupboards),
                        Parcel (bought games waiting in the hallway), BookcaseKit (buys the bedroom's bookcase), and the bathroom /
                        bedroom (Bed: get into it) / kitchen furniture. See docs/props.md.
src/world/props/outdoors/ The painted 360° view outside every window. See docs/outdoors.md.
src/world/weather/      Weather (spells of clear/cloudy/rain/snow in game hours, seeded by the date; wet and snowy ground). See docs/outdoors.md.
src/world/cat/          The cat: model, brain, nav, bowls, bed, scratcher, toy, settings. See docs/cat.md.
src/economy/            Wallet (coins + tickets, localStorage), pricing (every tunable number, deterministic prices), MarketStock (the day's
                        stalls and bargain bin, seeded by the market day), StockItem (a copy: price settling, haggle), MarketCalendar
                        (in-game days), MarketLedger (haggles, games sold to the market), haggle, ArcadeScores (the player's bests,
                        the top-five tables and initials, the regulars' entries), rivals (the tables' starting names), ArcadeDaily (the
                        day's challenge, whether the change machine works, the cabinet out of order), ArcadeMedals, ArcadeLeague (the
                        weekly league and the streak), Jackpot (the wheel's pot), PayoutStats (`?payout`), Prizes (the prize catalogue + PrizeStore, `bibliothek.prizes.v1`),
                        HomeUpgrades (furniture bought for the flat: the bedroom's bookcases and the `homeGoods` one-offs, localStorage
                        `bibliothek.home.v1`), homeGoods (HOME_GOODS: what the market's household stall sells; slots in the flat's plans)
src/audio/              audioContext (one lazy AudioContext; `startedAudioContext` for sounds nobody clicked for, `unlockAudioOnFirstGesture`),
                        ChipSpeaker (an arcade machine's chip sounds, level and pan following the camera), CrtSpeaker (old TV speaker bed following the video's loudness), CatVoice,
                        CrowdMurmur (the market hall's chatter), RadioTune (a generated pop station), JukeboxTune (the arcade jukebox's
                        four generated stations), coins (a sale's clink),
                        ambient (AmbientVoice: FridgeHum, ClockTick, TapDrip), water (tap, flush, bath), kitchenSounds (kettle, toaster),
                        flatSounds (neighbours, stairwell, radiator ticks), alarm (the wall clock's beep), StreetAmbience (the street heard through the windows)
src/catalog/            types (Game, Platform, GameStatus), platforms (6: sizes, accent, libretro repo), seed data per platform -> SEED_GAMES
src/collection/         GameSource interface, CollectionStore (seed + localStorage `bibliothek.collection.v1`, import/export), LibretroIndex,
                        Deliveries (games bought while out wait in the hallway's parcel; `shelved` = the collection less the parcel,
                        `bibliothek.deliveries.v1`), GameList (a GameSource somebody fills: the shelving overflow)
src/covers/             CoverArtProvider chain, LibretroCoverProvider (via /api/art), BoxArtLoader (generated first, real art nearest-first), generated/
src/video/              VideoProvider, YouTubeSearchProvider (/api/youtube/search, localStorage cache), YouTubePlayer, proximityVolume, randomStart
src/ui/                 Overlay (title / pause menu: Settings via `addSetting()`, Controls by `group`), menu/ (menu.css: `.ui-btn`, `.ui-card`; nav), GamePanel, Toast, SearchBar, CollectionEditor (Tab; `canAdd` only with ?debug),
                        CataloguePanel (mail order, a modal like the editor), SellPanel (the WE BUY desk), PrizePanel (the arcade's prize counter, the mystery game), ArcadeScreenPanel (LexiPunk's
                        big frame, its score by postMessage), PayoutOverlay (`?payout`), TravelMenu ("Where to?", digits / click), WalletHud, Fader,
                        controls (key hints, grouped for the Controls tabs), styles.css (`--ui-*` tokens: colours, radius, fonts)
server/                 pure `(ApiRequest) => ApiResponse` handlers: youtubeSearch/longplaySearch, artCache/artStore/imageProcessing, libretroIndex; Vite plugins
api/                    Vercel functions wrapping the server handlers; vercel.json rewrites
```

## Key patterns

- **Plan -> layout -> classes.** Positions live in the plans (`ROOM_PLAN`, `<kind>Plan.ts`; zone-local); the builders
  (`furnishRoom`, `furnish<Kind>`) place things; classes build geometry. Never hard-code a coordinate in a class or in `main.ts`.
- **Everything lives in a `Zone`.** `zone.place(item, position, yaw)` / `placeAt(item, placement)` parents the item to the
  zone, records `footprint` + `colliders` as world AABBs and, while the zone is active, collides, ticks (`Updatable`) and is
  clickable (`Interactable`). `remove()` undoes it. The `ZoneManager` activates the player's zone and its neighbours only.
- **Collision is the `CollisionWorld` alone**: wall slabs (gaps at doorways), every furniture `footprint` and `colliders`,
  plus anything that moves (the door leaf swaps its own Box3 through `zone.collisions`, the zone's scoped view). The player
  is a 0.3 m sphere tested at knee (0.35 m) and waist height, so a footprint only needs its real height. A player
  already inside a collider is let out. The player holds the world set; furniture and the cat hold the `Collisions` interface.
  `Prop` has an empty footprint: decoration never blocks; give real furniture a real `footprint`.
- **Clickables implement `Interactable`**: `hitboxes` (use `invisibleHitbox` for thin/many parts), `label(player)`,
  `activate(session: SessionActions)`. The `Interactor` maps ray hits back to the owner; nobody else sees meshes. The ray
  stops at the nearest `Furniture.occluders` mesh (a `Room`'s walls, plumbed like interactables through `World.occluders`),
  so nothing is clickable through a wall.
- **Per-frame cost follows the player's zone.** `Zone.setOccupied()` (called by `main.ts` on zone change, and on
  `place()`) reaches every `OccupancyAware` item: a `Room` runs its scene-wide ambient only while occupied, and `Room`,
  `ShelfLamp` and `RoomWindow` re-render their shadow maps every frame only while occupied (every
  `IDLE_SHADOW_INTERVAL` otherwise, out of phase). Anything that adds a shadow-casting light should do the same. A zone's
  lights only shadow the zone's own layer plus shells and doors, and `PortalCuller` hides the meshes of zones not seen
  through an open doorway (see docs/zones.md). Draw calls are the budget: Firefox pays each one far more than Chrome.
- **Keys**: held via `input.isDown/axis`, presses via `input.onPress`; physical `KeyboardEvent.code` only. Gamepad and touch
  press virtual key codes on `Input` and dispatch synthetic mouse events, so `Session.bindInput` is the single router.
- **Optional features** reach the `Session` through structural interfaces in `SessionParts.ts`; main passes the concrete object.
  Full-screen DOM panels (editor, catalogue) are `ModalLike`: one open at a time, the Session releases the mouse and re-enters after.
- **Zones without doorways** (arcade, market) are reached by `Travel` (fade + `player.setPosition`); the `ZoneManager` finds the zone
  containing the camera and activates it, so a teleport needs no special casing. Their `WORLD_PLAN` entry carries a `travel` arrival.
- **The collection is a `GameSource`** (`games` + `subscribe`). `Shelving` rebuilds on change (reusing `GameBox` by id),
  the layout refreshes consoles and posters, the `CollectionEditor` mutates the `CollectionStore`.
- **Screens**: a `VideoSurface` cut-out mesh (alpha 0, `NoBlending`) over a `CSS3DObject` iframe in `CssLayer`, which sits
  behind the WebGL canvas (`alpha: true`). The Session only knows `VideoScreen`; one plays at a time.
- **Box art**: providers return per-face URLs, the resolver merges (first URL wins), `BoxArtLoader` generates missing faces.
  `GameBox` material order is BoxGeometry's `[+x, -x, +y, -y, +z front, -z back]`.
- **Lights are switched by clicking them** (`SwitchableLamp`); playing a video never touches them.
- **The cat** never blocks the player (empty footprint) and reads the room through `CollisionWorld` only.

## Data sources (key-less only)

- libretro-thumbnails (GitHub raw, CORS `*`): `Named_Boxarts` (front), `Named_Snaps`, `Named_Titles`. No back or spine
  exists anywhere key-less; they are generated. Filenames are No-Intro names with the characters `& * / : \` < > ? \ |`
  replaced by `_`; stored in `externalIds.libretroName`. Dev goes through `/api/art/<repo>/<folder>/<file>.png`
  (`server/artCache.ts`, disk cache `.cache/art/`, 404s as `.missing` markers for a week; delete the folder to refetch).
- YouTube, no API key: `server/youtubeSearch.ts` fetches the public results page with a consent cookie and regex-parses
  `ytInitialData`. Fragile; keep all parsing in that one file.
- Wikipedia (search API + Wikimedia pageviews, key-less, identifying User-Agent required): `server/fame.ts` turns a
  game title into its article's monthly page views, the market's measure of fame for pricing (see `docs/economy.md`).
  `/api/fame`, disk cache `.cache/fame/` for a month.
