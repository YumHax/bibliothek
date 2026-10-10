import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { getPrize } from '@/economy/Prizes';
import { isGrail } from '@/economy/grails';
import { HOME_GOODS } from '@/economy/homeGoods';
import type { Journal } from './Journal';
import { formatCoins } from '@/text/money';

/*
 * The stores the journal writes itself from, by what they already tell anyone (their counts and a
 * `subscribe`): each change is compared with the last one seen, so no store knows the journal.
 */

interface WatchedWallet {
  readonly coins: number;
  readonly tickets: number;
  subscribe(cb: () => void): () => void;
}

interface WatchedCollection {
  readonly games: readonly Game[];
  /** 'import': a file was loaded (one line for it, not one per game). */
  readonly lastChange?: 'import' | 'edit';
  subscribe(cb: () => void): () => void;
}

interface WatchedParcel {
  isPending(id: string): boolean;
  readonly pending: readonly Game[];
  subscribe(cb: () => void): () => void;
}

interface WatchedPrizes {
  readonly owned: readonly { id: string }[];
  subscribe(cb: () => void): () => void;
}

interface WatchedMedals {
  readonly total: number;
  subscribe(cb: () => void): () => void;
}

interface WatchedHome {
  count(id: (typeof HOME_GOODS)[number]['id']): number;
  subscribe(cb: () => void): () => void;
}

interface WatchedLeague {
  readonly playedToday: boolean;
  readonly streakDays: number;
  readonly pennants: number;
  subscribe(cb: () => void): () => void;
}

interface JournalSources {
  /** What the flat has been bought (`HomeUpgrades`): a line for each piece. */
  home?: WatchedHome;
  /** The arcade's week (`ArcadeLeague`): the day's first play, a won pennant. */
  league?: WatchedLeague;
  wallet?: WatchedWallet;
  collection?: WatchedCollection;
  deliveries?: WatchedParcel;
  prizes?: WatchedPrizes;
  medals?: WatchedMedals;
}

/** More games than this arriving in one change is an import, noted as one line. */
const BULK = 5;

