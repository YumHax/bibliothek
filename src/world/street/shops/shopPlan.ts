import { COFFEE_PRICE, SCRATCH, STREET_TREATS } from '@/economy/pricing';
import type { ShopKind, ShopSpec } from '../streetPlan';
import type { PersonId } from '@/social/types';
import type { Weekday } from '@/time/wakefulness';
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
    looks: [
      'Warm bread, the smell of butter.',
      'A tray of pains au chocolat comes out of the back. The whole queue turns to look.',
      '“Well done or pale, love?” Nobody here says “medium”.',
      'Flour on the counter, flour on the till, flour in the baker’s eyebrows.',
      'A child is choosing between two identical éclairs. It is taking a while.',
    ],
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
    looks: [
      'Stamps, lighters, the day’s papers.',
      'Somebody is scratching a card at the counter with a coin, very slowly.',
      'A rack of postcards of the town, all of them from about 1985.',
      '“Lottery’s up to a fortune this week. Not that anyone round here wins.”',
      'THE GAMING WEEKLY on the bottom shelf, between the fishing and the knitting.',
    ],
    closed: 'The papers are in, the lottery sign is off.',
    offer: { id: 'scratch', title: 'a PIXEL SCRATCH card', price: SCRATCH.price },
  },
  bar: {
    looks: [
      'The regulars look up, then back at the match.',
      'A man at the end of the bar is explaining the offside rule to a dog.',
      'Beer mats stacked into a tower on a corner table. It wobbles. Nobody breathes.',
      'The barman polishes the same glass. It has been the same glass for a while.',
    ],
    closed: 'Chairs stacked, the till counted.',
    offer: { id: 'drink', title: 'a lemonade at the bar', price: STREET_TREATS.lemonade },
  },
  butcher: {
    looks: [
      'The butcher waves a cleaver in greeting.',
      'Sawdust on the floor, a radio playing old crooners behind the cold room door.',
      'A chalkboard: SAUSAGES — HOME-MADE — DON’T ASK WHAT’S IN THEM.',
      'Somebody’s dog sits outside the door, very straight, very hopeful.',
    ],
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
    looks: ['Shut for good. A faded sign in the window: TO LET.', 'Old posters in the window, curled by years of sun. A phone number nobody answers.', 'A pile of post behind the door, gone yellow.'],
    closed: 'Shut for good.',
  },
};

/**
 * A named shop's own lines when the player looks in, over its kind's (`SHOP_TALK`): the doors along the stretch the
 * roadworks open (`WORKS_LIFT`) are each a shop of their own, not a copy of the near ones (THE PIGEON is not THE
 * ANCHOR, PAGE TURNER keeps no guides). Their kind's offer (the coffee, the croissant, the card, the lemonade) stays.
 */
