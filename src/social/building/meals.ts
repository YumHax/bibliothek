import type { Pastime } from '@/household/pastime';
import { weekdayOf, type Weekday } from '@/time/wakefulness';
import { addExtras } from '../extras';
import { has } from '../perks';
import { shortName } from '../people';
import { nudge } from '../standing';
import type { TalkExtra } from '../talk';
import { BUILDING_PERKS } from './buildingPerksPlan';
import type { PerkDeps } from './perkDeps';
import { doneOn, markDay } from './perkState';
import { capitalise } from '@/text/strings';

/*
 * Meals at the neighbours' (docs/social.md "The building's perks"): the Moreaus' Sunday lunch and the Nguyens'
 * Friday dinner, offered to a close friend in the hours around the meal. Accepted, it is a beat in the dark like the
 * household's (`household/pastime`): the clock wound on, a card of how it went, warmth and trust with the hosts.
 */

/** Runs a beat in the dark (`household/Pastimes.run`). */
interface MealBeats {
  run<T>(pastime: Pastime, change: () => T): Promise<T | null>;
}

const MEALS = BUILDING_PERKS.meals;
/** Which meal, the effect that offers it and its weekday (Monday 0 .. Sunday 6). */
const TABLE: readonly { meal: (typeof MEALS)['sundayLunch']; effect: string; weekday: Weekday; title: string }[] = [
  { meal: MEALS.sundayLunch, effect: 'sundayLunch', weekday: 6, title: 'Sunday lunch at the Moreaus’' },
  { meal: MEALS.familyDinner, effect: 'familyDinner', weekday: 4, title: 'Friday dinner at the Nguyens’' },
];

export function wireMeals(deps: PerkDeps, beats: MealBeats): void {
  addExtras(({ person, day, hour }) => {
    const extras: TalkExtra[] = [];
    for (const { meal, effect, weekday, title } of TABLE) {
      if (person !== meal.who || !has(meal.who, effect)) continue;
      const [from, to] = meal.hours;
      if (weekdayOf(day) !== weekday || hour < from - 1 || hour >= to) continue;
      extras.push({
        id: `meal-${effect}`,
        group: 'invite',
        label: meal.label,
        disabled: () => (doneOn(`meal-${effect}`, day) ? 'Already had it today' : null),
        opensPanel: true,
        run: () => {
          markDay(`meal-${effect}`, day);
          void beats.run({ minutes: meal.minutes, ...MEALS.fade }, () => {
            nudge(meal.who, { warmth: meal.warmth, trust: meal.trust, day, why: 'loved having you round', memory: title.toLowerCase(), memoryWeight: 10 });
            deps.notices.read({ title, text: meal.line, effect: `${capitalise(shortName(meal.who))} will remember it.`, look: 'letter' });
          });
        },
      });
    }
    return extras;
  });
}

