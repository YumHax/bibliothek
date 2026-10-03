# The lost prototype (`src/story/`)

A trail followed over many game days through the channels the player meets anyway, ending with a game nobody ever
sold: MOONPOST v0.9, Halcyon Byte's NES game (all invented), on a grey dev cart. No grind: each gate is a day or a
place visited, and a channel the player misses gives up after a few days, the post bringing its clue instead.

## The trail (`PrototypeStory`, words in `prototype.ts`)

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

## The cart and its demo

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

## Checking without a browser

Bundle `PrototypeStory` and `MoonpostDemo` with esbuild (`--alias:@=./src`, stub `location`, `window`, `document`) and
drive them: a fake collection and `today`, days stepped with `mail(day)` / `atStall` (the whole trail runs on the
fallbacks alone in about 17 days); a scripted pilot finishes the demo in about 75 s with one crash.
