import type { Input } from '@/core/Input';
import type { Wallet } from '@/economy';
import type { NoticeActions } from '@/notices/types';

/** The top-row keys typed in a row: 5 0 0 0 (physical codes, so the same keys on AZERTY, Shift or not). */
const SEQUENCE = ['Digit5', 'Digit0', 'Digit0', 'Digit0'];
/** Longest pause between two keys of the code before it starts over. */
const MAX_GAP_MS = 1500;
const COINS = 5000;

/**
 * Cheat: typing 5000 anywhere but in a text field adds 5000 coins to the wallet (a reward banner
 * says so). Also `bibliothek.coins(n = 5000)` in the console.
 */
export function installMoneyCheat(input: Input, wallet: Wallet, notices: Pick<NoticeActions, 'reward'>): void {
  const grant = (coins: number): void => {
    wallet.earnCoins(coins);
    notices.reward({ title: 'Cheat!', coins });
  };
  let typed = 0;
  let last = 0;
  input.onPress((_code, e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const now = performance.now();
    if (now - last > MAX_GAP_MS) typed = 0;
    last = now;
    // The physical key: a rebound digit still types the code.
    typed = e.code === SEQUENCE[typed] ? typed + 1 : e.code === SEQUENCE[0] ? 1 : 0;
    if (typed < SEQUENCE.length) return;
    typed = 0;
    grant(COINS);
  });
  const global = globalThis as { bibliothek?: Record<string, unknown> };
  global.bibliothek = { ...global.bibliothek, coins: (coins = COINS) => grant(coins) };
}
