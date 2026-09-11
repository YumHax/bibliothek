# Bibliothek

First-person 3D video game collection room. three.js + Vite + TypeScript, no framework.
Goal: display an entire physical game collection on shelves, with real box art, and interact with it
(pick up a box, read its details, play a longplay on the in-room TV).

## Commands

```bash
npm run dev         # Vite dev server on :5173 (also serves /api/youtube/search via a Vite plugin)
npm run typecheck   # tsc --noEmit (src) + tsc -p api (serverless functions) — run after every change
npm run build       # typecheck + production bundle
npx vercel dev      # app + api/ functions on :3000 (see README for deployment)
```

The user usually has `npm run dev` already running. Do not start a second instance; check with
`lsof -i tcp:5173` first. Vite hot-reloads TS and CSS and restarts itself when `vite.config.ts` changes.

## Working rules

- **Browser testing only when explicitly asked.** Never open Chrome / use the browser tools on your own
  initiative; verify with `npm run typecheck` and `npm run build`, then describe what to check.
- Keep the modular layout below. No logic in `index.html`; `src/main.ts` is wiring only.
- One concern per file. New features get their own folder under `src/` when they introduce a new concept.
- Strict TypeScript (`noUnusedLocals`, `noUnusedParameters`). Path alias `@/` -> `src/`.
- Units are metres, real-world scale (NES box 0.127 x 0.178 x 0.025, eye height 1.7).
- Keyboard input uses physical `KeyboardEvent.code` (WASD == ZQSD on AZERTY). Never use `event.key`.
- Public, key-less data sources only unless the user says otherwise (the user does not want to request API keys).

## Architecture

