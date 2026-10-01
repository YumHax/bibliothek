# Moving things about the flat

The player rearranges the flat with the right mouse button (a controller's B, a finger held on the thing; M does the
same on the keyboard). `src/furnishing/` carries furniture, `src/game/Rearranging.ts` holds the rules and the keys.

- **A box in hand, aimed at a shelf**: a see-through ghost of the box stands in the gap it would go into, the row's boxes
  parting for it (warm: the row has room; red: none). Aimed at the middle of another box, the ghost wraps that box
  (blue): a swap. A right-click *tap* (or M) puts it there; a right *drag* still turns the box in hand
  (`Session.bindInput` tells them apart: under 280 ms and 10 px is a tap).
- **Hands free, aimed at a piece that was bought** (Front Street's shops, the market's household stall) **or a
  bookcase**: the piece is outlined and the caption says "Right-click to move". A right-click takes it: it lifts 5 cm,
  stops colliding and follows the aim over its surface (floor, wall, ceiling), what stands on it riding along.
- **Carrying**: a click (or M) sets it down where it shows green, R / Q turn it a quarter either way, the wheel an eighth,
  G turns the grid off (free placement: the wheel turns 15°, a piece brought near a wall turns flush against it), X
  puts it away, a right-click or E puts it back where it was. U with free hands undoes the last move (20 deep).
  Leaving the pointer lock (Esc) or opening a panel puts it back too.
- **Through a doorway**: carried into another room of the flat (not the stairwell), the piece goes with the player
  (`Zone.handOver`: out of one zone's group, colliders and shadow layer into the other's); its saved pose records the
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
  pieces with it (`FurnitureCarrier.setAim`). Pendant lamps and hung plants hide meanwhile.
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
  furniture / someone / edge): the footprint is drawn cell by cell, green or red, the piece's outline green or red, what
  is in the way outlined red (seen through walls), the ways through the doorways faintly red all along, where it was
  taken from in faint white. The caption says why ("it would block the doorway", "it would hit the armchair", "Sam is in
  the way"). Nobody is set down on: the player's feet, the cat, a visiting friend (`friendsIn`, by name).
- **The spot beside**: aimed where it may not stand, the nearest cell up to 3 steps round where it may is outlined
  green; a click sets it down there.
- **Feel**: it floats 5 cm while carried and settles in 0.16 s; a tick on each grid step or turn, a bump when refused,
  a thud by weight (`audio/furnitureSounds` `playSetDown`).

A saved pose the plan has since made impossible (a new unit where it stood) is dropped on load: the piece goes back to
its plan spot (`Furnishings.checkSaved`, logged `[furnishing]`).

## The shelves: the player's arrangement

`src/world/shelving/arrangement.ts` (`ShelfArrangement`, saved under `KEYS.shelves`) holds the sort the shelves stand in
and the player's own rows: per shelving id (`'living'`, `'bedroom'`), bookcase, row (top first), game ids left to right.

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
floor), and on a wall not over a window or a doorway. Flat things (under 3.5 cm: rugs, mats) only mind each other and the
doorways; furniture stands over them.
