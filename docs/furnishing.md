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
  changes); not a bookcase, nor anything something stands on. The pause menu's *Stored furniture* opens *The box room*
  (`ui/StoragePanel`: luggage tags under the room each was put away from, the shop's photo on each, twins as one tag
  ×N) and takes one out, in front of the player, in whatever room of the flat they are in, carried (put back, it goes away again).
- **From above** (L, or the pause menu's *Plan the room*): `furnishing/planView/PlanView` hangs the camera under the
  ceiling looking down, a cursor follows the mouse (the pointer stays locked), and the same carrier moves the floor
  pieces with it (`FurnitureCarrier.setAim`). Pendant lamps and hung plants hide meanwhile, and so does the HUD (wallet,
  tips, slips, prompt line, touch bar; the reaction line stays for refusals). The view is under drafting film (a faint
  grid, corner marks, a vignette) with a title block at the top: the room's name "from above", the keys of the moment as
  caps (free hands: take a piece, leave; carrying: set down, turn, put back), a quieter second row (free hands: U undoes
  the last move, which works from above too; carrying: the grid and putting away), the grid's state as a chip ("Grid
  on" / "Free"), and one line naming what is under the cursor or carried (green when it fits, red with the reason, a
  fixed piece "stays where it is"). The cursor says what a click does (gold over a piece, a cross while carrying, dashed
  over a fixed one). Esc reaches it only with the keyboard held (Settings > Display > Full screen); otherwise the browser
  takes Esc, lets the mouse go, and the view closes. On a touchscreen it does not open (it needs a mouse): a finger held
  on a piece moves it.
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
  taking the other's place; it fits when both rows have room for the box coming in (`Shelf.roomFor`, which measures
  the rows as they would stand after). Red: no room, nothing parts. `ShelfPlacing.swapping` says which it is.
- Boxes stand cover out. One can stand **spine out** instead, turned a quarter (its left spine out, the cover to the
  right): it takes its thickness of the row instead of its width, and two spines side by side stand pressed close
  (`SPINE_GAP`, 4 mm, against the 2 cm beside a cover), as books do, so a row holds far more. G with a shelf box in hand
  turns the ghost (`ShelfPlacing.turnInHand`: M or a right-click tap then puts it in that way; a box taken up again goes
  in cover out unless G is pressed again); G with free hands at home turns the box aimed at where it stands
  (`ShelfPlacing.turnAimed` -> `ShelvingGroup.setSpineOut`): its row closes up or opens, the box pulled out, turned in
  front of the row and pushed back in (`GameBox.slideToRest`'s way round). Refused, in words: a landscape box (its
  spine runs along its top, `mayStandSpineOut`), a card in a gap, no room on the row to stand it cover out again.
- Spine out belongs to the game, not to the sort: saved in the arrangement (`spines`, absent from older saves: none),
  kept in every sort T gives, and every layout measures each box as it stands (`Shelving.footprint` and
  `gapBetween` for the plans, `Shelf`'s `pack` for the rows, both the same). `GameBox.spineOut` is set by the shelving
  before its shelf lays the box out; the box then slides out by its spine (`slideAxis`, read by the Inspector), tips
  out of its row in that frame (Q), pops along the shelf's normal. On show in a display it stands face out
  (`Showcases` clears the flag; the shelves set it again when it comes back). A wish or a lent game is a card, cover out.
- U with free hands undoes a box moved, swapped or turned on the shelves too (`ShelvingGroup.snapshot` / `restore`, the
  boxes spine out included, kept in `Rearranging`'s history with the furniture's moves); a box put on a display is not undone.
- A game lent out leaves its gap like a wished-for one, a card in it headed "lent to Sam" (`WishCard`'s header, who and
  when from `collection/loans`, wired in `bootstrap/services`); the friend leaves with the box under the arm
  (`Visit.tuck`). Its caption and a click say who has it and when it comes back.
- What no shelf has room for waits in a pile of boxes on the floor (`shelving/BoxPile`): in front of the bedroom's
  bookcase slot until Mrs Roux's rooms are joined (`ANNEX_OVERFLOW`), in the study after (`STUDY_LEFTOVER`), never gone.
- A box in hand can be set down on the kitchen table, the nightstand or the TV stand beside the set (`ROOM_PLAN.standStray`)
  for the day, kept there over a reload (`StrayGames.remember`, `KEYS.strayLaid`, that game day only) (`StrayBox`, empty spots take one;
  free-handed the ray goes through an empty spot, `Interactable.passesThrough`). The search says where a game no shelf
  shows is (`BrowseParts.whereabouts`: lent, in the parcel, on a table, on display, in the pile).
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
floor), bought at SECOND HOME (`displayCase`, `pedestal`; `ROOM_PLAN.showcase`), hold any box of the collection face out;
so does Mrs Roux's mantel once her rooms are joined (two boxes against the wall, `annex/Fireplace`, docs/building.md).

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

