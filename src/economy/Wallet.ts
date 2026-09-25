export const WALLET_STORAGE_KEY = 'bibliothek.wallet.v1';

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

  constructor(
    startingCoins: number,
    private readonly storage: Storage | null = safeLocalStorage(),
    private readonly key = WALLET_STORAGE_KEY,
  ) {
    this.state = this.load() ?? { coins: startingCoins, tickets: 0 };
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
    if (coins < 0 || !this.canAfford(coins)) return false;
    this.state = { ...this.state, coins: this.state.coins - coins };
    this.commit();
    return true;
  }

  earnCoins(coins: number): void {
    if (coins <= 0) return;
    this.state = { ...this.state, coins: this.state.coins + coins };
    this.commit();
  }

  addTickets(tickets: number): void {
    if (tickets <= 0) return;
    this.state = { ...this.state, tickets: this.state.tickets + tickets };
    this.commit();
  }

  /** Takes `tickets` out (a prize); false (and nothing taken) when the wallet is short. */
  spendTickets(tickets: number): boolean {
    if (tickets < 0 || this.state.tickets < tickets) return false;
    this.state = { ...this.state, tickets: this.state.tickets - tickets };
    this.commit();
    return true;
  }

  /** Turns every ticket into coins at `ticketsPerCoin`; the remainder stays. Returns the coins gained. */
  redeemTickets(ticketsPerCoin: number): number {
    const coins = Math.floor(this.state.tickets / ticketsPerCoin);
    if (coins <= 0) return 0;
    this.state = { coins: this.state.coins + coins, tickets: this.state.tickets - coins * ticketsPerCoin };
    this.commit();
    return coins;
  }

  private commit(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.state));
    } catch (err) {
      console.warn('[wallet] could not persist', err);
    }
    for (const cb of this.listeners) cb();
  }

  private load(): WalletFile | null {
    const text = this.storage?.getItem(this.key);
    if (!text) return null;
    try {
      const file = JSON.parse(text) as Partial<WalletFile>;
      if (typeof file.coins !== 'number' || typeof file.tickets !== 'number') return null;
      return { coins: Math.max(0, Math.floor(file.coins)), tickets: Math.max(0, Math.floor(file.tickets)) };
    } catch {
      return null;
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
