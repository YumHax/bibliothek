import { clamp } from '@/math/scalar';

/** Seconds of frames judged together. */
const WINDOW = 1;
/** A window is slow when its frames take this much longer than the target on average. */
const SLOW = 1.2;
/** ... and the GPU was still busy when this share of them came due (the pixels are what is late, not JavaScript). */
const GPU_BOUND = 0.5;
/** Seconds of windows at the target, the GPU never late, before the resolution goes back up a step. */
const CALM_TO_RAISE = 5;
/** Seconds after a drop before the resolution may rise again; doubled at each drop that follows a rise, so it settles. */
const FIRST_LOCKOUT = 10;
const MAX_LOCKOUT = 120;
/** Each step down keeps this share of the pixel ratio (about 28 % fewer pixels); a step up is its inverse. */
const STEP = 0.85;

/**
 * Lowers the renderer's pixel ratio while the GPU cannot keep up and raises it back once it can, between
 * `min` and `max` (`QUALITY.minPixelRatio`, the device's ratio capped by `QUALITY.maxPixelRatio`). The
 * frame's cost is per pixel, so this is the one knob that helps whatever the scene holds. It only acts
 * on frames the GPU made late (the `Engine`'s fence was still pending when they came due): a slow frame
 * spent in JavaScript would not be helped by fewer pixels. `apply` sets the ratio (and resizes what
 * follows the canvas); it is called at most once a window.
 */
export class AdaptiveResolution {
  private ratio: number;
  private time = 0;
  private frames = 0;
  private late = 0;
  private calm = 0;
  private lockout = 0;
  private lockoutLength = FIRST_LOCKOUT;
  private raisedLast = false;

  constructor(
    private min: number,
    private max: number,
    /** Seconds a frame should take (the fps cap, else 60 Hz); `setTarget` when the cap changes. */
    private target: number,
    private readonly apply: (ratio: number) => void,
  ) {
    this.ratio = max;
  }

  get pixelRatio(): number {
    return this.ratio;
  }

  /**
   * A new range (the window moved to a screen of another density, the page was zoomed): a ratio at
   * the old ceiling follows the new one, a lowered one stays where it is within the new bounds.
   */
  setRange(min: number, max: number): void {
    if (min === this.min && max === this.max) return;
    const atTop = this.ratio >= this.max;
    this.min = min;
    this.max = max;
    this.set(atTop ? max : clamp(this.ratio, min, max));
  }

  /** A rendered frame: `dt` since the last one, `gpuLate` if it had to wait for the GPU to finish the previous one. */
  frame(dt: number, gpuLate: boolean): void {
    if (this.min >= this.max) return;
    this.time += dt;
    this.frames++;
    if (gpuLate) this.late++;
    this.lockout = Math.max(0, this.lockout - dt);
    if (this.time < WINDOW) return;
    const average = this.time / this.frames;
    const lateShare = this.late / this.frames;
    this.time = 0;
    this.frames = 0;
    this.late = 0;

    if (average > this.target * SLOW && lateShare > GPU_BOUND) {
      this.calm = 0;
      if (this.ratio <= this.min) return;
      if (this.raisedLast) this.lockoutLength = Math.min(MAX_LOCKOUT, this.lockoutLength * 2);
      this.raisedLast = false;
      this.lockout = this.lockoutLength;
      this.set(Math.max(this.min, this.ratio * STEP));
      return;
    }
    this.calm = lateShare < 0.1 ? this.calm + WINDOW : 0;
    if (this.calm < CALM_TO_RAISE || this.lockout > 0 || this.ratio >= this.max) return;
    this.calm = 0;
    this.raisedLast = true;
    this.set(Math.min(this.max, this.ratio / STEP));
  }

  /** Settings > Display > Frame rate changed: a frame should now take `seconds`. */
  setTarget(seconds: number): void {
    this.target = seconds;
  }

  private set(ratio: number): void {
    // Steps land on hundredths, and a ratio within 2 % of a bound snaps to it.
    const snapped = Math.abs(ratio - this.max) < 0.02 ? this.max : Math.abs(ratio - this.min) < 0.02 ? this.min : Math.round(ratio * 100) / 100;
    if (snapped === this.ratio) return;
    this.ratio = snapped;
    this.apply(snapped);
  }
}
