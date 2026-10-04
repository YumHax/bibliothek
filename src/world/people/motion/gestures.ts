import type { ArmAngles } from '../poses';
import { smooth } from './springs';

/*
 * Gestures: short keyframed moves, pose to pose, as an animator blocks them. A key sets, at a
 * moment, where an arm is (its joint angles: it overrides the pose or the hands on a machine while
 * the gesture has keys for it, then hands them back) and offsets on top of everything else: the
 * back bent, the knees bent, up on the toes, the hips forward, the shoulders up, the head turned,
 * the face. Between keys every channel eases in and out (a hold where two keys agree); the springs
 * of the body then add the weight, the lag and the settle. Additive channels start from nothing
 * and ease back to nothing by the end, so a gesture can play over any stance. Times are seconds at
 * tempo 1 (a brisk person plays them quicker).
 */

/** An arm's key: shoulder swing and spread, elbow bend and turn, forearm twist about z, wrist flex, forearm twist (palm up), hand curl. */
type ArmKey = readonly [ux: number, uz: number, lx: number, ly: number, lz?: number, wf?: number, tw?: number, curl?: number];

export interface FaceKey {
  smile?: number;
  browsUp?: number;
  frown?: number;
  squint?: number;
  jaw?: number;
}

interface Key {
  at: number;
  /** The arm on -x (`l`) or +x (`r`), or both: `both` is the +x arm's angles, mirrored for the other. */
  l?: ArmKey;
  r?: ArmKey;
  both?: ArmKey;
  /** Forward bend of the back (radians; back is negative). */
  spine?: number;
  /** Turn of the chest (radians). */
  twist?: number;
  /** Knees bent (0..1 of a deep crouch). */
  crouch?: number;
  /** Up on the toes (0..1). */
  rise?: number;
  /** The hips pushed forward (metres). */
  hips?: number;
  /** Shoulders up (radians at the collarbone), both or each. */
  shrug?: number | readonly [number, number];
  /** Head pitch (down +), yaw, roll, on top of the gaze. */
  head?: readonly [number, number, number];
  face?: FaceKey;
}

interface Gesture {
  /** Seconds (at tempo 1) until it has let go of everything. */
  readonly length: number;
  readonly keys: readonly Key[];
  /** The eyes follow the head's own turn rather than the gaze (looking at a watch, round the room). */
  readonly ownGaze?: boolean;
}

const POCKET: ArmKey = [0.1, 0.02, -0.5, 0, -0.35, 0, 0, 0.5];

