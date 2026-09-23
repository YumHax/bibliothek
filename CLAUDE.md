# Bibliothek

First-person 3D video game collection room. three.js + Vite + TypeScript, no framework. The player walks a real-scale
room, picks boxes off the shelves, reads them, plays longplays on the TV or projector; a cat lives there. Games are
earned: the front door teleports to an arcade (mini-games pay tickets, swapped for coins) and a flea market that sells
games; `?debug` restores the seed collection and the editor's add pane.

## Commands

```bash
npm run dev         # Vite dev server on :5173 (also serves /api/* via Vite plugins); the user usually has it running: check `lsof -i tcp:5173`, never start a second one
npm run typecheck   # tsc --noEmit (src) + tsc -p api — run after every change
npm run build       # typecheck + production bundle
```

## Working rules

- **Browser testing only when explicitly asked.** Never open Chrome or use browser tools on your own initiative; verify with
  typecheck + build and describe what to check. No test framework either: typecheck + build is the check.
- Strict TypeScript (`noUnusedLocals`, `noUnusedParameters`). Path alias `@/` -> `src/`. One concern per file; a new
  concept gets its own folder under `src/`. No logic in `index.html`; `src/main.ts` is wiring only.
- Positions and decoration are data in `src/world/roomPlan.ts` (`ROOM_PLAN`) and `src/world/<kind>/<kind>Plan.ts` for the
  other rooms; classes never hard-code where they stand.
- Units are metres, real-world scale (NES box 0.127 x 0.178 x 0.025, eye height 1.7).
- Keyboard input uses physical `KeyboardEvent.code` (WASD == ZQSD on AZERTY). Never `event.key`.
- Public, key-less data sources only (the user does not want to request API keys).
- Prefer the Edit tool over scripted replacement; a silent no-op replacement once caused a black screen.

## Where to look (load on demand, not all at once)

| Task | Read |
| --- | --- |
| Add / move a plant, lamp, rug, picture, table, new prop | skill `add-decor` (+ `docs/props.md`) |
| Add games or a platform | skill `add-games` |
| New key, click behaviour, feature, HUD element | skill `add-interaction` |
| A new room, corridor, the outside (zones, loading/unloading) | skill `add-room` (+ `docs/zones.md`) |
| Money, prices, arcade cabinets and their games, market stalls, going out (teleport) | `docs/economy.md` |
| Anything else: folder map, layers, key patterns, data sources | `docs/architecture.md` |
| The view outside the windows | `docs/outdoors.md` |
| The cat | `docs/cat.md` |

Layer order, outermost first: `worldPlan.ts` + the plan files (data) -> `layout.ts` + `src/world/<kind>/furnish<Kind>.ts`
(zone builders, the only wiring) -> zones (`src/world/zone/`: a room loads and unloads as one; positions are zone-local) ->
furniture classes in `src/world/**` -> engine (`core`, `player`, `input`, `interaction`) -> rules (`src/game/Session`).
Content work stays in the first two layers; the engine is never touched for content.

## Gotchas already hit

- `[hidden] { display: none !important; }` is global because `styles.css` sets `display` on some elements. Toggle with `el.hidden`.
- Chrome refuses a new pointer lock for ~1 s after Esc; `enterRoom()` in `main.ts` retries once.
- The canvas has `z-index: 1`; any HUD element needs a higher one (shared rule in `styles.css`) or it renders behind the 3D view.
- A JSDoc comment containing `*/` (e.g. a list of forbidden characters) ends the comment early.
- Point-light shadow bias is in units of the shadow camera's `far` (default 500 m); keep `shadow.camera.far` at room scale.
- `GameBox` material order is BoxGeometry's `[+x, -x, +y, -y, +z front, -z back]`; on +x the front edge is on the texture's left.
- The clock is ticked once by `Sky` in `main.ts`; never set `drivesClock` on a `RoomWindow` or the day runs twice as fast.
- Frame cost is per pixel (every fragment samples every shadow map) and Firefox does not throttle `requestAnimationFrame`
  on GPU load: the `Engine` gates rendering on a GPU fence and caps the pixel ratio. Measure with `?stats` + `bibliothek.bisect()`.
- `outdoors/shader.ts` is a template literal: a backtick in a GLSL comment ends it (typecheck fails with `',' expected`).
- Lights ignore wall planes: a room's lamp shines into the next room unless the wall is in `RoomOptions.opaqueWalls`; a
  `HemisphereLight` lights the whole scene, so only the occupied `Room` runs its ambient (`setOccupied`, wired in `main.ts`).
