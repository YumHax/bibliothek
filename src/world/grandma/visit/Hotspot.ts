import type { UseOptions } from '../../props/UsableProp';
import { UsableProp } from '../../props/UsableProp';

/**
 * Something of hers to click while a favour or her lunch waits for the player (docs/grandma.md "Sunday lunch, recipes
 * and favours"): an invisible box over the set, the clock's hood, the chair at the table's end, with its caption and
 * its click. Placed while it is wanted, taken away after.
 */
export class Hotspot extends UsableProp {
  constructor(size: readonly [number, number, number], use: UseOptions) {
    super(use);
    this.name = 'GrandmaHotspot';
    this.target(size[0], size[1], size[2], { y: size[1] / 2 });
  }
}
