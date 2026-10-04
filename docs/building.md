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
- **Voting.** The ballot is open until the meeting's day ends. The ten households vote by nature (`Voter.leans`, shown
  on the ballot) or by a mind of their own drawn per meeting. The player has one vote, two once Mrs Roux's flat is
  theirs (hers is then no longer cast), plus up to 3 bought votes a resolution at 25 coins each.
- **The day itself.** Six folding chairs and the syndic, M. Bertin, stand in the hall 17-22 (`MeetingSetup`). On a day
  of the estate sale they come only once its tables are cleared (20:00).
- **The tally** runs on the next game day. A tie keeps what stands. The minutes stay on the board 4 days. Every meeting
  that sat is tallied, in order, even when game days jump past several (`coproState.settled` marks the last one), so a
  ballot and its bought votes always count. A ballot off the meetings' days is voided and its bought votes refunded.
- **The result** shows at once (`coproLook`): the walls repainted (uniforms), the runner recoloured or taken up (the
  stone's wear then shows), and plants, two bikes, the gilt mirror, the doormat, the fibre box and the lift's overhaul
  plate shown or hidden. `coproChoice('lift') === 'overhaul'` runs the lift 1.5 times as fast with quiet gates;
  `coproChoice('fibre') === 'yes'` brings the roof's fibre channel.

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
- **When.** On a `storm` spell, a lightning strike between 17:30 and 23:30 cuts the power on about one stormy evening in
  four (a draw per game day). The syndic's note goes up on the board for that day and the next. There is at most one cut
  a game day (`bibliothek.blackout.v1`), and never with the player in the lift's car.
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
  radio (0.45) and anything else through `addFlatNoise`. At 0.3 or more between 22:00 and 07:00, things escalate:
  1. After 40 s, A. Leclerc (under the living room) bangs a broom on his ceiling.
  2. Still loud 45 s later, he comes up and knocks (`DoorVisitor`). Answered: -6 friendship, and a thank-you as he goes
     if it went quiet. Unanswered: a note under the door, -10.
  3. Still loud 90 s after that, the syndic hears of it: a quiet-hours reminder on the board for two days, -12 for him
     and -4 for the Moreaus.
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

The rooms themselves are in docs/zones.md "Mrs Roux's rooms".

## The estate sale

The sale (`estateSale`, `world/estateSale`) happens once, from game day 25 (`ESTATE_SALE`; a save already past it gets it
5 days after first looking). The late Mr Lambert lived on the 3rd floor, courtyard side; he is never seen, and his name
stays on a mailbox. His family clears his flat in the hall for 3 days, 9:00 to 20:00 (`STAIRWELL_PLAN.estateSale`):
- a trestle table in front of the mailboxes with his games face up;
- an open crate past it: three piled up, a grail at the bottom at 0.3 of its price;
- his niece Claire to talk to.

The board shows his death notice from 5 days before, the sale's notice from 3 days before, and the family's thanks after.
Copies are bought like a stall's and haggled with the family's own `EstateDealer` (`ForSaleLike.dealer`: no holds, no
swaps, one haggle a copy). What was bought is not laid out again (`bibliothek.estateSale.v1`). Off its days it places
nothing. Lambert is also the treasure hunt's Henri.

## The neighbours' party

It falls on one game day in 28, and on the real Fête des voisins (the last Friday of May), in the courtyard. Details are in
docs/zones.md "The courtyard". The residents buy the player's duplicates at the market buy desk's top price, so buying
to resell still never pays (docs/economy.md). The tournament gives 3 free plays a party; beating the residents' best pays
60 tickets once. Its book is kept per party (`partyId`): the cycle's by its game day, the Fête des voisins by its real
date, so the prize pays once that date, however many game days it lasts.