export const GESTURES = {
  /** A fist up, then pulled down hard: yes! */
  fistPump: {
    length: 1.1,
    keys: [
      { at: 0.14, r: [-1.05, 0.25, -2.15, -0.3, 0, 0.1, 0, 1], spine: -0.05, head: [-0.08, 0, 0], face: { smile: 1, browsUp: 0.3 } },
      { at: 0.36, r: [-0.25, 0.22, -2.05, -0.35, 0, 0.2, 0, 1], spine: 0.1, crouch: 0.12, head: [0.12, 0, 0], face: { smile: 1, squint: 0.5 } },
      { at: 0.62, r: [-0.3, 0.22, -2.0, -0.35, 0, 0.2, 0, 1], spine: 0.06, crouch: 0.06, face: { smile: 0.9 } },
    ],
  },
  /** Both arms up and a hop or two: a record, a jackpot. */
  cheerHop: {
    length: 1.7,
    keys: [
      { at: 0.12, both: [-2.2, 0.35, -0.9, 0, 0, 0, 0.3, -0.6], crouch: 0.16, head: [-0.1, 0, 0], face: { smile: 1, browsUp: 0.8, jaw: 0.5 } },
      { at: 0.3, both: [-2.75, 0.42, -0.3, 0, 0, -0.2, 0.4, -0.9], crouch: 0, rise: 1, spine: -0.1, head: [-0.25, 0, 0], face: { smile: 1, browsUp: 1, jaw: 0.8 } },
      { at: 0.5, both: [-2.7, 0.4, -0.35, 0, 0, -0.2, 0.4, -0.9], crouch: 0.14, rise: 0, spine: -0.02, face: { smile: 1, browsUp: 0.8, jaw: 0.4 } },
      { at: 0.7, both: [-2.75, 0.44, -0.3, 0, 0, -0.2, 0.4, -0.9], rise: 0.7, spine: -0.08, head: [-0.2, 0, 0], face: { smile: 1, browsUp: 0.9, jaw: 0.7 } },
      { at: 1.15, both: [-2.6, 0.4, -0.4, 0, 0, 0, 0.3, -0.5], crouch: 0.04, face: { smile: 1, browsUp: 0.5 } },
    ],
  },
  /** Both hands to the head: it rolled round the rim and out. */
  handsOnHead: {
    length: 1.9,
    keys: [
      { at: 0.28, both: [-2.35, 0.85, -2.2, -0.35, 0, 0.2, 0, -0.2], spine: -0.1, head: [-0.18, 0, 0], face: { browsUp: 1, jaw: 0.45 } },
      { at: 0.8, both: [-2.4, 0.85, -2.25, -0.35, 0, 0.2, 0, -0.1], spine: -0.12, head: [-0.12, 0.12, 0.05], face: { browsUp: 0.8, frown: 0.3, jaw: 0.3 } },
      { at: 1.35, both: [-2.35, 0.85, -2.2, -0.35, 0, 0.2, 0, -0.2], spine: -0.06, head: [0.05, -0.1, 0], face: { browsUp: 0.5, frown: 0.4 } },
    ],
  },
  /** A hand to the forehead, the head down into it. */
  facepalm: {
    length: 1.8,
    keys: [
      { at: 0.32, r: [-1.15, 0.1, -2.45, -0.55, 0, 0.35, 0.2, -0.3], head: [0.3, 0, 0.05], spine: 0.1, face: { frown: 0.8, squint: 0.8 } },
      { at: 0.7, r: [-1.15, 0.1, -2.45, -0.55, 0, 0.35, 0.2, -0.3], head: [0.32, 0.1, 0.05], face: { frown: 0.8, squint: 1 } },
      { at: 1.0, r: [-1.15, 0.1, -2.45, -0.55, 0, 0.35, 0.2, -0.3], head: [0.32, -0.1, 0.05], face: { frown: 0.7, squint: 1 } },
      { at: 1.3, r: [-1.1, 0.1, -2.4, -0.55, 0, 0.3, 0.2, -0.3], head: [0.25, 0, 0], face: { frown: 0.5, squint: 0.6 } },
    ],
  },
  /** No, no, no. */
  headShake: {
    length: 1.1,
    keys: [
      { at: 0.15, head: [0.06, 0.28, 0], face: { frown: 0.8 } },
      { at: 0.35, head: [0.08, -0.28, 0], face: { frown: 0.9 } },
      { at: 0.55, head: [0.1, 0.22, 0], face: { frown: 0.9 } },
      { at: 0.75, head: [0.1, -0.16, 0], face: { frown: 0.7 } },
    ],
  },
  /** Shoulders up, palms up: what can you do. */
  shrug: {
    length: 1.4,
    keys: [
      { at: 0.3, both: [-0.2, 0.35, -1.35, 0.45, 0, -0.2, 1.3, -0.6], shrug: 0.14, head: [0, 0, 0.12], face: { browsUp: 0.8, frown: 0.2 } },
      { at: 0.75, both: [-0.2, 0.35, -1.35, 0.45, 0, -0.2, 1.3, -0.6], shrug: 0.12, head: [0.02, 0, 0.14], face: { browsUp: 0.7 } },
    ],
  },
  /** Four claps in front of the chest. */
  clap: {
    length: 1.4,
    keys: [
      { at: 0.18, both: [-0.65, 0.1, -1.4, -0.3, 0, 0.1, 0, -0.5], face: { smile: 0.9 } },
      { at: 0.3, both: [-0.65, 0.1, -1.4, -0.63, 0, 0.1, 0, -0.5] },
      { at: 0.42, both: [-0.65, 0.1, -1.4, -0.32, 0, 0.1, 0, -0.5] },
      { at: 0.54, both: [-0.65, 0.1, -1.4, -0.63, 0, 0.1, 0, -0.5] },
      { at: 0.66, both: [-0.65, 0.1, -1.4, -0.32, 0, 0.1, 0, -0.5] },
      { at: 0.78, both: [-0.65, 0.1, -1.4, -0.63, 0, 0.1, 0, -0.5] },
      { at: 0.9, both: [-0.65, 0.1, -1.4, -0.32, 0, 0.1, 0, -0.5] },
      { at: 1.02, both: [-0.65, 0.1, -1.4, -0.63, 0, 0.1, 0, -0.5], face: { smile: 1 } },
    ],
  },
  /** A fist brought down on the panel (a game lost at the last moment). */
  slapPanel: {
    length: 1.1,
    keys: [
      { at: 0.22, r: [-1.1, 0.15, -1.75, -0.2, 0, 0, 0, 1], spine: -0.04, face: { frown: 1, squint: 0.4 } },
      { at: 0.36, r: [-0.75, 0.12, -0.55, -0.15, 0, -0.2, 0, 1], spine: 0.12, crouch: 0.06, face: { frown: 1, squint: 0.8, jaw: 0.3 } },
      { at: 0.62, r: [-0.72, 0.12, -0.6, -0.15, 0, -0.2, 0, 1], spine: 0.1, face: { frown: 0.8 } },
    ],
  },
  /** A flinch: the head back and aside, the shoulders up (hands stay where they are). */
  wince: {
    length: 0.7,
    keys: [
      { at: 0.1, spine: -0.07, head: [-0.12, 0.12, 0.06], shrug: 0.1, face: { squint: 1, frown: 0.7 } },
      { at: 0.3, spine: -0.03, head: [-0.04, 0.05, 0.02], shrug: 0.04, face: { squint: 0.5, frown: 0.5 } },
    ],
  },
  /** A breath in and a long breath out, the shoulders dropping, eyes down: the game is over. */
  sigh: {
    length: 2.2,
    keys: [
      { at: 0.5, shrug: 0.14, spine: -0.07, head: [-0.08, 0, 0], face: { browsUp: 0.3 } },
      { at: 1.2, shrug: -0.06, spine: 0.08, head: [0.25, 0, 0.06], face: { frown: 0.4, squint: 0.3 } },
      { at: 1.7, shrug: -0.04, spine: 0.06, head: [0.2, 0, 0.04], face: { frown: 0.3 } },
    ],
  },
  /** Hands rubbed together: here we go. */
  rubHands: {
    length: 1.5,
    keys: [
      { at: 0.25, both: [-0.55, 0.08, -1.45, -0.62, 0, 0.2, 0.3, -0.3], face: { smile: 0.7 } },
      { at: 0.4, both: [-0.52, 0.08, -1.5, -0.6, 0, 0.2, 0.55, -0.3] },
      { at: 0.55, both: [-0.57, 0.08, -1.4, -0.62, 0, 0.2, 0.1, -0.3] },
      { at: 0.7, both: [-0.52, 0.08, -1.5, -0.6, 0, 0.2, 0.55, -0.3] },
      { at: 0.85, both: [-0.57, 0.08, -1.4, -0.62, 0, 0.2, 0.1, -0.3] },
      { at: 1.0, both: [-0.55, 0.08, -1.45, -0.62, 0, 0.2, 0.3, -0.3], face: { smile: 0.8 } },
    ],
  },
  /** A hand into the front pocket for a coin, then forward to the slot. */
  insertCoin: {
    length: 2.5,
    keys: [
      { at: 0.35, r: POCKET, head: [0.22, 0, 0], spine: 0.04 },
      { at: 0.85, r: [0.12, 0.02, -0.55, 0, -0.35, 0.1, 0, 0.7], head: [0.24, 0, 0] },
      { at: 1.3, r: [-0.9, 0.1, -0.85, -0.25, 0, 0.3, 0, 0.7], head: [0.3, 0, 0], spine: 0.12 },
      { at: 1.6, r: [-0.95, 0.1, -0.72, -0.25, 0, 0.45, 0, 0.7], head: [0.3, 0, 0], spine: 0.13 },
      { at: 1.95, r: [-0.9, 0.1, -0.85, -0.25, 0, 0.2, 0, 0.3], head: [0.2, 0, 0], spine: 0.08 },
    ],
    ownGaze: true,
  },
  /** Hello: a hand up, waving from the elbow. */
  wave: {
    length: 1.7,
    keys: [
      { at: 0.3, r: [-2.4, 0.45, -1.1, 0, 0, -0.1, 0.9, -1], face: { smile: 1, browsUp: 0.5 } },
      { at: 0.5, r: [-2.4, 0.45, -1.1, -0.35, 0, -0.1, 0.9, -1] },
      { at: 0.7, r: [-2.4, 0.45, -1.1, 0.3, 0, -0.1, 0.9, -1] },
      { at: 0.9, r: [-2.4, 0.45, -1.1, -0.35, 0, -0.1, 0.9, -1] },
      { at: 1.1, r: [-2.4, 0.45, -1.1, 0.25, 0, -0.1, 0.9, -1], face: { smile: 1 } },
    ],
  },
  /** An arm out at something: look! */
  point: {
    length: 1.5,
    keys: [
      { at: 0.25, r: [-1.45, 0.18, -0.15, 0, 0, 0, 0, 0.9], spine: 0.04, face: { browsUp: 0.7, jaw: 0.3 } },
      { at: 1.0, r: [-1.45, 0.18, -0.18, 0, 0, 0, 0, 0.9], face: { browsUp: 0.5 } },
    ],
  },
  /** A hand over the mouth: oh no, so close. */
  coverMouth: {
    length: 1.5,
    keys: [
      { at: 0.25, r: [-0.85, 0.04, -2.35, -0.55, 0, 0.3, 0.3, -0.3], spine: -0.05, face: { browsUp: 1, jaw: 0.3 } },
      { at: 0.95, r: [-0.85, 0.04, -2.35, -0.55, 0, 0.3, 0.3, -0.3], face: { browsUp: 0.6, frown: 0.3 } },
    ],
  },
  // --- Fidgets -----------------------------------------------------------------------------------
  scratchHead: {
    length: 2.3,
    keys: [
      { at: 0.4, r: [-1.6, 0.7, -2.5, -0.7, 0, 0.3, 0, 0.4], head: [0.08, 0, -0.12], face: { frown: 0.3 } },
      { at: 0.6, r: [-1.6, 0.7, -2.5, -0.7, 0, 0.6, 0, 0.5], head: [0.08, 0, -0.12] },
      { at: 0.8, r: [-1.6, 0.7, -2.5, -0.7, 0, 0.1, 0, 0.4], head: [0.1, 0, -0.14] },
      { at: 1.0, r: [-1.6, 0.7, -2.5, -0.7, 0, 0.6, 0, 0.5], head: [0.1, 0, -0.14] },
      { at: 1.2, r: [-1.6, 0.7, -2.5, -0.7, 0, 0.1, 0, 0.4], head: [0.08, 0, -0.12] },
      { at: 1.6, r: [-1.6, 0.7, -2.5, -0.7, 0, 0.3, 0, 0.4], head: [0.05, 0, -0.08] },
    ],
  },
  rubNeck: {
    length: 2.2,
    keys: [
      { at: 0.4, r: [-1.45, 0.85, -2.55, -0.35, 0, 0.3, 0, 0.2], head: [0.18, 0, 0.1] },
      { at: 0.7, r: [-1.45, 0.85, -2.5, -0.25, 0, 0.3, 0, 0.3], head: [0.22, 0, 0.14] },
      { at: 1.0, r: [-1.45, 0.85, -2.55, -0.4, 0, 0.3, 0, 0.2], head: [0.2, 0, 0.06] },
      { at: 1.4, r: [-1.45, 0.85, -2.5, -0.3, 0, 0.3, 0, 0.3], head: [0.15, 0, 0.1] },
    ],
  },
  checkWatch: {
    length: 1.9,
    keys: [
      { at: 0.35, l: [-0.55, -0.08, -1.7, 0.95, 0, 0.2, -0.9, 0.3], head: [0.45, -0.12, 0] },
      { at: 1.3, l: [-0.55, -0.08, -1.7, 0.95, 0, 0.2, -0.9, 0.3], head: [0.45, -0.12, 0] },
    ],
    ownGaze: true,
  },
  adjustGlasses: {
    length: 1.3,
    keys: [
      { at: 0.3, r: [-1.0, 0.05, -2.5, -0.62, 0, 0.4, 0, 0.6], head: [0.06, 0, 0] },
      { at: 0.55, r: [-1.02, 0.05, -2.52, -0.62, 0, 0.5, 0, 0.6], head: [0.02, 0, 0] },
    ],
  },
  stretch: {
    length: 2.6,
    keys: [
      { at: 0.6, both: [-2.95, 0.3, -0.6, -0.4, 0, -0.4, 0, -0.6], spine: -0.18, rise: 0.4, head: [-0.25, 0, 0], face: { jaw: 0.9, squint: 0.8 } },
      { at: 1.5, both: [-2.95, 0.34, -0.55, -0.4, 0, -0.4, 0, -0.7], spine: -0.2, rise: 0.3, head: [-0.28, 0, 0.05], face: { jaw: 0.6, squint: 0.9 } },
      { at: 1.9, both: [-1.2, 0.4, -0.6, 0, 0, 0, 0, -0.2], spine: -0.05 },
    ],
  },
  rollShoulders: {
    length: 1.7,
    keys: [
      { at: 0.3, shrug: 0.15, head: [0, 0, 0.1] },
      { at: 0.6, shrug: 0.02, head: [0.04, 0, 0] },
      { at: 0.9, shrug: 0.13, head: [0, 0, -0.1] },
      { at: 1.2, shrug: 0 },
    ],
  },
  lookAround: {
    length: 3.2,
    keys: [
      { at: 0.6, head: [-0.02, 0.6, 0] },
      { at: 1.2, head: [-0.02, 0.62, 0] },
      { at: 1.9, head: [0.02, -0.5, 0] },
      { at: 2.5, head: [0.02, -0.52, 0] },
    ],
    ownGaze: true,
  },
  wipeHands: {
    length: 1.3,
    keys: [
      { at: 0.25, both: [0.14, 0.14, -0.3, 0, 0, 0, 0, -0.4], head: [0.15, 0, 0] },
      { at: 0.45, both: [-0.06, 0.14, -0.3, 0, 0, 0, 0, -0.4], head: [0.15, 0, 0] },
      { at: 0.65, both: [0.14, 0.14, -0.3, 0, 0, 0, 0, -0.4], head: [0.12, 0, 0] },
      { at: 0.85, both: [-0.06, 0.14, -0.3, 0, 0, 0, 0, -0.4], head: [0.1, 0, 0] },
    ],
  },
  /** Pinball: the hips bump the cabinet, hands stay on the buttons. */
  nudge: {
    length: 0.6,
    keys: [
      { at: 0.1, hips: 0.045, spine: 0.06, crouch: 0.05 },
      { at: 0.24, hips: -0.005, spine: 0.02 },
    ],
  },
  /** Sitting back up after leaning in: the back arches a moment. */
  straighten: {
    length: 1.2,
    keys: [
      { at: 0.4, spine: -0.1, shrug: 0.06, head: [-0.1, 0, 0] },
      { at: 0.7, spine: -0.06, shrug: 0.02 },
    ],
  },
} satisfies Record<string, Gesture>;

