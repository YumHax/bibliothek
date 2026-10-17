import type * as THREE from 'three';
import { aimEye, BLINK_ANGLE, type Eye } from '../eyes';
import { setMouthOpen, type FaceMorphs, type MouthOpen } from '../head';
import { blankFace, FACE_CHANNELS, type FaceKey } from './gestures';
import { BEAT, STRIDE, visemeTrack } from './visemes';
import { smooth } from '@/math/scalar';
import { Spring } from '@/math/springs';
import { random } from '@/random';

/*
 * The face's life: expressions (a smile, a half smile, raised brows, a frown, a squint, sadness,
 * pressed lips, a wrinkled nose, wide eyes, puffed cheeks, the mouth open) as springs onto what the
 * person feels right now (`feel`, a feeling held a while and fading) plus what a gesture asks for;
 * a smile is never quite even (one side leads, the person's own) and a smiley person keeps a trace
 * of one at rest. Speech: a line's text (`say`) read off as mouth shapes (`visemes`), the lips shut
 * on m, b, p; without words, the jaw opening on syllables with the lips shaping the vowels between
 * words. Blinks, quick to close and slower to open, now and then two, and on a wide shift of the
 * gaze; lids that rest relaxed, follow the eyes up and down, narrow in a squint or a real smile
 * (the lower lid rides up) and widen in surprise.
 */

/** A blink: the lids close quickly and open more slowly (s). */
const BLINK_CLOSE = 0.07;
const BLINK_OPEN = 0.15;
/** How fast expressions come and go (rad/s of their springs). */
const EXPRESSION_OMEGA = 9;
/** The face's own life at rest: a passing look (a half smile, brows up, lips pressed, a squint) now and then (s between, bounds; how strong; how long held). */
const IDLE_EVERY: readonly [number, number] = [4, 11];
const IDLE_AMOUNT: readonly [number, number] = [0.14, 0.3];
const IDLE_HOLD: readonly [number, number] = [0.8, 1.9];
const IDLE_CHANNELS = ['smirk', 'browsUp', 'press', 'squint', 'smile'] as const satisfies readonly (keyof FaceKey)[];
/** The longest a line's words keep the mouth going (s). */
const MAX_LINE = 6;

type Expression = Required<FaceKey>;

/** Mouth shapes of speech without words: the jaw's opening and the lips' "oo" and "ee" (a smile's corners). */
const VOWELS: readonly (readonly [jaw: number, pucker: number, ee: number])[] = [
  [0.55, 0, 0],
  [0.47, 0, 0.15],
  [0.3, 0.85, 0],
  [0.25, 0, 0.45],
  [0.08, 0.2, 0],
];

export class Face {
  private readonly smile = new Spring(0, EXPRESSION_OMEGA);
  private readonly smirk = new Spring(0, EXPRESSION_OMEGA);
  private readonly browsUp = new Spring(0, EXPRESSION_OMEGA * 1.2);
  private readonly frown = new Spring(0, EXPRESSION_OMEGA);
  private readonly squint = new Spring(0, EXPRESSION_OMEGA * 1.3);
  private readonly sad = new Spring(0, EXPRESSION_OMEGA * 0.8);
  private readonly sneer = new Spring(0, EXPRESSION_OMEGA * 1.2);
  private readonly wide = new Spring(0, EXPRESSION_OMEGA * 1.5);
  private readonly puff = new Spring(0, EXPRESSION_OMEGA);
  private readonly jawOpen = new Spring(0, 16, 0.8);
  private readonly pucker = new Spring(0, 14);
  private readonly press = new Spring(0, 18, 0.85);
  /** What they feel now (held for `feelingLeft` seconds, then fading over `FADE`). */
  private readonly feeling: Expression = blankFace();
  private feelingLeft = 0;
  private feelingFade = 1;
  private blinkIn = 2 + random() * 4;
  private blinkAge = -1;
  private doubleBlink = false;
  private syllable = 0;
  private vowel = 0;
  /** The line being said (`say`): its mouth shapes, how far into it (beats), the shape under way and the beat it began on. */
  private track: Float32Array | null = null;
  private trackAt = 0;
  private trackIndex = 0;
  private trackStart = 0;
  /** A smile held at rest (a smiley person's), and which side of the mouth leads (+1: +x) and by how much. */
  private restSmile = 0;
  private side: -1 | 1 = 1;
  private uneven = 0.1;
  /** How far each eye turns in (`setFocus`). */
  private vergence = 0.012;
  /** How big their feelings show (`setExpressiveness`): a reserved face a little under 1, an open one over. */
  private gain = 1;
  private idleIn = IDLE_EVERY[0] + random() * (IDLE_EVERY[1] - IDLE_EVERY[0]);

  constructor(
    private readonly mesh: THREE.Mesh | null,
    private readonly morphs: FaceMorphs,
    private readonly eyes: readonly [Eye, Eye],
    /** How far the upper lids rest below wide open: a relaxed look, never a stare. */
    private readonly lidRest: number,
    /** The mouth's cut through the skin and the jaw's bone (`head.MouthOpen`), kept at the jaw's opening; null without one. */
    private readonly mouth: MouthOpen | null = null,
    /** Where the expressions fold the skin (`skinShader.faceSkin`): brows up, smile, squint, frown; null for none. */
    private readonly wrinkles: THREE.Vector4 | null = null,
  ) {}

