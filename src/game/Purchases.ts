import { playCoins } from '@/audio/coins';
import { ARM_ABOVE, purchaseClinks } from '@/economy/pricing';
import { Transactions } from '@/economy/Transactions';
import { Arming } from '@/ui/confirmTwice';
import { useVerb } from '@/ui/verb';
import type { PaymentLike, UpgradeOfferLike } from './SessionActions';
import type { WalletLike } from './SessionParts';
import type { SessionHost } from './SessionHost';
import { formatCoins } from '@/text/money';

export interface PurchaseParts {
  wallet?: WalletLike;
}

/**
 * Coins paid on the spot: something for the flat (a bookcase kit, a lava lamp, a shop's piece), a tip, a coffee. A
 * piece dearer than `ARM_ABOVE` asks for a second click within `CONFIRM_MS` (the same rule as a shop's tag and till);
 * then the coins and the piece are saved as one (`Transactions.buyHomeGood`), with the same clink and reward everywhere.
 */
export class Purchases {
  /** The dear piece whose next click buys it, keyed by its title (nothing to repaint: the reaction says it). */
  private readonly arming = new Arming<string>(() => {});

  constructor(private readonly parts: PurchaseParts, private readonly host: SessionHost) {}

  buyUpgrade(offer: UpgradeOfferLike): void {
    const { wallet } = this.parts;
    if (!wallet) return;
    if (wallet.coins < offer.price) {
      this.arming.reset();
      this.refuseShort(offer, wallet.coins);
      return;
    }
    if (offer.price > ARM_ABOVE && !offer.confirmed && !this.arming.press(offer.title)) {
      this.host.react(`${offer.title} · ${formatCoins(offer.price)}: ${useVerb()} again to buy`);
      return;
    }
    this.arming.reset();
    const result = new Transactions({ wallet }).buyHomeGood(offer);
    if (!result.ok) {
      this.refuseShort(offer, wallet.coins);
      return;
    }
    playCoins(purchaseClinks(offer.price));
    this.host.slip({ title: `${offer.title}: yours`, ...(offer.detail ? { detail: offer.detail } : {}), coins: -offer.price });
  }

  pay(payment: PaymentLike): void {
    const { wallet } = this.parts;
    if (!wallet) return;
    if (!wallet.spend(payment.price)) {
      const coins = `${formatCoins(payment.price)}`;
      this.host.refuse(wallet.coins === 0 ? `It costs ${coins} and your pockets are empty.` : `It costs ${coins} and you have ${formatCoins(wallet.coins)}.`);
      return;
    }
    // Coins changed hands with no fanfare: a slip with the coin chip, what was bought as its title, the line (and what it changed) under it.
    const [story = '', ...effect] = payment.paid().split('\n');
    const detail = [payment.title ? story : '', ...effect].filter(Boolean).join(' ');
    this.host.slip({ title: payment.title ?? story, ...(detail ? { detail } : {}), ...(payment.price > 0 ? { coins: -payment.price } : {}) });
  }

  private refuseShort(offer: UpgradeOfferLike, coins: number): void {
    this.host.refuse(`${offer.title} costs ${formatCoins(offer.price)} and you have ${coins}.`);
    this.host.tip('Short of coins? Tickets become coins at the arcade’s prize counter.', { id: 'short-of-coins', head: 'Coins', times: 3 });
  }
}
