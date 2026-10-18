# The building

The block the flat is in, and the life it has round the player. The places are zones, in docs/zones.md: the stairwell
and its hall, Mrs Roux's rooms, the neighbours' flats, the courtyard, the cellars, the attic, the roof. This file covers
the systems that run across those places: what is decided, saved and shared. Most of the state lives in `src/building/`
as small module-level stores, each saved under its `KEYS` entry and read by any zone that needs it. The zones' props live
in `src/world/<kind>/`.

| System | State and rules | In the world |
| --- | --- | --- |
| Notice board | `boardNotes` (`pinSource`, `refreshBoard`, `onRead`), `houseNotes` (rules, small ads) | `stairwell/hall/HallBoard` |
| Keys | `keys` (`hasKey('cellar')`, `giveKey`) | `cellar/CellarDoor` |
| Concierge | `conciergeState` (her errand, her tip box) | `stairwell/hall/Concierge`, `Lodge` |
| Friendship | `friendship` (`befriend`, `isFriend` ≥ 25, `COLD` ≤ -15), keyed by `doorKey(k, i)` | knocks, chats, swaps, visits, the party, complaints |
| Who is home | `residentsHome` (hours, bedtimes, moved away) | `Neighbours`, the lit windows (`rearWindows`) |
| Co-owners' meeting | `coproPlan`, `coproState` (`coproChoice`), `coproMeeting` | `stairwell/hall/coproLook`, `MeetingSetup`, `BallotBox`, `ui/CoproPanel` |
| Mains, power cut | `mains` (`mainsOn`, `poweredAt`), `blackout` | `stairwell/downAndDark`, `stairwell/powerCut/` |
| Flat noise | `flatNoise` (`addFlatNoise`), `noiseComplaints`, `throughWalls`, `neighbourNoisePlan` | `stairwell/flatHeard`, `noiseAndCat`, `DoorVisitor` |
| Mrs Roux's move | `rouxMove` | `world/annex/`, `stairwell/RemovalLift` |
| Estate sale | `estateSale`, `pricedCopy` | `world/estateSale/` |
| Neighbours' party | `neighboursParty` | `courtyard/NeighboursParty`, `PartyScores`, `StringLights` |
| Bulky-waste day | `bulkyWaste` (`bulkyLot`, `takeFromBulky`, `bulkyNotes`) | `courtyard/placeBulky`, `bulkyModels` |
| The kids in the yard | `kids/` (`kidsPlan`, `yardKids`: `kidsOut`, `kidCarts`, `judgeSwap`, `kidScore`, `beatKid`; `kidNews`) | `courtyard/YardKids`, `YardKid`, `handheldModel`, `placeKids`, `ui/yard/KidSwapPanel`, `ui/yard/HandheldPanel` |
| Film night | `yardCinema` (`putOnFilm`, `filmNightNow`, `audience`, `filmShown`, `cinemaNotes`) | `courtyard/YardCinema`, `YardCinemaPieces`, `placeCinema`, `ui/ScreeningPanel` |
| Rear windows | `rearWindows`, `rearWindowsPlan` (stories, the trader's shelves) | `street/windowLife`, `windowStoryGlsl` (docs/outdoors.md) |
| The post | `postCollected` (the day's post: flap or mat, once) | `stairwell/hall/OurMailbox`, `hallway/` |
| Treasure hunt | `hunt/` (`huntPlan`, `BuildingHunt`, `huntSays`) | `world/hunt/` (docs/zones.md "The sixth floor") |

Rules shared by all of them:
- Days are game days (`ctx.today.gameDay`, `gameDayRandom`), except the real Fête des voisins and the fireworks' dates.
- What happens is told through `src/notices/` and pinned on the board; nothing is a penalty except the noise complaints'
  friendship.
- Nothing here adds a shadow-casting light or recompiles a shader when it changes: a state shows as uniforms, props shown
  or hidden, or the two stair lights moved.

## The notice board

One canvas on the hall's west wall, repainted on a new game day and on `onBoardChange`. Each feature pins one source
(`pinSource(name, day => BoardNote[])`), heaviest first: the house rules and two residents' small ads a day
(`houseNotes`), the meeting's agenda and minutes, the estate sale's notices, the party's poster, the syndic's quiet-hours
reminder, the power cut's note, Mrs Roux's sale, the hunt's card. A note's `onRead` fires when the board is read with it
on.

## The concierge and the cellar key

Mme Pereira (`STAIRWELL_PLAN.concierge`) stands behind the lodge's glass 8-12 and 15-19. Some mornings (0.35 of game
days) she mops a landing 9-11 instead, with a bucket and a wet-floor sign. She is met only while the player is in the
stairwell. She holds the cellar key:
- Asked for it, she sends the player to try the timer buttons of the 1st to the 4th floor (a "To do" tip). The 3rd
  floor's sticks. Back with the answer, the key is the reward.
- Coins in her Christmas box (`TipBox`, 10) hand it over at once.
- Told which button sticks, the electrician fits a new one the next game day (`conciergeState.mended`): it no longer
  sticks, its knob is new and says so once, and her thank-you is on the board for two days.

Her other keys (`building/keys`, handed over by `socialBuilding` at her tier, at boot too for an older save):
- **The lodge's spare** at Friend (`holdsParcels`): while she is out, the lodge's door (`hall/LodgeDoor`) lets the player in
  to water her geranium, once a game day (+3 warmth).
- **The roof key** at Close (`roofKey`): the lift's panel has a little keyhole marked TOIT over the top floor's button
  (`Lift.turnRoofKey`): turned from inside the car, the old ride climbs past our landing to the roof itself, no code
  needed (`AtticRide.keyRide`). The roof's chimney stack has a seat facing Front Street (`ROOF_PLAN.sit`): an hour of the
  city by day, of the stars by night, something seen.

## Friendship

Knock while home 8 (once a game day), a swap done 15, watching their game in their flat 6 (their shelf sells nothing:
their games are theirs, a swap brings one home); a party chat once a party. Talking itself goes through the
conversation (docs/social.md "Who talks in the building"): on the stairs, at their door when they answer, in their flat. Noise complaints take it down (below). Six neighbours ask
the player in once it reaches their `inviteAt` (`neighbourFlat/visits`, `NEIGHBOUR_HOSTS`: Mrs Roux at the first knock,
the Moreaus and Martin at 25), between 9:00 and 21:30. The door's caption then says "visit", and the knock travels into
the `neighbourFlat` zone. A resident at `COLD` or under only gives a curt hello on the stairs.
What a friend gives (Lucien's box, Gilles's cartridges, Théo's cart, meals, the cat fed, Mrs Roux's flat for less, Mrs
Haddad's better swaps) is docs/social.md "The building's perks".

The friendship is now the warmth of the social layer (docs/social.md): `building/friendship` reads and nudges it by
door. How a resident stands with the player changes their vote, the noise they put up with, the post, the board's
notes and more: docs/social.md "The building".

## The co-owners' meeting

- **Schedule.** A meeting sits every 14 game days. Its agenda has three resolutions, those never voted coming first: the
  runner (red, green or none), the paint (cream, sage or ochre), plants on the half landings, bikes in the hall, the
  lift's overhaul, the fibre, a doormat, a mirror. The agenda goes up on the board 3 days before.
- **Sway.** A resident who is the player's Friend votes with their ballot, a Close one brings another round, a
  Hostile one votes against it; a Friend syndic breaks a tie their way (docs/social.md "The building").
- **Votes promised** (`social/conflicts/votes`). While the ballot is open, each resident met (Acquaintance or warmer)
  with a fixed leaning on one of the agenda's resolutions asks for the player's vote ("You'll vote with me on the stair
  carpet, won't you?", their need in the People book); two of them may want opposite things. "I'll vote … like you" is
  a promise (a ticket due at the meeting); the day after it sat, the player's ballot keeps it (warmth and a stamp of
  trust) or breaks it (the stamp lost, remembered). Not answering costs nothing.
- **Voting.** The ballot is open until the meeting's day ends. The ten households vote by nature (`Voter.leans`, shown
  on the ballot) or by a mind of their own drawn per meeting. The player has one vote, two once Mrs Roux's flat is
  theirs (hers is then no longer cast), plus up to 3 bought votes a resolution at 25 coins each. The ballot
  (`ui/CoproPanel`) is a printed paper: crosses drawn in pen, the voters' faces with their names on hover, "Likely to
  vote with / against you" written over the sway's faces, each bought word ("Put in a word · 25 coins", "Take it
  back") a stamp on the line, postmarked once paid; "Post my vote" folds it into its envelope.
- **The day itself.** Six folding chairs and the syndic, M. Bertin, stand in the hall 17-22 (`MeetingSetup`). On a day
  of the estate sale they come only once its tables are cleared (20:00).
- **The tally** runs on the next game day. A tie keeps what stands. The minutes stay on the board 4 days. Every meeting
  that sat is tallied, in order, even when game days jump past several (`coproState.settled` marks the last one), so a
  ballot and its bought votes always count. A ballot off the meetings' days is voided and its bought votes refunded.
- **The result** shows at once (`coproLook`): the walls repainted (uniforms), the runner recoloured or taken up (the
  stone's wear then shows), and plants, two bikes, the gilt mirror, the doormat, the fibre box and the lift's overhaul
  plate shown or hidden. The landings' plants are clicked (`LandingPlant`): on Mrs Dubois's watering days her can has been
  round, on the others the player waters them from her jug and she hears of it (+1 once a game day,
  `stairwellPlan.coproLook.plantTalk`); the doormat wipes the player's feet, and Mrs Pereira, in her lodge, approves (+1
  once a game day, `doormatTalk`). `coproChoice('lift') === 'overhaul'` runs the lift 1.5 times as fast with quiet gates;
  `coproChoice('fibre') === 'yes'` brings the roof's fibre channel.

## The quarrels

Three quarrels draw the player in, one after the other (`social/conflicts`, `KEYS.socialConflicts`; docs/social.md
"Conflicts"), each once both sides are met, 3 game days on and not before its day (4, 9, 14):
- **The noise**: Mr Leclerc wants his sleep, Théo in the attic his music. Sign Leclerc's letter to the syndic, or lend
  Théo your speakers for his party.
- **The rumour**: Mrs Dubois has a story going round about Pascal Girard (the lodge's missing parcels). Pass it on, or
  stand up for him, to him or to her face.
- **The hunt**: Mrs Haddad and Victor are after the same game (one of her platforms, drawn at the start). Promise to
  tell her first, or tip Victor off.

Each side tells theirs when asked ("You look tired. Bad night?") and then offers the player to take it (a long press):
the side taken gains warmth and a stamp of trust (`CONFLICT.won`), the other cools (`CONFLICT.lost`); taken in public,
the people around see it (`witnesses`). While it is on the two grow further apart (a tie offset), so the grapevine
carries more. Nothing taken in 6 game days, it blows over and both cool a little. Afterwards the winner tells how it
went, the loser says their piece and, 5 days on, offers a way back (warmth, a memory of peace made).

## The power cut

- **The mains.** `mains` is a leaf flag: `mainsOn()`, `onMains`, and `poweredAt(object)`, true off the building's
  circuit. The circuit is the zones named by `setBuildingCircuit`: the flat with its stairs, the annex, the neighbours'
  flats, the cellars and the attic. The street's shops are not on it. During a cut:
  - every `SwitchableLamp` there eases to dark and keeps its switch, and `placeRoomLight`'s room light follows;
  - a `Television` or `Projector` stops and refuses to start;
  - the `Lift` stays where it is (between floors if it was moving) and its buttons refuse, except on the climb to the
    attic (that old motor is off the circuit);
  - `StairLights`' globes go out and their sensors and timer are dead;
  - the residents set off nowhere (`Neighbours.quiet`), and whoever the cut strands in the car is not home meanwhile
    (`DownAndDark.strandedDoor`, through `Neighbours.gone`);
  - the cellars' bulbs are dead (the torch works).
  - the kitchen's kettle, toaster and radio, the turntable, the home arcade cabinet, the oven (no cake) and the hair
    dryer (no sticker peeled) stop or refuse; the radio and the turntable's side come back when the power does.
- **When.** On a `storm` spell, a lightning strike between 17:30 and 23:30 cuts the power on about one stormy evening in
  four (a draw per game day). The syndic's note goes up on the board for that day and the next. There is at most one cut
  a game day (`bibliothek.blackout.v1`), never with the player in the lift's car, and never mid-scene
  (`holdPowerCutsWhile`, wired in `bootstrap/world` and `worldLife`): in a household fade, a night, a memory, a
  conversation, an open panel, the opening film or a gathering.
- **The way back.** Reset the main fuse at the meters cupboard on the hall's west wall (`FuseBox`,
  `POWER_CUT_PLAN.fuseBox`) or at the main board in the cellars' boiler room. Within 40 s of the cut it trips again (the
  storm is overhead). After 7 minutes the power comes back by itself. A reload brings it back.
