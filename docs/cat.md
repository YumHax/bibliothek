# The cat (`src/world/cat/`)

Read this only when changing the cat's look, behaviour or belongings.

## Files

- `types.ts`: contracts (CatBody, CatPose, the `*Like` props, CatVoiceLike, CatSettings, CatClock, CatPlayerView).
- `CatModel.ts`: procedural rig (capsules + chained tail), 5 coats painted on canvases in `coats.ts`, 12 poses blended per
  joint, walk/trot gait from `setSpeed`, `gaze`, blink/breath/ear twitch, purr tremble, `flick`.
- `Cat.ts`: `Furniture` with an empty footprint + `Interactable`. Click = pet, 4 pets in 10 s = annoyed. `call()`,
  `setPlayerSeat()`, `applySettings()`.
- `CatBrain.ts` (the big one): state machine. Sleeps most of the day by `sleepDrive(hours)`; hunger/thirst needs; eat, beg,
  drink, groom, wander, window lookout, scratch, toy, TV watching, fly chase, rub, sunbathe; armchair perches and the player's
  lap; startle + flee from a sprinting player. A new behaviour = a new state here, with its entry conditions and exit.
- `CatNav.ts`: 0.15 m occupancy grid probed with `collisions.intersectsSphere`, A*, string pulling. Anything the cat must walk
  around only needs a real `footprint`.
- `CatMotion.ts`: path following, parabolic hops. `spots.ts`: resting spot choice.
- Belongings: `FoodBowl` (clickable, kibble InstancedMesh level, refill), `WaterBowl`, `CatBed`, `Scratcher`, `CatToy`
  (rolling ball, bounces off colliders).
- `catSettings.ts`: name + coat in localStorage `bibliothek.cat.v1`; form in `src/ui/CatSettings.ts`, hosted by
  `CollectionEditor.addPanel()`.
- `index.ts`: `furnishCat(world, { settings, player, clock, seats, windows, tv })` places everything in the shelf-free corner
  (bowls between the fig and the door, bed under the left wall's back window, scratcher by the front wall, ball on the rug).
  Called from `main.ts` after the player exists and after the rest of the furniture, so the nav grid sees the room as it stands.
- `src/audio/CatVoice.ts`: synthesized purr (AM sawtooth + noise, breathing LFO) and meows (demand / greet / grumble), faded by
  distance; AudioContext guarded.

## Hooks into the rest of the room

- `Seat` exposes `approachPoint` / `restingSpot` / `lapSpot`; `RoomWindow` exposes `lookoutSpot` / `sunSpotOnFloor`.
- The Session reaches it through the `CatLike` part: `C` calls it, `sit()` / `stand()` report the seat.
- It watches the TV through a tiny adapter built in `furnishCat` (`isPlaying`, `watchingSpot`, `screenPoint`).

## Headless check (no browser)

Bundle a sim with esbuild (`--alias:@=./src`, canvas/document shims injected) and tick `Cat.update` for 1800 s to catch NaN,
escapes and state balance.
