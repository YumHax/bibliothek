# Bibliothek

First-person 3D video game collection room. three.js + Vite + TypeScript, no framework. The player walks a real-scale
room, picks boxes off the shelves, reads them, plays longplays on the TV or projector; a cat lives there. Games are
earned: the front door opens on the building's stairwell, whose street door teleports to Front Street (shops, an arcade whose
mini-games pay tickets, swapped for prizes or coins, and a flea market that sells games). So is the flat: it starts bare
(one bookcase, one game, the TV, a mattress; no cat), the rest is bought in Front Street's shops (docs/economy.md "The
bare flat"). `?debug` restores the seed collection, the furnished flat and the editor's add pane.

## Commands

```bash
npm run dev         # Vite dev server on :5173 (also serves /api/* via Vite plugins); the user usually has it running: check `lsof -i tcp:5173`, never start a second one
npm run typecheck   # tsc (src + api) + the checks: conventions, imports, docs paths, data, zfight, scene-lint (~10 s) — run after every change
npm run lint        # eslint (bug rules only) + cspell + knip (an export nobody imports fails) (~20 s) — before a commit; in build
npm run build       # typecheck + lint + production bundle + scripts/check-bundle.mjs (chunk sizes vs scripts/bundle-baseline.json)
npm run balance     # the arcade's machines played headless by simulated people: what each pays (docs/economy.md)
npm run zfight      # props, rooms and the street built headless, z-fighting faces vs scripts/zfight-baseline.json (in typecheck)
npm run scene-lint  # the same subjects: light budgets, sunk / floating / overlapping props, disposal vs scripts/scene-baseline.json (in typecheck)
```

## Working rules

- **Browser testing only when explicitly asked.** Never open Chrome or use browser tools on your own initiative; verify with
  typecheck + build and describe what to check. No test framework either: typecheck + build is the check.
- Strict TypeScript (`noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noImplicitReturns`). Path alias `@/` -> `src/`. One concern per file; a new concept gets its own folder under `src/`.
  No logic in `index.html`; `src/main.ts` only calls the `src/bootstrap/*` steps, which are wiring only.
