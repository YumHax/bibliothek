import { COFFEE_PRICE, SCRATCH, STREET_TREATS } from '@/economy/pricing';
import type { ShopKind, ShopSpec } from '../streetPlan';
import type { PersonId } from '@/social/types';
import { capitalise } from '@/text/strings';

/** Something a shop sells over the counter: the coffee, a croissant, a scratch card, a drink, a scrap for the stray. */
export interface ShopOffer {
  id: 'coffee' | 'croissant' | 'scratch' | 'drink' | 'scrap';
  /** As the caption says it: "a coffee at the counter". */
  title: string;
  price: number;
}

/**
 * What a shop says: a line when the player looks in (one after the other), what the door says when it is shut, what it
 * sells. The shops one walks into (`SHOP_ZONE_OF`) only use `closed`: their clerk talks inside (`world/shop/shopPlan`).
 */
interface ShopTalk {
  looks: readonly string[];
  closed: string;
  offer?: ShopOffer;
}

/**
 * The shops of Front Street as the player meets them at their doors (`ShopEntrance`), by kind:
 * the café's coffee (the flea market's coffee of the day: the stallholders go easier) with the
 * barista's tip, the bakery's croissant, the newsagent's scratch cards, the bar's lemonade and its
 * gossip; the others have a word or two. RETRO GAMES, the arcade and the shops one walks into (the
 * furniture shop, the TV repair shop, the pet shop, the florist) are doors that lead somewhere
 * (`StreetDoor`), not here: of those, only `closed` is read (the door's word when shut).
 */
export const SHOP_TALK: Record<ShopKind, ShopTalk> = {
  cafe: {
    looks: ['“Sit anywhere, love.”', 'The milk steamer shrieks. Somebody at the window is reading THE GAMING WEEKLY.', '“Same as yesterday?” The barista remembers you.'],
    closed: 'The chairs are up on the tables.',
    offer: { id: 'coffee', title: 'a coffee at the counter', price: COFFEE_PRICE },
  },
  bakery: {
    looks: ['Warm bread, the smell of butter.'],
    closed: 'The shelves are bare till the morning bake.',
    offer: { id: 'croissant', title: 'a croissant', price: STREET_TREATS.croissant },
  },
  pharmacy: {
    looks: ['The pharmacist asks if you are sleeping enough. You say yes.', 'A poster about screen time. You look away.', 'The green cross blinks on its bracket.', '“Thumb strain? Ice, and fewer boss fights.”'],
    closed: 'The duty chemist is two streets away tonight.',
  },
  books: {
    looks: ['A strategy guide for a game you finished fifteen years ago.', 'The bookseller is reading behind the till and does not look up.', '“Game manuals? The flea market, round the back of RETRO GAMES.”'],
    closed: 'A cat asleep in the window display. Not yours.',
  },
  grocer: {
    looks: ['Apples, leeks, a crate of clementines. No cartridges.', '“Nothing for a cat here, sorry. The butcher’s your man.”', 'The grocer is arguing with the radio about the football.'],
    closed: 'The crates are in for the night.',
  },
  florist: { looks: [], closed: 'The buckets are in, the shutter half down.' },
  tabac: {
    looks: ['Stamps, lighters, the day’s papers.'],
    closed: 'The papers are in, the lottery sign is off.',
    offer: { id: 'scratch', title: 'a PIXEL SCRATCH card', price: SCRATCH.price },
  },
  bar: {
    looks: ['The regulars look up, then back at the match.'],
    closed: 'Chairs stacked, the till counted.',
    offer: { id: 'drink', title: 'a lemonade at the bar', price: STREET_TREATS.lemonade },
  },
  butcher: {
    looks: ['The butcher waves a cleaver in greeting.'],
    closed: 'The hooks are empty, the counter scrubbed.',
    offer: { id: 'scrap', title: 'a scrap for the stray cat', price: STREET_TREATS.scrap },
  },
  laundry: {
    looks: ['Machine 4 is out of order. Machine 4 is always out of order.', 'Somebody’s socks go round and round.', 'The dryers hum. It is warm in there.'],
    closed: 'The machines are still. A sign: OPEN 7–23.',
  },
  furniture: { looks: [], closed: 'Chairs stacked in the window, the lights off.' },
  electronics: { looks: [], closed: 'A card in the door: BACK AT 9. The screens are dark.' },
  pets: { looks: [], closed: 'The shop’s own cat asleep in the window. Not for adoption.' },
  retro: { looks: [], closed: '' },
  arcade: { looks: [], closed: '' },
  shut: {
    looks: ['Shut for good. A faded sign in the window: TO LET.', 'Someone has written GAME OVER in the dust on the glass.'],
    closed: 'Shut for good.',
  },
};

/**
 * Who serves behind a café's counter, by the name on its fascia (`social/people/town`): the counter's coffee is a
 * conversation with them (docs/social.md "Front Street and the arcade"). A café not named here keeps its plain counter.
 */
export const BARISTAS: Readonly<Record<string, PersonId>> = {
  'SUNNY SIDE CAFE': 'lou',
  'PARKSIDE CAFE': 'remi',
};

/** Names of the kinds, when the plan gives the shop none of its own. */
const KIND_NAMES: Partial<Record<ShopKind, string>> = {
  cafe: 'the café', bakery: 'the bakery', pharmacy: 'the pharmacy', books: 'the bookshop', grocer: 'the greengrocer', florist: 'the florist',
  tabac: 'the newsagent’s', bar: 'the bar', butcher: 'the butcher’s', laundry: 'the launderette', shut: 'an empty shop',
  furniture: 'the furniture shop', electronics: 'the TV repair shop', pets: 'the pet shop',
};

/** What the player calls a shop: its own name on the fascia ("Paws & Claws"), else its kind's ("the florist"). */
export function shopName(shop: ShopSpec): string {
  return shop.name ? titleCase(shop.name) : KIND_NAMES[shop.kind] ?? 'the shop';
}

/** "SUNNY SIDE CAFE" -> "Sunny Side Cafe" (small words kept small). */
function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map((word, i) => (i > 0 && ['of', 'the', 'and', '&'].includes(word) ? word : capitalise(word)))
    .join(' ');
}

/** What the bar's regulars go on about, over a lemonade. */
export const BAR_GOSSIP: readonly string[] = [
  '“The claw machine at the arcade is rigged, I tell you. Rigged.”',
  '“Some kid beat the Stacker record last week. Kids.”',
  '“The dealers get to the flea market at opening. Be earlier.”',
  '“That busker knows one tune. One.”',
  '“The garage sales on this street? Lofts full of treasure.”',
];
