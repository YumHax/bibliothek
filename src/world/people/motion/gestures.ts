import type { ArmAngles } from '../poses';
import { smooth } from '@/math/scalar';
import type { TouchSpot } from './touch';

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
  /** One corner of the mouth up, the person's own side (a half smile, scepticism, irony). */
  smirk?: number;
  browsUp?: number;
  frown?: number;
  squint?: number;
  jaw?: number;
  /** The brows' inner ends up, the corners of the mouth down. */
  sad?: number;
  /** The lips pressed thin. */
  press?: number;
  /** The nose wrinkled (distaste). */
  sneer?: number;
  /** The eyes wide open (surprise, alarm). */
  wide?: number;
  /** The cheeks blown out (a long breath out, "phew"). */
  puff?: number;
}

/** Every channel of a face, in one order (the gesture frame fills them, the face reads them). */
export const FACE_CHANNELS = ['smile', 'smirk', 'browsUp', 'frown', 'squint', 'jaw', 'sad', 'press', 'sneer', 'wide', 'puff'] as const satisfies readonly (keyof FaceKey)[];

/** A face with every channel at 0. */
export function blankFace(): Required<FaceKey> {
  return { smile: 0, smirk: 0, browsUp: 0, frown: 0, squint: 0, jaw: 0, sad: 0, press: 0, sneer: 0, wide: 0, puff: 0 };
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
  /** How far the hands are on their `touches` spots (0 the arm's own goal .. 1 on the body), both or each. */
  touch?: number | readonly [number, number];
  /** The touching hand rubbed across its spot (metres, outwards for each side). */
  rub?: number;
}

