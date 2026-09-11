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
  /** Walking speed in m/s; 0 = standing still. Drives the leg cycle and body bob. */
  setSpeed(mps: number): void;
  /** Turns the head (clamped) towards a world point; null = look ahead. */
  gaze(target: THREE.Vector3 | null): void;
  /** Purring: eyes narrow, slow tail sway, subtle body tremble. */
  setPurring(on: boolean): void;
  /** Ears back + tail lash for a moment (grumbling, startled). */
  flick(): void;
  setCoat(coat: CoatKind): void;
  setHovered(hovered: boolean): void;
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
}

/** The cat's voice (Web Audio): purr bed and meows, faded by distance to the listener. */
export interface CatVoiceLike {
  setPurring(on: boolean): void;
  meow(kind: 'demand' | 'greet' | 'grumble'): void;
  /** Distance from the listener to the cat, metres; the voice fades with it. */
  setDistance(metres: number): void;
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
