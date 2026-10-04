import type * as THREE from 'three';
import { BLINK_ANGLE, type Eye } from '../eyes';
import type { FaceMorphs } from '../head';
import type { FaceKey } from './gestures';
import { Spring, smooth } from './springs';

/*
 * The face's life: expressions (a smile, raised brows, a frown, a squint, the mouth open) as springs
 * onto what the person feels right now (`feel`, a feeling held a while and fading) plus what a
 * gesture asks for; speech as the jaw opening on syllables with the lips shaping the vowels (open,
 * "oo", "ee", closed) between words; blinks, quick to close and slower to open, now and then two,
 * and on a wide shift of the gaze; lids that rest relaxed, follow the eyes up and down, narrow in a
 * squint or a real smile (the lower lid rides up) and widen in surprise.
 */

/** A blink: the lids close quickly and open more slowly (s). */
const BLINK_CLOSE = 0.07;
const BLINK_OPEN = 0.15;
/** How fast expressions come and go (rad/s of their springs). */
const EXPRESSION_OMEGA = 9;

type Expression = Required<FaceKey>;

/** Mouth shapes of speech: the jaw's opening and the lips' "oo" and "ee" (a smile's corners). */
const VOWELS: readonly (readonly [jaw: number, pucker: number, ee: number])[] = [
  [1, 0, 0],
  [0.85, 0, 0.15],
  [0.55, 0.85, 0],
  [0.45, 0, 0.45],
  [0.15, 0.2, 0],
];

export class Face {
  private readonly smile = new Spring(0, EXPRESSION_OMEGA);
  private readonly browsUp = new Spring(0, EXPRESSION_OMEGA * 1.2);
  private readonly frown = new Spring(0, EXPRESSION_OMEGA);
  private readonly squint = new Spring(0, EXPRESSION_OMEGA * 1.3);
  private readonly jawOpen = new Spring(0, 16, 0.8);
  private readonly pucker = new Spring(0, 14);
  /** What they feel now (held for `feelingLeft` seconds, then fading over `FADE`). */
  private readonly feeling: Expression = { smile: 0, browsUp: 0, frown: 0, squint: 0, jaw: 0 };
  private feelingLeft = 0;
  private feelingFade = 1;
  private blinkIn = 2 + Math.random() * 4;
  private blinkAge = -1;
  private doubleBlink = false;
  private syllable = 0;
  private vowel = 0;

  constructor(
    private readonly mesh: THREE.Mesh | null,
    private readonly morphs: FaceMorphs,
    private readonly eyes: readonly [Eye, Eye],
    /** How far the upper lids rest below wide open: a relaxed look, never a stare. */
    private readonly lidRest: number,
  ) {}

  /** Shows `expression` (0..1 each) for `seconds`, then lets it fade over `fade` seconds. A stronger feeling replaces a weaker one. */
  feel(expression: FaceKey, seconds: number, fade = 1.2): void {
    this.feeling.smile = expression.smile ?? 0;
    this.feeling.browsUp = expression.browsUp ?? 0;
    this.feeling.frown = expression.frown ?? 0;
    this.feeling.squint = expression.squint ?? 0;
    this.feeling.jaw = expression.jaw ?? 0;
    this.feelingLeft = seconds;
    this.feelingFade = fade;
  }

  /** A blink now (if none is under way): people blink as their eyes jump. */
  blink(): void {
    if (this.blinkAge < 0) this.blinkIn = 0;
  }

  /**
   * A frame: `talk` how much they are talking (0..1), `gesture` the face a gesture asks for,
   * `eyeYaw` / `eyePitch` where the eyes look in their sockets (the lids follow), `t` the person's clock.
   */
  update(dt: number, t: number, talk: number, gesture: Expression, eyeYaw: number, eyePitch: number): void {
    this.feelingLeft -= dt;
    const held = this.feelingLeft > 0 ? 1 : Math.max(0, 1 + this.feelingLeft / this.feelingFade);
    const f = this.feeling;
    // Speech: syllables at a speaking pace, words and pauses between them, a vowel shape per syllable.
    let speechJaw = 0;
    let speechPucker = 0;
    let speechEe = 0;
    if (talk > 0) {
      const before = Math.floor(this.syllable / Math.PI);
      this.syllable += dt * (19 + 7 * Math.sin(t * 0.9));
      if (Math.floor(this.syllable / Math.PI) !== before) this.vowel = Math.floor(Math.random() * VOWELS.length);
      const words = smooth((Math.sin(t * 1.7 + Math.sin(t * 0.6) * 2) + 0.35) / 0.55);
      const [jaw, pucker, ee] = VOWELS[this.vowel]!;
      const open = Math.max(0, Math.sin(this.syllable));
      speechJaw = talk * words * (0.3 + 0.7 * open) * jaw;
      speechPucker = talk * words * pucker;
      speechEe = talk * words * ee * 0.5;
    }
    const smile = this.smile.step(Math.min(1, f.smile * held + gesture.smile + speechEe), dt);
    const browsUp = this.browsUp.step(Math.min(1, f.browsUp * held + gesture.browsUp + talk * 0.15 * Math.max(0, Math.sin(t * 1.3))), dt);
    const frown = this.frown.step(Math.min(1, f.frown * held + gesture.frown), dt);
    const squint = this.squint.step(Math.min(1, f.squint * held + gesture.squint + smile * 0.35), dt);
    const jaw = this.jawOpen.step(Math.min(1, speechJaw + f.jaw * held + gesture.jaw), dt);
    const pucker = this.pucker.step(speechPucker, dt);
    this.set(this.morphs.jaw, jaw);
    this.set(this.morphs.browsUp, browsUp);
    this.set(this.morphs.frown, frown);
    this.set(this.morphs.smile, smile);
    this.set(this.morphs.pucker, pucker);

    // Blink every few seconds (sometimes twice).
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkAge < 0) {
      this.blinkAge = 0;
      this.doubleBlink = !this.doubleBlink && Math.random() < 0.12;
      this.blinkIn = this.doubleBlink ? BLINK_CLOSE + BLINK_OPEN + 0.08 : 1.8 + Math.random() * 4.5;
    }
    let closed = 0;
    if (this.blinkAge >= 0) {
      this.blinkAge += dt;
      const a = this.blinkAge;
      closed = a < BLINK_CLOSE ? smooth(a / BLINK_CLOSE) : 1 - smooth((a - BLINK_CLOSE) / BLINK_OPEN);
      if (a >= BLINK_CLOSE + BLINK_OPEN) this.blinkAge = -1;
    }
    // The upper lid follows the eye down (and a little up), narrows in a squint, lifts in surprise.
    const lid = Math.max(-0.03, this.lidRest + Math.max(0, eyePitch) * 0.55 + Math.min(0, eyePitch) * 0.3 + squint * 0.14 + frown * 0.05 - browsUp * 0.07);
    const lower = -(squint * 0.14 + smile * 0.05);
    for (const eye of this.eyes) {
      eye.ball.rotation.set(eyePitch, eyeYaw, 0, 'YXZ');
      eye.upperLid.rotation.x = lid + closed * (BLINK_ANGLE - lid);
      eye.lowerLid.rotation.x = lower;
    }
  }

  /** Far away: the face at rest (its details are hidden anyway). */
  rest(): void {
    for (const k of [this.morphs.jaw, this.morphs.browsUp, this.morphs.frown, this.morphs.smile, this.morphs.pucker]) this.set(k, 0);
  }

  private set(index: number, value: number): void {
    if (index < 0 || !this.mesh?.morphTargetInfluences) return;
    this.mesh.morphTargetInfluences[index] = value;
  }
}
