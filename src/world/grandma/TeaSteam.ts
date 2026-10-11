import type { Updatable } from '@/core/Engine';
import { Prop } from '../props/Prop';
import { Steam } from '../kitchen/Steam';

/** The tray's two cups, in the tray's frame (`TeaTray`): over the tea's surface. */
const CUPS = [
  [0.07, 0.07, -0.06],
  [0.12, 0.07, 0.06],
] as const;
/** Seconds the tea steams after it is poured, and how long it takes to cool off. */
const HOT_SECONDS = 70;
const COOL_SECONDS = 20;

/**
 * The tea just poured on Mémé's tray (`TeaTray`, docs/grandma.md "Her presence"): a thin plume over each cup,
 * strong at first and thinning as it cools. `pour()` starts it. Origin on the tray's origin, riding it.
 */
export class TeaSteam extends Prop implements Updatable {
  private readonly plumes = CUPS.map(([x, y, z]) => {
    const plume = new Steam({ count: 14, life: 2.2, rise: 0.12, startSize: 0.015, endSize: 0.07, opacity: 0.22 });
    plume.position.set(x, y, z);
    this.add(plume);
    return plume;
  });
  /** Seconds since it was poured, or -1: cold. */
  private age = -1;

  constructor() {
    super();
    this.name = 'TeaSteam';
  }

  /** The tea poured: hot again. */
  pour(): void {
    this.age = 0;
  }

  update(dt: number): void {
    if (this.age >= 0) {
      this.age += dt;
      if (this.age > HOT_SECONDS + COOL_SECONDS) this.age = -1;
    }
    const rate = this.age < 0 ? 0 : this.age < HOT_SECONDS ? 1 : 1 - (this.age - HOT_SECONDS) / COOL_SECONDS;
    for (const plume of this.plumes) {
      plume.rate = rate;
      plume.update(dt);
    }
  }
}
