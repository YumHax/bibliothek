# Mémé's visits in depth

What a visit to Mémé's is made of beyond the hello, the envelope and the album (those are docs/story.md "Mémé"): her
presence, what the player does with her, the hints toward the next memory, what the memories leave behind, the album's
other photos, the end of the family's story and the world around her flat.

## The scene (`world/grandma/memeScene.ts`, `memeFeatures.ts`)

`placeMeme` builds one `MemeScene` per build of her flat and starts every `MEME_FEATURES` entry with it. A feature is a
file under `world/grandma/visit/` exporting a `MemeFeature` (`id`, `start(scene)`) whose live part may give
conversation entries (`extras`, asked each time the conversation opens), hear the way in once her hello is out
(`arrived`, with `helloEnds` seconds to wait), the visit's end (`left`: her flat dormant or unloaded; a step onto her landing and back is the same visit, `scene.playerIn` says where the player is) and the frames (`update`). Her lines queue (`say`): two features speaking on the way in take turns. Her body is
`scene.meme` (a `Walker`); a feature that moves her takes her first (`claim(id)`, false while another has her) and
gives her back (`release(id)`, after `reseat()` if she should sit down again). `scene.say(lines, then)` paces her lines.
The words of each feature live in its own file under `src/grandma/` (never in `grandma.ts`, which keeps the hello).

## Hints toward the next memory

What points the player at the album's next photo, always in her words or in a thing, never a list
(`grandma/GrandmaHints.ts`, words in `grandma/hintLines.ts`, saved as `bibliothek.grandmaHints.v1`).