export type GestureName = keyof typeof GESTURES;

/** What a gesture asks for at a moment: arms (when it holds them) and the offsets. */
interface GestureFrame {
  arms: [ArmAngles | null, ArmAngles | null];
  spine: number;
  twist: number;
  crouch: number;
  rise: number;
  hips: number;
  shrug: [number, number];
  head: [number, number, number];
  face: Required<FaceKey>;
  ownGaze: boolean;
}

/** A gesture under way: `sample` its frame at its own time; done once past its length. */
export class GesturePlayer {
  private gesture: Gesture | null = null;
  private time = 0;
  private rate = 1;
  /** The name of the one playing, or null. */
  name: GestureName | null = null;
  readonly frame: GestureFrame = {
    arms: [null, null],
    spine: 0,
    twist: 0,
    crouch: 0,
    rise: 0,
    hips: 0,
    shrug: [0, 0],
    head: [0, 0, 0],
    face: { smile: 0, browsUp: 0, frown: 0, squint: 0, jaw: 0 },
    ownGaze: false,
  };
  private readonly armScratch: [ArmAngles, ArmAngles] = [blankArm(), blankArm()];

  get playing(): boolean {
    return this.gesture !== null;
  }

  play(name: GestureName, rate = 1): void {
    this.gesture = GESTURES[name];
    this.name = name;
    this.time = 0;
    this.rate = rate;
  }

