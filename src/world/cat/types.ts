import type * as THREE from 'three';

/*
 * Shared contracts of the cat feature. The pieces (procedural body, behaviour, props, voice,
 * settings UI) are built against these shapes so they compile independently and `Cat` wires them.
 */

/** Fur patterns the procedural body can paint. */
export type CoatKind = 'tabby' | 'tuxedo' | 'ginger' | 'grey' | 'calico';
export const COATS: readonly CoatKind[] = ['tabby', 'tuxedo', 'ginger', 'grey', 'calico'];

/** What the user can change about the cat (persisted, see `catSettings.ts`). */
export interface CatSettings {
  name: string;
  coat: CoatKind;
}
export const DEFAULT_CAT_SETTINGS: CatSettings = { name: 'Miso', coat: 'tabby' };

/**
 * Body postures. The body blends between them on its own (~0.4 s); the behaviour just names the
 * target. `stand` + a walking speed is the gait; `crouch` precedes `pounce`.
 */
export type CatPose =
  | 'stand'
  | 'sit'
  | 'lie' // on the side / sphinx, eyes open
  | 'sleep' // curled, eyes closed
  | 'loaf' // paws tucked, eyes half closed
  | 'stretch' // front paws forward, rump up
  | 'groom' // sitting, head down to a paw
  | 'eat' // standing, head down to bowl height
  | 'drink'
  | 'scratch' // rearing on hind legs, front paws high (against the scratcher)
  | 'knead' // low stretch on the rug, front paws treading in turn
  | 'crouch'
  | 'pounce';

/** The procedural body (`CatModel`): geometry, pose blending, gait, head gaze, tail, blinking. */
export interface CatBody extends THREE.Object3D {
  /** Local +z is the cat's forward; origin at floor level under the body centre. */
  readonly bodyLength: number;
  /** Height of the back when standing (metres). */
  readonly standHeight: number;
  /** Single click target covering the body (an `invisibleHitbox`). */
  readonly hitbox: THREE.Object3D;
  setPose(pose: CatPose): void;
  /** The pose last asked for. */
  readonly pose: CatPose;
  /** Walking speed in m/s; 0 = standing still. Drives the leg cycle and body bob. */
  setSpeed(mps: number): void;
  /** Turns the head (clamped) towards a world point; null = look ahead. */
  gaze(target: THREE.Vector3 | null): void;
  /** Purring: eyes narrow, slow tail sway, subtle body tremble. */
  setPurring(on: boolean): void;
  /** Ears back + tail lash for a moment (grumbling, startled). */
  flick(): void;
  /** Both ears forward for a moment (something caught its eye). */
  prick(): void;
  /** A slow, contented blink (~0.8 s): the cat's smile. */
  slowBlink(): void;
  /** Squash on touching down after a hop; `strength` 0..1 with the drop. */
  land(strength: number): void;
  setCoat(coat: CoatKind): void;
  setHovered(hovered: boolean): void;
  /** The mouth opens for a call (a meow, a hiss held wide, a long yawn, the quick chatter). */
  vocalize(kind: CatCallKind, insistence?: number): void;
  /** How dark it is round the cat, 0 daylight .. 1 night: the pupils widen, the eyes catch the light. */
  setDark(amount: number): void;
  update(dt: number): void;
}

/** The food bowl: kibble level goes down as the cat eats; the player clicks it to refill. */
export interface FoodBowlLike extends THREE.Object3D {
  /** 0 (empty) .. 1 (full). */
  readonly level: number;
  /** Removes `amount` of the level (clamped to 0). */
  eat(amount: number): void;
  refill(): void;
  /** World point where the cat's body centre stands to eat (on the floor, facing the bowl). */
  feedingSpot(out: THREE.Vector3): THREE.Vector3;
}

export interface WaterBowlLike extends THREE.Object3D {
  /** World point where the cat's body centre stands to drink. */
  drinkingSpot(out: THREE.Vector3): THREE.Vector3;
  /** Little ripple when the cat laps. */
  sip(): void;
}