```
src/main.ts              construction only: engine, providers, collection, world, player, input devices, interaction, UI, session
src/core/                Engine (renderer, loop, Updatable registry, LayerRenderer hook), Input (held keys + onPress, virtual keys/axes for
                         gamepad & touch), Collider (AABB set with add/remove), CssLayer
src/player/              FirstPersonController (owns yaw/pitch: mouse via PointerLockControls, `applyLook`/`lookAt` for other devices;
                         sliding collisions, sit/stand, crouch on Shift, sprint by double-tapping forward or the virtual `SPRINT_CODE`), PointerLockFlow (start card <-> lock; modes pointer | gamepad | touch)
src/input/               Gamepad (standard mapping -> virtual keys + synthetic mouse), TouchControls (joystick, drag-look, tap, button bar),
                         SyntheticMouse, deviceDetect
src/game/                Session: the rules (pick up / put back / sit / stand / play on a screen (TV or projector, one at a time), search, random pick, sort, night, box open,
                         collection editor; click + key routing), SessionParts (structural interfaces of optional features), SessionActions,
                         Highlighter (emissive pulse), playerPose
src/world/               World (room shell, `place()`/`remove()` furniture, `shelving`, events), Room (setDaylight, setSkylight, setLampOn; walls are ShapeGeometry planes cut by
                         `options.doorways`, the baseboard stops at them; exports `Wall` and `Doorway`), roomPlan (DEFAULT_ROOM 6x6x2.8 + FRONT_DOOR: back wall, x = -1.5, 0.83 x 2.04), Shelf,
                         GameBox (hollow shell + hinged lid, cartridge, manual; open/close; setStatusStyle), Television (CRT on the
                         console stand), Projector (ceiling unit throwing on the right wall, beam + frustum, `aimAt`), Seat, Furniture,
                         layout (default room), meshUtils (boxMesh, cylinderMesh, invisibleHitbox: the only way to build a click target), Parquet (procedural tiled floor material)
src/world/props/outdoors/ Outdoors (the 360° view outside, painted once at start from a sixth-floor street corner; `material` for the panes casts the eye ray through sky at infinity + scenery
                         on a 40 m sphere, so every window shows the same world with gentle parallax; sky gradient, sunset glow, sun tint, night darkness, lights, sun and moon are uniforms: nothing repaints),
                         plan (the neighbourhood: Front Street ahead with mid-rise facades, Park Street to the left with the park, `frontage()`/`parkLine()` distances), Sheet (three 4096x1024 canvases in
                         azimuth x elevation band space, `begin(distance, glass)` + `rect`/`path` stamp colour, haze and glass at once, `lit(path, kind, strength, curfew)`/`glow` for night lights;
                         `finish()` packs the scene texture (premultiplied day colours), the lights DataTexture (R warm, G cool, B glass, A depth via `encodeDepth`) and the curfew R8 texture (nearest,
                         no mips: one byte per light = the wakefulness below which it goes out, 0 = burns all night)), wakefulness (`wakefulnessAt(hours)`: 1 by day and evening, ~0.1 between 2 h and 4 h;
                         lights are on or off, never dimmed: `lit()` rasterises a `Polygon` (a Path2D that keeps its corners) texel by texel onto the light and curfew canvases at once, no anti-aliasing, and the shader (`lightTexel`/`sampleLights`) switches each of the four texels around the ray before blending them (both textures nearest, no mips); the shader switches each on at dusk
                         at its own point of the `litAlpha` ramp (`fract(curfew * 7)`, all-night lights first) and `step(curfew, wakefulness)` puts the windows out one by one: homes get a uniform random curfew, shops ~0.55-0.85 (bars 0.15-0.3), offices mostly 0.45-0.9,
                         street lamps / signs / tower crowns 0; `Life.update(dt, nightness, wakefulness)` divides the car spawn interval by it and fades the night owls out below their own `homeAt`), painters far to near: Skyline (towers), Facades (buildings with shops, windows, roofs;
                         backdrops behind the park and peeking over the street), Park (lawn, paths, pond, bandstand, hedge), Street (pavement, road, markings, lamps, parked cars, street trees), Tree,
                         Car (one box-model car painter for the parked cars and the sprite atlas: `CarBrush` = projection + fills), SkyDetail (stars + clouds equirect), shader (GLSL), paint (colour helpers).
                         Life = the only thing that moves: cars round the corner (both streets end there: two concentric routes, right-hand traffic = facing +z the right is -x, queueing, no crossing,
                         positions interpolated between the half-metre route samples) and walkers on the pavements and park paths, as sprites the shader composites over the scenery (`SPRITE_COUNT`
                         uniform vec4 slots: band rect, atlas rect, alpha/distance/lod/packed tint), hidden where the scenery depth (lights.a) is nearer; the atlas (2048², glow copy at half size on an
                         opaque black canvas: additive light on a transparent canvas gets un-premultiplied to white at upload) holds a white car every 10° of view angle at 2 distances, tinted per car,
                         plus pedestrians in two poses. `Outdoors.update(dt)` is ticked by the window that drives the clock. Everything is true perspective from `EYE_HEIGHT`; to check the painting without a browser, bundle the painters with
                         esbuild (`--alias:@=./src`) and run them in Node with `@napi-rs/canvas` shimming `document.createElement('canvas')` and `Path2D`, then save `sheet.color.canvas` as PNG
src/world/screen/        VideoScreen (what the Session drives: state, searching/play/fail/stop, onStateChange), VideoSurface (the shared
                         picture: message glass or CSS3D iframe cut-out, iframe glue, proximity volume) used by Television and Projector
src/world/shelving/      Shelving (bookcases sized from the collection, live rebuild from a GameSource, sort modes, one clickable
                         ShelfLamp per bookcase kept across rebuilds), plan, slots (back wall
                         then right wall, skipping `rightWallKeepClear` = the projector picture), sort
src/world/box/           BoxShell (tray + lid geometry), Cartridge, Manual, LentTag, LidMotion, shellLayout, slabs
src/world/cat/           The cat. types (contracts: CatBody, CatPose, the *Like props, CatVoiceLike, CatSettings), CatModel (procedural rig: capsules +
                         chained tail, 5 coats painted on canvases in `coats`, 12 poses blended per joint, walk/trot gait from `setSpeed`, `gaze`, blink/breath/
                         ear twitch, purr tremble, `flick`), Cat (Furniture with an empty footprint + Interactable: click = pet, 4 pets in 10 s = annoyed;
                         `call()`, `setPlayerSeat()`, `applySettings()`), CatBrain (state machine: sleeps most of the day by `sleepDrive(hours)`, hunger/thirst
                         needs, eat/beg/drink/groom/wander/window lookout/scratch/toy/TV watching/fly chase/rub/sunbathe, armchair perches and the player's lap,
                         startle + flee from a sprinting player), CatNav (0.15 m occupancy grid probed with `collisions.intersectsSphere`, A*, string pulling),
                         CatMotion (path following, parabolic hops), spots (resting spot choice), FoodBowl (clickable, kibble InstancedMesh level, refill),
                         WaterBowl, CatBed, Scratcher, CatToy (rolling ball, bounces off colliders), catSettings (localStorage `bibliothek.cat.v1`),
                         index (`furnishCat()`: places everything in the shelf-free corner, called from main after the player exists). Seat exposes
                         `approachPoint/restingSpot/lapSpot`, RoomWindow `lookoutSpot/sunSpotOnFloor` for it. Headless check: bundle a sim with esbuild
                         (`--alias:@=./src`, canvas/document shims injected) and tick `Cat.update` for 1800 s to catch NaN, escapes and state balance
src/audio/CatVoice.ts    synthesized purr (AM sawtooth+noise, breathing LFO) and meows (demand / greet / grumble), faded by distance; AudioContext guarded
src/ui/CatSettings.ts    name + coat form hosted by `CollectionEditor.addPanel()`
src/world/props/         furnishProps(): Door (hung in each Room doorway via `wallMount(wall, along, 0)`: architrave + jambs, panelled leaf on a hinge pivot swinging *out* into the hallway
                         (LidMotion, 95°, so it never needs a moving collider), brass handle glints on hover, click = open/close; the opening is its only real footprint), Hallway (behind the
                         hole, the rest of the flat: a 4 x 1.3 m corridor set `HALLWAY_SETBACK` behind the wall, parquet + warm walls + skirting, shut doors to the bedroom and bathroom across,
                         the glazed kitchen door at the left end, the flat's front door with its mat at the right end, console + mirror + mail, coat hooks, shoe rack, runner; a flush ceiling light
                         whose shadow-less PointLight `setOpenness` scales with the door; nothing casts shadows or is clickable),
                         RoomWindow x4 (floor-to-ceiling loft windows: black steel frame + mullion grid, kick rail on the floor, `RoomWindow.mountY()`; clickable: draws its floor-length Curtains,
                         which fade the sun spot and the room skylight) sharing one DayNight (self-running clock: a full day in `dayLength` = 600 s, sunrise 6 h / sunset 20 h, sky colours, `ambient` hue tinting
                         `Room.setDaylight`, sun + moon positions, horizon glow; N jumps to 23 h / 14 h) and one Outdoors (see `src/world/props/outdoors/`; only the primary window drives the clock; every window casts sun
                         while it is on its side, its shadow pass skipped otherwise), Poster, PictureFrame (procedural motifs), WallClock (hands follow DayNight; hover = time, click = toggleNight), Rug, ConsoleStand + Console (one per platform, clickable),
                         Plant (procedural potted plants: yucca / fig / small / monstera / hanging), PendantLamp (clickable fixture around the
                         Room light; `onSwitch` drives `Room.setLampOn`), FloorLamp (own PointLight, clickable switch), ShelfLamp (ceiling spot 1.4 m in front
                         of each bookcase aimed at its face, clickable switch, placed by Shelving), SwitchableLamp (base of the three lamps:
                         on/hovered state, caption, click = toggle; subclasses build geometry and implement `render`), SideTable,
                         Cushion (Seat.mountCushion), Prop base, wallMount. Lights are switched by clicking them; playing a video never touches them.
                         Wall plan: back = door at x -1.5 with the WallClock above it, bookcases from x -1, fig in the corner; left = TV at z 0 with the three PictureFrames above it, windows at z ±1.8;
                         front = windows at x 0.3 / 2.0, posters at x -2 / -1.25; right = shelving around the projector picture. The cat's bowls sit between the fig and the door, its bed under the left wall's back window
src/interaction/         Interactable (hitboxes + label + optional labelPlacement + activate), Interactor (crosshair raycast -> owner), Inspector (carry/rotate/return/open)
src/catalog/             types (Game, Platform, GameStatus), platforms (6 platforms: sizes, accent, libretro repo), seed data per platform
                         (nes, snes, gb, megadrive, n64, ps1 -> SEED_GAMES in index.ts), nointro (name parsing), format
src/collection/          GameSource interface, CollectionStore (seed + localStorage `bibliothek.collection.v1`, import/export JSON),
                         LibretroIndex (client search over /api/libretro/index)
src/covers/              CoverArtProvider (per-face URLs + chain resolver), LibretroCoverProvider (via /api/art), BoxArtLoader (progressive:
                         generated first, real art nearest-first; `setPriorityOrigin`), LoadQueue, FrameBudget, PlaceholderCover
src/covers/generated/    procedural spine / back / cartridge label / manual / paper tag textures + canvasUtils, palette
src/audio/               audioContext (one lazy AudioContext), CrtSpeaker (Web Audio bed of an old TV speaker: mains hum, hiss, crackles,
                         scan whistle, power-on thump; follows the video's proximity loudness — the YouTube iframe audio itself cannot be filtered)
src/video/               VideoProvider, YouTubeSearchProvider (/api/youtube/search, localStorage cache), YouTubePlayer (embed + postMessage
                         volume), proximityVolume, randomStart
src/ui/                  Overlay (start card, crosshair, hover label, hint, setModal), GamePanel, Toast, SearchBar (+ fuzzy),
                         CollectionEditor, controls (single source of key hints), html (escapeHtml), styles.css (+ one .css per module)
server/                  framework-agnostic handlers (http.ts: every endpoint is a pure `(ApiRequest) => ApiResponse` served by `serveNode`):
                         youtubeSearch + longplaySearch (ranking, TTL cache), artCache + artStore (disk in dev, memory on serverless)
                         + imageProcessing (sharp -> 512 px WebP), libretroIndex (GitHub listing cache),
                         Vite plugins
api/                     Vercel Node functions wrapping the server handlers (art, youtube/search, libretro/index); vercel.json rewrites
```