interface Gesture {
  /** Seconds (at tempo 1) until it has let go of everything. */
  readonly length: number;
  readonly keys: readonly Key[];
  /** The eyes follow the head's own turn rather than the gaze (looking at a watch, round the room). */
  readonly ownGaze?: boolean;
  /** Where on the body each hand goes (`touch` says how far, the arm solved to it): the -x hand, the +x hand. */
  readonly touches?: { readonly l?: TouchSpot; readonly r?: TouchSpot };
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
      { at: 0.28, both: [-2.35, 0.85, -2.2, -0.35, 0, 0.2, 0, -0.2], spine: -0.1, head: [-0.18, 0, 0], face: { browsUp: 1, jaw: 0.45, wide: 0.9 } },
      { at: 0.8, both: [-2.4, 0.85, -2.25, -0.35, 0, 0.2, 0, -0.1], spine: -0.12, head: [-0.12, 0.12, 0.05], face: { browsUp: 0.8, frown: 0.3, jaw: 0.3, wide: 0.5 } },
      { at: 1.35, both: [-2.35, 0.85, -2.2, -0.35, 0, 0.2, 0, -0.2], spine: -0.06, head: [0.05, -0.1, 0], face: { browsUp: 0.5, frown: 0.4 } },
    ],
  },
  /** A hand to the forehead, the head down into it. */
  facepalm: {
    length: 1.8,
    keys: [
      { at: 0.32, r: [-1.15, 0.1, -2.45, -0.55, 0, 0.35, 0.2, -0.3], head: [0.3, 0, 0.05], spine: 0.1, face: { frown: 0.8, squint: 0.8 } },
      { at: 0.7, r: [-1.15, 0.1, -2.45, -0.55, 0, 0.35, 0.2, -0.3], head: [0.32, 0.1, 0.05], face: { frown: 0.8, squint: 1, press: 0.6 } },
      { at: 1.0, r: [-1.15, 0.1, -2.45, -0.55, 0, 0.35, 0.2, -0.3], head: [0.32, -0.1, 0.05], face: { frown: 0.7, squint: 1, press: 0.5 } },
      { at: 1.3, r: [-1.1, 0.1, -2.4, -0.55, 0, 0.3, 0.2, -0.3], head: [0.25, 0, 0], face: { frown: 0.5, squint: 0.6 } },
    ],
  },
  /** No, no, no. */
  headShake: {
    length: 1.1,
    keys: [
      { at: 0.15, head: [0.06, 0.28, 0], face: { frown: 0.8 } },
      { at: 0.35, head: [0.08, -0.28, 0], face: { frown: 0.9, press: 0.5 } },
      { at: 0.55, head: [0.1, 0.22, 0], face: { frown: 0.9, press: 0.5 } },
      { at: 0.75, head: [0.1, -0.16, 0], face: { frown: 0.7 } },
    ],
  },
  /** Shoulders up, palms up: what can you do. */
  shrug: {
    length: 1.4,
    keys: [
      { at: 0.3, both: [-0.2, 0.35, -1.35, 0.45, 0, -0.2, 1.3, -0.6], shrug: 0.14, head: [0, 0, 0.12], face: { browsUp: 0.8, frown: 0.2, smirk: 0.6, press: 0.3 } },
      { at: 0.75, both: [-0.2, 0.35, -1.35, 0.45, 0, -0.2, 1.3, -0.6], shrug: 0.12, head: [0.02, 0, 0.14], face: { browsUp: 0.7, smirk: 0.5 } },
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
      { at: 0.62, r: [-0.72, 0.12, -0.6, -0.15, 0, -0.2, 0, 1], spine: 0.1, face: { frown: 0.8, press: 0.6 } },
    ],
  },
  /** A flinch: the head back and aside, the shoulders up (hands stay where they are). */
  wince: {
    length: 0.7,
    keys: [
      { at: 0.1, spine: -0.07, head: [-0.12, 0.12, 0.06], shrug: 0.1, face: { squint: 1, frown: 0.7, sneer: 0.6 } },
      { at: 0.3, spine: -0.03, head: [-0.04, 0.05, 0.02], shrug: 0.04, face: { squint: 0.5, frown: 0.5, sneer: 0.3 } },
    ],
  },
  /** A breath in and a long breath out, the shoulders dropping, eyes down: the game is over. */
  sigh: {
    length: 2.2,
    keys: [
      { at: 0.5, shrug: 0.14, spine: -0.07, head: [-0.08, 0, 0], face: { browsUp: 0.3 } },
      { at: 1.2, shrug: -0.06, spine: 0.08, head: [0.25, 0, 0.06], face: { frown: 0.2, squint: 0.3, sad: 0.5, puff: 0.6 } },
      { at: 1.7, shrug: -0.04, spine: 0.06, head: [0.2, 0, 0.04], face: { frown: 0.2, sad: 0.4 } },
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
      { at: 0.25, r: [-0.85, 0.04, -2.35, -0.55, 0, 0.3, 0.3, -0.3], spine: -0.05, face: { browsUp: 1, jaw: 0.3, wide: 1 } },
      { at: 0.95, r: [-0.85, 0.04, -2.35, -0.55, 0, 0.3, 0.3, -0.3], face: { browsUp: 0.6, frown: 0.3 } },
    ],
  },
  // --- A conversation's moments (`repertoire.respondSocial`, `socialSelf`) ----------------------
  /** A real laugh: the head thrown back twice, the shoulders bouncing with it, the eyes creased. */
  laugh: {
    length: 1.6,
    keys: [
      { at: 0.15, head: [-0.14, 0, 0.03], spine: -0.06, shrug: 0.08, face: { smile: 1, squint: 0.7, jaw: 0.35 } },
      { at: 0.32, head: [-0.06, 0, 0], spine: -0.02, shrug: 0.02 },
      { at: 0.5, head: [-0.14, 0, -0.03], spine: -0.05, shrug: 0.08, face: { smile: 1, squint: 0.8, jaw: 0.3 } },
      { at: 0.72, head: [-0.04, 0, 0], shrug: 0.02 },
      { at: 1.0, head: [0.04, 0, 0], face: { smile: 0.8, squint: 0.4 } },
    ],
  },
  /** The hands joined before the chest a moment, the head bowed a touch: thank you, really. */
  handsJoin: {
    length: 1.7,
    touches: { l: 'clasp', r: 'clasp' },
    keys: [
      { at: 0.35, touch: 1, head: [0.1, 0, 0], face: { smile: 0.9, browsUp: 0.4 } },
      { at: 1.1, touch: 1, head: [0.05, 0, 0] },
    ],
  },
  /** A look aside and a little down, polite: not their thing. */
  glanceAway: {
    length: 1.3,
    keys: [
      { at: 0.3, head: [0.08, 0.38, 0.03] },
      { at: 0.8, head: [0.06, 0.32, 0.02] },
    ],
    ownGaze: true,
  },
  /** Come here: a hand forward, palm up, the fingers curling in twice. */
  beckon: {
    length: 1.4,
    keys: [
      { at: 0.25, r: [-0.75, 0.15, -1.25, 0, 0, -0.2, 1.3, -0.5], head: [0, 0, 0.08], face: { smile: 0.5, browsUp: 0.4 } },
      { at: 0.45, r: [-0.75, 0.15, -1.6, 0, 0, 0.5, 1.3, 0.6] },
      { at: 0.65, r: [-0.75, 0.15, -1.25, 0, 0, -0.2, 1.3, -0.5] },
      { at: 0.85, r: [-0.75, 0.15, -1.6, 0, 0, 0.5, 1.3, 0.6], face: { smile: 0.5, browsUp: 0.3 } },
    ],
  },
  /** A word in the ear of whoever is beside them: a hand by the mouth, the head on one side, leaning in. */
  whisper: {
    length: 2,
    touches: { r: 'lips' },
    keys: [
      { at: 0.45, touch: [0, 0.55], spine: 0.08, head: [0.05, 0, 0.12], face: { smirk: 0.3, press: 0.2 } },
      { at: 1.4, touch: [0, 0.55], spine: 0.08, head: [0.06, 0, 0.12] },
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
  /** Tidying the table in front: a lean over it, the hands squaring a box or two, a look down at the wares. */
  tidy: {
    length: 2.6,
    keys: [
      { at: 0.45, both: [-0.6, 0.1, -0.5, -0.2, 0, -0.5, 0, -0.2], spine: 0.14, head: [0.38, 0, 0] },
      { at: 0.95, l: [-0.62, -0.06, -0.48, 0.25, 0, -0.5, 0, 0.3], r: [-0.55, 0.16, -0.58, -0.3, 0, -0.4, 0, 0.3], spine: 0.15, head: [0.4, 0.08, 0] },
      { at: 1.5, l: [-0.55, -0.14, -0.6, 0.3, 0, -0.4, 0, 0.3], r: [-0.63, 0.06, -0.46, -0.22, 0, -0.5, 0, 0.3], spine: 0.15, head: [0.4, -0.08, 0] },
      { at: 2.0, both: [-0.5, 0.1, -0.5, -0.2, 0, -0.4, 0, -0.1], spine: 0.08, head: [0.25, 0, 0] },
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
  // --- Self-contact: a hand on the body (`touches`, the arm solved onto the spot) -----------------
  /** The chin on the knuckles a while: thinking it over, listening. */
  chinRest: {
    length: 4.8,
    touches: { r: 'chin' },
    keys: [
      { at: 0.8, touch: [0, 1], head: [0.06, 0, 0.05] },
      { at: 3.8, touch: [0, 1], head: [0.08, 0, 0.07] },
    ],
  },
  /** Fingers along the cheek and the jaw. */
  touchCheek: {
    length: 2.4,
    touches: { r: 'cheek' },
    keys: [
      { at: 0.55, touch: [0, 1], head: [0.03, 0, 0.06] },
      { at: 0.95, rub: 0.007 },
      { at: 1.35, rub: -0.004 },
      { at: 1.7, touch: [0, 1], rub: 0, head: [0.04, 0, 0.07] },
    ],
  },
  /** A quick rub of the nose. */
  rubNose: {
    length: 1.5,
    touches: { r: 'nose' },
    keys: [
      { at: 0.4, touch: [0, 1], head: [0.06, 0, 0] },
      { at: 0.52, rub: 0.007 },
      { at: 0.64, rub: -0.006 },
      { at: 0.76, rub: 0.005 },
      { at: 0.9, touch: [0, 1], rub: 0, head: [0.05, 0, 0] },
    ],
  },
  /** A scratch at the back of the neck, the head bowed into it. */
  scratchNape: {
    length: 2.5,
    touches: { r: 'nape' },
    keys: [
      { at: 0.6, touch: [0, 1], head: [0.16, 0, 0.06], face: { squint: 0.2 } },
      { at: 0.8, rub: 0.012 },
      { at: 1.0, rub: -0.008 },
      { at: 1.2, rub: 0.01 },
      { at: 1.4, rub: -0.006 },
      { at: 1.7, touch: [0, 1], rub: 0, head: [0.12, 0, 0.04] },
    ],
  },
  /** The hands joined in front, a while: waiting, listening. */
  claspHands: {
    length: 6.5,
    touches: { l: 'clasp', r: 'clasp' },
    keys: [
      { at: 0.8, touch: 1 },
      { at: 5.6, touch: 1 },
    ],
  },
  /** One hand in the front pocket a while. */
  pocketHand: {
    length: 7,
    keys: [
      { at: 0.7, r: POCKET },
      { at: 6.2, r: POCKET },
    ],
  },
  /** A sip from what is in the hand (a cup): up to the lips, the head back a little, down again. */
  sip: {
    length: 2.4,
    touches: { r: 'lips' },
    keys: [
      { at: 0.6, touch: [0, 1], head: [0.04, 0, 0] },
      { at: 1.0, touch: [0, 1], head: [-0.16, 0, 0], face: { press: 0.2, squint: 0.15 } },
      { at: 1.5, touch: [0, 1], head: [-0.05, 0, 0] },
      { at: 1.9, touch: [0, 0.3], face: { smile: 0.15 } },
    ],
  },
  /** A draw on a cigarette, then the smoke let out of the side of the mouth. */
  smokePuff: {
    length: 3,
    touches: { r: 'lips' },
    keys: [
      { at: 0.6, touch: [0, 1], face: { press: 0.4, squint: 0.3 } },
      { at: 1.2, touch: [0, 1], shrug: 0.05, face: { press: 0.5, squint: 0.4 } },
      { at: 1.6, touch: [0, 0.2], head: [-0.08, 0.12, 0], face: { puff: 0.5, jaw: 0.15, smirk: 0.4 } },
      { at: 2.3, touch: [0, 0], head: [-0.03, 0.05, 0], face: { jaw: 0.08 } },
    ],
  },
  /** A photo: the camera up to the eye in both hands, held still a moment, then down to look at it. */
  takePhoto: {
    length: 3.2,
    keys: [
      { at: 0.5, both: [-1.2, 0.12, -1.9, -0.55, 0, 0.25, 0.35, 0.4], head: [0.02, 0, 0], face: { squint: 0.4 } },
      { at: 1.6, both: [-1.2, 0.12, -1.92, -0.55, 0, 0.25, 0.35, 0.45], head: [0.02, 0, 0], face: { squint: 0.6 } },
      { at: 2.3, r: [-0.7, 0.1, -1.7, -0.4, 0, 0.2, 0.2, 0.5], head: [0.35, 0, 0], face: { smile: 0.5 } },
    ],
    ownGaze: true,
  },
  /** The head a little on one side, the brows up: listening. */
  listenTilt: {
    length: 2.2,
    keys: [
      { at: 0.6, head: [0.03, 0.04, 0.1], face: { browsUp: 0.3, smile: 0.12 } },
      { at: 1.5, head: [0.04, 0.03, 0.11], face: { browsUp: 0.2, smile: 0.1 } },
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
  /** Per hand (-x, +x): the spot on the body it goes to, how far (0..1), the rub across it (metres). */
  touch: [TouchFrame, TouchFrame];
}

interface TouchFrame {
  spot: TouchSpot | null;
  weight: number;
  rub: number;
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
    face: blankFace(),
    ownGaze: false,
    touch: [
      { spot: null, weight: 0, rub: 0 },
      { spot: null, weight: 0, rub: 0 },
    ],
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
      for (const name of FACE_CHANNELS) f.face[name] = 0;
      f.ownGaze = false;
      for (const touch of f.touch) {
        touch.spot = null;
        touch.weight = touch.rub = 0;
      }
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
    for (const name of FACE_CHANNELS) f.face[name] = faceChannel(keys, t, length, name);
    for (let side = 0; side < 2; side++) f.arms[side] = armAt(keys, t, side, this.armScratch[side]!);
    const touches = this.gesture.touches;
    for (let side = 0; side < 2; side++) {
      const touch = f.touch[side]!;
      touch.spot = (side ? touches?.r : touches?.l) ?? null;
      touch.weight = touch.spot ? channel(keys, t, length, TOUCH_OF[side]!) : 0;
      touch.rub = touch.spot ? channel(keys, t, length, rubOf) : 0;
    }
    return f;
  }
}

/** A key's touch weight for the -x hand and the +x hand; its rub. */
const TOUCH_OF = [(k: Key): number | undefined => (k.touch === undefined ? undefined : typeof k.touch === 'number' ? k.touch : k.touch[0]), (k: Key): number | undefined => (k.touch === undefined ? undefined : typeof k.touch === 'number' ? k.touch : k.touch[1])] as const;
const rubOf = (k: Key): number | undefined => k.rub;

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

/** `channel` for one of the face's channels (no closure per frame and channel). */
function faceChannel(keys: readonly Key[], t: number, length: number, name: keyof FaceKey): number {
  let prevAt = 0;
  let prev = 0;
  for (const k of keys) {
    const v = k.face?.[name];
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
