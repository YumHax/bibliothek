import type { Game } from './types';
import { getPlatform } from './platforms';

/** Where a copy's papers were printed and its region's three letters on its codes, from its region (free words). */
export function regionOf(game: Game): { printed: string; code: string } {
  const region = game.region ?? '';
  if (/japan/i.test(region)) return { printed: 'Japan', code: 'JPN' };
  if (/europe|pal|uk|france|germany/i.test(region)) return { printed: 'Germany', code: 'EUR' };
  if (/taiwan/i.test(region)) return { printed: 'Taiwan', code: 'TWN' };
  return { printed: 'U.S.A.', code: 'USA' };
}

/** The code printed on a copy's booklet and its cartridge's back sticker: the platform, the title's initials, the region. */
export function productCode(game: Game): string {
  const initials = game.title.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).map((word) => word[0]!.toUpperCase()).join('').slice(0, 3) || 'XX';
  return `${getPlatform(game.platform).shortName.replace(/\s+/g, '').toUpperCase().slice(0, 4)}-${initials}-${regionOf(game).code}`;
}
