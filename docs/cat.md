# The cat (`src/world/cat/`)

Read this only when changing the cat's look, behaviour or belongings.

## Files

- `types.ts`: contracts (CatBody, CatPose, the `*Like` props, CatVoiceLike, CatSettings, CatClock, CatPlayerView).
- `CatModel.ts`: procedural rig (capsules + chained tail), 5 coats painted on canvases in `coats.ts`, 12 poses blended per
  joint (the joint-angle table and tail sway per pose are data in `catPoses.ts`), walk/trot gait from `setSpeed`, `gaze`,
  blink/breath/ear twitch, purr tremble, `flick`.
- `Cat.ts`: `Furniture` with an empty footprint + `Interactable`. Click = pet, 4 pets in 10 s = annoyed. `call()`,
  `setPlayerSeat()`, `applySettings()`.
- The behaviour, a state machine. Sleeps most of the day by `sleepDrive(hours)`; hunger/thirst needs; eat, beg, drink, groom,
  wander, window lookout, scratch, toy, TV watching, fly chase, rub, sunbathe; armchair perches and the player's lap; startle
  + flee from a sprinting player.
  - `catStates.ts`: `STATES: Record<CatState, StateDef>`, everything about one state in one entry: `enter` (pose, `timer`,
    facing), `tick`, `describe` (the caption), the flags `startles` (default true), `invitable` (a seated player's lap may
    lure it away) and `followsPlayer` (head turns to a nearby player), and an optional `memo()`: the state's own scratch data
    (next meow, meal length), made fresh on every `enter` and handed to `enter`/`tick` (declare it with `withMemo`).
  - `catActivities.ts`: `ACTIVITIES: Record<Activity, ActivityDef>`: `weight(mind)` (what an idle cat picks by weighted
    random; the weighted entries come first, in draw order; no weight = only started by a reaction) and `begin(mind)`
    (walk there / enter the state; `false` = impossible now, the cat idles).
  - `CatMind.ts`: the working memory both tables act on (state, `timer`, `next`/`pending`, spot/perch, needs, scratch
    vectors) and the moves: `enter`, `startActivity` (hops off a perch first), `beginActivity`, `goTo`, `hop`, `setFacing`.
  - `CatBrain.ts`: the public face `Cat` uses (`update`, `pet`, `call`, `setPlayerSeat`, `describe`); counts the needs down,
    reacts to the player (half wake, startle, lap invitations, petting, calls) and ticks the current state.
  - **A new behaviour:** add the name to `CatState` and its entry to `STATES`; if an idle cat should choose it, add an
    `Activity` with its `weight` and `begin` (which walks there with `mind.goTo(point, 'yourState')`). The `Record` types
    make the compiler list anything missing. Draws from `Math.random` happen in `enter`/`tick`/`begin` order; keep weights
    free of randomness.
- `CatNav.ts`: 0.15 m occupancy grid probed with `collisions.intersectsSphere`, A*, string pulling. Anything the cat must walk
  around only needs a real `footprint`. Given `areas` (the flat's rooms, each grown 0.1 m over its doorways) the grid spans
  the whole flat and only those cells are probed: walls are colliders, so paths go through doorways, and a shut door leaf
  (a collider) keeps the cat in. `blockedNow` probes a point live.
- `CatMotion.ts`: path following, parabolic hops; every 0.2 s it checks 0.2 m ahead with `blockedNow` and stops
  (`blocked`, the grid invalidated) when a door was shut across the path; `hopTo(target, duration, apex)` clears an
  obstacle in between (a tub's rim). `spots.ts`: resting spot choice, including `perches` elsewhere in the flat
  (`CatPerch`: `restingSpot` / `approachPoint`, optional `hopApex`, `available()`, `catWeight(night)`): the bedroom's `Bed`,
  the living room radiator's fleece cradle (`Radiator({ catCradle })`; a radiator without one offers the floor in front),
  the dry bathtub (`Bathtub.isEmpty`, hopped into over its rim) and the basin (`!Washbasin.isRunning`). Each builder returns
  its room's `catPerches`. A perch that stops being `available` under the cat (the bath run) makes it hop out, grumbling.
- Belongings: `FoodBowl` (clickable, kibble InstancedMesh level, refill), `WaterBowl`, `CatBed`, `Scratcher`, `CatToy`
  (rolling ball, bounces off colliders). A second `WaterBowl` stands in the kitchen's inside corner (`KITCHEN_PLAN.catWater`,
  returned as `catWaters`): `drink` goes to the nearest bowl it can reach (`CatOptions.waters`). The food stays home.
- `catSettings.ts`: name + coat in localStorage `bibliothek.cat.v1`; form in `src/ui/CatSettings.ts`, a section of the
  menu's Settings screen (`Overlay.addSetting('game', …)`).
- `index.ts`: `furnishCat(world, { settings, player, clock, seats, windows, tv, flat })` places everything in the shelf-free
  corner (bowls between the fig and the door, bed under the left wall's back window, scratcher by the front wall, ball on the
  rug). Called from `bootstrap/world.ts` after the player exists and after every room of the flat is built; `flat` gives the rooms'
  floor bounds, the spots to visit (each builder returns `catVisits`, from its plan's `catVisits`) and the perches.

## Out of the collection room

The cat lives in the collection room's zone (its belongings, windows, TV and `bounds` stay there) but walks the flat:
`explore` (weight 0.25-0.75, awake) walks to one of the `visits` and looks round; `wander` and fleeing stay local, so a cat
elsewhere drifts home. A walk that cannot be planned (a door shut on the way) puts `explore` off for 45 s. The cat is
`seenFromNextDoor`, so it stays drawn when its own zone is culled; in the other rooms it casts only its blob shadow (lights
render their own zone's layer).
- `src/audio/CatVoice.ts`: synthesized purr (AM sawtooth + noise, breathing LFO) and meows (demand / greet / grumble), faded by
  distance; AudioContext guarded.

## Hooks into the rest of the room

- `Seat` exposes `approachPoint` / `restingSpot` (on top of the mounted cushion, probed at `mountCushion`) / `lapSpot`; `RoomWindow` exposes `lookoutSpot` / `sunSpotOnFloor`.
- The Session reaches it through the `CatLike` part: `C` calls it, `sit()` / `stand()` report the seat.
- It watches the TV through a tiny adapter built in `furnishCat` (`isPlaying`, `watchingSpot`, `screenPoint`).

## Headless check (no browser)

Bundle a sim with esbuild (`--alias:@=./src`, canvas/document shims injected) and tick `Cat.update` for 1800 s to catch NaN,
escapes and state balance. For a refactor of the brain, drive `CatBrain` with the real `CatNav`/`CatMotion` (a
`CollisionWorld` of a few boxes), fake props and player, and a seeded `Math.random`; hash the event log (poses, meows, states,
positions, gaze) before and after: identical hashes over a few dozen seeds mean identical behaviour. (Fake props made with
`Object.assign` lose their getters: define `level` / `isRolling` with `Object.defineProperty`.)
