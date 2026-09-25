import * as THREE from 'three';
import { Walker, type WalkerOptions } from '../people/Walker';

/** How long a fade in or out takes (s): a door opening, the lift's gate. */
const FADE_S = 0.6;

export interface StairWalkerOptions extends Omit<WalkerOptions, 'fade'> {
  /** The floor's height under (x, z) for feet at `feet` (zone-local), null off the stairs: the staircase's `floorAt`. */
  ground: (x: number, z: number, feet: number) => number | null;
}

/**
 * A `Walker` on the stairs: its feet follow the stone under them (the flights, the landings) instead
 * of staying at y 0, and it comes and goes through doors and the lift's gate with a short fade
 * (`appear`, `vanish`). Zone-local like any walker; never collides.
 */
export class StairWalker extends Walker {
  private readonly ground: StairWalkerOptions['ground'];
  private amount = 1;
  private target = 1;
  private gone: (() => void) | null = null;

  constructor(options: StairWalkerOptions) {
    super({ ...options, fade: true });
    this.ground = options.ground;
  }

  /** Steps out at `at` (a door, the gate), feet at `y`, fading in. */
  appear(at: THREE.Vector3, y: number): void {
    this.setPresent(true, at);
    this.position.y = y;
    this.amount = 0;
    this.target = 1;
    this.gone = null;
    this.setFade(0);
  }

  /** Fades out where they stand (through a door), then leaves the stairs; `then` once gone. */
  vanish(then?: () => void): void {
    this.target = 0;
    this.gone = then ?? null;
  }

  /** Off the stairs at once (the player left: nobody watches the rest of the way). */
  away(): void {
    this.target = 0;
    this.amount = 0;
    this.gone = null;
    this.setPresent(false);
  }

  override update(dt: number): void {
    if (!this.isPresent) return;
    const feet = this.position.y;
    super.update(dt);
    const floor = this.ground(this.position.x, this.position.z, feet);
    this.position.y = floor ?? feet;
    if (this.amount === this.target) return;
    const step = dt / FADE_S;
    this.amount = this.target > this.amount ? Math.min(this.target, this.amount + step) : Math.max(this.target, this.amount - step);
    this.setFade(this.amount);
    if (this.amount === 0 && this.target === 0) {
      const then = this.gone;
      this.gone = null;
      this.setPresent(false);
      then?.();
    }
  }
}
