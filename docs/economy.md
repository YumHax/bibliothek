# The economy: going out, the arcade, the market

Read this when touching money, prices, the cabinets, the stalls, or how the player leaves the flat.

## The loop

The collection starts empty and Tab no longer adds games (`?debug` in the URL restores the seed list and the
editor's "add" pane). Games are bought with coins; coins are won at the arcade:

1. **Front door** (`hallway/FrontDoor`, a real door onto the landing) -> down the stairs or the lift of the stairwell
   (`src/world/stairwell/`, docs/zones.md) -> the entrance hall's sas: the glass door, the door release, the street door
   onto Front Street (`src/world/airlock/`, walked: docs/zones.md "The sas") -> the `ZoneManager` loads the street.
   There our building's door leads back in the same way; `StreetDoor`s lead into the arcade and into RETRO GAMES (the flea
   market is at its back; it keeps shop hours, 8:00 to 23:00, the arcade never shuts); the arcade's and
   market's exits go back to the street, in front of their door (`TravelPlan.arrivals`, keyed by the zone left). A
   `TravelDoor` without `to` would still open the "Where to?" menu (`TravelMenu`: every `travel` zone but the current).
   The front door opens from inside only with the flat's keys taken from the console bowl (`HouseKeys`, the door's
   `guard`); coming home through it (`hallway/Homecoming.ts`) drops them back in the bowl and, some in-game days, leaves flyers on the
   doormat (`hallway/mail.ts`: today's arcade challenge, a copy on a stall, the neighbourhood's paper).
2. **Arcade** (`src/world/arcade/`, see "The arcade" below): every machine (ten `ArcadeCabinet`s, the `Pinball`,
   the `AlleyRoller`, the `HoopShot`, the `TicketWheel`, the `ClawMachine`) is an `ArcadeMachineLike`: clicking it
   costs `PLAY_COST` coin and parks the player at the controls (`player.sit` + `lookAt`; the look stays free, which
   the light gun and the hoops aim with); the machine reads the keys straight from `Input` and reports an
   `ArcadeResult` (score, new best, first score, prize, refund); `economy/arcadePayout` works out and the Session's `ArcadePlay` pays `ticketsFor(gameId, score)` tickets (the claw pays a
   prize instead, into the `PrizeStore`), today's challenge bonus, any medal the score earned (`ArcadeMedals`) and,
   on the day's first ticket play, the streak's bonus (`ArcadeLeague`), and counts it all in the weekly league
   (`record`; the arcade tee's and a tournament round's tickets count too, `ArcadeLeague.count`; a finished week is
   announced once, on the next ticket play, a won one bringing the pennant home, and until then the league board and the
   attendant say how it went, `lastWeek`). A machine's first `BEGINNER.plays` (3) plays pay at least `BEGINNER.tickets` (12,
   "+N BEGINNER" on the end card), so learning a short cabinet does not cost coins. LexiPunk plays free
   (`freePlay` in its plan entry: FREE PLAY on its card, no coin taken or returned) until its page reports scores. A score that makes the hall of fame asks for
   initials first (the machine is still `isPlaying` until they are signed). The end card counts the score's tickets
   up (`MachineRun`, 1.2 s), then each bonus under it ("+60 CHALLENGE", "+15 BRONZE MEDAL", "+30 DAY 3 STREAK",
   "+4 ARCADE TEE", "+40 TOURNAMENT": `ArcadeMachineLike.showBonus`, 0.55 s each, a chime each), the ticket strip
   feeding all of it out (a fresh fire press or a click while it counts jumps to the end); then it stays: Space / Enter or a click pays another coin and replays without standing up
   (`canReplay`: only once everything is counted and fire was let go since the play, so a held key or a last
   light-gun shot never replays by accident), `E` walks away (from the end card at once; mid-play it takes a second
   press within 1.5 s, then a word that the play is over; a click on the machine
   being played does nothing: a reflex click never loses the coin). Esc (the pointer unlocked)
   holds a running play still instead (`ArcadePlay.hold`, `MachineRun.setPaused`: the machine skips its frames)
   until the pointer is locked again (`resume`; the click that relocks is not a shot). The HUD says "E walks away"
   and the end card's keys only for a machine's first `HINTED_PLAYS` (3) plays (`economy/ArcadeHabits`,
   `bibliothek.arcadeHabits.v1`, which also keeps the claw's misses in a row). A plain play shows no HUD
   banner (the machine and the wallet's pulse say it); a challenge, a medal, the streak, the week's league result,
   the tournament, a prize or a new best do. A machine's first score is only "first score on the board" (a
   reaction, no fanfare): a best needs a best to beat. Clicking another machine mid-play says "Finish here first";
   from an end card it walks over. The prize counter (`PrizePanel`) swaps tickets for prizes, which go on the bedroom's
   `PrizeShelf` (or where they do their job at home, see "Prizes" below), for a mystery game, or for coins at `TICKETS_PER_COIN`
   (the muncher feeds a coin's worth, ten coins' worth or all of them, so a pocket saved for a prize is not munched by
   one click; "Feed all" while the pocket covers a prize asks for a second click). With fewer coins than `PLAY_COST`
   and fewer tickets than that is worth, a ticket machine's play is free ("on the house", `playIsFree`: a banner the
   first time a session, a word after), so the loop never dead-ends; the claw never is (its refusal says the ticket
   machines are). With no coin but a coin's worth of tickets, the attendant swaps them at the machine
   (`Wallet.redeemTickets(rate, maxCoins)`); the first time a session with a prize's worth of tickets in the pocket, the
   attendant asks first (the play is refused once, the next click swaps). The wallet ignores a non-number or
   non-positive amount (a `NaN` never reaches the save) and counts whole coins and tickets.
   The HUD spells a machine's controls out on its first play ever (kept in the first day's store, `FirstDay.seen` /
   `mark`, save-tolerant), then the card on the machine does.
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
   no haggling. The `OrderCounter` opens the `CataloguePanel`: any game in the libretro index, new, at `shopPrice`
   (two clicks: the first arms the row, "N coins?"; a posted copy cannot be handed back; it counts as a buy for the
   reputation), with a cover thumbnail and a badge when one of today's stalls has a copy (`MarketStock.peekToday`); "Used…"
   orders a second-hand copy instead. The **WE BUY** desk (`BuyBackDesk`) opens the `SellPanel`: the collection with an offer
   per game (`buyBackPrice`), two clicks to sell; lent-out games cannot be sold. A sold game goes to the
   `MarketLedger` and is on its stall from the next market day for `CONSIGNMENT_DAYS`. Prices are never charged
   before they settle: a stock item and a catalogue or sell row start at the ordinary price (tag "…", button
   "Pricing…") and can only be bought once the game's fame arrived (`StockItem.priced`; the tag and the row repaint).
   Tags also fade when the wallet does not stretch to them, strike the old price after a haggle, carry a gold band
   on a stall's showpiece and a red star on a wishlist game. People: a stallholder behind every table whose lines
   come from their table (`stallTalk`: the pride of the stall, the cheapest, a missing manual, a wishlist game, a
   sale just made, night), a clerk behind each desk, shoppers who never share a browse spot, keep right in the
   aisle and wait for the player in their way. After dark (the sky's `night`) all but `nightShoppers` go home (they walk
   out by the door and fade there, `crowd.exit`; back in by it while the player looks elsewhere) and the murmur drops. Sound: `CrowdSound` (generated chatter plus a bustle from the stalls: crates rummaged, coins, a crate dragged,
   `audio/marketBustle`; only while the player is in the hall, as busy as the crowd), a `TransistorRadio` on one stall
   (a generated easy-listening station, louder up close, click to switch off, remembered: `KEYS.marketRadio`), coins on a sale.

