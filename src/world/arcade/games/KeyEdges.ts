import type { ArcadeControls } from './ArcadeGame';

/** The keys of `ArcadeControls` that are held down or not. */
export type ArcadeKey = 'left' | 'right' | 'up' | 'down' | 'fire';

/**
 * Edge detection over the frames that read it: `pressed(controls, key)` is true on the first frame
 * `key` is down since it was last up. Each key is tracked on its own, only when asked about, so a
 * game that reads a key only while its rules run sees a press from where it last looked.
 */
export class KeyEdges {
  private held: Partial<Record<ArcadeKey, boolean>>;

  /** `initial`: keys taken as already down (the fire press that opened an initials screen must not sign it). */
  constructor(private readonly initial: Partial<Record<ArcadeKey, boolean>> = {}) {
    this.held = { ...initial };
  }

  pressed(controls: ArcadeControls, key: ArcadeKey): boolean {
    const down = controls[key];
    const edge = down && !this.held[key];
    this.held[key] = down;
    return edge;
  }

  /** Whether `key` was down the last time it was asked about (an autopilot lets go before pressing again). */
  isHeld(key: ArcadeKey): boolean {
    return this.held[key] ?? false;
  }

  reset(): void {
    this.held = { ...this.initial };
  }
}