- **The next memory** is the first of `MEMORIES` not seen and still locked, while none is ready. Each visit it stands
  for counts (`target`, `visitsOn`); her tier is the visits less one, up to 2: vague, warmer, then clear (`HINTS`, three
  tiers a memory). The clear tier reads the facts (`HintFacts`: the games counted, a medal or none, the notebook found,
  the grey cart's trail), so she reacts to what blocks ("Seven games, is it? Félix used to say a shelf starts at ten").
- **At hers** (`world/grandma/visit/hints.ts`): a moment after her hello she lets it slip (`arrivalLine`), when the
  tier is new or every third visit; her chat mixes in the tier's lines (`GrandmaTalk.addLines`). Not on the first
  visit, not while a memory is ready (the hello says the album then).
- **She rings** (`world/bedroom/memeRing.ts`, `audio/phoneRing.ts`): a memory ready, 9:00 to 20:00, the phone on its
  nightstand and the player within earshot (`HEARING.visitor`), the bedroom's phone rings, its screen lit; the caption
  says she is calling. Picked up: the conversation opens on her news (`CALL_LINES`); six rings unanswered: her message
  waits, read off the phone at the next click (`MISSED`). Once a memory.
- **She writes** (`world/hallway/mail.ts`'s `grandma` source, from the mat or our flap in the hall): a memory ready, no
  visit for three days and no call picked up about it, her letter in pen with a photo's corner in its P.S. (`LETTERS`).
  Once a memory.
- **The journal** (`upcomingGrandma`'s `hint`, from `GrandmaHints.journal`): "Mémé rang / wrote: more photos on her
  table" for a memory ready she told of; else, once she has said more than the vaguest, her words about the next
  (`JOURNAL_HINT`: "Mémé: “His notebook, at the back of a drawer”").
- `?debug`'s Now: "Mémé rings the bedroom's phone now" and "Mémé's letter in the next post" (a memory made ready first).

## Her presence

Her own memory of the player is `grandma/GrandmaPresence` (`bibliothek.grandmaPresence.v1`: the stories told, the
journal lines told her, Gaspard's last ring, the last visit, what she asked after and when, the game last shown, the
day's tea); her words are `grandma/presenceLines.ts` and `grandma/storyLines.ts`; where she walks is
`world/grandma/presencePlan.ts`.

- **Her way about** (`visit/herWay.ts`, `PRESENCE_PLAN`): `walkHer(scene, spot)` takes her out of her seat (`home()`'s
  way), through the crossing in the middle (`hub`) and the spot's turns (`via`) to it, turned its way; `walkHome`
  retraces it and sits her down. A spot marked `corner` (the tea tray) is reached from her armchair without the hub.
  Paths are straight legs between plan points: furniture moved in `grandmaFlatPlan.ts` means checking these.
- **At the door** (`meme.ts`): on the way in she calls out from her seat, walks to the player (`greet`), claps and
  smiles, says her hello there (the Sunday envelope pressed in the hand), nods and goes back to sit; the features'
  `arrived` comes once she sits again (`helloEnds` 0). Late (`momentAt` late) she stays put: her knees.
- **Sitting with her** (`visit/sitWithHer.ts`): an entry; the player is sat in the visitor's armchair, she tells the
  first story not told that the memories seen allow (`after`), else one again, said so; then half an hour goes in a
  fade (the household's `Pastimes`, the clock wound on).
- **Tea** (`visit/tea.ts`, `TeaSteam`): "Any chance of a cup of tea?", once a day: she puts the kettle on at the
  cooker, a word from the kitchenette, pours at the side table (the tray's cups steam a while), sits down again.
- **Her little jobs** (`visit/herChores.ts`): every minute or two while nobody has her and no conversation is open:
  the canary in its hours, the clock, the curtains drawn at dusk or opened in the morning (the window's
  `setCurtainsDrawn`), the plant by day, the frame over the telephone; a word to herself now and then.
- **Gaspard rings** (`visit/gaspardCall.ts`): once the notebook is found (the row's memory open), at most once a week,
  on half the visits: the rotary set's bell (`audio/grandmaVoice` `playRotaryRing`), her side of the call heard, her
  face falling, a word about him once she sits again.
- **She remembers** (`visit/remembers.ts`): after the hello, one thing true in the save, each now and then: a Sunday
  missed since the last visit, the scarf (worn or not), the cat by name (or the want of one), the game she was last
  shown, a neighbour met (`social/standing` `isMet`) or none yet.
- **The player's news** (`visit/tellHer.ts`): "Guess what!" while the journal's last week holds something she was not
  told (`GrandmaPresence.news`: a game, a gift, a prize, medals, the pennant, the cat, the flat's things, a sale, a
  visit, a party, a neighbour met, one of Félix's games home, the hunt): the most telling first, each once.
- **Her voice** (`meme.ts` `lineShown`, `audio/grandmaVoice` `playGrandmaVoice`): every line she says or murmurs is
  heard as a soft sung babble from where she stands (world bus: the settings' volume).
- `?debug`: "Mémé: her stories and the news told afresh", "Mémé: Gaspard may ring at the next visit".

## Things to do with her

Four entries of her conversation, each at its hour (`momentAt`) and hidden the rest of the day or while another
feature has her (`world/grandma/visit/pastimes.ts`; panels in `ui/grandma/`, made by `createPastimePanels` as
`BuildContext.panels.memePastimes`; words in `grandma/pastimeLines.ts`; what was done in `grandma/pastimes.ts`,
`bibliothek.grandmaPastimes.v1`). Each warms her once a game day (`PASTIME_DEEDS`, reason `pastime-<id>`).

- **The quiz** (her afternoon at the set, once a day): `OldTelevision.showQuiz` holds the set on the game show while
  `QuizPanel` asks five questions (`quizBank.ts`, the ones not asked lately first). A few seconds into each she blurts
  an answer (general knowledge and the old telly she often gets; the video games she only guesses) unless the player
  answers first; the end says who got how many. Four right and ahead of her: two coins "for being clever" (`QUIZ_COIN`).
- **The crossword** (her morning at the table, once a day): `CrosswordPanel`, the paper's clue and the word's squares
  with the letters she has (`crosswordBank.ts`); typed with the letter keys (`KeyboardEvent.code`) or the letters under
  it, Backspace rubs out. Two misses and she finds one more letter; "Leave it to her" ends it.
- **The cards** (evening, as often as liked): she walks from her armchair to her place at the table
  (`GRANDMA_FLAT_PLAN.pastimes.toTable`) and `CardsPanel` deals crazy eights (`crazyEights.ts`: match the suit or the
  rank, an eight names the suit, nothing to play means a draw, first out wins). Once a game she may slip down a card
  that does not match and own up. The tally on the back of her envelope is kept; after, she walks back to her knitting.
- **The wool** (evening, once a day): `WoolPanel`, the skein on the player's hands and the yarn tightening as she
  pulls; a give of slack (the button, Space, Enter) keeps it running, too tight it snaps and she ties a knot (no
  harm). She talks the while. `WOOL_FOR_SCARF` (3) sessions run to their end knit the player's scarf
  (`GrandmaVisits.knitScarf`, the wardrobe's `memeScarf`), even before she is Close; after it the wool goes to socks.

`?debug`: "the quiz, the crossword and the wool open again today", "one more go at the wool and the scarf is done".

## Sunday lunch, recipes and favours

One feature, `world/grandma/visit/rituals.ts` (`ritualsAtHers`), runs her ways in turn after her hello: the day's
occasion first, then lunch on a lunch day, else (or once lunch is cleared) her favour. The rules and her words are in
`src/grandma/` (`lunch.ts`, `recipes.ts`, `favours.ts`, `occasions.ts`), what is kept in `GrandmaRituals`
(`KEYS.grandmaRituals`; lunch eaten today is `time/OncePerDay`'s `grandmaLunch`), her spots in `world/grandma/ritualsPlan.ts`.

- **Lunch** (`visit/lunchAtHers.ts`, `lunch.ts` `LUNCH`): on a Sunday, and on 24 and 25 December (real date), from 11:30
  to 14:00. Coming in then, the envelope is not given at the door (`GrandmaVisits.holdEnvelope`, asked by `arrive`);
  she calls the player to the table and walks to her chair (`herWay`, `RITUALS_PLAN.lunch.herChair`; lunchtime coming
  while the player is in, she calls them then). The chair at the table's end (a `Hotspot`) or "Sit down to lunch" sits
  the player (`RITUALS_PLAN.lunch.seat`): the blanquette served (`SundayTable.serve('served')`: the lid off, rice and
  sauce on the plates), three of her lines, then the meal in a fade (`Pastimes`, the clock to 14:15), the tart
  (`serve('dessert')`), the envelope (`takeEnvelope`, the reward banner), on Christmas her present
  (`LUNCH.christmasCoins`, once a year), a recipe the first times, and she clears up and goes back to her seat. Standing
  up before the fade, the place stays laid. Leaving without eating, the envelope is in the coat pocket (a banner).
  The decor lays the table on Christmas too (`furnishGrandmaDecor`, `lunchOf`).
- **Recipes** (`recipes.ts`, `visit/teachRecipe.ts`): the blanquette at the end of the first lunch, the yoghurt cake at
  the second, her plum jam with the thanks for the first favour; a `read` card in her hand each time. At home, once
  one is taught, her recipe tin on the kitchen's left run (`world/kitchen/memeRecipes.ts`, `MemeRecipeThings.ts`,
  `KITCHEN_PLAN.household.recipeTin`) cooks the next of them in a fade (`Recipe.minutes`); the dish stands before it
  for `RITUALS.dishDays` (`MemeDish`): a friend who drops by has some like the cake (`bootstrap/worldLife` hosting),
  and a portion goes in the bag for her ("Give her some of your blanquette", her verdict). One dish out at a time.
- **Favours** (`favours.ts`, `visit/favoursAtHers.ts`): from her second visit, `RITUALS.favour.gapDays` after the
  last was done, one at a time, asked after her hello: a thump on her set (a `Hotspot` round it), the clock run down
  (`LongcaseClock.setStopped`: no swing, no tick, still hands; wound with her key, a `Hotspot` on its hood), a croissant
  from Front Street's bakery (`pocket`'s croissant, given in the conversation), Félix's Mega Drive from her cupboard
  (`Workshop.add`, asked only once the kitchen has its table: mended at home, or sold, she knows on the next visit). On
  a later day she reminds the player. Done: her thanks, `RITUALS.favour.coins` pressed on the player (a slip), the jam's
  recipe the first time.
- **Occasions** (`occasions.ts`, `visit/occasionsAtHers.ts`): her birthday is her card's (`social/mood.isBirthday`,
  game days; the journal and "Wish her a happy birthday" are the social layer's): her cake with its candles on the table
  (`SundayTable.setBirthday`), her words on the way in, and a present that day (flowers, cake, the latest game, a
  portion) moves her. Christmas (real date): her tree in the corner from December to 6 January (`treeSeason`; put aside
  while a memory plays), her words and lunch on the 24th and 25th. All Saints: the chrysanthemums on her table from 31
  October to 3 November, her words on the 1st (she went to see Félix). Each occasion's words once (`GrandmaRituals.keep`).
- **Social and journal** (`social/grandmaRitualsSocial.ts`): lunch, a favour, a portion and each occasion warm her once
  a game day; the journal lists the open favour and Christmas lunch from 20 December.
- **Debug** (`grandma/ritualsDebug.ts`): lunch again today, every recipe taught, her ways reset, her birthday, Christmas
  or All Saints forced today, and back to the calendar.

## The album's other photos

The album (`ui/memories/AlbumPanel`, its pages from `world/grandma/albumSpreads`) is spreads of eight fixed slots
turned with "Back a page" / "Turn the page" (the arrows, a pad's d-pad), opened where something new waits. Félix's
years come first, every print in the order of its year: the memories (`MEMORY_NOTES` years), the family's prints and
the snapshots (`grandma/snapshots.ts`), filled out to a whole spread; then the present's spread: the player's prints
and, in its very last slot, the epilogue's. A slot never moves; only what is in it changes. An empty memory's corners
carry its name pencilled in (`MEMORY_PENCIL`: "Wednesdays…", never how it comes); an empty snapshot's are bare.

- **A print looked at close**: any print but a memory just found (that one plays at once) opens over the spread, large
  on the left page, her words a line at a time on the right (every line holds its place from the start); clicked, or
  "Turn it over", it shows its back: a date, a place, her line (`back`). A memory's back nudges toward the next memory
  in her words, never as a list (`MEMORY_NOTES`); a memory seen has "Watch it again"; Esc steps back to the pages.
- **The family's prints** (`FAMILY_SNAPS`): the prints of her walls (`familyPhotos`, drawn by `world/grandma/
  albumStills`), in the album from the start, with her words and backs.
- **Snapshots** (`SNAPSHOTS`, 19): photos with her words, drawn in the same hand (`albumStills`, the family's figures
  and tonings by year). `AlbumFinds` (`bibliothek.albumFinds.v1`) finds one when its `found(facts)` holds (visits, a
  memory seen, how close she is, a season, flowers or cake given once, a game shown), looking on the way in, on a gift,
  on a memory seen and when the album opens; found, it slips out of the pages until looked at, the album's label says
  "look", and on the way in (no memory waiting) she says she came across something (`visit/albumGifts`).
- **A game that rings a bell**: five games of Félix's notebook have a snapshot (`Snapshot.game`). Shown to her (the
  gift "Show her …", the latest game come in; `GrandmaEvent` gift carries its id), she says what it brings back and the
  photo is in the album.
- **The player's prints**: every photo mode shot is also kept small (`photo/photoRoll`, the newest six, 320 px JPEGs,
  `bibliothek.photoRoll.v1`). With some on the roll her conversation has "Give her your photos": she glues them all
  in after Félix's pages (`grandma/albumPrints`, `bibliothek.albumPrints.v1`, her captions in turn); past seven the
  oldest go to her drawer (out of the save). With none of the player's yet, on the third visit and every fifth after,
  she asks for photos of the flat.
- **The epilogue's slot**: the print `epilogue` (`EPILOGUE_PRINT`, glued by the end of the story) fills the album's
  last slot; until then it is bare corners like any other.
- `?debug`'s Now: every snapshot found, or none (`albumDebugEvents`).

## What the memories leave behind

**Keepsakes** (`grandma/keepsakeLines.ts` for the words, `grandma/Keepsakes.ts` for the save, `KEYS.keepsakes`). A
memory seen for the first time, she gets out the thing it was about (`world/grandma/visit/keepsakes.ts`: her
`after` line first, `AFTER_FILM` s, then her lines, a reward banner, the thing given); one owed from before (a save
with memories seen) comes on the next way in. Christmas 95: the sports pages the Game Boy came in; Wednesdays:
Félix's cushion; Three letters: the photo of the screen from his wallet; Money asleep: Gaspard's letter to Félix;
The last Wednesday: the suitcase label; Lot 1 to 412: the sale's catalogue; A day late: his key ring; every lot home:
his roll of F.A. stickers.

**At home** (`world/keepsakes/placeKeepsakes.ts`, spots in `ROOM_PLAN.keepsakes`), each the moment it is given (the
flat's zones never unload): the small ones on **Félix's shelf** (`FelixShelf`, two walnut boards on the front wall
over the radiator, put up with the first), each in its spot and riding it (`KeepsakeProp`: caption its name, a click
reads its card); the cushion on the TV rug, where the child sat. The shelf and the cushion are the flat's furniture
(`Furnishings.register`, keys `felixShelf` / `felixCushion`): right-click to move them, the shelf along any wall.

**Félix's lots** (`economy/felixLots.ts`: `FELIX_LOTS`, 24 seed games numbered within 1 to 412, Mémé's pencil
`note` and her `told` line; the Christmas Game Boy is not one, it is "The end of the story"'s). His copies carry
`Game.felixLot` (his round F.A. sticker): complete, a keepsake (`Transactions.isKeepsake`: never sold or swapped),
the game panel's "Félix's" row, a stall tag band `F.A. · LOT 74` and its panel line. They turn up only for a game the
player does not own (theirs or his), drawn from the day (`felixLotOn`, odds `FELIX_TURNS_UP`): on its platform's
stall some market days (`dayDraw.placeFelix`), among the saleroom's lots some sale days (the last ordinary lot, the
auctioneer's `FELIX_BLURB`), in Crane's suitcase some of his Front Street days, and, once the catalogue is given, in
Lenny's house-clearance small ad (`story/felixLotsTrail.ts`: a scripted ad with `felix: true`, three lots). A copy of
his bought back is one of his games home for memory 6 (`GrandmaVisits.felixGameHome`), as a notebook game is.

**The catalogue** (`grandma/catalogueCard.ts`): read from the shelf, his lots in order with her pencil and a tick
by each one home (`lotsHome` of the collection: nothing else is counted). At hers, "Lot 74 is home!" (an entry of the
conversation while one is home she was not told of, the lowest first) gets that lot's line; the last one told, after
`AFTER_LAST_LOT` s she gives the stickers. A plain copy of one of his games already owned keeps his from turning up:
selling it at the WE BUY desk frees the lot.

`?debug`: every keepsake given; the owned copies of his lots made his; every lot told but the first (or none again).

## In the films

- **Cues** (`MemoryCue` in `memories/memoryReel.ts`, a scene's `cues`): at `at` the picture holds on the moment (the
  film's clock waits, the camera keeps breathing, the music runs on) and a prompt with its key shows over the narration
  (`IntroScreen.cue`). The player does it with the action key (E), Space, Enter or a click, `presses` times; or types
  three letters (`input: 'initials'`: the letters of this keyboard, `keyLabel`, Backspace, Enter). After `wait` seconds
  (6; the initials 20, each key giving the time back) it goes on by itself. Either way `done(byPlayer)` plays the
  people's beat (`memoryStage.beats().now`, or `skip` for a moment let pass). Esc still skips the film, the cue with it;
  a replay has its cues again. The keys are taken in the capture phase while a cue waits (E there would arm the skip).
  - Christmas 1995: "Tear the paper" (the `WrappedParcel` swapped for the `TornParcel`, the hop).
  - Wednesdays at Félix's: "Blow into the cartridge", twice (a blow each press).
  - Three letters: "Type your three letters" (offered: the ones typed before, else the arcade's, else AAA).
  - Money asleep: "Look up from the game" (4.5 s): the child looks at Félix on his feet, or never leaves the screen.
  - The last Wednesday: "Promise to come back" (the nod).
  - A day late: "Take the keys" (her palms empty, her hands down, a small smile).
- **The initials** (`memories/playerInitials.ts`, `bibliothek.initials.v1`): kept once typed. The arcade's spaceships
  cabinet (`invaders`) has that Saturday's record on its table from then on (`RECORD_OF_2003`: the player's letters
  at 3,150 in green, Félix's FLX just under at 2,950), read live through `ArcadeScores.setPast` and never saved with
  the arcade's; and the arcade's initials screens start from them while the player never signed there
  (`ArcadeScores.offerInitials`). Wired in `bootstrap/services.ts`.
- **Her emotion after** (`memoryStage.backInTheRoom`, each reel's `returned`): after the row, the sale and the keys
  (`'hard'`) she is shaken under the last black (a long frown), lifts a hand to her glasses as the black lifts, sighs,
  then says her line a sentence at a time, three seconds apart; after the last Wednesday (`'soft'`) a sigh and a small
  smile first. The other memories: her line at once. Her timers are her flat's (`Present.after`, `zone.after`).

## The end of the story

How far it has gone is `family/FamilyStory` (`bibliothek.familyStory.v1`, `services.family`, `BuildContext.family`;
numbers in its `FAMILY`); the words are `grandma/gaspardLines.ts` (`GASPARD_TALK`) and `grandma/epilogueLines.ts`
(`EPILOGUE_TALK`). It writes its own journal lines (`FamilyStory.note`).

- **Gaspard at her Sunday table** (`world/grandma/visit/gaspardSunday.ts`, spots in `gaspardPlan.ts`): once memory 4
  (row) is seen, his first Sunday after it, then now and then (`gaspardOdds`, `gaspardCasual` such Sundays) he is on the
  door-end chair at lunch (`gaspardHours`) when the player comes in: a word after her hello, a conversation of his own
  (`social/people/family.ts`, `GASPARD_ID`: not family, he can go cold; portrait `familyLooks.gaspardLook`), "About
  the sale…" dodged while memory 6 is unseen. After `stay` seconds (not while talking) he checks his watch and leaves
  by the landing door; she says a word after him. Hidden while a memory is filmed.
- **The reckoning**: once memory 6 (sale) is seen he is there every Sunday until it is had out (`reckoning`). "We need
  to talk about the sale." opens three ways, four with the sale's catalogue given by her (`Keepsakes` 'catalogue'):
  she saw it from the back row, or the catalogue (she stands up, "Gaspard. Sit down.", he says sorry: `apologised`);
  he sold to Crane (she shows him the door, "Odette remembers": `gone`); say nothing (he leaves, she speaks after:
  `silent`). Played a `beat` apart after the conversation closes; Mémé is taken (`claim('gaspard')`) while standing.
  Settled for good: the journal's headline, his memory of it, her warmth when the player spoke up. He never comes again.
- **The Christmas Game Boy** (`world/grandma/visit/gameBoyReturn.ts`, `family/craneGameBoy.ts`): memory 6 seen, she
  tells on the way in that lot one went to Victor Crane (`trail`). His conversation, wherever met, then has "The Game
  Boy from lot one?": a close friend gives it, anyone else hears a price by his tier (`PRICE`, never more than first
  named) and gets "Buy back Félix's Game Boy". It comes home as Félix's copy of Tetris for the Game Boy (`gb-tetris`,
  a Tetris already owned becomes it): his words inside the lid (the copy's `past`), its receipt, a big reward banner.
  At hers, "Give her the Game Boy": she holds it up in her seat (`memoryStage.holdHandheld`) as the child did, three
  lines, "Keep it. It was always yours."
- **Her visit to the flat** (`world/visitors/gathering/MemeVisit.ts`, `memeVisitPlan.ts`): the Game Boy given back, or
  the keys handed over in the album (memory 7), she announces it at hers ("My knees and I", `planVisit`: the next
  Saturday); the journal shows it coming (`upcomingFamily`). The gatherings' director starts it on that day in
  `visitHours` (it holds the day: no friend rings first): up the stairs slowly, the bell, a word at the door and on the
  kitchen, two shelves (Félix's notebook games named by their boxes, `FelixNotebook.isHis`) and the window, an
  armchair (a word for the cat or the TV), then she asks for her photo. "Take her photo for the album" (or a click on
  her without the social layer) renders the frame as the player sees it, 4:3, into `albumPrints` as the epilogue's
  print (`EPILOGUE_PRINT`), with the shutter. She waits for it up to `waitPhoto` s, then takes the 38 home. Nobody
  answering, she tries the next Saturday (`missed`); a planned day gone by moves to the next (`tidy`). After her first
  visit she drops in some Saturdays (`againOdds`, `againGap`).
- **Debug** (`family/familyDebug`, the panel's Now): Gaspard at her table today (memory 4 seen; 6 for the reckoning),
  the Game Boy's trail told again on the next visit, the Game Boy home to give her, her visit as soon as the player is
  home.

## Around her flat

Where the 38 lets the player off and what is met on the way up (`src/world/linden/`; the zones: docs/zones.md
"Mémé's flat").

- **Linden Avenue** (`furnishLindenAvenue`, `LINDEN_PLAN`): the stretch of the avenue her window paints
  (`LindenView`), walked between the works' fences (`WorksFences`, x ±18, WORKS AHEAD), the facades going on past them
  to the bends. Her side: the pharmacy, **number 14** (`herDoor`: a travel door up to her landing; `lindenHers` has a
  hole where it stands), **Lebrun's** bakery under her, the **dépôt-vente**; across: LE TILLEUL café, books, the
  tabac, and **line 38's stop** (`LindenStop`: the shelter and the pole; clicked, the bus back to Front Street at any
  hour, the fare paid on the way out covering it). Plane trees, cast-iron lamps on a crook, cars parked both sides
  (`LindenCars`, the street's models, solid), bollards (`Bollards`) along the flush kerbs, the zebra from her door
  across (`LindenGround`); the avenue's air from both ends (`DistantAvenue`).
- **Lebrun's** (`BakeryCounter`, 7:00 to 19:30, shut on Mondays): its door sells a baguette (`BREAD.price`, one
  carried at a time), its window a croissant (the pocket's, `errands`).
- **Her bread** (`grandma/breadErrand`, `world/grandma/visit/bread`, `bibliothek.grandmaBread.v1`): now and then on
  the way in, after any hint, she asks for a baguette from Lebrun's next time (every third game day or so, never a
  Sunday, not within `BREAD.rest` days of the last). A baguette carried is an entry of her conversation ("Give her the
  baguette"); asked for, she pays it back with something on top (`BREAD.payBack` coins), else a thank-you.
- **The dépôt-vente** (`DepotTable`, `bibliothek.lindenDepot.v1`): a trestle on the pavement with four games the
  neighbours left, drawn from the whole index each Monday (`MarketStock.randomGames`, seeded by the week), at a coin
  or two over the flea market's bin price by their state (`DEPOT_WHERE`, a flat price: its receipt caps a resale like
  the bin's); bought like any market copy (`ForSaleBox`), gone for the week.
- **Mrs Bassot and Biscotte** (`DogWalk`): the neighbour downstairs at number 14 walks her dog along her side at her
  hours (`LINDEN_PLAN.dogWalk`: out of the door and back, once a slot, while the player is on the avenue); clicked, a
  word (Odette, the radiator, the postman). Biscotte is heard barking down the well from the landing (`DoorDog`).
- **Her landing** (`furnishLindenLanding`, `LINDEN_LANDING_PLAN`): her door (a doorway into her flat), Mr Ferrand's
  across (`FerrandDoor`: knocked on, his radio answers), the glazed stairs door down to the avenue, the light on its
  button. Her hello is said as the player steps into her flat from it, as before (`Arrivals`, occupancy).
- **The 38's regulars** (`ui/busRide/busRiders`): drawn on the ride by the hour and the day: the man with his
  baguette in the seat in front (early morning, early evening), the schoolgirl with her headphones by the pole (school
  days' runs), the lady with her tartan trolley (market mornings).
- **Mémé on the 38** (`grandma/sharedRide`, `bibliothek.sharedRide.v1`): one morning in four or so (9:30 to 12:00, not
  a Sunday, not a morning the player already found her at home), she is on the bus there, turned round in the seat in
  front to wave (decided as the ride starts, `bootstrap/player`'s interlude, shown or not); off the bus she stands by
  the player at the stop, says a word and walks home ahead of them over the zebra (`MemeOffTheBus`, once a shared
  ride). `SharedRide.cameWith(day)` tells a visit she came in with the player that morning (her hello may say so);
  `seenHome` is told by the bread's feature on the way in.
- **Debug** (the panel's Now, `lindenDebugEvents`): she wants a baguette now; she is on the next 38 to hers.
