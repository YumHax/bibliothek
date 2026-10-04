# Consistency audit: the same things done in different ways

**Date:** 2026-10-03.

**Baseline:** commit `439f3c6`, plus the uncommitted arcade-balance and visual-pass edits from other sessions. Line numbers can drift in files those sessions touch.

**How it was produced:**
- Nine read-only audits ran in parallel, one per area: on-screen text and hints, panels, CSS, input, canvases and screens, 3D construction, audio and mini-games, saves/economy/time, and shared helpers.
- Each finding cites the code it was read from.
- The bugs marked **verified** were re-read by hand. The others come from careful code reading only; nothing was tried in a browser.

**Sizes:**
- **S:** under half a day.
- **M:** one to two days.
- **L:** several days, but mostly mechanical.

**Being fixed elsewhere (from 2026-10-03).** The visual-pass session (bibliothek-d7) has taken these items. Check with it before touching them:
- §3.10-MAT-2: snow patched onto shared materials, and the unweathered street props.
- §3.10-FX-1: particle point size.
- §3.5-1..5 and §3.10-MAT-11: texture and canvas helpers, texel density.
- §3.10-MAT-5, LGT-13 and WIN-1/2: glass and panes.
- §3.5-13/25: signs painted twice, and the NameBoard font.
- §3.10-GEO-6: the boards' literal face z, and the 0.004 window-glass offset.
- §3.5-10: the `shade()` mismatch.
- §3.10-MOD-9: the balcony modelled twice.
- §3.5-31 and §3.10-MAT-9: GLSL noise and additive-alpha duplication.

