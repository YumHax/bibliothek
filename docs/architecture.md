# Architecture

First-person 3D game collection room. three.js + Vite + TypeScript, no framework. Units are metres,
real scale (NES box 0.127 x 0.178 x 0.025, eye height 1.7). Axes: x right, y up, z towards the spawn.
Walls as seen from the spawn: back = -z (shelves, door), front = +z, left = -x (TV), right = +x (projector).

## Layers, outermost first

| Layer | Files | Role |
| --- | --- | --- |
| Plan (data) | `src/world/worldPlan.ts`, `src/world/roomPlan.ts`, `src/world/<kind>/<kind>Plan.ts` | `WORLD_PLAN`: the zones and how they connect; `ROOM_PLAN`: every position in the collection room; one plan per other zone (hallway, bathroom, bedroom, kitchen, balcony, stairwell, airlock, street, arcade, market...). No three.js at runtime. |
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
                        TouchControls (the bar shows what works where the hands are: `setContext`), SyntheticMouse, deviceDetect,
                        lastDevice (the device last used, whatever the room's entry mode: key caps, "click / press A / tap", hints)
src/game/               Session (thin router: builds the controllers, key route order, SessionActions facade), SessionHost (what a
                        controller may ask of the Session + KeyRoute), SessionParts (structural interfaces + CoreParts + the union of every
                        controller's parts), SessionActions (what an Interactable may ask). Controllers: ModalStack (the one open panel,
                        Tab / Esc), Hands (pick up, put back E, open O), Seating (sit, stand, sleep), Screens (TV / projector, one at a
                        time), GoingOut (travel doors + menu; stops the screen on leaving), ArcadePlay (coin, play, payout via
                        economy/arcadePayout, change machine), MarketCounter (the copy in hand: U B H R X O), Purchases (buyUpgrade, pay),
                        Browse (search, random pick, console focus, sort T, night N), CatCare (C; `callCat` words every cat call),
                        Rearranging (M: the shelf box in hand into the gap aimed at, a bought piece of furniture carried about its room;
                        docs/furnishing.md).
                        Highlighter (emissive pulse), playerPose, Sleep (fade, wind the clock to 7:00, fade back)
src/interaction/        Interactable (hitboxes + label + activate), Interactor (crosshair raycast -> owner; `onHoverChange` / `onSelect`),
                        Inspector (carry/rotate/return/open any `Carriable`, the shape of a `GameBox`, back to its `home` when that
                        changed while in hand; `onLookEnabledChange`)
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
                        drop, win a plush; + claw/ClawSim, claw/clawModel), TicketMachine (the MachineRun as a base class) with
                        AlleyRoller (the ball alley; + alley/AlleySim, alleyModel), HoopShot (the basketball cage; + hoop/HoopSim,
                        hoopModel) and TicketWheel (luck, a progressive jackpot). ArcadeHall (the day's rules: play cost, challenge,
                        machine out of order, crowd limit, the attendant's news), hallStores (the jackpot and replays, made once),
                        a LightPool for the screens' glows (`ARCADE_PLAN.glowLights`). replay/ (Replay: the recorder and player, REPLAY_STEP; ReplayStore),
                        InitialsEntry (the three-letter screen), scoreTable (structural ScoreTable / TodaysChallenge / MedalBook),
                        MedalRow, InstructionCard, GlowPool, PrizeCounter (the prizes in its case; `wallBehind` for an attendant),
                        ScoreBoard (the top fives, paged), ChallengeBoard, LeagueBoard, ChangeMachine (works some days), Jukebox,
                        ArcadeCrowd (regulars coming and going by the hour and signing the board, the kid watching and taking player
                        two), ArcadeAmbience (murmur following the crowd + hum), payoutSim (the cabinet games on autopilot, for
                        `PAYOUT`), games/ (ArcadeGame contract with `takeSounds` / `autopilot` / `gun` / `demoable` / `setOpponent`,
                        BaseGame with its seeded `rand()` and `keys` (KeyEdges: press edges), Breakout, Invaders, Stacker, LeapFrog, Snake, Comets, Duel, StepBeat,
                        NeonSheriff, LexiPunk (its game in a web page, `RemoteScreen`), registry). See docs/economy.md
src/world/prizes/       prizeModel (a small model per PrizeKind), PrizeShelf (the bedroom's shelf of prizes, following the PrizeStore), the
                        prizes that live at home, hidden until won (ownedPrize): ArcadePoster, MoodLamp (bedroom), FeatherWand (calls the cat)
src/world/collector/    furnishCollectorCorner (the collection room's part of the collector's book, from `ROOM_PLAN.collector`): CollectorsBook
                        (the binder on the sideboard, opens the book's panel), BrassPlaque (25 games, engraved again as the collection
                        grows), HomeVitrine (50 games: a glass display cabinet with the most valuable copies). See docs/economy.md
src/world/market/       marketPlan + furnishMarket (wiring) + MarketFloor (the market's day: the stock laid out on the stalls, sales,
                        the stallholders' reactions, pennants, boards, crowd; disposed on unload), furnishHousehold, furnishCoffee, MarketStall (trestle table under a striped awning, `layout()`: a leaning row + a lying row),
                        ForSaleBox (GameBox + price tag, owns the click: hands the box over for inspection), BargainBin, OrderCounter (opens
                        the catalogue), BuyBackDesk (opens the sell panel), TransistorRadio, CrowdSound, stallTalk (stallholders' lines
                        from their table), HallRoof (iron trusses + roof light following the sky). See docs/economy.md
src/world/people/       PersonModel (the rig at real scale: hips/knees/ankles, waist, shoulders/elbows, neck; gait, breathing, arm
                        poses, head + eye gaze, blinking; each bone's pieces merged per material by `geometry.Parts`; LOD past
                        16 m (back under 14, scaled by the camera's zoom): no eyes or inner ears, the rig at 15 Hz), textureCache
                        (the painted canvases cached by the look values each painter reads, shared), locomotion (turning,
                        legs, glances: shared by Walker and Shopper), body
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
src/world/shop/         shopPlan (`SHOP_PLANS`: the walk-in shops' rooms, displays, fixtures) + furnishShop (one builder for the four
                        `shop` zones): ForSale (a piece + its PriceTag, a first click arms it, the second buys it), ShopClerk, ShopCustomer, ShopWindow, shopSounds, displayPieces (`buildPiece` / `displayPiece`:
                        the flat's pieces as shown, lights stripped), shopModels (PortableTv, ShopProjector, CatBallBasket),
                        ShopCounter (the till: the HomeShopPanel), DisplayTable, GoodsShelf, TvWall + snowScreen, FishTank,
                        FlowerStand. See docs/economy.md ("The bare flat")
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
                        undrawn items tick at 20 Hz, static items frozen and their parts merged per material: mergeStatic; `ride` /
                        `move`: what stands on a piece moves with it, colliders and contact shadow following; `lift` / `setDown`: a piece
                        the player carries stops colliding and being clickable, its lights never leaving the scene),
                        ZoneManager (Updatable: player position -> current zone, neighbours active, unload after 30 s unless persistent
                        or one of the 2 travel zones left last; `onZoneChange`; a zone still loading its module is switched to once
                        loaded), PortalCuller (Updatable: draws only zones seen through open doorways),
                        attach (placeWith / placeLeaves: furniture posed in a placed host's space, riding it; floorPointsToWorld)
src/world/surface/      layers (FLOOR / GROUND / WALL: every flat thing's lift and rank, `onSurface`, `decal`, RENDER_ORDER bands),
                        zfight (`findZFighting`: the coplanar overlapping faces of a subtree; `bibliothek.zfight()` under ?debug)
src/world/lighting/     lightBudget (LightMonitor: shadow maps vs texture units, changes of the drawn lights), LightPool + PooledLight
                        (a few real lights lent to the nearest decorative glows), keepLights (`setShownKeepingLights`)
src/world/screen/       VideoScreen (interface the Session drives), VideoSurface (no-picture glass or CSS3D iframe cut-out, proximity volume
                        damped per wall in between), SignalCanvas (its one reused canvas: CRT snow + OSD channel / "NO SIGNAL", the
                        projector's blue "Source search" / "No signal" slate), CrtGlass (scan lines, bulge, power-on line / power-off
                        dot + afterglow), HueDrift (the playing glow's hue), nowPlaying (platform + loudness for console LEDs, speakers)
src/world/acoustics/    SoundOcclusion (walls between the listener and a screen: a ray against the world's occluders, i.e. every loaded
                        room's walls and the door leaves; `proximityVolume` keeps `wallGain` of the volume per wall), PointSound (a
                        room's own sound: distance + walls -> an `AmbientVoice`'s level)
src/world/shelving/     Shelving (bookcases sized from the collection, `minBookcases` standing empty from the start, live rebuild, sort modes, one
                        ShelfLamp per bookcase unless `lamps: false`, explicit `layout` + buyable `capacity`, what does not fit -> `overflow`;
                        planned on the games, boxes made only for those that get a spot; bookcases that come out the same stay and the
                        boxes slide), BoxPool (the flat's GameBoxes shared by its shelvings: a game passing from one to the next keeps its
                        box), arrangement (ShelfArrangement: the sort shown and the player's own 'custom' rows, persisted), ShelvingGroup
                        (the collection room's and the bedroom's shelvings as one for the Session; `spotAt`, `moveBox`), ShelfPlacing (the
                        gap marker with a shelf box in hand), plan (`planShelving`, `planArranged`), slots, sort
src/world/materials/    palette (the shared materials: paint, timber, cloth, standard, basic, METAL, shared), sharedResources
                        (markShared / isShared / disposeTree), shaderPatch (onBeforeCompile helpers), finishes (wood, fabric, plastic,
                        scuffed), surfaces (walls, floor and ceiling edges, floor wear), paintedTiles (paintOnce), GlossyFloor
src/world/box/          ClosedBox (a resting box: one mesh, one atlas; a landscape box prints its top), BoxShell + shellLayout (the
                        openable box, built in hand: a cardboard box by its top or end flap, contents sliding out; a clamshell or jewel
                        case like a book), Manual, LentTag, LidMotion, slabs. See docs/media.md
src/world/media/        The game's media at real size: MediaModel (+ createMediaModel), CartridgeModel (extruded from `outline`: one
                        outline per shell family, grip ribs, label + end fold, a real photo over the face when there is one), DiscModel;
                        MediaDeck (a console as the TV sees it), insertion (seat poses, the moves in and out) over a Timeline.
                        See docs/media.md
src/world/props/        The props any room may use (a prop only one room has lives in that room's folder: world/bedroom/Bed,
                        world/kitchen/Fridge, world/hallway/CoatRack...): Prop (base: empty footprint; part, matte), joinery (SEAM /
                        INSET / PROUD: how parts meet), decor (DECOR_KINDS registry + placeDecor), wallMount, SwitchableLamp (base of the
                        lamps), Door (hinged either side, swings out of the hanging room), ShutDoor (decorative), Window (+Curtains),
                        DayNight, Poster, PictureFrame, WallClock, WallSwitch, Rug, ConsoleStand, Console (+consoleStyles: each
                        console's `MediaSlot`; takes the game in hand's cartridge, plays it on the TV, ejects it), Plant,
                        SideTable, Cushion, Speaker, Sideboard, SwingLeaf and SlideDrawer (doors and drawers that open on a
                        click), MirrorGlass, Parcel (bought games waiting in the hallway). See docs/props.md.
src/world/props/outdoors/ The painted 360° view outside every window (its plan derived from world/city). See docs/outdoors.md.
src/world/city/         The neighbourhood's one data model, read by the painted view and the walkable street: frontage (the road's
                        cross-section, kerbs, lanes, bus stop, ends), vehicles (body sizes), traffic (cruise speeds, dwell, rounds),
                        shopLooks (each kind of shop's colours)
src/world/balcony/      balconyPlan + furnishBalcony: the balcony off the living room (BalconyDoor, BalconySlab, BistroSet, the
                        BuildingFront it stands on, OpenAir: the sun and sky light outside). See docs/zones.md.
src/world/visitors/     Friends who ring, come in, borrow and return games: Visitors (the rules), Visit, VisitBook (who came, lent
                        what, invited when), Friend (the walker), friendsPlan, friendLines. See docs/visitors.md.
src/world/weather/      Weather (spells of clear/cloudy/rain/snow in game hours, seeded by the date; wet and snowy ground). See docs/outdoors.md.
src/world/cat/          The cat: model, brain, bowls, bed, scratcher, toy, settings. See docs/cat.md.
src/world/nav/          FloorNav (an occupancy grid over the collision world, A*, string pulling; `CAT_WALKER` the cat's, `PERSON_WALKER`
                        the visiting friends' round furniture the player moved)
src/furnishing/         Moving the flat's furniture (docs/furnishing.md): Furnishings (the registry: builders `register` what is bought,
                        saved poses restored once the builder is done), FurnitureLayout (the saved poses), surfaces (floor / wall / ceiling
                        from the plan's Placement, the aimed pose, snapping flush to a wall), fit (`localBounds`, `Fit`: what a piece may
                        not be set down over), FurnitureCarrier (the carry, an Updatable)
src/persistence/        One storage layer: safeStorage, KEYS (every key; `?debug` saves under `bibliothek.debug.`), PersistedStore
                        (`{ version, data }`, migrate chain, validate, defaults; unreadable data copied to `bibliothek.corrupt.<key>.<time>`,
                        the last 3 per key kept; a newer build's save copied once per version to `…<key>.newer-v<n>`),
                        batch (writes held and flushed together, put back on failure), onWriteFailure / onCorruptSave (emit only,
                        for the alert bar), onOtherTab (BroadcastChannel + `storage` event), BrowserCache (LRU + TTL, one key). See docs/economy.md.
src/household/          What the kitchen, bathroom and bedroom are for: Household (persisted), HomeLife (the rules their furniture
                        calls), Perks (what it sends the player out with: haggles, the glass case, arcade tickets), rules, outfits,
                        chronicle, dreams, catGift. See docs/household.md.
src/journal/            Journal (the day's lines and sums per local date, 60 days kept, `note(kind, text, data?)` / `tally`), journalWatch
                        (`watchForJournal`: writes it from the wallet, collection, parcel, prizes and medals by diffing their counts),
                        upcoming (the market's round ahead). The notebook is `world/props/Notebook` on the hall console.
src/onboarding/         FirstDay (the guided first day: steps ticked by the stores and the zones, one tip per step and zone, persisted,
                        off for a save that predates it), firstDaySteps (the steps, the to-do lines, the tips per zone), ToDoNote (the
                        folded card on the hall console), StickyNote ("KEYS!" on the front door's leaf, `Door.attachToLeaf`), context
                        (`HomeNotesContext`: what the hallway reads).
src/notices/            What the game tells the player, by kind (docs/notices.md): Notices (the facade, ticked by the engine; its clocks
                        run only while `attending`), SpeechLayer (bubbles over heads projected on the HUD, named when addressed; the subtitle
                        strip out of view), speech (`bindSpeech`: where `people/SpeechBubble` sends its lines), CrosshairLine (react /
                        refuse), RewardBanner (queued, big ones with rays), TipBoard (pinned, `until`), ReadingCard (paper card, stays its
                        reading time), AlertBar (save problems, the mouse lock), saveNotices, readingTime (`readMs`), types (NoticeActions)
src/cheats/             moneyCheat (typing 5 0 0 0 on the top row, or `bibliothek.coins(n)` in the console: +5000 coins, a reward banner).
src/photo/              PhotoMode (free camera on a leash, lens via `PostFx.setLens`, grades over the zone's look, guides, PNG capture;
                        `toggle` / `capture` / `handleKey`), PhotoHud (guides, card, flash; `body.photo-mode` hides the HUD), photoLooks,
                        frames, savePhoto. See docs/graphics.md ("Photo mode").
src/thumbnails/         ThumbnailStudio (`studio.shoot(key, build, view)`: a product photo of a model as a PNG data URL, from its own
                        small WebGLRenderer + Scene + lights, never the world's; one shot per idle slot, cached by key, packs up
                        when idle), prizePhotos (a prize's `prizeModel`), homeGoodPhotos (+ homeGoodModels, a lazy chunk: the shops'
                        `displayPiece`, the market stall's four). The shop panels (PrizePanel, HomeShopPanel) show them.
src/time/               Today (the one "today": `gameDay`, the market calendar's count, and `realDay`; in BuildContext), daily
                        (`dailySeed` / `isEventDay` / `dailyRandom` / `gameDayRandom`: every day-seeded draw), DailyList and DailyTally
                        (per-real-day saved lists and counts), season (the real calendar's season and holidays), wakefulness (how busy the
                        town is by the hour)
src/economy/            Wallet (coins + tickets), pricing (every tunable number, deterministic prices), Transactions (every buy / sell /
                        swap / lot / prize: validate, then apply and save together), calendar (local day keys), seeded (the RNG), MarketStock (the day's
                        stalls and bargain bin, seeded per platform and slot; `lot`: JobLot, `orders`: MarketOrders; stockDraws),
                        MarketDay (what kind of market day: theme, events, news), StockItem (a copy: price settling, haggle), MarketCalendar
                        (in-game days), MarketLedger (haggles, games sold to the market), haggle, ArcadeScores (the player's bests,
                        the top-five tables and initials, the regulars' entries), rivals (the tables' starting names), ArcadeDaily (the
                        day's challenge, whether the change machine works, the cabinet out of order), ArcadeMedals, ArcadeLeague (the
                        weekly league and the streak), Jackpot (the wheel's pot), PayoutStats (`?payout`), Prizes (the prize catalogue + PrizeStore, `bibliothek.prizes.v1`),
                        HomeUpgrades (furniture bought for the flat: the bedroom's bookcases and the `homeGoods` one-offs, localStorage
                        `bibliothek.home.v1`), homeGoods (HOME_GOODS: what the market's household stall sells; slots in the flat's plans)
src/audio/              audioContext (one lazy AudioContext; `startedAudioContext` for sounds nobody clicked for, `unlockAudioOnFirstGesture`),
                        ChipSpeaker (an arcade machine's chip sounds, level and pan following the camera), CrtSpeaker (old TV speaker bed following the video's loudness), CatVoice,
                        CrowdMurmur (the market hall's chatter), RadioTune (a generated easy-listening station), JukeboxTune (the arcade jukebox's
                        four generated stations), coins (a sale's clink),
                        ambient (AmbientVoice: FridgeHum, ClockTick, TapDrip), water (tap, flush, bath), kitchenSounds (kettle, toaster),
                        flatSounds (neighbours, stairwell, radiator ticks), alarm (the wall clock's beep), StreetAmbience (the street heard through the windows), street/streetVoices (horn, siren, two-tone, bird
                        notes: shared by StreetAmbience and the walkable street's StreetSound),
                        Footsteps (+ footSurface: a step by surface, wet and snowy outside), churchBells (the hour struck in the street)
src/catalog/            types (Game, Platform, GameStatus), platforms (6: accent, libretro repo), media (by platform and region: the
                        case, its size, the cartridge shell or disc: `boxDimensionsOf`, `caseOf`, `mediaOf`, `regionOf`), seed data per platform -> SEED_GAMES
                        (ids made canonical with `gameIdFor`; `canonicalGameId` maps the old hand-made ones), validate (isGame, readGame)
src/collection/         GameSource interface, CollectionStore (seed + `bibliothek.collection.v1`, import/export, addMany, lastChange), LibretroIndex,
                        Deliveries (games bought while out wait in the hallway's parcel; `shelved` = the collection less the parcel,
                        `bibliothek.deliveries.v1`), GameList (a GameSource somebody fills: the shelving overflow)
src/covers/             CoverArtProvider chain, StaticArtProvider (public/boxart, baked by `npm run bake-art`), LibretroCoverProvider (via
                        /api/art, `libretroMirrors`: GitHub direct), LaunchBoxProvider (scans via /api/launchbox, cached in the browser),
                        createBoxArtLoader (the wiring), BoxArtLoader (generated first, real fronts nearest-first, then scanned spines,
                        `load`/`release` refcount + the last 24 idle games kept, back / cartridge / disc only via `details()`), ImageFetch
                        (fetch-based: 404 remembered, retries, mirrors, a failing origin paused), scanFaces (spine sides, trimmed
                        cartridge photo, square disc), LoadQueue (cached priorities, re-sorted by `setPriorityOrigin`), generated/ (faces, BoxAtlas)
src/video/              VideoProvider, YouTubeSearchProvider (/api/youtube/search, cached in `bibliothek.cache.longplay.v1`), YouTubePlayer, proximityVolume, randomStart
src/settings/           SettingsStore (`bibliothek.settings.v1`: look sensitivity per device, invert Y, FOV, mixer volumes, HUD aids, text
                        size, speech size, reduce motion, head bob, sprint double-tap / hold Shift, crouch hold / toggle, show tips, key
                        bindings; saved debounced, flushed on pagehide), apply (pushes every setting to the player's feel and FOV, the
                        Inspector, devices, mixer, HUD, tips, Input), motion (`reduceMotion()` for code: the setting or the system's), bindings
                        (rebinding = swapping two physical keys), saveData (hasProgress / eraseProgress: `saveKeys()`, the save's keys but the preferences, caches and corrupt copies)
src/ui/                 Overlay (title: Continue / New game; pause: status, Go home, Collection; Settings in tabs via `addSetting(tab, …)`;
                        Controls by group and device; `confirm()` yes / no in the card), menu/ (menu.css: `.ui-btn`, `.ui-card`, fields;
                        MenuNav: arrows / D-pad for the menu, `registerPanel()` for every DOM panel, `initPanelNav`; ControlsScreen; zoneNames),
                        settings/ (GameSettingsForm, KeyBindingsForm, fields), keys (key names from the bindings and the keyboard layout,
                        `renderKeys('{KeyW} [Click]')`), GamePanel, SearchBar, CollectionEditor (Tab; `canAdd` only with ?debug),
                        CataloguePanel (mail order, a modal like the editor), SellPanel (the WE BUY desk), PrizePanel (the arcade's prize counter drawn as one: shelves by ticket band, photos, the ticket muncher; the mystery game), HomeShopPanel (a Front Street shop's leaflet, paper per shop via `data-shop`), ArcadeScreenPanel (LexiPunk's
                        big frame, its score by postMessage), PayoutOverlay (`?payout`), TravelMenu ("Where to?", digits / click), WalletHud (up in
                        the arcade / market / shops and under the pause menu, else a few seconds when money moves; rolls the count, floats the
                        difference), money (`formatCount` / `formatCoins`: the one way amounts read), fade (`fadeIn` / `fadeOut`: a closing class,
                        then `hidden`), hoverCaption (`Name · verb`, legacy "click to …" read too), coverPlaceholder (a made-up box for art that
                        does not load), worldLoad (the start button waits for the first zone; a failure alerts with Retry), fonts.css (self-hosted
                        faces from public/fonts), Fader,
                        NewsPanel (the newsstand's paper), ScratchCardPanel (the newsagent's scratch card), JournalPanel (the notebook's
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
  A tip or caption that says how to use something reads the device in hand: `ui/verb` (`useVerb()` click / press A / tap,
  `useVerbOn('the TV')`, `keyOrUse(key)`), never a hard-coded "click". The controller's spare buttons: right stick click calls
  the cat, Select held (`padHold`) opens the journal; the pause menu has Journal, Photo mode and Search for pad and touch.
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
  behind the WebGL canvas (`alpha: true`). The Session only knows `VideoScreen`; one plays at a time. The glass shows static
  (or the projector's additive slate, light only, alpha untouched) until the embed reports its first frame; the embed
  autoplays muted and is unmuted, the volume ramp starting on the first PLAYING (or the reveal), never over the static;
  without a state message the picture is revealed after 6 s only if the player answered, an embed silent for 15 s is
  "no signal". While searching the hover says "looking for a longplay of X…"; an empty or failed search also gets one
  `notices.react`; an embed error tries the search's next hit (`VideoInfo.fallbacks`,
  `VideoProvider.reject` updates the cache), the end of a longplay switches the set off. Messages on screen stay
  diegetic ("NO SIGNAL"); the reason goes to the console. Switching off fades the sound 0.3 s under the tube's collapse.
- **Box art**: providers return per-face URLs, the resolver merges (first URL wins), `BoxArtLoader` generates missing faces.
  `GameBox` material order is BoxGeometry's `[+x, -x, +y, -y, +z front, -z back]`. A resting box is a `ClosedBox` (front +
  spines in one atlas, 1 draw); `Inspector` calls `GameBox.setInHand` to swap in the openable shell and draw the back, cartridge
  label (or its photo) and manual cover (freed when put back). Boxes on a `Shelf` cast no shadow: the shelf's instanced proxy does, on the
  zone's shadow layer only. Sizes are per copy (`catalog/media`, platform and region), never `platform.boxDimensions`.
- **Media goes into its console**: a box in hand clicked on its console (or on the TV, which asks its `MediaDecks`) gives
  up a copy of its media (`GameBox.takeMedia`), goes back to its shelf, and the media flies into the console's `MediaSlot`;
  once seated the console plays it on the TV. It stays in (the box opens empty, `setMediaOut`) until ejected or replaced.
- **Lights are switched by clicking them** (`SwitchableLamp`); playing a video never touches them. The drawn light count
  never changes within a set of zones (hide a lamp with `setShownKeepingLights`); decorative glows are `PooledLight`s.
- **No z-fighting by construction**: materials from the palette, parts meeting by the joinery rules, flat things on a
  layer (docs/props.md "Materials, joints and layers"); `bibliothek.zfight()` under `?debug` lists what still fights, and
  `npm run typecheck` runs `scripts/check-conventions.mjs` (no bare render order or polygon offset, no unshared
  module-level material, no in-place edit of a shared geometry, no light hidden with `visible`).
- **One today** (`src/time/`): `Today.gameDay` (the market calendar's count) for everything that follows the game's
  days, the real date for street events and tallies; every day-seeded draw goes through `time/daily`.
- **Builders are wiring**: a zone's rules live in a class placed or disposed with it (`ArcadeHall`, `MarketFloor`);
  its stores are made once in `bootstrap/services` and handed down in `BuildContext`, never created by a builder.
- **The cat** never blocks the player (empty footprint) and reads the room through `CollisionWorld` only.

- **Menus and panels.** Every DOM panel uses the tokens, `.ui-card` / `.ui-btn`, a focusable Close button and
  `registerPanel(root, { isOpen })` so the arrows and a controller walk it (A picks, B = Escape). A full-screen panel
  extends `ui/ModalPanel` (root `.ui-modal` + `--sheet` / `--centre`, open / close / toggle, `onOpenChange` + `addOpenListener`,
  the shared `ui-modal-in` entrance and a 150 ms `--closing` fade: `isOpen` is false at once, `hidden` follows,
  keys kept from the window but Esc, `[data-autofocus]`, `registerPanel`; hooks `onOpened` / `onClosed` / `onKey` / `onSide`);
  stacking is the `--z-*` tokens in `styles.css`, never a raw number; fonts are the `--ui-font-*` tokens (body, display,
  marker, led, print, serif, hand, comic), the tips' blue is `--ui-info`. Motion in code asks `settings/motion.reduceMotion()`.
  Hover captions are `Name` or `Name · verb` (lowercase verb, never "Click to"): the Overlay adds the device's key cap. HUD
  things that share a place stack in one flex column (`ui/hudSlot`: under the crosshair, top left), never by hand-set offsets;
  reduced motion is the one selector `.reduce-motion` (on <html> for the setting or the system's), no media query of its own. Key names are never
  hard-coded: write `{KeyB}` through `renderKeys`, it follows the player's bindings and layout. Sounds connect to
  `ctx.destination` (the mixer's `world` bus) or `audioBus(ctx, 'screens' | 'arcade' | 'ui')`; a YouTube player is scaled
  by `channelVolume('screens')`.

## Data sources (key-less only)

- libretro-thumbnails (GitHub raw, CORS `*`): `Named_Boxarts` (front), `Named_Snaps`, `Named_Titles`. Backs and
  spines come from LaunchBox (below) and are generated when it has none. Filenames are No-Intro names with the characters `& * / : \` < > ? \ |`
  replaced by `_`; stored in `externalIds.libretroName`. Dev goes through `/api/art/<repo>/<folder>/<file>.png`
  (`server/artCache.ts`, disk cache `.cache/art/`, 404s as `.missing` markers for a week; delete the folder to refetch).
- LaunchBox Games Database (key-less, no API: its search and images pages are parsed in `server/launchbox.ts`):
  box backs, spines, cartridge photos and PS1 discs, picked by the copy's region (`catalog/media` `regionOf`; a back
  or spine from its region, else North America <-> Europe, never across Japan; a cartridge or disc from anywhere
  last). `/api/launchbox/<platform>/<name>?region=` answers a manifest of `/api/scan/<kind>/<uuid>.<ext>` URLs (our
  proxy, `server/scanCache.ts`, WebP with alpha, backs and spines 1024 px). LaunchBox is asked one page a second
  (`server/politeFetch`: retries, a circuit breaker answering 503 + Retry-After), lookups cached on disk
  `.cache/launchbox/` a month (no match a week, stale served on error), images under `.cache/scans/`. The seed games'
  art is baked into `public/boxart/` by `npm run bake-art` (same server code, same caches) and read first.
- YouTube, no API key: `server/youtubeSearch.ts` fetches the public results page with a consent cookie and regex-parses
  `ytInitialData`. Fragile; keep all parsing in that one file.
- Wikipedia (search API + Wikimedia pageviews, key-less, identifying User-Agent required): `server/fame.ts` turns a
  game title into its article's monthly page views, the market's measure of fame for pricing (see `docs/economy.md`).
  `/api/fame`, disk cache `.cache/fame/` for a month.
