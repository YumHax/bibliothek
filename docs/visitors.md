# Friends who visit (`src/world/visitors/`)

Read this only when changing who visits, what they say, where they walk, or how loans work.

## The loop

Some in-game days (`MarketStock.day`), in the afternoon or evening of the in-game clock, a friend comes up the stairs
and rings the front door's bell (`audio/doorbell.playDoorbell`, fainter rooms away). Only while the player is in the flat
(not on the stairs, not asleep, not travelling), the front door is shut and nobody else (the postman) is at it. The front
door opens to them without the keys (answering is not going out: the homecoming is not told). They greet, walk in,
look at the shelves (a comment each stop), say a word to the cat if it is near, may ask to borrow a game, sit in a free
armchair, and leave the way they came, closing the front door behind them unless the player stands in it. Nobody
answering after two rings, they go back down and try another day.

Borrowing: a click on the friend opens the `BorrowPanel` (`src/ui/BorrowPanel.ts`, via `SessionActions.openPanel`).
Lending marks the game `lent` in the collection (the existing status: its box wears the LENT OUT tag, the WE BUY desk
refuses it). It comes back when due (2-4 days): the friend rings again and hands it back inside the door, sometimes with
a tip (coins) or a game they no longer want (a built-in game to their taste, added to the collection, so it waits in
the parcel). A loan `postAfter` days overdue comes back by post (a toast). A game marked back to owned in the editor, or
gone from the collection, ends its loan.

## Files

- `friendsPlan.ts`: `FRIENDS` (name, look seed + fixed traits, taste: platforms, genres, years; speed, borrow chance,
  own lines), `VISIT_RULES` (chance per day, gap, hours, ring timings, linger times, loan length, thanks odds, blocking,
  earshot) and `SHARED_LINES` (templates with `{title}`, `{platform}`, `{year}`, `{cat}`, `{days}`, `{coins}`).
- `VisitBook.ts`: the persisted book (`KEYS.visitors`): last visit day, visits per friend, loans. `plan(day)` is
  deterministic (`hash01` of the day): a due loan first, else a draw among friends without a loan.
- `friendLines.ts`: `tasteScore`, `shelfComment` (a loved game, a famous one by `Fame.peek`, an old one, the console
  corner, one they do not know; empty or huge collections get their own line), `borrowPick`, `fill`.
- `Friend.ts`: a `Walker` with a name, `seenFromNextDoor` (it lives in the collection room's zone like the cat but walks
  the flat); a click chats or answers its `request`.
- `Visit.ts`: one visit as an async script over the frames; legs walked a point at a time (a door on a leg is opened
  first; a player in the way makes them wait `waitFor` s, then they pass through, fading near the camera).
- `Visitors.ts`: the director (an empty prop in the collection room's zone): schedule, bell, `DoorCaller` for the front
  door (chained behind the building's `Doorstep`: `doorstep.also(visitors)`), the script's answers, loans.
- The route is plan data: `HALLWAY_PLAN.visitor` (stairs top, landing, inside the front door, beside the collection
  room's door on its latch side) and `ROOM_PLAN.visitor` (inside the door, a hub, browse spots with a facing, the
  armchairs reached `via` points clear of the lamps and cushions). Armchairs come from the room's `Seat`s.

## Wiring and testing

`furnishVisitors(options)` in `bootstrap/world`, after the flat is built and the cat exists, before `world.prime()` (the friends
are drawn under the floor until the first frame so their fade shaders compile with the flat's lights). `?visit` makes a
friend ring as soon as the player is home (whoever has a loan out comes to return it). A zone deactivation of the flat
(the player travelled out) ends a visit; so does the player staying out of the flat `aloneFor` seconds.
