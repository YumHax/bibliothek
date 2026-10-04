import { reduceMotion } from '@/settings/motion';

/** How a count rolls to its new value: fast at first, settling (ease-out cubic). */
export function countUpEase(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * A number rolling from one value to another over `seconds`, ticked by whoever draws it
 * (`update(dt)`), eased with `countUpEase`; under reduced motion it lands at once. The wallet
 * chip's balances and the machines' end cards count up through it.
 */
export class Roll {
  private from = 0;
  private to = 0;
  private t = 1;

  constructor(private readonly seconds: number) {}

  start(from: number, to: number): void {
    this.from = from;
    this.to = to;
    this.t = reduceMotion() ? 1 : 0;
  }

  update(dt: number): void {
    if (this.t < 1) this.t = Math.min(1, this.t + dt / this.seconds);
  }

  /** How far along, 0..1, eased. */
  get progress(): number {
    return countUpEase(this.t);
  }

  get value(): number {
    return Math.round(this.from + (this.to - this.from) * this.progress);
  }

  get done(): boolean {
    return this.t >= 1;
  }

  skipToEnd(): void {
    this.t = 1;
  }
}

/**
 * For a panel outside the engine loop: rolls `draw` from `from` to `to` over `ms` on animation
 * frames (at once under reduced motion); returns what cancels it.
 */
export function rollNumber(from: number, to: number, ms: number, draw: (value: number) => void): () => void {
  if (reduceMotion() || from === to) {
    draw(to);
    return () => {};
  }
  const start = performance.now();
  let frame = 0;
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / ms);
    draw(Math.round(from + (to - from) * countUpEase(t)));
    if (t < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}
