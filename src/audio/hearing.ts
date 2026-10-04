import * as THREE from 'three';
import { spatialOf, type Spatial } from './spatial';

/*
 * How loud a sound is where the listener stands, by its distance and the walls in between: one curve family for
 * the whole game, a profile per kind of sound. A room's small sound, a neighbour's bell, the cat, a street lamp's
 * buzz each name their profile (or take a shared one from `HEARING`) instead of writing their own curve; the walls
 * are counted once, by the one `SoundOcclusion` the bootstrap hands out (`setEars`), with its routes (the flat to
 * the stairwell). Where the sound comes from (the side, the walls' low-pass) is `spatial.ts`; the loudness is here.
 */

export interface HearingProfile {
  /** Metres within which the sound is at its full level. Default 1. */
  referenceDistance?: number;
  /** Metres past which it is silent (`Infinity`: it only ever fades). Default 12. */
  maxDistance?: number;
  /**
   * The fall past `referenceDistance`: `inverse` (Web Audio's inverse model, `ref / (ref + rolloff · (d − ref))`),
   * `inverseSquare` (`1 / (1 + (d / ref)²)`), `ramp` (a line from 1 at `ref` to 0 at `maxDistance`) or
   * `rampSquared` (that line squared). Default inverse.
   */
  shape?: 'inverse' | 'inverseSquare' | 'ramp' | 'rampSquared';
  /** How fast the inverse fall is (default 1.5). */
  rolloff?: number;
  /** Multiplies the level before it is capped at 1: an inverse-square curve that stays full out to about the reference. Default 1. */
  boost?: number;
  /** Metres before `maxDistance` over which a line takes the sound to silence instead of a cut. Default 1 for `inverse`, 0 otherwise. */
  fade?: number;
  /** The share of the level each wall between lets through. Default 0.3. */
  wallGain?: number;
  /** For a sound that can only be faced, not panned (a YouTube player): what is left of it right behind the listener (`facingGain`). Default 0.5. */
  rearGain?: number;
}

/** The profiles more than one sound shares. */
export const HEARING = {
  /** A one-shot of the flat with no listener of its own (a latch, the alarm): full at 1.5 m, gone at 14. */
  room: { shape: 'inverseSquare', referenceDistance: 1.5, maxDistance: 14, boost: 2, wallGain: 0.35 },
  /** A room's own little sound (`PointSound`): heard across its room and faintly next door. */
  household: { referenceDistance: 0.8, rolloff: 1.2, maxDistance: 7 },
  /** A visitor's sound in the flat (a step, a word): across the flat, through a wall. */
  visitor: { referenceDistance: 1.5, maxDistance: 20, wallGain: 0.5 },
  /** A bell rung on the landing: heard through the whole building. */
  bell: { referenceDistance: 2, maxDistance: 40, wallGain: 0.6 },
  /** A knock on a door of the building. */
  knock: { referenceDistance: 2, maxDistance: 30, wallGain: 0.6 },
  /** The stairwell's hardware (a relay, a neighbour's door): a few floors. */
  landing: { referenceDistance: 1.5, rolloff: 1, maxDistance: 14 },
} as const satisfies Record<string, HearingProfile>;

/** The level (0..1) of a sound `distance` metres away through `walls` walls, by `profile`. */
export function loudness(distance: number, profile: HearingProfile = {}, walls = 0): number {
  const ref = profile.referenceDistance ?? 1;
  const max = profile.maxDistance ?? 12;
  const shape = profile.shape ?? 'inverse';
  if (distance >= max) return 0;
  let gain: number;
  if (shape === 'inverse') {
    const d = Math.max(distance, ref);
    gain = ref / (ref + (profile.rolloff ?? 1.5) * (d - ref));
  } else if (shape === 'inverseSquare') {
    gain = 1 / (1 + (distance / ref) ** 2);
  } else {
    const line = Math.min(1, Math.max(0, 1 - (distance - ref) / (max - ref)));
    gain = shape === 'ramp' ? line : line * line;
  }
  gain *= profile.boost ?? 1;
  const fade = profile.fade ?? (shape === 'inverse' ? 1 : 0);
  if (fade > 0 && distance > max - fade) gain *= (max - distance) / fade;
  gain *= Math.pow(profile.wallGain ?? 0.3, walls);
  return Math.min(1, Math.max(0, gain));
}

/**
 * The share of the level kept by which way the listener faces: `facing` is the cosine between their forward and the
 * way to the source (1 facing it, -1 with it right behind), `rearGain` what is left right behind. The one spatial cue
 * a sound that cannot be panned has (a YouTube player's).
 */
export function facingGain(facing: number, rearGain = 0.5): number {
  const front = (Math.min(1, Math.max(-1, facing)) + 1) / 2;
  return rearGain + (1 - rearGain) * front;
}

/** Who hears the flat's one-shots with no listener of their own: the camera, and the walls' count (the one occlusion). */
let ears: { listener: THREE.Object3D; wallsBetween?: (listener: THREE.Vector3, source: THREE.Vector3) => number } | null = null;
const heardEar = new THREE.Vector3();

/** Sets the ears `hear` places sounds for (the bootstrap, once). */
export function setEars(listener: THREE.Object3D, wallsBetween?: (listener: THREE.Vector3, source: THREE.Vector3) => number): void {
  ears = { listener, wallsBetween };
}

/** Where the ears are (world; a shared vector, copy it to keep), or null before they are set. */
export function earsAt(): THREE.Vector3 | null {
  return ears ? ears.listener.getWorldPosition(heardEar) : null;
}

/**
 * How a one-shot at `at` (world) is heard by the ears: its level (distance and walls, by `profile`) and where it
 * comes from. Before any ears are set, heard as it always was: full, straight ahead.
 */
export function hear(at: THREE.Vector3, profile: HearingProfile = HEARING.room): { gain: number; spatial: Spatial | undefined } {
  if (!ears) return { gain: 1, spatial: undefined };
  ears.listener.getWorldPosition(heardEar);
  const distance = heardEar.distanceTo(at);
  if (distance >= (profile.maxDistance ?? 12)) return { gain: 0, spatial: undefined };
  const walls = ears.wallsBetween?.(heardEar, at) ?? 0;
  return { gain: loudness(distance, profile, walls), spatial: spatialOf(ears.listener, at, walls) };
}
