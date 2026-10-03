import { BOOKCASE_PRICE, HOME_GOOD_PRICES } from './pricing';
import { RECORDS } from '@/vinyl/records';

/**
 * Where a piece for the flat is sold: the flea market's household stall, and the shops of Front Street (the
 * second-hand furniture shop, the TV repair shop, the florist, the pet shop).
 */
export type HomeShop = 'market' | 'furniture' | 'electronics' | 'florist' | 'pets' | 'agent';

/** One piece the flat can be sold: what a shop lists, and what the flat shows once bought. */
export interface HomeGood {
  id: HomeUpgrade;
  name: string;
  /** Coins. */
  price: number;
  blurb: string;
  shop: HomeShop;
  /** How many can be bought (a piece that stands in several spots: the armchairs, the prints, the plants, the bookcases). */
  max: number;
  /** Whether it can be bought again (`max` over one). */
  repeatable: boolean;
  /** Bought only once this is owned (the cat's scratching post needs the cat, the bedroom's TV the dresser it stands on). */
  requires?: HomeUpgrade;
  /** Without `upgrade` owned, at most `max` of it (the bookcases: more once Mrs Roux's two rooms are the flat's). */
  until?: { upgrade: HomeUpgrade; max: number };
}

/** Every framed print the flat has a nail for (`framedPrint`'s `nth` in the plans: the living room's three, the hallway's two, the bedroom's two, the kitchen's one). */
const PRINT_SPOTS = 8;
/** Every spot for a houseplant indoors (`houseplant`'s `nth`: seven in the living room, one in the bedroom, two in the kitchen, one in the bathroom). */
const HOUSEPLANT_SPOTS = 11;
/** The balcony's pots (`plant`'s `nth`: the three the florist always sold, then the two by the railing). */
const BALCONY_POTS = 5;
/**
 * Bookcases: the living room's run has five slots (`build/bookcases.bookcasesIn`), its first one standing from the
 * start, so four more there, then the bedroom's one slot.
 */
const BOOKCASES = 5;
/** Mrs Roux's two rooms, joined to the flat (`world/annex`): the living room gives up its front-right slot, the annex has six. */
const ANNEX_BOOKCASES = 5;

type GoodLine = Omit<HomeGood, 'repeatable' | 'max'> & { max?: number };

/**
 * What can be bought for the flat. The flat starts with one bookcase, the TV on its stand with one console, a mattress
 * on the bedroom floor and what is built in (the kitchen's units, the bathroom's fittings, the wardrobe, the radiators);
 * everything else here waits in a shop. A shop reads this list and calls `HomeUpgrades.add(id)`; where each piece stands
 * once bought is in the flat's plan files (the entries marked `upgrade`), nothing shows there before.
 */
