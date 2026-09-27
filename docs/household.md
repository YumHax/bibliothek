# The flat's rooms: what the kitchen, the bathroom and the bedroom are for (`src/household/`)

Read this when touching what the player can do at home besides the collection room. The rule the user set: **no
penalty, ever**. Nothing decays, nothing is owed; doing a thing is a plus, mostly for a day that matters (a grail, a
friend coming round), never a daily chore. What is worn or set stays so (saved) until changed.

## What each room does

| Where | What | The plus | Rules |
| --- | --- | --- | --- |
| Bathroom, mirror cabinet (door open) | Take the cleaning kit | It moves to the kitchen table, once | `HomeLife.takeKit` |
| Kitchen table, the kit | A **worn** box in hand, click | Cleaned: `condition` `noManual` + `restored` (bright cover, still no manual), worth more in the collector's book; the WE BUY desk and swaps still count it worn (`pricing.dealerFactor`), so bin-to-desk never pays. One a market day | `HomeLife.cleanBox` |
| Bathroom, hair dryer | A box with an old **price sticker** in hand | Peeled: worth its full price again (stickered copies sell at `STICKER.factor` and are worth that much less) | `HomeLife.peelSticker` |
| Bathroom, the full bath | Click to soak (the water goes out after) | The next haggle's stallholder hears one more offer (`soak.patience`), whenever it comes | `HomeLife.soak`, `Perks.ease` |
| Kitchen hob, mixing bowl | Bake a cake (on the table two market days) | A friend visiting while it is out has a slice, lingers `cake.linger` times as long and leaves a thank-you (a game to their taste, else coins) | `HomeLife.bake`, `Visitors.thankForCake` |
| Kitchen worktop, treat jar | A treat, once a market day (the cat comes) | Next morning, sometimes, something by its kitchen bowl: coins, or the lost booklet of a shelved `noManual` game (complete again) | `HomeLife.giveTreat` / `takeGift`, `catGift.ts` |
| Kitchen radio | Switched on between `radio.from` and `radio.until`, once a day | Radio Brocante: a grail heard of `radio.grailDays` ahead (the others say 3), tomorrow's theme and clearance, the Flea Fair | `chronicle.ts` |
| Bedroom chair | Sit with a **complete** box in hand | Its manual read: platform know-how. From `knowHow.eye` manuals a fake's print is noticed before opening the box; from `respect` that platform's stallholders go easier | `HomeLife.readManual`, `Perks.tell` / `ease` |
| Bedroom nightstand, alarm clock | Click cycles the wake hour | The bed's night ends then (`Sleep`'s `wakeHour`) | `Household.cycleAlarm` |
| Bed | A night's sleep | Some nights a dream: one of the morning's remarkable copies (grail, wishlist, estate, bin gem, showpiece), on the `DreamCard` | `dreams.ts`, `HomeLife.dream` |
| Market, before `firstSale.before` | The morning's first stall purchase | "The first sale brings luck": the haggle opens lower (`firstSale.floor`) | `Perks.firstSale` |
| Bedroom phone | Call a stall where the player is a regular (`phone.regularFrom`) in market hours | It reads out today's table and puts a copy aside for the hold deposit, as if held at the stall | `PhonePanel`, `Transactions.holdCopy` |
| Bedroom phone | Ask a friend round, once a market day before `phone.friendsUntil` | They come `phone.inHours` later (a visit on demand: loans, tips, the cake) | `Visitors.invite`, `VisitBook.invite` |
| Market stalls | Some ordinary copies carry an old price sticker (`STICKER.odds`) | Sold at `STICKER.factor`: a bargain once peeled off at home | `MarketStock.priced` (its own hash) |
| Bedroom wardrobe (door open) | Choose an outfit | Arcade tee: +10 % tickets. Bargain hunter's jacket: every haggle opens lower. Sunday best: the glass case opens whatever the reputation. Each is earned (a trophy, reputation, 25 games) | `outfits.ts`, `WardrobePanel` |

Every number is in `household/rules.ts` (`HOUSEHOLD`) or at the top of `outfits.ts`; the sticker's in `pricing.ts`
(`STICKER`). All first guesses.

## Files

- `rules.ts`: `HOUSEHOLD`, the numbers.
- `Household.ts`: the persisted store (`KEYS.household`): kit, cleanings today, the bath's calm, the cake, the treat
  and the cat's gift, manuals read per platform, the outfit, the wake hour, and `once(what)` for the once-a-day
  things (dream, radio, invite, first sale). Days are game days (`Today.gameDay`, the market calendar's count).
- `HomeLife.ts`: the rules the furniture calls. Each returns an `Outcome` (`done`, a `line`, told by `tellOutcome`: a refusal, a reaction, or a card to read with its effect under it); captions come
  from its `*Label` getters. `cleanBox` / `peelSticker` take a `before` (the builder puts the box down first, so its
  shelf rebuilds it with the new state).
- `perks.ts`: `Perks`, what the flat sends the player out with, as the Session asks (`PerksLike` in `SessionParts`):
  `MarketCounter` calls `ease` when a haggle opens (then `Negotiation.ease`, clamped at `NEGOTIATION.lowest`),
  `tell` / `note` for the copy's panel, `bought` on a purchase, `mayHandleGlass`; `ArcadePlay` calls `arcadeBonus`.
- `outfits.ts`, `chronicle.ts`, `dreams.ts`, `catGift.ts`: pure.
- World: `world/kitchen/HomeKitchenware.ts` (kit, bowl, cake, jar, what the cat left), `world/bathroom/HairDryer.ts`,
  `world/bedroom/AlarmClock.ts`, `world/props/UsableProp.ts` (a prop with a caption and a click from the builder),
  `world/build/presence.ts` (`presentWhile`: in the zone only while a state says so; `onRise`: the radio switched on).
  Bathtub (`onSoak`) and BedroomChair (`reading`) take options. Wiring: the `furnish*Life` functions at the end of
  `furnishKitchen/Bathroom/Bedroom.ts`, from `BuildContext.home.household` (`HouseholdContext`); positions in each
  plan's `household` block. What stands on bought furniture goes through its placer (`build/owned.ts`).
- Visitors: `hosting` (the cake: `Visit`'s `linger`, the slice in `answered`, the thank-you in `ended`), `phoneBook` /
  `invite` for the phone (`VisitBook.invite`: the invited friend is today's plan, whatever the draw).
- UI: `ui/household/` (`PhonePanel`, its friends set by `bootstrap/world` once the visitors exist; `WardrobePanel`,
  `DreamCard`); `GamePanel` shows a home copy's state and sticker.
- Bootstrap: `services` (Household, HomeLife, Perks), `ui` (the panels), `world` (`home.household`), `session`
  (`perks`, `dreams`), `player` (`Sleep`'s wake hour).

## Testing without a browser

Typecheck + build. In a browser: clear `bibliothek.household.v1` to start over; `?debug` plays on its own save.
