# The economy: going out, the arcade, the market

Read this when touching money, prices, the cabinets, the stalls, or how the player leaves the flat.

## The loop

The collection starts empty and Tab no longer adds games (`?debug` in the URL restores the seed list and the
editor's "add" pane). Games are bought with coins; coins are won at the arcade:

1. **Front door** (`TravelDoor` in the hallway, `to: 'street'`) -> fade (`Fader`) -> teleport (`Travel.go`) onto
   Front Street (`src/world/street/`, docs/zones.md), in front of the building -> the `ZoneManager` loads it. There,
   `StreetDoor`s lead home, into the arcade and into RÉTRO JEUX (the flea market is at its back); the arcade's and
   market's exits go back to the street, in front of their door (`TravelPlan.arrivals`, keyed by the zone left). A
   `TravelDoor` without `to` would still open the "Where to?" menu (`TravelMenu`: every `travel` zone but the current).
   The front door opens only with the flat's keys taken from the console bowl (`HouseKeys`, the door's `guard`);
   coming home (`hallway/Homecoming.ts`) drops them back in the bowl and, some in-game days, leaves flyers on the
   doormat (`hallway/mail.ts`: today's arcade challenge, a copy on a stall, the neighbourhood's paper).
2. **Arcade** (`src/world/arcade/`, see "The arcade" below): every machine (ten `ArcadeCabinet`s, the `Pinball`,
   the `AlleyRoller`, the `HoopShot`, the `TicketWheel`, the `ClawMachine`) is an `ArcadeMachineLike`: clicking it
   costs `PLAY_COST` coin and parks the player at the controls (`player.sit` + `lookAt`; the look stays free, which
   the light gun and the hoops aim with); the machine reads the keys straight from `Input` and reports an
   `ArcadeResult` (score, new best, prize); the Session pays `ticketsFor(gameId, score)` tickets (the claw pays a
   prize instead, into the `PrizeStore`), today's challenge bonus, any medal the score earned (`ArcadeMedals`) and,
   on the day's first ticket play, the streak's bonus (`ArcadeLeague`), and counts it all in the weekly league
   (`record`; a finished week is announced once, a won one brings the pennant home). A score that makes the hall of fame asks for
   initials first (the machine is still `isPlaying` until they are signed). The end card counts the tickets up and
   stays: Space / Enter or a click pays another coin and replays without standing up, `E` or Esc walks away (a
   running play is lost). The prize counter (`PrizePanel`) swaps tickets for prizes, which go on the bedroom's
   `PrizeShelf` (or where they do their job at home, see "Prizes" below), for a mystery game, or for coins at `TICKETS_PER_COIN`. With no coins and fewer tickets than a coin is worth, a ticket
   machine's play is free ("on the house", `playIsFree`), so the loop never dead-ends; the claw never is.