  stop(): void {
    this.gesture = null;
    this.name = null;
  }

  /** Moves on by `dt` and fills `frame` (all zeros, no arms, when nothing plays). */
  update(dt: number): GestureFrame {
    const f = this.frame;
    const g = this.gesture;
    if (g) {
      this.time += dt * this.rate;
      if (this.time >= g.length) this.stop();
    }
    if (!this.gesture) {
      f.arms[0] = f.arms[1] = null;
      f.spine = f.twist = f.crouch = f.rise = f.hips = 0;
      f.shrug[0] = f.shrug[1] = 0;
      f.head[0] = f.head[1] = f.head[2] = 0;
      f.face.smile = f.face.browsUp = f.face.frown = f.face.squint = f.face.jaw = 0;
      f.ownGaze = false;
      return f;
    }
    const t = this.time;
    const keys = this.gesture.keys;
    const length = this.gesture.length;
    f.ownGaze = this.gesture.ownGaze ?? false;
    f.spine = channel(keys, t, length, (k) => k.spine);
    f.twist = channel(keys, t, length, (k) => k.twist);
    f.crouch = channel(keys, t, length, (k) => k.crouch);
    f.rise = channel(keys, t, length, (k) => k.rise);
    f.hips = channel(keys, t, length, (k) => k.hips);
    f.shrug[0] = channel(keys, t, length, (k) => (k.shrug === undefined ? undefined : typeof k.shrug === 'number' ? k.shrug : k.shrug[0]));
    f.shrug[1] = channel(keys, t, length, (k) => (k.shrug === undefined ? undefined : typeof k.shrug === 'number' ? k.shrug : k.shrug[1]));
    for (let i = 0; i < 3; i++) f.head[i] = channel(keys, t, length, (k) => k.head?.[i]);
    f.face.smile = channel(keys, t, length, (k) => k.face?.smile);
    f.face.browsUp = channel(keys, t, length, (k) => k.face?.browsUp);
    f.face.frown = channel(keys, t, length, (k) => k.face?.frown);
    f.face.squint = channel(keys, t, length, (k) => k.face?.squint);
    f.face.jaw = channel(keys, t, length, (k) => k.face?.jaw);
    for (let side = 0; side < 2; side++) f.arms[side] = armAt(keys, t, side, this.armScratch[side]!);
    return f;
  }
}