## Numbers (`src/economy/pricing.ts`)

Everything tunable is there (prize tickets `PRIZE_TICKETS`, household prices `HOME_GOOD_PRICES`, `MARKET_STOCK`,
`CONDITION_ODDS`, `OUT_OF_ORDER_ODDS`, `CONSIGNMENT_DAYS`, `CARD_MEMORY_DAYS`, `CHALLENGE_BAND`, the street's
`STREET_TREATS`, `SCRATCH` and `TRADER_MARKUP`, the neighbours' `NEIGHBOUR_SWAPS`, and the one second-click rule:
`CONFIRM_MS` 4 s for every armed row, tag and button, `ARM_ABOVE` 30 coins for the flat's things, included): starting coins, play cost, tickets per coin, points per ticket, base price per
platform, the fame curve, the market discount range and condition factors, the bargain bin's flat price, the WE BUY
desk's share (`BUY_BACK_SHARE` 0.3 of the shop price, up to 0.34 with reputation: below the cheapest a haggled
market copy goes, `NEGOTIATION.lowest`, so buying to sell back never pays), the negotiation, and every rule of "The
finer market" (editions, fakes, holds, orders, lots, swaps, cards, coffee, rivals, reputation, loyalty). The rule
"buying to sell back never pays" is checked when the module loads (`assertBuyingToSellNeverPays`: the cheapest a
stall copy can go, deepest discount x Flea Fair x `lowestWorn` or a clearance, against the top desk share; it logs
`[pricing]` when a retune breaks it, the margin being thin; the job lot, a private seller's card and a mail order are
checked the same way, and a stickered copy's haggle; no clearance stall carries a sticker, since the two cuts together
would go under the desk once peeled). A swap counts a copy for no more than it was bought for, and a WANTED card
pays at most `WANTED_AD.premium` (1.15) times what the copy cost (a swap's receipt, a gift or a prize: no cap), so a
copy bought off a stall that morning is never a sure profit at noon. The job lot is priced as a legend for a game
whose fame is unknown (offline), and asked again next time. A price is `BASE_PRICE[platform] x
fameFactor(views) x jitter(id)`: no real price source exists key-less, so fame stands in for value (see below).
Calibration: a good player earns about 11-12 coins a minute at the cabinets, some 8-9 net of the coin each play costs
(a decent play pays 35-40 tickets and, with the READY / GO, the TIME UP card, the end card's count-up and the next
coin, takes about 19 s; an ordinary player, the table's fifth, about 3-4 net), more on a challenge or a medal. `PAYOUT` sets each game's points per ticket so that a decent play (the table's fourth
regular) pays about the same tickets per minute whatever the game (a decent 15-second cabinet play about 35-40
tickets, a 20-second one about 50, a 30-second one 70-80: BRICK STORM 40, COMETS 28, PADDLE WARS 13, STEP BEAT 95,
the hoops 5 points a ticket; the pinball's points are worth far less, the alley's far more):
first estimates, retune one when a game turns out to be the obvious earner. `rivals.ts` holds each game's starting
table (five made-up scores, an ordinary play to a very good one) and the daily challenge aims between its fourth
and second (`CHALLENGE_BAND`; the pinball's fifth and third, its table being measured high); move them with `PAYOUT`
when a game's scoring changes. The pinball's were measured with its autopilot
(a 3-ball game about 45 s, median 10 000, upper quartile 24 000); the cabinets' pilots play far better than a
person, so their tables are estimates; `simulatePayouts()` (console, with `?payout`) plays every cabinet game
headless on its autopilot and prints score, length and tickets a minute per skill, to compare the games with each
other after a change, and `?payout` shows the player's real plays per machine (`PayoutStats`, `PayoutOverlay`).
The newer games (PADDLE WARS, STEP BEAT, NEON SHERIFF, HOOP FEVER) were set that way; LexiPunk's rate is a guess
until the site's scores are seen. The extras have their numbers there too: `MEDAL_REWARD`, `STREAK`, `LEAGUE`,
`WHEEL_SLICES` and `JACKPOT` (the wheel pays about 9.4 tickets a spin on average at the jackpot's start, 10 with it at
450: under a coin's worth, a thrill, not an earner), `MYSTERY_GAME_TICKETS` and `MYSTERY_GAME_MAX_PRICE`. Base prices
are set against that rate (net, a decent player):

| Buy | Coins | Plays | Time |
| --- | --- | --- | --- |
| The first bin game, from the 20 starting coins | 25 | 2 | a minute |
| The cat | 60 | ~22 | ~7 min |
| An armchair | 70 | ~26 | ~8 min |
| An ordinary NES copy at a stall (160 x ~0.7) | ~110 | ~41 | ~13 min |
| A bookcase | 250 | ~93 | ~30 min |
| The projector | 550 | ~204 | ~65 min |
| A grail | 800-2 400 | | 1.5-4.5 h |
| The whole flat | ~4 250 | ~1 570 | ~8 h (a novice about 20) |

A worn cheap copy is 2-4 minutes, a legend on a stall (Ocarina of Time about 600) over an hour. `STARTING_COINS` is 20: the first
round of plays, with the first bin game (`BARGAIN_PRICE` 25) a couple of minutes of good plays away on the first day
(`onboarding/`: its "Tickets → 25 coins" step ticks once tickets were swapped and the pocket holds `BARGAIN_PRICE`;
its tips name keys through `actionKeyLabel`, so they follow the bindings and the layout). Retune `BASE_PRICE` if
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
to price; the stalls show provisional tags meanwhile. So the pricing starts on the way: reaching Front Street (or a
new market day while out) calls `MarketStock.warm()` (`bootstrap/world`), a throwaway draw whose lookups land in
`Fame`'s cache, so the hall's own draw finds most prices known. Answers are cached a month under `.cache/fame/` (delete a
file to re-match a game). Matching a free-text title to an article is the fragile part; keep it all in
`server/fame.ts`.

## Haggling

H with a stall copy in hand opens the `HagglePanel`: a short exchange with the stallholder, one per copy per market
day (`MarketLedger` remembers the outcome across reloads). The player offers cheeky, fair or polite (keys 1-3,
`NEGOTIATION.offers`, shares of the tag) or takes the standing counter-offer (Enter). The stallholder
(`economy/haggle.ts`, `Negotiation`, pure) has a secret lowest price, drawn per copy and day (so it cannot be
rerolled) by kind of copy (`NEGOTIATION.floor`: a showpiece rarely moves, a worn copy easily), lowered by loyalty,
a coffee, the rain and the player's perks (together `NEGOTIATION.maxSway` 0.1 at most, so each still counts and cheeky
is not always taken; the panel says how much is in the player's favour today), raised by the stall's soured mood, never under `NEGOTIATION.lowest` (0.7; `lowestWorn` 0.66
for a worn copy, still over the desk at the Flea Fair's deepest discount; on a copy with a price sticker both divided
by `STICKER.factor`, so the haggle stops where an unstickered copy's would and buying, peeling and selling back never
pays); and a patience of a few offers. The offers are cheeky 0.72 (the panel warns it "might offend": under a high
floor it is an insult; on a showpiece, an estate copy or a grail the panel says cheeky is "sure to offend" and fair
"might"), fair 0.8, polite 0.9; an offer at or over what they ask now is greyed ("= asking": Enter takes their
price). An offer at or over the lowest price is taken; under it, a counter-offer halfway down; far under it
(`insult`) costs two patience and sours the stall for the day. Out of patience ("take it or leave it") and walking
off mid-haggle both keep their last counter for the day (the tag if none was made), so walking off never beats
playing on; closing without an offer costs nothing. A stall soured so far that it would walk at the first offer
(`Negotiation.patienceFor` <= 0) opens no haggle: "Not today, friend". Not before the price
settled, never in the bargain bin or on an order. The agreed price holds all day (tag and label say so). The copy's
panel shows the H hint only when a haggle would open (`MarketStock.canNegotiate`: not on a clearance, an order, the
bin, nor a copy already haggled over today, a grail included, nor a soured stall's), and "N short" and "★ On your
wishlist" together. What is agreed on a copy is its own day's (`StockItem.drawnOn`, `MarketStock.dayOf`): a copy laid
out before midnight and haggled or bought after goes on that day's ledger, never today's.

## Stock and condition

The stock follows **market days** (`MarketCalendar`, read through `time/Today.gameDay`, the game's one day count): a day passes when the game's clock runs through midnight
(ten real minutes a day; the N toggle does not count) or when the player comes back on another real date; persisted.
With the player in the hall at midnight, `MarketFloor` hears `Today.onNewGameDay`: every stallholder packs up and the
new day's stock is laid out (the copy in hand stays at its old price until bought or put back, then goes; no hold or
haggle on it: "we're packing up yesterday's table"), the boards and the talk follow.
Every draw has its own seed (`${day}:<platform>:<slot>`), so a platform's index failing, a copy bought or a platform
added moves nothing else; a held copy is saved whole in the ledger and always put back on its stall.
`MarketStock.todays()` draws, per platform and in stall order: the copies the player **ordered** (due today or
before), a **showpiece** (a title from `SEED_GAMES`, under the index's id, complete, sometimes a first print), a
second famous game on an **estate sale** (and a third for a trusted player), a copy **kept aside** for a friend of
the stall, the day's **upgrade** (a first print of a game the player owns), with `wantedOdds` one game off the
player's **wishlist** (more often for a regular), the games the player **sold** (`MarketLedger.consignedOn`), then a
few ordinary copies (`perPlatform`, 2 to 8, more on a fair day) from the index, skipping hacks, protos, revisions
and non-western regions, bar the odd Japanese **import** (`IMPORT`, cheaper: its `region` is 'Japan', `isImport`,
so old saves' imports are known too, and the WE BUY desk and a swap count it at `IMPORT.price` as well); among them first prints and budget
re-releases (`EDITION_ODDS`, `EDITION_FACTOR`) and **fakes** (`REPRO_ODDS`); plus the **bargain bin** (`bin`, worn,
flat price, now and then a famous **gem**, `BIN_GEM_ODDS`; a bin copy's receipt says `BIN_WHERE`, and the WE BUY desk
and a swap never give more for it than it cost, so the bin is no coin press). Seeded by the market day, so the same all day and across
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
  it; the reward says it lasts till the market shuts tonight); the deposit counts towards the price (`StockItem.due`).
  A hold not collected lapses with its day: the ledger keeps it owed (`MarketLedger.takeLapsedHolds`, its `lapsed`
  list) and the next market day gives the deposit back (`Transactions.refundLapsedHolds`, at boot and on every new
  day: `bootstrap/session`, a "Deposit back" reward). "Used…" at the catalogue quotes a second-hand copy
  (`MARKET_ORDER`), takes the deposit and puts it on its stall `days` later (tag PUT BY FOR YOU) until bought.
- **Swaps**: X opens the `TradePanel`: a game from the collection counts for `tradeValue` (`TRADE_SHARE`), the
  rest in coins, no change given (a game worth more says so on its button: "Swap (−12 value)"); the game given goes
  out on its stall like a sale.
- **Handing back**: U within `UNDO_PURCHASE.seconds` of a purchase (even with another copy in hand) gives the money
  back less `1 - UNDO_PURCHASE.refund` of the full price (rounded: a 1-coin copy comes back whole) and a fresh box of
  the same copy goes back where it stood (`ForSaleBox.restock`); a copy that was held goes back on hold with its
  deposit, and the morning's first sale it used is given back (`Perks.unbought`), all in one save. Not for orders or
  upgrades. An upgrade bought replaces the old copy's whole state (no cleaned, sticker or import flag carried over).
- **Fakes and editions**: a reproduction looks like any copy; O (opening the box) finds it out
  (`MarketStock.expose`): the price drops to `REPRO_CAUGHT` of the tag. Bought unknowingly, the collection's panel
  owns up and the WE BUY desk pays `REPRO_BUY_BACK`. Tags carry a band for first prints, budget lines
  (`BUDGET_LABEL`), imports, holds, orders, kept-aside copies and upgrades. An upgrade bought replaces the owned
  copy (`CollectionStore.update`), the old one going to the stall.
- **Job lot** (`LotCrate` + `JobLotPanel`): a crate of `JOB_LOT` games from anywhere at a share of their worth,
  once a day. A game the player has bought elsewhere since the crate was drawn comes out of it, and its part out of
  the price (`lotOffer`: each game's share by what it would fetch alone).
- **Notice board** (`NoticeBoard` + `NoticeBoardPanel`, cards in `MarketNotices`, persisted): WANTED cards
  (`WANTED_AD`, up several days: one from the collection, the rest from the day's stalls, paying well over the WE
  BUY desk for a complete copy; less for a worse one: `wantedPay`, the copy's state, printing and import as the desk
  counts them, `REPRO_BUY_BACK` for a fake, never over a flat-price receipt; the card says what the player's copy
  fetches), FOR SALE cards (`FOR_SALE_AD`, today only, to the parcel), the **collectors' club**
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
- **The household stall** sells `HOME_GOODS` (`economy/homeGoods.ts`, the flat side places them) through
  `SessionActions.buyUpgrade`, like every place the flat's things are sold (see "The bare flat": one rule, one
  transaction); a piece whose companion is missing says what it needs (`HomeUpgrades.status`, `refusalFor`).
- **Receipts**: every game bought carries `acquired` (price, where, market day); the panel shows it at home, with
  its edition. The market panel warns when the shelves at home are full (`shelfRoom`).

## Grails, the Grand Flea Fair, sales (`economy/grails.ts`, `marketEvents.ts`, `rumours.ts`)

Pure functions of the market day, so the stock, the tags, the papers and the rumours tell one story on every reload.
The numbers are `GRAIL`, `BROCANTE`, `SALES` in `pricing.ts`.

- **Grails** (`GRAILS`): a dozen rarities (Stadium Events, EarthBound, Suikoden II...) with the index's
  `libretroName` (so the id is the index's), a price, a line of lore and who is selling. They are left out of every
  ordinary draw (`releases()`, `famous()`) and the catalogue ("Market only", no "Used…"). `grailOn(day)`: one every
  `GRAIL.every` days from `offset`, for `GRAIL.stays` (2) market days (one day's six real minutes of market were too
  short to catch it), in turn through a seeded shuffle of the list (a new shuffle each round), whether
  the player owns it or not (owned, it is just not shown). On its day it is first on its platform's stall
  (source `'grail'`, tag ★ GRAIL ★, `price` fixed, final at once; on the N64 spot it is behind the glass case);
  a haggle never goes under `GRAIL.floor`; rival shoppers leave it alone.
- **Rumours** (`marketNews(day, owns)` -> `MarketDay.news()`, `economy/MarketDay`: the day's theme, events and talk): the next grail within `rumourDays` (not an owned
  one), the next Flea Fair within `announceDays`, today's and tomorrow's sales. Told in four voices (`rumours.ts`):
  stallholders' lines (`StallState.news`), THE GAMING WEEKLY's tips (a grail on the day makes the headline), a
  flyer on the doormat (always delivered when there is talk: `mail.ts`), a card on the notice board and two lines
  on the programme board; the barista passes on a grail's rumour too.
- **The Grand Flea Fair** (`isBrocante`, theme `grandeBrocante` in `marketDays.ts`, which `themeOf` returns over
  the week's round): every `BROCANTE.month` market days from `offset` (the week round's last day). More copies per
  stall, a bin `bin.size` times as deep in two more crates (`MARKET_PLAN.brocante.bins`), extra gems, prices down
  `priceFactor`, `crowd` times the shoppers and a louder murmur, bunting and a banner (`MARKET_PLAN.brocante.decor`).
- **Sales**: the mail-order counter takes `SALES.catalogue.factor` off new copies on its days (`mailOrderPrice`;
  the usual price struck out, a line when the panel opens). Some days one stall clears out (`clearanceOn`): its
  ordinary copies at `clearance.factor` (`StockItem.sale`, tag CLEARANCE with the old price struck), no haggling
  (a haggle on top would go under what the WE BUY desk pays).

## Persistence

Every store goes through `src/persistence/` (see docs/architecture.md): keys in `KEYS` (`keys.ts`), each value
`{ version, data }` (bare JSON from before counts as version 1), read through `PersistedStore` (migrations, per-entry
validation, defaults). Unreadable data is copied to `bibliothek.corrupt.<key>.<ms>` before the store starts afresh;
entries this build cannot read (a game on an unknown platform, a prize it does not know) are kept in storage untouched.
A save written by a newer build is copied once to `bibliothek.corrupt.<key>.newer-v<n>` and said on every load (the
alert bar: this older version plays on from what it understands, so play from here does not carry back).
`?debug` saves under `bibliothek.debug.*`. Money moves go through `Transactions` (`economy/Transactions.ts`: check
everything, then wallet + collection + ledger + standing in one `batch`, saved together or put back together; a batch
whose write failed is kept and written again, whole, with the next write any store makes, so what is played on is
never saved half). The market calendar's file also keeps the game clock's hour (`MarketCalendar.savedHours`): a
reload the same real day starts the clock where it was left, a new real date in the morning.

`bibliothek.wallet.v1` (coins + tickets), `bibliothek.arcade.v2` (the player's bests, the entries made since the
starting rivals, the last initials; the rivals of `rivals.ts` are merged in on read, so retuning them reaches saves;
data v2 dropped the saved rival rows; `v1`, bests only, is folded in once; regulars' live entries go in it too),
`bibliothek.arcadeDaily.v1` (local day the challenge and the change machine were last claimed; data v2, v1 was UTC),
`bibliothek.arcadeMedals.v1`, `bibliothek.arcadeLeague.v1` (this week's tickets, the streak, a finished week not yet
announced, pennants), `bibliothek.arcadeJackpot.v1`, `bibliothek.arcadeReplays.v1`, `bibliothek.arcadeTournament.v1`
(the Saturday's sign-up and rounds), `bibliothek.arcadeHabits.v1` (plays per machine for the HUD's tips, the claw's
misses in a row), `bibliothek.payoutStats.v1`,
`bibliothek.moodLamp.v1`, `bibliothek.prizes.v1`, `bibliothek.calendar.v1` (the market day and the local date; data
v2, v1 was UTC), `bibliothek.market.v1` (the day's haggles, soured stalls, rival sales, holds with their copy (data v2),
fakes found out, coffee and job lot; games sold to the market; copies on order; notice cards dealt with; lapsed holds
whose deposits are owed back),
`bibliothek.standing.v1`, `bibliothek.notices.v1` (the cards drawn), `bibliothek.collection.v1`,
`bibliothek.deliveries.v1`, `bibliothek.home.v1`, `bibliothek.position.v1` (where the player stood),
`bibliothek.post.v1`, `bibliothek.neighbourTrades.v1`, `bibliothek.milestones.v1`, `bibliothek.valueHistory.v1`,
`bibliothek.visitors.v1` (docs/visitors.md), `bibliothek.journal.v1`, `bibliothek.household.v1` (docs/household.md),
`bibliothek.firstDay.v1` (the guided first day, and which machines' controls were spelled out). Front Street:
`bibliothek.finds.v1` (dropped coins picked today), `bibliothek.scratch.v1` (cards bought today),
`bibliothek.scratchCard.v1` (a card half scratched), `bibliothek.giveaway.v1` and `bibliothek.garageSale.v1` (what
was taken today), `bibliothek.busker.v1` (tips today) — `{ day, n }` with a `dayKey` (data v2; v1 wrote `2026-9-5`,
read as the same day; `DailyTally` and `DailyList` in `src/time/`, the busker's included); `bibliothek.trader.v1` (the collector's pick, by market day: `gameDayRandom('trader', day)`, while the trader's presence follows the real date, `isEventDay`). Preferences, kept
by a new game and shared with `?debug`: `bibliothek.settings.v1`, `bibliothek.quality`, `bibliothek.cat.v1`.
Caches: `bibliothek.cache.longplay.v1`, `bibliothek.cache.fame.v1`
(`BrowserCache`: one key each, LRU-capped, TTL). Game ids are canonical (`gameIdFor`, see `SEED_GAMES`): every store
maps the seed lists' old hand-made ids on load (`canonicalGameId`).

**Days and randomness**: one real-day convention, local time (`economy/calendar.ts`: `dayKey`, `dayNumber`, `isoWeek`);
one RNG module (`economy/seeded.ts`: mulberry32 `seeded`, FNV `hash01`), never changed (it would reshuffle saved days).

**Persisting something new**: (1) add its key to `KEYS` in `persistence/keys.ts` (`save(...)` for progress, which
"New game" wipes and `?debug` keeps apart; `pref(...)` for a preference, then also in `PREFERENCE_KEYS`); (2) keep it in a
`new PersistedStore({ key, version: 1, defaults, read })`, `read` checking every field and returning null only when
nothing is usable; (3) on a format change bump `version` and add `migrate[old]` (never rename the key); days are `dayKey()`.
Never call `localStorage` directly: `safeStorage()` for a bare value, `BrowserCache` for a cache.

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
  top score, the player's best, the next medal, today's challenge when it is on this game, and at its foot the price
  of a play right now: "1 COIN PER PLAY" or "FREE PLAY"; the glass's canvas is mipmapped, nearest up close), then the game playing
  itself (DEMO, on its autopilot, silent) or, every other time round, **the player's best run replayed** (`replay/`:
  the game is stepped at a fixed `REPLAY_STEP` live, in demos and in replays, every board-shaping draw goes through
  the run's seeded `rand()`, and a new best (or the first score there) keeps its seed and run-length-encoded controls, `ReplayStore`; a replay
  that no longer ends on its score was recorded under older rules and is dropped). Farther than `DEMO_RANGE` from
  the camera it only shows its title card. It sings a jingle now and then. Each carries its **medal lamps**
  (`MedalRow`) under the marquee, a printed **instruction card** on the panel (`InstructionCard`, from the game's
  hint; the HUD spells a machine's controls out only on its first play ever) and its **wear** (`wear`: stickers, some peeling, on the side art; cigarette burns and scratches on the
  panel; scuffs on the base). A two-player game (`setOpponent`) gets a second stick and a `partner` spot; an
  `attachment` changes how it is played: the `LightGun` (a toy pistol on a cable in a holster on the side, held low
  and right of the eye while playing, pointing at the aim, kicking back on each shot; the cabinet aims the game
  where the camera looks, `controls.aim`, and a click on the glass is the trigger) and the `DancePad` (a steel
  stage in front with four arrow panels that sink and light with the keys and glow with the beat, side bars to hold;
  the player's eye stands over it). **Out of order**: about one day in three (`ArcadeDaily.outOfOrder(BREAKABLE)`, never
  the challenge's game) one machine, a cabinet or a physical one, carries a taped note (a cabinet's glass shows snow
  behind it), says so and cannot be played; regulars walk past it (`MachineRun.outOfOrder`).
- **LexiPunk** (`games/LexiPunk`, the user's own word game at lexipunk.com): a coin opens the big frame
  (`ui/ArcadeScreenPanel`, a modal: the page in an iframe inside a bezel, the live score, Done; Esc only reaches it
  from outside the page, which keeps the keyboard) and the glass
  says where the game is. The page reports its score with `window.parent.postMessage({ type: 'lexipunk:score',
  score, final }, '*')` or `{ type: 'lexipunk:over', score }` (origins lexipunk.com / www.lexipunk.com only); the
  play is over when the page says so or the frame is shut, and pays the last score reported; a play that reported
  nothing gives the coin back (`ArcadeGame.unreported` -> `ArcadeResult.refund`), since **the site has to send these
  messages** and does not yet. The frame taking the mouse holds the cabinet's play (the pointer unlock) until it shuts. No demo, replay or regular (`demoable: false`), no daily challenge.
- **Pinball** (`Pinball` over `pinball/PinballSim`, a pure 2D simulation at 480 Hz): three balls, a spring
  plunger (hold Space, let go), two flippers (A / D), three pop bumpers, two slingshots, three top lanes (all lit:
  +5 000 and the multiplier up to x5), a bank of three targets (+10 000), outlanes, a 4 s ball save. The playfield
  canvas is painted from the sim's own walls; a steel ball and the flippers are 3D, the backglass shows the game.
- **Alley** (`AlleyRoller`, the wiring; `alley/AlleySim` the rolls and scoring, `alley/alleyModel` the lane, "ALLEY ROLL"): nine wooden balls rolled up an inclined lane into rings (10 to 50, 100 in
  the corner pockets). A / D aim; hold Space and the power meter on the backboard swings up and down, let go to
  roll (too soft rolls back). Pays from a `TicketStrip` at the front.
- **Hoops** (`HoopShot`; `hoop/HoopSim` the balls and baskets, `hoop/hoopModel` the cage; "HOOP FEVER", along the left wall): a basketball cage, three balls rolling back down the
  ramp to the gutter. Aim where you look, hold Space (the meter on the scoreboard swings), let go to throw: the ball
  leaves with a lift above the line of sight. Thirty seconds; a basket pays 20 (30 in the last ten), baskets in a
  row multiply up to x3, after ten baskets the hoop slides, after twenty faster. The balls are simulated (gravity,
  the rim as a tube, the backboard, the nets, the ramp), so a ball rattles out. Keeps a table.
- **Ticket wheel** (`TicketWheel`, on the front wall): pure luck. A coin, then fire or a click spins a wheel of
  sixteen slices as wide as their odds (`WHEEL_SLICES`), slowed by friction and the pegs under the flapper; it pays
  the slice it stops on (score = tickets, `luck`: no medal, no challenge, no table). One thin gold slice is the
  progressive **jackpot** (`economy/Jackpot`): every spin anyone takes feeds it, a hit empties it. Regulars spin too.
- **Claw** (`ClawMachine`; `claw/ClawSim` the claw, grip and heap, `claw/clawModel` the cabinet): one coin, never free, pays no tickets. Fifteen seconds to steer (WASD, a countdown on
  the panel), Space drops; the grip depends on how close the claw came down to a plush (`GRIP`), a third of grabs
  slip out on the way home, six misses in a row buy one honest grip (the count is kept across visits:
  `ArcadeHabits.clawMisses`). A plush down the chute is its prize
  (`clawPrizeFor(color)`); a new one takes its place on the heap.
- Every machine holds a `MachineRun` (the coin, the keys from `arcadeKeys`, the initials, the end card's count-up
  with its ticks and the strip, the labels from `machineLines`, a regular's results, out-of-order days); the alley,
  hoops and wheel get it through `TicketMachine`, so each is only its play, its display and where people stand.
  The physical machines are `ARCADE_PLAN.machines` entries built by `MACHINE_KINDS` (`machineKinds.ts`); an entry
  gives the `InstructionCard`, the medal lamps (with `table`), a glow pool, the watch spot, a regular at the start.
- **Change machine**: out of order most days; `ArcadeDaily` makes it work about one day in four
  (`CHANGE_MACHINE`): then its note is gone and a click pays a few coins once (`Session.collectChange`: the flap's
  clunk and the coins' rattle), after which its caption reads "empty today" (`ArcadeDaily.changeWaiting`).
- **Hall of fame** (`ScoreBoard`): the top five of every machine that keeps a table (`ArcadeScores.table`, rivals
  from `rivals.ts` until beaten), four games a page, the player's entries in green. A score that beats the fifth
  asks for initials on the machine's own screen (`InitialsEntry`: up / down letter, left / right move, fire next;
  starts from the last initials used). **Regulars sign it too**: a regular's finished game (`onRegularResult`) goes on
  the table under their initials (`ArcadeScores.submitRival`) when it makes it, capped at 1.1 x the best starting
  rival (their hands are autopilots, steadier than people: capped, they shuffle the board without walling it off),
  and they cheer about it.
- **Medals** (`economy/ArcadeMedals`): bronze, silver and gold per machine for matching the fifth, third and first
  score of its starting table; each pays `MEDAL_REWARD` once. Lamps on the machine, the next one on the attract screen.
- **Daily challenge** (`ArcadeDaily.challenge()`, seeded by the real date): a game, a target in its `CHALLENGE_BAND`, `CHALLENGE_REWARD`
  tickets on top of the play's, paid once a day by the Session. On the `ChallengeBoard` by the way in and on that
  cabinet's attract screen; the attendant mentions it.
- **Weekly league and streak** (`economy/ArcadeLeague`, the `LeagueBoard` by the way in): every ticket won this ISO
  week counts against five regulars whose totals grow through the week from a base drawn per week (`LEAGUE`, 1 500 to
  6 000 tickets: a few evenings' play, not one); first
  on Sunday night wins the **league pennant** (announced after the next play, on the prize shelf). Days in a row with
  a ticket play make a streak: the day's first play pays `STREAK.perDay` per day of it (to `maxDays`).
- **Saturday tournament** (`economy/ArcadeTournament`, real local calendar; `?tournament` makes any day a Saturday): one
  cabinet a Saturday (seeded by the date among `ARCADE_PLAN.tournament.games`, never the one out of order; a lit
  `TournamentTopper` on its roof) hosts an eight-entrant knock-out: the player against the hall's four regulars and
  three others from the hall of fame. The `TournamentBoard` on the back wall (bracket, scores as they are known, the
  sign-up clipboard) takes `TOURNAMENT.entry` coins on a click (`SessionActions.pay`), once a Saturday. Then every
  play the player finishes on that cabinet is their next round, won by beating the opponent's score (drawn per regular,
  round and date between the table's fifth/fourth score in the quarters and its second/first in the final). Going
  out after n wins pays `TOURNAMENT.reward[n]` tickets (0, 60, 180, 450), the champion also the **Saturday cup** (`saturdayCup`, a pewter
  trophy on the prize shelf). One `ArcadeTournament` is made at boot (`bootstrap/services`) and handed to the hall
  (`BuildContext.arcade.tournament`) and the Session: `game/ArcadePlay` settles the round with the play (its tickets
  and the cup in the same `batch`, its line in the end-of-play reward banner), and the hall hears it (`tournament.onRound`) to
  make the watchers react. That day the regulars leave the cabinet to the player (`ArcadeCrowd` `reserved`) and gather
  round it to watch (`gathering`: `ARCADE_PLAN.tournament.spectators`), cheering or groaning each round
  (`spectatorsReact`); the attendant mentions it.
- **Prizes** (`economy/Prizes.ts`: the catalogue and the `PrizeStore`): the counter's glass case shows them
  (`prizes/prizeModel`), its panel (`ui/PrizePanel`) sells them for tickets and swaps tickets for coins. What is
  taken home stands on the `PrizeShelf` on the bedroom's right wall (the newest when it is full, a card counts the
  rest), except the prizes that **do something at home** (`Prize.home`; hidden until won, `prizes/ownedPrize`): the
  `ArcadePoster` framed on the bedroom wall, the `MoodLamp` on the dresser's books (click: next colour, a rainbow,
  off; a small shadowless light), the `FeatherWand` on the living room's projector rug (click: it swishes and calls
  the cat, `BuildContext.home.callCat`). The **mystery game** (`Prize.game`) is a random seed game the collection lacks,
  never a grail and never one whose shop price is over `MYSTERY_GAME_MAX_PRICE` (320: no fallback, an empty box says
  so), added to it with a receipt (`PRIZE_WHERE`, 0 coins) so it waits in the parcel at home; the WE BUY desk, a
  swap and a wanted card never count it for more than its tickets' worth (`MYSTERY_GAME_VALUE`, 90: `receiptCap`). The counter says where a prize goes, and what it
  still needs at home: the mood lamp the dresser, the feather wand a cat (`PrizeHomeSource`, `HomeUpgrades`; `?debug`
  has both). Taking a prize, the attendant hands it over with a word (a subtitle, `notices.say`), the prize is a
  reward banner, and the panel's slip says where it goes.
- **Jukebox** (`Jukebox` + `audio/JukeboxTune`): a bubbler by the front wall playing generated music on four
  stations (synthwave, chiptune, funk, italo disco; a made-up song title every sixteen bars on its card), louder up
  close; a click moves to the next station, then silence. Plays while the player is in the hall.
- **Sound** (`audio/ChipSpeaker`): every machine has a little chip speaker whose level and pan follow the camera;
  games queue `Sfx` events (`BaseGame.sound`: score, combo, time, penalty, READY / GO, over, NEW BEST, plus each
  game's own: the dance cabinet's drums, the gun's bang and reload, the wheel's pegs, the hoops' swish and rim, ARROW
  RUSH's tone per lane and its PERFECT / GOOD / miss, COMETS' rock crunch, shield hum and stage sting), a
  machine a regular plays is quieter, a demo on an idle cabinet silent. `ArcadeAmbience` adds a crowd murmur that
  follows how many regulars are in, and mains hum, while the player is in the hall. Nothing sounds before the page's
  first click or key (`unlockAudioOnFirstGesture`).
- **People** (`ArcadeCrowd`, the walkers are `people/Walker`): the attendant (`Vendor`) behind the counter says
  the day's news first (the challenge, the change machine, the broken machine, the streak, the league, the jackpot,
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
(`games/BaseGame.ts`): a READY / GO countdown, an optional clock with a time bar that games can add seconds to
(seconds banked over the limit show as a green bar over the blue),
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
clock run out; `sound(sfx)` for its own noises; `keys.pressed(controls, 'up')` for a press rather than a hold), implement `autopilot(skill)` (what a regular's hands do: read the
board, return the keys; keep it pure), register it in `games/index.ts` (a factory taking the `GameContext`), name
it in a `cabinets` entry of `ARCADE_PLAN` (a free spot, a stand spot reachable from the nav graph), give it a
`PAYOUT` rate and a `rivals.ts` table (`simulatePayouts()` helps). No Session change. **For replays to hold**: draw
every board-shaping number with `this.rand()` (never `Math.random`, which only autopilots and visuals may use),
reset every field of the board in `begin` (a timer left over from the last run makes the replay diverge), and read
nothing but `dt` and the controls. A light-gun game sets `gun` (it gets `controls.aim`, in whole pixels; aim only
decides on the step the trigger is pulled); a two-player one implements `setOpponent` / `opponentControls` (and
must play the same whoever holds the stick); one that cannot play itself sets `demoable: false`. Something bolted
on is a `CabinetAttachment`. A whole new kind of physical machine is its class (extending `TicketMachine`
like `HoopShot`, or holding a `MachineRun` like `Pinball`; `machineParts` has the marquee, display and note), one
line in `MACHINE_KINDS` (its key is its game id) and one entry in `ARCADE_PLAN.machines`; `furnishArcade` places it
and adds it to the crowd's stations.

## Front Street's shops and finds (`src/world/street/shops/`)

The street is not only the way to the arcade and the market: every shop door on the walkable pavements is a
`ShopEntrance` (`SHOP_HOURS` in `shopHours.ts`: closed, it says when it opens; `SHOP_TALK` in `shopPlan.ts`: what it
says and sells), except the four shops one walks into (`SHOP_ZONE_OF` in `streetPlan.ts`, see "The bare flat": their
door is a `StreetDoor` that travels inside in shop hours, `shopShutNotice` otherwise). Coins come and go through
`BuildContext.money.purse` (the wallet) and `SessionActions.pay`.
- **Café Lumière**: a coffee (`COFFEE_PRICE`, 2 coins) *is* the flea market's coffee of the day (`market.drinkCoffee`:
  the stallholders go easier on the haggle), with the barista's tip: a wishlisted game on a stall today, a gem in the
  bin, or the day's theme. Had already, the barista still talks.
- **The newsagent** (kind `tabac`): PIXEL SCRATCH cards (`scratchCard.ts`, the numbers `SCRATCH` in pricing.ts), 2 coins, five a real day (`bibliothek.scratch.v1`):
  three alike of six cells win 2, 3, 5, 10 or 25 coins; drawn outcome first, 38 % win, 1.35 coins paid out on average
  (the house wins). Scratched in `ui/ScratchCardPanel`; walking off scratches the rest and pays.
- **The florist** is walked into (see "The bare flat"): the houseplants for every room and the balcony's pots
  (`HomeUpgrades` 'plant', `BALCONY_PLAN.boughtPlants` then two `decor` pots). The bakery's croissant (1) and the bar's
  lemonade (2, with the regulars' gossip) are for the pleasure of it.
- **Dropped coins** (`DroppedCoins`): three a real day at spots drawn from the date, glinting when the player is near,
  one coin each, picked ones remembered (`bibliothek.finds.v1`).
- **FREE TO TAKE** (`GiveawayBox`): one real day in four a box of cast-offs by a front door; once the market's stock is
  drawn, one worn bin game lies in it for 0 coins (a `ForSaleBox`: B takes it).
- **The collector** (`Trader`): one real day in three, 10:00 to 18:00, outside RETRO GAMES with three copies he took off
  the flea market's stalls once the stock is drawn (`market.soldToRival`: gone from there; one from the wishlist if the
  market had it), at `TRADER_MARKUP` (1.25) times their price. They are `'stall'` copies: B buys, H haggles, X swaps a game from the
  collection in part exchange (it goes to the market), R holds. His picks are kept for the day (`bibliothek.trader.v1`).
- The busker's tips and the garage sale are as before (docs/zones.md).

## Coming home: the parcel and the bookcase

- **Deliveries** (`src/collection/Deliveries.ts`): nothing bought reaches the shelves directly. `Deliveries` watches the
  `CollectionStore`: a game that appears while playing (a stall copy, a mail order; at most 5 in one change, more is an
  import and goes straight to the shelves) waits in the `Parcel` under the hall console, and clicking the parcel unpacks
  everything. The shelves, search and the random pick read `deliveries.shelved` (the collection less the parcel); the
  posters and consoles still count everything owned. A game sold back leaves the parcel too.
- **The post** (`src/collection/MailPost.ts`, `bibliothek.post.v1`): a catalogue copy (`acquired.where === 'mail order'`)
  is paid for and off the shelves at once, but stays out of the parcel (`Deliveries.setInPost`) until the postman's next
  round (`POST_ROUNDS`, 10:00 and 15:00 on the game's clock, at least two game hours later). Then the stairwell's
  `Postman` rings when the player is home (`home` from `bootstrap/world`) and hands it over at the front door; coming home after
  a round, the concierge took it in (`furnishHallway`'s homecoming). Stall buys, the job lot and swaps skip the post.
- **Swaps with the neighbours** (`economy/NeighbourTrades.ts`, `bibliothek.neighbourTrades.v1`): some market days
  (`NEIGHBOUR_SWAPS.odds` in pricing.ts, seeded per day) a resident wants one of the player's games (owned, not lent) and offers one of theirs worth
  about as much (`shopPrice` with fame, within `FAIR`) for three days: a note under the flat's door (`Doorstep.slipNote`),
  a word on the stairs, and their door on the landing opens the `NeighbourTradePanel` (`Transactions.swapWithNeighbour`:
  one game out, theirs into the parcel, the offer closed in the same `batch`).
- **The bookcases** (`HomeUpgrades` 'bookcase', `BOOKCASE_PRICE` in `pricing.ts`, the household stall): the collection
  room starts with one; the bought ones stand along its walls first (five slots, `build/bookcases.bookcasesIn`), then in
  the bedroom's one slot (left wall). The collection room's shelving writes the games it has no room for into
  `BuildContext.collection.overflow`, which the bedroom's shows. Once the next bookcase would go to the bedroom, a
  `BookcaseKit` leans there; clicking it is `SessionActions.buyUpgrade` (a second click confirms, the coins clink, as in the shops). The
  market panel's "At home" row (`ui/market/shelfRoom`) says where a new game will go; with every bookcase bought it
  says the game stays in the collection, boxed away, and never suggests another.

## The bare flat (`economy/homeGoods.ts`, `HomeUpgrades`, `world/build/owned.ts`)

A new game starts with the strict minimum: one bookcase, the TV on its stand, one game (`STARTER_GAMES`: Super Mario
Bros., so the NES stands under the TV), a mattress on the bedroom floor, and what is built in (the kitchen's units and
fridge, the bathroom's fittings, the wardrobe, the radiators, the lights, the posters and the clock). Everything else is
bought, and stands at home the moment it is paid for:

- **The catalogue** (`HOME_GOODS`): each piece has its price (`HOME_GOOD_PRICES`), its shop (`HomeShop`), a `max`
  (pieces with several spots: 2 armchairs, 8 framed prints, 11 houseplants, 5 balcony pots, 5 bookcases) and maybe
  what it `requires` (the nightstands the bed, the bedroom's TV the dresser, the scratching post the cat). A blurb says
  what a piece opens at home (the nightstands carry the alarm clock and the phone, the reading corner's chair reads
  manuals, the kitchen table holds the cleaning kit and the cake, the radio has the morning news). The journal notes
  each piece bought.
  `HomeUpgrades` (`bibliothek.home.v1`, data v2) counts them; `canBuy` checks `max` and `requires`.
- **Where each piece stands** is in the flat's plans: decor lines carry `upgrade` (`build/owned.Owned`: an id, `{ good,
  nth }`, or a list), the wired pieces a plan field (`ROOM_PLAN.seats[].upgrade`, `projectorUpgrade`,
  `<KIND>_PLAN.upgrades`). Builders place them through `placerFor(zone, upgrades, owned)`: not bought yet, a piece is
  staged (hung where it will stand, hidden with `setShownKeepingLights`, neither colliding nor clickable) and
  `zone.place`d on the purchase. The flat's lights are the same bought or not, so a purchase never recompiles a shader.
- **The shops** (`src/world/shop/`, one zone each, kind `shop`, reached by travel like the flea market): SECOND HOME
  (`furnitureShop`, across the street by the pharmacy), TV REPAIR (`tvShop`, the workshop on Park Street), PAWS & CLAWS
  (`petShop`, by COMICS & MANGA) and the florist (`flowerShop`, by the launderette). Their street door
  (`streetPlan.SHOP_ZONE_OF`, `walkInShops()`) opens in shop hours (9:00 to 21:00, `SHOP_HOURS`; the first day's street
  tip says so); coming out sets the player down in front of it
  (`STREET_PLAN.arrivals`). Inside (`SHOP_PLANS` in `shop/shopPlan.ts`, built by `furnishShop`): every piece the shop
  sells stands on the floor, on a wall or on a table as the flat will have it (`displayPieces.buildPiece`: the flat's
  own class, lights stripped, merged; the rescue cat asleep in her basket in the settings' coat), each a `ForSale`
  with its `PriceTag` (the price; SOLD once a one-off is at home, AT HOME once the flat has no room for another):
  hover for the blurb and what stands in the way (`requires`), click to buy (`SessionActions.buyUpgrade`). The display
  stays, only the tag changes. The till on the `ShopCounter` opens the shop's list (`HomeShopPanel`, `forShop`), a
  clerk (`Vendor`) behind it. **One purchase rule everywhere** the flat's things are sold (a tag, the till, the
  household stall, the bookcase kit): a piece dearer than `ARM_ABOVE` (30 coins) takes a second click within
  `CONFIRM_MS` (the tag reads AGAIN TO BUY, the till's button "Again to buy", elsewhere a word under the crosshair),
  the same statuses (`HomeUpgrades.status`: buy, full, needs; `refusalFor` says why not), one transaction
  (`Transactions.buyHomeGood`: the coins and `HomeUpgrades.add` in one `batch`), the same clink (`purchaseClinks`) and
  line (`boughtLine`). The rest is the shop's own (`fixtures`): the TV wall showing snow (`TvWall`, the
  shared `snowScreen` repainted by one `SnowTicker`), the repairer's bench, shelves of stock (`GoodsShelf`), the fish
  tank, the florist's stepped stand of cut flowers. `displayPiece(id)` is also what the panels' thumbnails photograph.
  The flea market's household stall keeps its own display (bookcase, kilim, lava lamp, poster, CRT).
- **The cat** is adopted at the pet shop (docs/cat.md "Adoption"): till then C, the feather wand and the visitors know
  there is none.
- **Old saves** (data v1) keep the pieces they bought, lose the rest of the furnished flat, and are given once the
  bookcases their collection needs (`HomeUpgrades.shelveCollection`). `?debug` has everything (`furnished`).

## The collector's book (`economy/milestoneList.ts`, `Milestones.ts`, `CollectorWatch.ts`, `collectionValue.ts`)

- **The binder** (`world/collector/CollectorsBook`) lies on the living room's sideboard (`ROOM_PLAN.collector`; on the floor where the sideboard goes until it is bought, `bookOnFloor`) and
  opens the `CollectorBookPanel` (`ui/collector/`, a `MarketPanel` with three tabs) through `SessionActions.openPanel`.
- **Milestones** (`MILESTONES`): the collection's size (10, 25, 50, 100, 250), one console's depth (10, 25), five
  consoles, the collectors' club's sets (1, 3; the sets' own rewards are still claimed at the notice board), arcade
  medals (1, 10), a league won, a haggled deal, a sale, the collection's value (1,000, 5,000 coins), a grail. `Milestones`
  (`bibliothek.milestones.v1`) keeps the day each was first reached (it stays reached) and which rewards were claimed;
  the coins or tickets (`MILESTONE_REWARD` in `pricing.ts`) are claimed in the book, in one `batch` with the wallet.
- **What they bring home**: 25 games stand the `BrassPlaque` on the sideboard, engraved again at 50, 100 and 250; 50
  games bring the `HomeVitrine`, a glass display cabinet against the front wall under the collection poster with the nine
  most valuable copies on the shelves (not the parcel's, not the lent ones), best on the top tier. The cabinet is only
  `zone.place`d once earned (no light, so no recompile), so it never stands invisible in the way.
- **Value** (`collectionValue.ts`): a copy is worth what a stall would ask for it on an average day (`marketPrice` at the
  mean `MARKET_DISCOUNT`, its condition and printing), a grail its grail price, a reproduction `REPRO_BUY_BACK`; the book
  also shows what the WE BUY desk would pay (`buyBackPrice`). `ValueHistory` (`bibliothek.valueHistory.v1`) keeps one
  point per real day (`dayKey`), drawn as a line chart (`ui/collector/valueChart`).
- **`CollectorWatch`** listens to the collection, the medals, the league and the standing, takes the facts again (300 ms
  after the last change), marks milestones (`onReached`: a big reward banner), writes today's value, and looks the fame of every
  owned game up in the background, two at a time, so the estimate is priced like the market prices.

## Not done yet

- **LexiPunk's side**: the cabinet and its frame are done, but lexipunk.com has to post its score
  (`{ type: 'lexipunk:score', score, final }` / `{ type: 'lexipunk:over', score }` to `window.parent`); until it does,
  a LexiPunk play pays nothing, so it plays free (`freePlay` in `ARCADE_PLAN.cabinets`: drop the flag once scores come
  in). Its `PAYOUT` and table are guesses until its scores are seen.
- **Tuning by play**: `PAYOUT`, the rival tables, the claw's `GRIP` odds, the wheel's slices and the league's
  rivals are first estimates; `?payout` collects the real spreads. The physical machines (pinball, alley, hoops,
  wheel) are not in `simulatePayouts`.
- The arcade never closes: an empty hall late at night was considered, a shutter was not (it would dead-end the loop).
- **Front Street's shops**: their prices, the flat's (`HOME_GOOD_PRICES`) and the scratch card's odds are first guesses.
  The walk-in shops' layouts (`SHOP_PLANS`) were placed from the pieces' sizes, not yet walked: check nothing overlaps
  and every tag faces the aisle. A shop does not put the player out at closing time.
- The window view from the flat (`props/outdoors/Shopfront.ts`) still paints the three new shops as roller shutters.
