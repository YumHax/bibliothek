import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { SHARED_LINES, type FriendPlan, type FriendTaste } from './friendsPlan';

/** Fills a template: {title}, {platform}, {year}, {cat}, {days}, {coins}, {name}. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

/** One line of a list, drawn with `random`. */
export function pickLine(lines: readonly string[], random: () => number): string {
  return lines[Math.floor(random() * lines.length)] ?? '';
}

/** A game's release year, or null. */
export function yearOf(game: Game): number | null {
  const year = Number.parseInt(game.releaseDate?.slice(0, 4) ?? '', 10);
  return Number.isFinite(year) ? year : null;
}

/** How much a friend would want `game`: its console, its genre, its years (0 = not their thing). */
export function tasteScore(taste: FriendTaste, game: Game): number {
  let score = 0;
  if (taste.platforms.includes(game.platform)) score += 2;
  const genre = game.genre?.toLowerCase() ?? '';
  if (genre && taste.genres.some((g) => genre.includes(g))) score += 1.5;
  const year = yearOf(game);
  if (year !== null && year >= taste.years[0] && year <= taste.years[1]) score += 1;
  return score;
}

/** Page views past which a game counts as famous (see `Fame`). */
const FAMOUS_VIEWS = 150_000;

/**
 * What `friend` says looking at the shelves: about a game they love, a famous one, an old one,
 * the console corner, or one they do not know; or, with (nearly) nothing on the shelves, about that.
 */
export function shelfComment(friend: FriendPlan, games: readonly Game[], random: () => number, viewsOf?: (game: Game) => number | null | undefined): string {
  const c = SHARED_LINES.comment;
  if (games.length < 3) return pickLine(c.empty, random);
  if (games.length > 60 && random() < 0.25) return pickLine(c.many, random);
  const game = pickWeighted(games, (g) => 1 + tasteScore(friend.taste, g), random);
  const values = { title: game.title, platform: getPlatform(game.platform).name, year: yearOf(game) ?? '', name: friend.name };
  if (tasteScore(friend.taste, game) >= 3) return fill(pickLine(friend.lines.loved, random), values);
  if ((viewsOf?.(game) ?? 0) >= FAMOUS_VIEWS) return fill(pickLine(c.famous, random), values);
  const year = yearOf(game);
  if (year !== null && year < 1990 && random() < 0.6) return fill(pickLine(c.old, random), values);
  if (random() < 0.25) return fill(pickLine(c.platform, random), values);
  return fill(pickLine(c.generic, random), values);
}

/** The game `friend` would most like to borrow of `games`, or null when none is to their taste. */
export function borrowPick(friend: FriendPlan, games: readonly Game[], random: () => number): Game | null {
  const liked = games.filter((g) => tasteScore(friend.taste, g) >= 2);
  if (!liked.length) return null;
  return pickWeighted(liked, (g) => tasteScore(friend.taste, g) ** 2, random);
}

function pickWeighted<T>(items: readonly T[], weight: (item: T) => number, random: () => number): T {
  const weights = items.map(weight);
  let roll = random() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}
