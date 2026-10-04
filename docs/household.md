# The flat's rooms: what the kitchen, the bathroom and the bedroom are for (`src/household/`)

Read this when touching what the player can do at home besides the collection room. The rule the user set: **no
penalty, ever**. Nothing decays, nothing is owed; doing a thing is a plus, mostly for a day that matters (a grail, a
friend coming round), never a daily chore. What is worn or set stays so (saved) until changed.

## What each room does

| Where | What | The plus | Rules |
| --- | --- | --- | --- |
| Bathroom, mirror cabinet (door open) | Take the cleaning kit (it stands on the bottom shelf, `CabinetKit`) | It moves to the kitchen table, once; refused while the kitchen has no table (`HomeLife.setKitchenTable`) | `HomeLife.takeKit` |
| Kitchen table, the kit | A **worn** box in hand, click | Cleaned: `condition` `noManual` + `restored` (bright cover, still no manual), worth more in the collector's book; the WE BUY desk and swaps still count it worn (`pricing.dealerFactor`), so bin-to-desk never pays. One a market day | `HomeLife.cleanBox` |
| Bathroom, hair dryer | A box with an old **price sticker** in hand | Peeled: worth its full price again (stickered copies sell at `STICKER.factor` and are worth that much less) | `HomeLife.peelSticker` |
| Bathroom, the full bath | Click to soak (the water goes out after) | The next haggle's stallholder hears one more offer (`soak.patience`), whenever it comes | `HomeLife.soak`, `Perks.ease` |
| Kitchen hob, mixing bowl | Bake a cake (on the table two market days; refused without the table) | A friend visiting while it is out has a slice, lingers `cake.linger` times as long and leaves a thank-you (a game to their taste, else coins) | `HomeLife.bake`, `Visitors.thankForCake` |
| Kitchen worktop, treat jar | A treat, once a market day (the cat comes) | Next morning, sometimes, something by its kitchen bowl: coins, or the lost booklet of a shelved `noManual` game (complete again) | `HomeLife.giveTreat` / `takeGift`, `catGift.ts` |
| Kitchen radio | Switched on between `radio.from` and `radio.until`, once a day | Radio Brocante: a grail heard of `radio.grailDays` ahead (the others say 3), tomorrow's theme and clearance, the Flea Fair | `chronicle.ts` |
| Bedroom chair | Sit with a **complete** box in hand | Its manual read: platform know-how. From `knowHow.eye` manuals a fake's print is noticed before opening the box; from `respect` that platform's stallholders go easier | `HomeLife.readManual`, `Perks.tell` / `ease` |
| Bedroom nightstand, alarm clock | Click cycles the wake hour | The bed's night ends then (`Sleep`'s `wakeHour`) | `Household.cycleAlarm` |
| Bed | A night's sleep | Some nights a dream: one of the morning's remarkable copies (grail, wishlist, estate, bin gem, showpiece), on the `DreamCard` | `dreams.ts`, `HomeLife.dream` |
| Market, before `firstSale.before` | The morning's first stall purchase | "The first sale brings luck": the haggle opens lower (`firstSale.floor`) | `Perks.firstSale` |
| Bedroom phone | Call a stall where the player is a regular (`phone.regularFrom`) in market hours | It reads out today's table and puts a copy aside for the hold deposit, as if held at the stall | `PhonePanel`, `Transactions.holdCopy` |
| Bedroom phone | Ask a friend round, once a market day before `phone.friendsUntil` | They come `phone.inHours` later (a visit on demand: loans, tips, the cake) | `Visitors.invite`, `VisitBook.invite` |
| Bedroom phone | Have everyone round tonight; ring THE GAMING WEEKLY for an open house | A games night (PADDLE WARS on the TV, a photo), an open house two days on (coins at the door, the paper's article) | `Gatherings.phoneRows`, `call` (docs/visitors.md "Gatherings") |
| Market stalls | Some ordinary copies carry an old price sticker (`STICKER.odds`) | Sold at `STICKER.factor`: a bargain once peeled off at home | `MarketStock.priced` (its own hash) |
| Bedroom wardrobe (door open) | Choose an outfit | Arcade tee: +10 % tickets. Bargain hunter's jacket: every haggle opens lower. Sunday best: the glass case opens whatever the reputation. Each is earned (a trophy, reputation, 25 games) | `outfits.ts`, `WardrobePanel` |

The long jobs are told in a beat, not lived through (`household/pastime.ts`, `Pastimes`, like `Sleep`): cleaning a
box (an hour: cloth and cotton buds), peeling a sticker (a minute: the dryer's whir), baking (the whisk, the oven door
in the dark, its timer on the way back) and the soak (a splash, lapping water) fade to black with their sounds
(`audio/householdSounds.ts`, on the UI bus: the room's sound is ducked with the view, `duckScene`), make the change in
the dark, wind the clock on by `HOUSEHOLD.pastime.*.minutes` (each under `pastimeMaxMinutes`, 179: a 3 h jump between
5:00 and 11:00 reads as a night and teleports the cat to its breakfast spot; `Pastimes.run` logs an error over it) and
fade back. While one plays (`Pastimes.isBusy`) the player is frozen (`Session.setFrozen`), the keys are deaf (the
Session's `sleep.isAsleep` covers it), photo mode, the remembered spot and the footsteps wait, and friends do not ring.
A night's sleep ducks the flat's sound the same way and brings it back just before the alarm rings. A box job (`world/build/boxJob.ts`) puts the box
down and takes its rebuilt box (`HouseholdContext.boxOf`) back in hand, so the refreshed cover is what the view comes
back to. The treat jar rattles, the alarm clock's button beeps, the wardrobe's hangers clink, the kit clinks off its
shelf, the cat's coins jingle when picked up, and the morning after a night fades in to the alarm clock ringing a
moment, then the slap on its button (`Sleep.onWake` -> `HomeLife.ringAlarm`, once the clock stands). A treat is spent
only on a cat that comes (`callCatFor(...).came`): asleep or mid-leap, it stays in the jar for later. Clicking the kit
or the dryer with nothing in hand says what to bring (a reaction, not the refusal buzzer). A dream's line is one of a
few per kind of copy, drawn from the market day.
The kitchen radio ducks its music `DUCK_DB` under a jingle while the chronicle's card is up (`RadioVoice.announce`).

### Playing at home

- **The turntable** (`world/vinyl/RecordPlayer`, on the sideboard's turntable, riding it): a click with free hands puts on
  the next soundtrack LP owned (`record` home goods, bought one at a time from the crate by the flea market's household
  stall, `world/vinyl/RecordCrate`: the nth bought is `vinyl/records` `RECORDS[n]`, the turntable's `KEYS.turntable`
  remembers the last played); the platter spins up, the arm swings in and drops, side A plays from the sideboard through
  the walls (`vinyl/RecordTune`, an ambient `Voice` behind a `PointSound`: crackle and pops, the needle's thump, four
  tracks made up from the record and the track number in its console's style, an NES's pulses to a PS1's breakbeats;
  the same tune every time). A click while it plays lifts the needle; at the side's end the arm returns by itself.
  Original music only, invented sleeves.
- **The home arcade cabinet** (`world/homeArcade`, the bedroom by the door, `homeArcade` from TV REPAIR): the hall's own
  `ArcadeCabinet` around a 7-in-1 board (`HomeArcadeGames`: a menu, then the game picked), `atHome` (no coin, no
  ticket, no medal, league or challenge), its scores on a table of its own (`HomeScores`, `KEYS.homeArcade`). No light
  of its own (a glow pool only). A guest takes stick two (`cabinet.partner.setPartner(name)`, `games.pick('duel')`).
- **The NES on the TV** plays the homebrew carts for real (docs/media.md "Homebrew carts").

Every number is in `household/rules.ts` (`HOUSEHOLD`) or at the top of `outfits.ts`; the sticker's in `pricing.ts`
(`STICKER`). All first guesses.

## Repairing a console (`src/repair/`, `ui/repair/`, `world/repair/`)

A console bought broken (from a small ad's seller, docs/economy.md "Small ads and the seller's flat", or TV REPAIR's
crate of spares-or-repair inside its door, one on `REPAIR.crateOdds` of game days) goes into the `Workshop`
(`KEYS.workshop`) with its fault (`consoles.FAULTS` by platform: bent 72-pin connector, dirty contacts, a leaky
capacitor, a blown fuse, corroded battery terminals, a dusty lens, a loose screen ribbon). It waits on the kitchen's
right-hand chair (`REPAIR_PLAN.kitchenChair`, once the table is bought: the table is the bench) with a TO FIX tag; a
click opens the repair on the table (`RepairPanel`, a drawing of the console from above): the shell's screws out one
by one, the shell lifted, the fault found on the board (a healthy part only "looks fine"), the right tool from the
tray (a wrong one is a word), the fix by hand (scrub: hold the pointer down on it and work it clean; swap: the old part
out, the new one seated; solder: each joint touched, a capacitor out on two legs and in on two more), the shell back,
screwed shut, the power switch: the light, the chime, `Workshop.fix`. Shut halfway, nothing changes (it starts over).
A mended console waits on the chair (WORKS!) until sold at TV REPAIR's counter (the WE BUY card, `ConsoleDeskPanel`,
two clicks) for `REPAIR.resaleShare` of its value (`CONSOLES`). Bonus only: a broken console waits as long as it likes.
Not kept to play: the TV stand already shows a console for every platform owned. Numbers in `repair/consoles.ts`.

## Files

- `rules.ts`: `HOUSEHOLD`, the numbers.
- `Household.ts`: the persisted store (`KEYS.household`): kit, cleanings today, the bath's calm, the cake, the treat
  and the cat's gift, manuals read per platform, the outfit, the wake hour, and `once(what)` for the once-a-day
  things (dream, radio, invite, first sale). Days are game days (`Today.gameDay`, the market calendar's count).
- `pastime.ts`: `Pastimes`, the fade-to-black beat of a long job (curtain + clock from `bootstrap/world`).
- `HomeLife.ts`: the rules the furniture calls (`mayClean` / `mayPeel` / `mayBake` refuse before the beat starts). Each returns an `Outcome` (`done`, a `line`, told by `tellOutcome`: a refusal, a reaction, or a card to read with its effect under it); captions come
  from its `*Label` getters. `cleanBox` / `peelSticker` take a `before` (the builder puts the box down first, so its
  shelf rebuilds it with the new state). What gets done (a box cleaned, a sticker peeled, a cake, a soak, a manual
  read, what the cat turned up) goes in the day's journal as a `home` line (`HomeLifeDeps.journal`).
- `perks.ts`: `Perks`, what the flat sends the player out with, as the Session asks (`PerksLike` in `SessionParts`):
  `MarketCounter` calls `ease` when a haggle opens (then `Negotiation.ease`, clamped at `NEGOTIATION.lowest`),
  `tell` / `note` for the copy's panel, `bought` on a purchase, `mayHandleGlass`; `ArcadePlay` calls `arcadeBonus`.
- `outfits.ts`, `chronicle.ts`, `dreams.ts`, `catGift.ts`: pure.
- World: `world/kitchen/HomeKitchenware.ts` (kit, bowl, cake, jar, what the cat left), `world/bathroom/HairDryer.ts`,
  `world/bedroom/AlarmClock.ts`, `world/props/UsableProp.ts` (a prop with a caption and a click from the builder),
  `world/build/presence.ts` (`presentWhile`: in the zone only while a state says so; `onRise`: the radio switched on).
  Bathtub (`onSoak`) and BedroomChair (`reading`) take options. Wiring: the `furnish*Life` functions at the end of
  `furnishKitchen.ts`, `furnishBathroom.ts` and `furnishBedroom.ts`, from `BuildContext.home.household` (`HouseholdContext`); positions in each
  plan's `household` block. What stands on bought furniture goes through its placer (`build/owned.ts`).
- Visitors: `hosting` (the cake: `Visit`'s `linger`, the slice in `answered`, the thank-you in `ended`), `phoneBook` /
  `invite` for the phone (`VisitBook.invite`: the invited friend is today's plan, whatever the draw).
- UI: `ui/household/` (`PhonePanel`, its friends set by `bootstrap/world` once the visitors exist; `WardrobePanel`,
  `DreamCard`); `GamePanel` shows a home copy's state and sticker.
- Bootstrap: `services` (Household, HomeLife, Perks), `ui` (the panels), `world` (`home.household`), `session`
  (`perks`, `dreams`), `player` (`Sleep`'s wake hour).

## Testing without a browser

Typecheck + build. In a browser: clear `bibliothek.household.v1` to start over; `?debug` plays on its own save.
