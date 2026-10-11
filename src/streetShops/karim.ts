import type { Game, PlatformId } from '@/catalog/types';
import { SEED_GAMES } from '@/catalog/index';
import { resaleOf } from '@/repair/consoles';
import { gameDayRandom } from '@/time/daily';
import { pick, shuffled } from '@/random';
import { STREET_SHOPS } from './rules';
import { gameWeekOf, streetShops } from './store';

/*
 * Karim at TV REPAIR (docs/household.md "Repairing a console", docs/social.md "Front Street and the arcade"): he mends
 * a console left with him (a fee, back the next game day: the kitchen table stays the cheaper way), and he swaps from
 * his box of doubles, his NES, Mega Drive and SNES spares, for one of the player's games of those he does not have.
 */

/** Karim's platforms (his person card's tastes). */
const HIS: readonly PlatformId[] = ['nes', 'megadrive', 'snes'];

/** What Karim asks to mend a broken `platform` on his bench. */
export function benchFee(platform: PlatformId): number {
  return Math.max(4, Math.round(resaleOf(platform) * STREET_SHOPS.repair.feeShare));
}

/** Karim's doubles this game week: his spares on his platforms, none the player owns, loose and played. */
export function karimDoubles(day: number, owns: (id: string) => boolean): Game[] {
  const week = gameWeekOf(day);
  return shuffled(gameDayRandom('karim.doubles', week), SEED_GAMES.filter((g) => HIS.includes(g.platform) && !g.bootleg && !owns(g.id)))
    .slice(0, STREET_SHOPS.karim.count)
    .map((g): Game => ({ ...g, status: 'owned', condition: 'noManual' }));
}

/** Whether Karim will still swap this game week. */
export function karimSwapsLeft(day: number): boolean {
  return streetShops.karimSwapsIn(gameWeekOf(day)) < STREET_SHOPS.karim.perWeek;
}

/**
 * Karim's offer on game `day`: one of his doubles for one of the player's games on his platforms (owned, givable),
 * the same all day; null when he has nothing for them or nothing of theirs tempts him.
 */
export function karimOffer(day: number, doubles: readonly Game[], mine: readonly Game[]): { his: Game; yours: Game } | null {
  const tempting = mine.filter((g) => HIS.includes(g.platform));
  if (!doubles.length || !tempting.length) return null;
  const random = gameDayRandom('karim.offer', day);
  return { his: pick(random, doubles), yours: pick(random, tempting) };
}
