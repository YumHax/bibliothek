import type { Game } from './types';

/** Seed data — Game Boy. `libretroName`s verified against libretro-thumbnails. */
export const GB_GAMES: Game[] = [
  {
    id: 'gb-tetris', title: 'Tetris', platform: 'gb',
    releaseDate: '1989-06-14', developer: 'Nintendo R&D1', publisher: 'Nintendo', genre: 'Puzzle', region: 'World',
    description: 'The pack-in that sold the Game Boy: falling tetrominoes, Korobeiniki, and a two-player link cable mode.',
    externalIds: { libretroName: 'Tetris (World) (Rev 1)' },
  },
  {
    id: 'gb-super-mario-land', title: 'Super Mario Land', platform: 'gb',
    releaseDate: '1989-04-21', developer: 'Nintendo R&D1', publisher: 'Nintendo', genre: 'Platformer', region: 'World',
    description: 'Mario rescues Princess Daisy from the alien Tatanga across the four kingdoms of Sarasaland.',
    externalIds: { libretroName: 'Super Mario Land (World)' },
  },
  {
    id: 'gb-pokemon-red', title: 'Pokémon Red Version', platform: 'gb',
    releaseDate: '1998-09-28', developer: 'Game Freak', publisher: 'Nintendo', genre: 'RPG', region: 'USA, Europe',
    description: 'Catch and train 151 Pokémon across Kanto, defeat the eight Gym Leaders and take on the Elite Four.',
    externalIds: { libretroName: 'Pokemon - Red Version (USA, Europe) (SGB Enhanced)' },
  },
  {
    id: 'gb-zelda-links-awakening', title: "The Legend of Zelda: Link's Awakening", platform: 'gb',
    releaseDate: '1993-08-01', developer: 'Nintendo EAD', publisher: 'Nintendo', genre: 'Action-adventure', region: 'USA, Europe',
    description: 'Shipwrecked on Koholint Island, Link collects the eight Instruments of the Sirens to wake the Wind Fish.',
    externalIds: { libretroName: "Legend of Zelda, The - Link's Awakening (USA, Europe)" },
  },
  {
    id: 'gb-kirbys-dream-land', title: "Kirby's Dream Land", platform: 'gb',
    releaseDate: '1992-08-01', developer: 'HAL Laboratory', publisher: 'Nintendo', genre: 'Platformer', region: 'USA, Europe',
    description: "Kirby's debut: inhale enemies and float through five stages to take the stolen food back from King Dedede.",
    externalIds: { libretroName: "Kirby's Dream Land (USA, Europe)" },
  },
  {
    id: 'gb-metroid-2', title: 'Metroid II: Return of Samus', platform: 'gb',
    releaseDate: '1991-11-01', developer: 'Nintendo R&D1', publisher: 'Nintendo', genre: 'Action-adventure', region: 'World',
    description: 'Samus descends into SR388 to exterminate the Metroids, which evolve into deadlier forms the deeper she goes.',
    externalIds: { libretroName: 'Metroid II - Return of Samus (World)' },
  },
  {
    id: 'gb-wario-land', title: 'Wario Land: Super Mario Land 3', platform: 'gb',
    releaseDate: '1994-01-21', developer: 'Nintendo R&D1', publisher: 'Nintendo', genre: 'Platformer', region: 'World',
    description: 'Wario takes the lead, ramming through Kitchen Island in search of the Brown Sugar Pirates’ treasure.',
    externalIds: { libretroName: 'Wario Land - Super Mario Land 3 (World)' },
  },
  {
    id: 'gb-super-mario-land-2', title: 'Super Mario Land 2: 6 Golden Coins', platform: 'gb',
    releaseDate: '1992-11-02', developer: 'Nintendo R&D1', publisher: 'Nintendo', genre: 'Platformer', region: 'USA, Europe',
    description: 'Mario recovers six golden coins to reclaim his castle from Wario, who makes his first appearance.',
    externalIds: { libretroName: 'Super Mario Land 2 - 6 Golden Coins (USA, Europe)' },
  },
];
