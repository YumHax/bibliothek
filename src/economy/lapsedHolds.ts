import type { Transactions } from './Transactions';

/** What the refund tells the player through: a reward with the coins back. */
interface RefundNotices {
  reward(notice: { title: string; detail: string; coins: number }): void;
}

/** The days the refund follows. */
interface RefundDays {
  readonly gameDay: number;
  onNewGameDay(cb: (day: number) => void): () => void;
}

/**
 * A hold lasts its market day: one never collected gives its deposit back the next (docs/economy.md "Holds and
 * orders"). Checked once at start and on every new game day; the player is told when coins come back.
 */
export function refundLapsedHoldsDaily(tx: Transactions, today: RefundDays, notices: RefundNotices): void {
  const refund = (): void => {
    const back = tx.refundLapsedHolds(today.gameDay);
    if (back.ok) notices.reward({ title: 'Deposit back', detail: `${back.titles.join(', ')}: not collected, so the deposit is back.`, coins: back.coins });
  };
  refund();
  today.onNewGameDay(refund);
}
