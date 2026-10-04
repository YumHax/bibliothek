import type { Game } from '@/catalog/types';

/**
 * A homebrew NES cart the emulator really plays: freely licensed games made for the NES long after it, their unmodified
 * release ROMs bundled in `public/roms/` with each licence next to it (`<file>.LICENSE.txt`: the author, the source,
 * the licence). Sold at the NES stall now and then (`economy/MarketStock`), played on the TV once in the NES
 * (docs/media.md "Homebrew carts").
 */
interface HomebrewCart {
  game: Game;
  /** Where the ROM is served. */
  rom: string;
  /** Controls, for the HUD tip when the pad is picked up. */
  hint: string;
  /** Whether it reads controller two (a friend can join). */
  players: 1 | 2;
}

/** The maker every homebrew cart is published under: the box and the panel say "Homebrew". */
const HOMEBREW_PUBLISHER = 'Homebrew';

const cart = (id: string, rom: string, players: 1 | 2, hint: string, game: Omit<Game, 'id' | 'platform' | 'publisher'>): HomebrewCart => ({
  game: { id: `nes-homebrew-${id}`, platform: 'nes', publisher: HOMEBREW_PUBLISHER, ...game },
  rom: `/roms/${rom}`,
  hint,
  players,
});

export const HOMEBREW_CARTS: readonly HomebrewCart[] = [
  cart('thwaite', 'thwaite.nes', 2, 'D-pad aims · B fires the left silo, A the right · Start pauses (up / down on the title: 2 players)', {
    title: 'Thwaite', releaseDate: '2018-10-19', developer: 'Damian Yerrick', genre: 'Shooter', region: 'World',
    description: 'Missiles fall on a small town for seven nights: shoot them down with the fireworks kept for Independence Day. Homebrew, GPL-3.0.',
  }),
  cart('croom', 'croom.nes', 2, 'D-pad moves · A turns a card · Start begins', {
    title: 'Concentration Room', releaseDate: '2018-10-03', developer: 'Damian Yerrick', genre: 'Puzzle', region: 'World',
    description: 'Quarantined after a lab accident, keep your sanity at a card-matching game, alone or against a friend. Homebrew, GPL-3.0.',
  }),
  cart('robotfindskitten', 'robotfindskitten.nes', 2, 'D-pad moves robot · bump into things to see if they are kitten', {
    title: 'robotfindskitten', releaseDate: '2018-10-20', developer: 'Damian Yerrick', genre: 'Zen simulation', region: 'World',
    description: 'You are robot. Your job is to find kitten among the many things which are not kitten. For two robots. Homebrew, zlib licence.',
  }),
  cart('nova', 'nova.nes', 1, 'D-pad runs · A jumps · B uses the ability · Start pauses', {
    title: 'Nova the Squirrel', releaseDate: '2019-04-30', developer: 'NovaSquirrel', genre: 'Platformer', region: 'World',
    description: 'A squirrel with a borrowed bag of abilities platforms across a strange new world. Homebrew: code GPL-3.0, art CC BY-NC-SA 4.0.',
  }),
];

/** The homebrew cart behind `gameId`, if it is one. */
export function homebrewCart(gameId: string): HomebrewCart | undefined {
  return HOMEBREW_CARTS.find((c) => c.game.id === gameId);
}
