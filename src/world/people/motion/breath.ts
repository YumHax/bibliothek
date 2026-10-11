import { smooth } from '@/math/scalar';
import { random } from '@/random';

/*
 * Breathing as people do it, not as a sine: a quick breath in, a longer breath out, a pause before
 * the next; no two breaths the same length or depth; quicker and fuller on the move, shallow and
 * hurried while talking; and now and then, standing or sitting about, a sigh (a deep slow breath,
 * the shoulders rising with it and dropping after).
 */

/** Shares of a breath: in, then out (the rest is the pause before the next). */
const IN = 0.38;
const OUT = 0.47;
/** Seconds between two sighs at rest (bounds). */
const SIGH_EVERY: readonly [number, number] = [28, 85];
/** A sigh: this much deeper, this much longer. */
const SIGH_DEPTH = 2.2;
const SIGH_LENGTH = 1.9;

export class Breath {
  /** How full the chest is now: 0 empty .. about 1 a breath, more in a sigh. */
  fill = 0;
  /** 0..1 as a sigh's breath goes out (the head and shoulders let down), 0 otherwise. */
  sighing = 0;
  private phase = random();
  private period: number;
  private depth = 1;
  private sigh = false;
  private sighIn = SIGH_EVERY[0] + random() * (SIGH_EVERY[1] - SIGH_EVERY[0]);

  /** `rest` seconds per breath at rest for this person (about 3.4 .. 4.6). */
  constructor(private readonly rest: number) {
    this.period = rest;
  }

  /**
   * A frame: `exertion` 0 still .. 1 walking, `talk` 0..1 talking (breaths short and shallow, no
   * sigh), `idle` true when a sigh may come (standing or sitting, nothing in hand).
   */
  update(dt: number, exertion: number, talk: number, idle: boolean): number {
    this.sighIn -= dt;
    this.phase += dt / this.period;
    if (this.phase >= 1) {
      this.phase -= 1;
      // The next breath: its own length and depth.
      this.sigh = idle && talk === 0 && this.sighIn <= 0;
      if (this.sigh) this.sighIn = SIGH_EVERY[0] + random() * (SIGH_EVERY[1] - SIGH_EVERY[0]);
      const pace = (1 - 0.32 * exertion) * (1 - 0.25 * talk);
      this.period = this.rest * pace * (0.85 + random() * 0.3) * (this.sigh ? SIGH_LENGTH : 1);
      this.depth = (0.8 + random() * 0.4) * (1 + 0.35 * exertion) * (1 - 0.4 * talk) * (this.sigh ? SIGH_DEPTH : 1);
    }
    const p = this.phase;
    const shape = p < IN ? smooth(p / IN) : p < IN + OUT ? 1 - smooth((p - IN) / OUT) : 0;
    this.fill = shape * this.depth;
    // A sigh's let-down: growing as the breath goes out, gone again over the pause.
    this.sighing = !this.sigh || p < IN ? 0 : p < IN + OUT ? smooth((p - IN) / OUT) : 1 - smooth((p - IN - OUT) / (1 - IN - OUT));
    return this.fill;
  }
}
