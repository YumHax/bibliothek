import { gameDayRandom } from '@/time/daily';
import { findPerson } from './people';
import { BIRTHDAY_CYCLE, MOODS, type MoodId } from './socialPlan';
import type { PersonId } from './types';

/*
 * Mood of the day (docs/social.md "Mood"): drawn per person and game day, then moved by what happened that day
 * (`markMood`: the power cut, a noisy night, a lost bid) and by their birthday. Not saved: a mark lasts the day it
 * was made in this session, and the draw is the same on a reload.
 */

const ORDER: readonly MoodId[] = ['annoyed', 'low', 'fine', 'good'];
/** Marks of the day: id -> { day, steps up (+) or down (-), why }. */
const marks = new Map<PersonId, { day: number; steps: number; why: string }>();

/** Whether `day` is `id`'s birthday (the social year: `BIRTHDAY_CYCLE` game days). */
export function isBirthday(id: PersonId, day: number): boolean {
  const card = findPerson(id);
  return !!card && ((day % BIRTHDAY_CYCLE) + BIRTHDAY_CYCLE) % BIRTHDAY_CYCLE === card.birthday;
}

/** Game days until `id`'s next birthday (0: today). */
export function daysToBirthday(id: PersonId, day: number): number {
  const card = findPerson(id);
  if (!card) return BIRTHDAY_CYCLE;
  const at = ((day % BIRTHDAY_CYCLE) + BIRTHDAY_CYCLE) % BIRTHDAY_CYCLE;
  return (card.birthday - at + BIRTHDAY_CYCLE) % BIRTHDAY_CYCLE;
}

/** `id`'s mood moves `steps` (+1 brighter, -1 darker) for the rest of `day`, and why (the panel says it). */
export function markMood(id: PersonId, day: number, steps: number, why: string): void {
  const old = marks.get(id);
  marks.set(id, { day, steps: (old?.day === day ? old.steps : 0) + steps, why });
}

/** `id`'s mood on `day` at game hour `hour`, and why when something moved it. */
export function moodOf(id: PersonId, day: number, hour: number): { mood: MoodId; why: string | null } {
  const card = findPerson(id);
  const r = gameDayRandom(`mood:${id}`, day)();
  let at = r < 0.1 ? 0 : r < 0.3 ? 1 : r < 0.75 ? 2 : 3;
  let why: string | null = null;
  const traits = card?.traits ?? [];
  if (traits.includes('nightOwl') && hour >= 6 && hour < 11) at -= 1;
  if (traits.includes('earlyBird') && hour >= 21) at -= 1;
  if (traits.includes('grumpy') && hour >= 6 && hour < 10) at -= 1;
  const mark = marks.get(id);
  if (mark && mark.day === day) {
    at += mark.steps;
    why = mark.why;
  }
  if (isBirthday(id, day)) {
    at = 3;
    why = 'It is their birthday';
  }
  return { mood: ORDER[Math.max(0, Math.min(3, at))]!, why };
}

/** How a mood is shown. */
export function moodInfo(mood: MoodId): (typeof MOODS)[MoodId] {
  return MOODS[mood];
}
