import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { getPrize } from '@/economy/Prizes';
import type { Journal } from './Journal';

/*
 * The stores the journal writes itself from, by what they already tell anyone (their counts and a
 * `subscribe`): each change is compared with the last one seen, so no store knows the journal.
 */

export interface WatchedWallet {
  readonly coins: number;
  readonly tickets: number;
  subscribe(cb: () => void): () => void;
}

export interface WatchedCollection {
  readonly games: readonly Game[];
  /** 'import': a file was loaded (one line for it, not one per game). */
  readonly lastChange?: 'import' | 'edit';
  subscribe(cb: () => void): () => void;
}

export interface WatchedParcel {
  isPending(id: string): boolean;
  readonly pending: readonly Game[];
  subscribe(cb: () => void): () => void;
}

export interface WatchedPrizes {
  readonly owned: readonly { id: string }[];
  subscribe(cb: () => void): () => void;
}

export interface WatchedMedals {
  readonly total: number;
  subscribe(cb: () => void): () => void;
}

export interface JournalSources {
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
  const { wallet, collection, deliveries, prizes, medals } = sources;

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
        if (arrived.length) journal.note('note', `Brought ${arrived.length} games into the collection at once`);
        journal.tally('gamesIn', arrived.length);
        return;
      }
      for (const game of arrived) {
        journal.tally('gamesIn', 1);
        journal.note('bought', `Got ${game.title} (${platformName(game)})`, { id: game.id });
      }
      for (const game of wished) journal.note('wished', `Put ${game.title} on the wishlist`, { id: game.id });
      for (const id of left) {
        journal.tally('gamesOut', 1);
        journal.note('sold', `Parted with ${oldTitles.get(id) ?? 'a game'}`, { id });
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
        journal.note('unpacked', names.length <= 3 ? `Unpacked ${names.join(', ')} onto the shelves` : `Unpacked ${names.length} games onto the shelves`);
      }));
    }
  }

  if (prizes) {
    let count = prizes.owned.length;
    stops.push(prizes.subscribe(() => {
      const fresh = prizes.owned.slice(count);
      count = prizes.owned.length;
      for (const { id } of fresh) journal.note('prize', `Took home the ${getPrize(id)?.name ?? 'prize'}`, { id });
    }));
  }

  if (medals) {
    let total = medals.total;
    stops.push(medals.subscribe(() => {
      const won = medals.total - total;
      total = medals.total;
      if (won > 0) journal.note('medal', won === 1 ? `A new arcade medal (${total} in all)` : `${won} new arcade medals (${total} in all)`);
    }));
  }

  return () => stops.forEach((stop) => stop());
}

function statusMap(games: readonly Game[]): Map<string, string> {
  return new Map(games.map((g) => [g.id, g.status ?? 'owned']));
}

function platformName(game: Game): string {
  try {
    return getPlatform(game.platform).name;
  } catch {
    return game.platform;
  }
}
