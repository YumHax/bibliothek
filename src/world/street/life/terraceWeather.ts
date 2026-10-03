/** The weather a café's terrace goes by (`DayNight.state`). */
export interface TerraceSky {
  readonly rain: number;
  readonly snow: number;
  readonly snowCover: number;
}

/**
 * Whether it is dry enough for the tables to be out: no more than a spit of rain, no snow
 * falling, none lying. The one rule for the tables (`Terraces`) and their chatter
 * (`audio/ShopSounds`), so the two never disagree.
 */
export function terraceWeather(s: TerraceSky): boolean {
  return s.rain < 0.08 && s.snow < 0.05 && s.snowCover < 0.4;
}

/** Whether `hours` (game hours) fall in a terrace's opening `[from, to)`; `to` past 24 runs on after midnight. */
export function terraceHours([from, to]: readonly [number, number], hours: number): boolean {
  const h = hours < from && hours + 24 < to ? hours + 24 : hours;
  return h >= from && h < to;
}

/** Whether a terrace with these hours is out now: its hours and the weather. */
export function terraceOut(hours: readonly [number, number], s: TerraceSky & { readonly hours: number }): boolean {
  return terraceWeather(s) && terraceHours(hours, s.hours);
}

/** How many customers sit at each terrace right now (by index in `STREET_PLAN.terraces`; 0 while it is stacked). */
export type SeatedCount = (terrace: number) => number;
