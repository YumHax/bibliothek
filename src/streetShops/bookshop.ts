import type { Game, PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { mediaOf } from '@/catalog/media';
import { gameDayRandom } from '@/time/daily';
import { chance, pick, shuffled } from '@/random';
import { STREET_SHOPS } from './rules';

/*
 * Front Street's two bookshops (docs/economy.md "Front Street's shops and finds"): CORNER BOOKS keeps a box of loose
 * game manuals, and one for a copy on the player's shelves that lacks its own turns up in it now and then (or is
 * ordered: in a couple of days); COMICS & MANGA sells strategy guides, read at once, a platform's know-how (as a manual
 * read in the bedroom's reading chair). Drawn per game week, the same all week.
 */

/** The copies a loose manual would complete: owned, without their manual, genuine. */
export function lackingManuals(games: readonly Game[]): Game[] {
  return games.filter((g) => (g.status ?? 'owned') === 'owned' && g.condition === 'noManual' && !g.repro);
}

/** What a loose manual for `game` costs at CORNER BOOKS (a disc's insert is cheaper than a cartridge's booklet). */
export function manualPrice(game: Pick<Game, 'platform' | 'region' | 'externalIds'>): number {
  const { price } = STREET_SHOPS.manuals;
  return mediaOf(game).shape === 'disc' ? price.disc : price.cart;
}

/** The manuals in CORNER BOOKS' box in game week `week`: for some of the player's copies that lack one. */
export function manualsInBox(week: number, games: readonly Game[]): Game[] {
  const { weeklyOdds, shown } = STREET_SHOPS.manuals;
  return lackingManuals(games)
    .filter((g) => chance(gameDayRandom(`manualBox:${g.id}`, week), weeklyOdds))
    .slice(0, shown);
}

/** A strategy guide on COMICS & MANGA's shelf: for a game, of a platform. */
interface Guide {
  id: string;
  platform: PlatformId;
  title: string;
  /** What the back cover promises. */
  blurb: string;
}

const GUIDE_TITLES: readonly ((game: string, platform: string) => string)[] = [
  (game) => `${game}: The Official Strategy Guide`,
  (game) => `${game}: Secrets, Maps and Every Last Item`,
  (_game, platform) => `The ${platform} Player’s Handbook`,
  (_game, platform) => `Tips & Tricks: ${platform} Special`,
];
const BLURBS: readonly string[] = [
  'Every map, every boss, and the moves the manual never told you.',
  'Folded-out maps, a page of passwords, a chapter on the hidden levels.',
  'Written by people who finished it twice. The cover is a little faded.',
  'A fat paperback, a coffee ring on page 40, every secret in the back.',
];

/** The guides on the shelf in game week `week`: for the platforms the player collects (games they own), a few. */
export function guidesOnShelf(week: number, games: readonly Game[]): Guide[] {
  const owned = games.filter((g) => (g.status ?? 'owned') === 'owned');
  if (!owned.length) return [];
  const random = gameDayRandom('guides', week);
  const picks = shuffled(random, owned).slice(0, STREET_SHOPS.guides.perWeek);
  return picks.map((game) => {
    const platform = getPlatform(game.platform);
    const title = pick(random, GUIDE_TITLES)(game.title, platform.shortName);
    return { id: `guide:${week}:${game.id}`, platform: game.platform, title, blurb: pick(random, BLURBS) };
  });
}
