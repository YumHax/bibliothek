import type { PaymentLike, UpgradeOfferLike } from './SessionActions';
import type { WalletLike } from './SessionParts';
import type { SessionHost } from './SessionHost';

export interface PurchaseParts {
  wallet?: WalletLike;
}

/** Coins paid on the spot: something for the flat (a bookcase kit, a lava lamp), a tip, a coffee. */
export class Purchases {
  constructor(private readonly parts: PurchaseParts, private readonly host: SessionHost) {}

  buyUpgrade(offer: UpgradeOfferLike): void {
    const { wallet } = this.parts;
    if (!wallet) return;
    if (!wallet.spend(offer.price)) {
      this.host.notify(`${offer.title} costs ${offer.price} coins and you have ${wallet.coins}.\nWin some at the arcade.`, 3000);
      return;
    }
    offer.bought();
    this.host.notify(`${offer.title} bought for ${offer.price} coins`, 3000);
  }

  pay(payment: PaymentLike): void {
    const { wallet } = this.parts;
    if (!wallet) return;
    if (!wallet.spend(payment.price)) {
      this.host.notify(`Your pockets are empty: ${wallet.coins} coin${wallet.coins === 1 ? '' : 's'}.`, 2500);
      return;
    }
    this.host.notify(payment.paid(), 3000);
  }
}
