/*
 * THE REAL CALENDAR, one convention for the whole economy: the player's local time (the arcade's
 * challenge, the change machine, the streak, the league's week, the market calendar's "came back on
 * another date"). The in-game market day is `MarketCalendar`'s count, not this.
 */

/** A local date as YYYY-MM-DD (zero-padded), the key every daily thing is saved and seeded under. */
export function dayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * The key the economy used before it settled on local time: the UTC date (YYYY-MM-DD). Only for
 * reading old saves: a claim saved under today's UTC date was a claim made today.
 */
export function utcDayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Days since 1970-01-01 of the local date (whole days, whatever the time of day or the clock change). */
export function dayNumber(date: Date = new Date()): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/** `date` moved by `days` calendar days (local), same time of day. */
export function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

/** ISO 8601 week of the local date, YYYY-Www (weeks start on Monday; week 1 holds the year's first Thursday). */
export function isoWeek(date: Date): string {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** How far through its week (Monday 00:00 to Sunday 24:00, local) `date` is, 0..1. */
export function weekProgress(date: Date): number {
  const day = (date.getDay() + 6) % 7;
  return (day + (date.getHours() + date.getMinutes() / 60) / 24) / 7;
}

/**
 * A day key saved before the switch to local time, read today: today's UTC date means today (the
 * claim was made today, whichever date the UTC clock showed), anything else stays as it was.
 */
export function fromUtcDayKey(saved: string, now: Date = new Date()): string {
  return saved === utcDayKey(now) ? dayKey(now) : saved;
}

/**
 * A day saved in the street's old local form, `Y-M-D` unpadded with a 1-based month (`2026-9-5`),
 * as a `dayKey` (`2026-09-05`); anything else stays as it was. Only for reading old saves.
 */
export function fromUnpaddedDayKey(saved: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(saved);
  return m ? `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}` : saved;
}
