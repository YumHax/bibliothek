import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { pickWeighted } from '@/random';
import { SHARED_LINES, type FriendPlan, type FriendTaste } from './friendsPlan';

/** Fills a template: {title}, {platform}, {year}, {cat}, {days}, {coins}, {name}. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

/** One line of a list, drawn with `random`. */
export function pickLine(lines: readonly string[], random: () => number): string {
  return lines[Math.floor(random() * lines.length)] ?? '';
}

/** Draws a line of a named bucket (a friend's own `sam:loved`, a shared `comment.old`): the `VisitBook`'s shuffle bag for it. */
export type LinePicker = (bucket: string, lines: readonly string[]) => string;

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
 * `focus` is the box they are looking at (the nearest bookcase's); without it, one drawn from `games`.
 */
export function shelfComment(friend: FriendPlan, games: readonly Game[], random: () => number, options: { viewsOf?: (game: Game) => number | null | undefined; focus?: Game | null; pick?: LinePicker } = {}): string {
  const c = SHARED_LINES.comment;
  const pick: LinePicker = options.pick ?? ((_bucket, lines) => pickLine(lines, random));
  if (games.length < 3) return pick('comment.empty', c.empty);
  if (games.length > 60 && !options.focus && random() < 0.25) return pick('comment.many', c.many);
  const game = options.focus ?? pickWeighted(random, games, (g) => 1 + tasteScore(friend.taste, g));
  const values = { title: game.title, platform: getPlatform(game.platform).name, year: yearOf(game) ?? '', name: friend.name };
  if (tasteScore(friend.taste, game) >= 3) return fill(pick(`${friend.id}:loved`, friend.lines.loved), values);
  if ((options.viewsOf?.(game) ?? 0) >= FAMOUS_VIEWS) return fill(pick('comment.famous', c.famous), values);
  const year = yearOf(game);
  if (year !== null && year < 1990 && random() < 0.6) return fill(pick('comment.old', c.old), values);
  if (random() < 0.25) return fill(pick('comment.platform', c.platform), values);
  return fill(pick('comment.generic', c.generic), values);
}

/** The game `friend` would rather look at among `games` (their taste weighs), or null. */
export function lookPick(friend: FriendPlan, games: readonly Game[], random: () => number): Game | null {
  return games.length ? pickWeighted(random, games, (g) => 1 + tasteScore(friend.taste, g)) : null;
}

/** The game `friend` would most like to borrow of `games`, or null when none is to their taste. */
export function borrowPick(friend: FriendPlan, games: readonly Game[], random: () => number): Game | null {
  const liked = games.filter((g) => tasteScore(friend.taste, g) >= 2);
  if (!liked.length) return null;
  return pickWeighted(random, liked, (g) => tasteScore(friend.taste, g) ** 2);
}
