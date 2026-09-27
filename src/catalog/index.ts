import type { Game } from './types';
import { gameIdFor } from './nointro';
import { NES_GAMES } from './nes';
import { SNES_GAMES } from './snes';
import { GB_GAMES } from './gb';
import { MEGADRIVE_GAMES } from './megadrive';
import { N64_GAMES } from './n64';
import { PS1_GAMES } from './ps1';

/** The built-in lists as written, with their hand-made ids ('nes-super-mario-bros'). */
const LISTED: readonly Game[] = [
  ...NES_GAMES,
  ...SNES_GAMES,
  ...GB_GAMES,
  ...MEGADRIVE_GAMES,
  ...N64_GAMES,
  ...PS1_GAMES,
];

/** The id a game goes by everywhere: the one the libretro index gives it (`gameIdFor`) when it has a libretro name. */
function canonicalId(game: Game): string {
  const name = game.externalIds?.libretroName;
  return name ? gameIdFor(game.platform, name) : game.id;
}

/**
 * The built-in lists' hand-made ids -> the canonical id of the same game. Saves from before the
 * ids were unified hold the old ones; every store maps them on load (`canonicalGameId`).
 */
export const LEGACY_SEED_IDS: ReadonlyMap<string, string> = new Map(
  LISTED.map((g) => [g.id, canonicalId(g)] as const).filter(([from, to]) => from !== to),
);

/**
 * Every built-in game, all platforms, under the id the market's index gives it, so a seed copy
 * and a stall copy of one game are one game (`owns` sees either). The CollectionStore starts from
 * this list under `?debug`; the mystery prize and the stalls' showpieces draw from it.
 */
export const SEED_GAMES: readonly Game[] = LISTED.map((g) => ({ ...g, id: canonicalId(g) }));

/**
 * What a new game's collection starts with: one game (its console stands under the TV), so the TV has something to play
 * on the first evening. The rest is earned at the arcade and bought at the market.
 */
export const STARTER_GAMES: readonly Game[] = SEED_GAMES.filter((g) => g.platform === 'nes' && g.title === 'Super Mario Bros.');

/** `id`, or the canonical id when it is one of the built-in lists' old hand-made ids. */
export function canonicalGameId(id: string): string {
  return LEGACY_SEED_IDS.get(id) ?? id;
}
