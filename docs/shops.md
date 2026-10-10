# Shop interiors

The four walk-in shops of Front Street (SECOND HOME the furniture shop, TV REPAIR, PAWS & CLAWS, the florist) are
zones of kind `shop`, built by `src/world/shop/furnishShop.ts` from their plans. What they sell and cost is
docs/economy.md; the street side of each (its shopfront, its window seen from outside) is `src/world/street/`.
The clerk behind each counter is a person (Bernard, Karim, Nadia, Iris): a click is a conversation, the till among its
entries, and the shop's prices follow how the player stands with them (`shop/clerkTalk`, docs/social.md "Front Street
and the arcade").

## Where things are

| What | File |
| --- | --- |
| A shop's plan: room, counter, clerk, customer, fixtures, props, displays | `src/world/shop/plans/<shop>.ts` (one file per shop) |
| Types (`ShopPlan`, `ShopFixture`, `OnSurface`), `SHOP_PLANS` gathering the four | `src/world/shop/shopPlan.ts` |
| Helpers every plan uses (`shopRoom`, `arrival`, `customerDoor`, `OPEN_SIGN_AT`, `DOORMAT_AT`) | `src/world/shop/plans/shared.ts` |
| Props any shop can name (signs, lights, floor, walls) | `src/world/shop/common/` + `common/props.ts` |
| A shop's own props | `src/world/shop/{furniture,tv,pets,florist}/` + that folder's `props.ts` |
| The registry of every prop name, `ShopContext` | `src/world/shop/shopProps.ts` |

