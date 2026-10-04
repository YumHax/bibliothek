import type { Game, PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { homeGood, type HomeUpgrade } from './homeGoods';
import { isImport } from './pricing';

/**
 * Japanese copies and the player's western consoles: a Famicom cartridge has 60 pins to the NES's 72, a Super
 * Famicom or a Japanese N64 cartridge is shaped to miss the console's tabs, a Japanese PlayStation disc does not boot.
 * Each platform's converter (`HOME_GOODS`, sold at TV REPAIR) lets them play; the Game Boy was never region-locked.
 */
export const CONVERTER_OF: Readonly<Record<PlatformId, HomeUpgrade | null>> = {
  nes: 'famicomAdapter',
  snes: 'superFamicomAdapter',
  megadrive: 'megaDriveConverter',
  n64: 'n64Passthrough',
  ps1: 'ps1ModChip',
  gb: null,
};

/** What a screen asks before it plays a copy: why it cannot (a refusal), or null when it can. */
export type RegionLock = (game: Game) => string | null;

/**
 * Copies added before the lock came in (the 2026-10 build) keep playing as they always did: a save never loses
 * something it had. Real time, like `Game.addedAt`; a copy without one counts as old.
 */
const LOCKED_FROM = '2026-10-02T00:00:00.000Z';

/** Whether `game` came into the collection before region locking existed. */
function grandfathered(game: Game): boolean {
  return game.addedAt === undefined || game.addedAt < LOCKED_FROM;
}

/** The lock for a flat where `owns` says which converters were bought. */
function regionLock(owns: (upgrade: HomeUpgrade) => boolean): RegionLock {
  return (game) => {
    if (!isImport(game) || grandfathered(game)) return null;
    const converter = CONVERTER_OF[game.platform];
    if (!converter || owns(converter)) return null;
    const platform = getPlatform(game.platform).shortName;
    return `A Japanese copy: it won’t run on your ${platform} without a ${homeGood(converter).name} (TV REPAIR, Park Street)`;
  };
}

/** The flat's lock, from what it bought (`HomeUpgrades`); null without a record of it (nothing is locked). */
export function regionLockFor(upgrades: { has(upgrade: HomeUpgrade): boolean } | undefined): RegionLock | null {
  return upgrades ? regionLock((u) => upgrades.has(u)) : null;
}
