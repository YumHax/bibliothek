# People: how they are built and how they move

Everything under `src/world/people/`. A person is a `PersonModel` (the body) driven by an owner that walks it
about and says where to look and what to do with the arms: `Walker` (the arcade's crowd, the street, the
stairwell, friends, shop clerks), `Shopper` and `Vendor` (the flea market).

## The body (`rig.ts`)

```
root (scaled to look.height) > pelvis > hips (2) > knees > ankles (shoes)
                                      > trunk (one surface, bent in its shader)
                                      > lumbar > chest > torso frame > clavicles (2) > shoulders > elbows > wrists > hands
                                                                      > neck pivot > head (face, hair, ponytail bone, eyes)
                                                                      > bag bone (tote, backpack)
```

- The trunk is one sculpted mesh: it bends with the lower back and the chest in the vertex shader
  (`motion/spineSkin.ts`, three-bone linear blend by rest height, matrices as uniforms, so no texture unit).
  Its shadow materials are patched the same way. Its vertex colours carry baked occlusion (armpits, crotch, collar).
- Hands are one mesh each, with two morph targets (0 fist, 1 open and spread; `body.handGeometry`). Curl > 0
  goes towards the fist, curl < 0 towards open.
- The face has its expressions as morph targets (`head.addFaceMorphs`): jaw, brows up, frown, smile, pucker.
  They move the painted skin, so raised brows lift the painted brows. Under a full beard only the brows move.
  All morph targets share one texture unit (the face sits at about 15 of 16 in the flat: no new map on it).
