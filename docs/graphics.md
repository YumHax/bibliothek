# Graphics (`src/graphics/`, `src/world/materials/`)

How the frame is shaded beyond the scene itself. Read this before touching the pipeline, a material helper, or
anything whose cost depends on the quality level.

## Quality levels (`graphics/quality.ts`)

`QUALITY` is resolved once at start: `?quality=low|medium|high`, else the player's choice (`localStorage`
`bibliothek.quality`, set in the menu's Settings screen, `ui/QualityPicker.ts`), else detected (touch -> low,
Firefox -> medium, else high). Materials and passes are built from it, so changing it reloads the page.

| | low | medium | high |
| --- | --- | --- | --- |
| Pipeline | plain forward render to the canvas (canvas MSAA) | `PostFx`: HDR target (MSAA 4), bloom, grade, auto exposure, depth of field | + SSAO |
| Materials | plain | plaster, wood grain + dust, floor wear, creases, scuffs, bevels | + clearcoat (boxes), sheen (fabric, fur) |
| Extras | env reflections, contact shadows, haze | + sun shafts and dust | + area lights (windows, TV), real mirrors, glossy market floor, cat fur shells |

Anything new that costs per pixel or a second render gets its own flag in `QualitySettings` and is off on `low`.

## The frame (`PostFx`)

Scene -> multisampled half-float target with a depth texture -> (high) AO from depth at half resolution + depth-aware
blur -> prep copy (depth of field while `Inspector.focusDistance` is set) -> `UnrealBloomPass` blended into the copy ->
16 x 16 light meter read back asynchronously every 0.25 s -> output shader: AO, exposure, ACES (three.js's fit),
sRGB, grade, vignette, grain, straight to the canvas.

- **Alpha is sacred.** The canvas is transparent where a video plays (cut-out over the CSS layer). Every pass keeps
  the alpha; additive effects (bloom, sun shafts, the glossy floor) use `CustomBlending` with `ZeroFactor/OneFactor` on
  alpha. The output is premultiplied (`rgb <= alpha`); the vignette is a black veil so it darkens the video too.
- Tone mapping happens in the output shader only: rendering to a target skips three's tone mapping, so custom
  `ShaderMaterial`s should still `#include <tonemapping_fragment>` + `<colorspace_fragment>` (no-ops off-screen,
  correct on `low`).
- `World.prime()` renders one frame through the pipeline (`Engine.renderFrame`): the off-screen shader variants are
  the ones the loop uses.
- The scene's MSAA buffer is invalidated after its resolve: never draw into `sceneTarget` after the scene render.

## Looks (`graphics/grade.ts`)

A `Look` = grade (exposure offset, contrast, saturation, temperature, lift / gain), vignette, grain, bloom strength
and haze. Zones pick one by name in `WORLD_PLAN` (`look: 'arcade'`); default `home`. `main.ts` calls
`graphics.setLook` on zone change; `PostFx` and `Haze` ease over about a second. The haze is a `FogExp2` always in the
scene (density 0 in the flat, so no recompile at doorways), its colour scaled by the room's `lightLevel`.

## Lighting helpers

- `Environment`: `RoomEnvironment` prefiltered once (PMREM) as `scene.environment`; `environmentIntensity` follows
  the player's room `Room.lightLevel` (0 dark .. 1 lamp or sun), max 0.24, so a dark room does not glow.
- Area lights: `RectAreaLight` per window (`RoomWindow.skyPanel`, sky ambient colour x daylight x curtains) and on the
  TV (`Television.panel`, the glow's drifting hue). Lights look down local -z: they are turned by pi. They count as
  scene lights (each one is evaluated for every fragment), so keep them few.
- `SunShaft` (in `RoomWindow`): the opening swept along the sun to the floor, ray-marched per fragment of its far
  side, mullions traced back to the glass; dust motes as points in the same prism.
- Contact shadows (`world/zone/ContactShadows.ts`): every placed item standing on the floor gets a soft blob the
  size of its feet, one instanced mesh per zone. Things that move set `contactShadow = false` and add `blobShadow()`
  as a child (the cat, its toy, people); so do shells and doors.

## Material helpers (`src/world/materials/`)

- `patchShader(material, key, patch)` / `afterChunk(source, chunk, code)`: `onBeforeCompile` patches that chain and
  share one program per key. `afterChunk` throws on a missing chunk so a three.js upgrade fails loudly.
- `wood(color, roughness)`: drop-in for `matte()` on timber (object-space grain, dust on up-facing faces, more above
  1.6 m). `woodGrain(material)` adds it to an existing one.
- `fabric({...})`: sheen on high. `plastic({...}, clearcoat)`: clearcoat on high. `scuffed(material)`: kicks and
  hand smudges by world height (door linings, baseboards).
- `surfaces.ts`: `wallMaterial` (plaster bump, creases at floor / ceiling / corners, grime, ghosts of frames; wall
  uvs are in metres), `edgeOcclusion` (floor and ceiling edges), `floorWearMap` (whole-floor roughness, lanes to the doors).
- `GlossyFloor`: a `Reflector` with a blurred additive Fresnel shader, from `RoomFinish.reflective`.
- `boxMesh` bevels its edges (`RoundedBoxGeometry`, face groups kept) unless the box is thin, huge or invisible.
- Mirrors: `props/MirrorGlass.ts` (`Reflector` on high, polished metal reflecting the environment otherwise).
