import type { BoxCondition, Game, PlatformId } from '@/catalog/types';
import type { IndexEntry } from '@/collection/LibretroIndex';
import type { Fame, Views } from '@/economy/Fame';
import { StockItem, type StockSource, type StockTraits } from '@/economy/StockItem';
import { gameFrom } from '@/economy/stockDraws';
import { frozenRng } from '@/random';

/*
 * Copies the building's own sellers put out (a neighbour's shelf, the estate sale in the hall): games drawn from the
 * index by a fixed seed (the same every visit), priced by their fame once it is known, through the market's one
 * `Fame` (`BuildContext.market.fame`), so nothing is asked twice.
 */

/** What prices a copy: how well known its game is, now or once looked up. */
export type CopyFame = Pick<Fame, 'peek' | 'lookup'>;

/** Where the building's sellers draw their games from: the market's index of releases per platform. */
export interface ReleasePool {
  releases(platform: PlatformId): Promise<readonly IndexEntry[]>;
}

/**
 * `count` different games drawn by `seed` from `platforms` in turn (one platform after the other, so a shelf of two
 * platforms is half and half), skipping `skip`'s ids. Fewer when the index cannot be had (offline).
 */
export async function drawGames(pool: ReleasePool, seed: string, platforms: readonly PlatformId[], count: number, skip: (id: string) => boolean = () => false): Promise<Game[]> {
  const rng = frozenRng(seed);
  const games: Game[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < count * 4 && games.length < count; i++) {
    const platform = platforms[i % platforms.length]!;
    const entries = await pool.releases(platform).catch(() => [] as readonly IndexEntry[]);
    const entry = entries[Math.floor(rng() * entries.length)];
    if (!entry) continue;
    const game = gameFrom(entry, platform);
    if (ids.has(game.id) || skip(game.id)) continue;
    ids.add(game.id);
    games.push(game);
  }
  return games;
}

/**
 * A copy of `game` for sale at `price(views)` once its fame is known (`guess` until then; the tag says "being
 * priced" and nothing may be bought before), from `source`, with `traits`.
 */
export function pricedCopy(fame: CopyFame, game: Game, condition: BoxCondition, source: StockSource, price: (views: Views) => number, traits: StockTraits = {}): StockItem {
  const known = fame.peek(game);
  if (known !== undefined) return new StockItem(game, condition, source, { list: price(known), final: true }, traits);
  return new StockItem(game, condition, source, { list: price(null), final: false, settle: fame.lookup(game).then(price, () => undefined) }, traits);
}
