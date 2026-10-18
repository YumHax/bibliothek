import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import { Walker } from '../../people/Walker';
import { randomLook } from '../../people/looks';
import { currentSeason } from '@/time/season';

interface StepAnswererOptions {
  viewer: THREE.Object3D;
  seed: number;
  /** Who comes to the door, on the caption ("Number 31"). */
  label: string;
  /** The step (zone-local, on the pavement just out of the door) and the way out of the door (yaw). */
  step: THREE.Vector3;
  yaw: number;
}

/** How long they stand on the step after their word (s). */
const ON_STEP = 6;

/**
 * Somebody who comes down to their street door when rung or knocked (`MansionBell`'s favours, Halloween's doors,
 * `events/HalloweenDoors`): out on the step a few seconds, says their word over the threshold with a wave, and goes
 * back in. A `Walker` placed by the street's builder (`placeWalker`); away between answers.
 */
export class StepAnswerer extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly walker: Walker;
  private left = 0;

  constructor(private readonly options: StepAnswererOptions) {
    super();
    this.name = 'StepAnswerer';
    this.walker = new Walker({ viewer: options.viewer, seed: options.seed, look: randomLook(options.seed, 'shopper', { season: currentSeason().name }), label: options.label, labelWithin: 4, lines: ['Go on, off you go. Mind the step.'] });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** At the door with `line` and a wave, for a few seconds. */
  answer(line: string): void {
    this.walker.setPresent(true, this.options.step.clone());
    this.walker.stand(this.options.yaw, 'stand', 'viewer');
    this.walker.speak(line);
    this.walker.gesture('wave');
    this.left = ON_STEP;
  }

  update(dt: number): void {
    if (this.left <= 0) return;
    if ((this.left -= dt) <= 0) this.walker.setPresent(false);
  }
}
