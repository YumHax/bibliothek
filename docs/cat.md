# The cat (`src/world/cat/`)

Read this only when changing the cat's look, behaviour or belongings.

## Files

- `types.ts`: contracts (CatBody, CatPose, the `*Like` props, CatVoiceLike, CatSettings, CatClock, CatPlayerView).
- `CatModel.ts`: procedural rig (capsules + chained tail; the hind legs with a haunch and a hock; the belly, hind legs and
  tail on a `hips` pivot so the back bends: `spineYaw` per pose, the curled sleep, and into turns; ears as furred half
  shells; a jaw that drops for each call (`vocalize`, wired by wrapping the voice in `Cat`), chews at the bowl and
  laps with its tongue; pupils drawn in the eye's shader, slit by day and round in the dark (`setDark`, from the
  clock), at play or startled, with a faint night shine), 5 coats painted on canvases in `coats.ts`, 13 poses blended per
  joint, each joint at its own pace (`JOINT_TAU`: head first, rump and tail last), the joint-angle table and tail sway per
  pose are data in `catPoses.ts`. Walk blends into trot with `setSpeed` (0.45..1.1 m/s); a wash cycles paw / face / flank
  phases with a random paw (`GROOM_PHASES`, `mirrored`); `knead` treads the front paws in turn (rug scratching). `gaze`
  (saccades: fast when far off, slow settling; a point more than 110° round, behind it, is let go rather than followed to
  the clamp, so nothing passing behind snaps the head from shoulder to shoulder), blinks (some double), `slowBlink` (petted, on the lap, the crosshair resting
  on it 1.5 s), `prick`, `land` (squash), breath, purr tremble, `flick`; tail sway and lash travel to the tip.
- `Cat.ts`: `Furniture` with an empty footprint + `Interactable`. Click = pet, 4 pets in 10 s = annoyed. `call()`,
  `setPlayerSeat()`, `applySettings()`.
