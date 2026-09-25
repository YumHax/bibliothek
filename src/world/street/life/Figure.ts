import * as THREE from 'three';
import type { Walker } from '../../people/Walker';
import { distanceFade } from './fade';

/** Seconds to fade in when someone turns up, and out when they go. */
const PRESENCE_FADE = 1;

/**
 * Someone the street keeps about (on the phone, at the bus stop, at a café table) who comes and
 * goes: `show()` fades them in where they are put, `hide()` fades them out and then takes them
 * away; `update()` also fades them with the player's distance, so nobody pops. Wraps a `Walker`
 * made with `fade: true`, placed in the zone by its owner.
 */
export class Figure {
  private presence = 0;
  private wanted = false;
  private readonly spot = new THREE.Vector3();

  constructor(readonly walker: Walker) {
    walker.setPresent(false);
    walker.setFade(0);
  }

  /** Out on the pavement (fading in, or already), or on the way out. */
  get shown(): boolean {
    return this.wanted;
  }

  /** Fully gone (faded out and taken away). */
  get gone(): boolean {
    return !this.wanted && this.presence === 0;
  }

  show(at?: THREE.Vector3, instantly = false): void {
    if (!this.wanted || at) this.walker.setPresent(true, at);
    this.wanted = true;
    if (instantly) this.presence = 1;
  }

  hide(instantly = false): void {
    this.wanted = false;
    if (instantly) this.presence = 0;
  }

  update(dt: number, eye: THREE.Vector3, drawDistance: number, fade: number): void {
    const target = this.wanted ? 1 : 0;
    this.presence += Math.sign(target - this.presence) * Math.min(Math.abs(target - this.presence), dt / PRESENCE_FADE);
    if (!this.wanted && this.presence === 0) {
      if (this.walker.isPresent) this.walker.setPresent(false);
      return;
    }
    this.walker.getWorldPosition(this.spot);
    this.walker.setFade(this.presence * distanceFade(this.spot.distanceTo(eye), drawDistance, fade));
  }
}
