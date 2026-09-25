# Outdoors (`src/world/props/outdoors/`)

The 360° view outside the windows, painted once at start from a sixth-floor street corner, plus the weather over it
(`src/world/weather/`) and the street's sound (`src/audio/StreetAmbience.ts`). Read this only when touching what is seen
or heard through the windows.

## Model

- `Outdoors.material` is shared by every pane (and the balcony's surround, `balcony/OpenAir.ts`, a BackSide sphere with its
  own material object on the same uniforms): the sky at infinity, then the scenery where the eye ray really meets it. The
  painting was made from one eye (`center`); from anywhere else the shader starts on a 40 m sphere and takes
  `PARALLAX_STEPS` (6) fixed-point steps: read the painted depth along the current direction, move to the point of the ray
  that far from the painting's eye. So every window (the kitchen's too, the balcony) sees the near pavement shift more than
  the skyline; a thin sliver where something nearer uncovers what it hid is stretched from its neighbour. Sky gradient, sunset glow, sun tint, night darkness, lights, sun,
  moon, clouds and weather are uniforms: nothing repaints after start. Everything is true perspective from `EYE_HEIGHT`.
- `plan.ts` is the neighbourhood: Front Street ahead with mid-rise facades, Park Street to the left with the park, our own
  pavement (`NEAR_KERB`) under the windows; `frontage()` / `parkLine()` give distances. Both streets end at a building
  standing across them (`FRONT_END`, `PARK_END`, painted by `paintStreetEnds`); `ground(a, offset)` is `frontage()` stopped
  at those, and every ground band, line and row of street furniture must stop there too. It also holds what the painters
  and `Life` share: `BUS_STOP_X`, `POND` / `FOUNTAIN`, `PARK_PATHS`, the traffic and cycle lanes (`NEAR_LANE`, `FAR_LANE`,
  `CYCLE_NEAR`, `CYCLE_FAR`), `WALK_LINE` and `LIFE_REACH` (62 m: how far out along both streets what moves is
  simulated; not `FRONT_END`, the end building). Behind the room (x > 0, z < 0,
  azimuth +90°..180°, `COURT_*`) is our own block's courtyard: no street painter belongs there, the seam at ±180° is our
  side wall's plane (Park Street on one side, the courtyard on the other).
- `paintView()` (in `Outdoors.ts`) runs the painters in order and is what the headless check calls.
- `Sheet`: five 4096 x 1344 canvases in azimuth x elevation band space (+40° down to -80°, the pavement under the window).
  `begin(distance, glass, surface)` then `rect` / `path` stamp colour, haze, glass and the weather masks at once;
  `lit(path, kind, strength, curfew, animated)` / `glow(..., curfew?)` add night lights; `dim()` darkens light already lit
  (goods in a shop window, a figure in a room); `shadow()` / `shadowFill()` cast shadows. `finish()` packs the scene texture
  (premultiplied day colours), the lights DataTexture (R warm, G cool, B glass, A depth via `encodeDepth`), the curfew R8
  texture (nearest, no mips: one byte per light = the wakefulness below which it goes out, 0 = burns all night) and the ground
  texture (R cast shadow, G how wet the surface gets, B how much snow it catches), and the `fx` texture (nearest): R how many
  texels a thing sways at full wind x 16, G its sway phase + 128 on the thing itself (without: the margin it sways into),
  B a roller shutter's curfew. Trees call `swaying(top, bottom, amplitude, phase)` after `begin()` (0 at the foot, most at
  the crown's top) and `swayMargin()` round the crown; any later `rect`/`path` clears both. `shutter(p, curfew)` after a
  shop's silhouettes: the shader draws a ribbed, unlit shutter while the wakefulness is below it (shut at night, until opening
  in the morning); an awning or a tree painted over it later hides it.
- Light kinds: `warm`, `cool`, `neutral` (both channels, whiter). A curfew byte of 7 mod 8 is **animated**: a cool light
  flickers like a TV, a warm one blinks like an aviation beacon; 6 mod 8 is a **fairy light** (`fairy()`): it twinkles texel
  by texel in the colour painted under it (paint the bulb first). `curfewStyle` keeps every other light off both residues.
- Window life (shader, `lightTexel`): a lit window with a curfew (homes, shops; not lamps or signs) now and then has a figure
  cross it (a dark band sliding over the light, 23 s slots hashed from the curfew), and a quarter of them lower their blinds
  (dimmer, slatted) between 21 h and 22 h (`wakefulness` 0.84-0.99).
- Shadows are painted straight under what casts them, never offset, and the shader scales them by `sunShadow` (sun height x
  clear sky), so they never point the wrong way and vanish under cloud. Balcony and awning shadows on walls stay in the colour.