  /** Shows `expression` (0..1 each) for `seconds`, then lets it fade over `fade` seconds. A stronger feeling replaces a weaker one. */
  feel(expression: FaceKey, seconds: number, fade = 1.2): void {
    for (const name of FACE_CHANNELS) this.feeling[name] = expression[name] ?? 0;
    this.feelingLeft = seconds;
    this.feelingFade = fade;
  }

  /**
   * The person's own face: a smile held at rest (0..1, a smiley person's 0.15..0.3) and how their
   * smile goes (`lean`, -1..1: its sign the side that leads and that a half smile takes, its size how uneven).
   */
  setCharacter(restSmile: number, lean: number): void {
    this.restSmile = restSmile;
    this.side = lean < 0 ? -1 : 1;
    this.uneven = 0.06 + 0.12 * Math.min(1, Math.abs(lean));
  }

  /** How readily the face shows what they feel, 0 (reserved) .. 1 (open): every expression's size, and how often a passing look crosses it at rest. */
  setExpressiveness(expressive: number): void {
    this.gain = 0.85 + 0.55 * Math.min(1, Math.max(0, expressive));
  }

  /** Says `text`: the mouth shapes its sounds from now on, at a speaking pace. Returns how long that takes (s, capped). */
  say(text: string): number {
    const { data, beats } = visemeTrack(text);
    this.track = beats > 0 ? data : null;
    this.trackAt = this.trackIndex = this.trackStart = 0;
    return Math.min(MAX_LINE, beats * BEAT);
  }

  /** A blink now (if none is under way): people blink as their eyes jump. */
  blink(): void {
    if (this.blinkAge < 0) this.blinkIn = 0;
  }

  /** How far each eye turns in towards the other (radians: the nearer what they look at, the more), and how much wider the pupils open than the light asks. */
  setFocus(vergence: number, widen: number): void {
    this.vergence = vergence;
    for (const eye of this.eyes) eye.shade.widen.value = widen;
  }

