import { mixHex } from './paint';

/** The time of year the view is painted in: the trees and the lawn follow it. */
export type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter';

export interface Season {
  name: SeasonName;
  /** How far into it, 0..1: early autumn is still mostly green, by late autumn most trees are bare. */
  depth: number;
}

/** The season on the real calendar (northern hemisphere): meteorological seasons, three months each. */
export function seasonOf(date: Date): Season {
  const month = date.getMonth();
  const name: SeasonName = month >= 2 && month <= 4 ? 'spring' : month >= 5 && month <= 7 ? 'summer' : month >= 8 && month <= 10 ? 'autumn' : 'winter';
  // Months since the season began (winter starts in December), plus how far into the month.
  const start = { spring: 2, summer: 5, autumn: 8, winter: 11 }[name];
  const into = (month - start + 12) % 12;
  const days = new Date(date.getFullYear(), month + 1, 0).getDate();
  return { name, depth: Math.min(1, (into + (date.getDate() - 1) / days) / 3) };
}

/** Parses `?season=autumn` (optionally `autumn:0.8` for the depth); anything else is ignored. */
export function parseSeason(value: string | null): Season | undefined {
  if (!value) return undefined;
  const [name, depth] = value.split(':');
  if (name !== 'spring' && name !== 'summer' && name !== 'autumn' && name !== 'winter') return undefined;
  return { name, depth: depth === undefined ? 0.5 : Math.min(1, Math.max(0, Number(depth) || 0)) };
}

/**
 * The season the painters are working in. The panorama is painted once, far to near, by a
 * dozen painters; they read it here rather than having it threaded through every call. Set by
 * `Outdoors` before it paints.
 */
let current: Season = { name: 'summer', depth: 0.5 };

export function useSeason(season: Season): void {
  current = season;
}

export function currentSeason(): Season {
  return current;
}

/** The lawn's colour in the current season: fresh in spring, parched at the end of summer, dun in winter. */
export function seasonalLawn(hex: string): string {
  const { name, depth } = current;
  if (name === 'spring') return mixHex(hex, '#8fc05a', 0.25);
  if (name === 'summer') return mixHex(hex, '#a8a860', 0.2 * depth);
  if (name === 'autumn') return mixHex(hex, '#9a9658', 0.15 + 0.2 * depth);
  return mixHex(hex, '#8f8a6a', 0.6);
}

/**
 * A festive time the view dresses up for: string lights over Front Street and a lit tree in the
 * park through December into the first week of January, carved pumpkins on the sills and orange
 * lights in the last ten days of October.
 */
export type Holiday = 'christmas' | 'halloween';

/** The holiday on the real calendar, or null most of the year. */
export function holidayOf(date: Date): Holiday | null {
  const month = date.getMonth();
  const day = date.getDate();
  if (month === 11 || (month === 0 && day <= 6)) return 'christmas';
  if (month === 9 && day >= 21) return 'halloween';
  return null;
}

/** Parses `?holiday=christmas` (`none` for no holiday at all); undefined leaves it to the calendar. */
export function parseHoliday(value: string | null): Holiday | null | undefined {
  if (value === 'christmas' || value === 'halloween') return value;
  if (value === 'none') return null;
  return undefined;
}

/** The holiday the painters are dressing the view for (set by `Outdoors`, like the season). */
let holiday: Holiday | null = null;

export function useHoliday(value: Holiday | null): void {
  holiday = value;
}

export function currentHoliday(): Holiday | null {
  return holiday;
}
