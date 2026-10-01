import type * as THREE from 'three';
import type { FaceKey } from './motion/gestures';

/*
 * A person standing at something that directs their body move by move (a machine they play): the
 * hoop cage has them bend for a ball, lift it, dip and shoot; the dance pad puts their feet on its
 * arrows. Everything eases on the body's own springs; `null` gives a part back to the pose. And
 * what happens to them, for them to react to in their own way (`react`).
 */

/** Things that happen to someone playing, from small to big. */
export type Reaction =
  /** A point, a hit: a small nod, a smile. */
  | 'good'
  /** A bonus, a combo, a basket in a streak, a jackpot: a fist pump, a clap. */
  | 'great'
  /** A new record, a prize won: arms up and a hop. */
  | 'record'
  /** A life lost, a ball drained, a streak broken: a wince, a shake of the head, a slap on the panel. */
  | 'fail'
  /** So close (round the rim and out, the claw dropping it): hands to the head. */
  | 'near'
  /** The game over: a sigh, a rub of the neck, a stretch. */
  | 'over'
  /** About to play: hands rubbed together. */
  | 'ready';

export interface Performer {
  /** World points for each hand's palm (null: that hand to the pose), or null for both. */
  reachEach(left: THREE.Vector3 | null, right: THREE.Vector3 | null): void;
  /** Knees bent (0 standing .. 1 a deep crouch), up on the toes (0..1), the back bent forward (radians). */
  crouch(amount: number): void;
  rise(amount: number): void;
  lean(angle: number): void;
  /** Each hand's curl (> 0 to a fist, < 0 open and spread) and wrist flex (+ towards the palm), overriding the pose's. */
  hands(curl: readonly [number, number] | null, flex?: readonly [number, number]): void;
  /** Where the eyes go (world), or null to the director's focus. */
  eyesOn(point: THREE.Vector3 | null): void;
  /** A foot (0: -x, 1: +x) put on a world point of the floor (null: back under the body, as the stance has it). */
  footAt(foot: 0 | 1, point: THREE.Vector3 | null): void;
  /** The middle of a palm now (world), for something held in it. */
  palm(hand: 0 | 1, out: THREE.Vector3): THREE.Vector3;
  react(reaction: Reaction): void;
  /** A feeling on the face only (0..1 each), held `seconds` (the body busy with a throw). */
  feel(expression: FaceKey, seconds: number): void;
  /** Whether a gesture (a reaction) has the arms right now. */
  readonly gesturing: string | null;
  /** Standing on something `height` metres over the floor (a dance pad's platform), or on the floor (0). */
  standOn(height: number): void;
  /** Everything a director asked for given back: hands, feet, knees, toes, eyes, height. */
  release(): void;
}
