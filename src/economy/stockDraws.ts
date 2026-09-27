import type { BoxCondition, Game, PlatformId } from '@/catalog/types';
import { gameIdFor } from '@/catalog/nointro';
import type { IndexEntry } from '@/collection/LibretroIndex';
import { CONDITION_ODDS } from './pricing';

/*
 * The draws every seller of second-hand games shares (the stalls, the bin, the job lot, the private
 * sellers): a game out of the libretro index, and the state its box is in.
 */

/** A libretro index entry as an owned copy of a game on `platform`. */
export function gameFrom(entry: IndexEntry, platform: PlatformId): Game {
  return {
    id: gameIdFor(platform, entry.name),
    title: entry.title,
    platform,
    region: entry.region,
    status: 'owned',
    externalIds: { libretroName: entry.name },
  };
}

/** Most copies are complete; some lack the manual; a few have seen better days (`CONDITION_ODDS`). */
export function drawCondition(u: number): BoxCondition {
  return u < CONDITION_ODDS.worn ? 'worn' : u < CONDITION_ODDS.worn + CONDITION_ODDS.noManual ? 'noManual' : 'complete';
}