Key patterns:
- Anything per-frame implements `Updatable` and registers with `engine.addUpdatable`; `World.place()` does it for furniture.
- The collection is a `GameSource` (`games` + `subscribe`). `Shelving` rebuilds on change (reusing `GameBox` instances by id),
  `furnishRoom` refreshes the consoles on the TV stand, and the `CollectionEditor` (Tab) mutates the `CollectionStore`.
- Optional features reach the `Session` through the structural interfaces in `SessionParts.ts`; add a new feature by adding an
  optional part there, routing its key in `Session.bindInput`, and listing the hint in `controls.ts`.
- Gamepad and touch never talk to the Session: they hold/press virtual key codes on `Input` (`GamepadA`… or aliases such as `KeyE`)
  and dispatch synthetic mouse events, so click handling stays in one place.
- New HUD modules ship their own `.css` file imported from the module; `styles.css` holds only the shared rules.
- Clickable things implement `Interactable`: they list their `hitboxes`, phrase their own `label(player)` and run
  `activate(session)` through `SessionActions`. The `Interactor` maps ray hits back to the owning interactable, so
  nobody outside it deals with meshes or `instanceof`. New furniture: implement `Furniture` (+ `Interactable` /
  `Updatable` as needed) and add it in `src/world/layout.ts`.
