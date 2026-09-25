import type { Game, PlatformId } from '@/catalog/types';

/** One game of a set: its platform and the titles it goes by, normalised (a trailing `*` matches any subtitle). */
export interface SetPiece {
  platform: PlatformId;
  /** How the set's card names it. */
  name: string;
  titles: readonly string[];
}

/** A run of games worth completing, and the coins the market's collectors' club pays once it is. */
export interface CollectorSet {
  id: string;
  name: string;
  pieces: readonly SetPiece[];
  reward: number;
}

const p = (platform: PlatformId, name: string, ...titles: string[]): SetPiece => ({ platform, name, titles });

/**
 * The collectors' club's list: sets of games, each paying a reward once every piece is in the
 * collection (owned or lent). Titles are matched normalised (lower case, letters and digits only),
 * so the built-in list's "Pokémon Red Version" and the index's "Pokemon: Red Version" are one.
 */
export const COLLECTOR_SETS: readonly CollectorSet[] = [
  {
    id: 'mario-nes',
    name: 'Mario on the NES',
    reward: 120,
    pieces: [p('nes', 'Super Mario Bros.', 'super mario bros'), p('nes', 'Super Mario Bros. 2', 'super mario bros 2'), p('nes', 'Super Mario Bros. 3', 'super mario bros 3')],
  },
  {
    id: 'zelda',
    name: 'The Legend of Zelda, every console',
    reward: 400,
    pieces: [
      p('nes', 'The Legend of Zelda', 'the legend of zelda'),
      p('nes', 'Zelda II', 'zelda ii*'),
      p('snes', 'A Link to the Past', 'the legend of zelda a link to the past'),
      p('gb', "Link's Awakening", 'the legend of zelda link s awakening'),
      p('n64', 'Ocarina of Time', 'the legend of zelda ocarina of time*'),
      p('n64', "Majora's Mask", 'the legend of zelda majora s mask'),
    ],
  },
  {
    id: 'sonic',
    name: 'Sonic on the Mega Drive',
    reward: 150,
    pieces: [
      p('megadrive', 'Sonic the Hedgehog', 'sonic the hedgehog'),
      p('megadrive', 'Sonic 2', 'sonic the hedgehog 2'),
      p('megadrive', 'Sonic 3', 'sonic the hedgehog 3'),
      p('megadrive', 'Sonic & Knuckles', 'sonic knuckles', 'sonic and knuckles'),
    ],
  },
  {
    id: 'megaman',
    name: 'Mega Man, the NES years',
    reward: 200,
    pieces: [1, 2, 3, 4, 5, 6].map((n) => p('nes', n === 1 ? 'Mega Man' : `Mega Man ${n}`, n === 1 ? 'mega man' : `mega man ${n}`)),
  },
  {
    id: 'metroid',
    name: 'Metroid trilogy',
    reward: 160,
    pieces: [p('nes', 'Metroid', 'metroid'), p('gb', 'Metroid II', 'metroid ii*'), p('snes', 'Super Metroid', 'super metroid')],
  },
  {
    id: 'pokemon',
    name: 'Gotta catch them all',
    reward: 140,
    pieces: [p('gb', 'Red', 'pokemon red*'), p('gb', 'Blue', 'pokemon blue*'), p('gb', 'Yellow', 'pokemon yellow*')],
  },
  {
    id: 'dkc',
    name: 'Donkey Kong Country',
    reward: 150,
    pieces: [
      p('snes', 'Donkey Kong Country', 'donkey kong country'),
      p('snes', 'DKC 2', 'donkey kong country 2*'),
      p('snes', 'DKC 3', 'donkey kong country 3*'),
    ],
  },
  {
    id: 'crash',
    name: 'Crash Bandicoot',
    reward: 140,
    pieces: [p('ps1', 'Crash Bandicoot', 'crash bandicoot'), p('ps1', 'Crash 2', 'crash bandicoot 2*'), p('ps1', 'Warped', 'crash bandicoot warped', 'crash bandicoot 3*')],
  },
  {
    id: 'ff-ps1',
    name: 'Final Fantasy on the PlayStation',
    reward: 220,
    pieces: [p('ps1', 'Final Fantasy VII', 'final fantasy vii'), p('ps1', 'Final Fantasy VIII', 'final fantasy viii'), p('ps1', 'Final Fantasy IX', 'final fantasy ix')],
  },
  {
    id: 'castlevania',
    name: 'Castlevania, four consoles',
    reward: 200,
    pieces: [
      p('nes', 'Castlevania', 'castlevania'),
      p('snes', 'Super Castlevania IV', 'super castlevania iv'),
      p('megadrive', 'Bloodlines', 'castlevania bloodlines'),
      p('ps1', 'Symphony of the Night', 'castlevania symphony of the night'),
    ],
  },
];

/** Lower case, accents off, anything but letters and digits a single space. */
export function normaliseTitle(title: string): string {
  return title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Whether `game` is this piece of a set. */
export function isPiece(piece: SetPiece, game: Game): boolean {
  if (game.platform !== piece.platform) return false;
  const title = normaliseTitle(game.title);
  return piece.titles.some((t) => (t.endsWith('*') ? title.startsWith(t.slice(0, -1).trimEnd()) : title === t));
}

/** Which pieces of `set` the collection holds (owned or lent), in the set's order. */
export function setProgress(set: CollectorSet, games: readonly Game[]): { piece: SetPiece; have: boolean }[] {
  const mine = games.filter((g) => g.status !== 'wishlist');
  return set.pieces.map((piece) => ({ piece, have: mine.some((g) => isPiece(piece, g)) }));
}
