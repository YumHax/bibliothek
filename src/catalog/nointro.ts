/**
 * Helpers for No-Intro / Redump style names as used by libretro-thumbnails, e.g.
 * "Legend of Zelda, The - A Link to the Past (USA) (Rev 1)".
 */

export interface ParsedNoIntroName {
  /** Human title: parenthesised groups removed, ", The" moved back to the front. */
  title: string;
  /** Region group when present, e.g. "USA" or "USA, Europe". */
  region?: string;
}

const REGIONS = new Set([
  'World', 'USA', 'Europe', 'Japan', 'Asia', 'Australia', 'Brazil', 'Canada', 'China', 'France', 'Germany', 'Italy',
  'Korea', 'Netherlands', 'Spain', 'Sweden', 'Taiwan', 'UK', 'Scandinavia', 'Russia', 'Hong Kong', 'Latin America',
]);

export function parseNoIntroName(name: string): ParsedNoIntroName {
  const groups = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]!.trim());
  const region = groups.find((g) => g.split(',').every((part) => REGIONS.has(part.trim())));
  const bare = name.replace(/\s*\([^)]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '').trim();
  return { title: bare.split(' - ').map(moveArticleToFront).join(': '), region };
}

/** "Legend of Zelda, The" -> "The Legend of Zelda". Handles English, French, German and Spanish articles. */
function moveArticleToFront(segment: string): string {
  const m = /^(.*), (The|A|An|Le|La|Les|L'|Der|Die|Das|El|Los|Las)$/i.exec(segment.trim());
  if (!m) return segment.trim();
  const article = m[2]!;
  return article.endsWith("'") ? `${article}${m[1]}` : `${article} ${m[1]}`;
}

/** URL/id-safe slug: lower-case ASCII, hyphen-separated. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Stable id of a game known by its libretro-thumbnails name: `<platform>-<slug of the No-Intro name>`. */
export function gameIdFor(platform: string, libretroName: string): string {
  return `${platform}-${slugify(libretroName)}`;
}
