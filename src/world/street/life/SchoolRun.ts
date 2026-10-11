import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { inHours } from '@/time/clock';
import { weekdayOf } from '@/time/wakefulness';
import { gameDayRandom } from '@/time/daily';
import { KIDS, type KidId, type KidPlan } from '@/building/kids/kidsPlan';
import { Walker } from '../../people/Walker';
import { randomLook, type PersonLook } from '../../people/looks';
import type { Vec2 } from '../streetPlan';
import { Figure } from './Figure';
import { rainGear, streetLook } from './streetLook';
import type { TalkRole } from './streetTalk';
import { currentSeason } from '@/time/season';
import { oncePerDay } from '@/time/OncePerDay';

/** One of the school run's walks: who, when (game hours, the day's own minute drawn in it), which way. */
export interface SchoolWalk {
  /** The building's children by id, `nico` (the arcade's kid), teenagers from the school down Park Street (`teen`), and a grown-up walking them (`parent`). */
  who: readonly (KidId | 'nico' | 'teen')[];
  parent?: boolean;
  /** On which days: school days (Monday to Friday), those with school in the afternoon (not Wednesday), Wednesday, Wednesdays and weekends (Lina's). */
  days: 'weekdays' | 'notWednesday' | 'wednesday' | 'free';
  hours: readonly [number, number];
  path: readonly Vec2[];
}

interface SchoolRunOptions {
  walks: readonly SchoolWalk[];
  viewer: THREE.Object3D;
  place: (walker: Walker, at: THREE.Vector3) => void;
  talk: (role: TalkRole) => string;
  /** The game day (`Today.gameDay`). */
  day: () => number;
  drawDistance: number;
  fade: number;
  /** Someone went through a door at `at` (the arcade's opens with a bell). */
  onDoor?: (at: Vec2) => void;
}

/** Nico, the kid who hangs about the arcade after school (`social/people/town` 'kid'): his look's seed and height. */
const NICO = { seed: 223, height: 1.45 };
/** Who walks beside whom, and how far apart (m, sideways). */
const SIDE = 0.45;
/** Out of school with no grown-up, the children race each other home (or to the arcade) on this share of days. */
const RACE = { chance: 0.5, pace: 1.9 };
/** The teenagers' looks are drawn from these seeds (a walk's place and its member's). */
const TEEN_SEED = 1801;
/** What each child says on the way. */
const KID_LINE: Record<KidId | 'nico' | 'teen', string> = {
  teen: 'Teenager · say hi',
  hugo: 'Hugo · say hi',
  mai: 'Mai · say hi',
  tuan: 'Tuan · say hi',
  lina: 'Lina · say hi',
  nico: 'Nico · say hi',
};

interface Party {
  walk: SchoolWalk;
  figures: Figure[];
  /** Its once-a-day marker (`oncePerDay`). */
  id: string;
  out: boolean;
}

/**
 * The school run in the street: on school mornings the building's children (`building/kids` KIDS) out of our door and
 * off down Park Street, the twins with a grown-up; back the same way after school, a little before they go down to the
 * yard; Lina on Wednesdays and weekends with her aunt; Nico from school down Park Street and into the arcade (he is not
 * supposed to be there). Each walk once a game day, at a minute of its window drawn for the day; a walk already under
 * way when the player comes out is not replayed. Dressed for the season, umbrellas in the rain. A click gets a word.
 */
