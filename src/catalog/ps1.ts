import type { Game } from './types';

/** Seed data — PlayStation. `libretroName`s verified against libretro-thumbnails. */
export const PS1_GAMES: Game[] = [
  {
    id: 'ps1-final-fantasy-7', title: 'Final Fantasy VII', platform: 'ps1',
    releaseDate: '1997-09-07', developer: 'Square', publisher: 'Sony Computer Entertainment', genre: 'RPG', region: 'USA',
    description: 'Cloud Strife joins AVALANCHE against the Shinra corporation and ends up chasing Sephiroth across the planet.',
    externalIds: { libretroName: 'Final Fantasy VII (USA)' },
  },
  {
    id: 'ps1-metal-gear-solid', title: 'Metal Gear Solid', platform: 'ps1',
    releaseDate: '1998-10-21', developer: 'Konami Computer Entertainment Japan', publisher: 'Konami', genre: 'Stealth action', region: 'USA',
    description: 'Solid Snake infiltrates Shadow Moses Island to stop FOXHOUND launching a nuclear strike.',
    externalIds: { libretroName: 'Metal Gear Solid (USA)' },
  },
  {
    id: 'ps1-castlevania-sotn', title: 'Castlevania: Symphony of the Night', platform: 'ps1',
    releaseDate: '1997-10-02', developer: 'Konami Computer Entertainment Tokyo', publisher: 'Konami', genre: 'Action RPG', region: 'USA',
    description: 'Alucard explores a sprawling, non-linear Castle Dracula — and then its inverted twin.',
    externalIds: { libretroName: 'Castlevania - Symphony of the Night (USA)' },
  },
  {
    id: 'ps1-crash-bandicoot', title: 'Crash Bandicoot', platform: 'ps1',
    releaseDate: '1996-09-09', developer: 'Naughty Dog', publisher: 'Sony Computer Entertainment', genre: 'Platformer', region: 'USA',
    description: 'Crash spins and jumps across three islands to foil Dr. Neo Cortex and rescue Tawna.',
    externalIds: { libretroName: 'Crash Bandicoot (USA)' },
  },
  {
    id: 'ps1-resident-evil', title: 'Resident Evil', platform: 'ps1',
    releaseDate: '1996-03-30', developer: 'Capcom', publisher: 'Capcom', genre: 'Survival horror', region: 'USA',
    description: 'S.T.A.R.S. members Jill and Chris are trapped in the Spencer Mansion with the results of Umbrella’s T-Virus.',
    externalIds: { libretroName: 'Resident Evil (USA)' },
  },
  {
    id: 'ps1-tekken-3', title: 'Tekken 3', platform: 'ps1',
    releaseDate: '1998-04-29', developer: 'Namco', publisher: 'Namco', genre: 'Fighting', region: 'USA',
    description: 'Jin Kazama enters the King of Iron Fist Tournament 3; sidestepping and Tekken Force mode arrive.',
    externalIds: { libretroName: 'Tekken 3 (USA)' },
  },
  {
    id: 'ps1-gran-turismo', title: 'Gran Turismo', platform: 'ps1',
    releaseDate: '1998-04-30', developer: 'Polyphony Digital', publisher: 'Sony Computer Entertainment', genre: 'Racing simulation', region: 'USA',
    description: 'Earn licences, buy and tune real production cars and race them in the first "real driving simulator".',
    externalIds: { libretroName: 'Gran Turismo (USA)' },
  },
  {
    id: 'ps1-spyro-the-dragon', title: 'Spyro the Dragon', platform: 'ps1',
    releaseDate: '1998-09-09', developer: 'Insomniac Games', publisher: 'Sony Computer Entertainment', genre: 'Platformer', region: 'USA',
    description: 'A small purple dragon glides across six homeworlds to free the elder dragons Gnasty Gnorc turned to crystal.',
    externalIds: { libretroName: 'Spyro the Dragon (USA)' },
  },
];
