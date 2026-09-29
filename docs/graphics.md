# Graphics (`src/graphics/`, `src/world/materials/`)

How the frame is shaded beyond the scene itself. Read this before touching the pipeline, a material helper, or
anything whose cost depends on the quality level.

## Quality levels (`graphics/quality.ts`)

`QUALITY` is resolved once at start: `?quality=low|medium|high`, else the player's choice (`localStorage`
`bibliothek.quality`, set in the menu's Settings screen, `ui/QualityPicker.ts`), else detected (touch -> low,
Firefox -> medium, else high). Materials and passes are built from it, so changing it reloads the page.

| | low | medium | high |
| --- | --- | --- | --- |
| Pipeline | plain forward render to the canvas (canvas MSAA), the look's exposure only | `PostFx`: HDR target (MSAA 4) + FXAA, bloom, grade, auto exposure, depth of field | + SSAO |
| Materials | plain | plaster, wood grain + dust, floor wear, creases, scuffs, bevels | + clearcoat (boxes), sheen (fabric, fur) |
| Extras | env reflections (one, scaled per look), contact shadows, haze, dithered palette | + sun shafts and dust, reflections tinted per look | + area lights (windows, TV), real mirrors, glossy market floor, cat fur shells |
| Pixel ratio | 1.25, down to 0.75 while GPU-bound | 1.5, down to 1 | 1.5, down to 1 |
| Frame cap | 60 fps | 60 fps | display rate |
| Lights drawn (point + shadowed / spot + shadowed / hemisphere) | 5 + 2 / 6 + 3 / 2 | 8 + 3 / 10 + 4 / 2 | 12 + 5 / 16 + 5 / 2 |
| Live shadow refresh | 15 Hz | 30 Hz | every frame |
| Smallest shadow caster | 15 cm | 8 cm | 4 cm |
| Shadow maps (lamps / window and balcony suns / street sun) | 512 / 512 / 1024 | 1024 / 1024 / 2048 | 1024 / 2048 / 2048 |
| Anisotropic filtering (`QUALITY.anisotropy`, capped by the GPU) | 2 | 4 | 8 |

Anything new that costs per pixel or a second render gets its own flag in `QualitySettings` and is off on `low`.
Two deliberate exceptions stay on on `low`: the environment reflections (a fixed cost per lit fragment, and without
them plastic, glass and metal read flat; only one prefiltered map there) and the contact shadows (one instanced draw
per zone). The shadow filter is `PCFSoftShadowMap` on every level: three's `PCFShadowMap` is 17 taps against its 16,
so it would not be cheaper on `low`, only blockier. The high level's 2048 sun maps cost a depth render of the room
at 4x the texels while the sun is live (every frame on high); the lamps stay at 1024 (six faces each).

- **Tone mapping, one rule** (`graphics/displayTone.ts`): everything is tone-mapped with ACES on every level,
  `toneMapped: false` included (screens, neon, marquees, fairy lights). With `PostFx` a material cannot opt out (the
  output pass tone-maps every pixel; the alpha, the only spare channel, is the video cut-out), so on `low` the flag is
  made meaningless too (`Material.prototype.toneMapped` always reads true): a sign looks the same on every level.
  Tune a glow's colour and `emissiveIntensity` for ACES; the flag may stay, it does nothing.
- `toTexture` defaults to `QUALITY.anisotropy`; the floor and wall finishes (`Parquet`, `TiledFloor`, `Concrete`,
  plaster, wood grain) use it too. Pass a number only for a texture never seen at an angle.

## Frame budget (what keeps the cost down whatever the scene holds)

