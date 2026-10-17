import type { Game } from '@/catalog/types';
import type { NoticeActions } from '@/notices';
import { FELIX_LOTS } from '@/economy/felixLots';
import { addExtras } from '@/social/extras';
import { addMemory, nudge, tier } from '@/social/standing';
import type { TierId } from '@/social/types';
import { EPILOGUE_TALK } from '@/grandma/epilogueLines';
import { formatCoins } from '@/text/money';
import type { FamilyStory } from './FamilyStory';

/*
 * THE CHRISTMAS GAME BOY BOUGHT BACK (docs/grandma.md "The end of the story"): lot one of Félix's sale, a Game Boy
 * and its Tetris, went to Victor Crane. Once Mémé has told it, his conversation (wherever he is met: the hall, the
 * pavement by RETRO GAMES, the saleroom) asks after it: he names a price by how he takes to the player (a close friend
 * gives it), then sells it. It comes home as Félix's copy of Tetris for the Game Boy, his words inside the lid.
 */

const VICTOR = 'victor';

/** The game it comes home as (the seed list's). */
const TETRIS = 'gb-tetris';
const TETRIS_LOT = FELIX_LOTS.find((lot) => lot.id === TETRIS);

/** What he asks by how he stands with the player (coins); a close friend gives it. */
const PRICE: Record<TierId, number> = {
  nemesis: 360,
  hostile: 360,
  cold: 260,
  polite: 180,
  acquaintance: 180,
  friendly: 120,
  friend: 60,
  close: 0,
};

interface CraneGameBoyDeps {
  family: FamilyStory;
  wallet: { spend(coins: number): boolean };
  collection: { readonly games: readonly Game[]; add(game: Game): void };
  /** The seed games (Tetris's record). */
  pool: readonly Game[];
  notices: Pick<NoticeActions, 'reward'>;
  day(): number;
}

/** Wires the question to Crane. Call once at start-up. */
export function wireCraneGameBoy(deps: CraneGameBoyDeps): void {
  const { family } = deps;
  addExtras((ctx) => {
    if (ctx.person !== VICTOR) return [];
    const stage = family.gameBoy;
    if (stage === 'trail') return [{ id: 'victor:gameBoy', group: 'ask', label: EPILOGUE_TALK.crane.ask, run: () => ({ line: ask(deps) }) }];
    if (stage !== 'offered') return [];
    const price = priceNow(family);
    return [{ id: 'victor:gameBoyBuy', group: 'trade', label: `${EPILOGUE_TALK.crane.buy} (${formatCoins(price)})`, run: () => ({ line: buy(deps, price) }) }];
  });
}

/** What he asks now: his price as it stands, never more than he first named. */
function priceNow(family: FamilyStory): number {
  const now = PRICE[tier(VICTOR)];
  return family.price === null ? now : Math.min(now, family.price);
}

/** Asked: a close friend gives it; anyone else hears his price. */
function ask(deps: CraneGameBoyDeps): string {
  const price = priceNow(deps.family);
  if (price === 0) {
    bringHome(deps, 0);
    nudge(VICTOR, { warmth: 3, trust: 3, why: 'gave you back the Game Boy', day: deps.day(), memory: 'I gave you lot one back', memoryWeight: 10 });
    return EPILOGUE_TALK.crane.gift;
  }
  deps.family.priced(price);
  const lines = EPILOGUE_TALK.crane.price;
  return (lines[deps.day() % lines.length] ?? lines[0]).replace('{price}', formatCoins(price));
}

/** Bought at `price`, or not enough coins on the player. */
function buy(deps: CraneGameBoyDeps, price: number): string {
  if (!deps.wallet.spend(price)) return EPILOGUE_TALK.crane.short;
  bringHome(deps, price);
  addMemory(VICTOR, deps.day(), 'you bought lot one back from me', 4);
  return EPILOGUE_TALK.crane.sold;
}

/** Into the collection as Félix's copy (the parcel in the hall): his words in the lid, its receipt. */
function bringHome(deps: CraneGameBoyDeps, price: number): void {
  const { family, collection, pool, notices } = deps;
  const day = deps.day();
  const seed = pool.find((g) => g.id === TETRIS);
  if (seed) {
    // One record a game: a Tetris already on the shelves becomes his (the box is the same, the words are his).
    const had = collection.games.find((g) => g.id === TETRIS && g.status !== 'wishlist');
    collection.add({
      ...(had ?? seed),
      status: 'owned',
      condition: had?.condition ?? 'worn',
      addedAt: had?.addedAt ?? new Date().toISOString(),
      past: { kind: 'name', text: EPILOGUE_TALK.lid },
      // Its cartridge is one of the catalogue's lots too (docs/grandma.md "What the memories leave behind"): his, kept.
      ...(TETRIS_LOT ? { felixLot: TETRIS_LOT.lot } : {}),
      acquired: { price, where: EPILOGUE_TALK.where, day },
    });
  }
  family.cameHome();
  notices.reward({ ...EPILOGUE_TALK.home, ...(price ? { coins: -price } : {}), big: true });
  family.note(EPILOGUE_TALK.homeNote, 'headline');
}