- The checks are the net (docs/checks.md): the layer order is enforced on the import graph, an export nobody imports is
  removed (not kept for later), a headless script imports through `src/headless/`, and a check that would fail on what is
  already there takes a baseline (`--write-baseline` after a look), never a looser rule.
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
| Box sizes, cases, cartridges and discs, how boxes open, putting a game in its console, programs on the TV (`src/onscreen/`, the NES emulator, homebrew carts) | `docs/media.md` |
| New key, click behaviour, feature, HUD element | skill `add-interaction` |
| A new room, corridor, the outside (zones, loading/unloading) | skill `add-room` (+ `docs/zones.md`) |
| Money, prices, arcade cabinets and their games, market stalls, going out (teleport); copies (variants, provenance, bootlegs, region lock), the saleroom, sealed cartons, the rival collector, small ads and the seller's flat | `docs/economy.md` |
| Dressing a walk-in shop's interior (plans per shop, props by name, signs, lights, budgets) | `docs/shops.md` |
| Anything else: folder map, layers, key patterns, data sources | `docs/architecture.md` |
| The view outside the windows | `docs/outdoors.md` |
| The cat | `docs/cat.md` |
| People's bodies and motion (rig, gait, feet, IK, gestures, reactions, faces, a machine directing a body) | `docs/people.md` |
| Friends who visit, borrow and return games; games nights, open houses, the collectors' club's visit (gatherings) | `docs/visitors.md` |
| The building's life (neighbours, friendship, notice board, concierge, co-owners' vote, power cut, noise, Mrs Roux's move, estate sale, party, treasure hunt) | `docs/building.md` (+ `docs/zones.md` for its places) |
| The lost prototype's trail (clues by channel, the grey cart, its demo on the TV), the press reviews card, sharing the collection, the save file | `docs/story.md` (+ `docs/architecture.md` data sources) |
| What the kitchen, bathroom and bedroom are for (cleaning boxes, the bath, cake, radio, manuals, outfits, phone, dreams); the home arcade, the turntable, repairing a console | `docs/household.md` |
| Moving boxes to any shelf spot, moving the flat's furniture (right-click, grid, planning view, storage), the player's shelf arrangement, making a piece movable; displays (case, pedestal), shelf labels, tipping a box out | `docs/furnishing.md` |
| Telling the player something (speech bubbles, reactions, rewards, tips, cards to read); no toasts | `docs/notices.md` |
| Post-processing, quality levels, looks, material helpers (wood, fabric, plaster), reflections | `docs/graphics.md` |
| Materials, how parts meet, anything flat on a surface (z-fighting), hiding lamps | `docs/props.md` "Materials, joints and layers" |
| What each check enforces (conventions, imports, docs paths, data, zfight, scene-lint, bundle, lint), its baseline and opt-out, adding a rule | `docs/checks.md` |
| A panel or menu (the kit: CardPanel / SheetPanel, the `html` tag, widgets, confirm twice, dialogs), the CSS tokens and components | `docs/ui.md` |
| People, relationships, talking, perks and penalties (warmth and trust, tiers, the conversation panel, the People book, the phone's contacts) | `docs/social.md` |

Layer order, outermost first: `worldPlan.ts` + the plan files (data) -> `layout.ts` + `src/world/<kind>/furnish<Kind>.ts`
(zone builders, the only wiring) -> zones (`src/world/zone/`: a room loads and unloads as one; positions are zone-local) ->
furniture classes in `src/world/**` -> engine (`core`, `player`, `input`, `interaction`) -> rules (`src/game/Session`).
Content work stays in the first two layers; the engine is never touched for content.

## Gotchas already hit

- `[hidden] { display: none !important; }` is global because `styles.css` sets `display` on some elements. Toggle with `el.hidden`.
- Chrome refuses a new pointer lock for ~1 s after Esc; `PointerLockFlow` retries once.
- The canvas has `z-index: 1`; any HUD element needs a higher one (shared rule in `styles.css`) or it renders behind the 3D view.
- A JSDoc comment containing `*/` (e.g. a list of forbidden characters) ends the comment early.
- Point-light shadow bias is in units of the shadow camera's `far` (default 500 m); keep `shadow.camera.far` at room scale.
- `GameBox` material order is BoxGeometry's `[+x, -x, +y, -y, +z front, -z back]`; on +x the front edge is on the texture's left.
- The clock is ticked once by `Sky` (`bootstrap/services.ts`); never set `drivesClock` on a `RoomWindow` or the day runs twice as fast.
- Frame cost is per pixel (every fragment samples every shadow map) and Firefox does not throttle `requestAnimationFrame`
  on GPU load: the `Engine` gates rendering on a GPU fence and caps the pixel ratio. Measure with `?stats` + `bibliothek.bisect()`.
- Every shadow-casting light is one texture unit in every lit shader of the scene (the flat: ~10 of 16, the material's
  own maps take the rest). One too many and every lit program fails to link: walls, floor and furniture go black while
  unlit things (outdoors, whiskers) still show. `World.prime` logs `[world] N shadow maps`; new lamps stay shadowless. The parquet and tiled floors sit at exactly
  16 units on high (10 shadow, env, 2 area-light, map, bump, wear): no new map on a floor.
- A render nested in the main one (the outlook panes' `onBeforeRender`) leaves its `clippingPlanes` as the global clip for
  the rest of the frame (three.js never re-inits clipping): things vanish depending on the view. `OutlookView.resetClipping` undoes it.
- Shaders live in `.glsl` files imported `?raw` (`scripts/check-glsl.mjs` parses them); what TypeScript knows comes in
  through `assemble()` (`graphics/glslAssemble`) as `TS_*` defines and `#include <name>` chunks. The chunk constants and the
  fragments spliced into three.js's chunks stay template literals: a backtick in a GLSL comment there ends the literal.
- A `patchShader` whose source holds a variable array size (`uniform vec4 x[${n}]`) needs `n` in its key, or two
  materials share one program and three.js reads past the shorter array (`array[i] is undefined` in `setValueV4fArray`).
- The canvas's alpha is the video cut-out: every post pass and additive effect must keep it (see `docs/graphics.md`).
- `visible` on point, spot and hemisphere lights belongs to the `LightCuller` (fixed count per kind, `QUALITY.lights`):
  dim a light with `intensity`; live shadow maps go through `lighting/shadowRefresh`, never `shadow.autoUpdate = true`.
- Lights ignore wall planes: a room's lamp shines into the next room unless the wall is in `RoomOptions.opaqueWalls`; a
  `HemisphereLight` lights the whole scene, so only the occupied `Room` runs its ambient (`setOccupied`, wired in `bootstrap/world.ts`).
- Z-fighting comes back whenever two faces share a plane: take materials from `world/materials/palette`, join parts per
  `world/props/joinery`, lift flat things by a layer of `world/surface/layers`, then check `bibliothek.zfight()` (`?debug`).
- `boxMesh` / `part` / `cylinderMesh` geometries are cached and shared, palette materials too: never edit either in place.
- Days: `ctx.today.gameDay` (the market calendar) or the real date through `time/daily`; never `new Date()` for a draw.
- The floor is at world y 0 everywhere but the stairwell and the street's carriageway (−0.12, `street/relief/ground`
  `groundHeight`, dropped kerbs at the crossings): the eye is the feet's height (`FirstPersonController.setGround`, both
  grounds composed in `bootstrap/world.ts`) plus eye height, collision probes follow the feet, and `Travel` passes the arrival's y.