- Keyboard: held keys via `input.isDown/axis`, presses via `input.onPress` — no raw `keydown` listeners elsewhere.
- The cat never blocks the player (empty footprint) and reads the room through `CollisionWorld` only; anything new that the cat must
  walk around just needs a real `footprint`. It reaches the Session through the `CatLike` part (`C` calls it, `sit()`/`stand()` report the seat).
- `GameBox` materials order is BoxGeometry's: `[+x right, -x left, +y top, -y bottom, +z front, -z back]`.
  On the +x face the front edge is on the texture's left; on -x it is on the right (see `SpineTexture`).
- Box art providers return `Partial<Record<'front'|'back'|'spine'|'snap'|'title', string>>`; the resolver merges
  per face, first URL wins, and `BoxArtLoader` generates any missing face. Add new sources to the chain in `main.ts`.
- A screen's picture (`VideoSurface`) is a cut-out mesh (alpha 0, `NoBlending`) over a `CSS3DObject` iframe rendered in
  `CssLayer`, which sits *behind* the WebGL canvas (`alpha: true`). Both must be `position: absolute` in `styles.css`.
  The Session only knows the `VideoScreen` interface; a new kind of screen implements it (+ `Interactable`).

## Data sources

- libretro-thumbnails (GitHub raw, CORS `*`, no key): `Named_Boxarts` (front), `Named_Snaps`, `Named_Titles`.
  No back or spine exists anywhere key-less; they are generated. Filenames are No-Intro names with
  `&*/:\`<>?\|` replaced by `_` — store them in `externalIds.libretroName`.
  In dev the browser hits `/api/art/<repo>/<folder>/<file>.png` instead (`server/artCache.ts`): images are
  stored under `.cache/art/`, 404s as `.missing` markers for a week. Delete `.cache/art` to refetch.
- YouTube: no API key. `server/youtubeSearch.ts` fetches the public results page with a consent cookie and
  regex-parses `ytInitialData`. Fragile by nature; keep all parsing in that one file. Dev-only: production
  needs the same function deployed as an endpoint.

## Gotchas already hit

- `styles.css` sets `display` on some elements, so the `hidden` attribute needs the global
  `[hidden] { display: none !important; }` rule. Toggle visibility with `el.hidden`, not inline styles.
- Chrome refuses a new pointer lock for ~1 s after Esc; `enterRoom()` in `main.ts` retries once.
- The canvas has `z-index: 1`, so any new HUD element needs a higher `z-index` (see the shared rule
  in `styles.css`) or it renders invisibly behind the 3D view.
- When editing files with scripted string replacement, assert the match exists: a silent no-op replacement
  caused a black screen once (canvas pushed below the CSS layer). Prefer the Edit tool.
- A JSDoc comment containing `*/` (e.g. a list of forbidden characters) ends the comment early.
- Point-light shadow bias is in units of the shadow camera's `far` (default 500 m), so keep
  `shadow.camera.far` at room scale or a tiny bias will detach shadows from low objects.
