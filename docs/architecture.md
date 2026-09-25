# Architecture

First-person 3D game collection room. three.js + Vite + TypeScript, no framework. Units are metres,
real scale (NES box 0.127 x 0.178 x 0.025, eye height 1.7). Axes: x right, y up, z towards the spawn.
Walls as seen from the spawn: back = -z (shelves, door), front = +z, left = -x (TV), right = +x (projector).

## Layers, outermost first

| Layer | Files | Role |
| --- | --- | --- |
| Plan (data) | `src/world/worldPlan.ts`, `src/world/roomPlan.ts`, `src/world/<kind>/<kind>Plan.ts` | `WORLD_PLAN`: the zones and how they connect; `ROOM_PLAN`: every position in the collection room; one plan per other room (hallway, bathroom, bedroom, kitchen). No three.js at runtime. |
| Layout | `src/world/layout.ts`, `src/world/buildContext.ts`, `src/world/shell.ts`, `src/world/<kind>/furnish<Kind>.ts` | `ZONE_BUILDERS` / `furnishRoom()` and the per-room builders read the plans and build a zone from the `BuildContext`; the only places that wire props together. `furnishShell()` is the common start (Room + sky + doors). |
| Zones | `src/world/zone/`, `src/world/World.ts`, `src/world/Sky.ts` | `Zone` (load/unload unit, zone-local coordinates), `ZoneManager` (current + neighbours active), `Sky` (the one clock + outdoors). See docs/zones.md. |
| Furniture | `src/world/**`, `src/world/props/**` | Classes: `Furniture` (+ `Interactable`, `Updatable`). Know nothing about the plan or the session's rules. |
| Engine | `src/core/`, `src/player/`, `src/input/`, `src/interaction/` | Loop, input, collisions, raycast. Never touched for content. |
| Rules | `src/game/` | `Session`: a thin router over feature controllers (what clicks and keys do). Each controller declares its narrow parts; `SessionParts` is their union. |
| Data | `src/catalog/`, `src/collection/`, `src/covers/`, `src/video/`, `src/economy/`, `server/`, `api/` | Games, platforms, art, longplays, money and stock. |

## Folder map