- **The loop** (`core/Engine`): a frame is rendered only once the GPU has finished the last one (a fence), and no sooner
  than `QUALITY.maxFps` allows (a 120 Hz screen would double the work). A display callback that renders nothing ticks
  nothing either: the updatables get the whole time owed on the next frame. `core/AdaptiveResolution` lowers the pixel
  ratio a step (x0.85) when a second of frames runs 20 % over the target and the GPU made most of them late (a slow frame
  spent in JavaScript is left alone). It raises the ratio again after 5 calm seconds; the wait before a rise doubles each
  time a rise is undone, so the ratio settles. The ceiling is the device's pixel ratio (capped by the level), read
  again on `resize` and when a `resolution` media query changes (the window moved to a screen of another density,
  a page zoom): `AdaptiveResolution.setRange`, never `renderer.setPixelRatio` directly. With `PostFx` a step
  reallocates nothing: the canvas stays at the ceiling ratio and `PostFx.setRenderScale(ratio / max)` draws the scene
  and the passes before the bloom into the lower-left share of the full-size targets (their viewport); every pass
  reads at `vUv * uvScale` and clamps its taps to `uvLimit`, the output stretches the share over the canvas, and the
  colour target is cleared outside it for the bloom (which runs on the whole target). A new pass must do the same.
  On `low` (no pipeline) the canvas itself is resized.
