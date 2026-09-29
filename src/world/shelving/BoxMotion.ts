import type { Updatable } from '@/core/Engine';
import type { GameBox } from '../GameBox';
import { Prop } from '../props/Prop';

/**
 * What ticks the boxes of a shelving while they move on their own: the hover pop, a slide to a new
 * spot after a sort (`GameBox.settle`). Boxes are not placed furniture, so nothing else would; one
 * per `Shelving`, placed at its zone's origin, idle (an empty set) while every box rests.
 */
export class BoxMotion extends Prop implements Updatable {
  readonly contactShadow = false;
  private readonly moving = new Set<GameBox>();

  constructor() {
    super();
    this.name = 'BoxMotion';
  }

  /** Ticks `box` until it rests. */
  track(box: GameBox): void {
    this.moving.add(box);
  }

  untrack(box: GameBox): void {
    this.moving.delete(box);
  }

  update(dt: number): void {
    for (const box of this.moving) if (!box.settle(dt)) this.moving.delete(box);
  }
}