- Painters, far to near: `Skyline` (towers, beacons on the tallest), `Facades` (a random `Architecture` per building; roofs
  with skylights, AC units, dishes; windows lit warm/neutral/TV, curtains drawn, silhouettes; backdrops; street ends), `Park`,
  `Street` (both pavements, road with repairs/cracks/drip lines/arrows, then everything standing on the pavements sorted far
  to near, shop light spilling out until closing), `Courtyard` (last, over the street bands in its quarter: rear facades at
  15-28 m in true perspective via its own `CourtWall` frame, stacked balconies with washing, stairwell timer lights, TVs;
  roofs and chimneys; setts, lawn, tree, bins, bikes, shed; nothing may reach x < 0), `Tree`, `Car` (`VehicleBody`: `CAR_BODY`, `TAXI_BODY`, `BUS_BODY`, `VAN_BODY`, `AMBULANCE_BODY`, `TRUCK_BODY`; `cargo` adds a load box behind the cab), `SkyDetail`,
  `shader.ts` (GLSL), `paint.ts`.
- Helpers: `FacadeFrame`, `Shopfront` (shop types, lettering, displays; `Storefront` carries its light, closing curfew and
  `goods` boxes; `RETRO_GAMES` and its neighbours across the street are where the walkable street has them:
  `paintFrontBlock` paints that row from `street/streetPlan.FACADES`, x shifted by `FLAT_IN_STREET`, storeys and
  shops by kind and name as `PlannedShop`s; the rest of the block beyond is drawn by lots), `StreetFurniture` (lamps with ground pool, small
  halo and wall wash; benches, bins, bikes, planters, scooters, newsstand, bus shelter...), `ParkFeatures`, `Solid`.
