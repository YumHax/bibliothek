import { gameDayRandom } from '@/time/daily';
import { randomLook, type Age, type Dress, type PersonLook } from '../../people/looks';
import { fnv1a } from '@/random';

/*
 * Who walks Front Street (`StreetCrowd`): the regulars (the same faces every day, `STREET_PLAN.crowd.seeds`), the
 * day's strangers (drawn from the game day: never the same lot two days running), now and then someone walking a
 * child or a friend alongside, a dog or two; all dressed for the season, some of them old. A cast is drawn once per
 * street build; the people are only made when first sent out (`StreetCrowd`), so a big cast costs nothing until used.
 */

export interface CastMember {
  seed: number;
  look: PersonLook;
  age: Age;
  /** Their own walking speed, m/s (the elderly slower, a child keeping up with its grown-up). */
  speed: number;
  /** Walks a dog on a lead. */
  dog: boolean;
  /** Puts an umbrella up in the rain (half of them; the rest pull a hood up or brave it). */
  umbrella: boolean;
  /** Walks with someone (their index in the cast: the companion goes where they go), or alone. */
  companion: number | null;
  /** A companion themselves: never sent out on their own. */
  follows: boolean;
  /** One of the day's strangers (not a regular). */
  stranger: boolean;
  /** One of the building's residents, out at their hours through our own door (never sent out otherwise). */
  resident?: ResidentCast;
}

/** A resident of our building as the street sees them (from `STAIRWELL_PLAN.residents`). */
export interface ResidentCast {
  /** Their door (`building.doorKey`): what the day's comings and goings are kept by. */
  key: string;
  name: string;
  seed: number;
  /** Game hours they go out and come back. */
  out: number;
  back: number;
  /** What they say (their hellos and chat). */
  lines: readonly string[];
}

/** A resident in the crowd: the face and gait the stairs know them by (`stairwell/Neighbours`), undressed for the season. */
export function residentMember(r: ResidentCast): CastMember {
  const look = randomLook(r.seed + 900, 'shopper');
  return { seed: r.seed, look, age: 'adult', speed: 0.75 + (r.seed % 5) * 0.05, dog: false, umbrella: true, companion: null, follows: false, stranger: false, resident: r };
}

interface CastOptions {
  /** The regulars' seeds, the same every day. */
  regulars: readonly number[];
  /** How many strangers today, and how many of the people out walk with someone. */
  strangers: number;
  companions: number;
  /** How many walk a dog (the first regular with a dog is always the same one). */
  dogs: number;
  /** The game day (`Today.gameDay`): the strangers' draw. */
  day: number;
  season: NonNullable<Dress['season']>;
}

/** A regular's walking speed (m/s) is about this, a little more or less by person. */
const PACE = { adult: 1.15, elder: 0.82, spread: 0.3 };
const ELDER_SHARE = 0.18;

export function castCrowd({ regulars, strangers, companions, dogs, day, season }: CastOptions): CastMember[] {
  const cast: CastMember[] = [];
  const member = (seed: number, age: Age, stranger: boolean): CastMember => {
    // The look a `Walker` of this seed has always had (seed + 200), dressed for today.
    const look = randomLook(seed + 200, 'shopper', { season, age });
    const r = (fnv1a(`pace:${seed}`) % 1000) / 1000;
    const speed = age === 'elder' ? PACE.elder + r * 0.15 : PACE.adult + (r - 0.5) * PACE.spread;
    return { seed, look, age, speed, dog: false, umbrella: seed % 2 === 0, companion: null, follows: false, stranger };
  };
  regulars.forEach((seed, i) => cast.push(member(seed, i === 4 ? 'elder' : 'adult', false)));
  const random = gameDayRandom('street-crowd', day);
  for (let i = 0; i < strangers; i++) {
    const seed = 2000 + Math.floor(random() * 1e6);
    cast.push(member(seed, random() < ELDER_SHARE ? 'elder' : 'adult', true));
  }
  // The dogs: the regulars' one (the second regular, as ever), then strangers'.
  let dogsLeft = dogs;
  for (const [i, m] of cast.entries()) {
    if (!dogsLeft) break;
    if (m.age === 'elder' && i !== 1) continue;
    if (i === 1 || m.stranger) {
      m.dog = true;
      dogsLeft--;
    }
  }
  // Companions: a child with a grown-up (by day), or a friend; never with a dog walker (one hand each).
  const leaders = cast.filter((m) => !m.dog && m.age === 'adult');
  for (let i = 0; i < companions && i < leaders.length; i++) {
    const leader = leaders[(i * 3 + 1) % leaders.length]!;
    if (leader.companion !== null) continue;
    const child = random() < 0.55;
    const friend = member(5000 + Math.floor(random() * 1e6), child ? 'child' : random() < 0.2 ? 'elder' : 'adult', true);
    friend.follows = true;
    friend.umbrella = false;
    friend.speed = leader.speed;
    leader.companion = cast.length;
    cast.push(friend);
  }
  return cast;
}
