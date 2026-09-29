# Moving things about the flat

The player rearranges the flat with one key, M (`moveFurniture`; a controller holds X, the touch bar has Move):

- **A box in hand, aimed at a shelf**: a thin marker stands in the gap it would go into (warm: the row has room; red: it
  has none). M puts it there, on any row of any bookcase, the collection room's or the bedroom's; the neighbours slide
  over to make room and the box flies from the hand to its new spot.
- **Hands free, aimed at a piece of furniture that was bought** (anything from Front Street's shops or the market's
  household stall): M picks it up. It stops colliding and follows the crosshair over its surface, what stands on it
  riding along; a click (or M) sets it down where it fits, R turns it 45° (the wheel 15°), E puts it back where it was.
  Leaving the room's pointer lock (Esc) or opening a panel puts it back too.

Built-ins never move: walls' radiators and sockets, the kitchen units and appliances, the bathroom's fittings, the
wardrobe, the TV on its stand, the projector (it is aimed at its wall), the bookcases (the shelving lays them out).

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
- Boxes come from a `BoxPool` shared by both shelvings: a game passing from one room's shelves to the other keeps its
  box. A shelving takes boxes only for the games that get a spot; the plan works on the games' sizes (`boxDimensionsOf`).
- When the bookcases come out as they stand (same count, same row heights), a rebuild keeps them and the boxes slide;
  only a box already on one of them slides, one arriving from elsewhere appears. `Shelf.placeRow` gives a box in hand
  its new rest pose and its `home` (the Inspector brings it back there).

## Furniture: registering a piece

`src/furnishing/`. A builder registers what it places that the player may move:

```ts
ctx.home.furnishings?.register(zone, item, { key: 'dresser', at: plan.dresser.at, owned: own.dresser });
```

- `key`: unique in the zone, stable (the saved layout, `KEYS.furniture`, is keyed by zone id and key). Plan `decor`
  entries with an `upgrade` are registered by `placeDecor` itself, keyed by what they need bought (`ownedKey`:
  `houseplant#3`, `speakers`, `speakers~1`): nothing to do for a new decor line.
- `at`: the plan's `Placement` says what the piece moves over (`surfaceOf`): `floor` (floor, corner, or against a wall
  with `y: 0`: it snaps flush against a wall it is brought near, turned to face away from it), `wall` (hung: `y > 0`,
  off the wall by at most 6 cm; it slides along the walls at any height, facing into the room), `ceiling` (hung
  plants). A piece set on something else (a pot on a worktop) is not registered: `surfaceOf` returns null.
- `owned`: what must be bought; it cannot be moved before.
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
