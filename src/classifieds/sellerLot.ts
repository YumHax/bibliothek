import type { BoxCondition, Edition, Game, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { SEED_GAMES } from '@/catalog';
import type { IndexEntry } from '@/collection/LibretroIndex';
import type { Views } from '@/economy/Fame';
import { StockItem } from '@/economy/StockItem';
import { gameFrom } from '@/economy/stockDraws';
import { marketPrice } from '@/economy/pricing';
import { dressCopy, drawBootleg } from '@/economy/copyTraits';
import { brokenOf, type FaultId } from '@/repair/consoles';
import type { Ad } from './ads';
import { SELLERS, sellerCondition } from './rules';
import { frozenRng } from '@/random';

/** The console the games were played on, for sale broken alongside them. */
export interface ConsoleOffer {
  platform: PlatformId;
  fault: FaultId;
  price: number;
}

/** What a seller has out on the table: copies (priced like the market's, at their own discount) and maybe a console. */
export interface SellerLot {
  items: StockItem[];
  console: ConsoleOffer | null;
}

export interface SellerLotDeps {
  /** The index's plausible releases of a platform (`MarketStock.releases`). */
  releases(platform: PlatformId): Promise<readonly IndexEntry[]>;
  fame: { peek(game: Pick<Game, 'id'>): Views; lookup(game: Pick<Game, 'id' | 'title' | 'platform'>): Promise<Views> };
  owns(id: string): boolean;
}

/** Candidates drawn per copy wanted: owned games and doubles are skipped. */
const TRIES = 4;
/** A loft's box holds a bootleg this often. */
const LOFT_BOOTLEG = 0.25;

/**
 * Lays out `ad`'s lot (docs/economy.md "Small ads and the seller's flat"), the same every time for the same ad (its
 * own seeds): its platform's games (a mix for a mover or a loft), in the states its seller keeps them, dressed as
 * second-hand copies (`copyTraits.dressCopy`: a sealed one, a name in marker...), priced as the market prices them at
 * the seller's discount (a loft's per copy: they have no idea), less what the player owns or bought from them already.
 * A scripted ad's lot is its own list of games. The console comes with it at its seller's odds.
 */
export async function drawLot(ad: Ad, deps: SellerLotDeps, bought: readonly string[]): Promise<SellerLot> {
  const profile = SELLERS[ad.kind];
  const rng = frozenRng(`${ad.seed}:lot`);
  const [min, max] = profile.lot;
  const count = min + Math.floor(rng() * (max - min + 1));
  const platforms = ad.platform ? [ad.platform] : pickPlatforms(rng);
  const gone = new Set(bought);
  // The candidates are drawn without looking at the collection (the same list across reloads); the lot is the first
  // `count` of them the player did not already own, a copy bought from this seller keeping its place (so buying one and
  // coming back never brings another out of the box).
  const games = ad.scripted?.games
    ? scriptedGames(ad.scripted.games)
    : (await drawGames(platforms, count, deps, rng)).filter((g) => gone.has(g.id) || !deps.owns(g.id)).slice(0, count);
  if (ad.kind === 'loft' && !ad.scripted?.games && rng() < LOFT_BOOTLEG) {
    const bootleg = drawBootleg(frozenRng(`${ad.seed}:bootleg`), platforms[0], { condition: 'noManual' });
    if (bootleg) games.push(bootleg);
  }
  const items: StockItem[] = [];
  const taken = new Set<string>();
  for (const game of games) {
    if (taken.has(game.id) || gone.has(game.id) || deps.owns(game.id)) continue;
    taken.add(game.id);
    items.push(priced(ad, game, deps));
  }
  const consoleRng = frozenRng(`${ad.seed}:console`);
  const hasConsole = consoleRng() < profile.console;
  const consolePlatform = platforms[Math.floor(consoleRng() * platforms.length)] ?? platforms[0]!;
  const broken = brokenOf(consolePlatform, consoleRng(), consoleRng());
  return { items, console: hasConsole ? { platform: consolePlatform, ...broken } : null };
}

/** One copy of the lot: its state, edition and dressing from seeds of its own, at the seller's price. */
function priced(ad: Ad, entry: Game, deps: SellerLotDeps): StockItem {
  const profile = SELLERS[ad.kind];
  const rng = frozenRng(`${ad.seed}:${entry.id}`);
  const condition: BoxCondition = entry.condition && entry.condition !== 'complete' ? entry.condition : sellerCondition(rng(), profile.condition);
  const edition: Edition = rng() < profile.firstPrint ? 'firstPrint' : 'standard';
  const [lo, hi] = profile.discount;
  const discount = lo + rng() * (hi - lo);
  const game = entry.variant || entry.past ? entry : dressCopy(frozenRng(`${ad.seed}:${entry.id}:dress`), entry, { condition, kind: ad.kind === 'collector' ? 'collector' : 'ordinary' });
  const known = deps.fame.peek(game);
  const settle = known !== undefined ? undefined : deps.fame.lookup(game).then((views) => marketPrice(game, views, condition, discount, edition));
  return new StockItem(game, condition, 'stall', { list: marketPrice(game, known, condition, discount, edition), final: known !== undefined, settle }, { edition });
}

/** Two or three platforms for a mixed lot. */
function pickPlatforms(rng: () => number): PlatformId[] {
  const ids = PLATFORM_LIST.map((p) => p.id);
  const n = 2 + Math.floor(rng() * 2);
  const picked: PlatformId[] = [];
  while (picked.length < n) {
    const id = ids[Math.floor(rng() * ids.length)]!;
    if (!picked.includes(id)) picked.push(id);
  }
  return picked;
}

async function drawGames(platforms: readonly PlatformId[], count: number, deps: SellerLotDeps, rng: () => number): Promise<Game[]> {
  const pools = await Promise.all(platforms.map((p) => deps.releases(p).catch(() => [] as readonly IndexEntry[])));
  const games: Game[] = [];
  for (let i = 0; i < count * TRIES; i++) {
    const at = Math.floor(rng() * platforms.length);
    const pool = pools[at]!;
    const entry = pool[Math.floor(rng() * pool.length)];
    if (!entry) continue;
    const game = gameFrom(entry, platforms[at]!);
    if (games.some((g) => g.id === game.id)) continue;
    games.push(game);
  }
  return games;
}

/** A scripted lot's games, from the built-in list (an unknown id is skipped). */
function scriptedGames(ids: readonly string[]): Game[] {
  return ids.map((id) => SEED_GAMES.find((g) => g.id === id)).filter((g): g is Game => !!g).map((g) => ({ ...g, status: 'owned' as const }));
}