```
src/main.ts             wiring only: a short sequence of `src/bootstrap/` calls; `late` holders for what is made after it is asked for
src/bootstrap/          the start-up, in order, each step returning a typed bundle: services (engine, input, settings, stores, art, sky,
                        market), world (`createWorld`: World + player; `buildWorld`: graphics, BuildContext, zones, ZoneManager + culler,
                        cat, prime, the ShelvingGroup of every zone handle's `shelving`; `startWhenReady`: loop + idle preload of the lazy
                        zones), ui (start card / pause menu + PointerLockFlow, HUD, every DOM panel, made before the world), player (travel,
                        sleep, PositionMemory, footsteps), input (crosshair, gamepad, touch, settings applied), session, debug (`?stats`,
                        `?payout`), late (`late<T>(name)`: a service made later; `get()` before `set()` throws naming it)
src/core/               Listeners (a multi-listener event: `add` returns the unsubscribe; replaces single `onX` slots), Engine (renderer at pixel ratio <= 1.5, loop gated by a GPU fence so a slow frame throttles the loop instead of
                        drowning Firefox's GPU process, Updatable registry, LayerRenderer hook), Input (held keys + onPress, virtual keys/axes),
                        Collider (CollisionWorld: AABB set, add/remove), CssLayer, PerfLog (`?stats`: fps, draw calls, lights per 2 s)
src/graphics/           quality (QUALITY: low / medium / high, `?quality=`), PostFx (HDR target, SSAO, depth of field, bloom, light meter,
                        tone map + grade), grade (Look per zone), Environment (PMREM reflections), Haze (fog per look), canvas (createCanvas,
                        toTexture, hashString, seededRandom; `covers/generated/canvasUtils` re-exports them); see docs/graphics.md
src/player/             FirstPersonController (yaw/pitch, sliding collisions against CollisionWorld only, sit/stand, crouch Shift, sprint double-tap
                        forward; `setGround`: the floor's height under the feet, for the stairwell's stairs and lift), PointerLockFlow
                        (start card <-> lock; modes pointer | gamepad | touch), PositionMemory (zone + spot + look saved across reloads)
src/input/              actions (ACTIONS: every keyed action -> codes, gamepad alias, touch button, Settings row, context; `isAction`,
                        markup / alias / touch-bar derivations), padButtons, Gamepad (standard mapping -> virtual keys + synthetic mouse),
                        TouchControls, SyntheticMouse, deviceDetect
src/game/               Session (thin router: builds the controllers, key route order, SessionActions facade), SessionHost (what a
                        controller may ask of the Session + KeyRoute), SessionParts (structural interfaces + CoreParts + the union of every
                        controller's parts), SessionActions (what an Interactable may ask). Controllers: ModalStack (the one open panel,
                        Tab / Esc), Hands (pick up, put back E, open O), Seating (sit, stand, sleep), Screens (TV / projector, one at a
                        time), GoingOut (travel doors + menu; stops the screen on leaving), ArcadePlay (coin, play, payout via
                        economy/arcadePayout, change machine), MarketCounter (the copy in hand: U B H R X O), Purchases (buyUpgrade, pay),
                        Browse (search, random pick, console focus, sort T, night N), CatCare (C; `callCat` words every cat call).
                        Highlighter (emissive pulse), playerPose, Sleep (fade, wind the clock to 7:00, fade back)
src/interaction/        Interactable (hitboxes + label + activate), Interactor (crosshair raycast -> owner; `onHoverChange` / `onSelect`),
                        Inspector (carry/rotate/return/open any `Carriable`, the shape of a `GameBox`; `onLookEnabledChange`)
src/world/              World<ZoneHandleById> (scene + CollisionWorld + live interactables + zones: addZone, `zone(id)` / `handle(id)` / `build(id)` typed by
                        zone id, `load` / `loadAll` for lazy builders, `onInteractableAdded` / `onOccluderAdded`...), zoneIds (`ZoneId`: every
                        zone's id, a leaf type), zoneHandle (`lightLevelOf`, `surfaceUnderfoot`: the current zone's handle), Sky (DayNight + Weather + Outdoors, ticked once), worldPlan (WORLD_PLAN,
                        WALL_GAP, SUN_ROTATION_Y), roomPlan (ROOM_PLAN, DOOR_LEAF), Placement (floor/ceiling/corner/wall -> position+yaw), buildContext (BuildContext
                        grouped: scene services + `collection` / `home` / `money` / `arcade` / `market`; ZoneHandle), layout (furnishRoom,
                        RoomHandle, ZONE_BUILDERS: eager or `lazy(() => import(...))`, `bindBuilder`, ZoneHandles / ZoneHandleById), shell (furnishShell: Room + sky + owned doors), Room (a Furniture: walls cut by doorways,
                        opaque-wall shadow casters, colliders, setDaylight/setSkylight/setLampOn/setOccupied), Furniture (footprint, colliders, dispose?), Seat,
                        GameBox, Television, Projector, Shelf, meshUtils (boxMesh, cylinderMesh, invisibleHitbox, eyePoseAt), Parquet
src/world/build/        builder helpers shared by the furnish*.ts files: heardBy/pointSound (hearing), followDaylight/followUpgrades/
                        showWhenUpgraded/curtainsToSkylight (follow, released on unload), placeRoomLight/placeClock/furnishDecor/placeStrayBox
src/world/hallway/      hallwayPlan (HALLWAY_ROOM, HALLWAY_PLAN) + furnishHallway: the corridor (console + mirror, keys the front door asks
                        for, coats, shoe rack, noticeboard, sconces, entrance door, runner / bought kilim), Homecoming (keys back in the bowl,
                        the mail on the mat when the player comes home), mail (which flyers a day brings)
src/world/bathroom/     bathroomPlan + furnishBathroom (running tap, flush, bath that fills and drains, mirror cabinet, hex-tiled floor)
src/world/bedroom/      bedroomPlan + furnishBedroom (bed made or slept-in by the hour, sliding drawers, reading corner, night light)
src/world/kitchen/      kitchenPlan + furnishKitchen (cabinets, oven and fridge that open, kettle, toaster, radio, roller blind, calendar)
src/world/strays/       StrayGames (a few owned games lent off the shelves each day to spots round the flat), StrayBox (one of them, lying
                        cover-up: picking it up hands over its shelf box)
src/world/arcade/       arcadePlan (+ TICKET_GAMES / DEMO_CABINETS / BREAKABLE, `machines`, the crowd's nav graph) + furnishArcade +
                        machineKinds (MACHINE_KINDS: plan kind -> physical machine). The machines, each an `ArcadeMachineLike`
                        (SessionActions) and a `Station` (someone stands at it; a regular can `occupy` it), all over a MachineRun
                        (the paid play: coin, keys, initials, end card count-up, labels, regulars' results, out-of-order days;
                        arcadeKeys, machineLines, machineParts: CHROME, paintMarquee, displayScreen, outOfOrderNote):
                        ArcadeCabinet (cabinetModel + cabinetArt: the body and its print; CabinetScreens: the CRT glass via
                        crtScreen and what goes on it; AttractLoop: title card, demo, best-run replay; GameRunner: fixed steps +
                        recording; CabinetControls: the sticks; medal lamps, glow pool, a second stick for two players, a
                        CabinetAttachment: LightGun, DancePad), Pinball (+ pinball/PinballSim, the 2D sim), ClawMachine (steer,
                        drop, win a plush), TicketMachine (the MachineRun as a base class) with AlleyRoller (the ball alley),
                        HoopShot (the basketball cage) and TicketWheel (luck, a progressive jackpot). replay/ (Replay: the recorder and player, REPLAY_STEP; ReplayStore),
                        InitialsEntry (the three-letter screen), scoreTable (structural ScoreTable / TodaysChallenge / MedalBook),
                        MedalRow, InstructionCard, GlowPool, PrizeCounter (the prizes in its case; `wallBehind` for an attendant),
                        ScoreBoard (the top fives, paged), ChallengeBoard, LeagueBoard, ChangeMachine (works some days), Jukebox,
                        ArcadeCrowd (regulars coming and going by the hour and signing the board, the kid watching and taking player
                        two), ArcadeAmbience (murmur following the crowd + hum), payoutSim (the cabinet games on autopilot, for
                        `PAYOUT`), games/ (ArcadeGame contract with `takeSounds` / `autopilot` / `gun` / `demoable` / `setOpponent`,
                        BaseGame with its seeded `rand()` and `keys` (KeyEdges: press edges), Breakout, Invaders, Stacker, ArrowRush, Snake, Comets, Duel, StepBeat,
                        NeonSheriff, LexiPunk (its game in a web page, `RemoteScreen`), registry). See docs/economy.md
src/world/prizes/       prizeModel (a small model per PrizeKind), PrizeShelf (the bedroom's shelf of prizes, following the PrizeStore), the
                        prizes that live at home, hidden until won (ownedPrize): ArcadePoster, MoodLamp (bedroom), FeatherWand (calls the cat)
src/world/collector/    furnishCollectorCorner (the collection room's part of the collector's book, from `ROOM_PLAN.collector`): CollectorsBook
                        (the binder on the sideboard, opens the book's panel), BrassPlaque (25 games, engraved again as the collection
                        grows), HomeVitrine (50 games: a glass display cabinet with the most valuable copies). See docs/economy.md
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
                        think, pockets, play, cheer, phone, lead, lap), `PersonModel.sit` / `enableFade` / `setOpacity`, Vendor (stands behind a stall, changes stance, meets the player's eye, clickable for a
                        line), Shopper (walks the aisle between `BrowseSpot`s, browses hand-at-chin, lingers; no collider), Walker
                        (walks a path it is given, stands or sits in a pose looking at a point, says a word in a SpeechBubble,
                        `fade` and `talk` options; the arcade's people, directed by `ArcadeCrowd`, and the street's).
                        
                        Placed by `furnishMarket` / `furnishArcade` from their plans; the camera (`BuildContext.listener`) is
                        the viewer.
src/world/street/       streetPlan (Front Street's map and every spot, `shopDoors()`, `FLAT_IN_STREET`) + furnishStreet: an outdoor zone
                        without a Room. StreetLighting (sun, sky ambient, fog), SkyDome, StreetGround, Buildings (+ facadePainter: the
                        facade atlas, night windows, `fronts` for the relief), StreetLamps (the flickering one), StreetTrees, StreetCars
                        (+ carModel: three car shapes, van, bus, lorry, bike), StreetFurniture, StreetDoor (`guard`), StreetBounds,
                        Newsstand (+ gamingWeekly), Busker, GarageSale, StreetCrowd, Precipitation (+ splashes), StreetSound (horns,
                        sirens, bells), snowCover (`snowCovered()`); traffic/ (StreetTraffic, driving, ScriptedVehicle, StreetBus,
                        ServiceVehicles, Bikes, SignalHeads, Spray), life/ (streetTalk, StandingPeople, Terraces, Pigeons, StrayCat,
                        Dog, Figure, fade), relief/ (FacadeRelief, ShopInteriors, Shutters, ShopGlow, WetGround, Leaves), details/
                        (StreetDetails, LampBuzz), shops/ (shopHours, shopPlan, ShopEntrance, scratchCard, DroppedCoins, GiveawayBox,
                        Trader), audio/ (ShopSounds, streetSurface). See docs/zones.md
src/world/stairwell/    stairwellPlan + furnishStairwell: the building's stairs from our landing to the entrance hall (Staircase with
                        `floorAt`, Lift, StairLights; the sas at the street door). See docs/zones.md
src/world/airlock/      the sas at the building's street door, built twice (the hall's, the street's): airlockPlan (SAS, TWINS), SasShell
                        (the room, baked by sasFinish: unlit, light in the vertex colours), SasDoor, Airlock (a twin's rules, placeAirlock,
                        sasBounds), AirlockLink (the pair and the crossing: prepare the far zone, move the player, open the far door;
                        `airlockLink.connect` in main), doorSounds (buzz, clack, thud). See docs/zones.md "The sas"
src/world/travel/       TravelDoor (a ShutDoor that asks the Session to travel, straight to `to` or via the menu), Travel (fade, teleport to
                        a zone's `travel.arrival`, or its `arrivals[zone left]`; loads the destination's module as the curtain falls),
                        stops (`travelStops`: the stops from `WORLD_PLAN`)
src/world/zone/         Zone (group at origin, place()/placeAt()/remove(), scoped collisions, empty/dormant/active, build/activate/deactivate/unload,
                        own shadow layer, portals, setOccupied/setDrawn; a builder may be a `LazyZoneBuilder`, `load()`ed before it builds),
                        ZoneManager (Updatable: player position -> current zone, neighbours active, unload after 30 s unless persistent;
                        `onZoneChange`; a zone still loading its module is switched to once loaded), PortalCuller (Updatable: draws only zones seen through open doorways),
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
src/world/box/          ClosedBox (a resting box: one mesh, one atlas), BoxShell, Cartridge, Manual (the openable box, built in hand), LentTag,
                        LidMotion, shellLayout, slabs
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
src/persistence/        One storage layer: safeStorage, KEYS (every key; `?debug` saves under `bibliothek.debug.`), PersistedStore
                        (`{ version, data }`, migrate chain, validate, defaults; unreadable data copied to `bibliothek.corrupt.*`),
                        batch (writes held and flushed together, put back on failure), onWriteFailure / onCorruptSave (emit only,
                        for a toast), onOtherTab (BroadcastChannel + `storage` event), BrowserCache (LRU + TTL, one key). See docs/economy.md.
src/journal/            Journal (the day's lines and sums per local date, 60 days kept, `note(kind, text, data?)` / `tally`), journalWatch
                        (`watchForJournal`: writes it from the wallet, collection, parcel, prizes and medals by diffing their counts),
                        upcoming (the market's round ahead). The notebook is `world/props/Notebook` on the hall console.
src/onboarding/         FirstDay (the guided first day: steps ticked by the stores and the zones, one tip per step and zone, persisted,
                        off for a save that predates it), firstDaySteps (the steps, the to-do lines, the tips per zone), ToDoNote (the
                        folded card on the hall console), StickyNote ("KEYS!" on the front door's leaf, `Door.attachToLeaf`), context
                        (`HomeNotesContext`: what the hallway reads).
src/photo/              PhotoMode (free camera on a leash, lens via `PostFx.setLens`, grades over the zone's look, guides, PNG capture;
                        `toggle` / `capture` / `handleKey`), PhotoHud (guides, card, flash; `body.photo-mode` hides the HUD), photoLooks,
                        frames, savePhoto. See docs/graphics.md ("Photo mode").
src/economy/            Wallet (coins + tickets), pricing (every tunable number, deterministic prices), Transactions (every buy / sell /
                        swap / lot / prize: validate, then apply and save together), calendar (local day keys), seeded (the RNG), MarketStock (the day's
                        stalls and bargain bin, seeded per platform and slot), StockItem (a copy: price settling, haggle), MarketCalendar
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
                        flatSounds (neighbours, stairwell, radiator ticks), alarm (the wall clock's beep), StreetAmbience (the street heard through the windows),
                        Footsteps (+ footSurface: a step by surface, wet and snowy outside), churchBells (the hour struck in the street)
src/catalog/            types (Game, Platform, GameStatus), platforms (6: sizes, accent, libretro repo), seed data per platform -> SEED_GAMES
                        (ids made canonical with `gameIdFor`; `canonicalGameId` maps the old hand-made ones), validate (isGame, readGame)
src/collection/         GameSource interface, CollectionStore (seed + `bibliothek.collection.v1`, import/export, addMany, lastChange), LibretroIndex,
                        Deliveries (games bought while out wait in the hallway's parcel; `shelved` = the collection less the parcel,
                        `bibliothek.deliveries.v1`), GameList (a GameSource somebody fills: the shelving overflow)
src/covers/             CoverArtProvider chain, LibretroCoverProvider (via /api/art), BoxArtLoader (generated first, real art nearest-first,
                        `load`/`release` refcount + the last 24 idle games kept, back sources only via `details()`), LoadQueue (cached
                        priorities, re-sorted by `setPriorityOrigin`), generated/ (faces, BoxAtlas)
src/video/              VideoProvider, YouTubeSearchProvider (/api/youtube/search, cached in `bibliothek.cache.longplay.v1`), YouTubePlayer, proximityVolume, randomStart
src/settings/           SettingsStore (`bibliothek.settings.v1`: look sensitivity per device, invert Y, FOV, mixer volumes, HUD aids, text
                        size, reduce motion, key bindings), apply (pushes every setting to the camera, devices, mixer, HUD, Input), bindings
                        (rebinding = swapping two physical keys), saveData (hasProgress / eraseProgress: `saveKeys()`, the save's keys but the preferences, caches and corrupt copies)
src/ui/                 Overlay (title: Continue / New game; pause: status, Go home, Collection; Settings in tabs via `addSetting(tab, …)`;
                        Controls by group and device; `confirm()` yes / no in the card), menu/ (menu.css: `.ui-btn`, `.ui-card`, fields;
                        MenuNav: arrows / D-pad for the menu, `registerPanel()` for every DOM panel, `initPanelNav`; ControlsScreen; zoneNames),
                        settings/ (GameSettingsForm, KeyBindingsForm, fields), keys (key names from the bindings and the keyboard layout,
                        `renderKeys('{KeyW} [Click]')`), GamePanel, Toast, SearchBar, CollectionEditor (Tab; `canAdd` only with ?debug),
                        CataloguePanel (mail order, a modal like the editor), SellPanel (the WE BUY desk), PrizePanel (the arcade's prize counter, the mystery game), ArcadeScreenPanel (LexiPunk's
                        big frame, its score by postMessage), PayoutOverlay (`?payout`), TravelMenu ("Where to?", digits / click), WalletHud, Fader,
                        NewsPanel (the newsstand's paper), ScratchCardPanel (the tabac's scratch card), JournalPanel (the notebook's
                        pages: today's sums and lines, the challenge, what is coming, the days before), ToDoNotePanel (the first day's
                        list, ticked), Overlay `addPauseButton(id, label, run)` (Journal, …), collector/ (CollectorBookPanel:
                        milestones, sets, value; valueChart),
                        controls (one help line per action: `keys` / `pad` / `touch` in the `renderKeys` markup, built from `input/actions`), styles.css
                        (`--ui-*` tokens: colours, radius, fonts; `reduce-motion`, `ui-scale-*` on <html>)
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
- **Per-frame cost follows the player's zone.** `Zone.setOccupied()` (called on zone change, `bootstrap/world.ts`, and on
  `place()`) reaches every `OccupancyAware` item: a `Room` runs its scene-wide ambient only while occupied, and `Room`,
  `ShelfLamp` and `RoomWindow` re-render their shadow maps every frame only while occupied (every
  `IDLE_SHADOW_INTERVAL` otherwise, out of phase). Anything that adds a shadow-casting light should do the same. A zone's
  lights only shadow the zone's own layer plus shells and doors, and `PortalCuller` hides the meshes of zones not seen
  through an open doorway (see docs/zones.md). Draw calls are the budget: Firefox pays each one far more than Chrome.
- **Keys**: held via `input.isDown/axis`, presses via `input.onPress`; physical `KeyboardEvent.code` only. Gamepad and touch
  press virtual key codes on `Input` and dispatch synthetic mouse events, so `Session.bindInput` is the single router.
  Which code does what is one table, `src/input/actions.ts` (`ACTIONS`): controllers test `isAction(code, 'buy')`, the gamepad
  aliases, the touch bar, the Settings rows and the help's keys come from it; text naming a key uses `actionKeyLabel(id)`.
- **Optional features** reach the `Session` through structural interfaces in `SessionParts.ts`; `bootstrap/session.ts` passes the concrete object.
  The Session is a router: each feature is a controller in `src/game/` with its own parts interface (added once to
  `SessionParts`), the `SessionHost` for shared moves, and an `onKey(code): boolean` registered in `Session.routes`, whose
  order is the key precedence (documented there). `SessionActions` stays the only surface world classes see.
  Full-screen DOM panels are `ModalLike` (`ui/ModalPanel`): one open at a time (`ModalStack`, subscribed with
  `addOpenListener`), opened through `SessionActions.openPanel` (hands emptied first); the Session releases the mouse and re-enters after.
- **Zones without doorways** (arcade, market) are reached by `Travel` (fade + `player.setPosition`); the `ZoneManager` finds the zone
  containing the camera and activates it, so a teleport needs no special casing. Their `WORLD_PLAN` entry carries a `travel` arrival.
  Their builders are `lazy` in `ZONE_BUILDERS` (a chunk each, fetched by `Travel` as the curtain falls, or at idle after start-up).
- **Zone ids are a type** (`ZoneId`, `src/world/zoneIds.ts`): doorways' and travel doors' `to`, the travel menu, `World.zone(id)`;
  `WORLD_PLAN` is checked against it both ways. A zone's handle is typed by id: `world.handle('bedroom')` is a `BedroomHandle`.
- **Events are lists** (`core/Listeners`): `onZoneChange`, `onHoverChange`, `onPick`... return an unsubscribe; nothing is a
  single assignable slot that a second listener would overwrite.
- **The collection is a `GameSource`** (`games` + `subscribe`). `Shelving` rebuilds on change (reusing `GameBox` by id;
  same games in the same order only restyles: status), the layout refreshes consoles and posters, the `CollectionEditor` mutates the `CollectionStore`.
- **Screens**: a `VideoSurface` cut-out mesh (alpha 0, `NoBlending`) over a `CSS3DObject` iframe in `CssLayer`, which sits
  behind the WebGL canvas (`alpha: true`). The Session only knows `VideoScreen`; one plays at a time.
- **Box art**: providers return per-face URLs, the resolver merges (first URL wins), `BoxArtLoader` generates missing faces.
  `GameBox` material order is BoxGeometry's `[+x, -x, +y, -y, +z front, -z back]`. A resting box is a `ClosedBox` (front +
  spines in one atlas, 1 draw); `Inspector` calls `GameBox.setInHand` to swap in the openable shell and draw the back, cartridge
  label and manual cover (freed when put back). Boxes on a `Shelf` cast no shadow: the shelf's instanced proxy does, on the
  zone's shadow layer only.
- **Lights are switched by clicking them** (`SwitchableLamp`); playing a video never touches them.
- **The cat** never blocks the player (empty footprint) and reads the room through `CollisionWorld` only.

- **Menus and panels.** Every DOM panel uses the tokens, `.ui-card` / `.ui-btn`, a focusable Close button and
  `registerPanel(root, { isOpen })` so the arrows and a controller walk it (A picks, B = Escape). A full-screen panel
  extends `ui/ModalPanel` (root `.ui-modal` + `--sheet` / `--centre`, open / close / toggle, `onOpenChange` + `addOpenListener`,
  keys kept from the window but Esc, `[data-autofocus]`, `registerPanel`; hooks `onOpened` / `onClosed` / `onKey` / `onSide`);
  stacking is the `--z-*` tokens in `styles.css`, never a raw number. Key names are never
  hard-coded: write `{KeyB}` through `renderKeys`, it follows the player's bindings and layout. Sounds connect to
  `ctx.destination` (the mixer's `world` bus) or `audioBus(ctx, 'screens' | 'arcade' | 'ui')`; a YouTube player is scaled
  by `channelVolume('screens')`.

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
