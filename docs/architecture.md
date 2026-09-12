# Architecture

First-person 3D game collection room. three.js + Vite + TypeScript, no framework. Units are metres,
real scale (NES box 0.127 x 0.178 x 0.025, eye height 1.7). Axes: x right, y up, z towards the spawn.
Walls as seen from the spawn: back = -z (shelves, door), front = +z, left = -x (TV), right = +x (projector).

## Layers, outermost first

| Layer | Files | Role |
| --- | --- | --- |
| Plan (data) | `src/world/worldPlan.ts`, `src/world/roomPlan.ts` | `WORLD_PLAN`: the zones and how they connect; `ROOM_PLAN`: every position in the collection room. No three.js at runtime. |
| Layout | `src/world/layout.ts` | `ZONE_BUILDERS` / `furnishRoom()` read the plans and build a zone; the only place that wires props together. |
| Zones | `src/world/zone/`, `src/world/World.ts`, `src/world/Sky.ts` | `Zone` (load/unload unit, zone-local coordinates), `ZoneManager` (current + neighbours active), `Sky` (the one clock + outdoors). See docs/zones.md. |
| Furniture | `src/world/**`, `src/world/props/**` | Classes: `Furniture` (+ `Interactable`, `Updatable`). Know nothing about the plan or the session's rules. |
| Engine | `src/core/`, `src/player/`, `src/input/`, `src/interaction/` | Loop, input, collisions, raycast. Never touched for content. |
| Rules | `src/game/` | `Session`: what clicks and keys do. Reaches features through `SessionParts` interfaces. |
| Data | `src/catalog/`, `src/collection/`, `src/covers/`, `src/video/`, `server/`, `api/` | Games, platforms, art, longplays. |

## Folder map

```
src/main.ts             construction only: engine, providers, collection, world, player, input devices, interaction, UI, session
src/core/               Engine (renderer, loop, Updatable registry, LayerRenderer hook), Input (held keys + onPress, virtual keys/axes),
                        Collider (CollisionWorld: AABB set, add/remove), CssLayer
src/player/             FirstPersonController (yaw/pitch, sliding collisions against CollisionWorld only, sit/stand, crouch Shift, sprint double-tap
                        forward), PointerLockFlow (start card <-> lock; modes pointer | gamepad | touch)
src/input/              Gamepad (standard mapping -> virtual keys + synthetic mouse), TouchControls, SyntheticMouse, deviceDetect
src/game/               Session (rules + click/key routing), SessionParts (structural interfaces of optional features), SessionActions
                        (what an Interactable may ask), Highlighter (emissive pulse), playerPose
src/interaction/        Interactable (hitboxes + label + activate), Interactor (crosshair raycast -> owner), Inspector (carry/rotate/return/open)
src/world/              World (scene + CollisionWorld + live interactables + zones: addZone/zone), Sky (DayNight + Outdoors, ticked once), worldPlan (WORLD_PLAN,
                        SUN_ROTATION_Y), roomPlan (ROOM_PLAN), Placement (floor/ceiling/corner/wall -> position+yaw), layout (BuildContext, furnishRoom,
                        ZONE_BUILDERS), Room (a Furniture: walls cut by doorways, colliders, setDaylight/setSkylight/setLampOn), Furniture (footprint,
                        colliders, dispose?), Seat, GameBox, Television, Projector, Shelf, meshUtils (boxMesh, cylinderMesh, invisibleHitbox), Parquet
src/world/zone/         Zone (group at origin, place()/placeAt()/remove(), scoped collisions, empty/dormant/active, build/activate/deactivate/unload),
                        ZoneManager (Updatable: player position -> current zone, neighbours active, unload after 30 s)
src/world/screen/       VideoScreen (interface the Session drives), VideoSurface (message glass or CSS3D iframe cut-out, proximity volume)
src/world/shelving/     Shelving (bookcases sized from the collection, live rebuild, sort modes, one ShelfLamp per bookcase), plan, slots, sort
src/world/box/          BoxShell, Cartridge, Manual, LentTag, LidMotion, shellLayout, slabs
src/world/props/        Prop (base: empty footprint), decor (DECOR_KINDS registry + placeDecor), wallMount, SwitchableLamp (base of PendantLamp,
                        FloorLamp, ShelfLamp), Door, Hallway, Window (+Curtains), DayNight, Poster, PictureFrame, WallClock, Rug, ConsoleStand,
                        Console (+consoleStyles), Plant, SideTable, Cushion. See docs/props.md.
src/world/props/outdoors/ The painted 360° view outside every window. See docs/outdoors.md.
src/world/cat/          The cat: model, brain, nav, bowls, bed, scratcher, toy, settings. See docs/cat.md.
src/audio/              audioContext (one lazy AudioContext), CrtSpeaker (old TV speaker bed following the video's loudness), CatVoice
src/catalog/            types (Game, Platform, GameStatus), platforms (6: sizes, accent, libretro repo), seed data per platform -> SEED_GAMES
src/collection/         GameSource interface, CollectionStore (seed + localStorage `bibliothek.collection.v1`, import/export), LibretroIndex
src/covers/             CoverArtProvider chain, LibretroCoverProvider (via /api/art), BoxArtLoader (generated first, real art nearest-first), generated/
src/video/              VideoProvider, YouTubeSearchProvider (/api/youtube/search, localStorage cache), YouTubePlayer, proximityVolume, randomStart
src/ui/                 Overlay, GamePanel, Toast, SearchBar, CollectionEditor (Tab; `addPanel()` hosts extra forms), controls (key hints), styles.css
server/                 pure `(ApiRequest) => ApiResponse` handlers: youtubeSearch/longplaySearch, artCache/artStore/imageProcessing, libretroIndex; Vite plugins
api/                    Vercel functions wrapping the server handlers; vercel.json rewrites
```

## Key patterns

- **Plan -> layout -> classes.** Positions live in `ROOM_PLAN` (zone-local); `furnishRoom` places things; classes build geometry.
  Never hard-code a coordinate in a class or in `main.ts`.
- **Everything lives in a `Zone`.** `zone.place(item, position, yaw)` / `placeAt(item, placement)` parents the item to the
  zone, records `footprint` + `colliders` as world AABBs and, while the zone is active, collides, ticks (`Updatable`) and is
  clickable (`Interactable`). `remove()` undoes it. The `ZoneManager` activates the player's zone and its neighbours only.
- **Collision is the `CollisionWorld` alone**: wall slabs (gaps at doorways), every furniture `footprint` and `colliders`,
  plus anything that moves (the door leaf swaps its own Box3 through `zone.collisions`, the zone's scoped view). A player
  already inside a collider is let out. The player holds the world set; furniture and the cat hold the `Collisions` interface.
  `Prop` has an empty footprint: decoration never blocks; give real furniture a real `footprint`.
- **Clickables implement `Interactable`**: `hitboxes` (use `invisibleHitbox` for thin/many parts), `label(player)`,
  `activate(session: SessionActions)`. The `Interactor` maps ray hits back to the owner; nobody else sees meshes.
- **Keys**: held via `input.isDown/axis`, presses via `input.onPress`; physical `KeyboardEvent.code` only. Gamepad and touch
  press virtual key codes on `Input` and dispatch synthetic mouse events, so `Session.bindInput` is the single router.
- **Optional features** reach the `Session` through structural interfaces in `SessionParts.ts`; main passes the concrete object.
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
