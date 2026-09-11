/** "1985-09-13" -> "13 September 1985", "1985" -> "1985". */
export function formatReleaseDate(date: string | undefined, locale = navigator.language): string {
  if (!date) return 'Unknown';
  if (/^\d{4}$/.test(date)) return date;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}