export const SHOP_OWN_LOOKS: Readonly<Record<string, readonly string[]>> = {
  'PELLETIER & SON': [
    'Pelletier senior sharpens the knives, Pelletier junior serves. Neither speaks to the other.',
    'A framed certificate: BEST BLACK PUDDING, 1979. Nothing since.',
    '“Stan across the road? Good lad. Wrong about sausages.”',
  ],
  'THE KETTLE': [
    'Mismatched teapots on every table. A cat asleep in the cake stand.',
    'A board: TEA 40 KINDS · COFFEE ONE KIND, DON’T ASK.',
    'Two old men playing chess by the window. One of them has been thinking since you came in.',
  ],
  'MILL LANE PHARMACY': [
    'The pharmacist is weighing something on brass scales, very carefully.',
    'A jar of liquorice on the counter: FOR GOOD CHILDREN AND BRAVE ADULTS.',
    '“Wrists aching? Rest them. Nobody ever does.”',
  ],
  'THE FLOUR POT': [
    'Sourdough the size of cartwheels. A sign: SLICED ON REQUEST, JUDGED SILENTLY.',
    'The baker here sings while she kneads. Badly. Everyone buys bread anyway.',
    'A basket of yesterday’s loaves by the door: FREE FOR THE DUCKS (NOT THE PIGEONS).',
  ],
  'BELLA FRUTTA': [
    'Pyramids of oranges, each one turned to show its best side.',
    '“Taste, taste!” A slice of melon is held out on a knife.',
    'A radio in Italian and a grocer arguing back at it.',
  ],
  'THE PIGEON': [
    'A stuffed pigeon in a glass case over the bar. Its name, apparently, was Gerald.',
    'A pinball machine in the corner, TILT lit, nobody playing.',
    'The landlady keeps a book of who owes what. It is very thick.',
  ],
  'SUDS & BUBBLES': [
    'Every machine works. Every single one. It feels wrong.',
    'A shelf of paperbacks to swap while you wait. Mostly detective stories missing their last page.',
    'Someone has left a single sock on top of the dryer, like an offering.',
  ],
  'GREEN FINGERS': [
    'Pots, seeds, compost and a fern taller than the owner. Cut flowers? “Iris’s, love, across from the launderette.”',
    'Trays of seedlings on the pavement with lolly-stick labels: BASIL, TOMATO, “MYSTERY”.',
    'A cactus in the window wearing a tiny knitted hat.',
  ],
  'THE PAPER STOP': [
    'Comics in spinner racks, the old kind that squeak when they turn.',
    'A jar of penny sweets that cost ten pence. Nobody has told the jar.',
    'The owner is doing the crossword in pen. She says pencil is for cowards.',
  ],
  'PAGE TURNER': [
    'Second-hand paperbacks to the ceiling, sorted by colour, not by author.',
    '“Game guides? No, love. Try the comics shop by the pet shop.”',
    'A ladder on rails, and the owner up it, reading.',
  ],
  'THE CORNER CUP': [
    'Builders in hi-vis at every table, one bacon roll each.',
    'A jar on the counter: TIPS FOR THE WORKS CREW’S CHRISTMAS DO.',
    '“The works moving on was the best thing for business. And the worst for parking.”',
  ],
  CRUMBS: [
    'Doughnuts in a row, each a different colour, like a palette.',
    'A wedding cake in the window, four tiers, a little plastic couple on a games console on top.',
    '“The custard ones go by ten. You’re late.”',
  ],
  'THE CROWN': [
    'Horse brasses, a dartboard nobody uses, a TV showing the snooker.',
    'Two regulars doing a jigsaw on the bar. It is a jigsaw of this pub.',
    'The landlord nods at you as if you have been coming in for years.',
  ],
  'THE CORNER SHOP': [
    'Everything from bin bags to birthday cards, and one copy of every battery ever made.',
    '“Open till late, love. Later than late.”',
    'A rack of cassettes by the till: DRIVING HITS VOL. 7.',
  ],
  'TERMINUS PHARMACY': [
    'The last stop on the bus route and the last pharmacy on the street. The pharmacist knows every driver by name.',
    'Hot water bottles in a pyramid. A sign: WINTER IS COMING (EVERY YEAR).',
    '“Eye drops, if you stare at screens. You stare at screens.”',
  ],
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

/**
 * A shop's own line for a day of the street's week (Monday 0 .. Sunday 6, `shopHours.streetWeekday`), said first on a
 * look in that day: the market mornings (Wednesday, Saturday), the launderette's Monday, the bakery's Friday, Saturday's
 * butcher. The week's hours are `shopHours`' `WEEK` (a shop shut that day says so at its door instead).
 */
export const WEEKDAY_LOOKS: Readonly<Partial<Record<ShopKind, Partial<Record<Weekday, string>>>>> = {
  grocer: {
    2: 'Market morning: crates out on the pavement, the radio up, “three for two on the lemons!”',
    5: 'Saturday market morning: a queue to the door and the grocer shouting prices.',
    6: 'Sunday: the shutter half down by one. “Quick, love, I’m off to my mother’s.”',
  },
  laundry: { 0: 'Monday: every machine taken, a queue of laundry bags along the wall. Machine 4 is still out of order.' },
  bakery: {
    4: 'Friday: the window is full of fruit tarts. A sign: THE FRIDAY SPECIAL.',
    6: 'Sunday morning: a queue for the bread out of the door. Shut at one.',
  },
  butcher: { 5: 'Saturday: a queue for the Sunday roasts. The butcher has a pencil behind each ear.' },
  books: { 0: 'Monday: the bookseller opens after lunch, sandwich in hand.' },
};

/** What the bar's regulars go on about, over a lemonade. */
export const BAR_GOSSIP: readonly string[] = [
  '“The claw machine at the arcade is rigged, I tell you. Rigged.”',
  '“Some kid beat the Stacker record last week. Kids.”',
  '“The dealers get to the flea market at opening. Be earlier.”',
  '“That busker knows one tune. One.”',
  '“The garage sales on this street? Lofts full of treasure.”',
];