function blankArm(): ArmAngles {
  return { ux: 0, uz: 0, lx: 0, ly: 0, lz: 0, wf: 0, tw: 0, curl: 0 };
}

/** An additive channel at `t`: from 0 at the start through its keys (eased), back to 0 at `length`. */
function channel(keys: readonly Key[], t: number, length: number, read: (k: Key) => number | undefined): number {
  let prevAt = 0;
  let prev = 0;
  for (const k of keys) {
    const v = read(k);
    if (v === undefined) continue;
    if (t <= k.at) return prev + (v - prev) * smooth((t - prevAt) / Math.max(1e-3, k.at - prevAt));
    prevAt = k.at;
    prev = v;
  }
  return prev * (1 - smooth((t - prevAt) / Math.max(1e-3, length - prevAt)));
}

/** The arm on `side` (0: -x, 1: +x) at `t`: eased between its keys, held at the first before it; null past its last key (the pose takes it back). */
function armAt(keys: readonly Key[], t: number, side: number, out: ArmAngles): ArmAngles | null {
  let prev: ArmKey | null = null;
  let prevAt = 0;
  for (const k of keys) {
    const key = armOf(k, side);
    if (!key) continue;
    if (t <= k.at) {
      if (!prev) return write(out, key, key, 1);
      return write(out, prev, key, smooth((t - prevAt) / Math.max(1e-3, k.at - prevAt)));
    }
    prev = key;
    prevAt = k.at;
  }
  return null;
}

function armOf(k: Key, side: number): ArmKey | null {
  if (side === 0) return k.l ?? (k.both ? mirror(k.both) : null);
  return k.r ?? k.both ?? null;
}

/** The +x arm's angles for the -x arm: the spread, the turn across and the forearm's sideways swing change sign. */
function mirror(k: ArmKey): ArmKey {
  return [k[0], -k[1], k[2], -k[3], -(k[4] ?? 0), k[5], k[6], k[7]];
}

function write(out: ArmAngles, a: ArmKey, b: ArmKey, t: number): ArmAngles {
  const mix = (i: number): number => (a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * t;
  out.ux = mix(0);
  out.uz = mix(1);
  out.lx = mix(2);
  out.ly = mix(3);
  out.lz = mix(4);
  out.wf = mix(5);
  out.tw = mix(6);
  out.curl = mix(7);
  return out;
}
