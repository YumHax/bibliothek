import { COFFEE_PRICE, STREET_TREATS, STREET_TREATS_PER_DAY } from '@/economy/pricing';
import type { SeasonName } from '@/time/season';
import { STREET_SHOPS } from '@/streetShops/rules';

/** Something bought over a counter on Front Street and used up later: carried in the pocket (`pocket.ts`). */
export type ErrandId = 'croissant' | 'scrap' | 'treats' | 'bunch' | 'coffee' | 'cake' | 'basket';

export interface Errand {
  id: ErrandId;
  /** As a caption says it: "a croissant", "a pouch of cat treats". */
  title: string;
  price: number;
  /** How many one buy puts in the pocket (the pouch holds three portions; the florist's bunches are three for two). */
  portions: number;
  /** How many buys a real day the shop allows. */
  perDay: number;
  /** At most this many in the pocket. */
  max: number;
  /** What is said once bought. */
  bought: string;
}

/**
 * What the cafés pack to take away (the counter's conversation, `street/shops/baristaTalk`): a coffee in a paper cup
 * and a slice of cake in a box, carried as gifts (somebody on the street likes one; the Mansions' favours ask for them).
 * Their price is the café's coffee (`COFFEE_PRICE`) and a slice's, a little more.
 */
const TO_GO = { coffeePerDay: 2, cake: 3, cakePerDay: 2 } as const;

/** The season's cut flowers at the florist's (the board outside says which). */
export const SEASON_FLOWERS: Readonly<Record<SeasonName, string>> = {
  spring: 'tulips',
  summer: 'sunflowers',
  autumn: 'dahlias',
  winter: 'hellebores',
};

/**
 * What the counters along Front Street sell to be used up. The croissant and the bunch are gifts (the busker plays a
 * request for one); the scrap and the treats are for the stray cat, who comes round to the player over the days; the
 * greengrocer's baking basket goes into the next cake baked at home (it keeps a day longer).
 */
export function errandOf(id: ErrandId, season: SeasonName): Errand {
  switch (id) {
    case 'croissant':
      return { id, title: 'a croissant', price: STREET_TREATS.croissant, portions: 1, perDay: STREET_TREATS_PER_DAY.croissant, max: 2, bought: 'A warm croissant in a paper bag, in your pocket. The pigeons watch it go.' };
    case 'scrap':
      return { id, title: 'a scrap for the stray', price: STREET_TREATS.scrap, portions: 1, perDay: STREET_TREATS_PER_DAY.scrap, max: 3, bought: 'A scrap of ham wrapped in paper. “For Trouble, is it? He knows you now.”' };
    case 'treats':
      return { id, title: 'a pouch of cat treats', price: STREET_TREATS.treats, portions: 3, perDay: STREET_TREATS_PER_DAY.treats, max: 6, bought: 'A pouch of fish treats, three portions. Any cat in the street will listen to you now.' };
    case 'coffee':
      return { id, title: 'a coffee to take away', price: COFFEE_PRICE, portions: 1, perDay: TO_GO.coffeePerDay, max: 2, bought: 'A coffee in a paper cup with a lid, still too hot to drink. It is for somebody.' };
    case 'cake':
      return { id, title: 'a slice of cake to take away', price: TO_GO.cake, portions: 1, perDay: TO_GO.cakePerDay, max: 2, bought: 'A slice of the day’s cake in a little white box tied with string.' };
    case 'basket':
      return { id, title: 'a baking basket (eggs, butter, lemons)', price: STREET_SHOPS.basket.price, portions: 1, perDay: STREET_SHOPS.basket.perDay, max: STREET_SHOPS.basket.max, bought: 'Eggs, butter, two lemons and a bag of flour in a paper bag. The next cake you bake will be a lemon drizzle: it keeps longer.' };
    case 'bunch':
      return { id, title: `three bunches of ${SEASON_FLOWERS[season]} (3 for 2)`, price: STREET_TREATS.bunch, portions: 3, perDay: STREET_TREATS_PER_DAY.bunch, max: 6, bought: `Three bunches of ${SEASON_FLOWERS[season]} for the price of two, wrapped in brown paper. Somebody on the street will be glad of one.` };
  }
}
