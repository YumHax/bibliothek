import { KEYS, PersistedStore, safeStorage } from '@/persistence';

export const WALLET_STORAGE_KEY = KEYS.wallet;

interface WalletFile {
  coins: number;
  tickets: number;
}

/**
 * The player's money: coins (what games and arcade plays cost) and arcade tickets (what the
 * cabinets pay out, exchanged for coins at the prize counter). Persisted to localStorage on every
 * change; a fresh wallet starts with `startingCoins`. Consumers `subscribe` and re-read the counts.
 */
export class Wallet {
  private state: WalletFile;
  private readonly listeners = new Set<() => void>();
  private readonly store: PersistedStore<WalletFile>;

  constructor(
    startingCoins: number,
    storage: Storage | null = safeStorage(),
    key: string = WALLET_STORAGE_KEY,
  ) {
    // Version 1: `{ coins, tickets }`. An unreadable wallet is set aside (not overwritten) before starting afresh.
    this.store = new PersistedStore<WalletFile>({ key, version: 1, storage, defaults: () => ({ coins: startingCoins, tickets: 0 }), read: readWallet });
    this.state = this.store.load();
  }

  get coins(): number {
    return this.state.coins;
  }

  get tickets(): number {
    return this.state.tickets;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  canAfford(coins: number): boolean {
    return this.state.coins >= coins;
  }

  /** Takes `coins` out; false (and nothing taken) when the wallet is short. */
  spend(coins: number): boolean {
    if (!Number.isFinite(coins) || coins < 0) return false;
    coins = Math.ceil(coins);
    if (!this.canAfford(coins)) return false;
    this.state = { ...this.state, coins: this.state.coins - coins };
    this.commit();
    return true;
  }

  /** Adds `coins` (whole coins; nothing for a non-number or a non-positive amount, so a bad sum never corrupts the save). */
  earnCoins(coins: number): void {
    if (!Number.isFinite(coins) || coins <= 0) return;
    coins = Math.floor(coins);
    if (coins <= 0) return;
    this.state = { ...this.state, coins: this.state.coins + coins };
    this.commit();
  }

  /** Adds `tickets` (whole tickets; nothing for a non-number or a non-positive amount). */
  addTickets(tickets: number): void {
    if (!Number.isFinite(tickets) || tickets <= 0) return;
    tickets = Math.floor(tickets);
    if (tickets <= 0) return;
    this.state = { ...this.state, tickets: this.state.tickets + tickets };
    this.commit();
  }

  /** Takes `tickets` out (a prize); false (and nothing taken) when the wallet is short. */
  spendTickets(tickets: number): boolean {
    if (!Number.isFinite(tickets) || tickets < 0) return false;
    tickets = Math.ceil(tickets);
    if (this.state.tickets < tickets) return false;
    this.state = { ...this.state, tickets: this.state.tickets - tickets };
    this.commit();
    return true;
  }

  /** Turns tickets into coins at `ticketsPerCoin` (every one, or at most `maxCoins` coins' worth); the remainder stays. Returns the coins gained. */
  redeemTickets(ticketsPerCoin: number, maxCoins = Infinity): number {
    if (!Number.isFinite(ticketsPerCoin) || ticketsPerCoin <= 0 || Number.isNaN(maxCoins)) return 0;
    const coins = Math.min(Math.max(0, Math.floor(maxCoins)), Math.floor(this.state.tickets / ticketsPerCoin));
    if (coins <= 0) return 0;
    this.state = { coins: this.state.coins + coins, tickets: this.state.tickets - coins * ticketsPerCoin };
    this.commit();
    return coins;
  }

  private commit(): void {
    this.store.save(this.state);
    for (const cb of this.listeners) cb();
  }
}

function readWallet(data: unknown): WalletFile | null {
  const file = data as Partial<WalletFile> | null;
  if (typeof file !== 'object' || file === null || typeof file.coins !== 'number' || typeof file.tickets !== 'number') return null;
  if (!Number.isFinite(file.coins) || !Number.isFinite(file.tickets)) return null;
  return { coins: Math.max(0, Math.floor(file.coins)), tickets: Math.max(0, Math.floor(file.tickets)) };
}