const LINES: readonly GoodLine[] = [
  // The flea market's household stall (it keeps its own display, `market/HomeGoodsDisplay`).
  { id: 'bookcase', name: 'Bookcase', price: BOOKCASE_PRICE, blurb: 'Flat-pack pine, 40 boxes. The living room first, then the bedroom, then the rooms next door once they are yours.', shop: 'market', max: BOOKCASES + ANNEX_BOOKCASES, until: { upgrade: 'annex', max: BOOKCASES } },
  { id: 'rug', name: 'Kilim rug', price: HOME_GOOD_PRICES.rug, blurb: 'Hand-woven, a little faded. For the hallway.', shop: 'market' },
  { id: 'lamp', name: 'Lava lamp', price: HOME_GOOD_PRICES.lamp, blurb: 'Orange wax, warms up slowly. Sits on the side table by the TV.', shop: 'market', requires: 'sideTable' },
  { id: 'poster', name: 'Framed game poster', price: HOME_GOOD_PRICES.poster, blurb: 'A shop display poster from the nineties, for the hallway.', shop: 'market' },
  // The crate of soundtrack LPs by the household stall (`world/vinyl/RecordCrate`): the nth bought is `RECORDS[n]`.
  { id: 'record', name: 'Soundtrack LP', price: HOME_GOOD_PRICES.record, blurb: 'A video-game soundtrack on vinyl, side A. For the sideboard’s turntable.', shop: 'market', max: RECORDS.length, requires: 'sideboard' },
  // The second-hand furniture shop.
  { id: 'armchair', name: 'Armchair', price: HOME_GOOD_PRICES.armchair, blurb: 'Deep, a little sagging. One faces the TV, the second the projector wall.', shop: 'furniture', max: 2 },
  { id: 'floorLamp', name: 'Floor lamp', price: HOME_GOOD_PRICES.floorLamp, blurb: 'Brass stem, linen shade. One by each armchair.', shop: 'furniture', max: 2 },
  { id: 'sideTable', name: 'Side table', price: HOME_GOOD_PRICES.sideTable, blurb: 'Round, walnut. By the TV armchair, for a mug and the magazines.', shop: 'furniture' },
  { id: 'livingRug', name: 'Living-room rug', price: HOME_GOOD_PRICES.livingRug, blurb: 'Wool, for in front of the TV; a second one for the projector corner.', shop: 'furniture', max: 2 },
  { id: 'floorCushions', name: 'Floor cushions', price: HOME_GOOD_PRICES.floorCushions, blurb: 'A pair, for whoever does not get the armchair.', shop: 'furniture' },
  { id: 'sideboard', name: 'Sideboard', price: HOME_GOOD_PRICES.sideboard, blurb: 'Low teak, with a turntable and a few records. Under the projector wall.', shop: 'furniture' },
  { id: 'framedPrint', name: 'Framed print', price: HOME_GOOD_PRICES.framedPrint, blurb: 'Mountains, a sunset, something abstract. One wall at a time.', shop: 'furniture', max: PRINT_SPOTS },
  { id: 'bed', name: 'Bed', price: HOME_GOOD_PRICES.bed, blurb: 'A proper double bed, off the floor at last.', shop: 'furniture' },
  { id: 'nightstands', name: 'Nightstands', price: HOME_GOOD_PRICES.nightstands, blurb: 'A pair, each with its drawer and a bedside lamp. The alarm clock and the phone go on them.', shop: 'furniture', requires: 'bed' },
  { id: 'dresser', name: 'Dresser', price: HOME_GOOD_PRICES.dresser, blurb: 'Three drawers and room on top for a small TV.', shop: 'furniture' },
  { id: 'readingCorner', name: 'Reading corner', price: HOME_GOOD_PRICES.readingCorner, blurb: 'A bedroom chair, a little table and a reading lamp. Sit there with a boxed game to read its manual.', shop: 'furniture' },
  { id: 'bedroomRug', name: 'Bedroom rug', price: HOME_GOOD_PRICES.bedroomRug, blurb: 'Something warm to step out of bed onto.', shop: 'furniture' },
  { id: 'mirror', name: 'Leaning mirror', price: HOME_GOOD_PRICES.mirror, blurb: 'Full length, for the bedroom.', shop: 'furniture' },
  { id: 'kitchenTable', name: 'Kitchen table', price: HOME_GOOD_PRICES.kitchenTable, blurb: 'A breakfast table and two chairs. Where the cleaning kit is used and a cake cools.', shop: 'furniture' },
  { id: 'kitchenRug', name: 'Kitchen runner', price: HOME_GOOD_PRICES.kitchenRug, blurb: 'Along the units, for cold mornings.', shop: 'furniture' },
  { id: 'bathMat', name: 'Bath mat', price: HOME_GOOD_PRICES.bathMat, blurb: 'Cotton, for the bathroom.', shop: 'furniture' },
  { id: 'hallStand', name: 'Shoe rack and umbrella stand', price: HOME_GOOD_PRICES.hallStand, blurb: 'For the hallway, by the front door.', shop: 'furniture' },
  { id: 'bistroSet', name: 'Bistro set', price: HOME_GOOD_PRICES.bistroSet, blurb: 'A folding table and two chairs for the balcony.', shop: 'furniture' },
  { id: 'displayCase', name: 'Display case', price: HOME_GOOD_PRICES.displayCase, blurb: 'Narrow, glazed, edge-lit glass shelves: five of your best boxes on show, face out. By the living room door.', shop: 'furniture' },
  { id: 'pedestal', name: 'Pedestal', price: HOME_GOOD_PRICES.pedestal, blurb: 'A gallery plinth with an easel and a warm glow: one grail, on show in the middle of the room.', shop: 'furniture' },
  { id: 'labelMaker', name: 'Label maker', price: HOME_GOOD_PRICES.labelMaker, blurb: 'An embossing label maker and five tapes: aim at a shelf’s edge and press K to label it.', shop: 'furniture' },
  // The TV repair shop.
  { id: 'crt', name: 'Portable CRT', price: HOME_GOOD_PRICES.crt, blurb: 'A 14-inch set for the kitchen: longplays while the kettle boils.', shop: 'electronics' },
  { id: 'projector', name: 'Projector', price: HOME_GOOD_PRICES.projector, blurb: 'Ceiling-mounted, throws a 2-metre picture on the right wall.', shop: 'electronics' },
  { id: 'speakers', name: 'Hi-fi speakers', price: HOME_GOOD_PRICES.speakers, blurb: 'A pair, either side of the TV stand.', shop: 'electronics' },
  { id: 'bedroomTv', name: 'Small TV', price: HOME_GOOD_PRICES.bedroomTv, blurb: 'A portable set for the bedroom dresser.', shop: 'electronics', requires: 'dresser' },
  { id: 'radio', name: 'Kitchen radio', price: HOME_GOOD_PRICES.radio, blurb: 'Two bands and a dial that sticks. On in the morning, it has the market’s news.', shop: 'electronics' },
  { id: 'appliances', name: 'Kettle and toaster', price: HOME_GOOD_PRICES.appliances, blurb: 'For the kitchen worktop.', shop: 'electronics' },
  { id: 'homeArcade', name: 'Arcade cabinet', price: HOME_GOOD_PRICES.homeArcade, blurb: 'A 7-in-1 board in a restored upright: the arcade’s own games, free play, for fun. In the bedroom by the door.', shop: 'electronics' },
  // Region converters (`economy/regionLock`): a Japanese copy of that platform plays at home. The Game Boy needs none.
  { id: 'famicomAdapter', name: 'Famicom adapter', price: HOME_GOOD_PRICES.famicomAdapter, blurb: '60 pins to 72: a Japanese Famicom cartridge plays in the NES.', shop: 'electronics' },
  { id: 'superFamicomAdapter', name: 'Super Famicom converter', price: HOME_GOOD_PRICES.superFamicomAdapter, blurb: 'A pass-through cartridge: Japanese Super Famicom games play on the SNES.', shop: 'electronics' },
  { id: 'megaDriveConverter', name: 'Mega Drive converter', price: HOME_GOOD_PRICES.megaDriveConverter, blurb: 'Japanese Mega Drive cartridges fit and play, region switch included.', shop: 'electronics' },
  { id: 'n64Passthrough', name: 'N64 passthrough', price: HOME_GOOD_PRICES.n64Passthrough, blurb: 'Gets a Japanese N64 cartridge past the console’s tabs and its lockout chip.', shop: 'electronics' },
  { id: 'ps1ModChip', name: 'PlayStation mod chip', price: HOME_GOOD_PRICES.ps1ModChip, blurb: 'Soldered in by the repairer: Japanese PlayStation discs boot.', shop: 'electronics' },
  // The florist.
  { id: 'houseplant', name: 'Houseplant', price: HOME_GOOD_PRICES.houseplant, blurb: 'A fig, a yucca, a monstera, trailing pots... one spot at a time.', shop: 'florist', max: HOUSEPLANT_SPOTS },
  { id: 'plant', name: 'Balcony pot', price: HOME_GOOD_PRICES.plant, blurb: 'A potted plant for the balcony.', shop: 'florist', max: BALCONY_POTS },
  // The pet shop.
  { id: 'cat', name: 'Adopt a cat', price: HOME_GOOD_PRICES.cat, blurb: 'A rescue, with its bowls and its bed. It moves in at once.', shop: 'pets' },
  { id: 'scratcher', name: 'Scratching post', price: HOME_GOOD_PRICES.scratcher, blurb: 'Sisal, for the living room. The armchairs will thank you.', shop: 'pets', requires: 'cat' },
  { id: 'catToy', name: 'Cat ball', price: HOME_GOOD_PRICES.catToy, blurb: 'A jingly ball, for the rug in front of the TV.', shop: 'pets', requires: 'cat' },
  // Mrs Roux's flat next door, sold through the agency's sign on her door (`building/rouxMove`, `world/annex`).
  { id: 'annex', name: 'Mrs Roux’s flat', price: HOME_GOOD_PRICES.annex, blurb: 'Two rooms on the street behind the living room’s right wall. The wall comes down the day after she leaves.', shop: 'agent' },
];

