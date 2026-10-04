import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { gameDayRandom } from '@/time/daily';
import { rememberLook } from '@/social/lookBook';
import type { SocialServices } from '@/social/talk';
import type { OccupancyAware } from '../Furniture';
import { randomLook, type PersonLook } from '../people/looks';
import { metName, bodyOf, talkHook } from '../people/socialHook';
import { Prop } from '../props/Prop';
import { StairWalker, type StairWalkerOptions } from './StairWalker';
import { liftGate } from './stairRoutes';
import { STAIRWELL_PLAN as plan } from './stairwellPlan';
import { landingY } from '@/world/measures/building';

/** His person in the social layer (`social/people/building`). */
const PERSON = 'student';
const who = plan.student;
/** What he says when asked how the night went, in turn. */
const LINES = [
  'Lab until eleven, then the bar, then the lab again. Don’t ask.',
  'The lift up to the attic is slower than my code. And my code is slow.',
  'I recapped a Mega Drive tonight. It smelled like 1991.',
  'Leclerc banged on the pipes again. I had the music at, like, two.',
];

/** His look: a hoodie, headphones round the neck (the hat's place stays free), messy hair. */
function studentLook(): PersonLook {
  return { ...randomLook(who.seed, 'shopper'), top: 'hoodie', hairStyle: 'curly', hat: undefined, bag: 'backpack' };
}

interface AtticStudentOptions extends Omit<StairWalkerOptions, 'look' | 'seed' | 'label' | 'speaker' | 'lines' | 'social'> {
  hours: () => number;
  day: () => number;
  people?: SocialServices;
}

/**
 * Théo, the student in the attic room (docs/social.md, `STAIRWELL_PLAN.student`): some nights, while the player is on
 * the stairs late, he stands on our landing by the lift's gate waiting for the car up to the attic, and can be talked
 * to. The rest of the time he is only the music heard through the ceiling (`building/throughWalls`). An empty prop;
 * `walker` is placed by the builder.
 */
export class AtticStudent extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;
  readonly walker: StairWalker;
  private occupied = false;
  private clock = 0;

  constructor(private readonly options: AtticStudentOptions) {
    super();
    this.name = 'AtticStudent';
    const look = studentLook();
    rememberLook(PERSON, look);
    let next = 0;
    const social = talkHook(options.people, PERSON, () => ({
      person: PERSON,
      place: 'stairs',
      body: bodyOf(this.walker),
      extras: [{ id: 'night', group: 'talk', label: 'Late one?', run: () => ({ line: LINES[next++ % LINES.length]! }) }],
    }));
    this.walker = new StairWalker({ ...options, seed: who.seed, look, speaker: metName('student', 'Théo'), label: 'The student from the attic · chat', lines: LINES, social });
    // Standing at his spot until the first frame, so the start-up compile sees his materials.
    this.walker.setPresent(true, this.spot());
    this.walker.position.y = landingY(0);
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
    this.walker.appear(this.spot(), landingY(0));
    this.walker.stand(who.yaw, 'pockets');
  }

  /** Whether tonight is one of his and the hour his. */
  private tonight(): boolean {
    const h = this.options.hours();
    const [from, to] = who.hours;
    const late = h >= from || h < to - 24;
    // The small hours belong to the evening before.
    const day = this.options.day() - (h < to - 24 ? 1 : 0);
    return late && gameDayRandom('student.night', day)() < who.share;
  }

  private spot(): THREE.Vector3 {
    return liftGate().add(new THREE.Vector3(who.fromGate, 0, 0));
  }
}
