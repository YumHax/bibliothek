import type { Game, PlatformId } from './types';

/**
 * Unlicensed cartridges of the nineties: the multicarts, the hacks sold as sequels, the ports nobody asked for. Not the
 * market's fakes (a reproduction passed off as a real game): these say what they are, and collect as curiosities in
 * their own right. Their art is always generated (no scan exists: the cover providers skip them), their fame is
 * "no article" (`Fame`), so a stall prices them like any obscure game. Found in the bargain bin, now and then among a
 * stall's finds, and in box lots (`economy/copyTraits.drawBootleg`).
 */
const LINES: readonly (Omit<Game, 'id' | 'bootleg' | 'status' | 'region'> & { slug: string })[] = [
  { slug: 'super-7-in-1', title: 'Super 7-in-1', platform: 'nes', releaseDate: '1992', genre: 'Multicart', publisher: 'Unknown (Taiwan)', description: 'Seven games on one board, if two of them are the same game with a new title screen.' },
  { slug: '52-in-1', title: '52 Games in 1', platform: 'nes', releaseDate: '1994', genre: 'Multicart', publisher: 'Unknown (Hong Kong)', description: 'Fifty-two entries on the menu, eleven different games underneath.' },
  { slug: 'kart-fighter', title: 'Kart Fighter', platform: 'nes', releaseDate: '1993', genre: 'Fighting', publisher: 'Hummer Team', description: 'A plumber, a princess and a dinosaur in a street fight nobody licensed.' },
  { slug: 'somari', title: 'Somari', platform: 'nes', releaseDate: '1994', genre: 'Platformer', publisher: 'Hummer Team', description: 'A blue hedgehog’s levels, run by a plumber in red, at eight bits.' },
  { slug: 'super-mario-4', title: 'Super Mario 4', platform: 'gb', releaseDate: '1998', genre: 'Platformer', publisher: 'Sintax', description: 'Not the fourth anything: a pirate platformer with a borrowed hero.' },
  { slug: 'sonic-3d-blast-5', title: 'Sonic 3D Blast 5', platform: 'gb', releaseDate: '1999', genre: 'Platformer', publisher: 'Makon Soft', description: 'There was never a 2, a 3 or a 4. This one is not 3D either.' },
  { slug: 'pocket-monster', title: 'Pocket Monster', platform: 'megadrive', releaseDate: '1999', genre: 'Platformer', publisher: 'Unknown (China)', description: 'A yellow mouse in a side-scroller, years after the console’s day.' },
  { slug: 'super-mario-world', title: 'Super Mario World 64', platform: 'megadrive', releaseDate: '1997', genre: 'Platformer', publisher: 'Unknown (Taiwan)', description: 'Half the first world of a famous game, ported by hand, sold as a sequel.' },
  { slug: 'super-bomberman-5', title: 'Super Bomberman 5 Gold', platform: 'snes', releaseDate: '1997', genre: 'Action', publisher: 'Unknown (Hong Kong)', description: 'A hacked sequel with a gold sticker and the old maps.' },
  { slug: 'pokemon-gold', title: 'Pocket Monster Gold', platform: 'snes', releaseDate: '1999', genre: 'Role-playing', publisher: 'Unknown (China)', description: 'A handheld game redrawn for the big console, in Chinese and broken English.' },
];

/** Every bootleg the market can turn up. */
export const BOOTLEGS: readonly Game[] = LINES.map(({ slug, ...game }) => ({
  ...game,
  id: bootlegId(game.platform, slug),
  region: 'Taiwan',
  status: 'owned',
  bootleg: true,
}));

function bootlegId(platform: PlatformId, slug: string): string {
  return `bootleg-${platform}-${slug}`;
}

/** Whether `id` names a bootleg (old saves included: the id is the mark). */
export function isBootlegId(id: string): boolean {
  return id.startsWith('bootleg-');
}

/** The bootlegs of `platform`. */
export function bootlegsOf(platform: PlatformId): Game[] {
  return BOOTLEGS.filter((g) => g.platform === platform);
}