- **The scene** (`PowerCutScene`, data `powerCutPlan`):
  - Candles on saucers stand on the landings and on a card table in the hall. They are emissive with no light of their
    own: `StairLights.setCandles` moves its two real lights over the nearest flames, a wavering orange.
  - Haddad and Dubois chat on the 2nd floor. Girard and Martin play cards at the table, which collides only while it is
    out.
  - If the cut fell while the player was elsewhere, `Lift.strand(1)` stops the car between the 4th and the 3rd with Mrs
    Moreau inside. She calls out when the player comes near, talks through the cage, and thanks them when it moves.
  - When the power comes back everyone cheers and goes in a few seconds later.
- **Debug.** `?debug`: `bibliothek.blackout()` cuts it now, and the next fuse reset brings it straight back.

## Noise

- **Heard both ways.** The flat and the stairwell hear each other through `SoundRoute`s (docs/zones.md "The
  stairwell"). From inside the flat the building is heard through the floor and ceiling too (`throughWalls`, data
  `neighbourNoisePlan`): Mrs Moreau's piano and TV downstairs, the attic student's music some nights, steps upstairs.
  This only plays while the player is in the flat and that neighbour is in. In a power cut the TV and the music go
  silent.
- **Noise after ten** (`noiseComplaints`, `NoiseWatch`). `flatNoise` sums a longplay on a screen (0.7), the kitchen's
  radio (0.45), a record on the turntable (0.5) and anything else through `addFlatNoise`. At 0.3 or more between 22:00 and 07:00, things escalate:
  1. After 40 s, A. Leclerc (under the living room) bangs a broom on his ceiling.
  2. Still loud 45 s later, he comes up and knocks (`DoorVisitor`). Answered: -6 friendship, and a thank-you as he goes
     if it went quiet. Unanswered: a note under the door, -10.
  3. Still loud 90 s after that, the syndic hears of it: a quiet-hours reminder on the board for two days, -12 for him
     and -4 for the Moreaus.
  Turned down at the broom, the count starts again from nothing. Out of the flat at the broom (the cellar, the yard,
  the street), the player gets word at once (a slip, `awayWarning`), he waits three times longer before coming up, an
  unanswered knock costs nothing while they were away, and the syndic only hears of it if they were home to hear him.
  This happens once a night at most. The threshold, the hour it starts and what he does follow his standing with the
  player (docs/social.md "The building"): a close friend comes up to listen instead, a hostile one goes straight to
  the syndic.