/** The cat bed: a soft ring the cat curls up in. */
export interface CatBedLike extends THREE.Object3D {
  /** World point of the body centre when lying in the bed (y = top of the padding). */
  restingSpot(out: THREE.Vector3): THREE.Vector3;
}

export interface ScratcherLike extends THREE.Object3D {
  /** World floor point where the cat stands to scratch, and the point it faces. */
  scratchingSpot(out: THREE.Vector3): THREE.Vector3;
  facingPoint(out: THREE.Vector3): THREE.Vector3;
  /** Fibre wobble while the cat is at it. */
  scratched(): void;
}

/** A ball the cat pushes: rolls with friction, bounces off the colliders, stays on the floor. */
export interface CatToyLike extends THREE.Object3D {
  /** Pushes the ball horizontally in `direction` (world, normalised or not) at `speed` m/s. */
  nudge(direction: THREE.Vector3, speed: number): void;
  readonly isRolling: boolean;
  /** Ball radius (metres). */
  readonly radius: number;
  /** Called when it bounces off a wall or furniture, with how hard (0..1): the cat's `Cat` makes it tick. */
  onBounce?: ((strength: number) => void) | null;
}

/**
 * Calls the voice makes: meows, a trill or chirp (greeting, prey), the chatter at a bird it cannot
 * reach, a little yawn (stretching), a hiss or yowl (startled).
 */
export type CatCallKind = 'demand' | 'greet' | 'grumble' | 'trill' | 'chirp' | 'chatter' | 'yawn' | 'hiss' | 'yowl';
/**
 * Noises the cat makes with its body, heard from where it is: lapping, a lick of its fur, kibble
 * crunch, claws on sisal or rug, a landing, the ball it bats; `tick`: the ball bouncing off something.
 */
export type CatNoiseKind = 'lap' | 'lick' | 'crunch' | 'claws' | 'rug' | 'thud' | 'ball' | 'tick';
/** Beyond this (m) nothing of the cat is heard: its voice, its things; walls are not even counted. */
export const CAT_EARSHOT = 7.5;

/** The cat's voice (Web Audio): purr and snore beds, calls and body noises, placed round the listener. */
export interface CatVoiceLike {
  setPurring(on: boolean): void;
  /** Gentle heavy breathing while fast asleep. */
  setSnoring(on: boolean): void;
  /** A call; `insistence` 0..1 (the begging meow) makes it longer, higher and louder. */
  meow(kind: CatCallKind, insistence?: number): void;
  /** The fly it chases buzzing about its head (a faint bed while it is there). */
  setBuzzing?(on: boolean): void;
  /** A noise of one of its things away from the cat (the ball bouncing): where it is heard from given here. */
  noiseAt?(kind: CatNoiseKind, strength: number, metres: number, pan: number, walls: number): void;
  /** A one-off noise at the cat; `strength` 0..1 scales it (a harder landing, a faster ball). */
  noise(kind: CatNoiseKind, strength?: number): void;
  /**
   * Where the cat is for the listener: distance (m; everything fades with it), `pan` -1 (left) ..
   * 1 (right) from the listener's heading, and the `walls` in between (quieter and duller).
   */
  setDistance(metres: number, pan?: number, walls?: number, rear?: number): void;
  /** This cat's own pitch (1 = the table's): two cats never sound alike. */
  setPitch?(scale: number): void;
  update(dt: number): void;
}

/** What the behaviour needs to know about the player each frame. */
export interface CatPlayerView {
  /** World eye position (the camera). */
  getEyePosition(out: THREE.Vector3): THREE.Vector3;
  readonly isSprinting: boolean;
  readonly isSeated: boolean;
}

/** Time of day, read from `DayNight.state`. */
export interface CatClock {
  readonly state: { readonly hours: number; readonly night: boolean };
}
