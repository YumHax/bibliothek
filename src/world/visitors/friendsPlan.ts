import type { PlatformId } from '@/catalog/types';
import type { PersonLook } from '../people/looks';

/*
 * THE FRIENDS: who drops by the flat, what they like, what they say, and how often. Pure data;
 * `VisitBook` decides the days, `Visit` plays one out, `friendLines` fills the templates. Where they
 * walk is the flat's own plan data (`HALLWAY_PLAN.visitor`, `ROOM_PLAN.visitor`).
 *
 * Templates: {title} a game, {platform} its console, {year} its year, {cat} the cat's name,
 * {days} a loan's length, {coins} a tip, {name} the friend.
 */

export interface FriendTaste {
  /** The consoles they grew up on: a game on one of them is what they would borrow. */
  platforms: readonly PlatformId[];
  /** Genres they light up at (matched case-insensitively inside the game's `genre`). */
  genres: readonly string[];
  /** The years they care most about (release year, inclusive). */
  years: readonly [number, number];
}

export interface FriendPlan {
  id: string;
  name: string;
  /** `randomLook(seed)` draws the rest of their look; `look` fixes what makes them recognisable. */
  seed: number;
  look?: Partial<PersonLook>;
  taste: FriendTaste;
  /** Walking speed, m/s. */
  speed: number;
  /** Chance they ask to borrow something when a game on the shelves suits them. */
  borrowChance: number;
  /** Their own lines, used before the shared ones. */
  lines: { greet: readonly string[]; smalltalk: readonly string[]; loved: readonly string[] };
}

export const FRIENDS: readonly FriendPlan[] = [
  {
    id: 'sam',
    name: 'Sam',
    seed: 311,
    look: { hairStyle: 'curly', hat: 'cap', hatColor: 0x8f3b3b, top: 'hoodie', topColor: 0x3b5b8f, longSleeves: true, bag: 'backpack', bagColor: 0x2f2f33, smile: true },
    taste: { platforms: ['nes', 'snes', 'gb'], genres: ['platform', 'action', 'puzzle'], years: [1985, 1995] },
    speed: 0.95,
    borrowChance: 0.7,
    lines: {
      greet: ['Hey! I was passing by. Can I have a look at the shelves?', 'Hi! Brought nothing but my curiosity. Show me what you found.'],
      smalltalk: ['My little brother still owes me a Game Boy.', 'I beat the first Mario in one sitting once. Never again.', 'Is the arcade down the street still open late?'],
      loved: ['{title}! I played that to death on my cousin\'s {platform}.', 'You have {title}? Okay, I am jealous.'],
    },
  },
  {
    id: 'ines',
    name: 'Inès',
    seed: 527,
    look: { hairStyle: 'long', glasses: 0x1e1c1a, top: 'shirt', topColor: 0x6b4a8f, topAccent: 0xf2efe8, figure: 'curvy', bag: 'tote', bagColor: 0xd8cdb4, smile: true },
    taste: { platforms: ['snes', 'ps1'], genres: ['rpg', 'adventure', 'strategy'], years: [1992, 2001] },
    speed: 0.8,
    borrowChance: 0.6,
    lines: {
      greet: ['Hello! I brought biscuits. Well, I ate the biscuits. Can I come in anyway?', 'Hi! I have a free evening and you have shelves. Perfect.'],
      smalltalk: ['I have a save file in Final Fantasy VII from 1998 that I refuse to delete.', 'Sixty hours for a good ending is a fair price.', 'Do you ever play anything, or only collect?'],
      loved: ['{title}. Now that is a real game. Hours and hours.', 'Oh, {title}. I cried at the end, I will not lie.'],
    },
  },
  {
    id: 'marco',
    name: 'Marco',
    seed: 743,
    look: { hairStyle: 'short', beard: 'full', top: 'jacket', topColor: 0x2f2f33, topAccent: 0xc8443a, longSleeves: true, shoes: 'boot', height: 1.84, build: 1.12 },
    taste: { platforms: ['megadrive', 'n64', 'ps1'], genres: ['racing', 'fighting', 'sports', 'shooter', 'beat'], years: [1990, 2000] },
    speed: 0.9,
    borrowChance: 0.55,
    lines: {
      greet: ['Ciao! I was at the market, thought I would see what you have been buying.', 'Hey. You have a second controller, right? Joking. Mostly.'],
      smalltalk: ['Blast processing. Nobody knew what it meant. We all wanted it.', 'Two-player or nothing, that is my rule.', 'Somebody at the arcade beat my Duel score. I will find them.'],
      loved: ['{title}! Put that on some evening and I will destroy you at it.', 'Now {title}, that is how you make a game. Fast.'],
    },
  },
];

