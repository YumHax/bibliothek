# Friends who visit (`src/world/visitors/`)

Read this only when changing who visits, what they say, where they walk, or how loans work.

## The loop

Some in-game days (`MarketStock.day`), in the afternoon or evening of the in-game clock, a friend comes up the stairs
(the stairwell's flight A, heard and seen climbing its last treads) and rings the front door's bell
(`audio/doorbell.playDoorbell`, fainter, duller and from the door's side rooms away: `audio/spatial.ts`). Only while the player is in the flat
(not on the stairs, not asleep, not travelling), the front door is shut and nobody else (the postman) is at it. The front
door opens to them without the keys (answering is not going out: the homecoming is not told). They greet, say a word
on coming in, look at the shelves (at a box on the bookcase in front of them, and comment on that game; at the window,
the street), say a word to the cat if it is near, may ask to borrow a game, sit in a free armchair (watching the TV if
it plays, else the player), and leave the way they came: on the landing they turn and pull the front door shut (its
thud and latch) unless the player stands in the doorway, then walk down the flight, fading out on its last treads.
Their footsteps are the player's own synthesis (`audio/footfall.ts`) at their feet, by distance, muffled per wall and
panned. A player in their way makes them stop, say "Excuse me" (`excuseAfter`), step 0.4 m aside where no wall and no
furniture is (`sidestepAfter`, checked with the acoustics' ray and the world's colliders: `VisitorsOptions.collisions`),
and only after `waitFor` pass through fading. The cat just ahead makes them stop and let it pass (`catAhead`, `catFor`).
The shelves are walked nearest first, straight from one to the next when nothing stands between (else by the hub). A display the player filled (`showcase/`, docs/furnishing.md "Displays") is always one of the stops (`VisitRoute.featured`): they look at a box on show and say a word on it. An
armchair is claimed (`Seat.guest`: the cat keeps off it, the player's click is told who sits there) from the moment they
head for it; taken on the way, they try another or skip the sit; they turn to face the room before sitting down to its
`sittingHeight`. What they say is heard as a faint murmur at their mouth (`audio/murmur.ts`, via `Friend.voice`), a tip's
coins clink from where they stand. The script's pauses are `VISIT_RULES.beats`. A click to chat turns them to the player
first; a comment on the box they looked at is made once, then they talk of others. Nobody
answering after two rings, they go back down and try another day.

Talking: a click on a friend opens the conversation (docs/social.md "Friends"): what they asked is its first entry; visits, loans, cake and games nights move how they stand with the player, and their tier brings perks (a game of theirs lent, a postcard, an unannounced call with a find) or keeps them away when cold.

Borrowing: a click on the friend's request entry opens the `BorrowPanel` (`src/ui/BorrowPanel.ts`, via `SessionActions.openPanel`).
Lending marks the game `lent` in the collection (the existing status: its box wears the LENT OUT tag, the WE BUY desk
refuses it). It comes back when due (2-4 days): the friend rings again and hands it back inside the door, holding its box
out for `handBackFor` s (a `GameBox` in both hands) before it goes back on its shelf (the loan closes then, or when the
visit is cut short), sometimes with a tip (coins) or a game they no longer want (a built-in game to their taste, added
to the collection, so it waits in the parcel: the lines and the reward say so). A loan `postAfter` days overdue comes back by post (a letter card to read). A game marked back to owned in the editor, or
gone from the collection, ends its loan.

From the flat (docs/household.md): a friend asked round on the bedroom's phone is that day's visit (`VisitBook.invite`);
a cake on the kitchen table gets a slice, a longer stay and a thank-you (`VisitorsOptions.hosting`).

## Files

- `friendsPlan.ts`: `FRIENDS` (name, look seed + fixed traits, taste: platforms, genres, years; speed, borrow chance,
  own lines), `VISIT_RULES` (chance per day, gap, hours, ring timings, linger times, loan length, thanks odds, blocking
  and sidestep, footsteps, stairs, hand-back, look range, earshot) and `SHARED_LINES` (templates with `{title}`,
  `{platform}`, `{year}`, `{cat}`, `{days}`, `{coins}`; about five a bucket, `…Night` buckets after dark by the sky's
  daylight; `enterFirst` on a first visit, `enterRegular` for a regular). Every bucket is a persisted shuffle bag
  (`VisitBook.draw`): each line once before any comes back, never the same twice in a row, across visits. The word in the
  bubble out of earshot is drawn the same way from `WORDS` by kind (`hi`, `ooh`, `bye`, …: `VisitScript.say(line, word)`).
- `VisitBook.ts`: the persisted book (`KEYS.visitors`): last visit day, visits per friend, loans. `plan(day)` is
  deterministic (`hash01` of the day): a due loan first, else a draw among friends without a loan.
- `friendLines.ts`: `tasteScore`, `shelfComment` (on the `focus` box they look at, else one drawn: a loved game, a
  famous one by `Fame.peek`, an old one, the console corner, one they do not know; empty or huge collections get their
  own line), `lookPick`, `borrowPick`, `fill`.
- `Friend.ts`: a `Walker` with a name, `seenFromNextDoor` (it lives in the collection room's zone like the cat but walks
  the flat); a click chats or answers its `request`.
- `Visit.ts`: one visit as an async script over the frames, on its own pausable clock (`after`: the cake's line);
  legs walked a point at a time (a door on a leg is opened first; a player in the way: excuse, sidestep, then through,
  fading near the camera); the floor's height down `route.flight`; a footfall every `steps.stride`.
- `Visitors.ts`: the director (an empty prop in the collection room's zone): schedule, bell, `DoorCaller` for the front
  door (chained behind the building's `Doorstep`: `doorstep.also(visitors)`), the script's answers, loans. It notes the
  day's journal (`journal`, kind `visit`): who came round, a game lent, handed back or posted back. A game given lands
  in the collection with `acquired.where` "a gift from Sam", which `journalWatch` notes as a `gift`.
- Neighbours on the stairs (`stairwell/Neighbours.ts`, `STAIRWELL_PLAN.residents`): their own hellos and chat lines, each
  said in turn from a start of their own; a line may be for the morning, day or evening only, or need the cat adopted
  (`catHome`); they murmur too.
- The flight is the stairwell's plan (`STAIRWELL_PLAN.flightA`, its treads). The route is plan data: `HALLWAY_PLAN.visitor` (stairs top, landing, inside the front door, beside the collection
  room's door on its latch side) and `ROOM_PLAN.visitor` (inside the door, a hub, browse spots with a facing, the
  armchairs reached `via` points clear of the lamps and cushions). Armchairs come from the room's `Seat`s, read live
  (the player may move them, docs/furnishing.md): moved off its spot, an armchair's `via` is dropped. Any leg in the
  collection room that is not a door's nor the step into the chair (`Leg.direct`), blocked by something the player put
  across it, is walked round (`Visit.roundFurniture`, `Visitors.detour`: `world/nav/FloorNav` with `PERSON_WALKER`).

## Wiring and testing

`furnishVisitors(options)` in `bootstrap/world` (with `surfaceAt`, `covers`, `shelfBoxes`, `watch`), after the flat is built and the cat exists, before `world.prime()` (the friends
are drawn under the floor until the first frame so their fade shaders compile with the flat's lights). `?visit` makes a
friend ring as soon as the player is home (whoever has a loan out comes to return it). A zone deactivation of the flat
(the player travelled out) ends a visit; so does the player staying out of the flat `aloneFor` seconds.

## Gatherings (`src/world/visitors/gathering/`)

More than one person round at once, each a `Visit` played by the director's own rules. `Visitors.host` (`host.ts`
`VisitHost`) lends the round, the bodies (the friends, the six open-house `GUESTS` and the club's `CLUB_VISITOR`, all
placed hidden at start-up for the shader prime), the voices, the bell and the footsteps; `Party` runs several visits:
`add(plan, delay, behind)` (behind: up the stairs `delay` s after the one before is let in), the first on the landing
rings (again after `ringAgainAfter`, gone after `giveUpAfter`), a second waiting stands a step down, an open front door
lets whoever arrives in. A member's visit takes `stops` (given), `sits`, `standIn` (a spot when no armchair is free:
they stand facing the room, eyes on the TV) and `stayUntil` (stay until the gathering says so). `Gatherings` (a prop in
the collection room's zone, an `Occasion` the director hands its door to: `host.attach`) starts one at a time, never
on a day a friend already came (`VisitBook.rang`), and holds the day it plans (no solo visit). Rules and lines:
`gatheringPlan.ts`; the book (`GatheringBook`, `KEYS.gatherings`): the night and the open house planned, the last ones
held, the paper's account, the photos.

- **Games night** (`GamesNight`): the phone's "Have everyone round tonight" (before `callUntil`, every `everyDays`,
  not on a day someone came). From `from` (or `inHours` after the call) the three friends come, one behind the other;
  one shelf each, then they stand at `ROOM_PLAN.visitor.party` round the TV armchair (the player's: the route's seats
  are emptied). Player two (the one who rang) offers PADDLE WARS (`offerAfter`, again every `offerAgain`, three times
  unanswered at most); a click on them runs `PaddleWarsProgram` (the arcade's `Duel` as a `ScreenProgram`) on the TV
  through the `ProgramRunner` (`built.programs`, set in `bootstrap/session`), the player picks the pad up where they
  are (`ProgramPlay`). Goals and the score get reactions and lines; after `matches` matches (and `minStay` s) or
  `stay` s they leave a few seconds apart. An evening with a match adds a polaroid to `NightPhotos` on the hallway's
  far wall (`HALLWAY_PLAN.nightPhotos`, up to `photos`) and one friend leaves a game they no longer play
  (`giftChance`) or a tip. Nothing happens to a player who never hosts.
- **Open house** (`OpenHouse`): the phone's "Ring THE GAMING WEEKLY", from `minGames` games, every `everyDays`, for
  `aheadDays` later; that morning at home a word says it is today. From `from` to `until`, `waves` waves of
  `perWave` strangers (never more than `inFlat` in the flat, the next once the last is in and the player is home):
  each drops `entry` coins at the door (one more for every `entryEvery` games past `minGames`, at most `entryMax`: a
  fuller flat draws a better crowd), makes `stops` stops (the shelves, the window, the displays with something in
  them: `Showcases.stops`), gasps at a rare copy (`isRare`: a grail, a first print, 40 000 monthly views), goes. The
  account (`OpenHouseAccount`) is read the next day at home as THE GAMING WEEKLY's article, and the market records an
  `openHouse` deed (`REPUTATION.points`).
- **The collectors' club** (`ClubVisit`): an honour completed (`economy/Honours`: a club set, or every game of a
  console's built-in list) lights its neon over the bookcases (`collector/HonourNeons`, `ROOM_PLAN.honours`); from the
  day after, in the afternoon (`club.from`..`until`), Mrs Albers rings, stands at the shelf under it, looks up at it
  (`Honour:<id>` in the room's zone), says a word, leaves `club.gift` coins. Unanswered, she comes another day.

Testing: `?gamesnight`, `?openhouse`, `?clubvisit` start that gathering as soon as the player is home.
