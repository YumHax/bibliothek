import { KEYS, PersistedStore } from '@/persistence';
import { gameDayRandom } from '@/time/daily';
import { TRADE_MOODS } from './moodLines';
import { findPerson } from './people';
import { BIRTHDAY_CYCLE, MOOD_DAYS, MOODS, type MoodId } from './socialPlan';
import type { PersonId } from './types';

/*
 * Mood of the day (docs/social.md "Mood"): fine by default, and never good or low without a cause the player is told
 * ("her son called", "not a morning person", "the power cut"): their card's `moods` drawn on some days, the hour for a
 * night owl or an early bird, what happened that day (`markMood`, saved under `KEYS.socialMood`), their birthday.
 */

const ORDER: readonly MoodId[] = ['annoyed', 'low', 'fine', 'good'];

/** The marks of the day: id -> { day, steps up (+) or down (-), why }. */
interface MoodSave {
  marks: Record<PersonId, { day: number; steps: number; why: string }>;
}

let store: PersistedStore<MoodSave> | null = null;
let state: MoodSave | null = null;

function loaded(): MoodSave {
  if (state) return state;
  store = new PersistedStore<MoodSave>({ key: KEYS.socialMood, version: 1, defaults: () => ({ marks: {} }), read: readSave });
  state = store.load();
  return state;
}

function readSave(data: unknown): MoodSave | null {
  if (!data || typeof data !== 'object') return null;
  const marks: MoodSave['marks'] = {};
  for (const [id, m] of Object.entries((data as { marks?: unknown }).marks ?? {})) {
    const v = m as { day?: unknown; steps?: unknown; why?: unknown };
    if (typeof v?.day === 'number' && typeof v.steps === 'number' && typeof v.why === 'string') marks[id] = { day: v.day, steps: v.steps, why: v.why };
  }
  return { marks };
}

/** The generic causes, for a card that has none of its own. */
const GOOD_CAUSES = ['slept like a log', 'had some good news'] as const;
const LOW_CAUSES = ['slept badly', 'a long day'] as const;

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
  const marks = loaded().marks;
  const old = marks[id];
  marks[id] = { day, steps: (old?.day === day ? old.steps : 0) + steps, why };
  // Yesterday's marks are of no use: only today's are kept.
  for (const [other, m] of Object.entries(marks)) if (m.day < day) delete marks[other];
  store?.save(loaded());
}

/** `id`'s mood on `day` at game hour `hour`, and why when it is not fine (there is always a why then). */
export function moodOf(id: PersonId, day: number, hour: number): { mood: MoodId; why: string | null } {
  if (isBirthday(id, day)) return { mood: 'good', why: 'It is their birthday' };
  const card = findPerson(id);
  const traits = card?.traits ?? [];
  let at = 2;
  let why: string | null = null;
  const r = gameDayRandom(`mood:${id}`, day);
  const draw = r();
  if (draw < MOOD_DAYS.good) {
    const causes = card?.moods?.good ?? (card?.trade ? TRADE_MOODS[card.trade]?.good : undefined) ?? GOOD_CAUSES;
    at = 3;
    why = causes[Math.floor(r() * causes.length)] ?? null;
  } else if (draw < MOOD_DAYS.good + MOOD_DAYS.low) {
    const causes = card?.moods?.low ?? (card?.trade ? TRADE_MOODS[card.trade]?.low : undefined) ?? LOW_CAUSES;
    at = 1;
    why = causes[Math.floor(r() * causes.length)] ?? null;
  }
  // The hour weighs on some (said as the cause when it is what darkens them).
  if (traits.includes('nightOwl') && hour >= 6 && hour < 11) [at, why] = [at - 1, 'not a morning person'];
  else if (traits.includes('earlyBird') && hour >= 21) [at, why] = [at - 1, 'it is late for them'];
  else if (traits.includes('grumpy') && hour >= 6 && hour < 10) [at, why] = [at - 1, 'not before their coffee'];
  const mark = loaded().marks[id];
  if (mark && mark.day === day) {
    at += mark.steps;
    why = mark.why;
  }
  const mood = ORDER[Math.max(0, Math.min(3, at))]!;
  return { mood, why: mood === 'fine' ? null : why };
}

/** How a mood is shown. */
export function moodInfo(mood: MoodId): (typeof MOODS)[MoodId] {
  return MOODS[mood];
}