/** When friends come, and for how long they stay and borrow. */
export const VISIT_RULES = {
  /** Chance an in-game day brings a visit, once the gap below has passed. */
  chance: 0.4,
  /** In-game days between two visits at least (a return visit may come sooner). */
  minGap: 2,
  /** The bell rings from this hour of the in-game day (drawn per day between `from` and `until`), never after `latest`. */
  hours: { from: 14, until: 20, latest: 21.5 },
  /** Real seconds before the bell rings again, and before they give up after the second ring. */
  ringAgainAfter: 35,
  giveUpAfter: 80,
  /** Real seconds spent at each shelf / window / seat on a visit. */
  linger: { browse: [7, 11] as [number, number], seat: [18, 28] as [number, number] },
  /** How many spots they browse (then maybe sit), then they leave. */
  browseStops: 3,
  /** A borrow request left unanswered this long (real seconds) is dropped. */
  askFor: 60,
  /** A loan lasts this many in-game days (drawn per loan). */
  loanDays: [2, 4] as [number, number],
  /** A due loan not handed back in person this many days after it was due comes back by post. */
  postAfter: 3,
  /** A returned loan: chance of a tip, its coins, and chance of a game they no longer want. */
  thanks: { tipChance: 0.35, tip: [2, 5] as [number, number], giftChance: 0.25 },
  /** A player this close (m) in front of a walking friend makes them wait; nearer than `through` they fade to let the camera through. */
  blocked: { ahead: 0.6, through: 0.35, waitFor: 2.5 },
  /** A player out of the flat this long (real seconds) mid-visit: the friend lets themself out. */
  aloneFor: 20,
  /** Comments are only told to a player this close (m). */
  earshot: 4.5,
} as const;

/** The lines every friend shares (their own `lines` come first). */
export const SHARED_LINES = {
  enter: ['Nice place.', 'Shoes off? Shoes off.'],
  comment: {
    famous: ['{title}, the real thing. People pay a fortune for that now.', 'Everyone knows {title}. Good call.'],
    old: ['{title}, from {year}. That box has seen things.', 'A {year} game still in its box. Respect.'],
    platform: ['Look at all this {platform} stuff.', 'Not bad, the {platform} corner.'],
    generic: ['{title}? Never played it. Any good?', 'Huh, {title}. I remember the adverts.', 'What is {title} like?'],
    empty: ['Nice shelves. You know they work better with games on them?', 'Room to grow, I see.'],
    many: ['How many games do you have now? This is getting serious.', 'You need another bookcase, you know that.'],
  },
  window: ['You can see the whole street from here.', 'Nice light in here.'],
  cat: ['Hello, {cat}!', '{cat}! Come here, you.', 'Is {cat} allowed on the shelves?'],
  ask: ['Could I borrow {title}? Back in {days} days, promise.', 'Can I take {title} home for a bit? {days} days, tops.'],
  lent: ['You are the best. I will look after it.', 'Brilliant, thanks! It goes straight in my bag.'],
  refused: ['Fair enough. I would not lend it either.', 'No problem, I get it.'],
  sit: ['Mind if I sit for a minute?', 'Oof. Comfy chair.'],
  leave: ['Right, I am off. See you!', 'I should go. Thanks for the tour!'],
  returned: ['Here is {title} back. Thanks for the loan!', '{title}, safe and sound. Loved it.'],
  late: ['Sorry, I kept {title} a bit long.'],
  tip: ['And that is for your trouble: {coins} coins. No arguing.'],
  gift: ['Oh, and I do not play {title} any more. It is yours, I left it in your parcel.'],
} as const;
