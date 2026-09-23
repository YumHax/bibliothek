# The economy: going out, the arcade, the market

Read this when touching money, prices, the cabinets, the stalls, or how the player leaves the flat.

## The loop

The collection starts empty and Tab no longer adds games (`?debug` in the URL restores the seed list and the
editor's "add" pane). Games are bought with coins; coins are won at the arcade:

1. **Front door** (`TravelDoor` in the hallway) -> "Where to?" menu (`TravelMenu`, digits or click) -> fade
   (`Fader`) -> teleport (`Travel.go`) to the zone's `travel.arrival` spot -> the `ZoneManager` loads it. The
   arcade's and market's exits are `TravelDoor`s too; the menu lists every `travel` zone but the current one.
2. **Arcade** (`src/world/arcade/`): clicking an `ArcadeCabinet` costs `PLAY_COST` coin and parks the player at
   the controls (`player.sit` + `lookAt` the glass). The game (`games/`, an `ArcadeGame`: pure simulation +
   canvas drawing) reads the keys straight from `Input` until `over`; the cabinet reports the score, the Session
   pays `ticketsFor(score)` tickets and records the best (`ArcadeScores`). The cabinet's end card counts the
   tickets up and stays: Space / Enter or a click pays another coin and replays without standing up
   (`Session.playArcade` with the same cabinet), `E` or Esc walks away (a running play is lost). The
   `PrizeCounter` swaps tickets for coins at `TICKETS_PER_COIN`. With no coins and fewer tickets than a coin
   is worth, the play is free ("on the house"), so the loop never dead-ends.
   The hall itself (`arcadePlan.ts`): black neon-confetti carpet (`Carpet.ts`), dark glazed dado, aubergine walls under a
   black ceiling, neon (`NeonSign` ARCADE over the cabinets and INSERT COIN over the door, `NeonTube`s along the wall tops,
   the only real lights besides the cabinets' glow; the house `FlushLamp` is off), the cabinets shoulder to shoulder with
   printed side art, a `ScoreBoard` (hall of fame, repainted when a best moves), and machines nobody plays for tickets:
   `Pinball` (live climbing score, TILTs), `ClawMachine` (the claw roams, drops, comes up empty), `ChangeMachine` (out of
   order; clicking any of them gets a line). People are the market's classes: a `Vendor` attendant behind the counter
   (`PrizeCounter.wallBehind` leaves room), a `Vendor` at the pinball and at the claw (placed at the machine's `standAt`,
   gazing at its `focus`), one `Shopper` wandering between `browseSpots`.
3. **Market** (`src/world/market/`): one `MarketStall` per platform shows the day's `MarketStock` as
   `ForSaleBox`es (a `GameBox` with a price tag; the wrapper owns the click). Buying (`Session.buy`) spends
   the coins, adds the game to the `CollectionStore` (so the shelving at home rebuilds) and takes the box off
   the stall. The `OrderCounter` opens the `CataloguePanel`: any game in the libretro index, new, at `shopPrice`.
   Both read the price live: a stock item's `price` and a catalogue row start at the ordinary price and settle
   when the game's fame arrives (`StockItem.settled`; the tag and the row repaint).

## Numbers (`src/economy/pricing.ts`)

Everything tunable is there: starting coins, play cost, tickets per coin, points per ticket, base price per
platform, the fame curve, the market discount range and condition factors. A price is `BASE_PRICE[platform] x
fameFactor(views) x jitter(id)`: no real price source exists key-less, so fame stands in for value (see below).
Calibration: a good player earns about 20 coins a minute at the cabinets (a play is 1 coin and pays 500 points
per coin back). Base prices are set against that rate: an ordinary market copy (80-100 coins) is 4-5 minutes of
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

## Stock and condition

`MarketStock.todays()` draws a few copies per platform (`perPlatform`, 2 to 8, so a stall may be sparse or heaped;
the stall drops what does not fit) from the index, seeded by the date (same stalls for everyone all day), skipping
hacks, protos, revisions and non-western regions, and filters out what the collection owns. Each copy gets a `BoxCondition`: `complete`, `noManual` (the booklet is hidden in the box) or `worn`
(no booklet, dulled cover: `GameBox` reads `game.condition`). The shop only sells complete copies.

## Persistence

`bibliothek.wallet.v1` (coins + tickets), `bibliothek.arcade.v1` (best scores), the collection as before.

## The cabinet games

Four games, one per cabinet, each a 10-15 second burst (long plays bored; the funfair stacker set the bar),
readable and greedy for a replay. They share `BaseGame`
(`games/BaseGame.ts`): a READY / GO countdown, an optional clock with a time bar that games can add seconds to,
a combo multiplier (x1 to x5) that decays, score pops (`Fx`: pops, shake, flash), a live `TIX` counter at the
payout rate, a NEW BEST banner the moment the record falls, and a held TIME UP / GAME OVER card before `over`.
Nothing costs the play except the clock or the game's own single rule; mistakes cost seconds and the combo.

| Game | Cabinet | Clock | Earning time | Losing time | Harder every stage |
| --- | --- | --- | --- | --- | --- |
| `Breakout` BRICK STORM | 30 s | clock bricks +3 s, wall clear +5 s (and +300) | last ball lost -2 s | per wall: ball +10%, paddle -5 px (to 52), a row more every 2 walls (to 6), a clock brick fewer every 2 walls (to 1) |
| `Invaders` STAR RAID | 15 s | saucer +3 s (and 100), wave clear +5 s (and +200) | a diver getting past -1 s | per wave: march faster, a row more every 3 waves (to 5), divers quicker, saucer +15% speed and 0.5 s rarer |
| `Stacker` SKY STACK | 12 s | every landed row +1.5 s, a clean one +1 s more, minor prize (row 10) +5 s, jackpot (row 15) +10 s | a landing that lost cells +1 s less (net +0.5 s) | per row: faster block, narrower (3 / 2 / 1 cells); each tower after a jackpot +25% speed; a miss ends it |
| `ArrowRush` ARROW RUSH | 15 s | gold arrows +2 s, every 10 hits a level = +3 s | a late arrow or a wrong press -1 s (spamming the lanes loses) | per level: arrows +22 px/s, spawn gap -0.045 s (to 0.15), gold one arrow rarer |

Scoring: bricks 30-100 (chain within 1.2 s), aliens 5-25 and divers 100 (chain within 0.5 s), stack row *n* pays
25*n* (+40 and chain when clean, +300 minor, +1500 jackpot), arrows perfect 20 / good 8 (every hit chains, a late
arrow or a wrong press breaks). Every game is unbounded in theory: the seconds it hands out are enough to keep going
at the pace a very good player sets, and the difficulty ramp is what ends the run.

## Adding a cabinet game

Extend `BaseGame` in `src/world/arcade/games/` (320 x 240 logical pixels, playfield below `PLAY_TOP`; implement
`begin` / `tick` / `paint`, score with `addScore` / `bonus` / `bumpCombo`, end with `end('GAME OVER')` or let the
clock run out), register it in `games/index.ts`, name it in a `cabinets` entry of `ARCADE_PLAN`. No Session change.

## Not done yet

- **LexiPunk** (or any iframe game) as a cabinet: the site embeds fine, but the score must come back by
  `postMessage` from the page, and the CSS layer must be raised above the canvas while playing (today iframes are
  behind it, unclickable). Design it as another `ArcadeCabinet` screen implementation.
- **The street**: the teleport stands in for it. A walkable outside would replace `Travel` with real doorways.
- Gamepad / touch have no digit keys: the travel menu's lines are clickable, the digits are keyboard only.