Not taken: the fonts (shipping "Press Start 2P" means adding a font file, the user's call) and street life in the outlooks.

**How to use this list:**
- Part 1 lists the player-visible bugs this inconsistency has already caused. Fix them first; most are small.
- Part 2 lists the few shared modules that end most of the duplication. Build them before the area clean-ups.
- Part 3 has the details, area by area. Each item gives its variants, the problem, the fix and a size.
- Part 4 lists the convention checks to add to `scripts/check-conventions.mjs` so the duplication does not come back.

---
## Part 1: Bugs the divergence already causes

Each bug is caused by two or more implementations of the same thing disagreeing. **Verified** means it was re-read by hand after the audit.

### On screen, hints and input

1. **Captions are misread by the caption parser (verified).**
   - The caption is a plain string that `ui/hoverCaption.ts:15-32` splits back into name and verb by guessing.
   - "Right-click to move" (the documented movable-furniture hint) renders as **"Right [left-click icon] move"**.
   - With a seat under the crosshair it becomes "Armchair · sit · right [icon] move".
   - On a controller it shows "[A] press b to move", which is the wrong button.
   - States get an action icon: "Change machine [icon] out of order", "TV [icon] can't play it".
   - "· click for the spot beside" shows the click icon *and* the word "click".
   - Fix: §3.1-1.
2. **Arcade fire cannot be pressed with a controller or on touch (verified).**
   - `fire` has no `pad` binding (`input/actions.ts:183`).
   - Pad A is only a left click (`input/Gamepad.ts:147`), and a click mid-play is ignored (`game/ArcadePlay.ts:89`). Only light-gun cabinets turn a click into fire (`ArcadeCabinet.ts:326`).
   - The touch bar offers only "Walk away" at the arcade.
   - So Breakout, Invaders, the pinball launch, the alley and the initials screen never get fire on those devices. Yet `ui/controls.ts:108-117` promises `[A]`.
   - Fix: §3.4-10.
3. **Pad B also works the room while a TV program is played standing (likely).**
   - B is the NES "A" (`onscreen/ProgramRunner.ts:28`) and also a synthetic right-click (`Gamepad.ts:148`).
   - So a jump can lift a movable piece under the crosshair, or pop "The television stays where it is".
   - Fix: §3.4-8.
4. **Holding Y on a controller is the X key (verified).**
   - X is `storePiece` when furniture is carried, and `swap` with a market copy in hand (`input/actions.ts:21,148-151`).
   - Meanwhile every card's dismiss hint says "hold Y put down" (`notices/dismissHint.ts:18-21`).
   - Fix: §3.4-3.
5. **Holding Q at the market floats every price label, with no gate (verified).**
   - `world/market/PriceScanner.ts:54` checks only the key, so it fires in photo mode (labels land in the saved PNG) and while typing "q" in the search bar.
   - Fix: §3.4-4.
6. **The touch bar shows two identical buttons.** At the arcade it shows "Walk away" twice; seated, "Stand up" twice. Cause: two actions share `KeyE` (`input/TouchControls.ts:36-41,176-182`). Fix: §3.4-3.
7. **Keys are named for QWERTY and the keyboard, whatever the device.**
   - Arcade hints and cards say "A / D" and "WASD" on AZERTY.
   - A controller player reads "E walks away" and "press E to stand up".
   - The NES homebrew tips name pad buttons and never the keyboard keys.
   - Fix: §3.1-3.
8. **Right-click takes furniture while the travel menu is open, during a fade, or during travel.** `Rearranging.grab` checks none of those states. Fix: §3.4-14/15.
9. **Clock text can read ":60" (verified).**
   - `classifieds/ads.ts:160`, `visitors/gathering/Gatherings.ts:238`, `street/shops/shopHours.ts:64` and the inline `Visitors.ts:546` all compute `round(frac*60)`.
   - At 18.996 h they print "18:60". With live hours (invites), "14:60" shows about 0.8 % of the time.
   - Fix: §3.9-C1.

### Arcade and scores

10. **FIXED 2026-10-03 by bibliothek-48 (uncommitted): `PartyScores.submit` now returns a 0-based rank.** Party cabinet: first place showed "2ND ON THE BOARD!" (verified). `courtyard/PartyScores.ts:53` returns `rank + 1`, and every end screen adds 1 again (`CabinetScreens.ts:188`, `Pinball.ts:503`, `AlleyRoller.ts:177`). Fix: §3.7-M6.
11. **FIXED 2026-10-03 by bibliothek-48 (uncommitted): a score below every entry now ranks at `table.length`.** Initials screen: a last place showed "1ST PLACE!" (verified). `MachineRun.ts:255` computes `max(0, findIndex(score > e.score))`, which is 0 for the lowest score on a table that is not yet full. The home cabinet starts empty. Fix: §3.7-M6.
12. **The party cabinet pays twice (verified in the current tree).**
    - It is `freePlay`, documented as "pay no tickets" (`ArcadeCabinet.ts:54`).
    - `ArcadePlay.over` skips payouts only for `atHome` (`game/ArcadePlay.ts:248`), so `arcadePayout` still pays score tickets, challenge, medal, streak and league. The courtyard then adds its kitty (`furnishCourtyard.ts:148-155`).
    - The new `paid` flag only gates COIN_BACK.
    - The attic cabinet was the opposite case: `atHome` with `pointsPerTicket > 0`. **Fixed 2026-10-03 by bibliothek-48** (`pointsPerTicket: 0`). The party cabinet's payout is still open and needs a design decision.
    - Fix: §3.7-M7.
13. **"21TH" and "22TH"**: `arcade/InitialsEntry.ts:109 ordinal` is wrong past 20, while `LeagueBoard.ts:32` and `arcadePayout.ts:106` are right. Fix: §3.9-D2.
14. **The arcade's pixel font is not shipped (verified).**
    - Every cabinet screen, board and marquee asks for `"Press Start 2P"` (`arcade/games/ArcadeGame.ts:69`), but `public/fonts` has no such face. All arcade text actually renders in bold Courier New.
    - Fix: §3.5-9.

### Saves, money and rules

15. **The collection editor (Tab, no `?debug` needed) bypasses the rules (verified).**
    - Its status select turns a wishlist entry into an owned game for free, or marks a game "lent" with no loan (it never comes back).
    - "Import JSON" replaces the whole collection with no confirmation, and grants honours and milestone coins at once.
    - It also renders the imported `status` unescaped (`ui/CollectionEditor.ts:202`): status is never validated on import (`catalog/validate.ts:18`), so a crafted file injects HTML.
    - Fix: §3.2-F29, §3.8-11.
16. **The collectors' club visit and the open house can pay twice after a reload (verified ordering for the club).** They pay in `thanks()` or at the door, but write the "done" flag only in `finish()` (`ClubVisit.ts:71-87`, `OpenHouse.ts:88-152`). Fix: §3.8-27.
17. **One-time letters are lost (verified cap).**
    - The doormat holds 2 pieces and drops the rest (`props/MailDrop.ts:17-20,50`), and nothing is saved.
    - Meanwhile the story, Mrs Roux and treasure-hunt producers save "sent" before delivery. A reload before reading, or a busy day, loses clues for good.
    - Fix: §3.8-23.
18. **"Undo purchase" (U) takes away reputation that was never given (verified).**
    - `Transactions.undoPurchase` always calls `standing.undo('buy')` (`economy/Transactions.ts:151`), while bargain-bin, garage-sale and cellar buys never recorded one.
    - Conversely, the Trader and the attic chest's free game earn flea-market stall loyalty.
    - Fix: §3.8-8.
19. **Save-problem alerts name nothing for 32 of the 68 saves.** `notices/saveNotices.ts:8-19` keeps its own name list beside `persistence/keys.ts`. Fix: §3.8-2.
20. **Two `Fame` instances share one browser cache key, and the last flush wins.** They are built at `bootstrap/services.ts:114` and `building/pricedCopy.ts:14`, and `BrowserCache.ts:76-89` does not merge on write. Fix: §3.8-19.
21. **Estate-sale haggles are forgotten on reload,** although the comment says they are remembered (`building/estateSale.ts:92-94`). Fix: §3.8-9.
22. **The street news contradicts the street.**
    - The Trader stays out in snow, and the busker leaves at rain 0.08.
    - But the news uses `rain > 0.3 || snow > 0.3` for both (`streetNews.ts:8-10,37,47`).
    - Fix: §3.8-15.
23. **`?season=` is ignored by the florist's chalk board,** which computes the real season at import (`street/streetPlan.ts:707`). Fix: §3.9-C3.
24. **Same-day draws can differ between browsers.**
    - `sort(() => random() - 0.5)` shuffles depend on the engine's sort, in `DroppedCoins.ts:78`, `hallway/mail.ts:48`, `BedroomChair.ts:118` and `gamingWeekly.ts:73`.
    - So "the same for everyone that date" isn't.
    - Fix: §3.9-A4.
25. **Seed collisions.**
    - `gamingWeekly` and `RetroShopLure` use the same seed (`gameDay*131+7`).
    - Bikes and Motorbikes can get the same `Date.now()` seed.
    - The wall calendar's picture is effectively the same hue every month (`year*12+month` into the weak generator).
    - Fix: §3.9-A1/A2/A5.
26. **Selling and trading search is accent-sensitive.** "pokemon" finds "Pokémon" in the search bar and the catalogue, but not when selling or trading. Fix: §3.9-G1.
27. **Title order differs between the shelves and the panels.** "The Legend of Zelda" files under L on the shelf and under T in the panels; "Mega Man 10" comes after "Mega Man 2" on the shelf only. Fix: §3.9-G2.
28. **Pay-then-refuse (latent).** `SessionActions.pay` takes the coins before `paid()` can say no, so `TournamentBoard.ts:150-159` can answer "The sheet is full." after the fee is gone. Fix: §3.8-5.

### Panels

29. **Dragging out of a card closes it.** Twelve card panels close on any `click` whose target is the backdrop, and that includes a drag that ends outside the card. A repair scrub loses the job; a text selection in the label maker loses the text. Fix: §3.2-F4.
30. **Stale confirm labels.** In Trade, Prize and ConsoleDesk the armed button keeps saying "Swap +N?", "Sure? Feed all" or "N coins?" after the time window has passed. Fix: §3.2-F7.
31. **Focus falls to `<body>` after every click** in Copro, Wardrobe, Phone, ConsoleDesk and Repair. With a keyboard or controller, the next Tab then swaps the open panel for the collection (`ModalStack.ts:77-80`). Fix: §3.2-F6.
32. **One press commits.** "Buy the lot", "Lend it", "Swap" and "Post my vote · N coins" get focus when their panel opens, so a single Enter or A press commits. Fix: §3.2-F5.
33. **The review card's Wikipedia link can't be clicked,** because it sits inside `.game-panel { pointer-events: none }` (`ui/styles.css:244`). Fix: §3.2 (out of scope note).

### Sound and HUD

34. **A YouTube video on the TV keeps full volume through sleep and pastimes.** `duckScene` only reaches Web Audio (`audio/audioContext.ts:238`). Fix: §3.6-A3.
35. **The "Menu sounds" slider mutes the bath, the cake, cleaning, repair and the camera shutter.** Those sounds use the UI channel to escape the duck. Fix: §3.6-A9.
36. **Notices expire unseen.**
    - Rewards ("never dropped"), reading cards and tips keep counting down while hidden in photo mode, in plan view or behind a panel.
    - The prize attendant speaks in subtitles that sit under the prize panel.
    - Fix: §3.1-6.
37. **The dream card stays over the pause menu.**
    - It is in none of the HUD-hiding lists, and `--z-hud` equals `--z-overlay` (`ui/styles.css:57-58`).
    - Its timer is real time, and X does not put it away.
    - Fix: §3.1-7.
38. **Doubled scan lines on the attic cabinet.** Starfall paints scan lines under the cabinet shader's own (`attic/Starfall.ts:53`). Fix: §3.5-12.
39. **The neon sign's halo uses a font size 4 px off.** `props/NeonSign.ts:134-137` draws its halo and line widths with a `px` 4 px smaller than the font it actually set. Fix: §3.5-7.
### 3D world

41. **Re-entering the street likely breaks two shaders (verified cause; needs a browser check).**
    - `snowCovered(paint(…))` patches a cached, shared palette material in place (`street/wayfinding/StreetClock.ts:36`, `BusStopPole.ts:43`; `snowCover.ts:45` has no guard).
    - Each rebuild of the lazy street chains another patch, so the next compile declares `vSnowUp` twice. Any other prop sharing that `paint()` look also gets the street's snow.
    - Fix: §3.10-MAT-2.
42. **Two relay clicks can never play (verified).** `playRelay` returns below a level of 0.004 (`stairwell/stairSounds.ts:246`), but is called with 0.0012 (`hall/TimerButton.ts:75`) and 0.0006 (`cellar/CellarLights.ts:154`). Fix: §3.10-SND-5.
43. **A glazed `ShutDoor` ignores `leafColor` (verified).** The concierge's door asks for brown and comes out off-white (`props/ShutDoor.ts:70-81`). Fix: §3.10-DOOR-5.
44. **Fading street people cast a torso-only shadow (verified).** Twelve owners switch shadows off, but `PersonModel.setOpacity` turns the trunk's back on (`people/PersonModel.ts:446`). Fix: §3.10-PPL-4.
45. **Clicks, speech bubbles and sounds pass through the walls** of the attic, cellar and roof and through the stair slabs: those shells declare no `occluders`. Fix: §3.10-GEO-2.
46. **Six lights have unbounded range** (`distance: 0`): FloorLamp, BedsideLamp, IndustrialPendant, NeonSign, NeonTube, Projector. Every lit fragment pays for them, and they shine through walls. Fix: §3.10-LGT-3.
47. **The ceiling light sits at the room centre** while the fixture is off-centre in the arcade, the seller flat, the neighbour flat and the saleroom. Fix: §3.10-LGT-4.
48. **The same neighbour looks different from scene to scene.** Mrs Dubois has three seeds and lives on the 3rd floor in one plan, the 2nd in another. Fix: §3.10-PPL-1.
49. **The arcade attendant, the barista and the market clerks speak as "Stallholder"** (the default at `people/Vendor.ts:84`). Fix: §3.10-PPL-7.
50. **Things that don't work as they should:**
    - The neighbour flat's rugs never soften footsteps (ZONE-8).
    - A swapped favourite game in the neighbour flat can't be clicked (ZONE-13).
    - Four sales leak their sold boxes (ZONE-14).
    - A blackout leaves the mood lamp and other powered props on (LGT-14).
    - Every trip plays a door latch, bus and ladder included (SND-4).
    - Houseplant leaves never merge on medium and high quality (GEO-7).
    - The bedroom chair's back slats probably float behind its posts (MOD-3).
    - People pop in and out in plain view (PPL-3).
    - Particles change size when the adaptive resolution steps (FX-1).

### Docs

51. **Stale docs (verified).**
    - CLAUDE.md says `World.prime` logs `[world] N shadow maps`; the real line is `[lights] … texture units` (`world/lighting/lightBudget.ts:115-146`).
    - The `add-interaction` skill tells authors to write "Click to …" labels, while docs/architecture.md says never.

---
## Part 2: The shared modules that end most of the duplication

The same few gaps show up in almost every area. Each module below replaces several of the Part 3 items, which are listed under it. Build these first: the area clean-ups then become mechanical.

### P1. Captions, input hints and key caps (the "tooltips")
- **Build:**
  - A structured `Caption` returned by `label()`.
  - `ui/inputHints.ts`, which names any action for the device in hand: keyboard (as the layout prints it), pad (including "hold"), or touch.
  - `{actionId}` tokens in all player-facing strings, re-rendered when the device changes.
  - One `.key-cap` component.
- **Replaces:** the `parseCaption` guesswork, `verb.ts`, the device switches in `dismissHint`, Overlay, TravelMenu, GamePanel and PhotoHud, the literal `<kbd>`s, 42 `actionKeyLabel` hints, the QWERTY arcade hints, and eight key-cap styles.
- **Items:** §3.1-1/2/3/4/13/16/17, §3.2-F23, §3.3-F25, §3.4-5/6/7, §3.7-M2.

### P2. One "press twice to confirm" helper
- **Build:** `ui/confirmTwice.ts` (`Arming<K>`): `arm(key)`, `isArmed`, an expiry callback that repaints, a standard line built through P1 ("{use} again to buy"), and one `.ui-btn--armed` style. Move `CONFIRM_MS` out of `pricing.ts` into it.
- **Replaces about 15 copies:**
  - Panels: Catalogue (Buy and "Used…"), Sell, Trade, HomeShop, ConsoleDesk, Prize, CollectionEditor.
  - Room and world: `Purchases`, `CopyOpening`, `world/shop/ForSale`, `CartonCorner`.
  - Walk-away: `ArcadePlay` and `ProgramPlay` (1.5 s).
  - Other: `WallClock` (2 s), `NoticeDismiss` (0.45 s).
- **Why:** three copies never expire their label, windows differ, and the wording differs.
- **Items:** §3.1-11, §3.2-F7/F8, §3.3-F22, §3.4-19, §3.8-6, §3.9-C6.

### P3. A panel kit
- **Build:** `src/ui/panel/`: the base with sheet and card layouts, a dismiss policy, a focus policy, `refresh()` with focus restore, `setStatus()`, `onBack()`, an Enter policy, UI sounds and an AbortController. Plus `ConfirmDialog`, widgets (tabs, segmented choice, `gameRow`, `coverImg`, `priceHtml`, `searchField`), a `PanelRegistry` and an auto-escaping `html` tag.
- **Replaces:** three sheet-frame copies, twelve card-frame copies, seven "set data then open" verbs, four routes into a panel, two focus-restore schemes, eight status lines and four tab implementations.
- **Items:** §3.2 (all), §3.3-F18/F19/F30.

### P4. UI design tokens and components
- **Build:** `ui/design/tokens.css`, `base.css` and `components.css` in `@layer`s (`.ui-btn` variants, `.ui-chip`, `.ui-card`, `.ui-paper`, `.ui-row`, `.ui-field`, `.ui-tabs`, `.ui-badge`, `.ui-kbd`, `.ui-coin`, `.ui-status`). Themes only set slot variables. Add a CSS pass to `check-conventions.mjs` for raw colours, z-index numbers, font families and durations.
- **Replaces:** 282 distinct colours, 54 font sizes, 13 button styles, 11 papers and 13 focus-ring declarations.
- **Items:** §3.3 (all), §3.1-5, §3.2-F22/F30.

### P5. One HUD root and visibility state
- **Build:** a `.hud` root with `data-state="playing|menu|panel|photo|plan"`; HUD elements tagged `data-hud`; slots (crosshair column, top-left, top-centre) owned by `ui/hud/`; a `--z-menu` above the HUD. Notices pause while their layer is hidden.
- **Replaces:** three hand-kept hide lists, equal z-indexes, and notices expiring unseen.
- **Items:** §3.1-6/7/8/9/16, §3.2-F27, §3.3-F15/F16/F17.

### P6. One input dispatcher with a mode stack
- **Build:** one owner of `Input.onPress`, the pointer events and held-action queries, routing to a stack of modes (system → panel/menu → modal mode → room). Each mode declares its pointer-lock, walk, look, pick and hands policy, and returns "taken". `acquire(reason)` / release for freezes. Pad and touch emit `ActionId`s, not key codes. One device-state module. One aim (raycast) service.
- **Replaces:** six broadcast subscribers, about 15 raw `keydown` listeners, six mouse listeners, six raycasts, about ten "is input blocked" predicates, the last-writer-wins flags and the `sit()` overloading.
- **Items:** §3.4 (most), §3.2-F11/F12/F27.

### P7. `src/random/`
- **Build:** `hash.ts`, `streams.ts` (with the frozen `lcg` and economy streams, plus a well-seeded `rng`), `draws.ts` (`pick`, `pickWeighted`, `shuffled`, `range`, `chance`); `time/daily` as the only day-draw entry.
- **Replaces:** five generators, seven hashes, six day-draw conventions, about 45 pick/range/shuffle helpers and the ad hoc seed multipliers.
- **Items:** §3.9-A1..A5, §3.5-30, §3.7-M5, §3.8-13.

### P8. `src/math/`
- **Build:** `scalar.ts` (THREE's clamp, lerp and smoothstep as canonical, plus `clamp01`, `gaussian`, `ramp`), `easing.ts`, `angles.ts`, `damp.ts`, `springs.ts`.
- **Replaces:** two `easeInOut` curves, two opposite `angleBetween`s, three `bump`s, 49 frame-rate-dependent smoothings and four springs.
- **Items:** §3.9-B1..B4.

### P9. `src/text/` and clock text
- **Build:** `formatCount`, `formatCoins`, `formatTickets`, `plural`, `ordinal`, `capitalise`, `normalise`/`searchKey`, `compareTitles`, `formatClock`, `formatDay`, `fileStamp`.
- **Replaces:** about 115 hand-made "N coins", 39 plurals, 3 ordinals, 16 capitalisers, 8 clock formatters, 4 title normalisers and the shelf/panel sort mismatch.
- **Items:** §3.9-C1/C2/D1/D2/G1/G2, §3.2-F18, §3.3-F8.

### P10. Time services
- **Build:** `time/GameClock` (as `today.clock`), `time/schedule.ts` (what is on, when, whether the weather allows it, and which clock it follows), `time/OncePerDay`, and `zone.after(seconds, fn)` on `core/Timers`.
- **Replaces:** six clock interfaces, 46 hand-threaded hour and day closures, about 15 once-a-day markers, about 8 "what's on" assemblers, and wall-clock `setTimeout`s in zone code.
- **Items:** §3.8-14/15/16/17, §3.9-C4/C5.

### P11. A money service
- **Build:** `economy/Money.ts`, the only holder of the wallet's mutators: `charge({ price, why, effect, once? })` with rollback and a `MoneyEvent`; one subscriber for the chip and the clink; read-only `MoneyView` for world and UI; deeds (loyalty, reputation) recorded with the sale and undone exactly.
- **Replaces:** about 20 direct wallet call sites, 21 wallet types, four feedback styles, pay-then-refuse and double pays.
- **Items:** §3.8-5/7/8/27, §3.7-M8, §3.1-10.

### P12. A store base and one composition root
- **Build:** `persistence/Store<T>`, `persistence/validate.ts`, a typed `KEYS` registry (`{ key, label, kind, exported }`), every store made once in `bootstrap/stores.ts`, and `closeSave()`.
- **Replaces:** about 70 hand-written stores, two key lists, stores made twice, and module singletons in `src/world`.
- **Items:** §3.8-1/2/3/4/19/22.

### P13. Events and disposal
- **Build:** `Listeners.subscribe(cb, { now })` (or `Observable<T>`) everywhere; `core/Disposables`; `{ signal }` on DOM listeners; GPU frees only through `disposeTree`.
- **Items:** §3.9-E1/E2, §3.2-F28.

### P14. A canvas module
- **Build:** `src/graphics/canvas/` with:
  - `canvasTexture` (colour or data, anisotropy intent, repeat, shared)
  - `canvasFor` (a density × quality policy)
  - `fonts.ts` (`CANVAS_FONT` from the same families as the CSS, plus `canvasFontsReady`)
  - `text.ts` (`fit` with one overflow policy, `drawTextBlock`)
  - `colour.ts` (one colour space, `PALETTE`)
  - `paper.ts`, `CanvasSurface` (dirty, fps, `visibleWhen`) and `CanvasAtlas`
- **Replaces:** two helper homes, 57 hand-made textures, 135 pinned anisotropy values, nine densities, about 20 fit/wrap loops, about 300 literal font strings, two `shade` maths and seven atlases.
- **Items:** §3.5-1..10/26/29, §3.9-H1/H2.

### P15. Hearing and an audio kit
- **Build:** one hearing service (one curve family, one occlusion with the routes); `audio/oneShot.ts` + `synth.ts` + a named `sfx/` catalogue; one continuous-sound graph class; `audio/music/` (`Sequencer`); one unlock and context getter; channels by category, with an explicit duck exception.
- **Items:** §3.6 (all).

### P16. Game hosting
- **Build:**
  - one `CanvasGame` contract and screen host for arcade and TV
  - `GameInput` with press edges
  - one machine base for all six machine kinds, with an `EndCard` painter
  - a `FixedStep` utility
  - one ranked score table
  - one per-machine payout mode
  - one CRT module with presets
- **Items:** §3.7 (all), §3.5-11..14.

### P17. 3D construction kits
- **Build:**
  - Palette completion: `LOOK`, an extended `METAL`, `GLASS`, `WATER`, weathered twins, `plaster()`, `plasticPaint()`, `materials/blend.ts`, and `IndicatorLed`.
  - Geometry: `boxMesh` with per-face materials, `roundedBox`, `ShellKit` (wall = mesh + collider + occluder), `rodBetween`, `cable`, `sagCurve` and `hangFromCeiling` everywhere.
  - Motion: one `Openness` animator for doors, drawers and lids.
  - Doors and windows: a door kit and a door-pair spec per connection; `WindowFrame` and `placeWindows`.
  - Lights: lamp parts plus `LampLevel`, zone `LightPool`s for stairs, street and cellar, one `ZoneAmbient`, and a powered-props broadcast.
  - People: a `CAST` registry, `Presence`, `PersonBase` + `Speaker`, and `streetWalker()`.
  - Zones: one prop registry with `placeProps()`, `placerFor`/`presentWhile` as the only show-when-owned primitives, `layForSale()`, `zone.run()`, `zone.after()` and `zone.setSolid()`.
  - One model per object (chair, table, rack, cardboard box, CRT case, carcass, tableware), shared by shop, home and street.
- **Items:** §3.10 (all).

---
## Part 3: Details by area

### 3.1 On-screen text: captions, hints, key caps, notices, HUD

This is the "tooltips" problem. Player-facing text comes from four families: the crosshair caption, the notices, panel status lines, and text painted in the world. Each family has its own renderer, its own way of naming keys and its own look. Three things are missing:
- a structured caption type;
- one input-hint and key-cap module that knows which device is in hand;
- one HUD root with shared tokens and one rule for showing and hiding.

**1. The hover caption is a string that is parsed back by guessing. (L)**
- Where:
  - `Interactable.label(): string` (about 120 implementations).
  - `ui/hoverCaption.ts:15-32` (" · " split, with a "lowercase last part is the verb" guess and a legacy `click|tap to` regex).
  - `ui/Overlay.ts:646-686` (name, then one device cap, then the verb).
  - `game/Session.ts:325-338` glues `${label} · ${movable.toLowerCase()}`.
  - `game/Rearranging.ts:123-139` + `ui/verb.ts:24-34` bake device words in ("Right-click to move", "· free", "· click for the spot beside").
  - States sit in the verb slot: `ChangeMachine.ts:90`, `OurMailbox.ts:39`, `TournamentBoard.ts:130`, `BenchSeats.ts:60`, `Television.ts:205`, `Projector.ts:307`, `props/Console.ts:141`, `StreetBus.ts:161`.
  - Keys sit mid-caption: `machineLines.ts:10-21`, `ArcadeCabinet.ts:316`.
  - Data sheets used as captions: `ForSaleBox.ts:237-258`, `shop/ForSale.ts:110-126`.
- Problem:
  - Garbled renders (Part 1, #1).
  - The mouse glyph can only show a left click.
  - Long captions are cut with an ellipsis inside the name (`styles.css:166,184`).
  - The docs contradict each other: the `add-interaction` skill says "Click to …", docs/architecture.md:430 says never.
- Fix:
  - `label(): Caption | null` with `Caption = { name; verb?: { text; input?: 'use' | 'grab' | ActionId }; state?; details? }`. A string means "name only" during migration.
  - The Overlay draws `state` dimmed with no cap, and one cap per verb.
  - Session builds a two-verb caption; Rearranging returns `{ name, verb, state: 'free' }`.
  - `crosshair--active` only when there is a verb.
  - Then delete the legacy regex and fix the skill.

**2. Five "tooltip" renderers plus OS tooltips. (M–L)**
- Where:
  - Crosshair `.hover-label` (`Overlay.ts:228-231`, `styles.css:164-231`).
  - Plan-view status strip (`planView/PlanView.ts:97-105,346-357`), with different words from `Rearranging.caption()`.
  - Market scan sprites (`ForSaleBox.ts:172-216`, `PriceScanner.ts`).
  - The touch badge (`TouchControls.ts:151-160`).
  - Native `title=` in `CataloguePanel.ts:218,279`, `CollectionEditor.ts:199,205,273`, `HagglePanel.ts:79`, `RepairPanel.ts:291`, `TouchControls.ts:181,239` (touch never hovers), and `WalletHud.ts:78,80` (never shown: `pointer-events: none`).
- Problem:
  - Five looks for "what is this".
  - One market box is described three ways ("★ wishlist", "★ on your wishlist", a red ★).
  - Two affordability rules: the tag fades on `coins < price` (`ForSaleBox.ts:93,129-131,281`), the scan label and caption use `item.due`.
- Fix:
  - One `ui/hud/Caption` chip for the crosshair and plan view.
  - `describeForSale(item, wallet)` feeding tag, scan label and caption.
  - Scan labels through a DOM world-anchor layer (generalise `SpeechLayer.ts:193-248`).
  - Drop `title=` for visible text or one small focus+hover tooltip helper.

**3. Keys and devices named six ways, mostly ignoring the device. (L)**
- Where:
  - `actionKeyLabel()` (keyboard-only) is called 42 times in 22 files: tips in `Seating.ts:45,68`, `Bed.ts:259`, `ArcadePlay.ts:95,133,203,293`, `ProgramPlay.ts:62,77`, `CopyOpening.ts:63`, `Labelling.ts:54`, `MarketCounter.ts:156,174`, `Browse.ts:77,175`, `Rearranging.ts:105,225,234,249`, `labelMaker.ts:39`, `firstDaySteps.ts:60,79`; canvases in `CabinetScreens.ts:191-193`, `Pinball.ts:504`, `AlleyRoller.ts:179`, `TicketWheel.ts:318`.
  - Device verbs in `ui/verb.ts` (18 calls), mixed into the same sentences.
  - `renderKeys` is device-aware in `GamePanel.ts:16-24` and `PhotoHud.ts:9-25`, but keyboard-only in `MarketCounter.ts:369-375`.
  - Literal `<kbd>`: `Overlay.ts:68-69,143`, `HagglePanel.ts:69,84`, `PrizePanel.ts:96`, `SearchBar.ts:53`, `TravelMenu.ts:84-89`.
  - `notices/dismissHint.ts:10-25` has its own device switch.
  - QWERTY hard-coded in the 13 arcade game hints, `arcadePlan.ts:169-203` and "HOLD SPACE" (`Pinball.ts:511`, `AlleyRoller.ts:197`).
  - Hard-coded "click" in `Bed.ts:259`, `CartonCorner.ts:77`, `GiveawayBox.ts:120`, `furnishHousehold.ts:81`, `Prizes.ts:48`, `PlanView.ts:167,351,354`.
  - Two device types: `ui/controls.ts:14 ControlDevice` and `input/lastDevice.ts:4 InputDevice`.
- Problem:
  - Wrong instructions on pad, touch and AZERTY (Part 1, #7).
  - Only Overlay and dismissHint redraw when the device changes.
- Fix:
  - `ui/inputHints.ts`: `hint(action | 'use' | 'grab', device = lastDevice()) → { text, html }`.
  - `{actionId}` tokens in tip, react, read and caption text, re-rendered on `onDeviceChange`.
  - Rebuild verb.ts, dismissHint, the TravelMenu and Overlay caps, and the GamePanel, MarketCounter, PhotoHud and PlanView hints on it.
  - Arcade games declare controls as action ids.
  - Add the TV-pad keys to `controls.ts`; merge the device types.

**4. Key caps styled in eight places. (M)**
- Where:
  - Global `kbd` (`styles.css:128-139`).
  - Overrides in `market.css:4-17`, `PhotoMode.css:105-112`, `PrizePanel.css:135`, `menu.css:163,227`, `notices.css:329`.
  - The caption caps `.hover-label__cap*` (`styles.css:186-217`).
- Problem:
  - Pad A is a green circle only in the caption.
  - Touch shows as "Tap", a finger glyph, or "✕ tap to put down".
  - The global cap is invisible on cream paper (`notices.css:254`).
  - `Overlay.ts:495` strips `<kbd>` with a regex.
- Fix: one `.key-cap` component (with a paper variant and glyphs for mouse L/R, wheel, coloured pad buttons, stick, finger), produced only by the module in item 3. Delete the local rules.

**5. HUD surfaces not tokenised. (M)**
- Where:
  - Caption `styles.css:164-181`; reaction `notices.css:132-160`; tip `:184-207` (12 px radius); subtitles `:104-119` (`rgba(10,10,14,.82)`, `#fff`); alert `:440-458`; reward `:349-361`.
  - Wallet `WalletHud.css:2-22`; dream card `household.css:98-112`.
  - Plan strip and photo card copy-pasted (`PlanView.css:18-47`, `PhotoMode.css:68-80`).
  - Six "error" reds, two greens, five papers.
- Fix:
  - Tokens `--hud-chip-*`, `--hud-text-sm/md/lg`, `--ok`/`--error`, `--paper-*`.
  - Three classes: `.hud-chip`, `.hud-card` and `.paper`. See §3.3.

**6. Show/hide and stacking: three hand-kept lists, equal z-indexes, clocks running while hidden. (M)**
- Where:
  - Hide lists: `body.menu-open` (`styles.css:90-98`), `body.photo-mode` (`PhotoMode.css:2-16`), `body.plan-view` (`PlanView.css:2-11`). None includes `.dream-card` or `.payout-overlay`.
  - `--z-hud: 2` equals `--z-overlay: 2`.
  - `RewardBanner`, `ReadingCard` and `TipBoard` count down while hidden.
  - `PrizePanel.ts:217` speaks into subtitles under the panel.
  - The wallet "stays over a panel" (`bootstrap/ui.ts:276`) but sits at z 2 under every panel, so panels repeat it.
  - "Below the touch bar" is worked out four ways (`styles.css:228,230`, `notices.css:343,461`).
- Fix:
  - One `.hud` root and one state attribute (`playing | menu | panel | photo | plan`) with one CSS rule per state.
  - Notices pause while their layer is hidden.
  - A `--z-menu` token; one `--hud-top`.

**7. The dream card is a notice outside `src/notices`. (S)**
- Where: `ui/household/DreamCard.ts:8-44`, `household.css:97-147`, `bootstrap/session.ts:100-106`. `game/Seating.ts:18-19,70-73` copies its 8000 ms into a `setTimeout`.
- Problem: real-time timer, X doesn't dismiss it, it hides with no fade, it's in no hide list, it sits under the touch bar, and it has its own card style.
- Fix:
  - `read({ look: 'dream', image })`, with `read()` returning a promise or taking `onClose` so Seating can chain the next tip.
  - Delete DreamCard and `DREAM_CARD_MS`.

**8. Fades: `ui/fade.ts` exists, but the notices roll their own. (S)**
- Where: `CrosshairLine.ts:5,38-46` (220 ms), `TipBoard.ts:9,94-104` (300 ms), `ReadingCard.ts:11,129-134` (320 ms), `RewardBanner.ts:10,55-62` (360 ms), `SpeechLayer.ts:48,179-190` (260 ms), `AlertBar.ts:5,68-76` (300 ms). Also `Fader.ts:25-31` uses inline styles.
- Problem: every duration is written twice (in TS and in CSS), and the notices ignore reduced motion.
- Fix: `fadeOut(el, cls, ms, done)` everywhere; one `--ui-fade-out` token.

**9. Each notice is put away differently. (S)**
- Where:
  - The reading card closes with X or a click, and shows a hint.
  - Tips close with X or a click, but show no hint.
  - The reward banner closes with X only; subtitles with X only; the dream card with a click only.
  - "note" names two different papers.
  - `TipBoard.ts:62` picks the note look from the heading text "To do".
  - "✕" means both "refused" and "close".
- Fix: one dismiss rule and hint for every notice that can be put away; an explicit look option; stop reusing ✕.

**10. Panel feedback bypasses the notice kinds. (M)**
- Where:
  - `setStatus` copied in `CataloguePanel.ts:374-377`, `SellPanel.ts:200-203`, `MarketPanel.ts:92-95`, `CollectionEditor.ts:324-327`.
  - Gains told only by a status line: `HomeShopPanel.ts:147`, `NoticeBoardPanel.ts:198,212,220`, `JobLotPanel.ts:92`, `CollectorBookPanel.ts:175`, `SellPanel.ts:192`, `CataloguePanel.ts:312,347`, `PrizePanel.ts:189`.
  - Others raise a reward: `PrizePanel.ts:216-219`, `RepairPanel.ts:249`, `ConsoleDeskPanel.ts:61-62`, `Purchases.ts:44`.
- Problem: the same purchase looks different depending on where it's made. Docs/notices.md says a gain is always a reward.
- Fix: one `ui/panelStatus.ts`; every gain goes through `notices.reward`. See also §3.8-5.

**11. "Again to confirm".** See Part 2, P2.

**12. In-world price and status tags: six painters. (M)**
- Where: `ForSaleBox.ts:278-329`, `shop/PriceTag.ts:132-162` (inlines the hand font although `lettering.ts:9` exports it), `SealedCartonModel.ts:97-110`, `BargainBin.ts:99-117`, `covers/generated/PaperTag.ts:8`, `repair/ConsoleProp.ts:53-71`.
- Problem: three fonts and formats at one market; the "can't afford" fade is written twice with different colours.
- Fix: `world/labels/tags.ts paintTag({ lines, price, unit, paper, band, stamp, faded, star })` with one affordability rule. See also §3.5-22.

**13. Arcade instructions written in four places. (M)**
- Where:
  - `game.hint`.
  - The cabinet card (`cabinetModel.ts:74`, `InstructionCard.ts:35-40`).
  - The plan's card lines (`arcadePlan.ts:169-203`).
  - The edge caption (`machineLines.ts`).
  - The screen canvases.
- Problem:
  - Three wordings for one action: "E walks away", "E TO WALK AWAY", "E or a click walks away (the play is lost)".
  - The caption also contradicts the double-press rule (`ArcadePlay.ts:195-209`).
- Fix: one controls spec per machine, in action ids, rendered into tip, card, screen and caption, and repainted on `onKeyLabelsChange`.

**14. The 3D hover cue: one documented rule, dozens of exceptions. (M)**
- Where:
  - `HoverGlint` is used in 36 files.
  - 27 empty `setHovered`.
  - Hand-made glints: `props/Door.ts:191-193`, `BalconyDoor.ts:113`, `LiftButton.ts:35`, `HouseKeys.ts:77`, `ChannelDial.ts:58`, `TicketWheel.ts:185`.
  - Whole-material tints, against docs/props.md:48-51: `cat/CatModel.ts:425`, `PriceTag.ts:101`, `FoodBowl.ts:181`, `Notebook.ts:50`, `CollectorsBook.ts:56`, `HomeGoodsDisplay.ts:78`, `RecordCrate.ts:68`, `OrderCounter.ts:70`, `BuyBackDesk.ts:75`, `Lodge.ts:170`, `BallotBox.ts:46`, `PartyTable.ts:85`, `Projector.ts:302`, `Console.ts:130`, `Window.ts:275`, `RecordPlayer.ts:128`.
  - Colour swaps on arcade marquees.
  - `game/Highlighter.ts` and `GameBox.setGlow` write the same emissive, and `Highlighter.clear` restores a stale value.
- Fix:
  - A `HoverCue` service applied by the Interactor (glint + two sanctioned variants), with `caption-only` declared.
  - The search highlight on its own channel.

**15. "Show this tip once" and notice durations decided by callers. (S–M)**
- Where:
  - Once-only memories: `Rearranging.ts:95,253-257`, `ArcadePlay.ts:60,124-134` (plus FirstDay's `hinted`), `FirstDay.ts:199-213`, `labelMaker.ts:35-40`, `PointerLockFlow.ts:47,169-172`.
  - `FirstDay` assumes a tip lasts 2×read time, while `TipBoard.ts:55,71` uses max(12 s, 2×read).
  - Real-time `setTimeout` notices: `furnishKitchen.ts:238`, `placeHunt.ts:100`, `BuildingHunt.ts:83`.
- Fix: `tip(text, { id, once: 'session' | 'save' | n })` with a saved seen-set; tips return `onGone`; `notices.later(ms, fn)` counts only attending time.

**16. The crosshair column has three owners. (S–M)**
- Where: Overlay (a 687-line file that is mostly the pause menu), `CrosshairLine.ts`, `TouchControls.ts:151-160`. Their order exists only as CSS `order:` values.
- Fix: `ui/hud/CrosshairHud` owns the crosshair, caption, reaction slot and badge.

**17. Docs steer people toward the divergence. (S)**
- Where:
  - `add-interaction/SKILL.md:16-17` ("Click to …"), `:62-63` (says to use the device-blind `actionKeyLabel`), `:79-85` ("a new module with its own .css" per HUD element).
  - Leftover "toast" wording: `--z-toast`, `Fader.css:1`, `CollectorWatch.ts:32,37`.
- Fix: rewrite after items 1–5.

---
### 3.2 Panels, modals and menus

**Inventory:** 32 DOM surfaces.
- 24 `ModalPanel` classes:
  - 10 full-screen "sheets": CollectionEditor, Catalogue, Sell, and 7 `MarketPanel` subclasses.
  - 14 centre "cards": Prize, ArcadeScreen, Storage, News, ToDoNote, Journal, ScratchCard, Borrow, Copro, Label, Phone, Wardrobe, Repair, ConsoleDesk.
- 8 surfaces outside the system: Overlay, TravelMenu, SearchBar, GamePanel, DreamCard, PhotoHud, the PlanView HUD, PayoutOverlay.

All panels build with `innerHTML` and `escapeHtml`, and none removes its listeners.

**Target: a panel kit, `src/ui/panel/Panel.ts`, replacing `ModalPanel`.**
- A typed `open(data)`.
- Layouts: `sheet | card`, plus a `skin`.
- A standard skeleton: header with title, meta and dismiss; a `role=status` line; a scrolling body; a fixed footer.
- Built-in behaviour:
  - backdrop close (pointerdown and click both on the backdrop)
  - a default-focus policy
  - `refresh()` that restores focus
  - `setStatus()`
  - `onBack()`
  - Enter shortcuts that skip buttons
  - UI sounds
  - key-hint refresh on device or binding change
  - an AbortController plus `dispose()`
- Shared pieces: `ConfirmDialog`, `ArmSet`, and widgets (tabs, segmented choice, `gameRow` + `coverImg`, `priceHtml`, `searchField` + `filterGames`, rows, empty state, `studioPhoto`, `keyHint`).
- One `panel.css`; skins become token sets.
- An auto-escaping `html` tag.
- A `PanelRegistry` so the world calls `openPanel(id, data)`.

**F1. Three copies of the sheet frame next to the extracted one. (M)**
- Where:
  - `MarketPanel.ts:27-35,92-99` is the extracted frame.
  - Copies: `CataloguePanel.ts:79-94,162-164,374-377` and `SellPanel.ts:61-70,102-104,200-203`.
  - `CollectionEditor.ts:51-61` + `CollectionEditor.css` duplicates `CataloguePanel.css` rule for rule.
  - `TradePanel.ts:26` injects its search with `insertAdjacentHTML` because the frame has no slot for it.
- Problem: paddings, gaps and title weight have already drifted.
- Fix: `MarketPanel` → `SheetPanel` with wallet, blurb, search and header-action slots; Catalogue, Sell and CollectionEditor extend it.

**F2. The centre card frame copy-pasted in 12 panels, TS and CSS. (M)**
- Where:
  - TS: `StoragePanel.ts:22-26`, `BorrowPanel.ts:33-37`, `CoproPanel.ts:32-36`, `LabelPanel.ts:29-33`, `PhonePanel.ts:74-79`, `WardrobePanel.ts:23-27`, `RepairPanel.ts:69-71,104`, `ConsoleDeskPanel.ts:29-33`, `NewsPanel.ts:28-32`, `ToDoNotePanel.ts:19-27`, `JournalPanel.ts:53-57`, `ScratchCardPanel.ts:45-61`.
  - CSS: the same backdrop, card and h2 blocks in 10 files.
- Problem:
  - Card widths are 24, 26, 30, 34, 36 and 44 rem.
  - The dim text class is redefined 6 times.
  - `ConsoleDeskPanel` borrows `.repair`.
  - Backdrops: `--ui-backdrop` with no blur, blurred ones in Prize (`rgba(6,4,12,.8)`) and Arcade (`.88`), and sheets and menu blurred.
- Fix: `CardPanel` layout with a `--panel-width` scale and one backdrop token.

**F3. Leaving a panel works differently everywhere. (S–M)**
- Labels: "Close", "Close Esc", "Done", "Put it back", "Close the book", "Think about it", "Not now", "Cancel", "Put it down", "Close the doors", "Stay", "‹ Back". Three of these have an `aria-label` different from the visible text.
- Placement: header-right, footer-right, footer-left or centred.
- Primary button: on the left in Borrow and Copro, on the right in Label and the Overlay confirm.
- Backdrop:
  - 12 cards close on any backdrop click, touch included.
  - Prize does not.
  - The menu resumes on a backdrop click for the mouse only.
- Fix: the kit renders the dismiss control in one place, with the flavour verb as label and aria, a device cap, a backdrop option using the menu's touch policy, and a primary-last rule.

**F4. A drag that ends on the backdrop closes the panel (bug, Part 1 #29). (S)**
- Where: all 12 `target === this.root` handlers. The browser sends `click` to the common ancestor of pointerdown and pointerup.
- Fix: close only when pointerdown *and* click both hit the backdrop.

**F5. No focus policy on opening. (S)**
- Where:
  - Commit buttons are focused: `BorrowPanel.ts:54`, `CoproPanel.ts:112`, `JobLotPanel.ts:66` (one press buys), `NeighbourTradePanel.ts:51`, `HagglePanel.ts:68`.
  - Nothing is focused in News, Scratch, empty Storage, and CollectionEditor outside `?debug` (its autofocus target is hidden; `ModalPanel.ts:127-130` checks only `:disabled`).
- Fix: visible `[data-autofocus]`, else the first non-committing control, else dismiss.

**F6. Focus restore after a repaint: two implementations, five panels with none. (S–M)**
- Where:
  - `ui/rememberFocus.ts:11-25` and `MarketPanel.refresh` + `focusKey` (`:72-80,108-111`).
  - None in `CoproPanel.ts:80-115`, `WardrobePanel.ts:40-57`, `PhonePanel.ts:174-183`, `ConsoleDeskPanel.ts:66-87`, `RepairPanel.ts:282-302`.
- Problem: focus falls to body; Tab then swaps the panel (Part 1 #31).
- Fix: one kit `refresh()`.

**F7. "Click twice" written 8 times in panels; 3 copies show stale labels. See Part 2, P2. (M)**
- Where: `CollectionEditor.ts:216-230` (a literal 4000), `CataloguePanel.ts:283-362` ("Used…" never expires), `SellPanel.ts:160-193`, `TradePanel.ts:61-92` (no timer), `HomeShopPanel.ts:129-139`, `PrizePanel.ts:173-190` (no timer), `ConsoleDeskPanel.ts:48-74` (no timer).
- The armed look is defined 4 times.

**F8. Which irreversible actions ask first is arbitrary. (M)**
- Where:
  - `Overlay.confirm` (`Overlay.ts:350-360`) is the only dialog. Panels can't use it, and it is misused as an alert ("Not a save": Cancel + OK, `SaveFileSettings.ts:42`).
  - One-click irreversible actions: JobLot buy, NoticeBoard "Sell it" and "Buy", NeighbourTrade swap, the paid Copro vote, the Phone deposit, Prize "Take it", collection "Remove" and "Import JSON", "Reset keys".
  - Meanwhile "Load a save…" and "Reset settings" ask.
- Fix: a `ConfirmDialog` usable inside panels, plus a written rule: spending or losing a game → ArmSet; destroying data → dialog; errors → `notices.alert`.

**F9. Seven names for "give the panel its data, then open it". (M)**
- Where:
  - `show()`: Storage, Borrow, Label, Scratch.
  - `print()`: News.
  - `prepare()`: Copro, NeighbourTrade, Repair.
  - `start()`: Haggle, Trade.
  - `forShop()`: HomeShop.
  - Setters: Phone.
  - A constructor option: Sell `buyer`.
  - Only `ArcadeScreenPanel.ts:30,60-65` uses the typed `open(...args)`. `ModalLike.toggle()` takes no data (`SessionParts.ts:55-63`).
- Fix: `session.openPanel(id, data)` → `panel.open(data)` → `onOpened(data)`.

**F10. Four routes from the world and the menu to a panel. (M)**
- Where:
  - Named slots: `ModalStack.ts:7-21`, `Session.ts:250-261`, `SessionActions.ts:151-159`.
  - Generic `openPanel` through `WorldPanels` (about 20 sites).
  - `MarketCounter.showModal` → `openHolding`.
  - The self-opening ArcadeScreen.
  - The pause menu uses three methods (`bootstrap/ui.ts:91,156,170-173`).
  - Eager vs on-first-open watching.
  - Dead `onOpenChange`.
  - BorrowPanel is built inside a world class (`Visitors.ts:216`).
- Fix: a `PanelRegistry` in `bootstrap/ui.ts`; watch every panel eagerly; delete the named slots.

**F11. Three ways to keep keys from the game; SearchBar and TravelMenu outside the system. (M)**
- Where:
  - ModalPanel stops keydown at its root, so it depends on focus (`ModalPanel.ts:55-60`).
  - SearchBar lets keys bubble and relies on Session's `deaf` route.
  - TravelMenu reads the global Input.
  - The Overlay's `handledCode` is read by PointerLockFlow.
  - SearchBar is not in MenuNav, so the D-pad and B don't work there, although the pause menu offers "Search a game" for controllers.
  - ModalStack closes the search when a panel opens, but not the travel menu.
- Fix: an `InRoomOverlay` base for SearchBar and TravelMenu; panel key isolation at window capture while open. See §3.4-1.

**F12. Two controller-navigation engines. (M)**
- Where: `menu/MenuNav.ts:87-129` (every focusable element) and `Overlay.ts:553-636` (`[data-nav]` only, plus slider nudging and back-one-screen). JournalPanel adds `data-nav` by hand.
- Fix: register the Overlay with MenuNav; one selector model.

**F13. Sub-pages can't step back. (S)**
- Problem: B or Esc on the phone's stall page closes the phone; mid-repair it closes the panel and drops the job.
- Fix: a protected `onBack(): boolean`, checked by ModalStack.

**F14. Enter is hijacked differently per panel. (S)**
- Where:
  - `LabelPanel.ts:71-76` prints on Enter even on Cancel.
  - `HagglePanel.ts:99-103`: Enter takes the counter-offer although "Fair" is focused, while A on the same button makes the Fair offer.
  - ScratchCard ignores Enter on buttons.
- Fix: the kit forwards Enter and Space shortcuts only when focus is not on a control.

**F15. Arrow keys can't leave a search field. (S)**
- Where: `MenuNav.ts:65` skips arrows in fields, while SearchBar handles them and the D-pad leaves the field.
- Fix: a shared search-field behaviour: Down into the list, Up back to the field.

**F16. Search and filter written four ways. See §3.9-G1. (S–M)**
- Where:
  - A debounced runner copy-pasted (`CollectionEditor.ts:234-259` ≡ `CataloguePanel.ts:166-191`).
  - Substring filters (`SellPanel.ts:108-114`, `TradePanel.ts:45-50`).
  - Fuzzy (`SearchBar.ts:104-124`).
  - The player's own collection list has no filter.

**F17. Game rows, covers and placeholders. (M)**
- Rows: five row styles (`CataloguePanel.css:37-44`, `CollectionEditor.css:77-89`, `household.css:59-82` ≈ `repair.css:102-120`, `StoragePanel.css`).
- Covers:
  - `coverAttrs` is missing in `SellPanel.ts:132`, `TradePanel.ts:95`, `JobLotPanel.ts:50`, so their placeholders are grey with an empty platform band.
  - Dead per-panel `error` listeners (`CataloguePanel.ts:156-159`, `SellPanel.ts:83-85`, `MarketPanel.ts:49-51`) act on an `<img>` already replaced.
- Condition wording: `PhonePanel.ts:186-188` and `GamePanel.ts:122-126` word condition their own way instead of `pricing.describeCondition`.
- Fix: `gameRow()` + `coverImg()` + `.ui-rows`.

**F18. Prices and money: `money.ts` is used by no panel. See §3.9-D1. (S–M)**
- Where:
  - "N coin(s) in your pocket" three times.
  - `coinsHtml` rebuilt by hand in Catalogue and Sell.
  - Hand-written `toLocaleString` in 4 panels.
  - The coin glyph drawn 5 ways.
- Fix: `priceHtml`, `walletLine`, one `.ui-coin`.

**F19. About 8 status-line implementations with mixed accessibility. (S)**
- Problem:
  - Some have no role. Copro uses `role=status`, Label `role=alert`, Scratch and Repair `aria-live`.
  - ConsoleDesk replaces its live node on every render, so nothing is announced.
- Fix: the kit's `setStatus(text, tone)`, plus a rule for when a panel also raises `notices.reward`.

**F20. Tabs written four times. (S)**
- Where: Overlay settings (`Overlay.ts:154-157,498-513`), `ControlsScreen.ts:23-27,55-61`, NoticeBoard (roving tabindex), CollectorBook (a copy that borrows `.notices__*`).
- Fix: `widgets/tabs.ts` and one `.ui-tabs` style.

**F21. The segmented choice built four times; text size has two controls. (S)**
- Where:
  - Copies of the segmented choice: `settings/fields.ts:65-85 choice`, `QualityPicker.ts:18-25`, `ControlsScreen.ts:28-32`.
  - Text size is set both from the start card's row (`Overlay.ts:148,191-196,471-478`) and from the Settings field.
  - CatSettings uses a different form layout.
- Fix: use `fields.choice` everywhere; add text and select fields.

**F22. "Paper" skins reimplemented per panel. (M)**
- Where:
  - News, ToDoNote, Journal and the review card each define their own paper, ink, shadow and tilt. Only ReadingCard and the leaflet use variables.
  - Three hand-styled paper buttons, none with the 44 px touch minimum.
  - `.visually-hidden` exists only under the to-do note.
  - "A paper to read" is a panel, a notices card or a HUD card depending on the feature.
- Fix: one paper token skin, a paper `.ui-btn` variant, a global `.visually-hidden`, and DreamCard as a ReadingCard look.

**F23. Key hints in panels hard-coded or device-blind. See §3.1-3. (S)**

**F24. The same job done by different kinds of panel. (M)**
- Where:
  - Selling: SellPanel (a sheet) vs ConsoleDeskPanel (a card, no timer).
  - One-offer exchanges: BorrowPanel (a card) vs NeighbourTradePanel (a full sheet showing "N coins in your pocket" though "no coins change hands").
  - `MarketPanel` is the base of non-market panels.
- Fix: ConsoleDesk as a SellPanel configuration; one "offer card"; `SheetPanel` with an optional wallet.

**F25. Downloads and file pickers written three times. See §3.9-H4. (S)**
- Where: `share/download.ts:2-12`, `CollectionEditor.ts:301-310`, `photo/savePhoto.ts:18-25`; two JSON pickers, one confirming and one not.

**F26. The studio-photo slot is duplicated. (S)**
- Where: `PrizePanel.ts:249-260,301-304` and `HomeShopPanel.ts:88-116`.
- Fix: `widgets/studioPhoto.ts`.

**F27. Photo mode and plan view duplicate each other. (M)**
- Where: `PhotoMode.ts:86-142` and `PlanView.ts:114-196`.
- Both:
  - park the player
  - save and restore the camera
  - disable the interactor
  - swallow mouse events
  - toggle a body class
  - show the same `rgba(10,10,14,.66)` card
- Fix: an `InRoomMode` helper; HUD hiding via `data-hud` (see §3.1-6).

**F28. No teardown model; dead code. (S)**
- Where:
  - `dispose()` is never called (News, Scratch, HomeShop).
  - `registerPanel` has no unregister.
  - MarketPanel drops its wallet unsubscribe.
  - `CollectionEditor.addPanel` and `__extras` are dead.
  - Permanent window listeners in Repair, ArcadeScreen, PhotoMode, PlanView and KeyBindingsForm.
  - PrizePanel repaints on every wallet change even while closed (`:112-113`).
- Fix: an AbortController in the kit; guard subscriptions with `isOpen`.

**F29. Escaping is by hand per interpolation; one is missed (bug, Part 1 #15). (S, then M)**
- Where: `CollectionEditor.ts:202` renders `status` raw; `PlanView.ts:166-167` puts layout-printed key names raw into `innerHTML`.
- Fix: an auto-escaping `html` tagged template with a `raw()` escape hatch; validate `status` on import.

**F30. Layout details. (S)**
- Problem:
  - Cards scroll as a whole, so Close and Post scroll out of view.
  - Only the menu pads for safe areas, although `viewport-fit=cover` is set.
  - Seven title sizes.
  - Six entrance animations; DreamCard, PhotoHud and PlanView have none.
- Fix: in the kit frame: fixed header and footer, safe-area padding, one in/out animation pair.

**F31. UI sounds depend on the device. (S)**
- Problem: the menu plays its sounds on mouse and keys; panels play them only from a controller; PrizePanel plays "pick" on its own.
- Fix: the kit plays "pick" on any `[data-action]` and "back" on dismiss, whatever the device.

**F32. Some panels need a pointer. (M)**
- Problem: RepairPanel's SVG targets are not focusable and it has no key path; SearchBar is unusable on a pad.
- Fix: focusable hit targets with a "next step" key; add "playable with keys and pad" to the kit's checklist.

**Noticed alongside:**
- `HomeShopPanel.ts:141` builds a `new Transactions({ wallet })` per purchase; see §3.8-19.
- The review card's link is unclickable (`styles.css:244`).
- The `agent` shop has no leaflet theme, so it prints on the furniture shop's paper (`economy/homeGoods.ts:8` vs `HomeShopPanel.css:19-22`).
- `ModalStack.ts:89` says panels "mute the room"; nothing does.

---
### 3.3 CSS and the visual design system

**Numbers:**
- 33 CSS files (3,563 lines).
- 29 `--ui-*` tokens exist (`ui/styles.css:12-65`) and are used 327 times.
- But 417 colour literals remain, 282 of them distinct; 163 without the two themed panels.
- `photo/PhotoMode.css` and `planView/PlanView.css` use no token at all.
- 54 font sizes, 12 letter-spacings, 21 radii, 46 shadows, 62 spacing lengths, 31 durations, 33 keyframes (14 of them "fade + small move").
- `.ui-btn` is resized in 16 contexts, next to 13 other button styles. Focus rings are declared 13 times.
- No dead classes, but several dead or redundant declarations (F35).

**Target:**
- `ui/design/tokens.css`, `base.css` and `components.css`, loaded once with `@layer tokens, base, components, panels, themes`.
- Themes (prize counter, shop leaflet, paper looks) only set slot variables (`--surface`, `--ink`, `--accent`, `--rule`, `--focus`, `--btn-*`).
- A CSS pass in `check-conventions.mjs`.

**F1. Six looks for small captions and chips, plus OS tooltips. See §3.1-2. (M)**
- Fix: one `.ui-chip` with `--caption`, `--line` (a 4 px tone stripe) and `--readout` modifiers.

**F2. Tokens are bypassed, and nothing enforces them. (L, incremental)**
- Where:
  - Raw copies of token values: `collector.css:12` `#15151d`, `notices.css:396`, `PhotoMode.css:48`.
  - Hand-derived tints: `notices.css:358,150`, `WalletHud.css:72`.
  - A token fallback that disagrees with the token: `CoproPanel.css:65` `var(--ui-danger, #d55)`.
  - Raw vs token counts: HomeShop 47/7, Prize 133/10, Wallet 21/7.
- Fix: write derived colours as `color-mix()`; add the missing token families; add the lint.

**F3. One gold token, fourteen golds. (S–M)**
- Where: `#ffd766` (WalletHud, notices), `#ffe066` (Prize), `#ffd23a` (Scratch), `#f0d070` (repair), `#f3dfa6` (catalogue price), `#fff3d0`, `rgba(255,220,130,…)` (sprint ring), `#fff2d0` (plan cursor), `#b8862b` (Journal), and five different gold glows.
- Fix: `--ui-accent-bright`, `--ui-money` (every amount of coins) and `--ui-glow-accent`.

**F4. Status colours: no success token, many reds, two blues. (S)**
- Where:
  - Greens: 8 values, no token.
  - Reds: `rgba(200,68,58,…)` (not the token's rgb) in 5 files; four light-red texts; two error surfaces (`notices.css:152,448`); `#d55`; two reds on paper.
  - Blues: `#8fc7ff` against `--ui-info`.
- Fix: `--ui-success/-soft`, `--ui-danger-text/-soft/-surface`, `--ui-info-text`; paper themes set `--ink-good` and `--ink-bad`.

**F5. Dark surfaces and text whites. (S)**
- Where: `rgba(10,10,14,.66)` (Photo, Plan), `.82` (subtitles), wallet and reward gradients, `#0b0b10`; whites `#f2f2f2`, `#fff`, `#f1edf6` against `--ui-text`; 23 white alphas.
- Fix: three surfaces (`--ui-panel`, `--ui-panel-glass`, `--ui-panel-solid`); `--ui-text` everywhere; two border alphas.

**F6. Six backdrop dims, blur on four. See §3.2-F2. (S)**
- Fix: put the backdrop on `.ui-modal--centre` once, with one `--ui-backdrop-blur` policy checked with `?stats`.

**F7. Paper surfaces: 11 to 15 papers, 8 inks, 3 variable schemes. (M)**
- Where:
  - Papers: speech `#fbf8f1`, tip `#fdfcf7`, journal `#fbf8ef`, news `#f1ebdc`, reading `#f4ecd8`, letter `#fdfcf8`, review `#efe8d8`, receipt `#f5f1e6`, shop `#f3ece0`, scratch `#f4efe2`.
  - Six paper shadows.
  - Tilt written with `rotate:` in some files and `transform: rotate()` in others.
  - Squared paper copy-pasted at 16 px and 20 px.
- Fix: `.ui-paper` with slots and `data-paper="note|letter|news|squared|ruled|receipt"`; also `color-scheme: light` (F36).

**F8. Coins, tickets and balances. See §3.2-F18. (S)**
- Where:
  - Coins: one SVG (`WalletHud.ts:30-37`) and four CSS gradients with different stops.
  - Tickets: a pink SVG, `#e0566b` and `#ff9021`.
  - The balance is shown 5 ways.
- Fix: `.ui-coin` and `.ui-ticket` from the wallet's SVGs; `coinsHtml` and `ticketsHtml` in `money.ts`.

**F9. Type scale. (M)**
- Where:
  - Body sizes: .7, .72, .74, .75, .78, .8, .82, .85, .88, .9, .92, .95, .98, 1, 1.02, 1.05, 1.08, 1.1 rem.
  - Ten small sizes have no pixel floor: `CataloguePanel.css:84` is .42 rem (about 6.7 px); `reviewCard.css` uses .6–.68 rem; `PayoutOverlay.css:21` is a fixed 11 px that ignores the text-size setting.
- Fix: `--fs-2xs` (`max(.68rem, 11px)`) up to xl, plus `--ls-*` and `--lh-*`.

**F10. Titles, section heads and small-caps labels. (S)**
- Where: h2 sizes 1.2, 1.25, 1.3, 1.35, 1.5, 1.7 rem plus two clamps; 7 h3 recipes; 10 small-caps recipes; `font-weight: 400` written 34 times.
- Fix: `.ui-title`, `.ui-section-title`, `.ui-eyebrow`.

**F11. Font stacks. (S)**
- Where:
  - Three ad hoc monospace stacks.
  - `--ui-font-hand` and `--ui-font-comic` are OS fonts, ordered differently from the canvas copies.
  - Permanent Marker (29 KB) and VT323 are each used by one rule.
- Fix: `--ui-font-mono`; self-host one OFL handwriting face; the canvases read the same stacks (§3.5-8).

**F12. Spacing: 62 lengths, no scale. (L, incremental)**
- Where: card paddings in seven recipes; card widths 24, 26, 30, 34, 36, 44 rem.
- Fix: `--sp-1..6` and `--card-w-sm..xl`, migrated through the component work.

**F13. Radii and shadows. (S)**
- Where: about 45 raw radii (2, 3, 4, 8, 10, 14, 18, 999 px, .6em); the kbd radius is 4 px in one place and 3 px in another; 46 shadows.
- Fix: radii `-xs`, `-sm`, `-md`, `-pill`; shadows `-paper` and `-raised`.

**F14. Motion. (M)**
- Where:
  - 31 durations with mixed units; easings `ease`, `--ui-ease`, `ease-out` and two overshoots.
  - 14 entrance keyframes.
  - 15 exit durations written in both TS and CSS: `ModalPanel.ts:9`↔`menu.css:26`, `TravelMenu.ts:98`, `GamePanel.ts:117`, `Overlay.ts:419,423,658`, `SearchBar.ts:101`, `WalletHud.ts:24-25`, and the six notices.
  - `Fader.css:8` is dead.
  - Two names for closing (`--closing` ×6, `--out` ×8).
  - Stacked entrances: Prize runs `ui-modal-in` and `prizes-in`; the shop leaflet's text slides on its paper; the menu runs three.
- Fix: `--dur-1..4` and `--ui-ease-pop`; one `ui-enter` keyframe driven by variables; TS reads the exit time from CSS or `transitionend`.

**F15. Stacking. See §3.1-6. (S)**
- Fix: also rename `--z-toast` to `--z-notice`.

**F16. Three hand-kept hide-the-HUD lists. See §3.1-6. (S)**

**F17. Top-centre of the screen has six owners. (S)**
- Where: `.alert-bar`, `.hover-label--edge`, `.dream-card`, `.plan-view-hud`, `.search-bar`, `.reward-stage`, at 1 rem, 1.5 rem, 2.5 rem and 16 vh; only the alert and the edge caption coordinate.
- Fix: a `hudSlot('top-centre')`.

**F18. The centre-panel shell copy-pasted 10 times; footers in 11 recipes. See §3.2-F2. (S)**
- Fix: about 150 lines go once `.ui-modal__card` and `.ui-actions` (right-aligned, primary last) exist.

**F19. Catalogue and collection editor are the same CSS twice; `catalogue__*` is the de facto list kit used by 9 other panels. (M)**
- Fix: `.ui-sheet__header`, `.ui-field`, `.ui-status`, `.ui-empty`, `.ui-row`, `.ui-thumb`.

**F20. Text inputs in five styles. (S)**
- Where: SearchBar shows focus only by a border change (`outline: none`); `select option` is styled three times.
- Fix: `.ui-field`.

**F21. Buttons. (M)**
- Where:
  - `.ui-btn` base (`menu.css:50-81`) with 16 size overrides; `menu.css:179` ≡ `:218`.
  - 13 separate styles: four in the prize counter, the shop, the repair tool, three near-identical paper ghosts (Journal, News, ToDo), payout, the touch bar, the label tapes.
  - 44 px targets: `pointer: coarse` in some places, width ≤ 480 px in others, opt-in elsewhere, missing on the repair tools and paper buttons.
- Fix: modifiers `--sm`, `--lg`, `--ghost` (currentColor), `--pill`, `--block`; reskins set `--btn-*`.

**F22. The armed state: 4 copies, 2 looks, an off-token red. (S)**
- Where: `market.css:18` and `SellPanel.css:3` are no-ops (shadowed by `CataloguePanel.css:107`). See Part 2, P2.

**F23. Selected and checked states. (S)**
- Problem: "pick one of N" is grey in the vote (`aria-pressed`) and gold in Settings and the label maker (`aria-checked`, written 3 times).
- Fix: one treatment for choices, one for tabs.

**F24. Two tab bars. See §3.2-F20. (S)**

**F25. Key caps. See §3.1-4. (S)**
- Fix: `.ui-kbd` from currentColor works on dark and paper backgrounds alike.

**F26. Focus rings: 13 declarations in 11 files. (S)**
- Where: offsets of 1 and 3 px; Prize uses 3 px yellow; TravelMenu uses border + fill; there is no ring at all on SearchBar, the payout overlay or the touch bar.
- Fix: one global `:focus-visible` from `--ui-focus*`.

**F27. Rows and lists: six row styles, two divider techniques, the list reset written 11 times. (S)**

**F28. Badges and pills: seven implementations; text on gold is `#1a1408`, `#1a0a08` or `#15151d`. (S)**
- Fix: `.ui-badge` with a `--tone`; `--ui-on-accent`.

**F29. Muted text via colour vs opacity (7 opacity values); 15+ one-off "dim note" classes. (S)**
- Fix: `--ui-text-dim`, `--ui-text-faint` and `.ui-note`.

**F30. Eleven status-line styles. See §3.2-F19. (S)**

**F31. Responsive and touch. (M)**
- Where:
  - Breakpoints at 480, 560, 800 and 820 px.
  - Three touch signals; `body.touch-device` is set (`TouchControls.ts:195`) and never used (verified).
  - `--touch-bar-bottom` falls back to 3.9 rem in one place and 0 in another.
  - Safe-area insets only on the menu and the touch bar.
- Fix:
  - Two documented breakpoints.
  - `body.input-touch` for layout, `pointer: coarse` for target size only.
  - `--safe-*` tokens.

**F32. Reduced motion handled three ways. (S)**
- Where: a global clamp; per-file overrides; TS-toggled classes (`reward--calm`, `photo-flash--dim` needing two `!important`).
- Fix: one attribute for decorative loops, stopped by one rule.

**F33. Naming. (M, mechanical)**
- Where:
  - Elements written as separate blocks (`.plan-view-hud`, `.photo-card`).
  - Mismatched blocks (`.home-shop` / `.shop__*`).
  - Borrowed classes (`catalogue__*`, `notices__tabs`, `sell__armed`).
  - Four state styles (`--mod`, `is-done`, `is-pressed`, `.on`).
  - `.notices*` on the notice-board panel collides with `src/notices`.
  - Generic global keyframe names.
- Fix: shared classes are `ui-*`; BEM in panels; state through ARIA attributes or modifiers; prefixed keyframes.

**F34. File organisation and theming by override. (M)**
- Where:
  - `.ui-btn`, `.ui-card` and `.ui-modal` live in `menu/menu.css`, imported only by `ModalPanel.ts` and `Overlay.ts`.
  - The list kit lives in `CataloguePanel.css`.
  - HomeShop undoes `.ui-card` and re-styles the catalogue with about 15 overrides.
  - 11 `!important`.
- Fix: the `ui/design/` layers.

**F35. Leaky selectors, split rules, dead declarations. (S)**
- Where:
  - `.game-panel p/footer` leaks into the review card.
  - `.reading` is split over 3 blocks.
  - `#app canvas` is defined in two files.
  - Dead or no-op: `market.css:18`, `SellPanel.css:3`, `LabelPanel.css:39,53`, `collector.css:2`, `Fader.css:8`, the `touch-device` class.

**F36. Paper panels inherit `color-scheme: dark`, so they get dark scrollbars on cream paper (Journal, News, ToDo). (S)**

**F37. Inline styles and canvases that copy tokens. (S)**
- Where:
  - Good pattern: set a `--var` inline (Prize, Label, coverPlaceholder, PhotoHud, TouchControls).
  - Raw properties instead: `CollectionEditor.ts:183`, `CollectorBookPanel.ts:119`.
  - Canvas copies of tokens with drift: `valueChart.ts:3-7`, `share/collectionCard.ts:29-32`, `collectionPage.ts:31`, `ToDoNote.ts:21-28`, `StickyNote.ts:11-19`.
- Fix: values from TS go through a `--var`; one exported palette (or `readToken()`) for canvases and the share export.

---
### 3.4 Input and interaction

No `KeyboardEvent.key` use was found: the project rule holds.

**1. Keys are dispatched two ways: the Session's ordered chain, and a broadcast to everyone else. (L)**
- Where:
  - The Session's 14 ordered `KeyRoute`s (`Session.ts:101,184-188`).
  - Six other `Input.onPress` subscribers that all get every press: MenuNav, `FirstPersonController.ts:178-189`, `Overlay.ts:214,553-636`, `PointerLockFlow.ts:106,175-189`, `moneyCheat.ts:22`, `TravelMenu.ts:54-63`.
  - A handshake fakes consumption: `Overlay.wasHandled()` is read by `PointerLockFlow.ts:177`, and works only because of construction order.
  - About 15 raw `keydown` listeners: ModalPanel and the panels' `onKey`, MenuNav, SearchBar, Catalogue, CollectionEditor, CatSettings, KeyBindingsForm, `PerfLog.ts:83`, `lastDevice.ts:35`, `audioContext.ts:129`, `StreetAmbience.ts:121`.
  - `SearchBar.ts:20` claims to be "the only raw keydown".
- Problem: one press can act twice (Esc in the travel menu also opens pause on pad or touch; Esc in plan view reaches both handlers).
- Fix: one dispatcher with a mode/layer stack: system → focused menu or panel → modal modes → room routes. Each layer returns "taken". Delete `wasHandled`.

**2. Keys hard-coded outside `ACTIONS`, read in two code spaces. (M)**
- Where:
  - Raw `'Escape'` in 7 files, next to `isAction(code, 'close')`.
  - Digits: `TravelMenu.ts:18` reads the rebound code, `HagglePanel.ts:96` the raw one.
  - Enter vs NumpadEnter accepted inconsistently.
  - Raw `'Tab'` (`CollectionEditor.ts:110`).
  - Arrows rebound in the Overlay, raw in MenuNav and SearchBar.
  - Gamepad literals in `Rearranging.ts:191`, `FirstPersonController.ts:181`, PointerLockFlow, MenuNav, Overlay.
  - `RESERVED_KEYS` (`controls.ts:146`) misses arrows, Space, digits and F9.
- Problem: rebinding moves the hard-coded keys (Search on 1 makes physical 1 send F).
- Fix: `panels`-context actions for navigation and choices; extend `RESERVED_KEYS`; a lint against those literals outside `src/input`.

**3. Pad and touch buttons press key codes, not actions. (M)**
- Where:
  - `PAD_ALIASES` and `PAD_HOLD_ALIASES` (`actions.ts:251-264`) map a button to a key.
  - Hold-Y → `KeyX` collides with `storePiece` and `swap` (Part 1 #4).
  - `Rearranging.ts:191` special-cases `'GamepadY'`.
  - The "hold [X]" help is built from the wrong action (`controls.ts:77-82`).
  - `TouchControls.ts:36-41` relabels anything on `KeyE`, which shows duplicate buttons.
  - `controls.ts:109` renders "[Put back]" where the bar says "Walk away".
- Fix: virtual devices emit `ActionId`s with context; per-context pad and touch fields in `ACTIONS`; delete `E_LABELS` and the `GamepadY` hack; generate the help from the same table.

**4. Held keys read straight from `Input`, each reader with its own gate. (S for PriceScanner, M overall)**
- Where:
  - `FirstPersonController` (moving, seated).
  - `MachineRun.ts:328-346`.
  - `ProgramRunner.ts:220-223`.
  - `PhotoMode.ts:207`.
  - `BoxTipping.ts:38-41` with the `allowed` lambda (`bootstrap/input.ts:77`).
  - `PriceScanner.ts:54` with no gate.
- Problem: Q means four things (`readStalls`, `tipBox`, `photoFocusNear`, `turnPieceBack`).
- Fix: `input.held('readStalls')` is true only when the action's context is active.

**5. Key names in hints. See §3.1-3. (M)**

**6. Hover captions as strings. See §3.1-1. (M–L)**

**7. Walk-away captions contradict ArcadePlay. (S)**
- Where: `machineLines.ts:15`, `ClawMachine.ts:153` and `Pinball.ts:341` say "E or a click walks away", but `ArcadePlay.ts:89-90` ignores clicks and needs E twice. The doc comments in `SessionActions.ts:38`, `MachineRun.ts:86` and `TicketMachine.ts:242` are stale too.

**8. Six mouse and wheel listeners, each with its own gate. (M)**
- Where:
  - `Session.ts:161-183` (gated on modal or unlocked), with a global `contextmenu` block that also kills copy/paste menus in text fields.
  - `Inspector.ts:90-95,385-401` (no gate: it turns the box behind a panel).
  - `PhotoMode.ts:86-89`; `PlanView.ts:113-133` (capture + `stopImmediatePropagation`); `PointerLockFlow.ts:73-104`; `FurnitureCarrier.ts:152-155`; TouchControls.
  - Two tap detectors (280 ms/10 px vs 330 ms/12 px).
- Problem: bugs #3 and #8 in Part 1, and a quick long-press shelves the box in hand.
- Fix: one pointer router feeding the same mode stack; Inspector exposes `rotate()`; tap/drag classified in one place.

**9. Six crosshair raycasts with different reaches. (M)**
- Where: Interactor 3 m (with sway removal and a 3-frame switch), FurnitureCarrier 4 m, ShelfPlacing 2.6 m, BoxTipping 2.2 m, labelMaker 2.2 m, Browse 2.5 m.
- Problem: the caption and the move outline disagree about what is aimed at.
- Fix: one per-frame aim service, with the reaches in one table.

**10. Arcade fire is keyboard-only; TV programs poll the controller themselves (bug, Part 1 #2). (M)**
- Where:
  - `MachineRun.ts:328-346` reads keys plus a `clicked` flag set by the light gun only.
  - `TicketWheel.ts:215-219` has its own `clickWhilePlaying`.
  - `ProgramRunner.ts:28-30,220-252` duplicates `firstGamepad()` from `Gamepad.ts:256-269` with its own map and a dead 0.5 threshold.
- Fix: `fire` as an action with a pad binding and a held touch button; a click is just a fire press; ProgramRunner reads GamepadInput.

**11. Device detection implemented several times. (S)**
- Where: `lastDevice()`, `isTouchDevice()`, PointerLockFlow's `RoomMode` plus the `input-*` body classes, the unused `touch-device`, `e.isTrusted`. `Inspector.ts:396` and `bootstrap/input.ts:97` read body classes. Three type unions name the same idea.
- Fix: one device-state module; it alone writes the classes.

**12. Gamepad and touch duplicate helpers. (S)**
- Where:
  - The movement key map is written twice (`Gamepad.ts:34`, `TouchControls.ts:81`).
  - "Engaging the stick counts as a press" is written twice.
  - Dead zones are 0.18 vs 0.12.
  - Both send synthetic mouse moves whenever mouse look is off: an implicit protocol PlanView relies on.
- Fix: a shared virtual stick, and an explicit consumer registry for pointer deltas.

**13. Actions with no pad or touch path. (M)**
- Where: `holdCopy`, `swap`, `handBack`, `readStalls`, `gridSnap`, `turnPieceBack`, `labelShelf`, `randomPick`, `sortShelves`, `nightMode`, `undoMove`, `tipBox`, `pickUpFound`, arcade fire, TV programs on touch, the repair mini-game.
- Fix: a per-context coverage check in the convention script.

**14. Several owners write the same enabled flags; "frozen" is one boolean. (M)**
- Where:
  - The interactor is toggled by ModalStack, `Session.setFrozen`, Rearranging, PhotoMode and PlanView.
  - Mouse look by Session, the FPC setter and PlanView.
  - Walking by `setFrozen` and `Travel.ts:87-88,129`.
- Problem: the last writer wins. Tab twice while holding a TV pad, asleep or in a pastime re-enables clicks while the walk stays frozen.
- Fix: `acquire(reason)` returning a release; one owner computes walk, look and pick from the active reasons.

**15. "Is input blocked / are hands free?" computed about ten ways. (M)**
- Where: the deaf route (`Session.ts:97`, with pastimes disguised as `sleep`, `bootstrap/session.ts:63`), the mouse gate, `handsFree` and `allowed` (`bootstrap/input.ts:61,77`), photo and plan `blocked`, `Rearranging.ts:164,206`, `Labelling.ts:50`, `Browse.ts:100,143`, `handsContext`.
- Problem: `isTravelling` is in none of them, so R, M and clicks work during the travel curtain.
- Fix: one input context answering hands-free, in-room and busy; travel, sleep and pastimes become modes.

**16. `player.sit()` used to park the player for four different reasons. (S–M)**
- Where: Seating, `ArcadePlay.ts:116`, `PhotoMode.ts:115-119`, `PlanView.ts:158`; ProgramPlay uses `setFrozen` instead.
- Problem:
  - The unlock handler stands up whatever parked the player.
  - Opening any panel while in the armchair or bed stands the player up.
  - The touch bar in photo mode shows Stand up, Search and Move.
- Fix: `park(owner)` / `unpark(owner)`.

**17. Overlays opened and closed several ways; "is a panel open?" asked four ways (`modalOpen`, `overlay.isModal`, `panelOpen()`, `body.menu-open`). See §3.2-F10/F11. (M)**

**18. ArcadePlay and ProgramPlay are the same "at a machine" mode, written twice. (S–M)**
- Where: `ArcadePlay.ts:87-238` and `ProgramPlay.ts:20-85`. Both park the player, take every key, double-press to leave (1500 ms) and pause on unlock. They differ on the interactor.
- Fix: one machine-session mode with two adapters.

**19. "First press arms, second confirms" about 13 times. See Part 2, P2. (S–M)**
- Where: also `WallClock.ts:29,162-167` (2000 ms) and `NoticeDismiss.ts:11,23-30` (450 ms).

**20. Hover feedback. See §3.1-14. (M)**

**21. "What's in the hands" is spread over several objects. (L)**
- Where:
  - Holders: `Inspector.current`, Hands, `MarketCounter.sale` (synced by callback), `ShelfPlacing.active`, `FurnitureCarrier.piece`, `ProgramRunner.isHolding`, `ArcadePlay.machine`.
  - Clicking with full hands is decided per object (`GameBox.ts:298-305` swaps, `StrayBox.ts:81` swaps, `MarketCounter.offer` puts back).
  - The right button, M and left click each mean 3–4 things depending on what is carried.
- Fix: one hands model (`holding.kind`) with shared verbs on the same actions; one Session policy for full hands.

**22. Controllers get their capabilities inconsistently. (S)**
- Where:
  - `SessionHost` sits beside ad hoc lambdas (`Session.ts:84-101`).
  - `SessionHost` and `SessionActions` overlap.
  - Four context enums overlap: `ActionContext`, `TouchContext`, `handsContext`, `ControlGroup`.
- Fix: extend `SessionHost`; derive the other contexts from `ActionContext`.

---
### 3.5 Canvases, in-world text and screens

About 200 files paint 2D canvases (192 import `createCanvas`, 156 `toTexture`) and there are about 300 `ctx.font` assignments.

Already unified, and worth growing:
- the arcade's `drawText`, `paintMarquee` and `displayScreen`
- `shop/common/lettering.ts setLines`
- people's `textureCache`
- the GLSL `VALUE_NOISE` chunk
- `city/shopLooks.ts`

**1. Generic canvas helpers live in two places. (M, mechanical)**
- Where:
  - `graphics/canvas.ts` has 77 importers.
  - `covers/generated/canvasUtils.ts:5` re-exports it and is the only home of `wrapLines`, `fitFontSize`, `roundRect`, `drawImageCover`, `FONT` and `MONO`.
  - 180 files import the basics through the box-art module, including arcade game logic (`BaseGame.ts:3`).
  - `roundRect` is copied in `shopfrontCanvas.ts:200` and `share/collectionCard.ts:195`; the native `ctx.roundRect` is used in 3 files.
  - docs/props.md and docs/architecture.md point at different modules.
- Fix: `src/graphics/canvas/` (`canvas`, `text`, `shapes`, `fonts`, `colour`, `random`, `paper`); canvasUtils keeps only cover helpers; a codemod plus a lint rule.

**2. `toTexture` bypassed 57 times, and there is no data-texture variant. (M)**
- Where:
  - Colour textures built by hand: `ScoreBoard.ts:54-56`, `ChallengeBoard.ts:48-50`, `LeagueBoard.ts:68-70`, `TournamentBoard.ts:94-113`, `ShelfLabels.ts:81-83`, `ForSaleBox.ts:177`, `Shelf.ts:322`, `prizeModel.ts:237,256`, `snowScreen.ts:27,49`, `StreetLamps.ts:557`, `StreetCars.ts:1186`, `SignalHeads.ts:130`, `DroppedCoins.ts:243`, `ShopGlow.ts:119`, `Leaves.ts:186`, `Room.ts:637`, and more.
  - Data maps made three ways: `NoColorSpace`, no colour space, or `toTexture` then overridden.
  - The same white glow mask is sRGB in three files and colour-less in three others.
  - Raw `createElement('canvas')` in 6 files.
  - `wrapS/T = Repeat` set by hand in 39 files, although a `repeating()` helper exists.
- Fix: `canvasTexture(canvas, { data?, anisotropy?, repeat?, pixelated?, mipmaps?, shared? })` and `createCanvas(w, h, { readback? })`; lint `new THREE.CanvasTexture` outside the module.

**3. Anisotropy hard-coded in 135 of 208 `toTexture` calls (×4 88 times, ×2 40, ×8 7), against docs/graphics.md:37. (S)**
- Fix: pass an intent (`'grazing' | 'facing'`) mapped through QUALITY.

**4. No texel-density policy. (M)**
- Where: px/m of 320, 400, 640/700, 900, 1000, 1400, 1600, 1700 and 2400 for the same kinds of paper; fixed 512-wide canvases for Poster, Chalkboard and PictureFrame. Only `props/outdoors/Sheet.ts` scales with quality.
- Fix: `canvasFor(widthM, heightM, 'print' | 'sign' | 'board' | 'grain')` × `QUALITY.canvasScale`.

**5. Texture caching. (S)**
- Where:
  - The generic `people/textureCache.ts` is used by people only.
  - Hand-made singletons not `markShared`: `WaterRipples.ts:13`, `WaterStream.ts:8`, `CrtGlass.ts:8`, `prizeModel.ts:226,242`. They are disposed on unload and re-uploaded.
  - The identical "OUT OF ORDER" note is painted per machine (`machineParts.ts:63-91`).
  - `showcase/glow.ts` repaints on every call.
  - `markShared` is imported through 8 paths.
- Fix: `sharedCanvasTexture(key, paint)` in graphics/canvas.

**6. Changing canvases: three update strategies, each with its own throttle and gating. (M)**
- Strategies:
  - Repaint and `needsUpdate` (boards).
  - A new canvas and texture per change (`ForSaleBox.ts:266-270`, `LotCrate.ts:109`, `RecordPlayer.ts:155`, `RecordCrate.ts:63`, `BrassPlaque.ts:55`, `EndlessStairs.ts:203`, `Poster.ts:45-52`).
  - One texture per state (`PriceTag.ts:83-100`).
- Throttles: 15, 6/12, 20/4, 12 and 4 fps, each its own; boards poll every 1, 5, 8 or 20 s regardless of visibility; `snowScreen.ts:184-213` hands the driver over between tickers.
- Fix: a `CanvasSurface` (`paint`, `markDirty`, `fps`, `visibleWhen`) ticked by one registry.

**7. Fitting, wrapping and ellipsis: about 10 helpers, 11 inline loops, 4 overflow policies. (M)**
- Helpers: `canvasUtils wrapLines`/`fitFontSize`, `lettering setLines`, `ClueMark writeLines`, `HallBoard wrap`, `WhatsOnBills wrap` (no line limit, overflows), `collectionCard wrap`/`clip`, `SaleBoard fit`, `spillCanvas text`, `shopfrontCanvas word`.
- Inline shrink loops: `NeonSign.ts:134-137` (bug: the halo uses a 4 px-off size), `SealedCartonModel.ts:88`, `ForSaleBox.ts:206`, `BlanketStall.ts:276`, `WishCard.ts:74`, `RepairsShelf.ts:135`, `PartsCabinet.ts:115`, `shop/tv/labels.ts:117`, `flatProps.ts:142`.
- `Noticeboard.ts:114` splits words in half by count.
- About 60 `fillText(…, maxWidth)` squeezes.
- Fix: `fit(ctx, text, box, { overflow: 'shrink' | 'ellipsis' | 'squeeze' | 'wrap', maxLines })` + `drawTextBlock`; lint `while (ctx.measureText`.

**8. Font stacks: three registries, about 300 literal strings, none tied to the UI's font tokens. (M, mechanical)**
- Where:
  - Registries: `canvasUtils FONT/MONO`, `SpineTexture TITLE_FONT`, `lettering.ts` (used by 11 shop files), `shopLooks LETTERING`, `PIXEL_FONT`.
  - `HAND` redefined in 5 files.
  - "Georgia, serif" in 33 files; Courier New in 11; about 15 orderings of the same handwriting faces.
  - The DOM has clean `--ui-font-*` tokens with self-hosted faces that no canvas uses.
- Problem: in-world handwriting differs per prop and per OS; the prize panel uses Permanent Marker while the in-world cards use Comic Sans.
- Fix: `graphics/canvas/fonts.ts CANVAS_FONT` from the same families as `styles.css`, plus `font(kind, px, weight)`; a codemod; a lint.

**9. The arcade's pixel font is not shipped (bug, Part 1 #14); canvases never wait for web fonts. (S)**
- Where: `document.fonts.load` with a 1500 ms race is copied twice (`prototypeArt.ts:39`, `collectionCard.ts:187-193`). Every other painter draws once at construction.
- Fix: ship a pixel face or use VT323; `canvasFontsReady()` awaited by bootstrap, plus `onFontsLoaded(repaint)`.

**10. Canvas colours: no shared palette, many colour-string helpers, two shading formulas. See §3.9-H1. (M)**
- Where:
  - The arcade palette exists only as literals (`'#ffd23a'` ×60, `'#7ee787'` ×44, …).
  - About 30 near-identical creams.
  - About 28 inline `toString(16).padStart(6,'0')` plus 39 `getHexString()`.
  - `shade` is linear in `outdoors/paint.ts:9` but multiplies sRGB bytes in `facadePainter.ts:172` and `facadeStyle.ts:93`.
  - `pick()` is redeclared 7 times.
- Problem: the window view and the walkable street darken the same wall differently, against the promise of `shopLooks.ts`.
- Fix: `graphics/canvas/colour.ts` (`css()`, `shade`, `mix`, `alpha` in one space) plus `PALETTE.arcade`, `.paper` and `.ink`.

**11. Two contracts for a game drawn on a canvas, two runners, adapters between them. See §3.7-M1. (L)**
- Where: `ArcadeGame` vs `ScreenProgram`. Screens use different filtering: nearest + mipmaps, nearest, linear (`homeArcadeModel.ts:44`), linear with smoothing off (`SignalCanvas.ts:42-47`). LexiPunk is a third path.

**12. The CRT look built four ways. (M)**
- Where:
  - `arcade/crtScreen.ts` (shader: cabinets, DemoTelly).
  - `screen/CrtGlass.ts` (an overlay on the TV's lit glass, with power animations).
  - Scan lines painted into canvases (`Starfall.ts:53`, doubled; `snowScreen.ts:174`; dot-matrix in `ScoreBoard.ts:91`, `StreetBus.ts:260`).
  - None at all (TV shop sets, `shopModels.ts:38`; the shop's home-arcade model).
- Problem: PADDLE WARS looks different on a cabinet than on the TV; switching off differs per screen.
- Fix: `world/screen/crt.ts` with presets (`arcade`, `television`, `portable`, `monochrome`); CrtGlass as an optional overlay.

**13. TV static generated three ways; the test card painted twice. (S)**
- Where:
  - Static: `CabinetScreens.ts:133-146`, `SignalCanvas.ts:89-121`, `snowScreen.ts:58-69`.
  - Test card: `snowScreen.ts:75-121` vs `shopfrontCanvas.ts:279-299`, so TV REPAIR's card differs inside and outside.
- Fix: `world/screen/signals.ts` (`paintSnow`, `paintTestCard`, `paintBars`) and one shared animated snow texture.

**14. Attract screens and title cards duplicated. (S)**
- Where:
  - `CabinetScreens.ts:93-130`.
  - `homeArcadeModel.ts:27-45` (a hand copy with literal 320/240 and a raw font).
  - `DemoTelly.ts:157-205` (its own font, palette and fake score table).
  - The blinking prompt re-coded 4 times.
- Fix: `arcade/attract.ts` (`paintTitleCard`, `paintHighScores`, `blink`).

**15. Self-lit screens and boards: five material setups, brightness tuned by hand. (S)**
- Where:
  - `MeshBasicMaterial` tints 0xd0d0d0, 0xd8d8d8, 0xcccccc, 0xc8d4e0, 0xd4d4d4/0xb8c0c8, or none.
  - `emissiveMap = map` (a second sampler, which `materials/printGlow.ts` exists to avoid) in `VideoSurface.ts:444`, `SaleBoard.ts:35`, `AlarmClock.ts:38`, `StreetClock.ts:46`, `StreetFurniture.ts:111`, `Carpet.ts:25`, `CarpetBorder.ts:49`.
- Fix: `materials/displays.ts litDisplay(map, { kind })` + `glowingPrint`.

**16. LED, LCD and dot-matrix readouts drawn in "Courier New". (S)**
- Where: `AlarmClock.ts:51`, `StreetBus.ts:254-261`, `ChannelDial.ts:101`, `BenchTools.ts:129`, `FuseBox.ts:80`, `PartsCabinet.ts:115`; the HUD's LED face is VT323.
- Fix: `paintReadout(ctx, text, { kind: 'led' | 'lcd' | 'vfd' })`.

**17. The portable CRT modelled three times. (S)**
- Where: `shopModels.ts:29`, `HomeGoodsDisplay.ts:217` (same numbers, a new glass material per call), `DemoTelly.ts:46`.

**18. Four cork noticeboards. (M)**
- Where: `props/Noticeboard.ts`, `shop/common/CorkBoard.ts`, `market/NoticeBoard.ts`, `stairwell/hall/HallBoard.ts`. They use different px/m, fonts, wraps and cork colours, and lift by `WALL.paper`, `WALL.notice` or a literal z of 0.014.
- Fix: one `CorkBoard` prop (`pinCard`, `pinPolaroid`, `pinTickets`, an optional header and interaction).

**19. Chalkboards and chalk lettering painted four ways (`Chalkboard.ts:84`, `WallChalkboard.ts:53`, `CoffeeCart.ts:202`, `spillCanvas.ts:63-82`, the last two sharing a dust formula). (S)**
- Fix: `paintSlate(ctx, w, h, lines, { chalks, doodle, seed })`.

**20. The arcade's LED boards rebuild the same scaffold six times (Score, Challenge, League, Tournament, Topper, Jukebox): frame, canvas, texture, tint, a literal face z, border, poll loop. (S)**
- Fix: an `ArcadeBoard` base.

**21. The market stall sign is a verbatim copy: `stallPaint.ts:35 paintStallSign` vs `MarketStall.ts:291 paintSign`. (S, delete the copy)**

**22. Price cards and the "can't afford" fade. See §3.1-12. Also `tagCard.ts:54`, `LotCrate.ts:170`, `GarageSale.ts:196`, `CoffeeCart.ts:219`. (S)**
- Fix: `paintPriceCard` + `formatPrice`.

**23. Tent cards built six times: `TentCard.ts`, `ShopCat.ts:107` (a copy), `CounterCard.ts:9`, `PriceTag.ts:49-57`, `ToDoNote.ts:13`, `PrizeShelf.ts:94-115`. (S)**
- Fix: `tentCard({ width, height, lean, front, back? })`.

**24. Two wall calendars. (S)**
- Where:
  - `props/WallCalendar.ts` reads `new Date()` against the `time/daily` rule, and its picture hue is effectively the same every month.
  - `shop/tv/WallCalendar.ts` is hard-coded to an October starting on a Thursday.
- Fix: `paintCalendarPage(ctx, { year, month, today, … })` fed by `Today`.

**25. The same physical sign painted differently inside and outside. (S–M)**
- Where:
  - OPEN/CLOSED card: `shop/common/OpenSign.ts:60` vs `shopfrontCanvas.ts:265-276` (hours hard-coded).
  - Window glass lettering: `ShopWindow.ts:124-139` vs `shopfrontCanvas.ts:219-238` + `shopfrontPlan.ts:47-71`.
  - Name board: `NameBoard.ts:75` (always signwriter) vs the street fascia (`SHOP_LOOKS[kind].font`).
  - The test card (item 13).
- Fix: one signage module per shop fed by `SHOP_LOOKS`, `SHOPFRONTS` and `SHOP_HOURS`, mirrored for the inside.

**26. Paper notes, printed notices and brass plates: about 15 painters. (M)**
- Where:
  - Notes: StickyNote, ToDoNote, WishCard, the four boards, `machineParts.ts:70`, `sasFinish.ts:244`, `ShopNotice.ts:70`, `prototypeArt.ts`.
  - The doormat painted twice (`props/Doormat.ts:45`, `sasFinish.ts:230`).
  - Brass plates in 7 files.
- Fix: `graphics/canvas/paper.ts` (`paper(kind)`, `pin`, `tape`, `dropShadow`, `brassPlate`).

**27. Framed pictures built three ways (`Poster.ts`, `PictureFrame.ts`, `ArcadePoster.ts`, plus an Impact fit loop in `flatProps.ts:130-151`). (S)**
- Fix: `framedPicture(paint, { frame, mat })`.

**28. The one floating in-world label (market price scan) is a canvas sprite. See §3.1-2. (M)**

**29. Canvas atlases built seven ways: `shop/tv/labels.ts`, `shopfrontCanvas.ts`, `spillCanvas.ts`, `ShelfLabels.ts`, `ShopInteriors.ts:332`, `Signpost.ts:44-74`, `BoxAtlas.ts`. (M)**
- Fix: one `CanvasAtlas` (packer, `rect(id)`, `planeFor(id, size)`).

**30. Seeded randomness for painters. See §3.9-A1/A2. (M)**
- Also: `props/Rug.ts:119` and `Staircase.ts:572` use `Math.random`, so their grain changes on every load.
- Constraint: keep the current LCG bit-for-bit for the arcade (replays store seeds) and economy's `seeded`/`hash01` (saved days).

**31. GLSL noise: a shared chunk exists, five shaders define their own (`outdoors/shader.ts:137-148`, `skyDomeShader.ts:59-71`, `SunShaft.ts:187`, `Precipitation.ts:131`, `postFxShaders.ts:338`), plus inline sine hashes in Buildings, StreetLamps, windowStoryGlsl and ShopInteriors. (S)**
- Fix: guarded `FBM`, `HASH3` and `NOISE3` chunks in `shaderPatch`. Watch the backtick gotcha.

**Noticed alongside:**
- Canvas faces lifted by literal z values instead of `surface/layers` (`ScoreBoard.ts:58` 0.052; Challenge, League, Tournament and SaleBoard 0.042; `Noticeboard.ts:40`; `HallBoard.ts:47`).
- DOM canvases ignore `devicePixelRatio` except `valueChart.ts`; `ScratchCardPanel.ts:80-83,197` is blurry on HiDPI and calls `getImageData` per move without `willReadFrequently`.
- `prototypeArt.ts:111-200` round-trips through PNG data URLs while the other covers paint straight to textures.

---
### 3.6 Audio

**A1. How loud a sound is at a distance: about 12 curves and 2 wall counters. (L)**
- Where:
  - `video/proximityVolume.ts:31` returns an inverse curve with walls ×0.3 as an integer 0–100 (for YouTube). It is reused by `PointSound` and `VideoSurface`, and hand-rolled again in about 10 places with wall factors from 0.25 to 0.6: `Visitors.soundAt` (`Visitors.ts:676`), `Postman.ts:147`, `DoorVisitor.ts:168`, `StairLights.ts:308`, `furnishStairwell.ts:150`, `Neighbours.ts:327` and `PowerCutScene.ts:159` (walls ignored), `ShopClerk.ts:146`, `StreetAmbience.ts:48,239`.
  - `audio/spatial.ts:140 heardAt` uses another curve (silent at 14 m).
  - `street/audio/streetEar.ts:35 falloff` is inlined again in `ShopSounds.ts:146,184` and `PeopleSounds.ts:125`.
  - `CatVoice.ts:852` has its own curve.
  - `ChipSpeaker.ts:196` has no maximum distance and no walls, and builds nodes for inaudible blips.
  - `CrowdSound.ts:88`.
  - Squared ramps in StreetLamps, Busker and `Jukebox.ts:121` (never silent).
  - `1/(1+d²/k)` in Lift, EndlessStairs and Rat.
  - Unplaced sounds: `RoofPigeons.ts:125`, `Aerial.ts:143`, `Fireworks.ts:131`, `AtticLift.ts:182`, and `BalconyDoor.ts:48` (the same latch `Door.ts` places in space).
  - Two `SoundOcclusion` objects: `bootstrap/world.ts:105` and `:149`. Only the second knows the flat↔stairwell route (`stairwell/noiseAndCat.ts:37`).
- Fix:
  - One hearing service: listener + one occlusion + `hear(at, profile) → { gain, spatial }`, with named profiles (room, voice, bell, street, far) on one curve and one wall factor.
  - `proximityVolume` returns 0..1.
  - Delete the second occlusion.

**A2. Continuous sounds managed four or more ways. (L)**
- Where:
  - `audio/ambient.ts:61 Voice` (30 subclasses: lazy build, watchdog, self-freeing, dormancy, placement).
  - `street/audio/soundGraph.ts:13 SoundGraph` (the same plumbing, without the watchdog or the self-freeing).
  - `CatVoice.ts:250-519` has its own build, freeing and limiter, and `dispose()` forgets its spatial node.
  - `kitchenSounds.ts:145 RadioVoice` copies the watchdog.
  - Hand-written wrappers `ShopRadio` (`shop/shopSounds.ts:187`) and `whileHome` (`stairSounds.ts:234`).
  - Graphs that run forever at zero volume: `ArcadeAmbience.ts:66`, `Lift.ts:536`, `LampBuzz.ts:39`.
  - One-off graphs: `StreetAmbience.ts:250`, `BuskerTune.ts:126`, `JukeboxTune.ts:284`, `moonpostSound.ts:29`.
- Fix: one graph class (Voice's plumbing with SoundGraph's helpers) for everything; a generic `gated(voice, on)` forwarder.

**A3. Hidden tab, pause, and ducking. (S–M)**
- Where:
  - Only a resume on `visibilitychange` (`audioContext.ts:130`). Voices that opted out of the watchdog, and everything outside `Voice`, keep droning in a background tab.
  - `moonpostSound.ts:58` lacks the tab-sleep guard the other music has.
  - The fade-to-black choreography is copied in `household/pastime.ts:52`, `game/Sleep.ts:68` and `travel/Travel.ts:104`.
  - YouTube escapes `duckScene` (Part 1 #34).
- Fix: suspend and resume the context on visibility; a scene facade whose `duck()` also scales YouTube; one `fadeBeat()`.

**A4. One-shot sound plumbing rewritten per file. (M)**
- Where:
  - Helpers: `furnitureSounds.ts:15 oneShot`; `householdSounds.ts:20` and `repairSounds.ts:12` (identical `output`, `burst` and `ping`); `stairOut`; `floorOut`; SoundGraph `shot`; `spatialInput`. Each frees its nodes at a different time.
  - About 25 inline copies (coins, doorbell, alarm, gavel, boxClack, murmur, marketBustle, shopSounds, travelSounds (two without an output gain), doorSounds, AtticLift, Lift, cellarSounds (gain never disconnected), endlessSounds, RoofPigeons, Aerial, Fireworks, Visitors, noticeSounds, uiSounds, sampleSound, shutterSound).
  - `rand(min, max)` in 11 files.
- Fix: `audio/oneShot.ts` with `oneShot({ bus, level, seconds, at | spatial }, build(kit))`, plus `audio/random.ts`.

**A5. The same synth building blocks re-implemented. (M)**
- Where:
  - About 20 filtered-noise bursts (three byte-identical: `shopSounds.ts:289`, `stairSounds.ts:355`, `travelSounds.ts:84`).
  - About 10 falling-pitch thumps, 9 struck-partial bells, 5 drips.
  - Noise buffers rebuilt per call: `doorbell.ts:52,94`, `shutterSound.ts:14`, `noticeSounds.ts:81`, `moonpostSound.ts:158`, `LampBuzz.ts:57`.
- Fix: `audio/synth.ts` (`noiseBurst`, `noiseSwell`, `partials`, `thump`, `chirp`, `drip`); `noise.ts` gains `decayingNoise` and `crackleNoise`.

**A6. The same real-world sound synthesised differently in different places. (L)**
- Where:
  - Doors: 5 families.
  - Shop bell: `travelSounds.playShopBell` (2480/3310/5120 Hz) vs `ShopSounds.ring` (2350/3720/5480 Hz).
  - Lift clank: `Lift.ts:559` ≡ `AtticLift.ts:182`.
  - Dog barks: 3. Pigeon wings: 2. Cat meow: 2.
  - Sirens: 435/488 Hz in one place, 880/660 Hz in another.
  - Crowd chatter: 4. Rain: 5.
  - "The street heard": 3 separate synths. The window version ignores the real traffic.
  - Birds: 2.
  - Non-player footsteps: 2, and residents, clerks and regulars are silent.
  - Speech murmur is wired in 4 places only; about 25 `say()` callers speak silently.
- Fix: a named-sound catalogue in `audio/sfx/`; `SpeechBubble.say` emits a murmur through the hearing service; footsteps from foot-plant events; the window ambience reads the street simulation.

**A7. Seven music engines. (M)**
- Where: `JukeboxTune`, `RadioTune`, `vinyl/RecordTune` (a private mulberry32), `BuskerTune` (Park–Miller), `BarMusic` (a sine hash), `moonpostSound`, `throughFloor MusicUpstairs`, plus two pianos. Each has its own scheduler, `midi`, echo and catch-up rule.
- Fix: `audio/music/` (`Sequencer`, instruments, `midiHz`, echo send); each tune keeps only its data.

**A8. Five recipe formats for short notes; five repeat throttles. (S)**
- Where: `ChipSpeaker.ts:54`, moonpost, `noticeSounds.ts:21`, `uiSounds.ts:10`, `sampleSound.ts:5`.
- Fix: one `NoteRecipe` + `playRecipe` + `throttle(key, ms)`.

**A9. Volume channels used for routing tricks, not categories (bug, Part 1 #35). (S)**
- Where:
  - Household, repair and shutter sounds sit on `'ui'` to escape the duck.
  - Music is split over three channels.
  - PADDLE WARS on the TV plays on the arcade channel (`GamesNight.ts:150`).
  - The room reverb is fed from the world channel only.
- Fix: an explicit duck exception (a "foreground" category); all music on one channel; TV programs use the TV's output.

**A10. Street sounds bypass the street's own helpers. (S)**
- Where: `BuskerTune.ts:137` (no facade echo), `LampBuzz.ts:43` (no airlock muffle), and StreetLamps and Busker computing their own distance and pan despite `StreetEar`.

**A11. Five reverbs and echoes, six muffles. (M)**
- Problem: the room reverb is picked from `Footsteps.ts:91`; the stairwell gets its echo on top of its reverb (doubled); Jukebox and RecordTune have private echoes; there are muffles at 300, 600, 900, 1100, 1400 and 5200 Hz.
- Fix: one acoustics module; each zone declares its room type in its plan; "behind a door, floor or glass" becomes a named barrier.

**A12. Three rules for getting and unlocking the audio context. (S)**
- Where:
  - `audioContext()` is used with a gesture check by Voice, without one by CatVoice, coins and boxClack, and inside a pointless try/catch in three files.
  - `startedAudioContext()` is used in about 30 files.
  - Three unlock paths: `unlockAudioOnFirstGesture`, StreetAmbience's own listeners, `navigator.userActivation`.
  - A controller press unlocks none of them.
- Fix: `audio()` returns the running context or null and never creates it; one unlock; `onAudioStart(cb)`.

**A13. Position dropped by hand-written wrappers. (S)**
- Where:
  - `whileHome` drops "behind".
  - `ShopRadio` has no `setSpatial`, so shop and courtyard radios are never panned.
  - `RadioTune.setSpatial` and Television→CrtSpeaker ignore "behind".
  - `ProgramRunner.ts:186-187` applies level and pan without wall muffling.
- Fix: one forwarder; route ProgramRunner through the shared spatial node.

---

### 3.7 Mini-games and simulations

**M1. Two hosts for canvas games (arcade vs TV) with bespoke adapters. (L)**
- Where:
  - `ArcadeGame` + `GameRunner` (fixed 1/120 s) vs `ScreenProgram` + `ProgramRunner` (capped dt).
  - `PaddleWarsProgram.ts` runs Duel at raw dt, maps the pad itself, hides the ticket counter with `pointsPerTicket: MAX_SAFE_INTEGER` and a black rectangle (BaseGame already hides it at 0), and plays on the arcade channel.
  - `MoonpostProgram.ts:33-36` and `MoonpostDemo` have their own controls, mode machine and sound engine.
  - `Starfall.ts:14` and `HomeArcadeGames.ts:21` forward every member by hand.
- Fix: a generic `ArcadeProgram` host in `onscreen/` (GameRunner, chip recipes into the TV's audio, a pad map); one `padToControls` with press detection.

**M2. Game input read three ways; fire missing on pad and touch (bug, Part 1 #2). See §3.4-10. (M)**
- Also: fire-press detection is written 6 times (MachineRun's `lastFire`/`latched`/`fireReleased`, `KeyEdges`, PaddleWars, Moonpost, `ArcadePlay.onKey`); the hoop gets its aim by callback while the light gun uses `controls.aim`.
- Fix: one `GameInput` in `input/` with edges built in.

**M3. Machine plumbing, end screens and sound queues duplicated. (M)**
- Where:
  - `TicketMachine` is the base for Alley, Hoop and Wheel, but `Pinball.ts:269-352`, `ClawMachine.ts:95-176` and `ArcadeCabinet.ts:238-331` re-forward ~14 members to `MachineRun` by hand.
  - The "tell the crowd about every sound" hook is wired 4 times.
  - End screens are painted 5 times with drifting wording ("FIRST SCORE!" vs "FIRST SCORE ON THE BOARD"); only cabinets list bonus lines.
  - "New best" mid-play exists in 3 machines only.
  - Sound queues come in 4 shapes.
  - Idle screens: `AttractLoop` vs bespoke ones, plus `DemoTelly`.
- Fix: a shared machine base for all six; an `EndCard` painter; one sound-queue class.

**M4. Fixed vs variable time step; two balance simulators. (M)**
- Where:
  - Fixed steps, each with its own catch-up: `GameRunner` 1/120 s, `PinballSim` 1/480 s, `NesProgram` 60.1 Hz.
  - Variable: `HoopSim` (subdivides), `AlleySim`, `ClawSim`, `TicketWheel` and PaddleWars (raw dt).
  - `ProgramRunner` re-caps dt (already done in `Engine.ts:263`).
  - `scripts/arcade-balance.mjs:30` plays Alley and Hoop at 1/120, while live play gets frame dt.
  - `world/arcade/payoutSim.ts` is a second, cabinet-only balance simulator.
- Problem: payouts on the physical machines depend on frame rate, and balance is measured under different stepping.
- Fix: one `FixedStep` utility for all sims; the balance script imports `REPLAY_STEP`; fold `payoutSim` into the script.

**M5. Seeded randomness in games. See §3.9-A1. (S)**
- Problem: the claw's grip luck is seeded from a fixed plan seed (`ClawSim.ts:101`, `ClawMachine.ts:70`), so it restarts identically on every load; Alley, Hoop and Wheel outcomes use `Math.random`.
- Rule to adopt: any draw that shapes an outcome takes a per-play seed.

**M6. Score tables disagree on ranks and "best"; ordinals duplicated (bugs, Part 1 #10, #11, #13). (S)**
- *Status 2026-10-03:* the two rank bugs (#10, #11) are fixed by bibliothek-48. Still open: the shared table core, the meaning of `bestOf`, initials stored twice, and the ordinals (#13).
- Where:
  - `economy/ArcadeScores.ts` and `homeArcade/HomeScores.ts`: 0-based. `courtyard/PartyScores.ts:53`: 1-based.
  - `bestOf` means "the player's best" in one table and "the table's top" in the others.
  - `MachineRun.ts:255` computes the rank itself.
  - The initials are stored twice.
  - Insert, sort, qualify and trim are rewritten per table.
  - Three `ordinal` helpers.
- Fix: one ranked-table core (0-based, documented in `scoreTable.ts`); `MachineRun` uses its rank; one `ordinal()`.

**M7. "Free / at home / no tickets" decided by three flags in five places (bug, Part 1 #12). (S–M)**
- Where:
  - Flags: `atHome`, `freePlay`, `pointsPerTicket: 0`.
  - Read by `BaseGame.ts:226,237,276`, `MachineRun.ts:170,375`, `CabinetScreens.ts:170`, `ArcadePlay.ts:248` and `arcadePayout.ts:63-70`.
- *Status 2026-10-03:* the attic symptom is fixed (`pointsPerTicket: 0`). The party cabinet still pays arcade tickets plus extras on top of its kitty, which needs a design decision. The three flags remain.
- Fix: one per-machine `payout: 'arcade' | 'none' | 'event'` that the display, the strip, the screens and ArcadePlay all derive from. Decide what the party should pay.

**M8. Results reach the economy and the player through many channels. See §3.8-5. (M)**
- Where:
  - The courtyard overwrites the single `stationEvents.onPlayerResult` slot that `ArcadeCrowd.ts:156` also assigns.
  - The attic subscribes to every score change instead.
  - Scratch card: no notice. Repair: two coin sounds. Gatherings: no coin sound.
  - About 20 `playCoins` call sites choose their own n, and a dozen `earnCoins` files are silent.
- Fix: one `settle(outcome)` service; machine events as `Listeners`.

**M9. Two two-player models, one of them dead. (S–M)**
- Where:
  - Live: the arcade's `setOpponent` + partner slot.
  - Dead: TV `players` + `ProgramRunner.setSecondPad` (never called), although Thwaite is declared two-player.
  - Games night uses PaddleWars instead of the documented `pick('duel')`.
  - `Duel.setOpponent` ignores the skill it is passed.
- Fix: one "second player" contract for both hosts.

**M10. Count-up animations written three times. (S)**
- Where: `MachineRun.ts:40,116` (linear, 1.2 s), `WalletHud.ts:116` (ease-out, respects reduced motion), `PrizePanel.ts:50,354` (its own rAF loop, ignores reduced motion).
- Fix: `ui/countUp.ts`.

**M11. Two clue-trail systems. (S)**
- Where: `building/hunt/BuildingHunt.ts` (a module singleton) vs `story/PrototypeStory.ts` (a class), with the same journal-page shape; `JournalPanel.ts:19-22` has one `file` slot plus a separate `files` array.
- Fix: a shared `Trail` interface; the journal takes a list of trails.

---
### 3.8 Saves, money, ownership, days and rules

**1. Two store architectures; the same store code written about 70 times. (L)**
- Where:
  - Class stores made in `bootstrap/services.ts`. 17 files have a near-identical `commit()`: Wallet, MarketStanding, Milestones, HomeUpgrades, CollectionStore, Deliveries, Household, Workshop, Classifieds, Journal, FirstDay, the five Arcade* stores, MailPost.
  - Module singletons built at import time with their own listener names:
    - `building/estateSale.ts:36`, `friendship.ts`, `coproState.ts`, `keys.ts`, `hunt/BuildingHunt.ts`, `rouxMove.ts`, `conciergeState.ts`, `blackout.ts`, `neighboursParty.ts`
    - `attic/atticState.ts`, `roof/channels.ts`, `neighbourFlat/visits.ts`, `cellar/cellarFinds.ts`, `errands/pocket.ts`
    - the street ones: StrayCat, GiveawayBox, DroppedCoins, Trader, scratchCard, Busker, GarageSale
    - `MoodLamp`, `TransistorRadio`
  - Stores made inside 3D classes and builders: `Visitors.ts:155`, `gathering/index.ts:15`, `placeHomeArcade.ts:25`, `RecordPlayer.ts:77`, `bootstrap/ui.ts:140`. 23 of the 69 store files live in `src/world`.
  - Four ways to take the storage.
  - `subscribe` sometimes calls back at once (Settings, NeighbourTrades) and sometimes passes nothing; many stores have none.
  - Some stores re-read storage on every access (ArcadeHabits, DailyTally, DailyList, neighboursParty, blackout, GiveawayBox).
  - Readers like `num()` are rewritten per store.
- Fix:
  - `persistence/Store<T>` (`get`, `update(fn)`, save + notify, `subscribe(cb, { immediate? })`) plus `persistence/validate.ts`.
  - Every store made once in `bootstrap/stores.ts`.
  - Move the rules stores out of `src/world`.

**2. The key registry is duplicated and stale (bug, Part 1 #19). (S)**
- Where:
  - `persistence/keys.ts:34-129` (68 keys) vs `notices/saveNotices.ts:8-19` (34 names, matched by stripping key text).
  - Hand-kept derived lists: `PREFERENCE_KEYS`, `PROGRESS_MARKERS`, `KEPT_PREFERENCES`.
  - Versions in both the key name and the envelope.
  - `notices.v1` is the market notice board.
  - `marketRadio` is a preference while `moodLamp` is progress.
  - `?debug` is parsed twice.
- Fix: each `KEYS` entry is `{ key, label, kind: 'progress' | 'preference' | 'cache', exported }`, and the lists derive from it; plus a convention check.

**3. Paths outside `PersistedStore`; memory-only state; partial import, export and reset. (M)**
- Where:
  - Raw storage: `graphics/quality.ts:184-230` (silent on failure), `BrowserCache.ts:76-89` (no merge on flush).
  - Memory-only next to saved siblings: the doormat, `postCollected`, the estate dealer's haggles, `PartyScores`.
  - Two import paths: the save file vs `CollectionStore.importJson`/`resetToSeed`, which is reachable from Tab and leaves Deliveries, Showcases, StrayGames, loans, Honours and Milestones dangling.
  - Two exports.
  - File dates in UTC in some places, local in others.
- Fix: route `quality` through `PersistedStore`; collection import and reset through the save layer or a `collectionReplaced` event; one file-date helper.

**4. Erase and import guards written case by case. (S)**
- Where: `PositionMemory.ts:104-110` guards itself; `eraseProgress` (`saveData.ts:22-32`) wipes, then reloads with no guard; MarketCalendar saves every 0.25 game hours; pending retries can rewrite a wiped key.
- Fix: `closeSave()` that `PersistedStore.put` respects.

**5. Money changes from about 20 places; `Transactions` is "one place" only for market deals. (L)**
- Where:
  - `Transactions` (16 methods).
  - `Purchases.buyUpgrade` and `pay` (not batched, can't refuse after charging, Part 1 #28).
  - `ArcadePlay.ts:154-270`.
  - Direct wallet calls: Visitors, GamesNight, OpenHouse, ClubVisit, BallotBox, hallLife, furnishAttic, DroppedCoins, StrayCat, ShopEntrance (scratch cards), furnishCourtyard, HomeLife, Workshop, Milestones, moneyCheat, PrizePanel.
  - 21 structural wallet types; the world gets `money: { wallet, purse: wallet }`.
  - Player feedback is a reward chip, a reaction, a status line or panel text, depending on the caller; 23 `playCoins(n)` sites; `batch()` used in 4 files.
  - The same purchase has two flows: coffee at the cart vs the café; a home good from its 3D tag vs the till panel.
- Fix: `economy/Money.ts` as the only holder of `spend`, `earn` and tickets. `charge({ price, why, effect, once? })` checks, runs the effect in a batch, rolls back on refusal and emits a `MoneyEvent`; one subscriber turns events into chip and clink.

**6. The two-click purchase confirmation, 12 times. See Part 2, P2. (S)**

**7. Price rules and rounding spread out; receipt text doubles as a pricing key. (M)**
- Where:
  - `copyValue` re-applies sticker and import factors (`collectionValue.ts:23-31`).
  - "Price once fame is known" written 3 times (`MarketStock.ts:509`, `sellerLot.ts:80`, `pricedCopy.ts:46`).
  - Markups in world files: `Trader.ts:223,232`, `EstateSale.ts:158,164`, `furnishCarton.ts:23`, `CartonAtHome.ts:65`.
  - `Math.max(1, Math.round(x))` written 23 times, with floors of 1, 2, 4 and 5.
  - The wallet rounds again (ceil on spend, floor on earn).
  - Pricing caps match the receipt's display text (`pricing.ts:134-142,527-535`).
  - Receipts are built 3 ways.
- Fix: `priceCopy(copy, ctx) → { list, desk, trade, value }`, `coins(x, floor = 1)`, markups in `pricing.ts`, `acquired.kind` instead of text matching, one `receipt()` builder.

**8. Reputation and loyalty recorded from 6 files; undo doesn't mirror the record (bug, Part 1 #18). (S–M)**
- Fix: record deeds in Transactions only, from a seller kind; the purchase returns a deed token that undo reverses exactly.

**9. Two private-dealer classes, three haggle memories (bug, Part 1 #21). (S)**
- Where: `classifieds/dealer.ts:22-74` ≈ `building/estateSale.ts:91-129`; memories in Classifieds (saved), EstateDealer (memory only) and MarketLedger (saved).
- Fix: one `PrivateDealer` over a saved `HaggleBook`.

**10. The party cabinet pays twice. See §3.7-M7. (S)**

**11. Ownership and "can part with it" re-implemented; loans have two sources of truth; the editor bypasses the rules (bug, Part 1 #15). (M)**
- Where:
  - 12 copies of `status !== 'wishlist'` and 9 of `(status ?? 'owned') === 'owned'`.
  - Linear scans instead of `owns()`.
  - "Can part with it" checked 6 ways (keepsake ignored in `answerWanted` and NeighbourTrades).
  - Loans in `VisitBook.loans` and in `Game.status = 'lent'`, reconciled by `tidyLoans` only.
  - Free games enter three ways; the gift-pick code is copied 3 times.
- Fix: `economy/ownership.ts` (`isMine`, `canPart`, `ownedCount`); one owner for loans; the editor limited outside `?debug`; `tx.receiveGift` and `pickGift`.

**12. Things owned in the flat: 5 registries, 3 show-when-owned helpers, clashing ids. (M)**
- Where:
  - Registries: HomeUpgrades, PrizeStore `home`, Milestones rewards, Honours, building keys/attic/aerial.
  - Clashing ids: `poster`, `catToy` and the lava lamp mean different things in HOME_GOODS and PRIZES.
  - Helpers: `showWhenUpgraded`, `placerFor`, `showWhenOwned` (hitbox at y = −50).
  - The annex is recorded as bought twice.
- Fix: an `Ownables` facade with namespaced ids; one `whenOwned` built on `placerFor`.

**13. Three seeded-random families plus raw seeds for day draws. See §3.9-A3. (M)**

**14. Real day and game day mixed inside one feature. (M)**
- Where:
  - The Trader's presence follows the real date, his pick the game day; the same goes for the garage sale and the giveaway.
  - Daily limits at the same street counters: scratch cards and errands on the real day, café coffee on the game day.
  - The journal is game-day, but "first arcade play of the day" is real-day.
  - Dates stored 4 ways.
  - Two weekday systems (`SUNDAY_DAY = 3` duplicates `AUCTION.offset`).
  - Two "night of" rules.
  - Real-day draws are taken once at zone build; `Today` has no `onNewRealDay`.
- Fix: `Today.onNewRealDay`, `nightOf` and `weekday(kind)`; each feature's clock declared in one schedule table (item 15).

**15. No scheduler: hour windows, time injection, day-change handlers and "what's on" re-derived everywhere. (L)**
- Where:
  - Hour-window helpers with different wrap rules: two `inHours` signatures, `within`, shop hours with close > 24, 9 inline checks.
  - Time injected six ways: 24 `() => today.gameDay` and 22 `() => sky.dayNight.state.hours` closures.
  - Day change: 9 subscribers, 4 pollers.
  - "What's on" assembled separately in about 8 places.
  - Weather presence rules disagree (bug, Part 1 #22).
  - Seven clock formatters (bug, Part 1 #9).
- Fix: `time/clock.ts` (GameClock, `HourSpan`, `formatClock`) and `time/schedule.ts` (a registry `{ id, clock, isOn, window, presence(weather) }` queried by builders, news, posters, journal, radio and board).

**16. Test switches that force an event, done three ways (URL read inside economy modules, bootstrap `force`, console hooks). (S)**
- Fix: `debug/flags.ts`, parsed once and fed to the schedule registry.

**17. "Once a day" markers hand-rolled about 15 times with different empty values (`''`, −1, 0, null, −99…). (M)**
- Fix: a `time/OncePerDay` service in one `daily.v1` store, migrating the old keys.

**18. Rules and duplicate predicates live in the bootstrap wiring. (M)**
- Where:
  - "Player busy" in 5 variants (`world.ts:230,297`, `player.ts:59,78`, `session.ts:63`).
  - "At home" (`inFlat(id) && id !== 'stairwell'`) in 5 files, while MailPost counts the stairwell.
  - Game rules in bootstrap: the daily invite, phone results, the party's buyer, deposit refunds, market warm-up, the closing-hours position, `marketOpen`.
- Fix: a `PlayerActivity` service (`busy`, `atHome`, `zone`); move the rules to their features (CLAUDE.md says bootstrap is wiring only).

**19. Features wired in more than one place; stores created twice (bug, Part 1 #20). (M)**
- Where:
  - `ArcadeHabits` (`ArcadePlay.ts:75` and `machineKinds.ts:49`).
  - Tournament, Jackpot and ReplayStore (`services.ts:150-153` and `hallStores.ts:23-29`).
  - `Fame` twice.
  - `Transactions` five times.
  - `bindRouxMove` from 3 builders (`rouxPhase()` says 'settled' until one runs, and services read it).
  - The story and FirstDay wired from 3–4 bootstrap steps; two `late` zone-manager holders.
- Fix: one composition root; delete the fallbacks; `BrowserCache` merges on flush.

**20. Controllers built in inconsistent shapes. See §3.4-22. (S)**

**21. No notice channel in BuildContext. (S)**
- Where:
  - Builders borrow `home.household?.notices` (stairwell, annex, attic, courtyard), so those features go silent without it.
  - Late setters.
  - The unused `huntNotices()`.
  - `tellOutcome` ≈ `Purchases.pay`.
- Fix: `notices` in BuildContext; move `tellOutcome` into `notices/`.

**22. The same kind of feature built five different ways. (L)**
- Where:
  - Class stores + services (economy, classifieds, repair); household's three classes; classes with late setters (story, onboarding, journal); module singletons bound from builders (building); rules + store + DOM panel inside a 3D class (visitors); street rules inside `world/street`.
  - Friendship amounts are inline numbers in 7 files.
  - Timed storylines each with their own phase function and scattered constants.
- Fix: a feature template `src/<feature>/{rules.ts, <Feature>State.ts, <Feature>.ts}` registered in bootstrap; a `FRIENDSHIP` table; an `Arc` helper for multi-day storylines.

**23. One-time letters go to an unsaved two-slot doormat while their "sent" flags are saved (bug, Part 1 #17). (M)**
- Fix: a saved `MailBox` of pending pieces with ids; producers enqueue idempotently; only the visible pile is capped.

**24. Completing a collector set tracked three times with different rules. (M)**
- Where: `MarketStanding.sets` + `claimSet` (complete *now*), Honours (kept once earned), Milestones; two watchers settling at 400 and 300 ms.
- Fix: one `SetsBook` computing completion once, with a date that sticks; the others subscribe.

**25. "First time" and hint flags in many stores; unlock rules differ. (M)**
- Where:
  - Arcade first play tracked 3 ways.
  - The daily invite tracked twice (`Household.inviteDay` and `VisitBook`).
  - In-memory first times.
  - Per-feature `met`/`seen` flags.
  - Unlocks kept once earned in Milestones and Honours, but live and revocable for outfits.
- Fix: a `Progress` store; one documented unlock rule.

**26. Score tables. See §3.7-M6. (S)**

**27. Event payouts not saved together with their "done" flags (bug, Part 1 #16). (S)**
- Where: ClubVisit, OpenHouse, and a friend's return tip (`Visitors.ts:615-660`). GamesNight, DroppedCoins and StrayCat do it in the right order.
- Fix: set the flag, then pay, in one batch; via `Money.charge({ once })`.

---
### 3.9 Shared helpers (random, maths, time, text, events, flags)

#### A. Randomness

**A1. Five generator algorithms and seven string hashes, with clashing names. (M)**
- Generators:
  - The LCG `graphics/canvas.ts:32 seededRandom` (198 calls; 96 files import it via the covers re-export).
  - `economy/seeded.ts:8 seeded(string)` (mulberry32).
  - `vinyl/RecordTune.ts:398 seeded` (another mulberry32, FNV-seeded: same name, different sequence).
  - `KitchenRun.ts:476 seeded(n)` (a single sine hash).
  - Inline FNV + fmix (`Shelf.ts:463`); ×31 + glibc LCG (`RecordCrate.ts:116`); Park–Miller (`BuskerTune.ts:199`, `BenchTools.ts:91`).
  - TS sine hashes in BarMusic, rearWindows, Tree, StreetLamps, ShopInteriors and KitchenRun. These are only stable within one JS engine.
  - Knuth hashes (TiledWainscot, Buildings).
- Hashes: `hashString` (FNV) vs `economy/seeded.hash01(text)` vs `rearWindows.hash01(n)` (a sine hash, same name); inline FNVs in Shelf, `Cat.ts:346` and RecordTune; ×31 in rivals, RecordCrate and ads.
- Fix: `src/random/` (`hash.ts`: `fnv1a`, `unit01`, `hashInts`; `streams.ts`: `lcg` (frozen), `mulberry32`, `mulberryOfText` (frozen)). Re-export from the old paths, codemod, and turn private copies into calls with identical output.
- **Hard constraint:** `seededRandom` and economy's `seeded`/`hash01` must not change. Replays store arcade seeds, and saved days depend on the economy draws.

**A2. `seededRandom` is weakly seeded (verified). (M)**
- Problem:
  - The first output for seeds 1–99 lies between 0.2365 and 0.2744. Neighbouring plan seeds (cobwebs 11 and 12 → 0.240 and 0.241) make the same first decision.
  - Seed 0 behaves like seed 1.
  - 39 call sites multiply by ad hoc constants (×7919 nine times, ×2654435761, ×48271…).
- Fix: `rng(seed: number | string)` with a 32-bit finaliser before the first output, for props and visuals; keep `lcg` frozen for replays and saved draws.

**A3. Six conventions for "the day's draw". (M)**
- Where:
  - `gameDayRandom(topic, day)` (16 calls).
  - `dailyRandom` and friends (18).
  - `seeded(`${day}:topic`)` (21, economy and arcade, some on the real day, bypassing `time/daily`).
  - `seeded(`topic:${day}`)` (15).
  - `hash01(`topic:${day}`)` single values.
  - `seededRandom(day*K+C)` (mail, BedroomChair, HallBoard, gamingWeekly + RetroShopLure on the same seed, NightPhotos) and a hand copy in `StrayBox.ts:110`.
  - `catGift` is seeded while the cat's outing finds use `Math.random`.
- Fix: `time/daily` as the only entry point (`gameDayRandom`, `dailyRandom`, `gameDayUnit`, and a documented frozen `legacyDayStream`); a table in docs/architecture.md of which draws must be seeded.

**A4. About 45 local pick, range, shuffle and weighted helpers. (M)**
- Where:
  - `pick` with three argument orders.
  - `rand(min, max)` ×11 and `between([lo, hi])` ×8.
  - Two `shuffle` contracts (copy vs in place).
  - Biased sort-shuffles (Part 1 #24).
  - Two `pickWeighted`s.
  - 45 inline `a + Math.random() * (b - a)`.
- Fix: `src/random/draws.ts` (the stream always first; pass `Math.random` explicitly for live-only draws).

**A5. Traffic seeded from `Date.now()` bits (StreetCars, Bikes, Motorbikes: the last two can collide). (S)**

#### B. Maths

**B1. clamp, lerp and smoothstep in three styles; same names with other meanings. (S, M with the inline sweep)**
- Where:
  - `MathUtils.clamp` ×180 vs 165 inline `Math.min(Math.max())` vs local copies (`AdaptiveResolution.ts:1`, `shellLayout.ts:49`, `ArcadeGame.ts:80`).
  - `Settings.ts:140 clamp` is a validator; `friendship.ts:53 clamp` rounds.
  - lerp: 88 calls vs 105 inline.
  - smoothstep: 113 calls vs `smooth` (springs, HoopThrower), `ramp`, and 5 inline.
  - `bump` is three different curves (Gaussian with width σ, `exp(-(d/w)²)`, a triangle).
- Fix: `src/math/scalar.ts`; rename the impostors.

**B2. `easeInOut` is quadratic in `GameBox.ts:823` and cubic in `media/Timeline.ts:52`; plus inline eases. (S)**
- Fix: `src/math/easing.ts`.

**B3. Angle wrapping: six helpers and 14 inline copies. (S)**
- Problem:
  - `angleBetween(from, to)` returns `to − from` in `people/locomotion.ts:10`, but `furnishing/surfaces.ts:135 angleBetween(a, b)` returns `a − b` (private, so the risk is copy-paste).
  - `angleDelta(to, from)` has the reverse argument order.
  - The `%` and `atan2` forms differ at ±π.
- Fix: `src/math/angles.ts` (`wrapAngle`, `angleTo(from, to)`, `lerpAngle`, `turnTowards`).

**B4. Smoothing towards a target: frame-rate-dependent or exponential; four springs. (M)**
- Where:
  - 49 `x += (t - x) * Math.min(1, dt*k)` (ClawSim ×7, PersonModel, CatModel, Projector, RecordPlayer, Dog, DancePad: snaps at 20 fps).
  - 24 `1 - Math.exp(-k*dt)`.
  - `Pumpkin.ts:68` has no dt at all.
  - `MathUtils.damp` is never used.
  - Springs in `people/motion/springs.ts`, `CatMotion.turnTowards` (same name as locomotion's, different physics), `Inspector.ts:257` and `Curtains.ts:175`.
- Fix: `src/math/damp.ts` (`dampFactor`, `damp`, `dampAngle`); move springs into `src/math`.

#### C. Time

**C1. Eight hour formatters; five can print ":60" (bug, Part 1 #9). (S)**
- Fix: `time/clock.ts formatClock(hours, { pad })`: wrap, round the total minutes, then split.

**C2. Real-calendar helpers scattered. (S)**
- Where:
  - `economy/calendar.ts` is the real calendar but lives in `economy/`.
  - `dayKey` re-implemented in `share/download.ts:15` and `photo/savePhoto.ts:10`.
  - UTC file dates vs local.
  - `formatDay` duplicated verbatim (`CollectorBookPanel.ts:181`, `furnishCollector.ts:98`).
  - Weekday tables Sunday-first and Monday-first.
  - `catalog/format.ts:7` uses `navigator.language` while the rest is `en-GB`.
  - Two weekday notions (game vs real).
- Fix: move `calendar.ts` to `src/time/`; `time/format.ts` with a fixed locale; local dates in file names; both weekdays exposed on `Today`.

**C3. Season and holiday resolved three times; one ignores `?season=` (bug, Part 1 #23). (S)**
- Where: `Sky.ts:45-47`, `outdoors/Outdoors.ts:168-171`, `streetPlan.ts:707`.
- Fix: resolve once in bootstrap from the flags and `Today`.

**C4. No single game-clock accessor. (M)**
- Where:
  - Six narrow clock interfaces (`BuildingClock`, `ClockLike`, `PastimeClock`, `JournalClock`, `CatClock`, `SleepClock`) and an inline one.
  - 31 `hours: () => number` slots and 62 direct `dayNight.state.hours` reads.
  - Defensive `% 24` in 11 places.
  - Hour-difference wrapping re-implemented 5 times (`solar.ts:131 wrapHours` is private).
  - The day read as `market.day` (16 sites) and `today.gameDay` (88).
- Fix: `time/GameClock.ts` (`day`, `hours`, `onChange`, `advanceTo`) as `today.clock`; delete the six interfaces.

**C5. Game-logic delays on the wall clock; four timing mechanisms. (M)**
- Where:
  - `core/Timers.ts` pauses with its zone and is used by 3 files.
  - `Visit.ts:535-543` has a private game-clock scheduler.
  - `window.setTimeout` in zone code: `Saleroom.ts:307`, `furnishSellerFlat.ts:136`, `MansionBell.ts:81` (travels with no liveness check), `placeHunt.ts:100`, `furnishKitchen.ts:238`, `BuildingHunt.ts:83`, `Seating.ts:78`.
  - `setInterval` in `RetroShopLure.ts:47`.
  - `performance.now()` animation in `ArcadeCabinet.ts:346,362`, `CabinetScreens.ts:142`, `Aerial.ts:107`.
  - Six idle-callback fallbacks (0, 16, 200, 200, 200, 2000 ms), six inline sleeps, four promise-with-timeouts, two `nextFrame()`s.
- Fix: `zone.after(seconds, fn)` backed by Timers; `core/async.ts` (`sleep`, `withTimeout`, `nextFrame`, `whenIdle`).

**C6. "Click again to confirm". See Part 2, P2.**

#### D. Text

**D1. `ui/money.ts` bypassed: 115 hand-made "N coins", 39 inline plurals, several number formats. (M)**
- Where:
  - `money.ts` is imported by 5 files.
  - `${x} coins` ×115 in 50 files (MarketCounter ×14, Catalogue ×7…).
  - 11 plurals test `> 1`, so 0 reads "0 coin" (`ForSaleBox.ts:251`, `stallTalk.ts:109`, `machineLines.ts:25`, `ShopEntrance.ts:85`, `PrizePanel.ts:185,189,342`, `ArcadePlay.ts:158`, `Browse.ts:76`, `MarketCounter.ts:336`, `CounterErrand.ts:46`).
  - `${x} tickets` ×28.
  - `toLocaleString('en-US')` ×38 and `('en')` ×4.
  - `Pinball.ts:578` has its own formatter.
  - `signed()` prints "+0".
- Fix: grow `money.ts` into `src/text/` (`formatCount`, `formatCoins`, `formatTickets`, `plural(n, noun)`) + a codemod + a lint.

**D2. Three ordinal helpers (one wrong past 20); capitalisation in 4 helpers and 5 inline copies (11 more listed in §3.1's notes). (S)**
- Fix: `src/text/ordinal.ts` and `src/text/case.ts`.

#### E. Events and lifecycle

**E1. `core/Listeners` used by 7 files; about 55 hand-written listener sets. (L, mechanical)**
- Problem:
  - `subscribe` calls back at once in Settings, DayNight and worldLoad (and `onCorruptSave` replays history), but not elsewhere.
  - 31 files emit over the live Set, 25 over a copy.
  - About 35 method names.
  - Single assignable slots still used as events: `ModalPanel.onOpenChange` next to `addOpenListener`, `CollectorWatch.onReached`, `StationEvents` (assigned from two places), `GameBox.onDisposed`, `ChipSpeaker.onPlay`.
- Fix: `Listeners.subscribe(cb, { now })` or an `Observable<T>`; migrate; `StationEvents` → `Listeners`.

**E2. Disposal: no shared bag, `{ signal }` never used, `disposeTree` bypassed. (M)**
- Where:
  - About 25 classes keep `unsubscribe` fields; some keep arrays; builders use `zone.onUnload`.
  - 142 `addEventListener` vs 8 `removeEventListener`, and no `AbortController`.
  - Hand-written GPU traversals in `DiscModel.ts:72`, `CartridgeModel.ts:140`, `NightPhotos.ts:53`, `Shelf.ts:301,338`, `PrizeShelf.ts:61`, `GameBox.ts:218`, `PlacementPreview.ts:224`. Only Shelf and PrizeShelf check `isShared`.
- Fix: `core/Disposables`; `{ signal }` for DOM listeners; GPU frees only through `disposeTree`.

#### F. URL flags

**F1. Flags parsed in six places; `?debug` read twice. (S)**
- Where: `services.ts:66`, `persistence/keys.ts:10`, `graphics/quality.ts:210` (which also rewrites the URL), `PositionMemory.ts:79`, `ArcadeTournament.ts:110`, `AuctionHouse.ts:19`; `moneyCheat.ts:34` writes `global.bibliothek` directly.
- Fix: `bootstrap/flags.ts` with a typed, frozen `FLAGS`.

#### G. Search, sort and data sources

**G1. Four title normalisers, three search behaviours, a duplicated search runner (bug, Part 1 #26). (S)**
- Where: `ui/fuzzy.ts:4` (NFD); `LibretroIndex.ts:79` ≡ `collectorSets.ts:123`; `nointro.ts:34 slugify`; plain `includes` in Sell and Trade; `SEARCH_DEBOUNCE_MS = 250` defined twice.
- Fix: `src/text/normalise.ts`; a `DebouncedSearch`.

**G2. Title order differs between the shelves and the panels (bug, Part 1 #27). (S)**
- Where: `world/shelving/sort.ts:16,32` (articles dropped, numeric) vs plain `localeCompare` in Sell, Trade, CollectionEditor, collectionSummary, collectionValue, SearchBar.
- Fix: export one `compareTitles`.

**G3. Data-source clients with different caching, timeout and error rules. (M)**
- Where:
  - `Reviews.ts:34-79` ≈ `Fame.ts:23-73` (no timeout; a hung request is shared forever).
  - LaunchBox (503 back-off, no timeout).
  - YouTube (20 s timeout, throws).
  - LibretroIndex (throws, no timeout).
  - ImageFetch (timeout, retries, circuit breaker).
  - StaticArt swallows errors; `NesProgram.ts:171` is a bare fetch.
  - TTLs written three ways.
- Fix: `src/net/cachedLookup.ts` + `time/durations.ts`.

#### H. Small helpers

**H1. About 25 colour-to-CSS helpers, in two colour spaces under the same name (verified by measurement). (M)**
- Problem: `paint.shade('#808080', .5)` gives #5c5c5c while `facadePainter.shade` gives #404040; mixing red and blue gives #bc00bc in linear space vs #800080 with bytes.
- Fix: `src/graphics/css.ts` with an explicit colour space. See §3.5-10.

**H2. Canvas text helpers. See §3.5-1/7.**

**H3. Save-data readers re-implemented per store. See §3.8-1. (M)**
- Where: `num`/`isNumber`/`record` in 7 files; 28 inline finite checks; 95 inline object guards.
- Fix: `persistence/read.ts`.

**H4. File download written three times. See §3.2-F25. (S)**

**H5. Logging without a helper. (S)**
- Where: 56 console calls with 27 distinct tags, some prefixes built in variables; the CLAUDE.md log line is stale (Part 1 #51).
- Fix: `core/log.ts`.

**Minor:** two id schemes (`repair/Workshop.ts:62`, `persistence/tabs.ts:9`); `crypto.randomUUID()` would serve both.

**Checked and consistent (no finding):**
- `localStorage` goes only through `persistence/storage.ts` and BrowserCache.
- HTML escaping has one helper.
- `{placeholder}` filling has one helper.
- One client per endpoint.
- Deep clones use `structuredClone`.
- Degrees to radians always go through `MathUtils.degToRad`.

---
### 3.10 3D world construction

Paths are relative to `src/world/` unless they start with `src/`.

**Counts:**
- Materials outside the palette: 446 raw `new THREE.Mesh*Material` (street 126, arcade 39, props 37, stairwell 33, market 33, shop 24, people 24). About 82 of them never change at runtime, so they are palette candidates.
- Hand-built meshes: 681 `new THREE.Mesh(`, 190 `new BoxGeometry`, against 948 `part()`, 369 `boxMesh()` and 460 `cylinderMesh()`.
- 750 hand-picked millimetre offsets in 233 files. The visual-pass session is adding a ratchet for these.
- 32 direct lights next to 14 `PooledLight`s; none is hidden with `visible` (the rule holds).
- 123 `setHovered` implementations.
- 34 `PersonModel` sites, plus 3 cruder body systems and 4 sprite populations.

**Already consistent:**
- Builder subscriptions released through `zone.onUnload`.
- Occupancy through `setOccupied`.
- Click targets from `invisibleHitbox`.
- Every ticked object ticked by its zone.
- No class positions itself in a room.
- One bubble renderer and one gaze system.
- `src/household` and `src/building` build no meshes.

#### Materials and textures

**MAT-1. Static looks built as raw materials. (M)**
- Where:
  - `roof/RoofTop.ts:72-77`, `attic/AtticShell.ts:36-40`, `stairwell/Staircase.ts:90,94`, `street/life/Terraces.ts:134`, `street/StreetFurniture.ts:92`, `street/StreetLamps.ts:136`, `Television.ts:340`, `media/CartridgeModel.ts:47`, `media/DiscModel.ts:28`, `GameBox.ts:178`, …
  - `attic/AtticLights.ts:42` makes one material per bulb.
  - `matte()` is used only because the hover lights the whole material: `HomeGoodsDisplay.ts:132-222` (9 times), `RecordCrate.ts`, `cabinetModel.ts:62`, `clawModel.ts:160`, `consoleStyles.ts:68`.
  - `outlook/Courtyard.ts:101` sets an `envMapIntensity` that r169 ignores.
- Fix: palette for every static look; a convention check requiring `// own: <why>` on unchanging raw materials.

**MAT-2. Weather patches applied to shared palette materials (likely bug). (S)**
- Where:
  - `snowCovered(paint(…))` in `street/wayfinding/StreetClock.ts:36` and `BusStopPole.ts:43` (verified).
  - `patchShader` chains onto the cached palette material with no guard (`materials/shaderPatch.ts:10-19`, `street/snowCover.ts:45-68`).
- Problem:
  - Each rebuild of the lazy street adds another `streetSnow` patch to the same material, so the next compile declares `vSnowUp` twice. Any other prop sharing that `paint()` look also gets the street's snow.
  - 39 other street materials are raw so they can be weathered; 9 static street props are never weathered (MansionBell, StreetDoor, Newsstand, GarageSale, StreetPlanBoard, the Trader's stall, the Flagger's barriers, the Busker's props, the Emergency light bar).
- Fix:
  - `weatheredPaint()` / `weatheredStandard()` palette twins (`shared('snow|'+key, …)`).
  - `patchShader` throws on a shared material.
  - Weather the 9 props.

**MAT-3. Metalness other than 0 or 1 in 21 places. (S)**
- Where:
  - `shop/tv/OpenSet.ts:13-14`, `ValveJar.ts:15`, `BenchTools.ts:10`
  - `stairwell/hall/coproLook.ts:106`, `Lodge.ts:105,162`
  - `annex/Fireplace.ts:22`, `attic/AtticFixtures.ts:60`, `attic/CombinationChest.ts:106`
  - `street/StreetLamps.ts:137`, `StreetParkFeatures.ts:61`, `StreetDetails.ts:339`, `Shopfronts.ts:118`
  - `roof/RoofHatch.ts:21,38`, `Aerial.ts:13`, `RoofTop.ts:72`
  - `flatProps.ts:122`, `RecordPlayer.ts:81`, `DiscModel.ts:28`
- Problem: docs/graphics.md says these read as murky plastic, and `HoverGlint` treats ≥ 0.5 as metal.
- Fix: `METAL.*` or `paint`, plus a lint.

**MAT-4. About 60 metal definitions next to `METAL`. (S)**
- Where:
  - Ten chromes (`bathroomMaterials.ts:13`, `ChangeMachine.ts:28`, `machineParts.ts:9`, `prizeModel.ts:8`, `shopModels.ts:22`, `TransistorRadio.ts:34`, `DemoTelly.ts:63`, `HomeGoodsDisplay.ts:35`, `CoffeeCart.ts:44`, `kitchen/Radio.ts:18`).
  - Steels, three of which copy `METAL` verbatim.
  - Brasses: `saleroom/Rostrum.ts:22` uses `paint`; there are three emissive brass templates cloned per instance for hover.
  - Golds and blackened metals.
- Fix: extend `METAL` (gold, darkSteel, galvanised).

**MAT-5. About 30 glass, mirror and water looks; two exports named `CLEAR_GLASS`. (M)**
- Where:
  - `showcase/glow.ts:11` is copied exactly in two places and has drifted in eight.
  - `props/bathroomMaterials.ts:29 CLEAR_GLASS` at 0.28.
  - Jar glass written 5 times.
  - `RENDER_ORDER.glass` is set at 9 sites while 47 files with transparent materials set no band.
  - Mirror backings defined per class; lift mirrors as plain metal planes, differing between the two lift cars.
  - Water: `STILL_WATER` vs four others.
- Fix: `materials/glass.ts` (`GLASS.*`, `mirror(w, h)`, `WATER.*`) applying `asGlass()` (band, unclickable, no shadow).

**MAT-6. Everyday looks have no name. (M)**
- Where: 564 distinct `paint(hex, r)` looks; 78 near-blacks; cardboard in 7 hexes, tape in 6, pages in 5 (three page colours in one bedroom), irons in 7, blacks in 12.
- Fix: a `LOOK` table next to `METAL` (cardboard, kraftTape, pages, blackPlastic, wroughtIron, walnut, oak, ceramic, rubber, felt, …) and a codemod.

**MAT-7. Finish helpers bypassed. (M)**
- Where:
  - Wood as plain paint (no grain): Jukebox, alleyModel, RepairsShelf, BouquetStand, CatTree, Staircase, BallotBox, liftBody, Lodge, AtticLift, `outlook/Courtyard`, plus raw materials in AtticShell, StreetFurniture and RoofTop.
  - Fabric as paint: CoatRack, kitchen Chair, GadgetCase. `market/stallPaint.ts:80 plainCloth` duplicates `cloth()` under another key.
  - No shared plastic twin.
  - Plaster built 5 ways (Room's surfaces, `stairFinish`, AtticShell, sasFinish, CellarVaults).
  - `annex/AnnexOpening.ts:30` patches a `wallMaterial` wall with plain paint.
- Fix: `timber()` and `cloth()` everywhere; `plasticPaint()`; one `plaster(color, opts)`.

**MAT-8. Self-lit prints and LEDs: three techniques, about 13 LED materials. (S)**
- Problem:
  - `emissiveMap = map` costs a texture unit in every lit shader (the flat is at the 16-unit edge): `Carpet.ts:25`, `AlarmClock.ts:38`, `CarpetBorder.ts:49`, `SaleBoard.ts:35`, `VideoSurface.ts:359,444`, `StreetFurniture.ts:111`, `StreetClock.ts:46`.
  - `LED_STANDBY` is 0.35 in `Television.ts:33` and 0.8 in `Projector.ts:44`: same name, same room.
- Fix: `printGlow()` everywhere; an `IndicatorLed(color, { blink })` with one colour table. See also §3.5-15.

**MAT-9. "Additive without touching the canvas alpha" written about 23 times; glow pools painted 6 times. (S)**
- Where:
  - Local `additive()` helpers in `Projector.ts:58-72` and `SunShaft.ts:22-34`, and inline elsewhere.
  - `collector/HomeVitrine.ts` re-implements the showcase kit, with a drifted pool texture.
- Problem: the "alpha is sacred" rule depends on copy-paste.
- Fix: `materials/blend.ts` (`additive`, `additiveOne`, `overKeepingAlpha`) + `glowTextures.ts`; HomeVitrine imports the showcase kit.

**MAT-10. Canvas lettering. See §3.5-8.**

**MAT-11. Textures: hard-coded anisotropy and scattered caches. See §3.5-3/5.**
- Also: rugs, mats and attic and stair floors pin 4 or 8; shell painters repaint on every rebuild (AtticShell, Staircase, RoofTop, CellarVaults); `paintOnce` serves only the 4 floor painters.

**MAT-12. Painters copied verbatim. (S)**
- Where:
  - `MarketStall.ts` copies `stallPaint.ts` line for line, and its trestle equals `RiserStall.ts:89-106`.
  - Slate, brick (`RoofTop.ts:146` vs `CellarVaults.ts:242`), doormat, notice and tent card.
  - Door name plates have about 9 painters.

**MAT-13. Alpha-tested cut-outs made three ways (`shop/common/cutout.ts` with 4 users, 7 inline `coverageKeepsAlpha`, `MarketStall.ts:222` by hand). (S)**
- Fix: move `cutOut()` to `materials/`.

**MAT-14. Inert or stale material code. (S)**
- Where: 41 `toneMapped: false` in 35 files, inert since `displayTone.ts` and splitting the `basic()` cache keys; a stale comment in `sasFinish.ts:129`.

#### Geometry

**GEO-1. "Merge these boxes": 11 local helpers and 2 builders, although `zone/mergeStatic.ts` already merges static items. (S)**
- Problem: their uv and index conventions disagree.
- Fix: one `build/merge.ts` or promote `TriBuilder`.

**GEO-2. Five private shell kits whose walls don't occlude (bug). (L)**
- Where: `attic/AtticShell.ts`, `roof/RoofTop.ts`, `stairwell/Staircase.ts`, `cellar/CellarVaults.ts`, `airlock/SasShell.ts`. They use 3 uv conventions, 3 AO formulas and wall thicknesses of 0.05, 0.1, 0.12 and 0.15 m.
- Problem: only Room, Door, SasShell, SasDoor and Vestibule declare `occluders`, so clicks, speech bubbles and sounds pass through the attic, cellar and roof walls and the stair slabs.
- Fix: a `ShellKit` whose `solidWall()` emits mesh, collider and occluder together; one thickness.

**GEO-3. `boxMesh` takes one material, so 33 six-material boxes are hand-built; 38 plain cylinders bypass `cylinderMesh`. (S)**
- Fix: `boxMesh(w, h, d, material | { face, rest })`; `cylinderMesh` options.

**GEO-4. Nine rounded-box implementations outside meshUtils. (S)**
- Fix: a cached `roundedBox()`.

**GEO-5. Rods, cables, sag curves (6 copies), twinkles (3) and ceiling drops (8 hand-rolled, 5 cord materials). (S)**
- Fix: `rodBetween`, `cable`, `sagCurve`, `twinkle`; `hangFromCeiling` everywhere.

**GEO-6. Flat printed things: `decal()` 13 and `onSurface()` 48 uses vs 123 raw `PlaneGeometry`s, 61 files with literal offsets. (M)**
- Problem: the same name plate sits at 0.01 m in one place and 0.014 m in another.
- Fix: the visual-pass session's ratchet; `decal`/`layMesh` for printed faces; named wall stand-offs.

**GEO-7. Houseplant leaves never merge on medium and high quality (verified by the auditor). (S)**
- Problem: they are rotated and use a patched shader, so `mergeStatic` skips them, giving 14–18 draws per plant plus shadows.
- Fix: bake per colour with `LeafBatch`; check with `?stats`.

#### Hover

**HOV-1. The hover cue comes in five styles. See §3.1-14. (M)**
- Where: about 35 use HoverGlint, about 27 light a whole material (18 emissive hexes), 8 brighten a sign, the GameBox pops out, about 42 give no cue (including some doors), and 6 delegate.
- Fix: also a lint against writing `emissive`/`color` inside `setHovered`.

#### Lights

**LGT-1. "A few real lights follow the nearest emitters" built 4 times plus the culler. (M)**
- Where: `lighting/LightPool.ts`, `stairwell/StairLights.ts`, `street/StreetLamps.ts`, and `cellar/CellarLights.ts`, which snaps every frame (pops).
- Fix: `PooledLight`s in a zone `LightPool`.

**LGT-2. Decorative glows own real lights; screens light their surroundings 4 ways. (M)**
- Where: NeonSign and NeonTube (2 + 2 in the arcade next to its pool of 3), MoodLamp; `Television.ts:140,147` (a real light + a RectAreaLight, in 4 zones); `ArcadeCabinet` (pooled + GlowPool); others pass `glowLight: false`.
- Fix: a pooled option for neon signs, tubes and the mood lamp; a pooled TV glow.

**LGT-3. Six unbounded lights (`distance: 0`): FloorLamp, BedsideLamp, IndustrialPendant, NeonSign, NeonTube, Projector. (S)**
- Problem: `Room.ts:594-596` documents why the ceiling lamp dropped distance 0.
- Fix: a mandatory `reach`, plus a lint.

**LGT-4. The ceiling light always sits at the room centre while the fixture is off-centre in 4 zones; wired 3 ways; daylight clamped 4 ways. (S)**
- Fix: `Room.setLampAt(local)` from the fixture's bulb; one `plan.ceiling`; `furnishShell` places lamp and switch.

**LGT-5. Switching and easing in 3+ models. (M)**
- Where:
  - SwitchableLamp (linear); Room (constants copied); shop `Glows` and MoodLamp (snap).
  - Frame-rate-dependent lerps in Television, Projector, Speaker and Toaster.
  - `setOn` overrides copied 4 times; shop-fitting boilerplate 6 times.
  - `GlowPanel` is registered but unused while its job is inlined in 3 shops.
- Fix: a `LampLevel` and a ShopFitting base.

**LGT-6. Lamp models rebuilt per class. (M)**
- Where: the shade, diffuser and bulb trio in FloorLamp, BedsideLamp and PendantLamp; cones 3 times; uncached bulbs in about 7 classes; ShowroomLamps re-adds the lights `displayPieces` stripped.
- Fix: a lamp parts kit with `light: 'real' | 'pooled' | 'none'`.

**LGT-7. Six zone lighting rigs re-implement "ambient only in the player's zone". (M)**
- Problem: two ease and four snap, so the ambient pops from the hallway into the stairwell or onto the balcony; `lightLevel` is a getter in some and a method in others.
- Fix: one `ZoneAmbient`.

**LGT-8. Sun-spot rigs and shadow details copied. (S–M)**
- Where:
  - `props/Window.ts` repeats `balcony/OpenAir.ts`.
  - The idle shadow refresh exists 4 times (OpenAir is not DrawnAware).
  - Biases written raw.
  - The street shadow-map size formula appears 3 times.
- Fix: a `SunSpot`; `QUALITY.streetShadowMapSize`.

**LGT-9. `ShelfLamp` carries dead shadow code and the only bare `shadow.autoUpdate` write, and docs/props.md cites it as the model. (S)**

**LGT-10. Lamp colours bypass `lampColours` in about 13 places; the candle's light (0xff9a48) differs from its flame (0xffc070). (S)**

**LGT-11. Flicker written about 10 times; the candle flame and its light are out of sync. (S)**
- Fix: `flicker.ts` with seeded generators.

**LGT-12. Two `TimerButton` classes with opposite blackout behaviour. (S)**

**LGT-13. Sky-lit glass colour copy-pasted and already drifted (FrostedWindow vs HallRoof; StairLights vs AtticLights); frosted glass done 3 ways. (S)**
- Fix: `skyGlassColour()` and `DaylitGlass`.

**LGT-14. The blackout reaches lights 3 ways and misses MoodLamp (a real light), the fridge, LavaLamp, NightLight, Speaker LEDs, the kettle, the radio and the record player. (M)**
- Fix: a `Powered` mixin or a zone `setPowered` broadcast.

**LGT-15. Area lights are outside the light budget: one RectAreaLight per RoomWindow and Television, about 10 in the flat. (S)**

#### Sounds on props

**SND-1/7.** See §3.6-A1. Also `VideoSurface.ts:425` raycasts occlusion every frame without easing.

**SND-2. Five ways to attach a sound to a prop. (M)**
- Where: the builder's `placeWith(pointSound)`, `ShopVoiced.voices()`, the prop owning its PointSound, and raw graphs. The fridge hum is attached by the builder in the kitchen but through `voices()` in the shop.
- Fix: generalise `voices()`.

**SND-3. See §3.6-A4/A5.**

**SND-4. Door and passage sounds implemented 5 times. (M)**
- Where: two exported `playDoorShut`; only Door, AnnexOpening and Visitors are spatialised. `travel/Travel.ts:102,121` plays a latch and a door shutting on every trip, bus and ladder included.
- Fix: Travel asks the clicked thing for its passage sound.

**SND-5. Volume scales disagree and hide two silent sounds (verified). (S)**
- Problem: `playRelay` returns below 0.004 (`stairwell/stairSounds.ts:246`), but is called with 0.0012 (`TimerButton.ts:75`) and 0.0006 (`CellarLights.ts:154`), so both relays never play.
- Fix: 0..1 everywhere and one threshold.

**SND-6. Duplicate voices: tube hum, gate clank, three crowd murmurs, two rain-on-roofs, two reverbs. See §3.6-A6/A11.**

#### Doors, windows and animation

**DOOR-1. Five door builders, two architrave copies. (L)**
- Problem: on our landing, the flat's 40 mm `Door` stands next to the neighbours' 16 mm `ShutDoor`s, with different panels and architraves and no peephole or lock.
- Fix: a `props/door/` kit.

**DOOR-2. The leaf-collider swap written 3 times (`BLOCKER_SWAP` ×3); collider toggles in 15 classes. (S)**
- Fix: `zone.setSolid(item, on)`.

**DOOR-3. `TravelDoor` and `StreetDoor` are the same behaviour; the guard type is declared 3 times. (S)**

**DOOR-4. The same door doesn't match from its two sides. (M)**
- Where:
  - A shop door is 1.2 × 2.7 on the street vs 1.6, 1.4 or 1.3 × 2.5 inside, with hitboxes of other sizes again.
  - Courtyard door: 0.85 × 2.05 vs 0.9 × 2.1.
  - The hatch is 0.6 vs 0.8.
  - Colours are duplicated across plans.
- Fix: one door-pair spec per connection, like `courtyard/courtyardDoor.ts YARD_DOOR_COLOUR`.

**DOOR-5. A glazed `ShutDoor` ignores `leafColor` (verified: the glazed branch always uses `LEAF_PAINT`, `props/ShutDoor.ts:70-81`). (S)**
- Problem: the concierge's door asks for brown and comes out off-white; its frosted glass glows the same day and night.

**DOOR-6. ShutDoor subclasses repeat their hitbox, glint, knock and plate boilerplate. (S/M)**

**DOOR-7. Doormats built 4 ways. (S)**

**DOOR-8. Doorway portal boxes computed 5 times; `PORTAL_HALF_DEPTH` ×3. (S)**

**DOOR-9. Only doors hung by the shell share the shadow layer. (S)**

**DOOR-10. The lift car built twice (`attic/AtticLift.ts` re-implements `stairwell/liftBody.ts` + `Lift.ts`), with a different gate and mirror. (M)**

**WIN-1. Eight window-frame builders; the glass offset is by hand in some and a layer in others. (M)**
- Fix: a `WindowFrame` builder.

**WIN-2. Only RoomWindow uses `PaneReflection`. (M)**

**WIN-3. Three renderers of "outside" disagree. (M/L)**
- Problem:
  - The painted panorama, the OutlookView portals and BalconyFront each draw the outside, and the courtyard is both painted and 3D.
  - Lit windows follow random curfews in the panorama but `windowLife` in the street and the outlooks.
- Fix: feed `windowLife` to all of them; long term, keep the panorama as the low-quality fallback.

**WIN-4. Window boilerplate in 5 builders, with 3 sources for the view; curtains and blinds duck-typed. (S)**
- Fix: `placeWindows()` + a `WindowCovering` interface.

**ANIM-1. 18 "openness" state machines with 7 easing curves (LidMotion, SwingLeaf, SlideDrawer, DropDoor, doorSwing, Timeline, Toilet, CellarBox, the lifts, StreetBus, Shutters, CombinationChest, …). (M)**
- Fix: one `Openness` (LidMotion generalised: hold, auto-close, `onSettle`) in `props/motion/`.

**ANIM-2. Easing duplicated. See §3.9-B2.**

#### The same object modelled several times

**MOD-1. What a shop sells is a different model from what you get at home. (M)**
- Where: `PortableTv` becomes a `Television`; a dark ShopProjector becomes a white Projector; `HomeGoodsDisplay` has 5 more private models.
- Fix: one `displayPiece(id)` everywhere; a static "unplugged" mode on Television and Projector.

**MOD-2. Six portable CRT models. (M)**

**MOD-3. About 14 chair builders; the bedroom chair is probably broken.**
- Problem: its back posts lean forward (`bedroom/BedroomChair.ts:79`) while its slats step back (`:83`). Seated eye heights disagree.
- Fix: one `Chair({ style })`. (M)

**MOD-4. About 13 tables and trestles; tablecloths made 5 ways. (M)**

**MOD-5. Seven bookcase, shelf and rack builders; the neighbour's bookcase doesn't look like ours. (M)**

**MOD-6. About 12 cardboard boxes in 11 colours, with tape done 3 ways. (M)**

**MOD-7. Four open crates. (S)**

**MOD-8. Nine bunches of flowers, five stepped stands. (M)**

**MOD-9. The street keeps low-poly copies of indoor props; our balcony is modelled twice, with hard-coded numbers and a different green. (L)**

**MOD-10. Jars; the cleaning kit modelled twice; two `TreatJar` classes. (S)**

**MOD-11. Tableware: 6 mugs, 7 books, 8 bowls. (M)**

**MOD-12. Boards: 4 cork, 4 lit arcade, 6 chalk and A-boards. See §3.5-18/19/20. (M)**

**MOD-13. Seven framed-picture builders. (S)**

**MOD-14. Five glass display cases; "glass ignores the crosshair" written as 2 helpers plus 6 inline copies. (M)**

**MOD-15. Cabinet carcasses hand-built 8 times with opposite joint rules. (M)**
- Fix: `carcass()` in `props/joinery`.

**MOD-16. Counters, counter bells and cash tins duplicated; `COUNTER_TOP` ×2. (S)**

**MOD-17. Different objects share a class name: `TimerButton`, `WallCalendar` (×3), `FuseBox`, `TreatJar`. (S)**

**MOD-18. Small families. (S each)**
- Bicycles; dust sheets in 3 colours.
- Prize miniatures vs home versions: the mood lamp is violet on the counter and magenta at home.
- Radios; clock faces; pegboards.
- Light stripping, where `FlatDressing` forgets spotlight targets.
- `StaticPiece` vs `SaleFurniture`.
- `dressing.ts` hard-codes other classes' sizes.

#### People and creatures

**PPL-1. A resident's identity is re-derived in every scene (verified by the auditor). (M)**
- Problem:
  - The power-cut neighbours get other looks than on the stairs.
  - Mrs Dubois has seeds 63, 71 and 73, and lives on the 3rd floor in `catOutingPlan.ts:56` but the 2nd in `neighbourFlatPlan.ts:246`.
  - The "+900 resident" rule is copied in 6 files.
  - Named looks are hard-coded in Concierge, MeetingSetup, Postman, Flagger and the saleroom.
- Fix: a `CAST` registry (name, seed, look, voice, speed, caption), as `RIVAL_COLLECTOR` already does.

**PPL-2. Front Street's life is three unrelated simulations (window sprites, the 3D cast, nobody in the outlooks), bridged by a global `RETRO_NEWS` set from a `setInterval`; the ginger stray exists twice. (L)**
- Fix: one street-life schedule per game day.

**PPL-3. Presence and fading re-implemented about 14 ways, with 4 APIs. (M)**
- Problem: fades of 0.6–1.2 s or none; the busker toggles `visible` at 40 m; the rival, party guests, estate seller and bidders pop; "not while seen" is checked 5 ways.
- Fix: one `Presence` component.

**PPL-4. Street people's shadows, season and registration decided per owner. (S–M)**
- Where: `traverse(castShadow=false)` copied 12 times, but `PersonModel.setOpacity` turns the trunk back on (`people/PersonModel.ts:446`, verified), giving a torso-only shadow. No seasonal dress in 5 populations. Busker, Trader and the taxi fare bypass `placeWalker`.
- Fix: a `shadow` option respected by `setOpacity`; one `streetWalker()` factory.

**PPL-5. `Shopper` is a second walking engine; ShopCustomer and RivalInHall copy its jobs; market shoppers can't be clicked while shop customers can. (M)**

**PPL-6. Walker, Vendor and Shopper copy each other's plumbing. (M)**
- Problem: `Vendor.gesture(pose, s)` vs `Walker.gesture(name)`; the bubble stays at 2.05 m for children and seated people.
- Fix: a `PersonBase`.

**PPL-7. "Person behind a counter" built twice; the arcade attendant, the barista and the market clerks speak as "Stallholder" (the default at `people/Vendor.ts:84`), while the prize panel says "Attendant". (S)**

**PPL-8. Reactions to a sale implemented 3 ways. (S–M)**

**PPL-9. "Someone at the flat's door" implemented 3 times (Postman, DoorVisitor, Visitors). (M)**

**PPL-10. Seven route-finding approaches. (L)**
- Fix: FloorNav indoors.

**PPL-11. Smaller copies: feet onto stair treads ×3, the "primed until first frame" workaround ×5, group chatter ×2, carried objects outside `held.ts` (which don't fade). (S each)**

**PPL-12. Speech rules scattered. (M)**
- Problem: three durations for one line (the jaw outlasts the voice); most speakers are mute; the name is baked into the text or passed per call; spoken lines are sent as `react`/`refuse` with quote marks in 5 places.
- Fix: a `Speaker` with one `lineSeconds()`.

**PPL-13. Crude street riders: `limb()` and the knee solver duplicated; one skin tone each; no bus driver. (S–M)**

**PPL-14. Creatures. (M)**
- Problem: five cat bodies and coat palettes; two pigeon flocks; the trot copied; angle wrapping ×6.
- Fix: derive every cat from `cat/coats.ts`; one `PigeonFlock`.

#### Zones

**ZONE-1. Two prop registries (`DECOR_KINDS` vs `SHOP_PROPS`) plus ad hoc switches; no decor list in the attic, stairwell, cellar, courtyard and roof plans. (M)**

**ZONE-2. "Shown once bought or won" done 8 ways that disagree on collisions, clicks, lights, contact shadows and freeing. See §3.8-12. (M)**

**ZONE-3. `placerFor` and `furnishings.register` give the same spot and key twice in 7 builders. (S)**

**ZONE-4. Re-dressing a room per visitor or day, 4 ways; only the bed and chair use `UnseenSwap`. (M)**

**ZONE-5. Content placed from outside its builder; services bound inside builders (`bindRouxMove` ×3); two identical `huntHook` registries. (M)**

**ZONE-6. Sub-parts that need placing are exposed about 12 ways. (M)**
- Fix: a `placedParts()` hook.

**ZONE-7. The zone-like host type declared 9 times. (S)**

**ZONE-8. Rugs underfoot: two detectors, one broken. (S)**
- Problem: the neighbour flat's rugs never soften footsteps because they are wrapped in `StaticPiece`; four zones ignore their rugs.

**ZONE-9. Cat-corner coordinates live in code (`cat/index.ts:70-89`), not in `ROOM_PLAN`. (S)**

**ZONE-10. Zones without a Room have no placement vocabulary: 72 offsets from wall planes, about 65 literal placement arguments, and dialogue lines inside builders. (M)**

**ZONE-11. Anchors on host furniture in 3 places and 2 shapes; "put this on that host" done 4 ways. (S)**

**ZONE-12. Collisions expressed 4 ways. (S)**
- Problem: `Prop` promises props never collide, yet 7 have footprints; 91 classes re-declare an empty footprint; every footprint, empty or not, enters the collision world.

**ZONE-13. Disabling a click target: three hacks (scale 1e-4, y −50, a null label); click callbacks follow 4 contracts. (S)**
- Problem: `neighbourFlat/FavouriteGame.ts:45,53` swaps its hitboxes after registration, so a swapped game can't be clicked.

**ZONE-14. "A box for sale on a table" wired by hand 8 times; 4 leak their sold boxes (Trader, giveaway, cellar, attic). (S)**
- Fix: `layForSale()`.

**ZONE-15. About 39 pure-logic objects placed as furniture, each with an empty collider and a contact-shadow pass. (M)**
- Fix: `zone.run(behaviour)`.

**ZONE-16. Timers and async guards: 6 guard styles, one missing (`FlatDressing.ts:196`). See §3.9-C5. (S)**

**ZONE-17. Contact shadows assume the floor is at y 0, so props on the upper stair landings get none. (S)**

#### Particles

**FX-1. Particle systems and dust motes built separately; point size computed 6 ways. (S)**
- Problem: SunShaft and Projector freeze the DPR at construction; Precipitation and Leaves have none; Spray uses ×500; so particles change size when AdaptiveResolution steps.
- Fix: one `Motes` class and a shared `pointScale` uniform fed like `kitchen/Steam.ts`.

---
## Part 4: Convention checks, so it doesn't grow back

`scripts/check-conventions.mjs` scans only `.ts` today. It needs a `within` folder filter (next to `except`) and a CSS pass. Each rule below lands with the module it protects, so the module becomes the only allowed way.

**Random**
- Generator and hash constants outside `src/random/`: `1664525|1013904223|0x6d2b79f5|16807|1103515245|0x811c9dc5|2166136261|16777619`, and `Math.sin(…) * 43758`.
- `.sort(() => random() - 0.5)`.
- `seededRandom(Date.now…)`.
- `seededRandom(…day…)` or `seeded(…day…)` outside `time/`.

**Maths:** local `function|const (clamp|lerp|smooth\w*|easeInOut\w*|angleDelta|angleBetween|pick|shuffle|between|rand|pickWeighted)` outside `src/math/` and `src/random/`; `Math.atan2(Math.sin(`; `Math.min(1, …dt…)`.

**Text**
- `coin${`, `? 's' : ''` and `toLocaleString(` outside `src/text/`.
- `while (ctx.measureText`.
- Font-family literals in `.font =` outside `graphics/canvas/fonts.ts`.

**Time:** `new Date()` outside `src/time/`; `setTimeout(`, `setInterval(` and `performance.now(` in `src/world/**` and `src/game/**` (with `convention-ok` for audio).

**Flags:** `location.search` outside `bootstrap/flags.ts`.

**Input:** `'Escape' | 'Enter' | 'Digit\d' | 'Arrow…' | 'Gamepad…'` literals outside `src/input/`; raw `addEventListener('keydown'` outside the dispatcher.

**Hints:** hard-coded key words in hint literals (`/\b(WASD|Space|click to|Click to)\b/`); `title="` in `src/ui/`.

**Canvas and textures**
- `new THREE.CanvasTexture` and `createElement('canvas')` outside `graphics/canvas`.
- `toTexture(x, <digit>)`.
- Generic helpers imported from `covers/generated/canvasUtils` outside `src/covers`.

**Events:** `new Set<(` assigned to a `listeners` field outside `core/Listeners`.

**Saves:** every `KEYS` entry has a label and a kind; no raw `localStorage` outside `persistence/`.

**CSS:** raw colours outside tokens and theme blocks; raw `z-index` numbers; literal `font-family`; literal durations; `!important`.

**3D construction**
- A `new Mesh*Material` that never changes, without `// own: <why>`.
- Metalness literals other than 0 or 1.
- `distance: 0` on a light, or a light without `reach`.
- Lamp colour hex literals outside `lampColours`.
- `emissiveMap =`.
- `patchShader` on a shared material (a runtime throw).
- `emissive`/`color` writes inside `setHovered`.
- Raw `PlaneGeometry` with a literal offset (the visual-pass session's ratchet).
- `new THREE.BoxGeometry` / `CylinderGeometry` outside meshUtils.
- Local `blending: THREE.CustomBlending` setups outside `materials/blend.ts`.

---

## Suggested order

1. **The Part 1 bugs.** Most are S. Start with these:
   - caption parsing (a quick patch: render `state` with no cap, and fix "Right-click to move")
   - arcade fire on pad and touch
   - the party cabinet's payout and rank
   - the ":60" clocks
   - the collection editor outside `?debug`
   - the double event payouts
   - the doormat letters
   - the pixel font
2. **Leaf foundations,** which have no dependencies and are mostly codemods: P7 random (frozen streams kept), P8 math, P9 text, P13 events, and the `flags`, `log` and `async` helpers.
3. **The user-facing coherence work:** P4 tokens, then P1 hints and captions, then P5 HUD, then P2 confirm, then P3 the panel kit.
4. **Engine and rules:** P6 input dispatcher, P10 time, P11 money, P12 stores.
5. **Content-side unification:** P14 canvas, P15 audio, P16 game hosting, P17 3D construction.

Each step lands with its convention check, so new code can only take the shared path.
