import type { Game } from './types';

/** Seed data — Super Nintendo. `libretroName`s verified against libretro-thumbnails. */
export const SNES_GAMES: Game[] = [
  {
    id: 'snes-super-mario-world', title: 'Super Mario World', platform: 'snes',
    releaseDate: '1991-08-13', developer: 'Nintendo EAD', publisher: 'Nintendo', genre: 'Platformer', region: 'USA',
    description: 'Mario and Luigi explore Dinosaur Land with Yoshi to rescue Princess Toadstool from Bowser once again.',
    externalIds: { libretroName: 'Super Mario World (USA)' },
  },
  {
    id: 'snes-zelda-link-to-the-past', title: 'The Legend of Zelda: A Link to the Past', platform: 'snes',
    releaseDate: '1992-04-13', developer: 'Nintendo EAD', publisher: 'Nintendo', genre: 'Action-adventure', region: 'USA',
    description: 'Link travels between the Light and Dark Worlds to free the seven maidens and stop Ganon.',
    externalIds: { libretroName: 'Legend of Zelda, The - A Link to the Past (USA)' },
  },
  {
    id: 'snes-super-metroid', title: 'Super Metroid', platform: 'snes',
    releaseDate: '1994-04-18', developer: 'Nintendo R&D1 / Intelligent Systems', publisher: 'Nintendo', genre: 'Action-adventure', region: 'Japan, USA',
    description: 'Samus returns to Zebes to recover the last Metroid larva from Ridley and the Space Pirates.',
    externalIds: { libretroName: 'Super Metroid (Japan, USA) (En,Ja)' },
  },
  {
    id: 'snes-chrono-trigger', title: 'Chrono Trigger', platform: 'snes',
    releaseDate: '1995-08-22', developer: 'Square', publisher: 'Square', genre: 'RPG', region: 'USA',
    description: 'Crono and friends travel across time to prevent the planet-devouring Lavos from destroying the world.',
    externalIds: { libretroName: 'Chrono Trigger (USA)' },
  },
  {
    id: 'snes-donkey-kong-country', title: 'Donkey Kong Country', platform: 'snes',
    releaseDate: '1994-11-21', developer: 'Rare', publisher: 'Nintendo', genre: 'Platformer', region: 'USA',
    description: 'Donkey and Diddy Kong chase the Kremlings across the island to recover the stolen banana hoard.',
    externalIds: { libretroName: 'Donkey Kong Country (USA)' },
  },
  {
    id: 'snes-super-mario-kart', title: 'Super Mario Kart', platform: 'snes',
    releaseDate: '1992-09-01', developer: 'Nintendo EAD', publisher: 'Nintendo', genre: 'Racing', region: 'USA',
    description: 'Eight Mushroom Kingdom characters race Mode 7 tracks and pelt each other with shells and bananas.',
    externalIds: { libretroName: 'Super Mario Kart (USA)' },
  },
  {
    id: 'snes-final-fantasy-3', title: 'Final Fantasy III', platform: 'snes',
    releaseDate: '1994-10-11', developer: 'Square', publisher: 'Square', genre: 'RPG', region: 'USA',
    description: 'Fourteen playable characters rise against the Gestahlian Empire and the mad jester Kefka. Final Fantasy VI in Japan.',
    externalIds: { libretroName: 'Final Fantasy III (USA)' },
  },
  {
    id: 'snes-earthbound', title: 'EarthBound', platform: 'snes',
    releaseDate: '1995-06-05', developer: 'Ape / HAL Laboratory', publisher: 'Nintendo', genre: 'RPG', region: 'USA',
    description: 'Ness and three friends cross a quirky modern-day America to gather eight melodies and defeat Giygas.',
    externalIds: { libretroName: 'EarthBound (USA)' },
  },
];
