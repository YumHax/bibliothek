import { setStep, step } from '@/social/building/perkState';
import { BUILDING_PERKS } from '@/social/building/buildingPerksPlan';
import { ROSSI_COACHING } from '@/social/building/smallPerks';
import { arcadeDate } from '@/social/friendsLife';
import { has } from '@/social/perks';
import { inHours } from '@/time/clock';
import { weekdayOf } from '@/time/wakefulness';
import { ARCADE_PLAN } from './arcadePlan';

/*
 * When the people the player knows are at the arcade, and how well they play by now (docs/social.md "Front Street and
 * the arcade"): Nico's SKY STACK, a little better every game week; Marco on the day fixed with him (`arcadePartner`,
 * `friendsLife.arcadeDate`), in his afternoon hours; Hugo on Wednesday mornings, a little better every week and every
 * tip the player gives him; and Sofia Rossi's lesson, paid on the next COMET DASH game.
 */

const { kid, guests } = ARCADE_PLAN.crowd;
/** Hugo's tips from the player (`perkState` step), and the most that count. */
const HUGO_TIPS = 'hugo-arcade-tips';
const HUGO_MAX_TIPS = 5;

/** A skill that grows by the game week from `start` to `max`. */
function weekly(day: number, skill: { start: number; perWeek: number; max: number }, extra = 0): number {
  return Math.min(skill.max, skill.start + skill.perWeek * Math.max(0, Math.floor(day / 7)) + extra);
}

/** How well Nico plays his game on game day `day`. */
export function nicoSkill(day: number): number {
  return weekly(day, kid.game.skill);
}

/** Whether Marco is at the arcade: the day fixed with him, his hours, and still a friend. */
export function marcoHere(day: number, hour: number): boolean {
  return has('marco', 'arcadePartner') && arcadeDate() === day && inHours(hour, guests.marco.hours);
}

/** Whether Hugo is at the arcade: Wednesday morning. */
export function hugoHere(day: number, hour: number): boolean {
  return weekdayOf(day) === guests.hugo.weekday && inHours(hour, guests.hugo.hours);
}

/** How well Hugo plays NEON SNAKE on game day `day`: the weeks, and the player's tips. */
export function hugoSkill(day: number): number {
  const { skill } = guests.hugo;
  return weekly(day, skill, skill.perTip * hugoTips());
}

/** The tips the player gave Hugo that count. */
function hugoTips(): number {
  return Math.min(HUGO_MAX_TIPS, step(HUGO_TIPS));
}

/** The player gave Hugo a tip: he plays a little better from now on (up to a point). */
export function tipHugo(): void {
  if (step(HUGO_TIPS) < HUGO_MAX_TIPS) setStep(HUGO_TIPS, step(HUGO_TIPS) + 1);
}

/** A COMET DASH game ended: the tickets Sofia's lesson adds to it, once (0: no lesson waiting). */
export function coachedPlay(): number {
  if (step(ROSSI_COACHING) !== 1) return 0;
  setStep(ROSSI_COACHING, 0);
  return BUILDING_PERKS.rossiCoaching;
}