export class SchoolRun extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly parties: Party[] = [];
  private readonly eye = new THREE.Vector3();

  constructor(private readonly dayNight: DayNight, private readonly options: SchoolRunOptions) {
    super();
    this.name = 'SchoolRun';
    const make = (seed: number, look: PersonLook, label: string, role: TalkRole, speed: number): Figure => {
      const walker = new Walker({ viewer: options.viewer, seed, look, speed, talk: () => options.talk(role), label, labelWithin: 4, corners: 0.6, fade: true, stopsToTalk: true });
      walker.traverse((o) => {
        o.castShadow = false;
      });
      options.place(walker, new THREE.Vector3());
      return new Figure(walker);
    };
    options.walks.forEach((walk, w) => {
      const figures = walk.who.map((id, k) => {
        if (id === 'teen') {
          const seed = TEEN_SEED + w * 7 + k;
          return make(seed, streetLook(seed, 'teen'), KID_LINE.teen, 'passer', 1.2);
        }
        return make(id === 'nico' ? NICO.seed : KIDS.find((kid) => kid.id === id)!.look.seed, childLook(id), KID_LINE[id], 'school', 1.05);
      });
      if (walk.parent) figures.push(make(1701 + w * 11, streetLook(1701 + w * 11), 'Parent · say hello', 'parent', 1.05));
      this.parties.push({ walk, figures, id: `schoolRun:${walk.who.join('+')}:${walk.hours[0]}`, out: false });
    });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const day = this.options.day();
    this.options.viewer.getWorldPosition(this.eye);
    for (const party of this.parties) {
      if (!party.out && !oncePerDay.done(party.id, day) && this.due(party.walk, day, s.hours)) this.setOff(party, day);
      for (const f of party.figures) f.update(dt, this.eye, this.options.drawDistance, this.options.fade);
    }
  }

  /** Whether `walk` sets off now: its days, and past its minute of the window (drawn per walk and day) while still in it. */
  private due(walk: SchoolWalk, day: number, hours: number): boolean {
    const weekday = weekdayOf(day);
    const ok = { weekdays: weekday < 5, notWednesday: weekday < 5 && weekday !== 2, wednesday: weekday === 2, free: weekday === 2 || weekday >= 5 }[walk.days];
    if (!ok || !inHours(hours, walk.hours)) return false;
    const random = gameDayRandom(`school:${walk.who.join('+')}:${walk.hours[0]}`, day);
    const at = walk.hours[0] + random() * (walk.hours[1] - walk.hours[0]) * 0.6;
    return hours >= at;
  }

  /** Out of the first point (a door, or far down the street), along the way side by side, gone at its end. */
  private setOff(party: Party, day: number): void {
    oncePerDay.mark(party.id, day);
    party.out = true;
    const path = party.walk.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const [first] = party.walk.path;
    if (first && Math.abs(first[1]) >= 11.9) this.options.onDoor?.(first);
    let left = party.figures.length;
    // After school with nobody to keep them to a walk, the little ones race (some days); a grown-up holds the nearest hand.
    const kids = !party.walk.parent && party.walk.hours[0] >= 12 && !party.walk.who.includes('teen');
    const race = kids && gameDayRandom(`school-race:${party.id}`, day)() < RACE.chance;
    const parent = party.walk.parent ? party.figures[party.figures.length - 1] : undefined;
    const holder = parent ? party.figures[party.figures.length - 2] : undefined;
    parent?.walker.holdHand(holder?.walker ?? null);
    holder?.walker.holdHand(parent?.walker ?? null);
    party.figures.forEach((figure, i) => {
      figure.walker.setPace(race ? RACE.pace : 1);
      const side = (i - (party.figures.length - 1) / 2) * SIDE;
      const own = path.map((p, k) => offset(p, path[k + 1] ?? p, path[k - 1] ?? p, side));
      figure.show(own[0]!.clone());
      rainGear(figure.walker, this.dayNight.state, null);
      figure.walker.walk(own.slice(1), () => {
        figure.hide();
        if (--left === 0) {
          party.out = false;
          const last = party.walk.path[party.walk.path.length - 1];
          if (last && Math.abs(last[1]) >= 11.9) this.options.onDoor?.(last);
        }
      });
    });
  }
}

/** A child's look as the yard knows them (`courtyard/YardKids`): their seed in the season's clothes, at their height. */
function childLook(id: KidId | 'nico'): PersonLook {
  const plan: Pick<KidPlan, 'look'> | undefined = id === 'nico' ? { look: { seed: NICO.seed, height: NICO.height } } : KIDS.find((k) => k.id === id);
  const seed = plan?.look.seed ?? NICO.seed;
  const look = randomLook(seed, 'shopper', { season: currentSeason().name, age: 'child' });
  const height = plan?.look.height ?? 1.4;
  look.height = height;
  look.headScale = 1.22 - (height - 1.05) * 0.3;
  if (plan?.look.long) look.hairStyle = 'ponytail';
  // A school bag on their back; the twins alike.
  look.bag = 'backpack';
  if (id === 'tuan') {
    const twin = childLook('mai');
    look.skin = twin.skin;
    look.hair = twin.hair;
  }
  return look;
}

/** `p` moved `side` metres to the right of the way through it (from `prev` towards `next`). */
function offset(p: THREE.Vector3, next: THREE.Vector3, prev: THREE.Vector3, side: number): THREE.Vector3 {
  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4 || side === 0) return p.clone();
  return new THREE.Vector3(p.x - (dz / len) * side, 0, p.z + (dx / len) * side);
}
