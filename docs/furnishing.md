# Moving things about the flat

The player rearranges the flat with the right mouse button (a controller's B, a finger held on the thing; M does the
same on the keyboard). `src/furnishing/` carries furniture, `src/game/Rearranging.ts` holds the rules and the keys.

- **A box in hand, aimed at a shelf**: a see-through ghost of the box stands in the gap it would go into, the row's boxes
  parting for it (warm: the row has room; red: none). Aimed at the middle of another box, the ghost wraps that box
  (blue): a swap. A right-click *tap* (or M) puts it there; a right *drag* still turns the box in hand
  (`Session.bindInput` tells them apart: under 280 ms and 10 px is a tap).
- **Hands free, aimed at a piece that was bought** (Front Street's shops, the market's household stall) **or a
  bookcase**: the piece is outlined and the caption says "Right-click to move". A right-click takes it (on the button's
  release, if the mouse hardly moved, and not in the 300 ms after a box went back: a reflex right-drag never lifts the
  armchair behind the shelf): it lifts 5 cm,
  stops colliding and follows the aim over its surface (floor, wall, ceiling), what stands on it riding along.
- **Carrying**: a click (or M) sets it down where it shows green, R / Q turn it a quarter either way, the wheel an eighth,
  G turns the grid off (free placement: the wheel turns 15°, a piece brought near a wall turns flush against it), X
  puts it away, a right-click or E puts it back where it was. U with free hands undoes the last move (20 deep). The
  prompt names three: set down, turn, put back (X and G are on the keys card, hold H). Opening a panel puts it back;
  leaving the pointer lock (Esc, a lost focus) only pauses: the piece is still in hand on the way back in.
