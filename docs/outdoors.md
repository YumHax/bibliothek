# Outdoors (`src/world/props/outdoors/`)

The 360° view outside the windows, painted once at start from a sixth-floor street corner, plus the weather over it
(`src/world/weather/`) and the street's sound (`src/audio/StreetAmbience.ts`). Read this only when touching what is seen
or heard through the windows. On medium and high the flat's windows and the balcony show the 3D street instead
("Views onto the street" below): the painted panorama is what they show on `low`, and `Life` still runs on it for the
street's sound (buses, sirens, the dustcart) whatever the quality. There the painting itself waits for the first draw
of a pane or of the balcony's open air (`OutdoorsOptions.paintOnFirstDraw`, set by `Sky` from `streetWindows()`), which
may never come: no main-thread paint at start, no canvases kept (~210 MB on high). The season and holiday are still set at
construction, the life runs from its own seed (`LIFE_SEED`), and the shop's stock and banner asked for meanwhile are put
up as it is painted (`adopt`), from the same seed as on `low`.

## Model

- `Outdoors.material` is shared by every pane (and the balcony's surround, `balcony/OpenAir.ts`, a BackSide sphere with its
  own material object on the same uniforms): the sky at infinity, then the scenery where the eye ray really meets it. The
  painting was made from one eye (`center`, 1.7 m over the flat's floor: `EYE_HEIGHT` over the street less
  `FLAT_IN_STREET.height`, so the painted street lies where the 3D one does); from anywhere else the shader starts on a 40 m sphere and takes
  `PARALLAX_STEPS` (6) fixed-point steps: read the painted depth along the current direction, move to the point of the ray
  that far from the painting's eye. So every window (the kitchen's too, the balcony) sees the near pavement shift more than
  the skyline; a thin sliver where something nearer uncovers what it hid is stretched from its neighbour. Ground on the
  street's plane (`Surface.flat`: `paintGroundBand`, the park paths; haze G, packed in fx A) is stamped with one distance
  per strip, too coarse for that (from the balcony the strips shift apart in slices and the cars hop across them): there
  the step meets the plane exactly instead. Anything painted on the ground straight onto `sheet.color` keeps the flag. Sky gradient, sunset glow, sun tint, night darkness, lights, sun,
  moon, clouds and weather are uniforms: nothing repaints after start. Everything is true perspective from `EYE_HEIGHT`.
