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
                        (what an Interactable may ask), Highlighter (emissive pulse), playerPose
src/interaction/        Interactable (hitboxes + label + activate), Interactor (crosshair raycast -> owner), Inspector (carry/rotate/return/open)
src/world/              World (scene + CollisionWorld + live interactables + zones: addZone/zone), Sky (DayNight + Outdoors, ticked once), worldPlan (WORLD_PLAN,
                        WALL_GAP, SUN_ROTATION_Y), roomPlan (ROOM_PLAN, DOOR_LEAF), Placement (floor/ceiling/corner/wall -> position+yaw), layout (BuildContext,
                        ZoneHandle, roomOf, furnishRoom, ZONE_BUILDERS), shell (furnishShell: Room + sky + owned doors), Room (a Furniture: walls cut by doorways,
                        opaque-wall shadow casters, colliders, setDaylight/setSkylight/setLampOn/setOccupied), Furniture (footprint, colliders, dispose?), Seat,
                        GameBox, Television, Projector, Shelf, meshUtils (boxMesh, cylinderMesh, invisibleHitbox), Parquet
src/world/hallway/      hallwayPlan (HALLWAY_ROOM, HALLWAY_PLAN) + furnishHallway: the corridor (console, coats, entrance door, runner)
src/world/bathroom/     bathroomPlan + furnishBathroom
src/world/bedroom/      bedroomPlan + furnishBedroom
src/world/kitchen/      kitchenPlan + furnishKitchen
src/world/arcade/       arcadePlan + furnishArcade, ArcadeCabinet (canvas screen, attract / playing / over, printed side art), PrizeCounter
                        (`wallBehind` for an attendant), ScoreBoard (hall of fame following `ArcadeScores`), Pinball / ClawMachine /
                        ChangeMachine (decorative, animated, a line on click; `standAt` / `focus` for the person playing them), games/
                        (ArcadeGame contract, Breakout, Invaders, registry). See docs/economy.md
src/world/market/       marketPlan + furnishMarket, MarketStall (trestle table under a striped awning, `anchors()` for the boxes), ForSaleBox
                        (GameBox + price tag, owns the click), OrderCounter (opens the catalogue), HallRoof (iron trusses + roof light following the sky)
src/world/people/       PersonModel (the rig at real scale: hips/knees/ankles, waist, shoulders/elbows, neck; gait, breathing, arm
                        poses, head + eye gaze, blinking; each bone's pieces merged per material by `geometry.Parts`), body
                        (proportions, the trunk as superellipse rings following `TRUNK` for build and figure, tapered limbs,
                        hands with fingers), head (`headRadius(d)`: the skull and face sculpted radially, so hair and paint can
                        ask where the skin is; ears, hats, glasses), eyes (balls that turn, lids that blink), hair (shells over
                        the skin that feather at the hairline, long hair, bun, ponytail, full beard), shoes, faceTexture (the
                        head's canvas: flush, shade, stubble, brows, lips) and clothTexture (the trunk's canvas: trousers,
                        tee/stripes/flannel/hoodie/jacket/shirt, apron, weave; `paintCloth` for sleeves and legs), looks (seeded
                        looks by role: `randomLook(seed, 'vendor' | 'shopper')`), poses (arm angles: stand, crossed, hips,
                        think, pockets), Vendor (stands behind a stall, changes stance, meets the player's eye, clickable for a
                        line), Shopper (walks the aisle between `BrowseSpot`s, browses hand-at-chin, lingers; no collider).
                        Placed by `furnishMarket` / `furnishArcade` from their plans; the camera (`BuildContext.listener`) is
                        the viewer.
src/world/travel/       TravelDoor (a ShutDoor that asks the Session to travel), Travel (fade, teleport to a zone's `travel.arrival`)
src/world/zone/         Zone (group at origin, place()/placeAt()/remove(), scoped collisions, empty/dormant/active, build/activate/deactivate/unload,
                        own shadow layer, portals, setOccupied/setDrawn), ZoneManager (Updatable: player position -> current zone, neighbours
                        active, unload after 30 s unless persistent), PortalCuller (Updatable: draws only zones seen through open doorways)
src/world/screen/       VideoScreen (interface the Session drives), VideoSurface (message glass or CSS3D iframe cut-out, proximity volume
                        damped per wall in between)
src/world/acoustics/    SoundOcclusion (walls between the listener and a screen: a ray against the world's occluders, i.e. every loaded
                        room's walls and the door leaves; `proximityVolume` keeps `wallGain` of the volume per wall)
src/world/shelving/     Shelving (bookcases sized from the collection, `minBookcases` standing empty from the start, live rebuild, sort modes, one
                        ShelfLamp per bookcase), plan, slots, sort
src/world/materials/    shaderPatch (onBeforeCompile helpers), finishes (wood, fabric, plastic, scuffed), surfaces (walls, floor and
                        ceiling edges, floor wear), GlossyFloor
src/world/box/          BoxShell, Cartridge, Manual, LentTag, LidMotion, shellLayout, slabs
src/world/props/        Prop (base: empty footprint), decor (DECOR_KINDS registry + placeDecor), wallMount, SwitchableLamp (base of PendantLamp,
                        FlushLamp, FloorLamp, ShelfLamp), Door (hinged either side, swings out of the hanging room), ShutDoor (decorative), Window
                        (+Curtains), DayNight, Poster, PictureFrame, WallClock, WallSwitch (toggles a room's SwitchableLamp), Rug, ConsoleStand,
                        Console (+consoleStyles), Plant, SideTable, Cushion, Speaker, Sideboard, SmokeDetector, HallConsole, CoatRack, UmbrellaStand,
                        LeaningMirror, PedalBin, BathroomScale, and the bathroom / bedroom / kitchen furniture. See docs/props.md.
src/world/props/outdoors/ The painted 360° view outside every window. See docs/outdoors.md.
src/world/cat/          The cat: model, brain, nav, bowls, bed, scratcher, toy, settings. See docs/cat.md.
src/economy/            Wallet (coins + tickets, localStorage), pricing (every tunable number, deterministic prices), MarketStock (the day's
                        stalls from the libretro index, seeded by date), ArcadeScores (best per game)
src/audio/              audioContext (one lazy AudioContext), CrtSpeaker (old TV speaker bed following the video's loudness), CatVoice
src/catalog/            types (Game, Platform, GameStatus), platforms (6: sizes, accent, libretro repo), seed data per platform -> SEED_GAMES
src/collection/         GameSource interface, CollectionStore (seed + localStorage `bibliothek.collection.v1`, import/export), LibretroIndex
src/covers/             CoverArtProvider chain, LibretroCoverProvider (via /api/art), BoxArtLoader (generated first, real art nearest-first), generated/
src/video/              VideoProvider, YouTubeSearchProvider (/api/youtube/search, localStorage cache), YouTubePlayer, proximityVolume, randomStart
src/ui/                 Overlay, GamePanel, Toast, SearchBar, CollectionEditor (Tab; `addPanel()` hosts extra forms; `canAdd` only with ?debug),
                        CataloguePanel (mail order, a modal like the editor), TravelMenu ("Where to?", digits / click), WalletHud, Fader,
                        controls (key hints), styles.css
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