- **Through a doorway**: carried into another room of the flat (not the stairwell), the piece goes with the player
  (`Zone.handOver`, implemented with `ride`, `move`, `lift` and `setDown` in `zone/moving.ts`, `zone.moving`: out of one
  zone's group, colliders and shadow layer into the other's); its saved pose records the
  room (`SavedPose.in`). Bookcases stay in their room (`keepsRoom`), and so does a piece something unbought is staged on
  (the lava lamp's side table before the lamp: `canChangeRoom`, the staged lamp belongs to its room till bought). The
  pieces riding it go too and are saved with it. Walked out of the flat (the stairwell) with it, it goes back.
- **On a top**: a small floor piece (at most 0.7 m a side, 1.2 m tall: a plant, a stool, a bowl) aimed across the top of
  a table, a dresser, a stool (25 cm to 1.6 m high) is set on it and rides it (`Zone.ride`; re-found under its feet on
  load and on an undo, `Furnishings.standOnWhatIsUnder`). It may not hang off the edge by more than 3 cm.
- **Put away** (X): out of sight, its lights kept dark (`setShownKeepingLights`, the scene's light count never
  changes); not a bookcase, nor anything something stands on. The pause menu's *Stored furniture* lists them and takes one
  out, in front of the player, in whatever room of the flat they are in, carried (put back, it goes away again).
- **From above** (L, or the pause menu's *Plan the room*): `furnishing/planView/PlanView` hangs the camera under the
  ceiling looking down, a cursor follows the mouse (the pointer stays locked), and the same carrier moves the floor
  pieces with it (`FurnitureCarrier.setAim`). Pendant lamps and hung plants hide meanwhile. Its strip names the keys of
  the moment: with free hands how to take a piece and leave (L), carrying one how to set it down, turn it and put it
  back. Esc reaches it only with the keyboard held (Settings > Display > Full screen); otherwise the browser takes Esc,
  lets the mouse go, and the view closes.
- **Put the furniture back** (pause menu, shown once something in the room was moved): every moved piece of the room
  goes back to its plan pose (`Furnishings.sendHome`).

Built-ins never move: walls' radiators and sockets, the kitchen units and appliances, the bathroom's fittings, the
wardrobe, the TV on its stand, the projector (it is aimed at its wall). A right-click on one names it ("The wardrobe
stays where it is", `Furnishings.fixedAt`).

## The grid and the preview

`furnishing/grid.ts` has the rules, `furnishing/preview/` draws them (unlit, in the zone's frame, on
`FLOOR.placement` / `WALL.placement` over every rug and mat):

- **Grid**: 10 cm cells counted from the room's back-left corner: a floor piece's turned footprint has its corner on a
  line; a picture snaps along its wall and up it by its bottom edge. The grid shader fades out 1.4 m round the piece.
- **Turns** land on absolute multiples of the step (`nextAngle`): a piece at an odd angle squares up on the first turn.
- **Lining up** (`alignWith`, wins over the grid within 4.5 cm): edge to edge, centre to centre or flush beside the
  furniture within 1.6 m, or the room's centre line; a blue guide shows what with. On a wall, the guide runs up from the
  top of the piece below. Then **flush**: within 7.5 cm of a wall, a floor piece is pushed against it (`toWalls`).
- **What may stand there** (`fit.ts` `Fit.check`, which says why: `Blocker` kind room / doorway / window / piece /
  furniture / someone / edge / way): the footprint is drawn cell by cell, green or red, the piece's outline green or red, what
  is in the way outlined red (seen through walls), the ways through the doorways faintly red all along, where it was
  taken from in faint white. The caption says why ("it would block the doorway", "it would hit the armchair", "Sam is in
  the way", "it would block the way through": the floor it would cut off outlined). Nobody is set down on: the player's feet, the cat, a visiting friend (`friendsIn`, by name).
- **The spot beside**: aimed where it may not stand, the nearest cell up to 3 steps round where it may is outlined
  green; a click sets it down there.
- **Feel**: it floats 5 cm while carried and settles in 0.16 s; a tick on each grid step or turn, a bump when refused,
  a thud by weight (`audio/furnitureSounds` `playSetDown`).

A saved pose the plan has since made impossible (a new unit where it stood) is dropped on load: the piece goes back to
its plan spot (`Furnishings.checkSaved`, logged `[furnishing]`).

## The shelves: the player's arrangement

`src/world/shelving/arrangement.ts` (`ShelfArrangement`, saved under `KEYS.shelves`) holds the sort the shelves stand in
and the player's own rows: per shelving id (`'living'`, `'bedroom'`, Mrs Roux's `'annex'` and `'annexStudy'` once joined), bookcase, row (top first), game ids left to right.

- Moving a box (`ShelvingGroup.moveBox`) takes the shelves as they stand (`Shelving.rows()`, a box in hand counting on
  its row), moves the box, and saves that as the arrangement (`arrange()`); the sort becomes `'custom'`. Games that are
  not on the shelves today (a stray on the kitchen table, a game lent out, one in the parcel) keep their places in the
  saved rows, after the box they followed, and come back there.
- T cycles platform, year, title, and "as you arranged them" once an arrangement exists. The arrangement is kept while
  the shelves are sorted another way. The sort shown is saved too.
- `planArranged` lays the arrangement out: every arranged box on its row as far as the row has room, then the rest (and
  new games) into the first gap wide enough, bookcase by bookcase, top row first; what fits nowhere goes to the overflow
  (the bedroom's bookcases). In that sort all rows are the same height, so any box goes on any row, and every shelving
  counts its rows (5, or 4 for tall boxes) over the whole shelved collection (`rowsFrom`), so no arranged row vanishes
  when a tall box reaches one of them. When a much taller box joins the collection and every bookcase drops to 4 rows,
  the lost row's boxes (and those of a row now too full) go to the nearest row of their own bookcase with room, below
  first, before any gap elsewhere. The collection
  room's shelving leaves a box the player put on the bedroom's for it (`elsewhere`).
- Aiming with a shelf box in hand (`ShelfPlacing`, spots from `Shelf.spotAt`): a see-through ghost of the box stands
  where it would go. In a gap the row's boxes part (`GameBox.setParted`, eased, rest poses untouched) to where the
  row would stand with it in, packed from the left as `placeRow` lays it; warm. Over the middle half of another box
  (`SWAP_SPAN`) the ghost wraps that box, blue: the two swap (`ShelvingGroup.swapBoxes`, `arrangement.swapped`), each
  taking the other's place; it fits when both rows have room for the box coming in (`Shelf.roomFor`; a swap along one
  row always does). Red: no room, nothing parts. `ShelfPlacing.swapping` says which it is.
- Boxes come from a `BoxPool` shared by both shelvings: a game passing from one room's shelves to the other keeps its
  box. A shelving takes boxes only for the games that get a spot; the plan works on the games' sizes (`boxDimensionsOf`).
- When the bookcases come out as they stand (same count, same row heights), a rebuild keeps them and the boxes slide;
  only a box already on one of them slides, one arriving from elsewhere appears. `Shelf.placeRow` gives a box in hand
  its new rest pose and its `home` (the Inspector brings it back there).
- The bookcases move like bought furniture: each shelving registers every bookcase it puts up as a piece
  (`ShelvingOptions.onBookcase`, wired by `build/bookcases` `movableBookcases`: key `bookcase:<slot>`, no `owned`, since
  only bought ones stand), and unregisters it when a rebuild takes it down (`Furnishings.unregister`); the one put up
  in its place under the same key goes back where the player moved it. The boxes are the `Shelf`'s children and their
  `home` is the shelf, so they go with it, and a kept bookcase stays where it stands. The plan never looks at where a
  bookcase stands (slots only decide where a new one first goes). A bookcase's ceiling spot follows it
  (`shelving/LampFollow`, through the host's `move`), kept inside the room. The friends' browse spots
  (`ROOM_PLAN.visitor.browse`) are fixed points in front of the slots: a friend there with no bookcase near looks at nothing.

## Displays (`src/world/showcase/`)

The display case (by the living room's door, five tiers of one box) and the pedestal (one box on an easel, in the open
floor), bought at SECOND HOME (`displayCase`, `pedestal`; `ROOM_PLAN.showcase`), hold any box of the collection face out.

- **Putting a box in**: with a box in hand (from a shelf or another display) aimed at a display, the ghost leans in the
  slot aimed at (`ShelfPlacing` asks `Showcases.spotAt`; the nearer of a shelf spot and a slot wins); a right-click tap
  or M puts it there (`Showcases.put`). A box in the slot trades places with it: into the slot the box in hand came from
  (if it fits there), or back on the shelves. Red: too big for that slot ("Too big for the pedestal").
- **Taking one out**: click it like a shelf box; E puts it back in its slot, aimed at a shelf it goes in the gap
  (`Showcases.toShelves`, then `ShelvingGroup.moveBox`) or swaps with the box there (which takes the slot).
- **Off its shelf meanwhile**: `Showcases` is a `GameSource` filter between `Deliveries.shelved` and `StrayGames`: a game
  on display is neither on the shelves, nor lent (the borrow panel reads the shelves), nor left lying about; its place
  in the player's arrangement is kept and it goes back there. Its box is the flat's own (`BoxPool`, owned by
  `Showcases` while on show), registered with the display's zone (`Zone.boxesChanged`), ticked by the display's
  `BoxMotion` (hover, tip). Search and the random pick find it (`ShelvingGroup.alsoIn`). A game sold, or turned into a
  wish in the editor, leaves its slot. Saved: `KEYS.showcases`, slot by slot per `<zone>/<key>`.
- **Moving a display** carries its boxes (they are its holders' children); it stays in its room and is never put away
  (`keepsRoom`: its boxes are registered with its zone).
- **Friends**: a display with something in it is always one of a visiting friend's stops (`VisitRoute.featured`, from
  `Showcases.stops`: in front of it wherever it stands now); they look at a box on show and say a word on it
  (`showcaseLines`). The collector's book's vitrine (50 games, the most valuable copies) is separate and not curated.
- **Light**: warm strips and edge-lit glass shelves are emissive; their glow is painted (`glow.bakedGlow`): no light.

## Shelf labels (`src/world/labels/`)

The label maker (SECOND HOME, `labelMaker`): at home with free hands, K aimed at a shelf's front edge (or a box on that
row) opens the label panel (`ui/LabelPanel`): up to sixteen capitals, five tapes, a preview; Print sticks it on the
board's front edge under that row, centred where aimed (kept on the edge, never over another label: refused). K on a
label offers Peel off, or prints a new one in its place. `game/Labelling` is the route (after browsing), `labelMaker`
its world side (the aim through `ShelvingGroup.bookcaseList`, walls checked).

- Saved by shelving id, bookcase slot, row (top first) and x along the edge (`KEYS.shelfLabels`): labels stay put
  whatever the boxes do, ride a bookcase the player moves, and a rebuild sticks them on the new bookcase
  (`labelledBookcases` wraps the shelving's `onBookcase`; a row gone when the bookcases drop to four rows takes the
  last row). A new shelving with bookcases wraps its `onBookcase` the same way.
- One canvas atlas (1024 x 1024, cells of 512 x 40 px: `MAX_LABELS` 50), one texture, one material on `WALL.print`
  over the banding (`Shelf.edgeOf`); each label a plane with its cell's UVs.

## Tipping a box out (`shelving/BoxTipping`)

Q held at home with free hands (the market's "read the stalls" key): the box under the crosshair, on a shelf or a
display, tips half out of its row (its top 24° towards the eye, 3.5 cm out, `GameBox.setTipped`, eased by its shelf's
ticks) and its caption says its year, platform, edition and state. Let go or looked away, it slides back. Nothing moves
for good.

## Furniture: registering a piece

`src/furnishing/`. A builder registers what it places that the player may move:

```ts
ctx.home.furnishings?.register(zone, item, { key: 'dresser', at: plan.dresser.at, owned: own.dresser });
```

- `key`: unique in the zone, stable (the saved layout, `KEYS.furniture`, is keyed by the id of the zone whose builder
  places it and key, wherever the player carried it since: `SavedPose.in` names that room, `stored` a piece put away). Plan `decor`
  entries with an `upgrade` are registered by `placeDecor` itself, keyed by what they need bought (`ownedKey`:
  `houseplant#3`, `speakers`, `speakers~1`): nothing to do for a new decor line.
- `at`: the plan's `Placement` says what the piece moves over (`surfaceOf`): `floor` (floor, corner, or against a wall
  with `y: 0`: it goes flush against a wall it is brought near; off the grid it also turns to face away from it), `wall` (hung: `y > 0`,
  off the wall by at most 6 cm; it slides along the walls at any height, facing into the room), `ceiling` (hung
  plants). A piece set on something else (a pot on a worktop) is not registered: `surfaceOf` returns null.
- `owned`: what must be bought; it cannot be moved before.
- `keepsRoom`: never carried to another room nor put away (the bookcases).
- Its plan pose is kept as `Piece.home` (in the builder's zone): *Put the furniture back* and a stale save go there.
- What stands on it must **ride** it: place it with `placeWith(zone, host, item, local)` or a placer's `placeWith`
  (`Zone.ride` records the pose in the host's frame; `Zone.move` carries it along, all the way down). A thing placed at
  an absolute position on top of a piece stays behind when the piece moves.
- A saved pose is applied once the builder is done (a microtask), so whatever the builder puts on the piece first rides.
- Something that captures a piece's position at build time (a route, a spot) goes stale when it moves: read positions
  live (`getWorldPosition`, `localToWorld`), as the cat and the seats do. The visiting friends read the armchairs live
  and walk round whatever stands across their round (`world/nav/FloorNav`, `PERSON_WALKER`: see docs/visitors.md).

Where a piece may be set down (`Fit`): inside its room, not over another piece's footprint or colliders nor the drawn
bounds of the other movable pieces (pictures and plants have no footprint), not in front of a doorway (0.9 m on the
floor), not where it shuts part of the floor away from the doorways (`way.ts` `WayThrough`: a 5 cm grid of where the
player's 0.3 m-radius body can stand, walked from the doorways with and without the piece; more than 0.15 m² lost besides
the piece's own surroundings and it is refused: a cabinet narrowing the gap past a wardrobe to under a body's width), and
on a wall not over a window or a doorway. Flat things (under 3.5 cm: rugs, mats) only mind each other and the doorways;
furniture stands over them. A plan's own spot for a piece must pass the same: lay a new bought piece out against these
rules, the door leaves' swing included (`Doorway.swing` when a leaf cannot lie back against the wall).
