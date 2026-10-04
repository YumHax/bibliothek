import type { Zone } from '../zone/Zone';
import type { BuildContext } from '../buildContext';
import { COFFEE_PRICE } from '@/economy/pricing';
import { Vendor } from '../people/Vendor';
import { CoffeeCart } from './CoffeeCart';
import { MARKET_PLAN } from './marketPlan';
import { formatCoins } from '@/text/money';

/** The coffee cart and its barista: a coffee a day makes the stallholders easier (see `NEGOTIATION.coffee`). */
export function furnishCoffee(zone: Zone, { listener, market: { stock: market } }: Pick<BuildContext, 'listener' | 'market'>): void {
  const plan = MARKET_PLAN.coffee;
  let barista: Vendor | null = null;
  const cart = zone.placeAt(new CoffeeCart({
    price: COFFEE_PRICE,
    label: () => (market.hadCoffee ? 'The coffee cart · you have had your coffee today' : `The coffee cart · buy a coffee (${formatCoins(COFFEE_PRICE)}: the stallholders go easier on you all day)`),
    onActivate: (session) => {
      if (market.hadCoffee) {
        barista?.speak('Another one? You’ll be haggling in your sleep.');
        session.refuse('One coffee a day is plenty.');
        return;
      }
      session.buyUpgrade({
        title: 'A coffee',
        price: COFFEE_PRICE,
        bought: () => {
          market.drinkCoffee();
          barista?.say('Enjoy!');
        },
      });
    },
  }), plan.at);
  barista = zone.place(new Vendor({ viewer: listener, seed: 53, lines: plan.lines, label: 'The barista · chat', focus: [0, 1.0, 0.5], callOuts: ['Coffee! Hot coffee!'] }), zone.toLocal(cart.localToWorld(cart.serveAt.clone())), cart.rotation.y);
}