3. **Market** (`src/world/market/`, a 10 x 10 m hall): one stall per platform (`MARKET_PLAN.stalls` needs a
   spot per platform, the builder throws otherwise; each spot names its `StallStyle`, see "The finer market")
   shows the day's `MarketStock` as `ForSaleBox`es (a `GameBox` with a price tag; the wrapper owns the click) where
   the stall's `layout()` puts them (the showpiece first). Clicking a copy hands it over like a shelf box
   (`Session.inspectForSale`: turn it, O opens it, a missing manual shows), with price and state in the
   `GamePanel`; the keys are the `MarketCounter`'s (`src/game/MarketCounter.ts`, the Session delegates): **B** buys
   it (spends what is due, adds the game with its receipt to the `CollectionStore`, the box drops into the bag via
   `Inspector.stow` and leaves a gap on the table), **H** haggles (the `HagglePanel`, see below), **R** holds it,
   **X** swaps, **U** hands a purchase back, E or a click elsewhere puts it back. So a stray click never spends
   anything. The **bargain bin** (`BargainBin`, by the way in) holds worn copies of any platform at `BARGAIN_PRICE`,
   no haggling. The `OrderCounter` opens the `CataloguePanel`: any game in the libretro index, new, at `shopPrice`,
   with a cover thumbnail and a badge when one of today's stalls has a copy (`MarketStock.peekToday`); "Used…"
   orders a second-hand copy instead. The **WE BUY** desk (`BuyBackDesk`) opens the `SellPanel`: the collection with an offer
   per game (`buyBackPrice`), two clicks to sell; lent-out games cannot be sold. A sold game goes to the
   `MarketLedger` and is on its stall from the next market day for `CONSIGNMENT_DAYS`. Prices are never charged
   before they settle: a stock item and a catalogue or sell row start at the ordinary price (tag "…", button
   "Pricing…") and can only be bought once the game's fame arrived (`StockItem.priced`; the tag and the row repaint).
   Tags also fade when the wallet does not stretch to them, strike the old price after a haggle, carry a gold band
   on a stall's showpiece and a red star on a wishlist game. People: a stallholder behind every table whose lines
   come from their table (`stallTalk`: the pride of the stall, the cheapest, a missing manual, a wishlist game, a
   sale just made, night), a clerk behind each desk, shoppers who never share a browse spot, keep right in the
   aisle and wait for the player in their way. After dark (the sky's `night`) all but `nightShoppers` go home and
   the murmur drops. Sound: `CrowdSound` (generated chatter, only while the player is in the hall), a
   `TransistorRadio` on one stall (a generated pop station, louder up close, click to switch off), coins on a sale.

## Numbers (`src/economy/pricing.ts`)

Everything tunable is there: starting coins, play cost, tickets per coin, points per ticket, base price per
platform, the fame curve, the market discount range and condition factors, the bargain bin's flat price, the WE BUY
desk's share (`BUY_BACK_SHARE` 0.3 of the shop price, up to 0.34 with reputation: below the cheapest a haggled
market copy goes, `NEGOTIATION.lowest`, so buying to sell back never pays), the negotiation, and every rule of "The
finer market" (editions, fakes, holds, orders, lots, swaps, cards, coffee, rivals, reputation, loyalty). A price is `BASE_PRICE[platform] x
fameFactor(views) x jitter(id)`: no real price source exists key-less, so fame stands in for value (see below).
Calibration: a good player earns about 20 coins a minute at the cabinets (a play is 1 coin). `PAYOUT` sets each
game's points per ticket so that a decent play pays about the same tickets per minute whatever the game (a
decent 15-second cabinet play about 35-40 tickets; the pinball's points are worth far less, the alley's far more):
first estimates, retune one when a game turns out to be the obvious earner. `rivals.ts` holds each game's starting
table (five made-up scores, an ordinary play to a very good one) and the daily challenge aims between its fourth
and second; move them with `PAYOUT` when a game's scoring changes. The pinball's were measured with its autopilot
(a 3-ball game about 45 s, median 10 000, upper quartile 24 000); the cabinets' pilots play far better than a
person, so their tables are estimates; `simulatePayouts()` (console, with `?payout`) plays every cabinet game
headless on its autopilot and prints score, length and tickets a minute per skill, to compare the games with each
other after a change, and `?payout` shows the player's real plays per machine (`PayoutStats`, `PayoutOverlay`).
The newer games (PADDLE WARS, STEP BEAT, NEON SHERIFF, HOOP FEVER) were set that way; LexiPunk's rate is a guess
until the site's scores are seen. The extras have their numbers there too: `MEDAL_REWARD`, `STREAK`, `LEAGUE`,
`WHEEL_SLICES` and `JACKPOT` (the wheel pays about 12 tickets a spin on average: a thrill, not an earner),
`MYSTERY_GAME_TICKETS`. Base prices are set against that rate: an ordinary market copy (80-100 coins) is 4-5 minutes of
play, a worn cheap one 1-2, a legend on a stall (Ocarina of Time about 600) half an hour. Retune `BASE_PRICE` if
the cabinets' payouts move, `FAME_CURVE` if legends feel too cheap or filler too dear.

## Fame (`src/economy/Fame.ts`, `server/fame.ts`)

How well known a game is = the average monthly page views of its English Wikipedia article over the last six
full months (Wikimedia pageviews API, key-less). `null` when Wikipedia has no article (most catalogue filler),
`undefined` while unknown (offline, or the lookup failed): then the game is priced as ordinary (factor 1) and
asked again next time. `FAME_CURVE` maps `log10(views)` to the factor: no article 0.6x, ~2 000 views 1x,
~40 000 near 3x, 200 000+ 4x. Orders of magnitude seen: Kwirk 700, Xevious 3 300, Sonic 2 9 000, Chrono
Trigger 28 000, Ocarina of Time / Final Fantasy VII 50 000.

`GET /api/fame?title=...&platform=...` (Vite plugin in dev, `api/fame.ts` on Vercel) does one Wikipedia search
("<title> <platform name> video game", hits come with their Wikidata description), keeps the hits described as a
game (not a series, character, list...) whose title carries most of the game's words and all of its numerals
(so "Breath of Fire" never stands in for "Breath of Fire II"), and takes the closest title rather than the top
hit (Wikipedia ranks "Super Mario 64 DS" above "Super Mario 64"); a second search on the main title (before the
colon) catches "Solstice (1990 video game)". Then one pageviews call. Wikimedia wants serial requests: the
server runs them one at a time 150 ms apart and retries a 429, so a fresh day's stock (30 games) takes 15-20 s
to price; the stalls show provisional tags meanwhile. Answers are cached a month under `.cache/fame/` (delete a
file to re-match a game). Matching a free-text title to an article is the fragile part; keep it all in
`server/fame.ts`.

## Haggling

H with a stall copy in hand opens the `HagglePanel`: a short exchange with the stallholder, one per copy per market
day (`MarketLedger` remembers the outcome across reloads). The player offers cheeky, fair or polite (keys 1-3,
`NEGOTIATION.offers`, shares of the tag) or takes the standing counter-offer (Enter). The stallholder
(`economy/haggle.ts`, `Negotiation`, pure) has a secret lowest price, drawn per copy and day (so it cannot be
rerolled) by kind of copy (`NEGOTIATION.floor`: a showpiece rarely moves, a worn copy easily), lowered by loyalty,
a coffee and the rain, raised by the stall's soured mood, never under `NEGOTIATION.lowest`; and a patience of a
few offers. An offer at or over the lowest price is taken; under it, a counter-offer halfway down; far under it
(`insult`) costs two patience and sours the stall for the day. Out of patience, the tag stands. Walking off
mid-haggle keeps their last counter for the day; closing without an offer costs nothing. Not before the price
settled, never in the bargain bin or on an order. The agreed price holds all day (tag and label say so).

## Stock and condition

The stock follows **market days** (`MarketCalendar`): a day passes when the game's clock runs through midnight
(ten real minutes a day; the N toggle does not count) or when the player comes back on another real date; persisted.
`MarketStock.todays()` draws, per platform and in stall order: the copies the player **ordered** (due today or
before), a **showpiece** (a title from `SEED_GAMES`, under the index's id, complete, sometimes a first print), a
second famous game on an **estate sale** (and a third for a trusted player), a copy **kept aside** for a friend of
the stall, the day's **upgrade** (a first print of a game the player owns), with `wantedOdds` one game off the
player's **wishlist** (more often for a regular), the games the player **sold** (`MarketLedger.consignedOn`), then a
few ordinary copies (`perPlatform`, 2 to 8, more on a fair day) from the index, skipping hacks, protos, revisions
and non-western regions, bar the odd Japanese **import** (`IMPORT`, cheaper); among them first prints and budget
re-releases (`EDITION_ODDS`, `EDITION_FACTOR`) and **fakes** (`REPRO_ODDS`); plus the **bargain bin** (`bin`, worn,
flat price, now and then a famous **gem**, `BIN_GEM_ODDS`). Seeded by the market day, so the same all day and across
reloads. The builder tells it how much each stall and the bin show (`fitTo`, from `StallLike.capacityFor` and
`BargainBin.capacity`), so every copy on sale is on a table. What the collection owns is filtered out
(`CollectionStore.owns`: owned or lent; a wishlist entry is not a copy), and so is what other shoppers bought
today. Each copy gets a `BoxCondition`: `complete`, `noManual` (the booklet is hidden in the box) or `worn` (no
booklet, dulled cover: `GameBox` reads `game.condition`). The shop only sells complete copies.

## The finer market

- **Stalls** (`stallTypes.ts`, `StallLike`): a trestle table (`MarketStall`), tiered risers (`RiserStall`), a
  blanket on the floor with a suitcase (`BlanketStall`), a locked glass case (`GlassCaseStall`, `behindGlass`: only
  from reputation level `glassCaseLevel` does the stallholder hand its copies over). Each says where its boxes go,
  where its stallholder stands and where a red `WishPennant` flies (while a wishlist game is on the table).
- **Holds and orders**: R pays `HOLD_DEPOSIT` of the price to keep a copy for the day (tag ON HOLD, rivals leave
  it); the deposit counts towards the price (`StockItem.due`). "Used…" at the catalogue quotes a second-hand copy
  (`MARKET_ORDER`), takes the deposit and puts it on its stall `days` later (tag PUT BY FOR YOU) until bought.
- **Swaps**: X opens the `TradePanel`: a game from the collection counts for `tradeValue` (`TRADE_SHARE`), the
  rest in coins, no change given; the game given goes out on its stall like a sale.
- **Handing back**: U within `UNDO_PURCHASE.seconds` of a purchase refunds `UNDO_PURCHASE.refund` and a fresh box
  of the same copy goes back where it stood (`ForSaleBox.restock`). Not for orders or upgrades.
- **Fakes and editions**: a reproduction looks like any copy; O (opening the box) finds it out
  (`MarketStock.expose`): the price drops to `REPRO_CAUGHT` of the tag. Bought unknowingly, the collection's panel
  owns up and the WE BUY desk pays `REPRO_BUY_BACK`. Tags carry a band for first prints, budget lines
  (`BUDGET_LABEL`), imports, holds, orders, kept-aside copies and upgrades. An upgrade bought replaces the owned
  copy (`CollectionStore.update`), the old one going to the stall.
- **Job lot** (`LotCrate` + `JobLotPanel`): a crate of `JOB_LOT` games from anywhere at a share of their worth,
  once a day.
- **Notice board** (`NoticeBoard` + `NoticeBoardPanel`, cards in `MarketNotices`, persisted): WANTED cards
  (`WANTED_AD`, up several days: one from the collection, the rest from the day's stalls, paying well over the WE
  BUY desk), FOR SALE cards (`FOR_SALE_AD`, today only, to the parcel), the **collectors' club**
  (`collectorSets.ts`: complete a set, claim its coins once) and **you & the market**: reputation, loyalty, the week.
- **Reputation and loyalty** (`MarketStanding`, lifetime): `REPUTATION.points` per deed (buy, sell, a deal, a swap, a
  lot, a wanted card, a set); levels open the glass case, raise the WE BUY desk's offers, and (`earlyAccessLevel`)
  keep an estate-sale copy back. Loyalty per stall (`LOYALTY.tiers`, copies bought there): a regular gets wishlist
  finds more often, better haggles, a friend a copy kept aside every day. Stallholders greet them accordingly.
- **Market days** (`marketDays.ts`, `themeOf(day)`): a weekly round of ordinary days, a big bin day, a Nintendo
  fair, a Sega & Sony day, a collectors' fair, an estate sale; shown on the program board by the door.
- **Coffee** (`CoffeeCart`, `COFFEE_PRICE`, once a day): stallholders go easier (`NEGOTIATION.coffee`).
- **Weather**: heavy rain (`sky.weather`) keeps half the shoppers home, makes stallholders keener, and drums on
  the roof (`RoofRain`).
- **Rivals** (`RivalBuyers`): a shopper browsing at a stall buys a copy now and then (`RIVAL_BUYING`, capped per
  day, never a held copy, never from the glass case); the stallholder calls "Sold!".
- **People**: stallholders answer what is done with their stock (`stallTalk.REACTIONS`, a word in a speech bubble
  and a gesture), cry out to passers-by (`callOuts`), and the box clacks (`audio/boxClack`).
- **Reading the stalls**: hold Q (`PriceScanner`) and titles and prices float over the boxes in front; the
  directory board by the door says where each platform is (a star where a wishlist game waits).
- **The household stall** sells `HOME_GOODS` (`economy/homeGoods.ts`, the flat side places them): one click per
  piece, through `SessionActions.buyUpgrade`.
- **Receipts**: every game bought carries `acquired` (price, where, market day); the panel shows it at home, with
  its edition. The market panel warns when the shelves at home are full (`shelfRoom`).

## Persistence

`bibliothek.wallet.v1` (coins + tickets), `bibliothek.arcade.v2` (the player's bests, the top-five tables, the last
initials; `v1`, bests only, is folded in once; regulars' entries go in it too), `bibliothek.arcadeDaily.v1` (the day the challenge and the change
machine were last claimed), `bibliothek.arcadeMedals.v1` (medals per machine), `bibliothek.arcadeLeague.v1` (this
week's tickets, the streak, a finished week not yet announced, pennants), `bibliothek.arcadeJackpot.v1` (the wheel's
pot), `bibliothek.arcadeReplays.v1` (the player's best run per cabinet game), `bibliothek.payoutStats.v1` (the
balance table), `bibliothek.moodLamp.v1` (the lamp's colour), `bibliothek.prizes.v1` (the prizes taken home), `bibliothek.calendar.v1` (the market
day), `bibliothek.market.v1` (the day's haggles, soured stalls, rival sales, holds, fakes found out, coffee and
job lot; games sold to the market; copies on order; notice cards dealt with; v1 files with only haggles are read),
`bibliothek.standing.v1` (reputation, loyalty per stall, sets claimed), `bibliothek.notices.v1` (the cards drawn),
the collection as before (games now carry `edition`, `repro`, `acquired`).

## The arcade

The hall (`arcadePlan.ts`, the header comment has the map; 12 x 8 m): black neon-confetti carpet (`Carpet.ts`) with a
`CarpetBorder`, dark glazed dado, aubergine walls under a black ceiling hung with `Duct`s, `HangingBanner`s and a
`MirrorBall`, two `MirrorPillar`s either side of the island, neon (`NeonSign`s, `NeonTube`s along the wall tops:
the only real lights besides the first cabinets' glow; the house `FlushLamp` is off). No windows, so the ambient holds a
fixed daylight (`furnishShell(..., { fixedDaylight })`): the hall looks the same at noon and midnight. Every screen
throws a `GlowPool` on the carpet (additive, alpha kept, no light: a point light per machine would cost every pixel),
its level following what the screen does; only the six original cabinets keep a real `PointLight` (`glowLight`).

- **Cabinets** (`ArcadeCabinet`): six along the back wall (LEXIPUNK, the four classics, PADDLE WARS), two back to
  back in the middle, NEON SHERIFF and STEP BEAT either side facing the way in. The glass is a canvas under
  `crtScreenMaterial` (bulge, scan lines, grille, vignette). The joystick leans and the buttons go down with the
  keys; a `TicketStrip` feeds out of the slot as the end card counts the tickets; the end card and the label say
  what a replay costs (or FREE PLAY). Idle, a cabinet loops an **attract sequence**: its title card (the table's
  top score, the player's best, the next medal, today's challenge when it is on this game), then the game playing
  itself (DEMO, on its autopilot, silent) or, every other time round, **the player's best run replayed** (`replay/`:
  the game is stepped at a fixed `REPLAY_STEP` live, in demos and in replays, every board-shaping draw goes through
  the run's seeded `rand()`, and a new best keeps its seed and run-length-encoded controls, `ReplayStore`; a replay
  that no longer ends on its score was recorded under older rules and is dropped). Farther than `DEMO_RANGE` from
  the camera it only shows its title card. It sings a jingle now and then. Each carries its **medal lamps**
  (`MedalRow`) under the marquee, a printed **instruction card** on the panel (`InstructionCard`, from the game's
  hint; the HUD spells a machine's controls out only on its first play of the session) and its **wear** (`wear`: stickers, some peeling, on the side art; cigarette burns and scratches on the
  panel; scuffs on the base). A two-player game (`setOpponent`) gets a second stick and a `partner` spot; an
  `attachment` changes how it is played: the `LightGun` (a toy pistol on a cable in a holster on the side, held low
  and right of the eye while playing, pointing at the aim, kicking back on each shot; the cabinet aims the game
  where the camera looks, `controls.aim`, and a click on the glass is the trigger) and the `DancePad` (a steel
  stage in front with four arrow panels that sink and light with the keys and glow with the beat, side bars to hold;
  the player's eye stands over it). **Out of order**: about one day in three (`ArcadeDaily.outOfOrder`, never the
  challenge's cabinet) one cabinet shows snow behind a taped note, says so and cannot be played; regulars walk past it.
- **LexiPunk** (`games/LexiPunk`, the user's own word game at lexipunk.com): a coin opens the big frame
  (`ui/ArcadeScreenPanel`, a modal: the page in an iframe inside a bezel, the live score, Done; Esc only reaches it
  from outside the page, which keeps the keyboard) and the glass
  says where the game is. The page reports its score with `window.parent.postMessage({ type: 'lexipunk:score',
  score, final }, '*')` or `{ type: 'lexipunk:over', score }` (origins lexipunk.com / www.lexipunk.com only); the
  play is over when the page says so or the frame is shut, and pays the last score reported (nothing if none came:
  **the site has to send these messages**). No demo, replay or regular (`demoable: false`), no daily challenge.
- **Pinball** (`Pinball` over `pinball/PinballSim`, a pure 2D simulation at 480 Hz): three balls, a spring
  plunger (hold Space, let go), two flippers (A / D), three pop bumpers, two slingshots, three top lanes (all lit:
  +5 000 and the multiplier up to x5), a bank of three targets (+10 000), outlanes, a 4 s ball save. The playfield
  canvas is painted from the sim's own walls; a steel ball and the flippers are 3D, the backglass shows the game.
- **Alley** (`AlleyRoller`, "ALLEY ROLL"): nine wooden balls rolled up an inclined lane into rings (10 to 50, 100 in
  the corner pockets). A / D aim; hold Space and the power meter on the backboard swings up and down, let go to
  roll (too soft rolls back). Pays from a `TicketStrip` at the front.
- **Hoops** (`HoopShot`, "HOOP FEVER", along the left wall): a basketball cage, three balls rolling back down the
  ramp to the gutter. Aim where you look, hold Space (the meter on the scoreboard swings), let go to throw: the ball
  leaves with a lift above the line of sight. Thirty seconds; a basket pays 20 (30 in the last ten), baskets in a
  row multiply up to x3, after ten baskets the hoop slides, after twenty faster. The balls are simulated (gravity,
  the rim as a tube, the backboard, the nets, the ramp), so a ball rattles out. Keeps a table.
- **Ticket wheel** (`TicketWheel`, on the front wall): pure luck. A coin, then Space or a click spins a wheel of
  sixteen slices as wide as their odds (`WHEEL_SLICES`), slowed by friction and the pegs under the flapper; it pays
  the slice it stops on (score = tickets, `luck`: no medal, no challenge, no table). One thin gold slice is the
  progressive **jackpot** (`economy/Jackpot`): every spin anyone takes feeds it, a hit empties it. Regulars spin too.
- **Claw** (`ClawMachine`): one coin, never free, pays no tickets. Fifteen seconds to steer (WASD, a countdown on
  the panel), Space drops; the grip depends on how close the claw came down to a plush (`GRIP`), a third of grabs
  slip out on the way home, six misses in a row buy one honest grip. A plush down the chute is its prize
  (`clawPrizeFor(color)`); a new one takes its place on the heap.
- The physical machines share `TicketMachine` (the coin, the demo, the initials, the strip, the labels, out-of-order
  days): a new one is only its play, its display and where people stand. The pinball, alley, claw, hoops and wheel
  carry an `InstructionCard` (and medal lamps where there is a table) from the plan.
- **Change machine**: out of order most days; `ArcadeDaily` makes it work about one day in four
  (`CHANGE_MACHINE`): then its note is gone and a click pays a few coins once (`Session.collectChange`).
- **Hall of fame** (`ScoreBoard`): the top five of every machine that keeps a table (`ArcadeScores.table`, rivals
  from `rivals.ts` until beaten), four games a page, the player's entries in green. A score that beats the fifth
  asks for initials on the machine's own screen (`InitialsEntry`: up / down letter, left / right move, fire next;
  starts from the last initials used). **Regulars sign it too**: a regular's finished game (`onRegularResult`) goes on
  the table under their initials (`ArcadeScores.submitRival`) when it makes it, capped at 1.1 x the best starting
  rival (their hands are autopilots, steadier than people: capped, they shuffle the board without walling it off),
  and they cheer about it.
- **Medals** (`economy/ArcadeMedals`): bronze, silver and gold per machine for matching the fifth, third and first
  score of its starting table; each pays `MEDAL_REWARD` once. Lamps on the machine, the next one on the attract screen.
- **Daily challenge** (`ArcadeDaily.challenge()`, seeded by the real date): a game, a target, `CHALLENGE_REWARD`
  tickets on top of the play's, paid once a day by the Session. On the `ChallengeBoard` by the way in and on that
  cabinet's attract screen; the attendant mentions it.
- **Weekly league and streak** (`economy/ArcadeLeague`, the `LeagueBoard` by the way in): every ticket won this ISO
  week counts against five regulars whose totals grow through the week from a base drawn per week (`LEAGUE`); first
  on Sunday night wins the **league pennant** (announced after the next play, on the prize shelf). Days in a row with
  a ticket play make a streak: the day's first play pays `STREAK.perDay` per day of it (to `maxDays`).
- **Prizes** (`economy/Prizes.ts`: the catalogue and the `PrizeStore`): the counter's glass case shows them
  (`prizes/prizeModel`), its panel (`ui/PrizePanel`) sells them for tickets and swaps tickets for coins. What is
  taken home stands on the `PrizeShelf` on the bedroom's right wall (the newest when it is full, a card counts the
  rest), except the prizes that **do something at home** (`Prize.home`; hidden until won, `prizes/ownedPrize`): the
  `ArcadePoster` framed on the bedroom wall, the `MoodLamp` on the dresser's books (click: next colour, a rainbow,
  off; a small shadowless light), the `FeatherWand` on the living room's projector rug (click: it swishes and calls
  the cat, `BuildContext.callCat`). The **mystery game** (`Prize.game`) is a random seed game the collection lacks,
  added to it (so it waits in the parcel at home).
- **Jukebox** (`Jukebox` + `audio/JukeboxTune`): a bubbler by the front wall playing generated music on four
  stations (synthwave, chiptune, funk, italo disco; a made-up song title every sixteen bars on its card), louder up
  close; a click moves to the next station, then silence. Plays while the player is in the hall.
- **Sound** (`audio/ChipSpeaker`): every machine has a little chip speaker whose level and pan follow the camera;
  games queue `Sfx` events (`BaseGame.sound`: score, combo, time, penalty, READY / GO, over, NEW BEST, plus each
  game's own: the dance cabinet's drums, the gun's bang and reload, the wheel's pegs, the hoops' swish and rim), a
  machine a regular plays is quieter, a demo on an idle cabinet silent. `ArcadeAmbience` adds a crowd murmur that
  follows how many regulars are in, and mains hum, while the player is in the hall. Nothing sounds before the page's
  first click or key (`unlockAudioOnFirstGesture`).
- **People** (`ArcadeCrowd`, the walkers are `people/Walker`): the attendant (`Vendor`) behind the counter says
  the day's news first (the challenge, the change machine, the broken cabinet, the streak, the league, the jackpot,
  a record of the player's, tickets enough for a prize), then the usual lines. Regulars (four, with initials) walk
  in through the door (only while the player looks elsewhere), **more of them in the evening** (`crowd.regulars.byHour`
  against the sky's clock: one in the morning, three after five), take a free machine (`Station.occupy`: it plays
  itself on its autopilot) and stand at it as a player would: close in, leaning over it (`Station.lean`), hands on
  its live controls (`Station.handsAt()`: the joystick's knob as it moves, the flipper buttons pushed in as they
  flip, the ball in hand at the alley, the gun, the dance pad's bars), eyes on the screen. They play a minute or two
  with the odd word in a `SpeechBubble`, try another or leave (the hall empties towards the night). A machine a
  regular is on says so and cannot be played. The kid hangs about the board, the counter, the claw and the league
  board, watches regulars now and then, and walks over to watch whenever the player starts a play, cheering a
  record and groaning at a flop; at PADDLE WARS the kid **takes player two** (`Station.partner`: stands at the second
  stick, which then follows player two; the screen says KID, who plays exactly as the machine would, so a run still
  replays). Paths follow the plan's nav graph (`crowd.nav`): keep its links straight and clear of machines when the
  layout moves.

## The cabinet games

Nine games that run on the glass, one per cabinet (plus LexiPunk, which runs in its frame), each a 12-30 second burst (long plays bored; the funfair stacker set the bar),
readable and greedy for a replay. They share `BaseGame`
(`games/BaseGame.ts`): a READY / GO countdown, an optional clock with a time bar that games can add seconds to,
a combo multiplier (x1 to x5) that decays, score pops (`Fx`: pops, shake, flash), a live `TIX` counter at the
payout rate, a NEW BEST banner the moment the record falls, and a held TIME UP / GAME OVER card before `over`.
Nothing costs the play except the clock or the game's own single rule; mistakes cost seconds and the combo.

| Game | Clock | Earning time | Losing time | Harder every stage |
| --- | --- | --- | --- | --- |
| `Breakout` BRICK STORM | 30 s | clock bricks +3 s, wall clear +5 s (and +300) | last ball lost -2 s | per wall: ball +10%, paddle -5 px (to 52), a row more every 2 walls (to 6), a clock brick fewer every 2 walls (to 1) |
| `Invaders` STAR RAID | 15 s | saucer +3 s (and 100), wave clear +5 s (and +200) | a diver getting past -1 s | per wave: march faster, a row more every 3 waves (to 5), divers quicker, saucer +15% speed and 0.5 s rarer |
| `Stacker` SKY STACK | 12 s | every landed row +1.5 s, a clean one +1 s more, minor prize (row 10) +5 s, jackpot (row 15) +10 s | a landing that lost cells +1 s less (net +0.5 s) | per row: faster block, narrower (3 / 2 / 1 cells); each tower after a jackpot +25% speed; a miss ends it |
| `ArrowRush` ARROW RUSH | 15 s | gold arrows +2 s, every 10 hits a level = +3 s | a late arrow or a wrong press -1 s (spamming the lanes loses) | per level: arrows +22 px/s, spawn gap -0.045 s (to 0.15), gold one arrow rarer |
| `Snake` NEON SNAKE | 15 s | every pellet +0.6 s, gold pellet +3 s (every 5th, for 4 s), every 6 pellets a stage +2 s | none: a wall or your own tail ends it | per stage: +1.2 cells/s (to 20) |
| `Comets` COMET DASH | 15 s | clocks +2 s (one faller in 9), every 8 stars a stage +2 s | a rock -2 s (and the combo), then 1 s of shield | per stage: rocks faster, spawns denser |
| `Duel` PADDLE WARS | 20 s | a goal +3 s (and 100), every 3 goals a set +2 s | a goal conceded -2 s (and the combo) | per set: ball +12%, player two faster (it reacts once the ball crosses 42% of the court, aims up to 22 px off) |
| `StepBeat` STEP BEAT | 20 s | FEVER (24 clean steps) +2 s and x2 for 4 s, every 20 steps a stage +2 s | a late arrow or a step on nothing -1 s | per stage: +8 BPM (to 176), denser charts, jumps from stage 2 |
| `NeonSheriff` NEON SHERIFF | 15 s | the sheriff's star +3 s, every 8 bandits a stage +2 s | a bandit who draws first -1 s, shooting townsfolk -2 s (and the combo) | per stage: faster draws, more at once (to 5) |

Scoring: bricks 30-100 (chain within 1.2 s), aliens 5-25 and divers 100 (chain within 0.5 s), stack row *n* pays
25*n* (+40 and chain when clean, +300 minor, +1500 jackpot), arrows perfect 20 / good 8 (every hit chains, a late
arrow or a wrong press breaks), pellets 20 and gold 100 (chain within 2.2 s), stars 30 (chain within 2 s), returns
10 (+10 smashed with Space held; chain within 3 s) and goals 100, steps MARVELOUS 30 / GREAT 20 / GOOD 10 per panel
(every step chains), bandits 50, quick ones 80 (+20 before they reach for the gun; chain within 1.6 s), bottles 30. Every
game is unbounded in theory: the seconds it hands out are enough to keep going at the pace a very good player
sets, and the difficulty ramp is what ends the run.

## Adding a cabinet game

Extend `BaseGame` in `src/world/arcade/games/` (320 x 240 logical pixels, playfield below `PLAY_TOP`; implement
`begin` / `tick` / `paint`, score with `addScore` / `bonus` / `bumpCombo`, end with `end('GAME OVER')` or let the
clock run out; `sound(sfx)` for its own noises), implement `autopilot(skill)` (what a regular's hands do: read the
board, return the keys; keep it pure), register it in `games/index.ts` (a factory taking the `GameContext`), name
it in a `cabinets` entry of `ARCADE_PLAN` (a free spot, a stand spot reachable from the nav graph), give it a
`PAYOUT` rate and a `rivals.ts` table (`simulatePayouts()` helps). No Session change. **For replays to hold**: draw
every board-shaping number with `this.rand()` (never `Math.random`, which only autopilots and visuals may use),
reset every field of the board in `begin` (a timer left over from the last run makes the replay diverge), and read
nothing but `dt` and the controls. A light-gun game sets `gun` (it gets `controls.aim`, in whole pixels; aim only
decides on the step the trigger is pulled); a two-player one implements `setOpponent` / `opponentControls` (and
must play the same whoever holds the stick); one that cannot play itself sets `demoable: false`. Something bolted
on is a `CabinetAttachment`. A whole new kind of physical machine extends `TicketMachine` (like `HoopShot` and
`TicketWheel`; the older `AlleyRoller` and `Pinball` implement `ArcadeMachineLike` and `Station` themselves), and
joins the crowd's `stations` in `furnishArcade`.

## Coming home: the parcel and the bookcase

- **Deliveries** (`src/collection/Deliveries.ts`): nothing bought reaches the shelves directly. `Deliveries` watches the
  `CollectionStore`: a game that appears while playing (a stall copy, a mail order; at most 5 in one change, more is an
  import and goes straight to the shelves) waits in the `Parcel` under the hall console, and clicking the parcel unpacks
  everything. The shelves, search and the random pick read `deliveries.shelved` (the collection less the parcel); the
  posters and consoles still count everything owned. A game sold back leaves the parcel too.
- **The bedroom's bookcase** (`HomeUpgrades`, `BOOKCASE_PRICE` in `pricing.ts`): the collection room's shelving writes the
  games it has no room for into `BuildContext.overflow`; the bedroom shows them on the bookcases bought (one slot, left
  wall). Until then a `BookcaseKit` leans there; clicking it is `SessionActions.buyUpgrade`.

## Not done yet

- **LexiPunk's side**: the cabinet and its frame are done, but lexipunk.com has to post its score
  (`{ type: 'lexipunk:score', score, final }` / `{ type: 'lexipunk:over', score }` to `window.parent`); until it does,
  a LexiPunk play pays nothing. Its `PAYOUT` and table are guesses until its scores are seen.
- **Tuning by play**: `PAYOUT`, the rival tables, the claw's `GRIP` odds, the wheel's slices and the league's
  rivals are first estimates; `?payout` collects the real spreads. The physical machines (pinball, alley, hoops,
  wheel) are not in `simulatePayouts`.
- The arcade never closes: an empty hall late at night was considered, a shutter was not (it would dead-end the loop).
- **The street** is walkable, but reached by travel (no stairwell); its busker takes tips (`SessionActions.pay`) and
  its garage sale sells a few of the day's copies at the bin price (docs/zones.md).
- Gamepad / touch have no digit keys: the travel menu's lines are clickable, the digits are keyboard only.
