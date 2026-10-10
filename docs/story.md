# The story (`src/intro/`, `src/story/`)

Two threads: the frame (whose flat this is, why it is bare, what the game is for), opened by the cutscene, and the lost
prototype's trail inside it. The frame's opening is built; the rest of the frame is the plan the systems already there
are pointed at, one hook each, written here so every later feature tells the same story.

## Uncle Félix's flat (the frame)

**The premise.** The player inherits the flat of their uncle, Félix Aubry, who collected video games for forty years.
They arrive a day late: the family has had the contents sold at the saleroom, and the removal lift is still at the
window. One game survived, fallen behind the bookcase (the starter game). The bare flat (docs/economy.md "The bare
flat") is not a starting rule any more but a loss, and every purchase is putting the place back. The rooms remember
him: the pale ghosts of his frames on the walls, each with its nail, and on the living room's parquet the glossier
rectangles where his sofa, his reading chair and a low chest stood (`DEFAULT_ROOM.finish.footprints`).

**Why not a burglary.** A theft asks for the police, not a bookcase; a sale gives the copies a trail (the saleroom, the
rival collector, the stalls) and no villain the cosy building has to live with.

**The goal.** Three layers, the sandbox never ends:

- **The dream room.** The flat as Félix had it, seen in the opening, is the finish line the player can picture. Planned:
  the dream comes back at night (the bed's dreams, `household/dreams`) with what the player has put back lit up.
- **The open house.** Planned: once the room is full enough, the collectors' club visits (docs/visitors.md), the
  friends and the neighbours come: the credits scene, on the gatherings already built.
- **The prototype.** The lost cart's trail (below) becomes Félix's unfinished hunt: the clipping on the mat is
  addressed to him. Its demo rolling its credits on his TV is the true ending.

**The acts**, each on systems that exist (planned unless said):

1. **Arrival** (built: the opening cutscene). The dream, the waking, the first day's to-do list (`onboarding/`).
2. **The street.** The rival collector (`economy/rivalCollector`, docs/economy.md) bought most of the lot at the sale:
   his gloating is the first line he says. A copy with Félix's sticker turns up now and then on a stall, at the
   saleroom or in the trader's suitcase: buying it back is a keepsake (like the prototype, the WE BUY desk refuses it).
3. **The building.** Mrs Roux kept a box of his for safekeeping (her move, docs/building.md), the cellar holds his
   crate, the sixth floor's treasure hunt is his old game with the neighbours' children.
4. **The trail and the open house.** The prototype, then the club's visit.

Running under all four, **Mémé's album** (below, "Mémé"; its first memory built): the player's childhood with Félix,
a memory at a time as the game goes on, and how the sale really happened (Gaspard, Crane).

### Félix's notebook (`story/FelixNotebook`)

What the days after the first one are for, in his hand. From market day 2 the first fitted drawer of the flat opened
that holds paper has, at the back, a school exercise book: MY GAMES, the twelve he would have saved from a fire (seed
games across the consoles, a line beside each). Picked up (`HomeLife.takeFind`, a banner and a `read` card,
`rummageLines.FELIX_NOTEBOOK`), every one the player lacks goes on the wishlist (`CollectionStore.want`: the stalls'
star, the wish cards, the dreams, the rival's spite now have something to read). Each one bought back is ticked
(`onTicked`): a banner with his line (the last a big one), a headline in the journal, and the journal's page keeps the
notebook as a trail (`file()`: his lines for those home, the next three to look out for). Saved as
`bibliothek.felixNotebook.v1` (`{ found, ticked }`). No reward but the line: the frame's "putting the place back", one
game at a time.

**The cat.** Félix's cat ran off when the flat was emptied: the stray on Front Street (`street/life/StrayCat`) is him. Planned:
trusted all the way, he comes home instead of a cat bought at the pet shop.

### The opening (`src/intro/`)

A minute of film before the first step in the flat, on a new game only (no progress, not `?debug`; `?intro` plays it
over any save, to watch it again). Played once: `bibliothek.intro.v1`.

| Shot | What is seen | What is said |
| --- | --- | --- |
| Black | the cinema bars close in | "My uncle Félix collected video games for forty years." |
| The room | a slow dolly in from the window corner: every bookcase full, the armchairs, the lamps lit, in a warm haze | "Every shelf full. Every lamp lit." |
| The shelves | a glide along the back wall, close, shallow focus on the boxes | "He left it all to me." |
| The corner | across the room to the TV, past the armchair | "By the time I got the keys…" |
| The sale | wide and still: the rows go out one after the other, the furniture shrinks away, the light cools | "…the family had sold the lot." |
| Black | | "One game was left. It had fallen behind the bookcase." |
| Morning | on the mattress, looking up, then sitting up in the bare bedroom; the title | BIBLIOTHEK, "Get up" |

How it is made:

- **The furnished flat** is the bare one with everything staged shown (`world/build/owned` `stagedPieces`: what is not
  bought hangs where it will stand, hidden with its lights kept dark), the living room's bookcases stood to every slot
  (`Shelving.setCapacity`) and filled with boxes that are not games (`world/shelving/DreamShelves`: one merged mesh per
  row over an atlas of the baked fronts, `public/boxart`; a painted placeholder where one has not loaded). The cat is
  left out (it would stand frozen). Nothing is bought, nothing collides, nothing is saved.
- **The sale** (`DreamFlat`, which also shows and puts away the dream): the farthest things first, the rows fade (their
  own materials), each staged piece rises a little and shrinks to nothing with its lamp dimming, each unbought bookcase
  after its last row; then everything is staged again exactly as it was (pose, lights, `setShownKeepingLights`).
- **The camera**: the player is parked like photo mode (`sit`, instant) and the cutscene writes the camera each frame
  (`IntroCutscene`: a timeline of shots, eased paths with a breath of drift, none with reduced motion, a lens per shot
  through `PostFx.setLens` with a focus pull on the shelves, a grade per beat: the dream's warm look, the sale's cold
  one, then the zone's own). The shots were checked against the room's furniture from its plan: every camera stays
  20 cm or more clear of the plants and lamps.
- **The clock** is the music's (the audio clock) whenever there is sound, so a stalled frame never leaves the picture
  behind the score; the dream's covers are uploaded only while the screen is black, where a hitch shows nothing.
- **The words and the bars** are DOM (`ui/intro/IntroScreen`), above the HUD, which hides under `body.intro`.
- **The sound**: the room is ducked; a music box and a pad (`audio/introScore`) on the foreground bus.
- **Skipping**: Esc, Space, Enter, a pad's A, B or Start pressed once arm the Skip button ("Again to skip"), a second press within 2.5 s skips (a stray key never costs the film); the Skip button itself skips at once. A skip goes straight to the morning, sat up, the title and "Get up" ready, the narration's last line ("One game was left…") put on the title's line. Once "Get up" shows, the same keys but Esc press it.
- **Entering**: the start card's button, its Enter and a pad's press all go through `PointerLockFlow.enter`, which asks
  the intro first (`setGate`); "Get up" is the click the mouse lock needs, and the player stands by the mattress.

## Mémé (`src/grandma/`, `src/memories/`, `world/grandma/`)

The family's side of the story, and the player's own past. **Mémé** is Odette Aubry, Félix's mother and the player's
grandmother, in her flat across town: the only place bus line 38 takes the player (`STREET_PLAN.busRide`, 2 coins,
the way back included), somewhere they cannot walk to. **Gaspard** Aubry, Félix's elder brother, had her sign the
sale's papers "to keep it simple" and sold the lot on the quiet to Victor Crane, the rival collector (why Crane holds
most of it): she went through the sale, he arranged it. The player learns it late, through the memories. The player's
own parent (Félix's other sibling) stays in the background, named in passing, never shown.

- **The visit** (`GrandmaVisits`, `bibliothek.grandma.v1`: visits, the last Sunday envelope, memories seen, what she
  was given, the news told). The bus runs to her in her waking hours (`busRide.destinations[].hours`, 8:00 to 21:00;
  shut, its caption says she is in bed). Her day (`GRANDMA_DAY`, `world/grandma/meme.ts`, moved only while the player
  is away): the paper at the table in the morning, the set from her armchair in the afternoon, knitting in the
  evening, sleepy after 20:15. On the way in (`GrandmaTalk`): a hello for the hour, or once each the news she has heard
  (games, a medal, the notebook, Crane beaten, the grey cart's trail); on a **Sunday**, once, lunch and an envelope of
  `GRANDMA.sundayCoins` (10) coins paid at once with a reward banner (`envelopeSale` on a sale day), the first visit
  included; then the album line whenever a memory waits. `?debug`'s Now: Mémé as on the first day, every memory ready,
  every memory seen, the Sunday envelope again (`grandma/grandmaDebug`).
- **Talking to her**: a click opens the conversation (`talkHook`, person `meme`, place `theirFlat`); her opening and
  the entry "Tell me about Félix?" draw her chat from a shuffled bag (every day's, then Gaspard's pressure once memory 4
  is seen, the papers and Crane once memory 6 is, peace once memory 7 is; late, the last bus first). **Gifts** are an
  entry of the conversation, named for what the player has for her (first of: a florist's bunch from the pocket, once a
  day; a slice of the cake out at home, once a day; the latest game come into the collection, shown once): her thanks
  and a gesture (`GrandmaVisits.forHer` / `give`). Without the social layer the click hands the gift over itself (the
  caption says what) or says a line. Her visits, gifts and memories are heard through `GrandmaVisits.subscribe`.
- **In the social layer** (`social/people/family.ts`, `social/grandmaSocial.ts`; docs/social.md "Mémé"): her page in
  the People book and her number in the phone from the start; family (`PersonCard.family`), so her warmth never drifts
  nor falls under where it starts. Visits, Sunday lunches, gifts and memories warm her; close, she knits the player a
  scarf (`household/outfits` `memeScarf`). Rung up she answers in her own words (the album, Saturday's "come for lunch
  tomorrow", her nightie from 21:00 to 23:00).
- **In the journal** (`upcomingGrandma`): "Sunday lunch at Mémé's, then the sale" from the Friday until lunch is
  eaten (every Sunday is the saleroom's sale day, 9:00 to 22:00; lunch is at noon), and "Mémé found more photos" while
  a memory waits.
- **The ride** (`ui/busRide/`, `audio/busRideSounds.ts`): line 38 either way plays over the travel curtain
  (`Travel`'s `interlude`, wired in `bootstrap/player.ts`) while the far zone builds: about ten seconds on a seat by
  the window, the town going past in three depths in the light of the hour, the display, the STOP bell, the doors.
  Esc, E, Space, Enter or a click skips it; with reduced motion there is only the curtain.
- **Her flat** (`world/grandma/furnishGrandmaDecor.ts`, spots in `GRANDMA_FLAT_PLAN.dressing`): the window shows
  Linden Avenue (`LindenView`, painted in `lindenPainters`: a side street to the town, parked cars and a car each way,
  stone facades lit at night, the plane trees by season, the weather; heard far below, `DistantAvenue`); the family's
  photos (`familyPhotos`), the longcase clock, the china cabinet and its bibelots, the kitchenette (the kettle whistles
  when a visitor comes by day, `kettleHours`), her old set (on from when she leaves the table till 22:00, `tvHours`; a
  click switches it till her next change of hours), doilies, tea on the side table, the throw on her armchair, the
  canary (`canaryHours`), the cloth with Sunday's lunch laid on it (else the fruit bowl), loose boards that creak; the
  rug soft underfoot (`rugsUnderfoot`). What 1995 did not have (`modernKinds`, that Christmas's photo) is handed to the
  projector (`MemoryProjector.markModern`).
- **The memories** (`MEMORIES` in `memories.ts`), each unlocked by something done in the game and played from the
  photo album on her table (`world/grandma/albumWiring`, `PhotoAlbum`, its cover swinging open): the very first plays
  at once; after that the album opens (`ui/memories/AlbumPanel`): a print per memory seen (a frame of its first play,
  `MemoryProjector.still`, else a drawn sepia print, `albumPhotos`) with its title in her hand, the one ready slipping
  out of the pages, empty photo corners for the rest (nothing says how they fill); a print clicked plays it. Only a
  memory with a reel is ever ready (`GrandmaVisits.setFilmed`, from `REELS`). A memory is a film like the opening
  (`memories/MemoryFilm`: the `IntroScreen`'s black, bars and narration in her voice, the waltz recoloured per memory,
  `IntroScore.startMemory`, the grade `MEMORY_LOOK`) opened as a panel. Under the first black the zones it is filmed in
  are built and held loaded; each scene is staged as the film reaches it and struck under the black after it; under the
  last black the player stands by her table turned to her, and she says the memory's `after` line (`againAfter` on a
  replay). Esc or E asks to skip, twice skips; seen to the title, it is marked seen. While one plays,
  `MemoryProjector.filming` is true (her arrival, the dressing's and the hallway's `Homecoming` ignore the camera).
- **The family's looks** (`world/grandma/familyLooks.ts`): Mémé today and in the nineties, Félix at thirty-five and
  at fifty, Gaspard, the player at six, nine, fourteen and eighteen: drawn looks with what makes them them pinned on
  top, the same people in every memory.

The memories, from the childhood to the arrival:

| # | Memory | Filmed in | Unlocked by |
| --- | --- | --- | --- |
| 1 | **Christmas 1995** (`christmasMemory`): the player is six, Félix's parcel torn out of the sports pages on the rug, the red cloth, the curtains open on the snow; the Game Boy held up to the face (`memoryStage.holdHandheld`); he pretends he cannot play so the child can show him | Mémé's flat, the tree in the corner | the first visit |
| 2 | **Wednesdays at Félix's** (`wednesdaysMemory`): the child at nine on a cushion before his set, blowing into a cartridge; Félix in the armchair reading the manual, the curtains drawn against the glare | Félix's flat (the opening's dream of it, `felixFlat`) | 10 games |
| 3 | **Three letters** (`arcadeMemory`): Félix takes the teenager on a Saturday, the record on the spaceships cabinet beaten, the initials typed in | the arcade (LexiPunk, the tournament's board and the medals put aside) | the first arcade medal |
| 4 | **Money asleep** (`rowMemory`): a Sunday supper in 1999 gone cold, Gaspard: "your cartridges are money asleep"; Félix stands up, "they're for the kid"; the child of ten in the armchair hears it all | Mémé's flat | Félix's notebook found |
| 5 | **The last Wednesday** (`leavingMemory`): the player at eighteen, suitcase by the door; "when you're settled, half of these are yours"; then Félix alone at the window in the rain | Félix's flat (as for 2) | 50 games, or a club set |
| 6 | **Lot 1 to 412** (`saleMemory`): the sale as Mémé saw it from the back row, Gaspard checking his watch, Crane in the front row bidding on everything: arranged between them | the saleroom, Félix's boxes by the rostrum | a game of Félix's notebook bought back (the sticker's copies are not built) |
| 7 | **A day late** (`keysMemory`): this year, Mémé holds Félix's keys out to the player (the camera); then our landing, the push in to the door, ending on the opening's own line "By the time you got the keys…" | Mémé's flat, then our landing | the six before it seen, and the prototype found or 120 games |

### Adding a memory

1. **The data** goes in a plan file of `world/grandma/` (a `<name>` block in `grandmaFlatPlan.ts` for one filmed at
   Mémé's, else its own `<name>MemoryPlan.ts`): shots, lines, the people's spots and beats' times, in the **scene's
   zone's local metres** (copy the numbers from the zone's plan: a grandma file never imports another zone's plan).
   Shots are `MemoryShot` (`from`/`to` on the film's clock, camera and look-at eased, `fov`, `lens`); scenes follow on
   the same clock, the first ~0.8 s of a scene under the cut's black (`SCENE_CUT`), a cut inside a scene dips 0.35 s.
   Lines are `MemoryLine`, in her voice.
2. **The reel builder** (`<name>Memory.ts`, see `christmasMemory.ts`) returns a `MemoryReel`: `id` (the `MEMORIES`
   id), `title`, `tagline`, `back`, `lines`, `scenes`, `score` (`waltz`, `lullaby`, `minor`, `chiptune`), optional
   `look`, `after` (`{ zone: 'grandmaFlat', at, yaw }`, the yaw turned to her, `memoryStage.turnedTo`) and `returned()`
   (Mémé present again, `reseat()`, `present.afterLine`). It takes `albumWiring`'s `Present`.
3. **Each scene** is `{ zone, shots, light?, stage(set), beat?(t), strike?() }`. `light`: `curtains`, `lamps`,
   `weather` (shown settled; the clock never moves), put back after. `stage` gets a `MemorySet`: `place` / `placeAt`
   (tagged `userData.memoryCast`, struck by themselves), `hide(...objects)`, `world(x, y, z)`, `viewer`, `dream()`
   (Félix's flat as the opening shows it). People are `new Walker({ viewer: set.viewer, seed, look })` with
   `familyLooks`, `sit` / `stand`, beats fired once from `beat(t)` (`memoryStage.beats`). At Mémé's, hide her present
   self first (`present.meme.setPresent(false)`); elsewhere, keep today's people out with `presentPeople(set.zone)`
   (`hold()` every frame from `beat`, `release()` from `strike`: hidden, hushed, newcomers too).
4. **The present's things** are hidden in any scene of their zone through `ctx.memories?.markModern(zone, objects)`;
   one scene's own with `memoryStage.hideNamed(set, ...names)`.
5. **Register** the builder in `albumWiring`'s `REELS`: it is offered as soon as `MEMORIES` unlocks it.
6. In another zone, mind what reacts to the player's zone (the camera counts for the `ZoneManager`): read
   `ctx.memories.filming` where it should not.

## The lost prototype (`src/story/`)

A trail followed over many game days through the channels the player meets anyway, ending with a game nobody ever
sold: MOONPOST v0.9, Halcyon Byte's NES game (all invented), on a grey dev cart. No grind: each gate is a day or a
place visited, and a channel the player misses gives up after a few days, the post bringing its clue instead.

### The trail (`PrototypeStory`, words in `prototype.ts`)

| Stage reached | Clue from | Gate | Fallback (`STORY_RULES.fallbackAfter`, game days) |
| --- | --- | --- | --- |
| `clipping` | the doormat on coming home: THE GAMING WEEKLY's clipping | `start.day` (3) and `start.games` (3) owned | |
| `stall` | the NES stallholder (`atStall`), any stallholder `anyStallAfter` days on | the clipping | |
| `radio` | Radio Brocante's morning chronicle in the kitchen (`onRadio`), a caller's line | the day after the stall | 3: the producer's note on the mat |
| `arcade` | the arcade's attendant (`atArcadeCounter`): who HAB is | | 4: the attendant's note |
| `trader` | the collector outside RETRO GAMES (`atTrader`, his days only), or Hana's landlady's small ad (`LANDLADY_AD`, in the paper from the day after the arcade's clue, `linkAds`): going round reaches it (`Classifieds.onVisit`), her sideboard holds the collector's letter | | 3: his card |
| `found` | Marco (`KEEPER`) on a visit, chatted to (`atFriend`); another friend says he has it | | 4: Marco's postcard, the cart posted |
| `ended` | the demo played to its credits on the TV (`demoFinished`): Hana's letter (a `read` card), a big reward | | |

A line returned is the clue told: the stage moves on as it is said (a journal line `story`, a `react` "A new lead").
The journal's notebook shows the file (`PrototypeStory.file()`: the clues in the player's words, the next lead,
vague on purpose). Saved as `bibliothek.prototypeStory.v1` (`{ stage, since }`); a save holding the cart is past the
trail. The cart enters the collection like any gift (it waits in the parcel), id `PROTOTYPE_ID` (`proto:nes:moonpost`).
A keepsake (`economy/Transactions.isKeepsake`, ids `proto:`): the WE BUY desk, a stall's swap and the neighbours refuse it.

Hooks (each optional, asked first, the usual lines otherwise): `BuildContext.story` (`StoryChannels`) read by
`hallway/mail.ts` (`MailSources.story`), `market/furnishMarket` (the stallholders' `lines`), `kitchen/furnishKitchen`
(the chronicle), `arcade/furnishArcade` (the attendant's `lines`), `street/furnishStreet` -> `TraderOptions.talk`, and
`bootstrap/world` -> `VisitorsOptions.talk`. Nothing in the building or the stairwell.

### The cart and its demo

- Look: `prototypeArt.ts` paints the box (a white mailer in marker, an INTERNAL stamp, a typed note on the back), the
  spine and the cart's front (grey shell, biro label) as data URLs, first in both art chains (`createBoxArtLoader`);
  `skippingPrototype` keeps libretro and LaunchBox from looking it up.
- Reviews: its one preview (`PROTOTYPE_REVIEWS`, marked as fiction on the card) overrides the Wikipedia lookup.
- On the TV: `registerPrototype` (from `bootstrap/session`) registers a `ScreenProgram` (`onscreen/programs`) for it:
  `moonpost/MoonpostProgram` over `MoonpostDemo` (lunar-lander rules at 256 x 240: gravity, a jet pack on A / B / up
  that burns fuel, left / right steer, a soft level landing on a yellow pad delivers, the blue one refuels, too hard is
  a puff and a walk back; stranded with an empty tank, the same walk) and `moonpostSound` (the tune on a pulse wave and
  a triangle bass, the jet pack's hiss, the jingles, into the set's output). Three letters, then the credits ("levels
  4-8: TO DO"): `finished` fires `demoFinished` once.

### Checking without a browser

Bundle `PrototypeStory` and `MoonpostDemo` with esbuild (`--alias:@=./src`, stub `location`, `window`, `document`) and
drive them: a fake collection and `today`, days stepped with `mail(day)` / `atStall` (the whole trail runs on the
fallbacks alone in about 17 days); a scripted pilot finishes the demo in about 75 s with one crash.