A plan is data only. Its own props are named in it (`{ kind: 'prop', prop: 'tubeBatten', options, at }`). Each
`props.ts` maps a name to a maker `(options | undefined, shop: ShopContext) => Furniture`. The class itself lives next
to its registry. The name set and each prop's options are type-checked: a wrong name or option fails `npm run
typecheck`. A name must be unique across all five registries (`shopProps` throws at load otherwise).

`ShopContext` is what a maker knows about the shop: `name`, `accent` (the counter's colour), `fascia` and `letters`
(the street fascia's colours, `city/SHOP_LOOKS`), `kind` (its hours), `dayNight`, `room`, `openings` (the exit and the
window on the front wall, for anything running round the walls) and `seed` (the prop's index in the plan).

## Placing a prop

- `at: Placement`: floor, wall (`y: 0` stands against it), ceiling (origin on the ceiling, the prop builds down -y), or
  corner. Room-wide props (`panelledDado`, `tiledWainscot`) go at `{ floor: [0, 0] }`.
- `on: <table id> | 'counter' | 'windowDisplay'`, `spot: [x, z]` on that top in the host's own frame, `yaw`. Counter
  clutter goes `on: 'counter'` (its top is 0.95; the till sits at the middle, the bell at one end, so keep |x| off
  0 and the ends). `windowDisplay` is the plinth inside the front window: x runs along the window, +z into the shop,
  0 is the middle of its top. Its top is at `SILL + 0.05` (0.6 m) and it is 0.5 m deep unless `ShopPlan.windowDisplay`
  says otherwise (`false`: no plinth). Price-tagged `displays` can stand on the same surfaces.

## Common props (`common/props.ts`)

| Name | What | Placement |
| --- | --- | --- |
| `nameBoard` | The shop's name on a signwriter's board or enamel plate. Defaults: the shop's name, in its fascia's colours. `lines`, `width`, `height`, `color`, `letters`, `style` | wall |
| `notice` | A handwritten card, typed notice or poster (`hand: 'hand' \| 'print' \| 'poster'`), taped, pinned or framed. `lines`, size, `paper`/`ink`/`accent`, `tilt` | wall, or any face |
| `corkBoard` | Cork board with `heading` and `items` (cards `{ lines }` or polaroids `{ lines, photo: [bg, subject] }`) | wall |
| `wallChalkboard` | Framed slate, chalked `lines`, chalk ledge | wall |
| `aFrameBoard` | The pavement A-frame (`props/Chalkboard`); collides | floor |
| `flyer` | `props/Flyer`: a pinned paper flyer or a cloth banner | wall |
| `openSign` | OPEN / CLOSED card on the door's glass, turned by `SHOP_HOURS`. The street side reads OPEN, so from inside it reads "SORRY, WE'RE CLOSED" | `OPEN_SIGN_AT` |
| `doormat` | Coir mat (`props/Doormat`) | `DOORMAT_AT(depth)` |
| `floorScuffs` | Floor decal: `kind: 'heels' \| 'grime' \| 'petals' \| 'sawdust'`, `amount` | floor |
| `tubeBatten` | Fluorescent batten: `length`, `tubes`, `diffuser`, `drop` (chains), `flicker`, `hum`, `light` | ceiling |
| `trackSpots` | Ceiling track of spot cans aimed towards local +z: `count`, `aim`, `kind`, `light`, `reach` | ceiling |
| `glowPanel` | Glowing face (aquarium back, chiller, lightbox): `color`, `strength`, `shimmer`, `light`, `switched` | wall / face |
| `panelledDado` | Panelled boarding with a dado rail round the lower walls, or `railOnly`; skips the door and window | `{ floor: [0, 0] }` |
| `tiledWainscot` | Half-height metro tiles (`props/TiledWainscot`); skips the door and window | `{ floor: [0, 0] }` |

Helpers for a shop's own classes:

- `common/lettering`: the fonts `HAND`, `CHALK`, `SIGNWRITER`, `PRINT`, `POSTER`; `setLines` sets lines of text in a
  box; `hex`.
- `common/cutout`: `cutOut(map)` makes an alpha-cut sheet material that keeps the canvas alpha.
- `common/ceilingDrop`: `hangFromCeiling(parent, length, 'chain' | 'rod' | 'cord' | 'jute')` returns the y to hang from.
- `common/fitting`:
  - `ShopFitting` (`setLit(on)`): the shop's one switch works it along with the ceiling lamp.
  - `ShopVoiced` (`voices()`): `furnishShop` puts each voice on a `PointSound` at the prop.
  - `Glows`: emissive materials of the prop's own, dimmed together.

## Each shop's own props

Named with the shop's word where a clash is likely (the TV shop's all start with `tv`).

- **TV REPAIR (`tv/`):** `tvOpenSet`, `tvSolderingStation`, `tvSolderWisp`, `tvMagnifierLamp`, `tvBenchTools`,
  `tvPegboard`, `tvPartsCabinet`, `tvRepairsShelf`, `tvGadgetCase`, `tvBoxStack`, `tvCableTray`, `tvWallCalendar`,
  `tvCrtStack`, `tvTentCard`, `tvReceiptSpike`, `tvValveJar`. The TV wall mixes its screens (`TvWall` `screens:
  'mixed'`: snow, a test card, colour bars, a rolling picture, dead sets), all repainted by the one `SnowTicker`
  (`snowScreen`; several tickers may exist, one drives). Each snowy set shows its own corner of the shared noise,
  mirrored or not (`PortableTv` `seed`), so the wall does not flicker in lockstep; the test card and the bars sit
  under the arcade's CRT glass (`crtScreenMaterial`). The wall lights the room: a cold `GlowPool` on the floor in
  front and a `PooledLight`. The sets for sale are switched on (the CRT on the test card, the bedroom set on the
  bars) and the projector throws its beam (`ShopProjector` `on`).
- **The shops' looks** (`ShopPlan.look`, `graphics/grade`): TV REPAIR `tvShop` (dim, warm, a heavier vignette), the
  florist `florist` (bright, cool, a faint mist), PAWS & CLAWS `petShop` (warm); SECOND HOME keeps `shop`. The shops'
  hands are the shipped faces (`common/lettering`: `HAND` is Caveat, `CHALK` Permanent Marker, the OS hands only as
  fallbacks). Anything lying flat for sale (the rugs, the bath mat) takes a price tag on a stand, not a card on the floor.
- **PAWS & CLAWS (`pets/`):** `aquariumWall` (the tanks and the pump, replacing the old fish tank), `terrarium`,
  `hamsterCage` (its wheel and its squeak, `hamsterSounds`), `leadPegboard`, `kibblePallet`, `treatBin`, `catTree`,
  `catTunnel`, `catWallShelf`, `dogBowl`, `ceilingMobile`, `shopCat` (Biscuit in the window, not for sale), `toyMice`,
  `kidsDrawings`, `treatJar`, `donationTin`. The budgies' cage (`Birdcage`, `PetShopNoises`) only chatters.
- **Florist (`florist/`):** `flowerChiller` (cold glow and hum), `bouquetStand`, `hangingGreens`, `fernWall`,
  `climbingTrellis`, `trailingPothos`, `floristBench`, `wateringCan`, `counterFlowers`. Leaves are baked into one
  mesh per green (`greenery.ts`, `LeafBatch`): the leaf material's patched shader keeps them out of the static merge.
- **SECOND HOME (`furniture/`):** `showroomLamps` (lights the lamps on show with the switch, a `PooledLight` at each),
  `windowVignette`, `salonWall`, `dustSheets`, `chairStack`, `foldingScreen`, `showroomPendants`, `showroomFan`,
  `armchairThrow`, `bedCushions`, `dresserTop`, `tableDressing`, `swatchBook`, `showroomPlant`, `deliveryLedger`.

## The street front

Outside, each walk-in shop's front is the shopfront kit's `walkIn` variant (`street/shopfronts/Shopfronts`, measures
and looks in `shopfrontPlan`'s `FRONT` / `SHOPFRONTS`; docs/zones.md "The shopfront kit"). Its name on the fascia is
lettered sharp by `fasciaLettering`, not painted into the facade atlas. A new kind of walk-in shop gets a
`SHOPFRONTS` entry; its street front then needs nothing else.

Painted once for both sides of the glass: the door's OPEN / CLOSED card (`common/doorCard`: the shop's `SHOPFRONTS`
accent, its `SHOP_HOURS`; the card inside is `common/OpenSign`, the street's is a tile per shop in the atlas), the gilt
lines on the display glass (`common/gildedLettering`: read backwards from inside by `ShopWindow`, which letters the
street's first line), the test card (`snowScreen.paintTestCard`). The name board inside is lettered in the fascia's
font (`ShopContext.font`, `SHOP_LOOKS[kind].font`).

## The window: inside and out

The street shows each shop's window display from the pavement in 3D (`street/shopfronts/windowDisplays.ts`), and
the view through its glass is painted after the real room (`street/relief/walkInInteriors.ts`). The inside plinth
carries the same things; change one, change the other:

- **TV REPAIR:** a stack of three CRTs showing snow, and a "REPAIRS" card.
- **PAWS & CLAWS:** a cat bed with a sleeping cat, and toy mice.
- **Florist:** bouquets in vases on a tiered stand.
- **SECOND HOME:** an armchair, a lit floor lamp, a side table.

## Budgets

- **Shadows: none.** Every shadow-casting light is a texture unit in every lit shader (CLAUDE.md gotchas). A shop's
  only shadowed light is its `Room` lamp. Fittings glow through emissive materials.
- **Real lights: the shop's `LightPool`.** Its `ShopPlan.glowLights` point lights (default 2, at most 3) are lent to
  the nearest `PooledLight`s of the fittings and props (`tubeBatten`, `trackSpots`, `glowPanel`, or any prop's own). A
  prop may carry as many `PooledLight`s as it likes, since the count never changes. Never `new THREE.PointLight` in a
  shop prop. On low quality the scene draws 5 point lights in all.
- **Texture units:** a prop's material takes a map and an emissive at most. The shop floors (concrete, tiles,
  parquet: the furniture shop and the florist) are full: never a new map on a floor material. Anything on the floor is its own mesh lifted by `surface/layers`
  (`FLOOR.scuff`, `FLOOR.mat`, ...).
- **Draw calls:** a static prop (not `Updatable`, `Interactable` or `dispose`-able) merges its parts per material
  (`zone/mergeStatic`), so build from palette materials (`paint`, `timber`, `cloth`, `METAL`). Each canvas-painted
  face (a notice, a board) is a draw of its own, so group many small labels onto one canvas where you can (a shelf's
  price strip, not twenty cards). Aim for under ~150 draws per shop.
- **Z-fighting:** flat things take a layer (`WALL.notice`, `WALL.sign`, `FLOOR.scuff`...) via `decal`/`onSurface`.
  Parts meet per `props/joinery`. Check with `bibliothek.zfight()` under `?debug`.
- **Alpha:** anything blended must keep the canvas's alpha (the video cut-out): cut out with `cutOut`, or blend the
  colour only (`FloorScuffs`).