- **Lights** (`world/lighting/LightCuller`, `QUALITY.lights`): every light in the scene is evaluated by every lit
  fragment, dark or not, so only a fixed number of each kind is drawn (the rest `visible = false`, the counts fixed so
  nothing recompiles). Never set `visible` on a point, spot or hemisphere light: dim it (`intensity = 0`) or hide its lamp
  with `setShownKeepingLights`. Ranking: tier (outside any zone, the player's room, seen through a door, the rest),
  then intensity over squared distance, x0.05 once the eye is past the light's `distance` (+1.5 m), x2 when its reach
  is in the view frustum, x1.6 for a light already shown. A handover fades: the light losing its place fades out over
  0.35 s (still shown, so the count holds), then the next one is shown and fades in. The culler ticks late
  (`Engine.addLateUpdatable`) and writes `owner's intensity x fade` after the owners have set theirs; a value it did not
  write is the owner's new one. Before the owners tick (`Engine.addEarlyUpdatable`, `restoreOwners`) it hands each
  faded light its owner's value back, so an owner easing from `light.intensity` (projector, TV glow) never eases from
  the fade (that fed back: the base sank with the gain and the light lost its rank mid-fade); code that saves an intensity to restore later reads `intendedIntensity(light)` (`keepLights` does).
- **Shadow maps** (`world/lighting/shadowRefresh`): a live light (lit, in the player's room) redraws its map at
  `QUALITY.shadowRefreshHz`, never with a bare `shadow.autoUpdate = true`. `boxMesh` / `cylinderMesh` cast no shadow below
  `QUALITY.minShadowCaster`. Shadow-only casters (opaque-wall casters, window masks) are off the camera's layer 0.
- **The CSS3D layer** renders only while a video surface shows (`core/CssLayer`). The frame's brightness (exposure),
  contrast, saturation and depth-of-field blur are mirrored onto it as a CSS `filter` (`graphics` `VideoGrade` ->
  `CssLayer.setFilter`), rounded and written only when they change: no pass reaches the DOM behind the cut-out.
- **Pooled glows** (`world/lighting/LightPool`) re-rank a few times a second into preallocated arrays; a glow holding a
  light keeps it until a newcomer weighs 1.4x more (no trading back and forth along a row of cabinets).
- **The sky** notifies its listeners ten times a second (every frame during a lightning flash, `DayNight`).

## The frame (`PostFx`)

Scene -> multisampled half-float target with a depth texture -> (high) AO from depth at half resolution + depth-aware
blur -> prep copy (the AO applied with a depth-weighted upsample, so no halo at silhouettes and no glow darkened after
the fact; depth of field while `Inspector.focusDistance` is set: a spiral rotated per pixel, 16 taps, 32 past 6 px) ->
`UnrealBloomPass` (first level at half the frame, soft knee `smoothWidth` 0.15) blended into the copy -> every 0.25 s
the light meter: the copy averaged to a quarter then a sixteenth (log luminance, weighted by alpha), a 16 x 16 map read
back asynchronously -> output shader: FXAA (medium, high: on Karis-compressed HDR, alpha blended too), white balance
(the look's `temperature` as a von Kries / Bradford matrix built on the CPU, `graphics/whiteBalance.ts`, applied in
linear HDR before tone mapping; 60 mireds per unit, luminance kept), exposure, ACES (three.js's fit), sRGB, grade
(lift / gain, contrast, saturation), vignette, grain, straight to the canvas.

- The AO spares glowing pixels (`mix(ao, 1, smoothstep(1, 3, luma))`: a lamp or a screen is light, not a crease) and
  thins with the haze (`1 - exp(-(density z)^2)`, the `FogExp2` density handed to the prep pass each frame).
- The camera's far plane is 220 m (Front Street runs to x 136 from a walkable -39.5); the sky dome sits on the far
  plane in its vertex shader, so its radius only has to stay inside it.

- **Alpha is sacred.** The canvas is transparent where a video plays (cut-out over the CSS layer). Every pass keeps
  the alpha; additive effects (bloom, sun shafts, the glossy floor) use `CustomBlending` with `ZeroFactor/OneFactor` on
  alpha. The output is premultiplied (`rgb <= alpha`); the vignette is a black veil so it darkens the video too.
- Tone mapping happens in the output shader only: rendering to a target skips three's tone mapping, so custom
  `ShaderMaterial`s should still `#include <tonemapping_fragment>` + `<colorspace_fragment>` (no-ops off-screen,
  correct on `low`).
- `World.prime()` renders one frame through the pipeline (`Engine.renderFrame`): the off-screen shader variants are
  the ones the loop uses. Before it, every `ShaderPrimer` in the scene (one per class: `GameBox`) hands a throwaway
  copy of what it only draws later (the openable shell, cartridge and manual with their maps), compiled with the
  scene's lights (`Engine.compileScene(standIn, scene)`) and dropped undisposed (disposing would free the programs):
  the first box picked up links nothing. `Engine.compileScene` is `renderer.compileAsync` (the target bound first);
  `primeAsync` / `prepareZone` race it against `PRIME_WAIT_MS`. `World.lights` (a `LightMonitor`, `world/lighting/lightBudget.ts`) checks the drawn lights
  every 2 s: an error when shadow maps + `MATERIAL_UNITS` pass `capabilities.maxTextures` (lit programs would fail to
  link), and with `?stats` / `?debug` a warning naming the lights that came or went within one set of active zones
  (each change recompiles every lit program).
  `World.primeAsync()` does the same after a trip, waiting for the driver's parallel compile before the frame.
- **Settling after a trip**: `Travel`'s prepare calls `graphics.settle()` before `primeAsync`: look, haze, reflections
  and exposure jump to where their easing is heading, and the next light reading moves the eye at once. Walked zone
  changes (the sas) keep easing.
- The scene's MSAA buffer is invalidated after its resolve: never draw into `sceneTarget` after the scene render.

## Looks (`graphics/grade.ts`)

A `Look` = grade (exposure offset, contrast, saturation, temperature, lift / gain), vignette, grain, bloom strength,
haze and reflections (tint, strength). Zones pick one by name in `WORLD_PLAN` (`look: 'arcade'`); default `home`.
Looks: `home` (warm den; its temperature is only 0.07 because the lamps, the gain 0xfff6ea and the reflection tint are
warm already), `arcade`, `market`, `street`, `stairwell` (cool, a little desaturated, a faint dust haze 0.012) and
`shop` (every shop zone, via `shopZone`: neutral, crisp, low vignette).
`bootstrap/world.ts` calls `graphics.setLook` on zone change; `PostFx`, `Haze` and `Environment` ease over about a
second (on `low`, the exposure only, through `renderer.toneMappingExposure`). The haze is a `FogExp2` always in the
scene (density 0 in the flat, so no recompile at doorways), its colour scaled by the room's `lightLevel`.

- **Grade colours are display values**: `shadows` / `highlights` apply after ACES and sRGB, so their hex is read as
  is (`displayColor`, `setHex(hex, LinearSRGBColorSpace)`): 0x0a0604 lifts black by 10/255, 0xfff6ea is a gain of
  (1, 0.965, 0.918). Never `Color.set(hex)` for them (that converts to linear: a lift ten times too small).
- **`Haze` is the one writer of `scene.fog`.** Content whose air follows the weather (`StreetLighting`) hands it
  `Haze.of(scene).setAir(density, colour)` each frame it is occupied and `setAir(null)` on leaving; the fog eases to
  either. The street's hemisphere eases in and out too (at once only when its zone deactivates).
- **Reflections per look** (`Environment`): on medium and high each tint is its own `RoomEnvironment` PMREM (its lights
  and glowing panels times the tint), prefiltered at idle after start (`prewarm`) and kept (~6 MB each); a swap dips
  the intensity quickly to half the room's and swaps at 60 % (at once in a dark room), then eases back up: the glossy
  things never go dull (same size: no recompile).

## Depth and z-fighting

- The camera's near plane is 0.1 m (`core/Engine`), the scene target's depth 24 bits: a depth step is about
  `z² / (near · 2²⁴)` m at distance `z` (0.1 mm at 12 m, 0.5 mm at 30 m, 2 mm at 60 m). Offsets below that fight.
- Flat things on a surface take a layer of `world/surface/layers.ts` (`FLOOR`, `GROUND`, `WALL`: a lift in metres and a
  rank turned into a polygon offset by `onSurface`); transparent things a `RENDER_ORDER` band. Parts of a prop never
  share a face (`world/props/joinery.ts`). `bibliothek.zfight()` (`?debug`) finds what still fights.
- Not used, on purpose: `logarithmicDepthBuffer` (writes `gl_FragDepth`, so no early-Z, and PostFx decodes depth
  linearly); reversed-Z (r169's is experimental: `perspectiveDepthToViewZ`, the AO's inverse projection, the polygon
  offsets' sign and the `Reflector`s' oblique clipping would all need changing; worth it only with a three.js upgrade).

## Lighting helpers

- The light budget (`world/lighting/`): the flat's zones are all neighbours, so every lamp of the flat is in every lit
  shader; a new lamp stays shadowless. Decorative glows that only light their surroundings are `PooledLight`s sharing a
  zone's `LightPool` (a fixed handful of real point lights lent to the heaviest glows near the viewer, faded over
  0.35 s, the count never changing): the arcade's screens and claw machine (`ARCADE_PLAN.glowLights`). Hidden lamps keep
  their (dark) lights: `setShownKeepingLights`.

- **Lamp colours** (`world/lighting/lampColours.ts`): every lamp's colour comes from its kind's colour temperature
  (`LAMP_KELVIN`: incandescent 2700 K, halogen 3000, LED 4000, sodium 2000): the black body's colour relative to a
  6504 K white, carried part of the way back to white for the eye's adaptation. `LAMP_LIGHT` (the light thrown, 35 %),
  `LAMP_GLOW` (the bulb, diffuser, shade or globe's emissive, 50 %: a glowing bulb reads whiter), `LAMP_BOUNCE` (off
  white paint, 80 %: the ceiling's stand-in emissive). The flat's table, floor, bedside, reading, industrial lamps,
  sconces and the stair bulbs are incandescent; the ceiling lamp (`Room`, `PendantLamp`) and the shelf lamps LED; the
  street lamps sodium. A new lamp picks a kind, never a hex. They are shared colours: copied, never edited.
- **Floor bounce** (`world/lighting/floorBounce.ts`): a room's hemisphere ground colour is its floor's albedo (material
  colour x the colour map averaged on an 8 px canvas, in linear) x 0.6, a little desaturated; the old per-floor table
  in `Room` is the fallback when the map cannot be read. Rugs are not counted.
- `Environment`: `RoomEnvironment` prefiltered (PMREM, one per look's tint on medium / high) as `scene.environment`;
  `environmentIntensity` follows the player's room `Room.lightLevel` (0 dark .. 1 lamp or sun), max 0.24 times the
  look's `reflections.strength`, so a dark room does not glow.
- Area lights: `RectAreaLight` per window (`RoomWindow.skyPanel`, sky ambient colour x daylight x curtains) and on the
  TV (`Television.panel`, the glow's drifting hue). Lights look down local -z: they are turned by pi. They count as
  scene lights (each one is evaluated for every fragment), so keep them few.
- `SunShaft` (in `RoomWindow`): the opening swept along the sun to the floor, ray-marched per fragment of its far
  side, mullions traced back to the glass; dust motes as points in the same prism.
- Contact shadows (`world/zone/ContactShadows.ts`): every placed item standing on the floor gets a soft blob the
  size of its feet, one instanced mesh per zone (opacity 0.5, 0.32 with SSAO, which darkens the same creases), scaled by
  the occupied room's ambient share (`Room.ambientShare` -> `setContactShadowStrength`: 55 % where the light is all
  direct, lamp or sun, full at dusk with the lamp off; neutral outside a `Room`). Things that move set `contactShadow = false` and add `blobShadow()`
  as a child (the cat, its toy, people); so do shells and doors.
- Shadow proxies: many small casters cost a draw each in every shadow pass (6 per point lamp). A `Shelf` casts its
  boxes' shadows as one `InstancedMesh` of plain boxes whose only layer is the zone's shadow layer (the camera never
  draws it); the boxes themselves have `castShadow` off until taken in hand. Same trick for any dense row of props.
- Game boxes: a resting box is one mesh with one texture (`ClosedBox` + `covers/generated/BoxAtlas`); the openable
  shell (tray, lid, cartridge, manual) and the textures only it shows exist while it is in hand. Generated spines are
  drawn at 512 px, backs at 512 px tall (layouts in their original units, `ctx.scale`).

## Material helpers (`src/world/materials/`)

- `palette.ts`: the shared materials (`paint`, `timber`, `standard`, `basic`, `METAL`, `shared`, `invisible`), one per
  look for the page and marked shared (`sharedResources.ts`: `markShared`, `disposeTree`). A material a class mutates
  stays its own. See docs/props.md "Materials, joints and layers".

- `patchShader(material, key, patch)` / `afterChunk(source, chunk, code)`: `onBeforeCompile` patches that chain and
  share one program per key. `afterChunk` throws on a missing chunk so a three.js upgrade fails loudly.
- **Metalness is 0 or 1.** Raw metal (steel, brass, chrome, a mirror's silvering) is `metalness: 1`, its colour the
  reflectance, its roughness the finish (chrome ~0.15, brass ~0.3-0.45, brushed steel ~0.4, galvanised ~0.5); painted,
  enamelled or blackened metal, glass, plastic, water are `metalness: 0`. An in-between value reads as murky plastic.
  `METAL.*` follows it; `hoverGlint` finds fittings by `metalness >= 0.5`, so painted ones fall back to "small parts".
- `wood(color, roughness)`: drop-in for `matte()` on timber (object-space grain shifted by a hash of the mesh's, or
  instance's, position so boards cut alike differ; the grain's slope as a faint relief; dust on up-facing faces, more
  above 1.6 m). `woodGrain(material)` adds it to an existing one.
- `fabric({...})`: sheen on high. `plastic({...}, clearcoat)`: clearcoat on high. `scuffed(material)`: kicks and
  hand smudges by world height (door linings, baseboards). `foliage({...})`: a leaf that lets the light on its far
  side through, tinted, and wraps it past the terminator (its own `RE_Direct`, detailed materials only).
- `backlight.ts` (`Backlight`): curtains and blinds glow with the sky behind the glass where they cover it (emissive
  times their albedo, `RoomWindow` feeds the sky colour and daylight). `paneReflection.ts`: the room given back by a
  window pane (a black dielectric over the pane, additive, alpha untouched; faint smudges; ~8x stronger at night).
- `surfaces.ts`: `wallMaterial` (plaster bump, creases at floor / ceiling / corners and round the doorways, grime,
  ghosts of frames kept clear of openings; `avoidOnWall` moves the ghosts clear of what hangs or stands against the
  wall, `Room` calls it once the zone is furnished; wall uvs are in metres), `edgeOcclusion` (floor and ceiling
  edges), `floorWearMap` (whole-floor roughness at 512 px, lanes to the doors and a fine mottle, cached per floor).
- `Parquet`: the 2.4 m tile is dealt out per plank row in the shader (a hashed source row, shift and flip, read with
  the floor's own derivatives), each plank its own sheen; plank ends bevelled in the bump.
- `mouldings.ts`: the skirting (ogee top) and the crown cove are swept profiles, mitred into the corners, capped at
  doorways, cached per run length; the faces against the wall, floor and ceiling are left out.
- `GlossyFloor`: a `Reflector` with a blurred additive Fresnel shader, from `RoomFinish.reflective`. Its texture is
  half the drawing buffer in its proportions, long side at most 640 px (checked before each render, resized only on a
  window resize); the nine-tap blur is a share of the view, twice as long along it as across (the glossy streak).
- `boxMesh` bevels its edges (`RoundedBoxGeometry`, 2 segments, face groups kept) unless the box is thin, huge or
  invisible; `cylinderMesh` fillets its rims (a 2.5 mm lathe) under the same rule, and not when its material has a map.
  `boxMesh` / `cylinderMesh` / `invisibleHitbox` geometries are cached per size and shared: never edited in place.
- Mirrors: `props/MirrorGlass.ts` (`Reflector` on high, polished metal reflecting the environment otherwise).

## The street's extras (`src/world/street/`)

- `snowCovered(material)` (`snowCover.ts`, patch key `streetSnow`): whitens up-facing faces by their world normal
  (instancing included), rougher, not metallic, times the one `STREET_SNOW` uniform `StreetGround` writes from
  `SkyState.snowCover`. On everything that stands in the street.
- `relief/ShopInteriors`: interior mapping, a ray-box trace per fragment of the "room" behind each shop window (walls,
  floor, ceiling and back wall painted per kind on an atlas, lit while the shop is open), one draw call; off on low.
- `relief/WetGround`: light streaks under lamps, neon and lit windows, and puddle decals, additive, keeping the canvas
  alpha; on `QUALITY.reflections` a `Reflector` over the walkable road masked by the puddles, hidden while dry (it costs
  one more scene render only when wet). `relief/ShopGlow` (light pools in front of open shops) is additive too.
- `StreetCrowd`'s people fade with `alphaHash` (`PersonModel.enableFade`): no sorting, a dithered fade.

## Photo mode (`src/photo/`)

`PhotoMode` hides the HUD (`body.photo-mode`), parks the player like in an armchair (walking stops, the look stays
free) and flies the camera itself: WASD along the view, Space / Shift up and down, on a leash of 4 m round where it
started (through furniture, never out of the building; no collisions, by choice). Leaving puts position, rotation and
FOV back exactly. The lens is `PostFx.setLens({ focus, blur, exposure })`: the DOF prep pass with the photo's focus and
blur radius (beyond the focus distance only, like the reading eye) and extra stops on the output exposure; `setLens(null)`
hands them back to the held box and the light meter. On `low` there is no `PostFx`: no lens, the card says so. Grades
(`photoLooks`) are functions of the zone's look (the haze stays), set with `graphics.setLook(look, true)` and restored
on exit. A photo: `engine.renderFrame()` then, in the same task, the canvas drawn over black into a 2D canvas cropped
to the guide (`frames.cropOf`) and saved as a PNG; black under the alpha cut-outs (a playing screen is a hole in the
canvas onto the CSS layer, which a canvas read cannot see). Keys are the action table's (`input/actions`: `photoMode` P to enter and leave,
the `photo` context while active); the Session's `PhotoControl` route (right after the arcade's) hands every key to
`handleKey` while it is on; held ones are read each frame. Made in `bootstrap/input`.