## The bookcase view (`src/shelfView/`)

A click on a bookcase between its boxes (on a board, a side, the back: `BookcaseFronts`, one invisible plane per
bookcase just in front of its back, kept in the scene and moved with it, so the boxes are always hit first and the
shelves' own rays never meet it; the ray goes through it with a box in hand, seated, or facing one already), or B with
free hands in front of one (`ShelfView.aimed`: within 4 m, 40° of the view's middle, seen from the front), faces it.
`game/ShelfViewing` is the route (after photo mode, before moving things), `ShelfView` the machine.

- **The eye** glides square in front of it (`framing.framePose`: back until the whole bookcase fits the lens and the
  screen's shape with 10 % of air, eye at its middle height, pitch 0; nearer when a wall stands behind, the framing
  tighter; nearer still past furniture standing between (a sofa's back, a table: `framePose`'s `inFurniture`, the
  walk's body probes at a narrower 0.2 m, `FirstPersonController.bodyBlockedAt`, looked along from the eye to 0.45 m
  in front of the boxes). It is a seat's move (`FirstPersonController.sit`): leaving (E, S from the whole bookcase, B again, Esc the
  room hears, `Session.stand`) stands the player back where they stood, looking the way they looked
  (`FirstPersonController.stand`'s `look`). `Session.seatedIn` is null meanwhile (no seat), the Seating route never
  hears the walking keys (the view's come first).
- **The cursor**: the view stops turning (`controls.enabled` held off every frame) and the crosshair itself goes where
  the mouse takes it (`body.shelf-viewing`, `--shelf-cursor-x` / `-y`, `shelfView.css`), its caption and the click's
  reaction under it; the `Interactor` aims from it (`Interactor.aim`, normalised device coordinates, the middle
  otherwise). The box under it leans out (`setTipped`), its caption the tipped one (year, platform, state).
- **Rows**: W (or the wheel turned up) frames the row under the cursor, its spines readable; ↑ / ↓ another row (from
  the whole bookcase: the top or the bottom one); S back out to the whole bookcase. A / D: the nearest bookcase that
  way (any shelving, in a room drawn now, within 5 m, no wall between), the same row framed.
- **Flipping**: a row framed, each notch of the wheel puts the cursor on the next box along the row (left to right as
  seen), which leans out, as a finger walks along spines; a click takes it.
- **Taking a box**: a click (a press that hardly moves) takes it in hand and straight up close (`Inspector.examine`);
  the view parks (the crosshair back in the middle, every key the hands'), and once the box is put back the eye
  squares up in front again and the cursor is where it was. A walking key with the box in hand stands up as from a seat.
- **Moving a box**: a press on a box and a drag of 6 px lifts it off its row (out of the shelf, into the scene; the
  `Interactor` off meanwhile) and it follows the cursor a hand's breadth in front of the boards; over a gap with room
  it stands in front of it and the row parts (`spot.parting`), over the middle of another box that one leans out (a
  swap). Let go: `ShelvingGroup.moveBox` / `swapBoxes` as with a box in hand (the player's arrangement), and it slides
  in (`slideToRest`); no room: "No room on that shelf." and it slides back. U from the view undoes it
  (`Rearranging.rememberShelves`, `undoLast`). The lock lost, a box taken, the view left: it slides back.
- **Looking for a game**: F lays a strip of masking tape top centre (`ShelfFilter`); what is typed stays on the field
  (the walk and the crosshair wait, `Session.modalOpen`), and every box on the shelves drawn now whose title, platform
  or release year has the words leans out as it is typed. Enter puts the strip down keeping them out, Esc (or the
  lock lost) puts them back; none on this bookcase: a word says they are on another one, or nowhere.
- **Spine out, labels**: G turns the box under the cursor spine out, or cover out again (`Rearranging.turnAimed`, U
  takes it back), and K prints a label for the edge under it (`Labelling`'s `facing`): `ShelfPlacing` and the label
  maker aim from `Interactor.aim`, which is the middle of the view everywhere else. Q (`BoxTipping`) does nothing there:
  the box under the cursor leans out already.
- Keys (`input/actions`, context `shelves`): `faceShelves` B (shares buy's), `shelfIn` W, `shelfOut` S, `shelfLeft` A,
  `shelfRight` D, `shelfRowUp` / `shelfRowDown` the arrows, `filterShelves` F, `leaveShelves` E; L, M, R and Q do
  nothing there. On a controller RT presses B (buy's alias: it faces the bookcase in front and steps back from it), the
  right stick moves the cursor (synthetic mouse deltas), A takes the box under it, the d-pad goes along the rows (↑ ↓)
  and the bookcases (← →), and B (the right mouse button) steps back from a row, then from the bookcase: the d-pad
  walks no step meanwhile (`GamepadInput`'s `dpadWalks`). `Session.handsContext` is `'shelves'` there; the keys card and
  the touch bar, which know no bookcase view yet, show it as sitting (`bootstrap/session`'s `cardContext`).

## Two boxes side by side (`interaction/SecondHand`)

With one of the flat's shelf boxes in hand, C aimed at another shelf box (`game/Comparing`, after the hands) brings it
to the hand too: the box in hand is looked at (`Inspector.examine`) and moves left of the middle by half the second
one and a gap (`Inspector.sideShift`, eased; not in the loupe, which magnifies the first), and the second stands to its
right, turned as it is (`interaction/Rider`: slid out of its row, flown there, home again the same way), so the mouse,
the faces' keys and the snap turn both. It shows its openable self (`setInHand`), sharp art and back included. C
again, or the box in hand no longer looked at (a step, the wheel back), sends it home; E puts both back
(`Session.putBack` lets it go first). The card beside shows the first. A market copy in hand, or nothing aimed at:
C goes on to the cat. The ray goes through both (`Session`'s `interactor.ignore`).

## An armful (`interaction/Armful`)

Y on a shelf box (`game/Stacking`, before `CopyOpening`): free-handed it is taken in hand; with one of the flat's boxes
in hand it goes into the arms behind it (four more at most), each a little higher and to the right of the one in
front so their tops and edges show, turned with it (`Rider`s, closed: no hi-res art). While the arms are full the
box in front is not opened (O, V, T are refused), nothing is shelved from them (`ShelfPlacing`'s `full`: no ghost, no
M), and C is refused (and Y while comparing). E puts them all back, each to its home; put the box in hand back any
other way and the rest go home with it.

A table spot (`strays/StrayBox`: the kitchen table, the nightstand, the TV stand) takes the box in hand and the armful
as a pile, up to five, lying cover up one on another (2 mm apart), each turned and shifted its own way for the day.
Each place of the pile is its own claim in `StrayGames` (`kitchenTable`, then `kitchenTable+2`…), kept over a reload
for the day (`KEYS.strayLaid`, one entry per place: an old save's single box is the bottom place). A click with free
hands takes the top box, as a stray has always been taken; with a box in hand it goes on top while there is room
(full: it is swapped for the top one; an armful that does not fit is refused). The click target grows with the pile.
The search's whereabouts names the spot of any place of a pile.

## Seated with a box

A box in hand stays in hand when the player sits (an armchair, the sofa, the bed: the seat's click), and is looked at
the same way (the wheel: the view holds still, the mouse turns it). E puts it back first, then gets up; a step drops
it low in the hand and gets up with it. From the seat a box within reach (a stray on the table, a shelf in reach) is
taken as standing. The HUD's idle fade (`HudIdle`) waits while a box is in hand. Lying down to sleep puts it back.

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