## Mrs Roux's move

`rouxMove` steps through its states by game day:
1. `settled` until day 15.
2. `thinking`: her lines on the stairs change (the stairs are hard, her daughter in Lyon).
3. `forSale` from day 19: the agency's sign on her door and its notice on the board.
4. Bought through that sign (the `annex` home good, `HOME_GOOD_PRICES.annex`, docs/economy.md).
5. `moving` that day: removal boxes on our landing, her farewell, a letter under our door, and the removal men keeping
   the lift busy in their hours (`RemovalLift`).
6. `works` the next day: she is gone (`Neighbours.gone`, `residentsHome` moved away, no swaps from her:
   `NeighbourTrades.present`), a dust sheet hangs over the wall, hammering 8:00-18:00.
7. `joined` after that: a big reward, her thank-you on the board, and a postcard from Lyon three days later.

The rooms themselves are in docs/zones.md "Mrs Roux's rooms". Her front room keeps her marble fireplace (the same one her
flat has when visited, `neighbourFlatPlan`'s `fireplace` dressing) and, on its hearth, Félix's shoebox
(`annex/FelixShoebox`, `ANNEX_PLAN.shoebox`, docs/story.md Act 3): her note in it, and one of his own copies set out
beside it, free, until taken (`bibliothek.felixShoebox.v1`). Once the rooms are joined her mantel is a display of two
boxes face out against the wall (`Fireplace` is a `ShowcaseStand`, registered with `Showcases` under the key "mantel", docs/
furnishing.md "Displays"); her photo and note stay readable at its ends.

## The estate sale

The sale (`estateSale`, `world/estateSale`) happens once, from game day 25 (`ESTATE_SALE`; a save already past it gets it
5 days after first looking). The late Mr Lambert lived on the 3rd floor, courtyard side; he is never seen, and his name
stays on a mailbox. His family clears his flat in the hall for 3 days, 9:00 to 20:00 (`STAIRWELL_PLAN.estateSale`):
- a trestle table in front of the mailboxes with his games face up;
- an open crate past it: three piled up, a grail at the bottom at 0.3 of its price;
- his niece Claire to talk to.

The board shows his death notice from 5 days before, the sale's notice from 3 days before, and the family's thanks after.
The family's flyer comes through the flat's door every day of the notice and the sale (`hallway/mail` `estateFlyer`), and
the journal's "to watch" names it (`journal/worldWatch`), so a player who runs past the board does not miss it.
Copies are bought like a stall's and haggled with the family's own `EstateDealer` (`ForSaleLike.dealer`: no holds, no
swaps, one haggle a copy). What was bought is not laid out again (`bibliothek.estateSale.v1`). Off its days it places
nothing. Lambert is also the treasure hunt's Henri.

**The new tenant** (`building/newTenant`): six game days after the sale's last, Yann Le Goff moves into the flat (the
night show on Radio Brocante: the kitchen radio's 8-bit hour is his). His hello is on the board three days, the mailbox
says LE GOFF, and some evenings (18-22, one in two) he sorts his post at the mailboxes in the hall, someone to meet
(`stairwell/NewTenant`, social card `legoff`).

## The neighbours' party

It falls on one game day in 28, and on the real Fête des voisins (the last Friday of May), in the courtyard. Details are in
docs/zones.md "The courtyard". The residents buy the player's duplicates at the market buy desk's top price, so buying
to resell still never pays (docs/economy.md). The tournament gives 3 free plays a party; beating the residents' best pays
60 tickets once. Its book is kept per party (`partyId`): the cycle's by its game day, the Fête des voisins by its real
date, so the prize pays once that date, however many game days it lasts.

## Bulky-waste day

One game day in seven (`BULKY.every`, `phase` 5: never the bin bags' day nor a party day), a resident clears out a
cupboard and leaves it by the bins in the courtyard for the dawn lorry (`bulkyLot(day, fits)`, drawn from the day:
who, which junk, whether a piece for the flat is out and which, whether a console that won't switch on is, how many
loose games). Whatever the player carries off is free: the games go to the parcel like any find, the piece goes
straight into the flat (`HomeUpgrades.add`, only a piece it has room for), the console to the kitchen chair for its
repair. Each take warms the owner by `BULKY.warmth` once a day (`befriend`, reason `bulkyWaste`). The board pins the
concierge's reminder the day before and the owner's CLEARING OUT note on the day (`bulkyNotes`). The yard's side is in
docs/zones.md "The courtyard".

## The kids in the yard

The building's children (`kids/kidsPlan`: Hugo, the Moreaus' son, 12; Mai and Tuan, the Nguyens' twins, 8, one
handheld between them; Lina, Mrs Haddad's niece, 10, Wednesdays and weekends only) are down in the courtyard with their
handhelds after school (`KIDS_RULES.hours`: 16:45-19:15, Wednesdays from 13:30, weekend mornings and afternoons), each most
days (`comesDown`, drawn per kid and game day, the twins together, a little late and a little early); never in the rain,
after dark nor on a party day (`kidsOut`). On the game's Sundays (`playgroundDay`) the ones out are at the park's
playground on Front Street instead (`street/events/placeStreetEvents`, the same `YardKids`), not in the yard. They are people of the social layer (`social/people/kids`, group
`building`): met, warmed, given gifts and favours like anyone. Each conversation adds:
- **Heard anything?** Kids hear everything (`kidNews.kidsNews`): tomorrow's clear-out by the bins and its owner (a
  console in it, said), the day's pile, a party within three days (urgent: the first kid to see the player shouts it,
  once a game day, and the entry is tagged "news"), then a nudge towards the treasure hunt's next place (by the clue last
  found) and the lost prototype's trail (by its stage: where it already goes, never a step of its own; the stage is
  handed in by `bootstrap/worldLife`, `tellKidsTheStory`), Victor at the market or outside RETRO GAMES, and two of the
  neighbours' cupboards. One line an ask, a little warmth once a day.
