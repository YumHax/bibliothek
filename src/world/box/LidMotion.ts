/** Eased open/close progress of a hinged lid. Pure state; something ticked must call `tick`. */
export class LidMotion {
  private progress = 0;
  private target: 0 | 1 = 0;

  constructor(
    /** Fully open angle, radians. */
    readonly maxAngle: number,
    /** Seconds for a full open or close. */
    readonly duration: number,
  ) {}

  get isOpen(): boolean {
    return this.target === 1;
  }

  get isMoving(): boolean {
    return this.progress !== this.target;
  }

  /** 0 closed .. 1 open, eased. */
  get openness(): number {
    return easeInOutCubic(this.progress);
  }

  get angle(): number {
    return this.openness * this.maxAngle;
  }

  open(): void {
    this.target = 1;
  }

  close(): void {
    this.target = 0;
  }

  toggle(): void {
    this.target = this.target === 1 ? 0 : 1;
  }

  /** Jumps to closed without animating. */
  reset(): void {
    this.progress = 0;
    this.target = 0;
  }

  /** Advances the motion; returns true when the angle changed. */
  tick(dt: number): boolean {
    if (!this.isMoving) return false;
    const step = dt / this.duration;
    this.progress = this.target > this.progress ? Math.min(this.target, this.progress + step) : Math.max(this.target, this.progress - step);
    return true;
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
