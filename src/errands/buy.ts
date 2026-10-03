import type { SessionActions } from '@/game/SessionActions';
import type { Errand } from './errands';
import { pocket } from './pocket';

/**
 * Buys `errand` over a counter: refused past the shop's daily limit (`said` is the shop's word for it) or with the
 * pocket full, else paid (`SessionActions.pay`) and put in the pocket. `onBought` follows the sale (the clerk's thanks).
 */
export function buyErrand(session: SessionActions, errand: Errand, said: string, onBought?: () => void): void {
  if (pocket.boughtToday(errand.id) >= errand.perDay) {
    session.refuse(`${said} No more today.`);
    return;
  }
  if (pocket.count(errand.id) >= errand.max) {
    session.refuse(`You are carrying ${pocket.count(errand.id)} already: use them first.`);
    return;
  }
  session.pay({
    price: errand.price,
    paid: () => {
      pocket.recordBuy(errand.id);
      pocket.add(errand.id, errand.portions, errand.max);
      onBought?.();
      return errand.bought;
    },
  });
}