- **Swap carts?** (`ui/yard/KidSwapPanel`, on the yard's asphalt: the kid's face and words in a balloon, their pencil
  case unzipped with the carts as cartridges, the picked one ringed in felt-tip, the player's own carts below each with
  "Offer for <theirs>"; a press that can't go through gets the kid's word for why): their pencil case (`kidCarts`: three carts of their platforms drawn from the
  market's index per game week, `MarketStock.randomGames` with `platforms`, sometimes a big hit of the seed's; less what
  they swapped away that week, plus the player's games they got). A kid weighs an offer by fame, never by price
  (`judgeSwap`: monthly page views, a big name hyped, their own cart a bit dearer, another machine's game less, a game
  with no article next to nothing): a rare cart goes for a famous common one. They answer a deal, a deal if 10 to 30
  tickets are thrown in, or no (never heard of it, it doesn't go in their handheld, or plain no), in the panel and over
  their head; a handful of offers (`offers`) and they want to play. A swap goes through `Transactions.swapWithNeighbour`
  (the cart to the parcel, its receipt "Hugo, in the courtyard"), warms and trusts the kid (gossiped to their family).
  A friend of theirs swaps more easily (`easySwaps`), one gone cold won't (`noSwaps`: the entry is not offered).
- **Bet I can beat your score!** (`ui/yard/HandheldPanel`; the stick keys and Space, a controller's D-pad or stick and A,
  or the shell's printed D-pad and buttons under a finger, each lit while held; "Give it back" printed under it, also
  Esc, E or B): their handheld held up in front of the player, their game on
  it (`KidPlan.game`, an arcade game stepped at the arcade's rate) with their score of the day as its HI (`kidScore`:
  their skill in tickets' worth, grown 12 % a loss to the player up to double: they practise). Beaten, they groan and the
  week's first loss sometimes hands over a cart they are bored of (`beatKid`, `boredCart`, free, into the parcel);
  winning, they crow. Never a penalty: a go costs nothing, giving up mid-game is only "Chicken!".

Kept (`bibliothek.yardKids.v1`): the week's carts gone and the player's games they hold, each kid's practice, who handed
a cart over this week. `?debug`: the panel's "The kids down in the courtyard now" (whatever the hour and the sky, today).
The yard's side is in docs/zones.md "The courtyard".

## The film night

Once the flat has its projector (`HomeUpgrades` `projector`), the sheet rolled up on the workshop's wall in the
courtyard puts on a film: a click opens `ui/ScreeningPanel` (a night yard, the bedsheet at the top showing the game pointed at as a poster, the
player's games as ticket stubs; "Show this one" is `putOnFilm`, the poster flickers up "Tonight, at dusk" before the
panel goes), the
game's longplay is the film. The film waits for the first evening that is dark (`CINEMA.dark` daylight), dry
(`CINEMA.rain`; rain puts it off, said once), before `CINEMA.until` and not a party day
(`filmNightNow`), with the player in the yard: nothing happens while they are elsewhere. Then the residents who are home
and not cross with the player come down, each with a chance that grows with their friendship (`audience`, seeded by the
day and the film); the player starts the film at the projector. Once it has run `CINEMA.film` seconds of picture they
clap, each is warmed by `CINEMA.warmth` (`befriend`, reason `yardCinema`, once a day), and the one whose tastes it fits
best (`social/gifts.gameFit`) says what it meant to them; a friend (`CINEMA.giftFrom`) it fits well leaves a game from
their cupboard on their chair, free (`filmShown`). A film that never starts or finds no longplay and they go back up:
it stays on for another evening. The board pins the poster while a film is on (`cinemaNotes`). Kept: the film put on
and the screenings shown (`bibliothek.yardCinema.v1`). `?debug`: the panel's "A film night in the courtyard now" (or
`bibliothek.filmNight()`) puts the collection's first game on, the night on now whatever the sky. The yard's side is in
docs/zones.md "The courtyard".

## Small things about the building

- **The cellar.** Our box (No 5) was Félix's (`CELLAR_PLAN.felixBox`, docs/story.md Act 3): the first time its padlock
  comes off his note taped inside the carton's lid is read, and the carton holds one of his own copies
  (`economy/felixLots`). Emptied, the flat's put-away furniture is seen at its back under dust sheets
  (`Furnishings.storedPieces`, up to four), and a click says so. A box whose game is taken no longer says it has one.
- **The attic.** The collector's sofa has a blank-label Game Boy cart down its side (a GB game the player lacks, until
  taken); with his chest open its key ring opens the service stair's wardrobe on his magazines and a spare of his. Once
  Théo is a friend he answers through the walls for No 5 (his booth) and No 7 (Mr Rossi's Sunday studio) and opens No 6
  for a listen to his mix (+2, once a game day).
- **The endless stairs' door.** From the fifth wrap a second knock is answered, once for good: a voice almost known, and
  a photo slid under the door (`endlessPlan.door`).
- **The hall.** The co-owners' bikes ring their bells; their mirror shows what the player has on (`household/outfits`).
- **The neighbours' flats.** Each host has a pastime to do with them (`Dressing` 'habit', `HostHabit`, +4 once a game
  day): Mrs Roux's budgies, a round with the Nguyen twins, Mr Haddad's reading corner, Mrs Dubois's tarte. A Game Boy
  mended at the kitchen table can be given to the twins there (`Workshop.give`, +20). The Moreaus' piano plays its
  phrase (`stairSounds.playPianoPhrase`); Mr Martin's Vectrex goes through its screens. Their TV corners are not all
  the same way round: `NeighbourHost.layout` picks one of `NEIGHBOUR_FLAT_PLAN.layouts` (the set, its table and the
  two armchairs moved by `arrange` on the way in, `FlatDressing`; Mr Haddad and Mr Martin have theirs by the window).
  Mrs Roux's second French window is not shown when visiting: the shell has one window and one outlook pane for every
  host (each pane a nested render).
- **The balcony and the yard.** The bistro chairs (riding the set) and the yard's bench are `BenchSeat`s: half an hour
  watching the street, something seen. The yard's ball is kicked across the lawn (`courtyard/YardBall`).
- **The roof's tuner** says when a channel is only snow, and in a power cut that the set is dead; its window goes back to
  "--" when the set is switched off or put on something else (`ChannelDial` follows the TV's state).
