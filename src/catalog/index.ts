import type { Game } from './types';
import { NES_GAMES } from './nes';
import { SNES_GAMES } from './snes';
import { GB_GAMES } from './gb';
import { MEGADRIVE_GAMES } from './megadrive';
import { N64_GAMES } from './n64';
import { PS1_GAMES } from './ps1';

/** Every built-in game, all platforms. The CollectionStore starts from this list. */
export const SEED_GAMES: readonly Game[] = [
  ...NES_GAMES,
  ...SNES_GAMES,
  ...GB_GAMES,
  ...MEGADRIVE_GAMES,
  ...N64_GAMES,
  ...PS1_GAMES,
];