- The mouth opens about a centimetre (`JAW_OPEN`): the face's material cuts the stretched band between the lips
  (`head.mouthPatch`, a `mouthCut` attribute and the jaw's influence as a uniform, `Face` keeps it in step), and
  behind it sit a dark inside and the upper teeth (`head.addMouth`, inside the skin while shut; no new map).
- Eyes have a clear coat (`QUALITY.physicalMaterials`), their reflections dimmed in the socket and under the upper
  lid; the upper lid carries the lashes (a fine tube along its edge), both lids tilt a little at the outer corner
  (fixed by the face), and the lower lids ride up in a squint or a smile. Glasses have lenses (nearly clear, a clear coat).
- Hair catches the light along its strands (`hair.strandSheen`, Kajiya-Kay from the texture's v by derivatives, no
  map). A short cut is the person's own (`cutOf`: volume, a parting or none, a quiff). Long hair's sheet is its own
  mesh (`hairCurtain`): its ends stay on the shoulders when the head turns (`motion/hairFollow`, the head's turn
  undone as a uniform, its shadow bent the same way).
- Hair colour follows the skin (dark hair on dark skin, blond and red on fair skin); grey is for elders, now and then
  an adult.
- Below the waist: trousers (blue ones are denim, worn pale down the front), shorts, or a skirt or a dress (`skirt.ts`,
  `look.skirt`, from a stream of its own in `looks.lowerHalf`: mostly on the curvy figure) over tights or bare legs; a
  winter jacket is now and then a long coat whose skirts flare to mid-thigh. Skirts and coats hang from the pelvis and
  follow the thighs in their shader (`motion/skirtSkin`), seated they lie over the lap. A jacket stands a little off
  the body and the arms (ease), and arms crossed over a fuller chest or belly bring the elbows forward (`ACROSS_CHEST`).
- Ages and seasons (`looks.randomLook(seed, role, dress)`): a `dress` redresses the seed's look from a stream of its own
  (no dress: the look it always had): winter coats, scarves (`look.scarf`, a torus and a tail on the chest) and beanies,
  summer tees and shorts; a child is short with a bigger head (`look.headScale` scales the neck pivot's group), someone
  old grey-haired, in glasses and loafers.
- In the hand (`held.ts`, `heldMesh`): a phone (at the ear while walking), a book (held up to read while walking), an
  umbrella, a shopping bag, a bag with a baguette, a bouquet, a cigarette (its tip glowing).
- `Walker` in a crowd: given `crowd` (the others), it keeps right to pass someone coming the other way and slows behind
  someone slower (never its `partner`); past its patience with the player in the way it steps round them;
  `stopsToTalk` stops it for a line said to the player; `setAllowance` is a people budget's share (times its fade), and
  a walker faded right out is not posed.

## How it moves (`PersonModel.animate`, in layers)

1. **Feet.** Standing, the feet are planted in the world (`motion/footing.ts`). A turn, a sidestep or a weight
   shift moves the legs over them. A foot that drifts too far from where the stance wants it takes a step:
   one foot at a time, about a third of a second each. Walking, `motion/gait.ts` lays the feet out:
   heel strike, roll, push-off off the ball, swing with the toes clear. A stance foot moves back exactly as
   fast as the body moves forward, so it stays put on the floor. The gait works in the rig's reference metres:
   feed it `speed / scale`.
2. **Legs.** `motion/ik.ts` solves each leg to its ankle (knee forward and a little out) and turns the foot flat
   at its own pitch and heading. The pelvis comes down as far as a weight-bearing leg needs, which gives the
   walk its rise and fall (about 4.7 cm at 1.2 m/s). Down happens at once, up eases.
3. **Back.** A lean (the owner's, a gesture's, the person's slouch) is shared out over pelvis, lower back and
   chest. When the torso bends, the hips go back. The chest counter-turns against the hips while walking and
   takes part of a wide head turn.
4. **Arms.** Each arm has a goal: a gesture's key, an umbrella or phone held up, a world point to reach (IK to
   the palm's middle), or the pose. Every joint runs on a spring (`math/springs.ts`). Wrist and fingers are
   quicker than the shoulder, so the hand trails. Hands on moving controls use stiff springs. The collarbone
   lifts with a raised arm and comes forward with a reach. Walking swings the arms against the legs, and
   talking brings the hands up.
5. **Head and eyes.** A damped spring onto the gaze. `eyesOn` (a director) wins over `gaze` (the owner), and
   a gesture can add its own turn on top.
6. **Face** (`motion/face.ts`). Expressions are springs onto the current feeling (`feel`) plus the gesture's
   face. Speech opens the jaw per syllable with a vowel shape each. Blinks come on a timer and on wide gaze
   shifts. Hands on controls give a faint look of concentration.
7. **What swings.** Ponytail and bag are damped pendulums driven by the body's accelerations.

Far away (past 16 m) the arms, the head and the face update at 15 Hz while the stance, the back and the legs still
move every frame (planted feet never skate); the face and the swinging parts rest.

- **Feet.** Pushing off on the ball of the foot, the toe box bends up (each shoe mesh's one morph target, `TOE_FLEX`),
  so the toes stay on the floor.
- **Seated.** The feet go flat on the floor and the legs are solved to them (the knees ride as high as the seat leaves
  them); a seat too high leaves the shins hanging. Each person sits their own way (from their seed): feet apart,
  ankles crossed, or one knee over the other.
- **Contact shadow.** `PersonModel.groundShadow()` (called by `Walker`, `Shopper`, `Vendor`): a blob under the hips
  sized to the person and one under each foot, shrinking as it lifts.
- **Conversation.** The bubble's `userData.faceLift` gives the conversation the live height of the eyes under it
  (a child, someone seated): the view turns to the face and narrows a little (`player/zoomView`, the camera's zoom).

## Gestures, fidgets, reactions

- `motion/gestures.ts` holds the library: keyframed, eased pose to pose. Arm keys override the arm while they
  last. Other channels add on top and ease back to nothing: `spine`, `twist`, `crouch`, `rise`, `hips`,
  `shrug`, `head`, `face`. The `both` key is the +x arm, mirrored for the other one. To add a gesture, add an
  entry: arm angles follow `poses.ts` (ux negative is forward, uz is side times outwards, lx negative bends the
  elbow). A gesture plays at the person's tempo.
- `motion/repertoire.ts` decides what someone does of their own accord:
  - `idleFidget` suits the stance (arms folded: a look round, a roll of the shoulders; arms free: a scratch,
    a look at the watch, glasses pushed up).
  - `respond` maps a `Reaction` (`good`, `great`, `record`, `fail`, `near`, `over`, `ready`) to a gesture,
    a face and maybe a nod. How big it is depends on the person's expressiveness and on whether their hands
    are busy.
- `motion/temperament.ts` gives each person a tempo, an energy, a slouch, a fidget rate, a stance width and an
  expressiveness, all from their seed.
- To call them: `PersonModel.react(reaction)`, `gesture(name)`, `feel(expression, seconds)`. Walker forwards
  `react` and `gesture`.

## Machines that direct a body (`performer.ts`)

A `Performer` is a body that something moves move by move: `reachEach`, `crouch`, `rise`, `lean`, `hands`
(curl and wrist), `eyesOn`, `footAt`, `standOn`, `palm`, `react`, `feel`, `release`. `PersonModel` implements
it, and `Walker.performer` hands it out.

- `Station.occupy(performer)` gives the regular's body to the machine.
  - A machine with `directs = true` (HOOP FEVER) owns the hands. `ArcadeCrowd` then stands the regular
    without hand points.
  - `HoopShot` runs a `hoop/HoopThrower`: reach down for a ball, lift, aim, dip, shoot from wherever the hands
    let go, follow through, eyes on the ball. The ball sits in the `HoopSim` as `held` meanwhile.
  - A cabinet passes the performer to its attachment (`CabinetAttachment.perform`). The dance pad puts the
    feet on the arrows being stepped on and stands the body on its platform.
  - `release()` gives everything back. `Walker.walk` also releases.
- Every machine's `ChipSpeaker` reports each sound (`onPlay`) to `StationEvents.onSound`. `ArcadeCrowd` maps
  sounds to reactions (`REACTION_OF`), throttled per person, for the regular at the machine (unless the
  machine directs them) and for the kid watching. A regular puts a coin in (`insertCoin`) on arrival and
  between games, sighs at a game over, and cheers a record.

## Checking without a browser

No test suite. A throwaway Node bundle of `PersonModel` (esbuild with the `@` alias and a stub 2D canvas, as
`scripts/arcade-balance.mjs` does for the games) can measure foot slide, IK error, palm error and the hoop's
shots. Add `process.exit(0)`: something in the bundle keeps the event loop alive.