/** Starts writing the day from the stores; returns the unsubscribe. */
export function watchForJournal(journal: Journal, sources: JournalSources): () => void {
  const stops: (() => void)[] = [];
  const { wallet, collection, deliveries, prizes, medals, home, league } = sources;

  if (home) {
    let counts = new Map(HOME_GOODS.map((g) => [g.id, home.count(g.id)]));
    stops.push(home.subscribe(() => {
      const now = new Map(HOME_GOODS.map((g) => [g.id, home.count(g.id)]));
      for (const good of HOME_GOODS) {
        const more = (now.get(good.id) ?? 0) - (counts.get(good.id) ?? 0);
        // The bookcases the collection starts with are not bought: only what a shop sold is noted.
        if (more > 0 && more <= 2) journal.note('home', good.id === 'cat' ? `Adopted a cat (${formatCoins(good.price)})` : `For the flat: ${good.name.toLowerCase()} (${formatCoins(good.price)})`, { weight: good.id === 'cat' ? 'headline' : 'line', data: { id: good.id } });
      }
      counts = now;
    }));
  }

  if (league) {
    let played = league.playedToday;
    let pennants = league.pennants;
    stops.push(league.subscribe(() => {
      if (league.playedToday && !played) journal.note('arcade', league.streakDays >= 2 ? `Arcade, day ${league.streakDays} in a row` : 'Arcade', { weight: 'note' });
      if (league.pennants > pennants) journal.note('arcade', 'Won the week’s league: the pennant is home', { weight: 'headline' });
      played = league.playedToday;
      pennants = league.pennants;
    }));
  }

  if (wallet) {
    let coins = wallet.coins;
    let tickets = wallet.tickets;
    stops.push(wallet.subscribe(() => {
      const dc = wallet.coins - coins;
      const dt = wallet.tickets - tickets;
      coins = wallet.coins;
      tickets = wallet.tickets;
      if (dc > 0) journal.tally('coinsIn', dc);
      else if (dc < 0) journal.tally('coinsOut', -dc);
      if (dt > 0) journal.tally('ticketsIn', dt);
      else if (dt < 0) journal.tally('ticketsOut', -dt);
    }));
  }

  if (collection) {
    let known = statusMap(collection.games);
    let titles = new Map(collection.games.map((g) => [g.id, g.title]));
    stops.push(collection.subscribe(() => {
      const now = statusMap(collection.games);
      const arrived: Game[] = [];
      const wished: Game[] = [];
      const left: string[] = [];
      for (const game of collection.games) {
        const before = known.get(game.id);
        const owned = game.status !== 'wishlist';
        if (before === undefined) (owned ? arrived : wished).push(game);
        else if (before === 'wishlist' && owned) arrived.push(game);
      }
      for (const [id, status] of known) if (!now.has(id) && status !== 'wishlist') left.push(id);
      const oldTitles = titles;
      titles = new Map(collection.games.map((g) => [g.id, g.title]));
      known = now;

      if (collection.lastChange === 'import' || arrived.length > BULK) {
        if (arrived.length) journal.note('note', `Brought ${arrived.length} games in at once`);
        journal.tally('gamesIn', arrived.length);
        return;
      }
      for (const game of arrived) {
        journal.tally('gamesIn', 1);
        // A game given (a friend's thank-you: `acquired.where` "a gift from Sam") is a gift, not a purchase.
        // The title alone: the panel groups the day's purchases under their stall and shows the price from `data`.
        const giver = /^a gift from (.+)$/i.exec(game.acquired?.where ?? '')?.[1];
        const platform = platformShortName(game);
        if (giver) journal.note('gift', `${game.title}, from ${giver}`, { weight: 'headline', data: { id: game.id, platform, who: giver } });
        else journal.note('bought', game.title, { weight: isGrail(game.id) ? 'headline' : 'line', data: { id: game.id, platform, ...(game.acquired ? { where: game.acquired.where, ...(game.acquired.price > 0 ? { price: game.acquired.price } : {}) } : {}) } });
      }
      for (const game of wished) journal.note('wished', `Wishlist: ${game.title}`, { weight: 'note', data: { id: game.id } });
      for (const id of left) {
        journal.tally('gamesOut', 1);
        journal.note('sold', `Parted with ${oldTitles.get(id) ?? 'a game'}`, { data: { id } });
      }
    }));

    if (deliveries) {
      let waiting = new Set(deliveries.pending.map((g) => g.id));
      stops.push(deliveries.subscribe(() => {
        const still = new Set(deliveries.pending.map((g) => g.id));
        const owned = new Set(collection.games.map((g) => g.id));
        const unpacked = [...waiting].filter((id) => !still.has(id) && owned.has(id));
        waiting = still;
        if (!unpacked.length) return;
        const names = unpacked.map((id) => collection.games.find((g) => g.id === id)?.title ?? id);
        journal.note('unpacked', names.length <= 2 ? `Unpacked: ${names.join(', ')}` : `Unpacked ${names.length} games`);
      }));
    }
  }

  if (prizes) {
    let count = prizes.owned.length;
    stops.push(prizes.subscribe(() => {
      const fresh = prizes.owned.slice(count);
      count = prizes.owned.length;
      for (const { id } of fresh) journal.note('prize', `Prize: the ${getPrize(id)?.name ?? 'prize'}`, { weight: 'headline', data: { id } });
    }));
  }

  if (medals) {
    let total = medals.total;
    stops.push(medals.subscribe(() => {
      const won = medals.total - total;
      total = medals.total;
      // A round ten is worth the page's large hand; the medals between are the small things.
      if (won > 0) journal.note('medal', won === 1 ? `An arcade medal (${total} in all)` : `${won} arcade medals (${total} in all)`, { weight: total % 10 === 0 ? 'headline' : 'note' });
    }));
  }

  return () => stops.forEach((stop) => stop());
}

function statusMap(games: readonly Game[]): Map<string, string> {
  return new Map(games.map((g) => [g.id, g.status ?? 'owned']));
}

function platformShortName(game: Game): string {
  try {
    return getPlatform(game.platform).shortName;
  } catch {
    return game.platform;
  }
}
