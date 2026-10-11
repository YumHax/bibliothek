import * as THREE from 'three';
import type { SessionActions } from '@/game/SessionActions';
import type { ModalLike } from '@/game/SessionParts';
import { Walker } from '../../people/Walker';
import { randomLook } from '../../people/looks';
import { COVER_CARDS, STREET_SHOPS } from '@/streetShops/rules';
import { streetShops } from '@/streetShops/store';
import { SET_PRIZE, cardIn, keepIssue, setComplete } from '@/streetShops/newsagent';
import { formatCoins } from '@/text/money';
import type { CounterDeal, CounterRow, CounterSection } from '@/ui/streetShops/CounterPanel';
import { NEWSAGENT_AT } from '../Newsstand';

interface NewsagentOptions {
  viewer: THREE.Object3D;
  /** The kiosk's centre (zone-local, on the pavement) and the way its hatch faces. */
  kiosk: { at: THREE.Vector3; yaw: number };
  /** Puts a walker in the street (the people budget, fades): the zone's `placeWalker`. */
  place: (walker: Walker, at: THREE.Vector3) => void;
  counter: ModalLike & { show(deal: CounterDeal): void };
  day: () => number;
  purse: { readonly coins: number; spend(coins: number): boolean; earnCoins(coins: number): void };
}

/**
 * The newsagent in the kiosk on Front Street (docs/economy.md "Front Street's shops and finds"): reading the paper at
 * her hatch, she sells today's GAMING WEEKLY to keep (a coin; every other issue has a cover card in it, one of a set of
 * twelve), a subscription that puts it on the flat's doormat every morning, and pays out once for the full set of
 * cards. The papers pegged round the hatch are still read free (`Newsstand`). A walker that stands in the hatch.
 */
export function placeNewsagent(options: NewsagentOptions): Walker {
  const look = randomLook(1301, 'vendor');
  const walker = new Walker({
    viewer: options.viewer,
    seed: 1301,
    look,
    fade: true,
    social: {
      caption: () => 'The newsagent · the paper, the cards, a subscription',
      open: (session) => {
        options.counter.show(kioskDeal(options, session));
        session.openPanel(options.counter);
        return true;
      },
    },
  });
  const { at, yaw } = options.kiosk;
  const spot = at.clone().add(new THREE.Vector3(NEWSAGENT_AT.x, 0, NEWSAGENT_AT.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
  options.place(walker, spot);
  walker.stand(yaw, 'read');
  return walker;
}

function kioskDeal(options: NewsagentOptions, session: SessionActions): CounterDeal {
  const { purse, day } = options;
  const { paper } = STREET_SHOPS;
  return {
    title: 'THE KIOSK',
    says: () => (setComplete() ? '“The whole set? Twelve cards? Let me see that.”' : '“The Weekly’s a coin. Every other one has a card in it, they all want those.”'),
    coins: () => purse.coins,
    sections: () => sections(day()),
    take: (id) => {
      const today = day();
      if (id === 'issue') {
        if (!purse.spend(paper.price)) return { ok: false, line: `A coin, love, and you have ${purse.coins}.` };
        const { card, fresh } = keepIssue(today);
        if (!card) return { ok: true, coins: true, line: '“There you go. No card in this one, sorry: the next issue.”' };
        return { ok: true, coins: true, line: fresh ? `A cover card falls out: ${card.title}. “${card.line}” A new one for your set.` : `A cover card falls out: ${card.title}. You have that one already.` };
      }
      if (id === 'subscribe') {
        if (!purse.spend(paper.subscription.price)) return { ok: false, line: `That is ${formatCoins(paper.subscription.price)} and you have ${purse.coins}.` };
        streetShops.subscribeUntil(Math.max(today, streetShops.subscribedUntil) + paper.subscription.days);
        return { ok: true, coins: true, line: `“Done. The boy brings it round every morning, on your mat by the time you’re up.”` };
      }
      if (id === 'set' && setComplete()) {
        streetShops.markSetDone();
        purse.earnCoins(SET_PRIZE);
        session.reward({ title: 'The full set of cover cards', detail: 'The newsagent pins them up round the hatch, and pays out from the till.', coins: SET_PRIZE, big: true });
        return { ok: true, line: '“Twelve! In twenty years, you’re the second. The first was a dentist.”' };
      }
      return { ok: false, line: '“Sorry, love?”' };
    },
  };
}

function sections(day: number): CounterSection[] {
  const { paper } = STREET_SHOPS;
  const card = cardIn(day);
  const until = streetShops.subscribedUntil;
  const issue: CounterRow = {
    id: 'issue',
    title: `THE GAMING WEEKLY, issue ${day + 1}`,
    detail: card ? 'With a cover card inside' : 'No card in this one',
    price: paper.price,
    verb: 'Buy',
    ...(streetShops.hasIssue(day) ? { unavailable: 'You have today’s already.' } : {}),
  };
  const subscribed = until >= day;
  const subscription: CounterRow = {
    id: 'subscribe',
    title: 'A subscription',
    detail: subscribed ? `On your mat every morning till day ${until + 1}` : `${paper.subscription.days} mornings on your doormat, cards and all`,
    price: paper.subscription.price,
    verb: subscribed ? 'Renew' : 'Subscribe',
    ...(until - day > 3 ? { unavailable: 'It runs a while yet: renew it nearer the end.' } : {}),
  };
  const have = COVER_CARDS.filter((c) => streetShops.cards.includes(c.id));
  const cards: CounterSection = setComplete()
    ? { title: 'Your cover cards', rows: [{ id: 'set', title: 'The full set, all twelve', detail: 'Hand it in at the hatch', verb: 'Hand in' }], empty: '' }
    : { title: 'Your cover cards', rows: [], empty: streetShops.setDone ? 'The full set, pinned up round the hatch for all to see.' : have.length ? `${have.map((c) => c.title).join(', ')}. ${have.length} of ${COVER_CARDS.length}.` : 'None yet. Every other issue has one.' };
  return [
    { title: 'Today’s paper', rows: [issue], empty: '' },
    { title: 'Delivered', rows: [subscription], empty: '' },
    cards,
  ];
}
