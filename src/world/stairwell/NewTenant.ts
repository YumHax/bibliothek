import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { gameDayRandom } from '@/time/daily';
import { rememberLook } from '@/social/lookBook';
import type { SocialServices } from '@/social/talk';
import { NEW_TENANT, newTenantIn } from '@/building/newTenant';
import type { OccupancyAware } from '../Furniture';
import { randomLook, type PersonLook } from '../people/looks';
import { castDress } from '../people/castLook';
import { metName, bodyOf, talkHook } from '../people/socialHook';
import { Prop } from '../props/Prop';
import { StairWalker, type StairWalkerOptions } from './StairWalker';
import { STAIRWELL_PLAN as plan } from './stairwellPlan';
import { STOREYS, landingY } from '@/world/measures/building';

const PERSON = NEW_TENANT.person;
/** What he says, in turn, sorting his post. */
const LINES = [
  'Bills, bills, a menu, and a letter for Mr Lambert. Still. I keep them for Claire.',
  'I did the night show till three. The 8-bit hour. Did you catch it? Nobody catches it.',
  'There are notes in the skirting boards of my flat. Puzzles. Mr Lambert was a strange man.',
  'The lift took my sofa up with two inches to spare. Two!',
];

/** His look: a denim jacket, a beanie, the night-show hours under his eyes. */
function tenantLook(): PersonLook {
  return { ...randomLook(177, 'shopper', castDress(PERSON)), top: 'jacket', hairStyle: 'short' };
}

interface NewTenantOptions extends Omit<StairWalkerOptions, 'look' | 'seed' | 'label' | 'speaker' | 'lines' | 'social'> {
  hours: () => number;
  day: () => number;
  people?: SocialServices;
}

/**
 * Yann Le Goff, the late Mr Lambert's flat's new tenant (`building/newTenant`): once he has moved in, some evenings he
 * stands at the mailboxes in the entrance hall sorting his post while the player is on the stairs, and can be talked
 * to. An empty prop; `walker` is placed by the builder.
 */
export class NewTenant extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;
  readonly walker: StairWalker;
  private occupied = false;
  private clock = 0;

  constructor(private readonly options: NewTenantOptions) {
    super();
    this.name = 'NewTenant';
    const look = tenantLook();
    rememberLook(PERSON, look);
    let next = 0;
    const social = talkHook(options.people, PERSON, () => ({
      person: PERSON,
      place: 'stairs',
      body: bodyOf(this.walker),
      extras: [{ id: 'post', group: 'talk', label: 'Anything good in the post?', run: () => ({ line: LINES[next++ % LINES.length]! }) }],
    }));
    this.walker = new StairWalker({ ...options, seed: 177, look, speaker: metName(PERSON, 'Yann'), label: 'The new neighbour from the 3rd · chat', lines: LINES, social });
    // Standing at his spot until the first frame, so the start-up compile sees his materials.
    this.walker.setPresent(true, this.spot());
    this.walker.position.y = landingY(STOREYS);
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.clock = 0;
  }

  update(dt: number): void {
    this.clock -= dt;
    if (this.clock > 0) return;
    this.clock = 2;
    const here = this.occupied && this.tonight();
    if (here === this.walker.isPresent) return;
    if (!here) {
      this.walker.away();
      return;
    }
    this.walker.appear(this.spot(), landingY(STOREYS));
    // Facing the flaps on the hall's west wall.
    this.walker.stand(-Math.PI / 2, 'pockets');
  }

  /** Whether he lives here yet, tonight is one of his, and the hour his. */
  private tonight(): boolean {
    const day = this.options.day();
    if (!newTenantIn(day)) return false;
    const h = this.options.hours();
    const [from, to] = NEW_TENANT.hall.hours;
    return h >= from && h < to && gameDayRandom('newTenant.hall', day)() < NEW_TENANT.hall.share;
  }

  /** In front of the mailboxes, a step off them. */
  private spot(): THREE.Vector3 {
    const { mailboxes } = plan;
    return new THREE.Vector3(mailboxes.x + 0.55, landingY(STOREYS), mailboxes.z + 0.3);
  }
}
