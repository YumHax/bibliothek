# Outdoors (`src/world/props/outdoors/`)

The 360° view outside the windows, painted once at start from a sixth-floor street corner. Read this only when touching
what is seen through the windows.

## Model

- `Outdoors.material` is shared by every pane: it casts the eye ray through sky at infinity plus scenery on a 40 m sphere, so
  every window shows the same world with gentle parallax. Sky gradient, sunset glow, sun tint, night darkness, lights, sun and
  moon are uniforms: nothing repaints after start. Everything is true perspective from `EYE_HEIGHT`.
- `plan.ts` is the neighbourhood: Front Street ahead with mid-rise facades, Park Street to the left with the park;
  `frontage()` / `parkLine()` give distances.
- `Sheet`: three 4096 x 1024 canvases in azimuth x elevation band space. `begin(distance, glass)` then `rect` / `path` stamp
  colour, haze and glass at once; `lit(path, kind, strength, curfew)` / `glow` add night lights. `finish()` packs the scene
  texture (premultiplied day colours), the lights DataTexture (R warm, G cool, B glass, A depth via `encodeDepth`) and the
  curfew R8 texture (nearest, no mips: one byte per light = the wakefulness below which it goes out, 0 = burns all night).
- Painters, far to near: `Skyline` (towers), `Facades` (buildings, shops, windows, roofs; backdrops behind the park and over the
  street), `Park` (lawn, paths, pond, bandstand, hedge), `Street` (pavement, road, markings, lamps, parked cars, trees), `Tree`,
  `Car` (one box-model painter for parked cars and the sprite atlas: `CarBrush` = projection + fills), `SkyDetail` (stars +
  clouds equirect), `shader.ts` (GLSL), `paint.ts` (colour helpers).

## The near wall (not painted)

The panorama sits 40 m out, so it cannot show the building itself. The one piece of it in view, the kitchen wing's wall
facing +z outside the collection room's left windows, is `Outdoors.nearWall` (`KITCHEN_WING` in `worldPlan.ts`: flush
with the rearmost left window's back jamb, from the glass plane to the kitchen's far side plus `OUTER_WALL`, street to
roof; anything short of the jamb lets a sliver of street show between frame and wall): a rectangle the pane shader intersects
the eye ray with before the scenery (`nearWallColor`), in true perspective. Procedural plaster, a string course per
storey (`storey` = the street drop over `STOREYS_BELOW` floors, so the flat's floor is a storey line), a cornice, and
two bays of windows per storey below the flat's, lit at night by the same curfew rules as the painted ones. Rays
starting behind the plane (the kitchen's own window) never hit it. Move or resize the kitchen and the wall follows.

## Night

- `wakefulnessAt(hours)`: 1 by day and evening, ~0.1 between 2 h and 4 h. Lights are on or off, never dimmed.
- `lit()` rasterises a `Polygon` (a Path2D that keeps its corners) texel by texel onto the light and curfew canvases, no
  anti-aliasing; the shader (`lightTexel` / `sampleLights`) switches each of the four texels around the ray before blending.
- Each light comes on at dusk at its own point of the `litAlpha` ramp (`fract(curfew * 7)`, all-night lights first) and
  `step(curfew, wakefulness)` puts the windows out one by one. Curfews: homes uniform random, shops ~0.55-0.85 (bars 0.15-0.3),
  offices mostly 0.45-0.9, street lamps / signs / tower crowns 0.

## Life (the only thing that moves)

- Cars round the corner: both streets end there, two concentric routes, right-hand traffic (facing +z the right is -x),
  queueing, no crossing, positions interpolated between half-metre route samples. Walkers on the pavements and park paths.
- All are sprites the shader composites over the scenery: `SPRITE_COUNT` uniform vec4 slots (band rect, atlas rect,
  alpha/distance/lod/packed tint), hidden where the scenery depth (lights.a) is nearer.
- The atlas (2048², glow copy at half size on an opaque black canvas: additive light on a transparent canvas gets
  un-premultiplied to white at upload) holds a white car every 10° of view angle at 2 distances, tinted per car, plus
  pedestrians in two poses.
- `Life.update(dt, nightness, wakefulness)` divides the car spawn interval by wakefulness and fades the night owls out below
  their own `homeAt`. `Outdoors.update(dt)` is ticked by the window that drives the clock.

## Headless check (no browser)

Bundle the painters with esbuild (`--alias:@=./src`), run them in Node with `@napi-rs/canvas` shimming
`document.createElement('canvas')` and `Path2D`, then save `sheet.color.canvas` as PNG and look at it.
