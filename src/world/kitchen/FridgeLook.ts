import { UsableProp, type UseOptions } from '../props/UsableProp';

/** How deep the click target stands out of the door: behind the keepsakes' own (3 cm), in front of the door's. */
const DEPTH = 0.014;

/*
 * The fridge door's keepsakes, taken in at a glance (docs/household.md "The fridge door and the corkboard"): a click
 * target over the part of the shut door they cover, its click a close look (`player/closeUp`). The keepsakes keep their
 * own clicks in front of it, the handle's strip is left to open the door.
 */
export class FridgeLook extends UsableProp {
  constructor(use: UseOptions, width: number, height: number) {
    super(use);
    this.name = 'FridgeLook';
    this.target(width, height, DEPTH, { z: DEPTH / 2 - 0.002 });
  }
}
