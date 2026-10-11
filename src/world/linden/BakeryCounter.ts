import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { invisibleHitbox } from '../meshUtils';
import { BREAD, BREAD_WORDS, type BreadErrand } from '@/grandma/breadErrand';
import { errandOf } from '@/errands/errands';
import { buyErrand } from '@/errands/buy';
import { currentSeason } from '@/time/season';
import { weekdayOf } from '@/time/wakefulness';
import { inHours } from '@/time/clock';
import { clockShort } from '@/text/clock';
import { formatCoins } from '@/text/money';
import { pick, random } from '@/random';

/** What this part of the bakery's front sells: its door a baguette (Mémé's bread), its window a croissant. */
type BakeryOffer = 'baguette' | 'croissant';

interface BakeryOptions {
  offer: BakeryOffer;
  /** "Lebrun’s bakery". */
  name: string;
  /** Opening hours (game hours) and the weekday it shuts (`weekdayOf`). */
  hours: readonly [number, number];
  closedWeekday: number;
  bread: BreadErrand | null;
  day: () => number;
  hour: () => number;
}

/**
 * Lebrun's on Linden Avenue, under Mémé's (docs/grandma.md "Around her flat"): its door sells a baguette (the bread
 * she asks for, `BreadErrand`: one carried at a time), its window a croissant (the pocket's, `errands`, a gift for
 * anyone). Painted on her building's facade (`LINDEN_PLAN.facades`): this is the click on it. Origin on the pavement
 * at the facade, +z towards the road; never collides.
 */
export class BakeryCounter extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];

  constructor(private readonly options: BakeryOptions) {
    super();
    this.name = `BakeryCounter:${options.offer}`;
    const hitbox = options.offer === 'baguette' ? invisibleHitbox(1.3, 2.5, 0.25, { y: 1.25, z: 0.08 }) : invisibleHitbox(2, 1.6, 0.25, { y: 1.5, z: 0.08 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {
    // Painted on the facade: the caption says it all.
  }

  private get open(): boolean {
    const { hours, closedWeekday, day, hour } = this.options;
    return weekdayOf(day()) !== closedWeekday && inHours(hour(), hours);
  }

  label(): string {
    const { name, offer, hours, bread } = this.options;
    if (!this.open) return `${name} · closed, opens at ${clockShort(hours[0])}`;
    if (offer === 'croissant') return `${name} · buy a croissant (${formatCoins(errandOf('croissant', currentSeason().name).price)})`;
    if (bread?.carried) return `${name} · a word with Mr Lebrun`;
    return `${name} · buy a baguette (${formatCoins(BREAD.price)})`;
  }

  activate(session: SessionActions): void {
    const { name, offer, hours, bread } = this.options;
    if (!this.open) {
      session.refuse(`${name} is closed. The blind is down, a note says “Back tomorrow at ${clockShort(hours[0])}”.`);
      return;
    }
    if (offer === 'croissant') {
      buyErrand(session, errandOf('croissant', currentSeason().name), '“The croissants are gone, come early tomorrow.”');
      return;
    }
    if (!bread) return;
    if (bread.carried) {
      session.react(BREAD_WORDS.carrying);
      return;
    }
    session.pay({
      price: BREAD.price,
      paid: () => {
        bread.buy();
        return pick(random, BREAD_WORDS.sold);
      },
    });
  }
}
