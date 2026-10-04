/*
 * Clock readings and dates as the player reads them. One rule for the minutes: the hour of the day is wrapped into
 * [0, 24), the total minutes are floored (a clock shows 18:59 until 19:00 strikes), then split, so no reading can ever
 * say ":60" (docs/consistency-audit.md §3.9-C1: five hand-made clocks rounded the minutes alone and could). Days are the
 * save keys' "YYYY-MM-DD" (`economy/calendar` dayKey) read back as "25 Sep 2026", and a file's name is stamped with the
 * local date (a file is dated like any other).
 */

/** "18:05" (or "8:05" with `pad: false`, the shop signs' style) from a fractional hour of the day; 24.5 reads "00:30". */
export function formatClock(hours: number, options: { pad?: boolean } = {}): string {
  const total = Math.floor((((hours % 24) + 24) % 24) * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${options.pad === false ? h : String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "8:00", "19:30": the shop signs' style, no leading zero on the hour. */
export function clockShort(hours: number): string {
  return formatClock(hours, { pad: false });
}

/** "25 Sep 2026" from a "YYYY-MM-DD" day key; anything else is handed back as it came (an empty key stays empty). */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const two = (n: number): string => String(n).padStart(2, '0');

/** A file name's date, local: "2026-09-25", or "2026-09-25-18h42m07" with `time`. */
export function fileStamp(date: Date = new Date(), options: { time?: boolean } = {}): string {
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  return options.time ? `${day}-${two(date.getHours())}h${two(date.getMinutes())}m${two(date.getSeconds())}` : day;
}
