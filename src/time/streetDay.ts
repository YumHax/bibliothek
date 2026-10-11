import { dayKey } from '@/economy/calendar';
import { fnv1a } from '@/random';

/*
 * Front Street's one clock (docs/economy.md "Front Street's shops and finds"): everything along the street goes by the
 * game's days (`Today.gameDay`), the garage sale and the free box, the busker, the dropped coins, the scratch cards and
 * the shops' week alike, so a night's sleep moves all of them together. Wired once in `bootstrap/services`; before
 * that (a headless check) the real date stands in.
 */

let source: (() => number) | null = null;

/** The street follows `day` (the game day count) from now on. */
export function followStreetDays(day: () => number): void {
  source = day;
}

/** The street's day now: the game day, or null before the wiring. */
export function streetDay(): number | null {
  return source ? source() : null;
}

/** What a street tally keeps as "today": `g12` (the game day), or the real `dayKey` before the wiring. */
export function streetDayMark(): string {
  const day = streetDay();
  return day === null ? dayKey() : `g${day}`;
}

/** Whether a one-day-in-`oneIn` street event of `topic` falls on game `day`. */
export function isStreetEventDay(topic: string, oneIn: number, day: number): boolean {
  return fnv1a(`${topic}:${day}`) % oneIn === 0;
}
