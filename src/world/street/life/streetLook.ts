import type { Walker } from '../../people/Walker';
import type { Held } from '../../people/held';
import { randomLook, type Age, type PersonLook } from '../../people/looks';
import type { SkyState } from '../../props/DayNight';
import { currentSeason } from '@/time/season';
import { castDress } from '../../people/castLook';
import type { PersonId } from '@/social/types';

/*
 * How the street's people dress for the day: the look a `Walker` of a seed has always had (seed + 200), in the
 * season's clothes (coats in winter, tees in summer), and their rain gear while they stand about (an umbrella up, or
 * a hood, whatever is in their hand). Every walker the street makes outside the crowd's cast goes through here, so
 * nobody stands at the bus stop in shorts in the snow.
 */

/** Rain this hard puts the umbrellas up; snow (or rain) this hard, the hoods. */
const UMBRELLA_ABOVE = 0.12;
const HOOD_SNOW = 0.15;
const HOOD_RAIN = 0.5;

/** The look of a walker of `seed`, dressed for the season (and `age`, if not a grown-up); `person`: someone known, drawn as who they are. */
export function streetLook(seed: number, age?: Age, role: 'vendor' | 'shopper' = 'shopper', person?: PersonId): PersonLook {
  return randomLook(seed + 200, role, castDress(person, { season: currentSeason().name, age }));
}

/**
 * Dressed for the weather while standing about: the umbrella up in the rain (unless the hand holds something they
 * would not put down, `keep`), the hood up in snow or a downpour; `held` back in the hand once it is dry. Returns
 * whether the umbrella is up.
 */
export function rainGear(walker: Walker, sky: SkyState, held: Held | null, keep = false): boolean {
  const umbrella = !keep && sky.rain > UMBRELLA_ABOVE;
  walker.hold(umbrella ? 'umbrella' : held);
  walker.setHood(!umbrella && (sky.snow > HOOD_SNOW || sky.rain > HOOD_RAIN));
  return umbrella;
}

/** Whether it rains hard enough for umbrellas (a change of it is when the standing dress again). */
export function umbrellaWeather(sky: SkyState): boolean {
  return sky.rain > UMBRELLA_ABOVE;
}
