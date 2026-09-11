import type { Game } from './types';

/** Seed data — Mega Drive / Genesis. `libretroName`s verified against libretro-thumbnails. */
export const MEGADRIVE_GAMES: Game[] = [
  {
    id: 'megadrive-sonic-the-hedgehog', title: 'Sonic the Hedgehog', platform: 'megadrive',
    releaseDate: '1991-06-23', developer: 'Sonic Team', publisher: 'Sega', genre: 'Platformer', region: 'USA, Europe',
    description: 'Sonic speeds through Green Hill Zone and beyond to free the animals Dr. Robotnik has trapped in robots.',
    externalIds: { libretroName: 'Sonic The Hedgehog (USA, Europe)' },
  },
  {
    id: 'megadrive-sonic-the-hedgehog-2', title: 'Sonic the Hedgehog 2', platform: 'megadrive',
    releaseDate: '1992-11-21', developer: 'Sonic Team / Sega Technical Institute', publisher: 'Sega', genre: 'Platformer', region: 'World',
    description: 'Tails joins Sonic, the spin dash debuts and Robotnik builds the Death Egg.',
    externalIds: { libretroName: 'Sonic The Hedgehog 2 (World)' },
  },
  {
    id: 'megadrive-streets-of-rage-2', title: 'Streets of Rage 2', platform: 'megadrive',
    releaseDate: '1992-12-20', developer: 'Sega / Ancient', publisher: 'Sega', genre: "Beat 'em up", region: 'USA',
    description: 'Axel, Blaze, Max and Skate fight through the city to rescue Adam from Mr. X, scored by Yuzo Koshiro.',
    externalIds: { libretroName: 'Streets of Rage 2 (USA)' },
  },
  {
    id: 'megadrive-gunstar-heroes', title: 'Gunstar Heroes', platform: 'megadrive',
    releaseDate: '1993-09-09', developer: 'Treasure', publisher: 'Sega', genre: 'Run and gun', region: 'USA',
    description: "Treasure's debut: combine two weapons and fight Seven Force in a fast, chaotic run and gun.",
    externalIds: { libretroName: 'Gunstar Heroes (USA)' },
  },
  {
    id: 'megadrive-phantasy-star-4', title: 'Phantasy Star IV', platform: 'megadrive',
    releaseDate: '1993-12-17', developer: 'Sega', publisher: 'Sega', genre: 'RPG', region: 'USA',
    description: 'Chaz and Alys hunt monsters across Motavia in the conclusion of the Algol saga, told through comic panels.',
    externalIds: { libretroName: 'Phantasy Star IV (USA)' },
  },
  {
    id: 'megadrive-shining-force-2', title: 'Shining Force II', platform: 'megadrive',
    releaseDate: '1993-10-01', developer: 'Sonic! Software Planning', publisher: 'Sega', genre: 'Tactical RPG', region: 'USA',
    description: 'Bowie leads a growing army across Granseal and Parmecia in turn-based battles against Zeon.',
    externalIds: { libretroName: 'Shining Force II (USA)' },
  },
  {
    id: 'megadrive-castlevania-bloodlines', title: 'Castlevania: Bloodlines', platform: 'megadrive',
    releaseDate: '1994-03-17', developer: 'Konami', publisher: 'Konami', genre: 'Platformer', region: 'USA',
    description: 'John Morris and Eric Lecarde chase Elizabeth Bartley across 1917 Europe, the only Castlevania on a Sega console.',
    externalIds: { libretroName: 'Castlevania - Bloodlines (USA)' },
  },
  {
    id: 'megadrive-comix-zone', title: 'Comix Zone', platform: 'megadrive',
    releaseDate: '1995-08-02', developer: 'Sega Technical Institute', publisher: 'Sega', genre: "Beat 'em up", region: 'USA',
    description: 'Comic artist Sketch Turner is trapped in his own pages and fights panel to panel to get out.',
    externalIds: { libretroName: 'Comix Zone (USA)' },
  },
];
