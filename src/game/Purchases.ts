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
      this.host.refuse(`${offer.title} costs ${offer.price} coins and you have ${wallet.coins}.`);
      this.host.tip('Short of coins? The arcade pays in tickets: change them for coins at its prize counter.', { id: 'short-of-coins' });
      return;
    }
    offer.bought();
    this.host.reward({ title: `${offer.title}: yours`, coins: -offer.price });
  }

  pay(payment: PaymentLike): void {
    const { wallet } = this.parts;
    if (!wallet) return;
    if (!wallet.spend(payment.price)) {
      this.host.refuse(`Your pockets are empty: ${wallet.coins} coin${wallet.coins === 1 ? '' : 's'}.`);
      return;
    }
    // A line with an effect under it (the coffee's "they will go easier on you") is a card to read, else a reaction.
    const [story = '', ...effect] = payment.paid().split('\n');
    if (effect.length) this.host.read({ text: story, effect: effect.join('\n') });
    else this.host.react(story);
  }
}