  /**
   * A frame: `talk` how much they are talking (0..1), `gesture` the face a gesture asks for,
   * `eyeYaw` / `eyePitch` where the eyes look in their sockets (the lids follow), `t` the person's clock.
   */
  update(dt: number, t: number, talk: number, gesture: Expression, eyeYaw: number, eyePitch: number): void {
    this.feelingLeft -= dt;
    // Nothing felt and nothing said: now and then a passing look, as a face never quite rests (no allocation: the feeling's own slots).
    if (talk <= 0 && this.feelingLeft < -this.feelingFade) {
      this.idleIn -= dt * this.gain;
      if (this.idleIn <= 0) {
        this.idleIn = IDLE_EVERY[0] + random() * (IDLE_EVERY[1] - IDLE_EVERY[0]);
        for (const name of FACE_CHANNELS) this.feeling[name] = 0;
        this.feeling[IDLE_CHANNELS[Math.floor(random() * IDLE_CHANNELS.length)]!] = IDLE_AMOUNT[0] + random() * (IDLE_AMOUNT[1] - IDLE_AMOUNT[0]);
        this.feelingLeft = IDLE_HOLD[0] + random() * (IDLE_HOLD[1] - IDLE_HOLD[0]);
        this.feelingFade = 0.9;
      }
    }
    const held = this.feelingLeft > 0 ? 1 : Math.max(0, 1 + this.feelingLeft / this.feelingFade);
    let speechJaw = 0;
    let speechPucker = 0;
    let speechEe = 0;
    let speechPress = 0;
    if (talk <= 0) this.track = null;
    const track = this.track;
    if (track) {
      // A line's words: shape after shape at the speaking pace (the springs run them together); shut once said.
      this.trackAt += dt / BEAT;
      while (this.trackIndex * STRIDE < track.length && this.trackAt >= this.trackStart + track[this.trackIndex * STRIDE + 4]!) {
        this.trackStart += track[this.trackIndex * STRIDE + 4]!;
        this.trackIndex++;
      }
      const i = this.trackIndex * STRIDE;
      if (i < track.length) {
        speechJaw = talk * track[i]!;
        speechPucker = talk * track[i + 1]!;
        speechEe = talk * track[i + 2]! * 0.6;
        speechPress = talk * track[i + 3]!;
      }
    } else if (talk > 0) {
      // No words: syllables at a speaking pace, words and pauses between them, a vowel shape per syllable.
      const before = Math.floor(this.syllable / Math.PI);
      this.syllable += dt * (19 + 7 * Math.sin(t * 0.9));
      if (Math.floor(this.syllable / Math.PI) !== before) this.vowel = Math.floor(random() * VOWELS.length);
      const words = smooth((Math.sin(t * 1.7 + Math.sin(t * 0.6) * 2) + 0.35) / 0.55);
      const [jaw, pucker, ee] = VOWELS[this.vowel]!;
      const open = Math.max(0, Math.sin(this.syllable));
      speechJaw = talk * words * (0.3 + 0.7 * open) * jaw;
      speechPucker = talk * words * pucker;
      speechEe = talk * words * ee * 0.5;
    }
    const sad = this.sad.step(Math.min(1, this.goal('sad', held, gesture)), dt);
    const sneer = this.sneer.step(Math.min(1, this.goal('sneer', held, gesture)), dt);
    const wide = this.wide.step(Math.min(1, this.goal('wide', held, gesture)), dt);
    const puff = this.puff.step(Math.min(1, this.goal('puff', held, gesture)), dt);
    const press = this.press.step(Math.min(1, this.goal('press', held, gesture) + speechPress), dt);
    const frown = this.frown.step(Math.min(1, this.goal('frown', held, gesture)), dt);
    // A smiley person's resting smile gives way to any darker feeling.
    const rest = this.restSmile * Math.max(0, 1 - frown - sad - sneer - press);
    const smile = this.smile.step(Math.min(1, this.goal('smile', held, gesture) + speechEe + rest), dt);
    const smirk = this.smirk.step(Math.min(1, this.goal('smirk', held, gesture)), dt);
    const browsUp = this.browsUp.step(Math.min(1, this.goal('browsUp', held, gesture) + wide * 0.5 + talk * 0.15 * Math.max(0, Math.sin(t * 1.3))), dt);
    const squint = this.squint.step(Math.min(1, this.goal('squint', held, gesture) + smile * 0.35 + sneer * 0.3), dt);
    const jaw = this.jawOpen.step(Math.min(1, speechJaw + this.goal('jaw', held, gesture) + wide * 0.08), dt);
    const pucker = this.pucker.step(Math.min(1, speechPucker + puff * 0.3), dt);
    // Never an even smile: one side leads (theirs), a half smile is all on it.
    const lead = Math.min(1, smile * (1 + this.uneven) + smirk);
    const other = Math.min(1, smile * (1 - this.uneven) + smirk * 0.1);
    this.set(this.morphs.jaw, jaw);
    this.set(this.morphs.browsUp, browsUp);
    this.set(this.morphs.frown, frown);
    this.set(this.morphs.smileR, this.side > 0 ? lead : other);
    this.set(this.morphs.smileL, this.side > 0 ? other : lead);
    this.set(this.morphs.pucker, pucker);
    this.set(this.morphs.sad, sad);
    this.set(this.morphs.press, press);
    this.set(this.morphs.sneer, sneer);
    this.set(this.morphs.puff, puff);
    this.wrinkles?.set(Math.max(browsUp, sad * 0.7), (lead + other) / 2, squint, Math.min(1, frown + sneer * 0.5));

    // Blink every few seconds (sometimes twice).
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkAge < 0) {
      this.blinkAge = 0;
      this.doubleBlink = !this.doubleBlink && random() < 0.12;
      this.blinkIn = this.doubleBlink ? BLINK_CLOSE + BLINK_OPEN + 0.08 : 1.8 + random() * 4.5;
    }
    let closed = 0;
    if (this.blinkAge >= 0) {
      this.blinkAge += dt;
      const a = this.blinkAge;
      closed = a < BLINK_CLOSE ? smooth(a / BLINK_CLOSE) : 1 - smooth((a - BLINK_CLOSE) / BLINK_OPEN);
      if (a >= BLINK_CLOSE + BLINK_OPEN) this.blinkAge = -1;
    }
    // The upper lid follows the eye down (and a little up), narrows in a squint, lifts in surprise.
    // Wide eyes lift the lid past its usual top, the white showing over the iris.
    const lid = Math.max(-0.03 - 0.05 * wide, this.lidRest + Math.max(0, eyePitch) * 0.55 + Math.min(0, eyePitch) * 0.3 + squint * 0.14 + frown * 0.05 - browsUp * 0.07 - wide * 0.12);
    const lower = -(squint * 0.14 + smile * 0.05) + wide * 0.05;
    // Each eye turns in towards what they look at (`setFocus`): the nearer, the more.
    const upper = lid + closed * (BLINK_ANGLE - lid);
    for (const eye of this.eyes) aimEye(eye, eyeYaw - eye.side * this.vergence, eyePitch, upper, lower);
  }

  /** Far away: the face at rest (its details are hidden anyway). */
  rest(): void {
    this.track = null;
    const influences = this.mesh?.morphTargetInfluences;
    if (influences) influences.fill(0);
    if (this.mouth) setMouthOpen(this.mouth, 0);
    this.wrinkles?.set(0, 0, 0, 0);
  }

  /** What the feeling (as far as it still holds) and the gesture ask of one channel. */
  private goal(name: keyof FaceKey, held: number, gesture: Expression): number {
    return Math.min(1.2, (this.feeling[name] * held + gesture[name]) * this.gain);
  }

  private set(index: number, value: number): void {
    if (index < 0 || !this.mesh?.morphTargetInfluences) return;
    this.mesh.morphTargetInfluences[index] = value;
    if (index === this.morphs.jaw && this.mouth) setMouthOpen(this.mouth, value);
  }
}
