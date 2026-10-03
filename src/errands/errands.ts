import { STREET_TREATS, STREET_TREATS_PER_DAY } from '@/economy/pricing';
import type { SeasonName } from '@/time/season';

/** Something bought over a counter on Front Street and used up later: carried in the pocket (`pocket.ts`). */
export type ErrandId = 'croissant' | 'scrap' | 'treats' | 'bunch';

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

/** The season's cut flowers at the florist's (the board outside says which). */
export const SEASON_FLOWERS: Readonly<Record<SeasonName, string>> = {
  spring: 'tulips',
  summer: 'sunflowers',
  autumn: 'dahlias',
  winter: 'hellebores',
};

/**
 * What the counters along Front Street sell to be used up. The croissant and the bunch are gifts (the busker plays a
 * request for one); the scrap and the treats are for the stray cat, who comes round to the player over the days.
 */
export function errandOf(id: ErrandId, season: SeasonName): Errand {
  switch (id) {
    case 'croissant':
      return { id, title: 'a croissant', price: STREET_TREATS.croissant, portions: 1, perDay: STREET_TREATS_PER_DAY.croissant, max: 2, bought: 'A warm croissant in a paper bag, in your pocket. The pigeons watch it go.' };
    case 'scrap':
      return { id, title: 'a scrap for the stray', price: STREET_TREATS.scrap, portions: 1, perDay: STREET_TREATS_PER_DAY.scrap, max: 3, bought: 'A scrap of ham wrapped in paper. “For Trouble, is it? He knows you now.”' };
    case 'treats':
      return { id, title: 'a pouch of cat treats', price: STREET_TREATS.treats, portions: 3, perDay: STREET_TREATS_PER_DAY.treats, max: 6, bought: 'A pouch of fish treats, three portions. Any cat in the street will listen to you now.' };
    case 'bunch':
      return { id, title: `three bunches of ${SEASON_FLOWERS[season]} (3 for 2)`, price: STREET_TREATS.bunch, portions: 3, perDay: STREET_TREATS_PER_DAY.bunch, max: 6, bought: `Three bunches of ${SEASON_FLOWERS[season]} for the price of two, wrapped in brown paper. Somebody on the street will be glad of one.` };
  }
}
