import type { Game } from '@/catalog/types';
import type { NoticeActions } from '@/notices';
import { gameDayRandom } from '@/time/daily';

/*
 * What the building's perks need of the game (`wireBuildingPerks`, from `bootstrap/world`), and the one way they give
 * games: from the seed catalogue, games the player has not got, added with where they came from (so the parcel, the
 * journal and the shelves treat them as any gift).
 */

/** A note slipped under the flat's door (`hallway/Doorstep.slipNote`). */
interface PerkNote {
  title: string;
  lines: string[];
  accent?: number;
  seed?: number;
}

/** Coins given for each game of a gift the player already had every candidate of. */
const GIFT_INSTEAD_COINS = 40;

export interface PerkDeps {
  collection: { readonly games: readonly Game[]; has(id: string): boolean; add(game: Game): void; addMany(games: readonly Game[]): void };
  wallet: { readonly coins: number; earnCoins(coins: number): void; spend(coins: number): boolean };
  notices: NoticeActions;
  day(): number;
  hour(): number;
  /** Every game the catalogue knows offline (the seed): where gifts are drawn from. */
  pool: readonly Game[];
  slipNote(note: PerkNote): void;
}

/**
 * Draws up to `count` games of `pool` the player has not got that pass `fits`, the same ones for the same `seed`,
 * and adds them to the collection as given by `where` on the game day. Returns what was given.
 */
export function giveGames(deps: PerkDeps, seed: string, count: number, where: string, fits: (game: Game) => boolean): Game[] {
  const random = gameDayRandom(seed, 0);
  const unowned = deps.pool.filter((g) => !deps.collection.has(g.id) && !g.bootleg);
  const picked: Game[] = [];
  // Their kind of game first; short of those, any game the player has not got; short of any, coins (a gift is never lost).
  for (const candidates of [unowned.filter(fits), unowned]) {
    const left = candidates.filter((g) => !picked.includes(g));
    while (picked.length < count && left.length) picked.push(left.splice(Math.floor(random() * left.length), 1)[0]!);
  }
  if (picked.length < count) {
    const coins = (count - picked.length) * GIFT_INSTEAD_COINS;
    deps.wallet.earnCoins(coins);
    deps.notices.reward({ title: `A gift (${where})`, detail: 'You already had every game they could think of, so they gave you something towards the next one.', coins });
  }
  if (!picked.length) return picked;
  const day = deps.day();
  deps.collection.addMany(picked.map((g) => ({ ...g, status: 'owned' as const, condition: 'noManual' as const, acquired: { price: 0, where, day } })));
  return picked;
}

/** A game's year, or null. */
export function yearOf(game: Pick<Game, 'releaseDate'>): number | null {
  const y = Number(game.releaseDate?.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}
