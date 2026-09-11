import type { Game } from './types';

/** Seed data — Nintendo 64. `libretroName`s verified against libretro-thumbnails. */
export const N64_GAMES: Game[] = [
  {
    id: 'n64-super-mario-64', title: 'Super Mario 64', platform: 'n64',
    releaseDate: '1996-09-29', developer: 'Nintendo EAD', publisher: 'Nintendo', genre: 'Platformer', region: 'USA',
    description: 'Mario leaps into the paintings of Peach’s castle to collect 120 Power Stars in the first 3D Mario.',
    externalIds: { libretroName: 'Super Mario 64 (USA)' },
  },
  {
    id: 'n64-zelda-ocarina-of-time', title: 'The Legend of Zelda: Ocarina of Time', platform: 'n64',
    releaseDate: '1998-11-23', developer: 'Nintendo EAD', publisher: 'Nintendo', genre: 'Action-adventure', region: 'USA',
    description: 'Link travels seven years through time to awaken the Sages and stop Ganondorf from seizing the Triforce.',
    externalIds: { libretroName: 'Legend of Zelda, The - Ocarina of Time (USA)' },
  },
  {
    id: 'n64-zelda-majoras-mask', title: "The Legend of Zelda: Majora's Mask", platform: 'n64',
    releaseDate: '2000-10-26', developer: 'Nintendo EAD', publisher: 'Nintendo', genre: 'Action-adventure', region: 'USA',
    description: 'Link relives the same three days in Termina to stop the moon from falling on Clock Town.',
    externalIds: { libretroName: "Legend of Zelda, The - Majora's Mask (USA)" },
  },
  {
    id: 'n64-goldeneye-007', title: 'GoldenEye 007', platform: 'n64',
    releaseDate: '1997-08-25', developer: 'Rare', publisher: 'Nintendo', genre: 'First-person shooter', region: 'USA',
    description: 'Bond infiltrates Byelomorye Dam and beyond; the four-player split-screen defined console deathmatch.',
    externalIds: { libretroName: 'GoldenEye 007 (USA)' },
  },
  {
    id: 'n64-mario-kart-64', title: 'Mario Kart 64', platform: 'n64',
    releaseDate: '1997-02-10', developer: 'Nintendo EAD', publisher: 'Nintendo', genre: 'Racing', region: 'USA',
    description: 'Four-player kart racing across sixteen 3D tracks, from Rainbow Road to the endless Wario Stadium.',
    externalIds: { libretroName: 'Mario Kart 64 (USA)' },
  },
  {
    id: 'n64-banjo-kazooie', title: 'Banjo-Kazooie', platform: 'n64',
    releaseDate: '1998-06-29', developer: 'Rare', publisher: 'Nintendo', genre: 'Platformer', region: 'USA',
    description: 'A bear and a bird collect jiggies and musical notes through Gruntilda’s lair to rescue Banjo’s sister Tooty.',
    externalIds: { libretroName: 'Banjo-Kazooie (USA)' },
  },
  {
    id: 'n64-star-fox-64', title: 'Star Fox 64', platform: 'n64',
    releaseDate: '1997-06-30', developer: 'Nintendo EAD', publisher: 'Nintendo', genre: 'Rail shooter', region: 'USA',
    description: 'Fox McCloud leads the Star Fox team through branching routes to Venom, with Rumble Pak support and a barrel roll.',
    externalIds: { libretroName: 'Star Fox 64 (USA)' },
  },
  {
    id: 'n64-paper-mario', title: 'Paper Mario', platform: 'n64',
    releaseDate: '2001-02-05', developer: 'Intelligent Systems', publisher: 'Nintendo', genre: 'RPG', region: 'USA',
    description: 'A paper-thin Mario gathers seven Star Spirits with timed-hit battles in a storybook Mushroom Kingdom.',
    externalIds: { libretroName: 'Paper Mario (USA)' },
  },
];