- **One neighbourhood, two pictures.** `src/world/city/` is the data model the painted view and the walkable street
  share, all derived from `street/streetPlan.ts` (`FLAT_IN_STREET` turns street-local points into the flat's frame):
  `frontage` (both streets' cross-sections `FRONT_SECTION` / `PARK_SECTION` with their lanes, kerbs, the bus stop, the
  crossings, lamps, bins, racks, benches, the newsstand, terraces, `STREET_DETAILS` (manholes, hydrants, bollards, the
  Morris column), `roadworks()` (where the works stand today: `street/details/roadworks`, synced from the saved market
  day before painting), the ends), `facadeStyle` (a planned building's look from its `seed`: wall, trims, window
  heads, `balconyRows`, roof, its `windows` size, parapet, door and number, downpipe; `windowWidth` and `facadeBays`
  place the windows; every painter darkens and lightens through `city/colour`'s `shade`, so a wall's trim is the same
  shade in both pictures), `roofFurniture` (chimneys, dormers, roof windows, aerials, dishes, flat-roof clutter, the same
  in both pictures), `regionUpload` (a repainted rect of a canvas texture uploaded alone), `trees` (`STREET_TREES`,
  `PARK_TREES` with their sizes, `TREE_FORM`), `park` (pond, bandstand, playground, beds, willows, paths, the gate),
  `parkedCars` (each bay's shape and paint), `skyline` (the towers, `towerTop`, the `BACKDROP_BLOCKS` both pictures
  stand past the streets), `vehicles`, `traffic`, `shopLooks` (with each kind's `LETTERING`). A painted shop keeps
  its kind's `SHOP_HOURS`: its lights carry curfew code 5 mod 8 with the opening and closing hours in G and B, its
  shutter the hours in fx B (`Sheet.shutterByte`), the pane shader reads the hour from `cloudDrift.z`; the walk-in
  kinds (`hasShopfront`) keep no shutter. The lamps are painted in their `LAMP_DESIGNS`.
  Never retype a street value in a painter: add it to the street's plan and derive it here. What the painted view
  still draws on its own is only what the walkable street never reaches: the lots beyond the planned rows,
  the park past `STREET_PLAN.park`'s rectangle (and its paths, beds, pond, lamps and picnics), the courtyard's detail.
- `plan.ts` is the neighbourhood as the window sees it, derived from `city/`. Front Street ahead with the planned row
  across it, Park Street to the left with the park, our own pavement (`NEAR_KERB`) under the windows; `frontage()` /
  `parkLine()` give distances. Park Street's far side is painted as Front Street's mirror (x = -z: its far kerb and hedge
  agree), its near side is its own: `frontage(a, offset, parkOffset)` / `ground()` take `PARK_NEAR_KERB` /
  `PARK_OUR_LINE` as a second offset. Both streets end at a building standing across them (`FRONT_END`, `PARK_END`,
  the plan's `frontEnd` and `parkSouth`, painted by `paintStreetEnds`); `ground(a, offset)` is `frontage()` stopped
  at those, and every ground band, line and row of street furniture must stop there too. It also holds what the painters
  and `Life` share: `BUS_SHELTER` / `BUS_STOP_X`, `LAMPS` (the street's own lamp posts), the park's (`city/park`), the
  traffic and cycle lanes (`NEAR_LANE`, `FAR_LANE`, `CYCLE_NEAR`, `CYCLE_FAR`) and `TURN_CENTRE` (the corner's arcs land
  on Park Street's real lanes), `WALK_LINE` and `LIFE_REACH` (62 m: how far out along both streets what moves is
  simulated; not `FRONT_END`, the end building). Behind the room (x > 0, z < 0,
  azimuth +90°..180°, `COURT_*`) is our own block's courtyard: no street painter belongs there, the seam at ±180° is our
  side wall's plane (Park Street on one side, the courtyard on the other).
- `paintView()` (in `Outdoors.ts`) runs the painters in order and is what the headless check calls.
- **One sky.** `city/skyGlsl` (`SKY_CHUNK`) is the GLSL both pictures share: the sun's halo and disc colour, the
  moon's crescent (`MOON_SHADOW_OFFSET`, in moon radii) and halo, the overcast's cover curve (`skyCloudSheet`). The
  panes and the street's dome (`street/skyDomeShader`, smaller discs) include it; change the sky there.
- `Sheet`: five 4096 x 1344 canvases in azimuth x elevation band space (+40° down to -80°, the pavement under the window);
  on high quality (and a GPU taking 8192-wide textures, `sceneColorScale`) the day colours are painted twice as fine
  (`Sheet.colorScale`: the context is scaled once, painters keep scene texels; a pixel copy, `getImageData`, multiplies
  by it). Anisotropy is `QUALITY.anisotropy`. The lights stay nearest (hand-filtered after switching), so do curfew and fx.
  `begin(distance, glass, surface)` then `rect` / `path` stamp colour, haze, glass and the weather masks at once;
  `lit(path, kind, strength, curfew, animated)` / `glow(..., curfew?)` add night lights; `dim()` darkens light already lit
  (goods in a shop window, a figure in a room); `shadow()` / `shadowFill()` cast shadows. `finish()` packs the scene texture
  (premultiplied day colours: the browser premultiplies the sRGB bytes before the GPU decodes them, so a half-covered
  edge texel reads a^2.2 c; the shader divides by a^1.2 to undo it, else every roof and tree has a dark fringe against
  the sky), the lights DataTexture (R warm, G cool, B glass, A depth via `encodeDepth`), the curfew R8
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
- Shadows are painted straight under what casts them, never offset; on the street's plane (fx A) the shader reads them
  from a point towards the sun (`SHADOW_CASTER` 1.4 m high, at most `SHADOW_REACH_MAX`), so they fall away from the sun
  as the walkable street's do. The shader scales them by `sunShadow` (sun height x
  clear sky), so they never point the wrong way and vanish under cloud. Balcony and awning shadows on walls stay in the colour.
- Painters, far to near: `Skyline` (`city/SKYLINE`'s towers, beacons on the tallest), `Facades` (backdrops: the park's
  far side, taller blocks by lot, then a continuous row one block behind Front Street (`BEHIND_BLOCK`) so the eye never
  sees an empty horizon over the low roofs across the road; a planned building in
  its `facadeStyle`, a lot in one drawn from the sequence; roofs with skylights, AC units, dishes; windows lit
  warm/neutral/TV, curtains drawn, silhouettes; backdrops; street ends), `Park` (the walkable street's trees inside
  `STREET_PLAN.park`, its own beyond), `Street` (both pavements, road with repairs/cracks/drip lines, the walkable
  street's markings, then everything standing on the pavements where the street's plan has it, sorted far to near, the
  roadworks, the parked cars, shop light spilling out until closing), `Courtyard` (last, over the street bands in its quarter: rear facades at
  15-28 m in true perspective via its own `CourtWall` frame, stacked balconies with washing, stairwell timer lights, TVs;
  roofs and chimneys; setts, lawn, tree, bins, bikes, shed; nothing may reach x < 0), `Tree`, `Car` (`VehicleBody`: `CAR_BODY`, `TAXI_BODY`, `BUS_BODY`, `VAN_BODY`, `AMBULANCE_BODY`, `TRUCK_BODY`; `cargo` adds a load box behind the cab), `SkyDetail`,
  `shader.ts` (GLSL), `paint.ts`.
- Helpers: `FacadeFrame`, `Shopfront` (shop types, lettering; `Storefront` carries its light, closing curfew and
  `goods` boxes; `RETRO_GAMES` and its neighbours across the street are where the walkable street has them:
  `paintFrontBlock` paints that row from `street/streetPlan.FACADES`, x shifted by `FLAT_IN_STREET`, storeys and
  shops by kind and name as `PlannedShop`s; the rest of the block beyond is drawn by lots), `paintedFurniture` (lamps with ground pool, small
  halo and wall wash; benches, bins, bikes, bollards, hydrants, newsstand, bus shelter, terraces, hoardings, barriers,
  cones...), `ParkFeatures`, `Solid`.
- `Holiday.ts` (`currentHoliday()`, `holidayOf(date)`, `?holiday=christmas|halloween|none`): at Christmas (1 Dec - 6 Jan)
  strings of fairy lights slung across Front Street where the walkable street has them (pieces sorted in with the
  street's furniture), bulbs in the street trees, a lit fir with a star in the park (sorted in with the park); at Halloween
  (21-31 Oct) candle-lit pumpkins on a fifth of the lit sills. Decorations draw from their own random sequence (`beginHoliday()`), so a
  holiday never changes a building. Spring petals blow past on the wind (shader, `petals` uniform) while the trees flower.
  The rooms and the walkable street dress up from the same holiday (`currentFestivities()`, which adds `newyear` from
  30 Dec to 3 Jan or with `?holiday=newyear`): plan `decor` entries with a `holiday` gate (docs/props.md).
- `season.ts`: the painters read the season (`currentSeason()`) set by `paintView`: spring blossom and fresh lawn, autumn
  turning by `depth` (litter under the trees, the late ones bare), winter bare broadleaves and empty flower beds. From the real
  calendar; `?season=winter` or `?season=autumn:0.9` overrides (parsed in `bootstrap/services.ts`).
- The retro games shop is a window on the market (`RetroShopLure`, made in `bootstrap/world.ts`): every 3 s it shows the day's stock
  (`Outdoors.showShopStock()`, platform accent colours onto the shop's `goods` boxes, one texture re-upload), and on a new
  market day, until the player has been in the `market` zone, a NEW IN banner (`showShopBanner()`, mirrored lettering,
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
- `DayNight.setWeather()`: cloud greys the zenith/horizon, smothers the sunset glow, dims `daylight`. Direct sun (and moon)
  is `sunThrough`: 1 under a clear or fair sky, about half through a cloudy one, 0 under an overcast, in fog, or as soon
  as rain or snow falls. It scales `lightIntensity` (every sun: the windows' patch and dust shaft, the street, the
  balcony; `sunSpotOnFloor` needs a real patch, so the cat does not bask in the rain), `moonVisibility`, the drawn sun
  (`sunVisibility` / the dome's `sunVisible`) and the view's sunlit walls and shadows (`sunShadow`). Anything new that
  shows sunlight reads `sunThrough`, never its own `cloudCover` curve. `SkyState` carries `cloudCover`, `sunThrough`,
  `rain`, `snow`, `wetness`, `snowCover`, `wind`, `fog`, `lightning`, `strikes`, `strikeDistance` to everyone. A frozen
  clock (`dayLength` 0) still recomputes for the weather. `HEAVY_RAIN` (0.45, `Weather.ts`) is the one "rainy day"
  threshold for people (market shoppers, haggling, street talk): a shower's drizzle stays under it.
- Pane shader: an fbm overcast sheet and the drifting cumulus (`cloudDrift`), the sun and moon veiled by them; wet ground
  darker and mirroring the sky, lights streaking down a wet road at night; snow whitening what the ground mask allows; haze
  thicker in rain; falling rain streaks and snowflakes; drops beading on the glass in the pane's own plane (`paneWet`; not
  on the balcony's surround, `OPEN_AIR`). The balcony has its own `Precipitation` (sheltered behind the building's front,
  no splashes: the slab hangs over the street).

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
  morning (`city/traffic` hours) crawling east along the far lane, stopping at the street's bins (amber beacon); a delivery van in business hours
  double-parking by a shop on the far side (`VAN_OFFSET` out of lane: others pass it, it pulls out when clear) with its
  hazards blinking; a rare ambulance, fast, blue lights, cars ahead pulling over (`YIELD_OFFSET`) and crawling, cars near
  it on the other side braking. Vehicle stops are a generic `Stop[]` queue per vehicle.
- `Cyclists` (`LifeVehicles.ts`, solids like the vehicles): the cycle lane under our windows and along the far parked
  cars, more by day and dry, front and rear lamps, swinging out round the double-parked van (`Traffic.obstacles`, handed to it at construction).
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
- **Vehicles and cyclists are solids, not sprites** (`vehicleShader.ts`): per pixel the pane shader intersects the ray
  with each vehicle's volumes (body box, cabin with sloping screens, load box, taxi sign, wheel cylinders; a cyclist's
  spoked wheels, frame, legs, jersey, arms, head and lamps in `bikeHit`, kind `BIKE_KIND`), `Car.ts`'s box models
  written into the GLSL (`shapeOf`, kinds in `VEHICLE_KINDS` order, livery bands `VEHICLE_LOOKS.stripe`), lit by
  `sunDir`/`sceneTint`, glass mirroring the sky, lamps lit by `lightsOn`; the shadow on the road and the headlight beam
  come from the same loop (ground pixels: `fx` alpha). `Traffic.vehicles` and `Cyclists.poses` give each one's pose,
  paint and fade; `Life.vehiclePose` / `vehicleLook` (`VEHICLE_COUNT` 20, two vec4 each) carry them. They are exact from any eye: the
  sprite cars they replace were pictures painted per 10-20° of viewing angle and stretched to their place, and slid
  off the road by up to 3° between two pictures (the "wobble"). A ray-sphere test skips vehicles the pixel is not near.
  Car profiles have the nose at u = length (headlights there), the short hatch at u = 0.
- The rest are sprites the shader composites over the scenery: `SPRITE_COUNT` (42: three vec4 uniforms each; with the
  vehicles' 40 under WebGL's 224 guaranteed) slots (band rect, atlas rect, alpha/distance/lod/packed tint), hidden where
  the scenery or a vehicle is nearer; over open sky nothing hides them. Layers push bounds as the painting's eye sees
  them; `Life.seenFromEye` moves each to where the camera sees it (`OutdoorsOptions.viewer`, wired from `Sky`), and the
  shader matches them against the camera ray's own direction (`band(d)`), not the parallax-corrected scenery uv.
  Push order is the priority when slots run out. Blinking lights (hazards, beacons, the ambulance's blues) are small
  `pushFlash` sprites at their own point, a little in front of the vehicle's surface.
- The atlas (2048 x 512, ~260 rows used, glow copy at half size on an opaque black canvas): people, dogs, birds, spray,
  flashes, critters, folk. A new sprite kind must fit: `Life` warns `[outdoors] sprite atlas
  overflow` (`life.atlasUsed` gives the rows). Shared helpers in `sprites.ts` (`Cell`, `Push`, `LifeLayer`,
  `pushStanding`, `glowDot`). How people look is `figures.ts`: the palettes (`SHIRTS`, `FOLK_SHIRTS`, `TROUSERS`, `SKINS`,
  `HAIRS`), `Look`, `figurePen` (the sprite figures) and `paintSeated(sheet, random, x, z, pose)` for the seated figures
  painted into the scenery (picnics `ON_THE_GRASS`, terraces `ON_A_CHAIR`).
- **Cost.** The pane shader runs on every pixel of every window and of the balcony's sky: on low quality it compiles with
  fewer parallax steps (`PARALLAX_STEPS` 3), cloud octaves (3), sprite slots (`SPRITE_COUNT` 16) and vehicles
  (`VEHICLE_COUNT` 8, the nearest), as defines, not uniforms. `Outdoors.update` moves `Life` every frame only while a
  pane or the open air was drawn (`markDrawn`, the materials' `onBeforeRender`); unseen, every `UNSEEN_LIFE_STEP`
  (0.2 s), the traffic and the riders sub-stepping so they keep their pace for the street's sound.
- `Life.update(dt, nightness, wakefulness, weather)`: `weather` is the `SkyState` (rain, snow, `hours`, wind). Spawns
  divide by wakefulness; night owls fade below their `homeAt`. `Outdoors.update(dt)` also advances `time` and the clouds.
- `Life.events` (`lifeEvents.ts`) is what the sound reads: counters (`busStops`, `busDepartures`, `barks`) that only go up,
  and live state (`siren`, `garbage`, `garbageWorking`, `fountain`), positions in the panorama frame.

## Sound (`src/audio/StreetAmbience.ts`)

Synthesised, heard from the loudest way in, through walls via `SoundOcclusion`: a shut pane (`Outdoors.panesIn(scene)`)
lets `THROUGH_GLASS` (0.2) of it through, the balcony door (`openings`) from that up to the full level as it opens, and
on the balcony (`outside`) it is full: traffic rumble
following wakefulness, cars swelling past (hissier when wet), a rare horn, birdsong by day with a dawn chorus, rain hiss and
patter on the glass, a wind band following `sky.wind` (a whistle when strong), church bells striking the hour 8-21.
Thunder on each `sky.strikes` change, `strikeDistance / 343` s late, cracking when near; it has its own bus with a floor
(`THUNDER_FLOOR`) so it is heard anywhere in the flat. From `life: () => Life.events` (wired in `bootstrap/world.ts`): air brakes and
pull-away at the bus stop, barks, the two-tone siren with a doppler shift, the dustcart's diesel, compactor whine and bin
clatter, the fountain faintly when the nearest pane is on the park side. Distances go through `reach(x, z)` (ears 18 m
up). Starts on the first click or key press.

## The walkable street, in step with the view (`src/world/street/`)

- Same day, same things: parked cars are drawn per real day (`city/parkedCars`, `time/daily`, a gap or two some
  days; the stray cat's roof bay is never empty nor a van); `RETRO_NEWS` (written by `RetroShopLure`) drives the
  street's `RetroLure` (NEW IN banner, the queue at `STREET_PLAN.retroLure`, the window restocked on a new market day
  via `Buildings.repaintGoods` / `ShopInteriors.repaintGoods`); `PARK_FIR` (`city/park`) is the view's fir and the
  street's (`StreetChristmas`, with bulbs in the street trees at Christmas); the park's paths and near beds
  (`StreetPark`) and a stroller or two (`life/ParkStrollers`) come from `city/park`; spring petals blow in
  `Precipitation` (`petals`); the sky dome draws the panes' bolt and blinks the towers' beacons (`SkylineSilhouette` B/A).
- Window life on the walkable facades: the night map is opaque (`fillRect`, at `nightScale`: 0.5 of the atlas on
  high, 0.25 else) and each light's id is in its own nearest, mip-less texture (`windowIds`: R the id, G how far up its
  window, B our flat's window index); the patch flickers TVs, slides figures across lit windows and lowers a quarter of
  the blinds 21-22 h from each window's head, above the ground floor only. Each light is painted with its room behind
  it (`LightInside`: curtains, a blind, furniture, someone standing, an arch's dark corners) and repainted alone when
  it switches. The surface mask (`surfaceTexture`, the `roughnessMap`, at `SURFACE_SCALE`: 0.5 of the atlas on every
  quality: R a pane or a brick wall, G the roughness, B the painter's `ReliefRect`s) gives the panes low roughness, a
  stronger env reflection and a reveal in parallax (`REVEAL`), lays brick courses in world metres on brick fronts
  (fading where they would shimmer), tilts the normal with the relief (cornices, quoins, grooves catch a low sun), and
  darkens, glosses and snows the walls with the weather (`facadeWeather`).
- **Windows in 3D on the near and middle facades** (`facadeWindows/`): a facade whose plan `detail` is at least
  `FRAMED_DETAIL` (20 px/m: `NEAR` 40, `MID` 24; `FAR` 12 stays painted) is painted `framed` (`paintFacade`): only the
  glass, its sky reflection, curtains and blind are painted; each window is recorded as a `Casement` (opening, glazing,
  head, sill, shutters, flower box, paints) and built by `FacadeWindows`, a child mesh of `Buildings` (one draw call,
  vertex colours, ~51k triangles for ~305 windows), so the street, the window views, the roof and the courtyard all
  have them. The facade's quad is the glass's plane; the surround (a render band or stone jambs), frame, glazing bars,
  sill, lintel / pediment on its cornice / ring of voussoirs and keystone, louvred shutters and flower box stand in front
  of it, each part's face a multiple of `gapAt(80)` out and its back buried at a depth of its own (`casementParts`), so
  no two faces share a plane. `Buildings.windowFrames: false` (`buildStreetBase` passes it) paints them flat instead.
  The night map, the window ids and the stories are untouched: the lights stay painted behind the 3D frames.
- Our flat seen from the street: its windows (`FlatFront.windows[].room`) are lit as their room was left, the lamp
  dimmed by drawn curtains (`city/flatWindows`: `furnishShell` reports each room, `Buildings` reads `lampShown` and
  `curtainsOpen` into `flatLevels`); before a room is built they follow the curfew.
- Nothing pops in view: the busker, the trader and the snowman switch only `outOfSight` (`life/sight.ts`) or on the
  first update after activation, and their colliders come and go with them (`zone.collisions`); terraces, pigeons,
  standing people, the crowd and the cars take the clock's state straight away on activation (the crowd and the cars
  pre-warm a couple mid-route). Street lamps' real lights fade out, move and fade in (`HANDOVER`).
- People: the eyes and inner ears dither out between 14 and 16 m (alpha hash on their own materials); the crowd is a
  cast drawn per street build (`life/crowdCast`), whoever has been away longest goes out next;
  pigeons take off for walkers as for the player; the stray cat skips a perch whose bench or bin is in use (`on`);
  the far pavement's routes pass behind the bus shelter and bend round the terraces and the snowman, as does the
  alighting passenger (`standing.busStop.alight`). `PersonModel.hold('phone' | 'book' | 'umbrella' | 'shopping' | 'baguette' | 'flowers' | 'cigarette')` and `setHood` (`people/held.ts`); walkers round corners
  (`Walker` `corners`, `roundCorners`) and step down kerbs eased over 0.3 m; strangers caption only within 4 m
  (`labelWithin`); the crowd thins and hurries in rain (umbrellas for half, up as soon as it starts), hoods in snow. The phone caller and the
  reader take turns (20-60 game min). The stray cat keeps to `life/catPaths` (pavement lanes, crossings, corners).
- Ground: asphalt and slabs are 1024 px tiles (512 below high) with a height map (aggregate proud, joints and seams sunk) and a
  roughness map (`groundTextures`, `Tile.bump` / `roughness`); the markings wear away in patches, grains and the wheel
  tracks (`wornPaint`). `StreetGround` breaks the tiling with a zone-local macro patch (patches; oil in the parking lanes; tyre
  tracks; cracks and sealed cracks in tired stretches, `ROAD_WEAR.potholes` holding water when wet; the walls' feet
  darkened) and `STREET_PLAN.roadPatches`. The corner bay keeps granite setts, every street door a granite sill, every
  dropped kerb blister paving (`GROUND.marking`, where no paint lies); kerbs have height and roughness maps and turn
  round `relief/ground` `KERB_CORNERS` (`KERB_RADIUS`: `isRoad`, `groundHeight` and the rain's `roadGlsl()` agree).
  Markings: lane arrows, Park Street's bays and its give-way (dashes and triangle). Snow is laid in the road's and
  pavement's shaders: tyre tracks and trodden paths cleared, banks along the kerbs and the walls, slush while wet.
  Rain and snow skip `Precipitation` shelters (the sas, `awningShelters`, the bus shelter, the kiosk, the shopfronts:
  any number, the 32 nearest the camera chosen every 2 m). `clutter/StreetClutter`: bags and wheelie bins out by the
  residents' doors from the evening before the bin round, the day's litter, spring's settled petals (`GROUND.leaf`).
- Weather on things: `snowCovered()` (`snowCover.ts`) lays both snow (`STREET_SNOW`) and the rain's wet (`STREET_WET`:
  darker, glossier on top) on whatever uses it (cars, furniture, relief, lamps, trees); `wetCovered()` is the wet alone (walls).
- Light: the sun's shadow map is a square laid ahead of where the player looks (`LOOK_AHEAD`) and fades out over its
  outer 15 % (`shadowFade`) into the rows' far shadow: each point's ray to the sun against the roofline of our row,
  the far row and Park Street's (a 1D texture from `FACADES`), so the buildings' shadows run to the end of the street.
  Patched on every lit street material, the shared palette ones swapped for street copies (the flat's keep their
  edges), in the windows' views too (`streetOutlook`). Lamps come in three kinds (`LAMP_DESIGNS`, `design` per
  `STREET_PLAN.lamps`: the arm, Park Street's cast-iron crook lanterns, a post-top one), drawn per kind and per stretch
  of street (`STRETCH_EDGES`, culled out of view, as the trees are), with a soft halo per lit head where there is no
  bloom (low). The trees branch (limbs, branches, twigs: bare in winter) under crowns of clumps; the Christmas fir is
  whorls of sprays. The sky dome ray-casts `city/skyline` `BACKDROP_BLOCKS` (the neighbourhood's mid-rise blocks past
  the street's rows, the park's far side) in front of the far city, lit and windowed. The wet mirror (`WetGround`)
  renders every other frame (unless the view turned) and leaves out `unmirrored` (the people). The street reflects its own sky: `SkyDome`
  hands `Environment` a `SkyReflection` (the dome prefiltered every 20 s, `setReflectionSource`) while occupied. The
  far towers (`SkylineSilhouette`, 4096 columns) are read linearly and smoothed over a pixel, re-baked every 0.5 m.
  Street lamps are sodium (`lighting/lampColours`): each photocell switches at its own point of the dusk and strikes
  pink, warming to amber in 7-12 s; the wet road's streaks take the same colour.
- Props: bare metal is `street/metals` `bareMetal` (metalness 1, roughness broken by world-space noise), painted
  metal is paint (0); the shelter, benches, bins and kiosk are rounded boxes, the hedge a lumpy clipped run, the cars'
  bodies 3-step bevels with creased normals on 20-segment lathe tyres (`carModel`).
- Traffic: driving cars throw a headlight pool on the road at night (additive, alpha kept) and their lamps streak the
  wet road (`WetGround` `cars`). Cars and riders by quality (`carsByQuality`, `ridersByQuality`, `twoWheelers`), 18 % taxis (`city/traffic` `TAXI`, lit
  roof sign), busier in the rush hours (`city/traffic` `rushAt`; the window view's traffic does not read it yet), now and
  then an ambulance, a police car or a fire engine (`STREET_PLAN.ambulance`, `police`, `fireEngine`) that the cars pull
  over for. Parked cars pull out and drivers park in the walkable street only: the window view keeps `PARKED_CARS`. Sound (docs/zones.md "The street"): what the
  panes hear of the street is heard down there too, where it happens: the bus's air brakes and doors, the lorry's
  compactor and bins (`street/audio/VehicleVoice`), blackbirds and the dawn chorus (`StreetBirds`); `StreetSound` has the
  wind band and whistle; `audio/StreetCues` plays wings and coos (pigeons), barks (the crowd's dog), the crossing's
  beeper, shutter rattles and the sirens; `StreetAmbience` hears thunder at the open air's level in the street (`open`)
  and as through a pane in the market hall (`underRoof`).

## Views onto the street (`src/world/outlook/`)

The painted panorama is right only near the flat's own windows: from the stairwell (up to 16 m lower, 8 m back) or
from a shop (a room far off in the world) it tore apart. Those windows look onto the walkable street itself instead,
built again behind the glass: an `OutlookView` is a portal, its own `THREE.Scene` in the street's frame, lit by its own
sun, sky and lamps (the room's lights, shadow texture units and light count are never touched), rendered in a pane's
`onBeforeRender` (as three's `Reflector` does) from the main camera carried into that frame (`toOutlook`: `frames.ts`,
`flatToStreet` for the stairwell, `shopToStreet` for a shop's front wall laid on its facade), clipped at the pane's
plane, scissored to the pane's rectangle, into a half-float picture the pane samples in screen space. Panes of one view
in one plane share a frame's render: the first drawn scissors to the union of those on screen (unless the union is over
`UNION_MAX_SPREAD` times their areas) and the others skip theirs that frame (`covered`, by the renderer's frame count;
the stairwell's panes a storey apart up the well). Only the main camera's pass renders (a glossy floor's mirror pass
reuses the picture). After `FREE_AFTER_UNDRAWN` (90 s) with no pane drawn, the view frees its scene and shrinks its
picture (the stairwell is persistent: it would hold a whole street for good), and is built again on the next
`prefetch` or draw. What is out there (`streetOutlook`, in its own
chunk with the street's classes) is the street's own: `StreetLighting` (occupied), `SkyDome` (its prefiltered sky as the
scene's environment, never `setOccupied`/`dispose`: both hand the global reflection back), `StreetGround`, `StreetPark`,
`Buildings` for the facades within 150 m that face the window (`outlook/inView`: `facadesInView` from one window, less
the one it is in; `homeFacades` for our building; the near ones painted finer, and everything at the street's own
`detailScale` per quality), RETRO GAMES' NEW IN banner on a fresh market day (`RetroLure` with no queue: the shelves in
today's stock),
their relief, shutters and shop glow, the lamps, trees, parked and passing cars, furniture (all of these by the same
calls as the street's own, `street/streetScenery`: only the options differ), the rain, and the courtyard
the street never reaches (`Courtyard`, `COURTYARD_YARD` in `outlookPlan.ts`: setts, lawn and chestnut, the workshop's
back, bins, shed, rack, sandpit, bikes). No people, doors or sounds. It is built at the next idle moment once the
player walks into the room (`prefetch`, from `setOccupied`) or a pane is first drawn, compiled out of sight, and ticked
only while a pane was drawn in the last 1.5 s; the glass shows a pale sky until then.

**One view per building, leased** (`sharedOutlook`). Every window looking out of our building shares the view
`'home'` (`leaseHomeOutlook`): the flat's rooms (`RoomWindow`'s `outlook: homeOutlook(sky.outdoors)` in `layout.ts`,
`furnishKitchen`, `furnishAnnex`; null on `low`, the panorama), the balcony's open air (`OpenAir`: the picture on the
inside of its sphere, unclipped, `OutlookView.surround`), the stairwell's landings and the neighbours' flats
(`FlatOutlook`: each side's pane laid on its real window, `windowAt`). It builds `homeFacades` (every facade facing our
building, less our own but its kitchen wing `oursWing`), so it is built once whoever asks first. Each pane carries its
own `toOutlook` (the flat and the stairwell: `flatToStreet`; a zone elsewhere: `windowAt(frame)`); only panes with the
same mapping and plane share a render. A lease is released with its window (`dispose`), the view with its last lease.
The seller's flat has its own (`leaseOutlookFrom`, key `'seller'`, `SELLER_FLAT_PLAN.outlook`: Park Corner Mansions on
the first floor). Shops keep one view each (`ShopWindow`). Outlook panes are flagged `userData.streetPane` so the street
is heard through them (`Outdoors.panesIn`).

**Its cost.** The picture is 0.75 of the drawing buffer on high (4x MSAA: roofs and wires against the sky), 0.6 on
medium. A pane keeps its picture while the camera is still (same camera, lens and mapping, under `REUSE_FOR`, 1/20 s,
and no later render over its rectangle): out there then moves at 20 Hz. The view's sun redraws its shadow 5 times a
second (`StreetLighting`'s `shadowRefreshHz`). A view is ticked once a frame however many windows tick it (the
renderer's frame count). `?stats` logs `[stats] outlook N renders/s | draw calls and ms CPU each | reused/s`. The
panes are window glass for the occlusion (`graphics/glassMask`): no dark halos round the mullions.

## Lives behind the windows (`building/rearWindows`, `street/windowLife.ts`)

A `Buildings` may be given a `windowLife` (`BuildingsOptions.windowLife`): every lit window it painted is offered to
it once (`claim`, facade metres and floor) and may come back claimed, lit by its claim instead of its curfew, and with
a story drawn over its light. `building/rearWindows` (data in `rearWindowsPlan.ts`) is the one in use, handed to the
street's own facades, the stairwell's outlook and the walked courtyard:
- **Our building follows its residents.** The windows of the flats behind each landing's doors (`residents`: stretches
  of `ours` and `oursBack` by floor, floor 5 Mrs Roux's) are lit while that resident is home and up (their day from
  `STAIRWELL_PLAN.residents`, a bedtime each); the stairwell's own windows on our back come on and off with its timer.
- **Stories across the courtyard.** Eight windows of `courtRear` and `courtEast` (`stories`: facade, floor, the
  window nearest a spot) each have a life that goes on from one game day to the next (`storyNow`): a couple's dinner
  then reading, a painter whose canvas fills up (a new one every `painterCanvas` days), squats, a party night one day
  in seven, a tenancy that ends in boxes under a bare bulb, stands empty and dark, and a new tenant moving in (with a
  cat every other time), a cat lady, a night owl at a blue monitor, and **the trader's shelves** (the street's
  collector lives across the yard: `traderShelves(day)`, filling up over `trader.fillDays`). Drawn in the facades'
  shader (`street/windowStoryGlsl.ts`): flat silhouettes and tinted light in the window's own frame (the id texture's
  B is 128 + the story slot; `storyAxis` / `storyBand` uniforms, up to `STORY_WINDOWS`), no geometry, no texture.
- **Binoculars.** Photo mode's frame key cycles to `Binoculars` (`photo/frames.ts`): two eyepieces over the view and
  the wheel's zoom down to 3.5°, for the windows across the yard from the stairwell's half landings or the courtyard.

## Headless check (no browser)

Bundle `paintView` (and `Life`) with esbuild (`--alias:@=./src --external:three`), run it in Node with `@napi-rs/canvas`
shimming `document.createElement('canvas')` and `Path2D`, then save `sheet.color.canvas` as PNG, or reproject a view from it,
and look at it (the `fx` channel too: trees should show their sway gradient and margin, shop fronts their shutter curfew).
To check the parallax, reproject from a camera away from `center` (the kitchen windows) with the same fixed-point steps.
The shader's uniforms sit near WebGL's guaranteed 224 fragment vectors (the sprite arrays are 126 of them, the vehicles 40): pack any new
scalar into an existing vec4 rather than adding one. Screen right is decreasing azimuth in the game (the lettering is painted mirrored for that). Validate the
pane shader by dumping `fragmentShader` behind a GLSL ES 3.0 prefix (`#define texture2D texture`, `texture2DLodEXT
textureLod`, PI/PI2/PI_HALF, `cameraPosition`) into `glslangValidator -S frag`: a GLSL error is a black pane otherwise.