- `Holiday.ts` (`currentHoliday()`, `holidayOf(date)`, `?holiday=christmas|halloween|none`): at Christmas (1 Dec - 6 Jan)
  strings of fairy lights slung across both streets (pieces sorted in with the street's furniture), bulbs in the street
  trees, a lit fir with a star in the park (sorted in with the park); at Halloween (21-31 Oct) orange and violet strings and
  candle-lit pumpkins on a fifth of the lit sills. Decorations draw from their own random sequence (`beginHoliday()`), so a
  holiday never changes a building. Spring petals blow past on the wind (shader, `petals` uniform) while the trees flower.
  The rooms and the walkable street dress up from the same holiday (`currentFestivities()`, which adds `newyear` from
  30 Dec to 3 Jan or with `?holiday=newyear`): plan `decor` entries with a `holiday` gate (docs/props.md).
- `season.ts`: the painters read the season (`currentSeason()`) set by `paintView`: spring blossom and fresh lawn, autumn
  turning by `depth` (litter under the trees, the late ones bare), winter bare broadleaves and empty flower beds. From the real
  calendar; `?season=winter` or `?season=autumn:0.9` overrides (parsed in `bootstrap/services.ts`).
- The retro games shop is a window on the market (`RetroShopLure`, made in `bootstrap/world.ts`): every 3 s it shows the day's stock
  (`Outdoors.showShopStock()`, platform accent colours onto the shop's `goods` boxes, one texture re-upload), and on a new
  market day, until the player has been in the `market` zone, a NOUVEAUTÉS banner (`showShopBanner()`, mirrored lettering,
  the texels under it kept to take it down) and a queue of 2-6 at the door (`Life.setShopQueue`).

## The near wall (not painted)

The panorama sits 40 m out, so it cannot show the building itself. The one piece of it in view, the kitchen wing's wall
facing +z outside the collection room's left windows, is `Outdoors.nearWall` (`KITCHEN_WING` in `worldPlan.ts`): a rectangle
the pane shader intersects the eye ray with before the scenery (`nearWallColor`), in true perspective, with string courses,
a cornice and two bays of windows per storey lit by the same curfew rules. Rays starting behind the plane never hit it.

## Night

- Sun: `DayNight` follows today's real sunrise and sunset (`solar.ts`, NOAA equations, no network) for the time zone's city
  (`localPlace`, a table of ~25 zones, else 50°N on the zone's meridian; `?lat=` overrides the latitude). `sunHeight` is
  0 at sunrise/sunset, 1 for a sun 60° up (a winter noon peaks ~0.3 in Berlin), -1 at the night's lowest point.
- `wakefulnessAt(hours)`: 1 by day and evening, ~0.1 between 2 h and 4 h (clock-based, like shop hours: not the sun).
  Lights are on or off, never dimmed.
- `lit()` rasterises a `Polygon` texel by texel onto the light and curfew canvases, no anti-aliasing; the shader
  (`lightTexel` / `sampleLights`) switches each of the four texels around the ray before blending.
- Each light comes on at dusk at its own point of the `litAlpha` ramp and `step(curfew, wakefulness)` puts it out.
  Curfews: homes uniform random, shops ~0.55-0.85 (bars 0.15-0.3), offices mostly 0.45-0.9, lamps / signs / beacons 0.
- The sky glows orange low down at night (`cityGlow`, stronger under cloud); clouds are lit dull orange by the city.

## Weather (`src/world/weather/Weather.ts`)

- Spells (clear, fair, cloudy, overcast, fog, showers, rain, storm, snow in winter only) of 2.5-8 game hours, drawn from the
  season's odds, seeded by the date. `Sky.update` advances it in game hours (`advance(hours, clockHours)`) and real seconds
  (`tick(dt)`); the sky eases into each spell, the ground soaks and dries (`wetness`), snow settles and melts (`snowCover`).
  `?weather=storm` pins a kind (`Weather.pin`).
- Wind: each spell's own, eased, plus gusts on the real clock (`wind`): the trees sway (`fx`), rain slants, snow and petals
  drift. Fog: a fog spell, or the dawn mist of a calm dry morning on a misty day (seeded; thickest at 6.5 h, gone by 10 h,
  most in autumn): `fog` greys the sky (`DayNight`) and the shader fades the scenery into `fogColor` by distance, thicker
  near the ground (`fogAt(dist, height)`), sprites included. Storms: a strike every 5-22 real seconds at their height;
  `lightning` flashes twice in half a second (sky, clouds, the scenery and, through `daylight`, the room), `strikes` counts
  them, `strikeDistance` (0.4-5 km) sets the bolt (drawn below the clouds towards a random azimuth when nearer than ~3 km)
  and the thunder's delay.
- `DayNight.setWeather()`: cloud greys the zenith/horizon, smothers the sunset glow, dims `lightIntensity` (the sun through
  the windows) and `daylight`. `SkyState` carries `cloudCover`, `rain`, `snow`, `wetness`, `snowCover`, `wind`, `fog`,
  `lightning`, `strikes`, `strikeDistance` to everyone. A frozen clock (`dayLength` 0) still recomputes for the weather.
- Pane shader: an fbm overcast sheet and the drifting cumulus (`cloudDrift`), the sun and moon veiled by them; wet ground
  darker and mirroring the sky, lights streaking down a wet road at night; snow whitening what the ground mask allows; haze
  thicker in rain; falling rain streaks and snowflakes; drops beading on the glass in the pane's own plane (`paneWet`).

## Life (what moves)

- `Life` holds the atlas, the sprite slots and a list of `LifeLayer`s (`sprites.ts`: `paint(pens)` once, optional
  `populate()` after every layer has painted, `update(dt, env, push)` each frame). One file per layer: `Traffic`
  (`LifeTraffic.ts`), `Cyclists` (`LifeVehicles.ts`, with the vehicle looks and flashes), `Folk`, `Pedestrians`
  (`LifePedestrians.ts`, dogs too), `Critters`, `Birds` (`LifeBirds.ts`), `Fountain` (`LifeFountain.ts`). A new mover is a
  new layer added to the list in the constructor. Everything draws from the one shared random in a fixed order (`Critters`
  and `Folk` in their constructors, then the atlas in paint order, then `populate` for the traffic, birds and walkers),
  so a new layer added at the end keeps every existing draw and cell. `Life.update` fills one scratch `LifeEnv` and reuses pooled slots (no
  per-frame arrays).
- Cars round the corner on two concentric routes (right-hand traffic, queueing bumper to bumper by body length, positions
  interpolated between half-metre samples, a lateral `offset` to the right of the lane); ~18 % are taxis (lit roof sign);
  a bus every couple of minutes on the second route, pulling up at the shelter (`BUS_STOP_X`); the dustcart once a
  morning (game hours 5.5-7) crawling west along the near lane with stops (amber beacon); a delivery van in business hours
  double-parking by a shop on the far side (`VAN_OFFSET` out of lane: others pass it, it pulls out when clear) with its
  hazards blinking; a rare ambulance, fast, blue lights, cars ahead pulling over (`YIELD_OFFSET`) and crawling, cars near
  it on the other side braking. Vehicle stops are a generic `Stop[]` queue per vehicle.
- `Cyclists` (`LifeVehicles.ts`): the cycle lane under our windows and along the far parked cars, more by day and dry,
  front and rear lamps, swinging out round the double-parked van (`Traffic.obstacles`, handed to it at construction).
- `Pedestrians`: walkers on the pavements (`WALK_LINE`) and park paths (`PARK_PATHS`), some with a dog, umbrellas up in the
  rain (the fair-weather half stays in); `Birds`: a flock of pigeons by day in dry weather; `Fountain`: the plume (off in
  deep snow).
- `Critters` (`LifeCritters.ts`): bats erratic round six lamp heads (`BAT_LAMPS`, 7 m up) from dusk to ~3 h (not wet,
  not winter); a fox when wakefulness < 0.22 on one of `FOX_ROUTES` (eyes catch the light); two cats on the park hedge top
  (1.4 m, x = -`PARK_EDGE`) in the evening.
- `Folk` (`LifeFolk.ts`): figures behind a railing on Front Street's balconies (smokers in the evening, glowing tip;
  someone watering a flower box in the morning), sorted `BALCONY_DEPTH_MARGIN` nearer than the facade (its depth byte is
  ~0.75 m coarse and stamped with the building's middle distance); at the retro games shop the keeper sweeping (7.5-9),
  the games rack (the shop's `SHOP_HOURS`, 8-23, the street's) and `Life.setShopQueue(n)` people queueing, seen from behind. The shop's span comes from its
  window goods via `Life.placeShop(shopGoods)` (called in the `Outdoors` constructor).
- All are sprites the shader composites over the scenery: `SPRITE_COUNT` (56: three vec4 uniforms each, under WebGL's 224
  guaranteed) slots (band rect, atlas rect, alpha/distance/lod/packed tint), hidden where the scenery depth (lights.a) is
  nearer; over open sky nothing hides them. Push order is the priority when slots run out (vehicles first, spray last).
  Blinking lights are separate small `pushFlash` sprites (a bright core by day, a glow halo at night), not atlas copies.
- The atlas (2048 x 4096, ~3700 rows used, glow copy at half size on an opaque black canvas): car every 10° at 2 distances
  (tinted), taxi/bus/dustcart/van/ambulance every 20° at one distance in livery (`VEHICLE_LOOKS`), then people, dogs,
  birds, spray, flashes, cyclists, critters, folk. A new sprite kind must fit: `Life` warns `[outdoors] sprite atlas
  overflow` (`life.atlasUsed` gives the rows). Shared helpers in `sprites.ts` (`Cell`, `Push`, `LifeLayer`,
  `pushStanding`, `glowDot`). How people look is `figures.ts`: the palettes (`SHIRTS`, `FOLK_SHIRTS`, `TROUSERS`, `SKINS`,
  `HAIRS`), `Look`, `figurePen` (the sprite figures) and `paintSeated(sheet, random, x, z, pose)` for the seated figures
  painted into the scenery (picnics `ON_THE_GRASS`, terraces `ON_A_CHAIR`).
- `Life.update(dt, nightness, wakefulness, weather)`: `weather` is the `SkyState` (rain, snow, `hours`, wind). Spawns
  divide by wakefulness; night owls fade below their `homeAt`. `Outdoors.update(dt)` also advances `time` and the clouds.
- `Life.events` (`lifeEvents.ts`) is what the sound reads: counters (`busStops`, `busDepartures`, `barks`) that only go up,
  and live state (`siren`, `garbage`, `garbageWorking`, `fountain`), positions in the panorama frame.

## Sound (`src/audio/StreetAmbience.ts`)

Synthesised, heard from the nearest pane (`Outdoors.panesIn(scene)`), through walls via `SoundOcclusion`: traffic rumble
following wakefulness, cars swelling past (hissier when wet), a rare horn, birdsong by day with a dawn chorus, rain hiss and
patter on the glass, a wind band following `sky.wind` (a whistle when strong), church bells striking the hour 8-21.
Thunder on each `sky.strikes` change, `strikeDistance / 343` s late, cracking when near; it has its own bus with a floor
(`THUNDER_FLOOR`) so it is heard anywhere in the flat. From `life: () => Life.events` (wired in `bootstrap/world.ts`): air brakes and
pull-away at the bus stop, barks, the two-tone siren with a doppler shift, the dustcart's diesel, compactor whine and bin
clatter, the fountain faintly when the nearest pane is on the park side. Distances go through `reach(x, z)` (ears 18 m
up). Starts on the first click or key press.

## Headless check (no browser)

Bundle `paintView` (and `Life`) with esbuild (`--alias:@=./src --external:three`), run it in Node with `@napi-rs/canvas`
shimming `document.createElement('canvas')` and `Path2D`, then save `sheet.color.canvas` as PNG, or reproject a view from it,
and look at it (the `fx` channel too: trees should show their sway gradient and margin, shop fronts their shutter curfew).
To check the parallax, reproject from a camera away from `center` (the kitchen windows) with the same fixed-point steps.
The shader's uniforms sit near WebGL's guaranteed 224 fragment vectors (the sprite arrays are 168 of them): pack any new
scalar into an existing vec4 rather than adding one. Screen right is decreasing azimuth in the game (the lettering is painted mirrored for that). Validate the
pane shader by dumping `fragmentShader` behind a GLSL ES 3.0 prefix (`#define texture2D texture`, `texture2DLodEXT
textureLod`, PI/PI2/PI_HALF, `cameraPosition`) into `glslangValidator -S frag`: a GLSL error is a black pane otherwise.