- The behaviour, a state machine. Sleeps most of the day by `sleepDrive(hours)`; hunger/thirst needs; eat, beg, drink, groom,
  wander, window lookout, scratch, toy, TV watching, fly chase, rub, sunbathe; armchair perches and the player's lap; startle
  + flee from a sprinting player.
  - `catStates.ts`: `STATES: Record<CatState, StateDef>`, everything about one state in one entry: `enter` (pose, `timer`,
    facing), `tick`, `describe` (the caption), the flags `startles` (default true), `calm` (settled: a walking player close
    enough to stroke it does not startle it, only a sprint does: lie, groom, window, TV, sun, eat, drink, scratch),
    `invitable` (a seated player's lap may lure it away) and `followsPlayer` (head turns to a nearby player), and an
    optional `memo()`: the state's own scratch data (next meow, meal length), made fresh on every `enter` and handed to
    `enter`/`tick` (declare it with `withMemo`). **Every rhythm is in `CAT_TIMING`** next to `STATES` (state lengths,
    sound intervals, cooldowns, the brain's per-second chances): tune there, never inline. Idle and look-around keep the
    posture they have (sit or stand; lying on a perch), glances stay in a cone in front of it.
  - `catActivities.ts`: `ACTIVITIES: Record<Activity, ActivityDef>`: `weight(mind)` (what an idle cat picks by weighted
    random; the weighted entries come first, in draw order; no weight = only started by a reaction) and `begin(mind)`
    (walk there / enter the state; `false` = impossible now, the cat idles).
  - `CatMind.ts`: the working memory both tables act on (state, `timer`, `next`/`pending`, spot/perch, needs, scratch
    vectors) and the moves: `enter`, `startActivity` (hops off a perch first), `beginActivity`, `goTo`, `hop`, `setFacing`.
  - `CatBrain.ts`: the public face `Cat` uses (`update`, `pet`, `call`, `setPlayerSeat`, `describe`); counts the needs down,
    reacts to the player (half wake, startle, lap invitations, petting, calls) and ticks the current state. Stroked while
    eating, drinking or at the post it purrs a moment and slow-blinks but carries on.
  - **A new behaviour:** add the name to `CatState` and its entry to `STATES`; if an idle cat should choose it, add an
    `Activity` with its `weight` and `begin` (which walks there with `mind.goTo(point, 'yourState')`). The `Record` types
    make the compiler list anything missing. Draws from `Math.random` happen in `enter`/`tick`/`begin` order; keep weights
    free of randomness.
- `../nav/FloorNav.ts` (shared with the visiting friends, `CAT_WALKER` here): 0.15 m occupancy grid probed with `collisions.intersectsSphere`, A*, string pulling. Anything the cat must walk
  around only needs a real `footprint`. Given `areas` (the flat's rooms, each grown 0.1 m over its doorways) the grid spans
  the whole flat and only those cells are probed: walls are colliders, so paths go through doorways, and a shut door leaf
  (a collider) keeps the cat in. `blockedNow` probes a point live.
- `CatMotion.ts`: path following (0.2 s ease-in, `sqrt` braking over the last 0.3 m), yaw on a critically damped spring
  (legs shuffle while turning in place), parabolic hops (0.15 s crouch, eased horizontal, `land` + `onLand` thud; `lift`
  keeps the blob shadow on the ground, shrinking and fading). `stop()` never cuts a hop short and a `walkTo` asked mid-hop
  sets off on landing (its answer is whether a path exists from where it lands). `faceTowards` first steps 0.12 m clear
  when the head (or tail tip) would turn into furniture (`FloorNav.reachBlocked`; `keepClear` false at the scratching post):
  never backwards (a step behind it goes sideways, or not at all), standing up for it (the posture comes back once turned),
  each step probed live and clamped inside the grid (the grid can be 10 s old). `teleport` for the morning. Every 0.2 s it checks 0.2 m ahead with `blockedNow` and stops
  (`blocked`, the grid invalidated) when a door was shut across the path; `hopTo(target, duration, apex)` clears an
  obstacle in between (a tub's rim). `spots.ts`: resting spot choice, including `perches` elsewhere in the flat
  (`CatPerch`: `restingSpot` / `approachPoint`, optional `hopApex`, `available()`, `catWeight(night)`): the bedroom's `Bed`,
  the living room radiator's fleece cradle (`Radiator({ catCradle })`; a radiator without one offers the floor in front),
  the dry bathtub (`Bathtub.isEmpty`, hopped into over its rim) and the basin (`!Washbasin.isRunning`). Each builder returns
  its room's `catPerches`. A perch that stops being `available` under the cat (the bath run) makes it hop out, grumbling.
  An armchair with a `Seat.guest` (a visiting friend sits there, or is on the way) is never offered nor mounted.
- Belongings: `FoodBowl` (clickable, kibble InstancedMesh level, refill), `WaterBowl`, `CatBed`, `Scratcher`, `CatToy`
  (rolling ball, bounces off colliders). A second `WaterBowl` stands in the kitchen's inside corner (`KITCHEN_PLAN.catWater`,
  returned as `catWaters`): `drink` goes to the nearest bowl it can reach (`CatOptions.waters`). The food stays home.
- `catSettings.ts`: name + coat in localStorage `bibliothek.cat.v1`; form in `src/ui/CatSettings.ts`, a section of the
  menu's Settings screen (`Overlay.addSetting('game', …)`).
- `index.ts`: `furnishCat(world, { settings, player, clock, seats, windows, tv, flat })` places everything in the shelf-free
  corner (bowls between the fig and the door, bed under the left wall's back window, scratcher by the front wall, ball on the
  rug). Called from `bootstrap/world.ts` after the player exists and after every room of the flat is built; `flat` gives the rooms'
  floor bounds, the spots to visit (each builder returns `catVisits`, from its plan's `catVisits`) and the perches.
  **Adoption**: there is no cat in a new game. `placers` (`adoption.catPlacers`) stage the cat, its bowls and bed until
  it is adopted at the pet shop on Front Street (`HomeUpgrades` 'cat'), the scratching post and the ball until they are
  bought there (handed over then with `Cat.provide`); `followAdoption` keeps `Cat.adopted`, which C (`CatCare`), the
  feather wand and the visitors check. It gets `seats` as the armchairs that stand (`RoomHandle.armchairs`, live).

## Out of the collection room

The cat lives in the collection room's zone (its belongings, windows, TV and `bounds` stay there) but walks the flat:
`explore` (weight 0.25-0.75, awake) walks to one of the `visits` and looks round; `wander` and fleeing stay local, so a cat
elsewhere drifts home. A walk that cannot be planned (a door shut on the way) puts `explore` off for 45 s. The cat is
`seenFromNextDoor`, so it stays drawn when its own zone is culled; in the other rooms it casts only its blob shadow (lights
render their own zone's layer).
- `src/audio/CatVoice.ts`: synthesized purr (AM sawtooth + noise, breathing LFO), snore (asleep in the `sleep` pose), calls
  (demand / greet / grumble / trill / chirp / chatter / yawn / yowl / hiss) and body noises (`noise`: lap, lick, crunch,
  claws, rug, thud, ball, tick, in `src/audio/catNoises.ts`, which also has the kibble pour of `FoodBowl.refill`). Placed by
  `Cat.placeVoice` with the flat's shared rule: `stereoPan` and a `SpatialOut` (`audio/spatial.ts`), walls from
  `SoundOcclusion` (0.3 of the level each), nothing beyond `CAT_EARSHOT` (7.5 m, `types.ts`); AudioContext guarded. A call
  more urgent than the one sounding cuts in (`PRIORITY`: hiss / yowl over a grumble over the rest, 40 ms fade); every
  scheduled fade holds its param first (`cancelAndHoldAtTime`), so no clicks. `setBuzzing` (the fly), `noiseAt` (a thing
  of the cat's heard where it is: the ball's bounce).
- Sounds per state: crunch while eating, lapping at each sip, a soft sparse lick while washing, a little yawn in most
  stretches, claws at the post, rug knead, the ball's roll + bell on a nudge and a tick on each bounce, hiss or yowl on a
  startle, trill when called and on the lap, chirp at the fly (which buzzes faintly) or a refilled bowl, now and then a
  chirp or a chatter at the window. Begging grows insistent meow after meow (`meow('demand', insistence)`: longer,
  higher, louder), a trill now and then, and it hushes, eyes on the player, while they walk towards the bowl.
- `CatFly.ts`: the speck the cat chases (`flyStalk` watches, `flyPounce` leaps under it); `CatBrain.fly` is its point
  (`CatMind.flying`, set on entering either state). The ball is batted on along the cat-to-ball direction.

## Out on the stairs

The cat may slip out of the flat's front door into the stairwell (`escapes.ts`, `CatOuting.ts`, data in `catOutingPlan.ts`).
- **When**: the front door stands open `doorOpenS` (3 s) while the cat is adopted, on the floor and free (`CatBrain.roaming`:
  idle, looking round, walking, rubbing, washing, stretching) within `reach` (7 m) of it. Then `chance` (0.3), and never two
  game days running (`everyDays`, `KEYS.catOutings`). `CatEscapes` (an empty prop in the stairwell's zone, wired by
  `placeCatEscapes` in `bootstrap/world.ts`) decides.
- **How**: `Cat.goOut` hands the cat to a `CatOuting` while the brain waits. It crosses the flat on its own grid to just inside
  the door (`CatMotion`; the door shut first, or 20 s, and it forgets it), then follows the residents' ways (`stairRoutes`)
  with its feet on the treads (`StairwellHandle.ground`, eased per riser like a `StairWalker`) to a `spots` entry: a landing's
  doormat, the lift's car (it rides with it; the car elsewhere, it waits by the gate), the hall's mailboxes, or in at
  Mrs Dubois' (3:1, only while she is in: the cat goes out of sight). Nothing collides; no blob shadow on the flights.
- **Found**: hiding, it miaows down the well every 7-14 s, its voice carried (heard at `carry` 0.5 of the distance, the
  walls from the flat's route round the front door). A click, or C within `comesWithin` (4.5 m), sends it trotting back up
  (`takeHome`). C from further gets a miaow back (`call` returns `'out'`, worded in `game/CatCare`). It waits on our mat
  while the door is shut and walks in when it opens. `CatBrain.resume` then gives the brain the cat back where it stands.
- **At Mrs Dubois'**: after 70-150 s she comes up and knocks (`stairwell/DoorVisitor`, one person, one visit at a time,
  through the `Doorstep`). Answered, she says her line and the cat appears on the mat (`returned`) with a friendship nudge
  (`building/friendship`). Unanswered, she leaves it there with a note under the door.
- **Brings back**: walked home by itself, `bringsBack` (0.3) of the time it drops something at the player's feet (a read
  card). `addCatFind` (exported from `cat/index.ts`) lets another feature hand it something first (the treasure hunt's clue).
- A tip says it is out until it is back. A reload finds it at home (the outing is not saved).

Fur (`CatFur.ts`, `QUALITY.fur`) grows on every furred part (shanks, paws, muzzle, ears too); once a strand cell is
under a pixel the shells dither away instead of sparkling.

## Time, treats and the bowl

- `sleepDrive` is a smoothstep curve over hour knots (`SLEEP_CURVE` in `CatMind.ts`), no steps.
- `CatBrain.noticeTimeSkip`: the clock jumping ≥ 3 h in a frame (a night in bed: `Sleep` needs no hook) runs
  `morning.placeForMorning`: hungrier and thirstier, and between 5:00 and 11:00 it is put by its bowl (begging or eating)
  or stretching on the people's bed, facing the side it hops down from. The household's beats stay under 3 h
  (`HOUSEHOLD.pastimeMaxMinutes`) so they never trigger it.
- `call(how)`: `'treats'` (the kitchen jar) always fetches an awake cat (trot, `treat` state: sniffs at the hand, then
  crunches it on the floor); the voice and the wand keep the one-in-three snub. A bowl refilled near a hungry, free cat
  sends it trotting over (`noticeRefill`, activity `rushToBowl`).
- No buzzer from the cat's things: an annoyed cat or a full bowl answer with `react` (the cat grumbles).
- Captions follow `Name · verb`: `Miso is sleeping · pet`, `Empty bowl · fill`.

## Hooks into the rest of the room

- `Seat` exposes `approachPoint` / `restingSpot` (on top of the mounted cushion, probed at `mountCushion`) / `lapSpot`; `RoomWindow` exposes `lookoutSpot` / `sunSpotOnFloor`.
- The Session reaches it through the `CatLike` part: `C` calls it, `sit()` / `stand()` report the seat.
- It watches the TV through a tiny adapter built in `furnishCat` (`isPlaying`, `watchingSpot`, `screenPoint`).

## Headless check (no browser)

Bundle a sim with esbuild (`--alias:@=./src`, canvas/document shims injected) and tick `Cat.update` for 1800 s to catch NaN,
escapes and state balance. For a refactor of the brain, drive `CatBrain` with the real `FloorNav`/`CatMotion` (a
`CollisionWorld` of a few boxes), fake props and player, and a seeded `Math.random`; hash the event log (poses, meows, states,
positions, gaze) before and after: identical hashes over a few dozen seeds mean identical behaviour. (Fake props made with
`Object.assign` lose their getters: define `level` / `isRolling` with `Object.defineProperty`.)
