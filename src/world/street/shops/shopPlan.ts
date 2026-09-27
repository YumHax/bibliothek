import { COFFEE_PRICE } from '@/economy/pricing';
import type { HomeShop } from '@/economy/homeGoods';
import type { ShopKind } from '../streetPlan';

/** Something a shop sells over the counter: the coffee, a croissant, a scratch card, a potted plant, a drink. */
export interface ShopOffer {
  id: 'coffee' | 'croissant' | 'scratch' | 'plant' | 'drink';
  /** As the caption says it: "a coffee at the counter". */
  title: string;
  price: number;
}

/** What a shop says: a line when the player looks in (one after the other), what the door says when it is shut, what it sells. */
export interface ShopTalk {
  looks: readonly string[];
  closed: string;
  offer?: ShopOffer;
}

/** How many potted plants the florist will sell for the balcony (there are that many spots on it). */
export const BALCONY_PLANTS = 3;

/**
 * The shops of Front Street as the player meets them at their doors (`ShopEntrance`), by kind:
 * the café's coffee (the flea market's coffee of the day: the stallholders go easier) with the
 * barista's tip, the bakery's croissant, the newsagent's scratch cards, the florist's potted plants
 * (they go on the balcony), the bar's lemonade and its gossip; the others have a word or two.
 * RETRO GAMES and the arcade are doors that lead somewhere (`StreetDoor`), not here.
 */
export const SHOP_TALK: Record<ShopKind, ShopTalk> = {
  cafe: {
    looks: ['“Sit anywhere, love.”'],
    closed: 'The chairs are up on the tables.',
    offer: { id: 'coffee', title: 'a coffee at the counter', price: COFFEE_PRICE },
  },
  bakery: {
    looks: ['Warm bread, the smell of butter.'],
    closed: 'The shelves are bare till the morning bake.',
    offer: { id: 'croissant', title: 'a croissant', price: 1 },
  },
  pharmacy: {
    looks: ['The pharmacist asks after the cat.', 'A poster about screen time. You look away.', 'The green cross blinks on its bracket.'],
    closed: 'The duty chemist is two streets away tonight.',
  },
  books: {
    looks: ['A strategy guide for a game you finished fifteen years ago.', 'The bookseller is reading behind the till and does not look up.', '“Game manuals? The flea market, round the back of RETRO GAMES.”'],
    closed: 'A cat asleep in the window display. Not yours.',
  },
  grocer: {
    looks: ['Apples, leeks, a crate of clementines. No cartridges.', '“Nothing for a cat here, sorry.”'],
    closed: 'The crates are in for the night.',
  },
  florist: {
    looks: ['Buckets of tulips, a smell of wet earth.'],
    closed: 'The buckets are in, the shutter half down.',
    offer: { id: 'plant', title: 'a potted plant for the balcony', price: 12 },
  },
  tabac: {
    looks: ['Stamps, lighters, the day’s papers.'],
    closed: 'The papers are in, the lottery sign is off.',
    offer: { id: 'scratch', title: 'a PIXEL SCRATCH card', price: 2 },
  },
  bar: {
    looks: ['The regulars look up, then back at the match.'],
    closed: 'Chairs stacked, the till counted.',
    offer: { id: 'drink', title: 'a lemonade at the bar', price: 2 },
  },
  butcher: {
    looks: ['The butcher waves a cleaver in greeting.', '“For the cat?” A scrap wrapped in paper. You say you will think about it.'],
    closed: 'The hooks are empty, the counter scrubbed.',
  },
  laundry: {
    looks: ['Machine 4 is out of order. Machine 4 is always out of order.', 'Somebody’s socks go round and round.', 'The dryers hum. It is warm in there.'],
    closed: 'The machines are still. A sign: OPEN 7–23.',
  },
  furniture: {
    looks: ['An armchair with a SOLD ticket, and another without.', '“Whatever you buy goes up your stairs today.”', 'A bed frame leaning on the wall, a sideboard, a lamp with its shade askew.'],
    closed: 'Chairs stacked in the window, the lights off.',
  },
  electronics: {
    looks: ['A wall of TVs, all tuned to the same snowstorm.', '“Projectors? I have one on the bench. Runs like new.”', 'A soldering iron, a radio in pieces, a smell of warm dust.'],
    closed: 'A card in the door: BACK AT 9. The screens are dark.',
  },
  pets: {
    looks: ['Kittens asleep in a basket by the window. One opens an eye.', '“A rescue. She needs a quiet flat. Full of games, you say? Perfect.”', 'Bags of kibble, a wall of toys, a tank of lazy fish.'],
    closed: 'The shop’s own cat asleep in the window. Not for adoption.',
  },
  retro: { looks: [], closed: '' },
  arcade: { looks: [], closed: '' },
  shut: {
    looks: ['Shut for good. A faded sign in the window: TO LET.', 'Someone has written GAME OVER in the dust on the glass.'],
    closed: 'Shut for good.',
  },
};

/**
 * The shops whose door opens a counter for the flat (`HomeShopPanel`: the goods of `HOME_GOODS` they sell) instead of a
 * word or a single offer: the furniture shop, the TV repair shop, the pet shop, and the florist (plants for every room).
 */
export const HOME_SHOP_OF: Partial<Record<ShopKind, HomeShop>> = { furniture: 'furniture', electronics: 'electronics', pets: 'pets', florist: 'florist' };

/** What the bar's regulars go on about, over a lemonade. */
export const BAR_GOSSIP: readonly string[] = [
  '“The claw machine at the arcade is rigged, I tell you. Rigged.”',
  '“Some kid beat the Stacker record last week. Kids.”',
  '“The dealers get to the flea market at opening. Be earlier.”',
  '“That busker knows one tune. One.”',
  '“The garage sales on this street? Lofts full of treasure.”',
];