/** The ids of everything that can be bought for the flat, in `HOME_GOODS` order. */
export const HOME_UPGRADES = [
  'bookcase', 'rug', 'lamp', 'poster', 'record',
  'armchair', 'floorLamp', 'sideTable', 'livingRug', 'floorCushions', 'sideboard', 'framedPrint',
  'bed', 'nightstands', 'dresser', 'readingCorner', 'bedroomRug', 'mirror',
  'kitchenTable', 'kitchenRug', 'bathMat', 'hallStand', 'bistroSet', 'displayCase', 'pedestal', 'labelMaker',
  'crt', 'projector', 'speakers', 'bedroomTv', 'radio', 'appliances', 'homeArcade',
  'famicomAdapter', 'superFamicomAdapter', 'megaDriveConverter', 'n64Passthrough', 'ps1ModChip',
  'houseplant', 'plant',
  'cat', 'scratcher', 'catToy',
  'annex',
] as const;

export type HomeUpgrade = (typeof HOME_UPGRADES)[number];

export const HOME_GOODS: readonly HomeGood[] = LINES.map((line) => ({ ...line, max: line.max ?? 1, repeatable: (line.max ?? 1) > 1 }));

export function homeGood(id: HomeUpgrade): HomeGood {
  const good = HOME_GOODS.find((g) => g.id === id);
  if (!good) throw new Error(`unknown home good ${id}`);
  return good;
}

/** What `shop` sells, in list order. */
export function goodsOf(shop: HomeShop): HomeGood[] {
  return HOME_GOODS.filter((g) => g.shop === shop);
}

/** Whether one more of a piece can be bought: `buy`, `full` (as many at home as there is room for) or `needs` (what it goes with first). */
export type HomeGoodStatus = 'buy' | 'full' | 'needs';

/** What is said once `good` is paid for, wherever it was bought (a shop's tag or till, the household stall). */
export function boughtLine(good: Pick<HomeGood, 'id'>): string {
  return good.id === 'cat' ? 'Adopted! The cat is waiting at home, by its bowls.' : 'It is at home already.';
}

/** Why `good` cannot be bought now, as a refusal (null when it can): no room left for another, or what it goes with first. */
export function refusalFor(good: HomeGood, status: HomeGoodStatus): string | null {
  if (status === 'full') return good.max > 1 ? `The flat has no room for another ${good.name.toLowerCase()}.` : `You have the ${good.name.toLowerCase()} already.`;
  if (status === 'needs') return `The ${good.name.toLowerCase()} goes with the ${homeGood(good.requires!).name.toLowerCase()}: buy that first.`;
  return null;
}
