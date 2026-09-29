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
  /** Their voice's murmur: 0 deep .. 1 light (`playMurmur`'s pitch). */
  voice: { pitch: number };
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
    voice: { pitch: 0.5 },
    lines: {
      greet: [
        'Hey! I was passing by. Can I have a look at the shelves?',
        'Hi! Brought nothing but my curiosity. Show me what you found.',
        'Yo! Tell me you bought something new.',
        'Hey hey. Five floors, no lift for me. You owe me a look round.',
        'Hi! I was at the arcade and my pockets are empty. Distract me.',
      ],
      smalltalk: [
        'My little brother still owes me a Game Boy.',
        'I beat the first Mario in one sitting once. Never again.',
        'Is the arcade down the street still open late?',
        'I still hum the Tetris music in the shower. Every day.',
        'Blowing in the cartridge does nothing, you know. I still do it.',
      ],
      loved: [
        '{title}! I played that to death on my cousin\'s {platform}.',
        'You have {title}? Okay, I am jealous.',
        '{title}. I know every secret in that one. Every single one.',
        'Oh no, {title}. There goes my evening, just looking at it.',
        '{title} on the {platform}. That was my whole summer, once.',
      ],
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
    voice: { pitch: 0.82 },
    lines: {
      greet: [
        'Hello! I brought biscuits. Well, I ate the biscuits. Can I come in anyway?',
        'Hi! I have a free evening and you have shelves. Perfect.',
        'Hello you. I have been thinking about your shelves all week.',
        'Hi! Tell me everything you found. In order.',
        'Hello! I only have an hour. Probably. We will see.',
      ],
      smalltalk: [
        'I have a save file in Final Fantasy VII from 1998 that I refuse to delete.',
        'Sixty hours for a good ending is a fair price.',
        'Do you ever play anything, or only collect?',
        'I still keep a notebook of every boss I beat. It is a very long notebook.',
        'The best maps came folded in the box. Nobody folds them back right.',
      ],
      loved: [
        '{title}. Now that is a real game. Hours and hours.',
        'Oh, {title}. I cried at the end, I will not lie.',
        '{title}! The music alone. I could listen to it all day.',
        'You found {title}? I have been looking for years.',
        '{title} on the {platform}. They do not write stories like that any more.',
      ],
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
    voice: { pitch: 0.15 },
    lines: {
      greet: [
        'Ciao! I was at the market, thought I would see what you have been buying.',
        'Hey. You have a second controller, right? Joking. Mostly.',
        'Ciao ciao. All those stairs! Your games better be worth it.',
        'Hey! I was in the street, I saw your light. Here I am.',
        'Ciao! Quick look, then I am gone. I swear.',
      ],
      smalltalk: [
        'Blast processing. Nobody knew what it meant. We all wanted it.',
        'Two-player or nothing, that is my rule.',
        'Somebody at the arcade beat my Duel score. I will find them.',
        'The N64 controller has three handles. Who has three hands?',
        'I sold my Mega Drive at sixteen. Worst deal of my life.',
      ],
      loved: [
        '{title}! Put that on some evening and I will destroy you at it.',
        'Now {title}, that is how you make a game. Fast.',
        '{title}! My thumbs still hurt from that one.',
        'You have {title}? Rematch. Soon. I mean it.',
        '{title} on the {platform}. Pure speed. Beautiful.',
      ],
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
  /** Fewer games than this on the shelves (and not lent out): nobody asks to borrow one. */
  borrowMinShelved: 3,
  /** A loan lasts this many in-game days (drawn per loan). */
  loanDays: [2, 4] as [number, number],
  /** A due loan not handed back in person this many days after it was due comes back by post. */
  postAfter: 3,
  /** A returned loan: chance of a tip, its coins, and chance of a game they no longer want. */
  thanks: { tipChance: 0.35, tip: [2, 5] as [number, number], giftChance: 0.25 },
  /**
   * A player this close (m) in front of a walking friend makes them stop; after `excuseAfter` s they say so, after
   * `sidestepAfter` s they step `sidestep` m aside (the side away from the player, if no wall is there), and only
   * after `waitFor` s do they pass through. Nearer than `through` they fade to let the camera through. The cat within
   * `catAhead` m in front: they stop and let it pass, `catFor` s at most.
   */
  blocked: { ahead: 0.6, through: 0.35, excuseAfter: 0.7, sidestepAfter: 1.4, sidestep: 0.4, waitFor: 3.5, catAhead: 0.5, catFor: 3 },
  /** Their footsteps: metres between two, loudness right by them, heard up to `maxDistance` m (walls muffle them). */
  steps: { stride: 0.68, level: 0.32, maxDistance: 14 },
  /** How many treads of the flight down they are seen on, arriving and leaving (they fade over the last `fadeTreads`). */
  stairs: { treads: 7, fadeTreads: 3 },
  /** A game handed back is held out this long (s) before it goes back on its shelf. */
  handBackFor: 3,
  /** A browsing friend looks at a box on a shelf within this distance (m) in front of them. */
  lookWithin: 1.8,
  /** A player out of the flat this long (real seconds) mid-visit: the friend lets themself out. */
  aloneFor: 20,
  /** Comments are only told to a player this close (m). */
  earshot: 4.5,
  /**
   * The script's own pauses (s): in through the front door after it opens, the word on coming in and after it, a look
   * at a stop before the comment, the borrow request after it, the turn before pulling the front door shut and after,
   * off the last tread, and a door on the way swinging open.
   */
  beats: { throughDoor: 0.6, beforeEnter: 2.2, afterEnter: 1.2, lookFirst: 1.2, askAfter: 2.5, turnToShut: 0.5, afterShut: 0.6, offStairs: 0.3, doorOpens: 0.9 },
  /** Before sitting, they turn to face the room for at most this long (s), then sit. */
  sitTurnFor: 1.5,
  /**
   * Into an armchair leaning forward by `sitLean` (radians), back in it after `settleAfter` s; out of it leaning
   * `riseLean` for `riseFor` s before walking off. A longplay on the screen gets a word some way into the sit
   * (`tvWordAt`, a share of it).
   */
  sitting: { sitLean: 0.32, settleAfter: 0.9, riseLean: 0.38, riseFor: 0.7, tvWordAt: [0.35, 0.7] as [number, number] },
  /** Waiting on the landing: the phone comes out this long after the bell (s). */
  landing: { phoneAfter: [9, 16] as [number, number] },
  /** A friend's talk is heard as a murmur at their mouth: this loud right by them (0..1), heard up to `maxDistance` m. */
  murmur: { level: 0.05, maxDistance: 9 },
  /** Visits after which a friend counts as a regular (their word on coming in says so). */
  regularAfter: 4,
} as const;

/** The word in their bubble when a line is said out of earshot (drawn from the kind's pool, like the lines). */
export type Word = 'hi' | 'ooh' | 'nice' | 'ahh' | 'bye' | 'sorry' | 'kitty' | 'here' | 'yay' | 'cake' | 'ok' | 'ask';
export const WORDS: Record<Word, readonly string[]> = {
  hi: ['Hi!', 'Hey!', 'Hello!', 'Hiya!'],
  ooh: ['Ooh!', 'Oh!', 'Hm!', 'Whoa.'],
  nice: ['Nice!', 'Wow.', 'Pretty!', 'Look!'],
  ahh: ['Ahh', 'Phew', 'Comfy.', 'Mmm'],
  bye: ['Bye!', 'See you!', 'Ciao!', 'Later!'],
  sorry: ['Sorry!', 'Pardon!', 'Oops.', 'Excuse me!'],
  kitty: ['Kitty!', 'Hey, puss!', 'Psst!', 'Aww!'],
  here: ['Here!', 'For you!', 'Ta-da!', 'There.'],
  yay: ['Yay!', 'Thanks!', 'Great!', 'Brilliant!'],
  cake: ['Cake!', 'Mmm, cake!', 'Ooh, cake!'],
  ok: ['OK', 'Fair.', 'Sure.', 'No worries.'],
  ask: ['?', 'Hm?', 'Can I?'],
};

/**
 * The lines every friend shares (their own `lines` come first). Each bucket is a shuffle bag kept in the
 * `VisitBook` across visits: every line once, in a random order, before any comes again (never the last one
 * twice in a row); `…Night` buckets take over after dark.
 */
export const SHARED_LINES = {
  /** Just inside the front door, after the greeting. */
  enter: ['Nice place.', 'Shoes off? Shoes off.', 'It smells of old cardboard in here. I love it.', 'Every time, it is bigger in here than I remember.', 'Right. Where do I start?'],
  /** Their first visit ever. */
  enterFirst: ['So this is where you live! Nice.', 'First time up here. Nice building.', 'Oh, it is cosy. I had pictured it bigger. Or smaller.', 'So this is the famous collection flat.'],
  /** A regular (`VISIT_RULES.regularAfter` visits): they know the way. */
  enterRegular: ['I know the way, I know the way.', 'Back again! You must be sick of me.', 'Same as always: shoes off, straight to the shelves.', 'Home from home, this place.'],
  enterNight: ['Sorry for the hour. I saw your light was on.', 'Cosy in here at night.', 'Late visit! I will not stay long.'],
  comment: {
    famous: [
      '{title}, the real thing. People pay a fortune for that now.',
      'Everyone knows {title}. Good call.',
      '{title}! That is a proper classic, that one.',
      'You have {title} on a shelf like it is nothing.',
      'I think every kid wanted {title} at some point.',
    ],
    old: [
      '{title}, from {year}. That box has seen things.',
      'A {year} game still in its box. Respect.',
      '{year}! Older than some of my friends. {title}, look at it.',
      '{title}. They do not make boxes like that since {year}.',
      'That one is from {year}. {title}. It has aged better than me.',
    ],
    platform: [
      'Look at all this {platform} stuff.',
      'Not bad, the {platform} corner.',
      'You are building quite the {platform} shelf.',
      'I had a {platform}. Well, my neighbour had one.',
      'The {platform} boxes look so good side by side.',
    ],
    generic: [
      '{title}? Never played it. Any good?',
      'Huh, {title}. I remember the adverts.',
      'What is {title} like?',
      '{title}. Where did you find that?',
      'I have never even heard of {title}. What is it?',
    ],
    empty: [
      'Nice shelves. You know they work better with games on them?',
      'Room to grow, I see.',
      'It is a start! Everyone starts with one game.',
      'Minimalist. Very modern.',
      'Plenty of space for the next find, then.',
    ],
    many: [
      'How many games do you have now? This is getting serious.',
      'You need another bookcase, you know that.',
      'This is a museum now. You should sell tickets.',
      'I could stand here all day and not see everything.',
      'Your shelves are winning, you know. Soon they will need their own room.',
    ],
  },
  window: [
    'You can see the whole street from here.',
    'Nice light in here.',
    'Look at the market stalls from up here. Tiny!',
    'Great view. I would never get anything done.',
    'Is that the arcade sign down there?',
  ],
  windowNight: [
    'The street looks nice at night from up here.',
    'All the shop lights. Pretty.',
    'You can see every lit window across the street.',
    'The arcade is still lit up. Of course it is.',
    'Quiet out there tonight.',
  ],
  cat: ['Hello, {cat}!', '{cat}! Come here, you.', 'Is {cat} allowed on the shelves?', 'Hello {cat}. Guarding the collection?', '{cat}, you got bigger. Or fluffier.'],
  ask: [
    'Could I borrow {title}? Back in {days} days, promise.',
    'Can I take {title} home for a bit? {days} days, tops.',
    'Any chance I could borrow {title}? I will bring it back in {days} days.',
    'Would you lend me {title}? {days} days and it is back on your shelf.',
    'I would love to play {title} again. Lend it to me for {days} days?',
  ],
  lent: ['You are the best. I will look after it.', 'Brilliant, thanks! It goes straight in my bag.', 'Thank you! Not a scratch, I promise.', 'Yes! I know what I am doing tonight.', 'You are a star. It is safe with me.'],
  refused: ['Fair enough. I would not lend it either.', 'No problem, I get it.', 'Understood. Worth a try!', 'That is fine. It looks happy on your shelf.', 'Okay, okay. Another time maybe.'],
  /** Sitting down while a longplay plays on the screen. */
  sitTv: ['Oh, I remember this one.', 'Is this the bit with the… yes it is.', 'Leave it on, I want to see this.', 'A longplay? Nice. Do not skip.', 'They make it look so easy.'],
  sit: ['Mind if I sit for a minute?', 'Oof. Comfy chair.', 'Just a minute sitting down. My legs, the stairs.', 'Ah, that is a good armchair.', 'I could fall asleep in this chair.'],
  leave: ['Right, I am off. See you!', 'I should go. Thanks for the tour!', 'Okay, I am going before I borrow everything. Bye!', 'Thanks! Same time next week?', 'Time to go. Keep finding good stuff!'],
  leaveNight: ['It is late, I should get home. Night!', 'Good night! Do not stay up playing.', 'Right, bedtime for me. See you!'],
  returned: ['Here is {title} back. Thanks for the loan!', '{title}, safe and sound. Loved it.', 'Here you go, {title}. Not a scratch.', '{title} back home. What a game.', 'Brought {title} back, as promised.'],
  late: ['Sorry, I kept {title} a bit long.', 'I know, I know, {title} is late. I could not stop playing.', 'Sorry for the wait on {title}.'],
  tip: ['And that is for your trouble: {coins} coins. No arguing.', 'Here, {coins} coins for the loan. I insist.', 'And {coins} coins. Buy yourself something nice at the market.'],
  gift: [
    'Oh, and I do not play {title} any more. It is yours: I put it in your parcel in the hall.',
    'I brought {title} too. I never play it. It is in your parcel, by the door.',
    'And {title}: I do not need it any more. I left it in your parcel.',
  ],
  /** A cake on the kitchen table (docs/household.md): a slice on the way in, a thank-you on the way out. */
  cake: [
    'Is that cake I smell? You should not have. (You should have.)',
    'Cake! You spoil me. Just a small slice. Maybe two.',
    'You baked? For me? I am staying all afternoon.',
    'Is that a sponge cake? I will just have a sliver.',
  ],
  cakeGift: [
    'That cake was something. I brought you {title}, I never play it: it is in your parcel.',
    'Thanks for the cake! Here, {title}, I do not play it any more. I put it in your parcel.',
  ],
  cakeTip: ['For the cake. {coins} coins, and I want the recipe.', 'That cake deserves {coins} coins at least. Take them.'],
  /** Asked round on the phone. */
  invited: ['Today? Go on then. See you around {hour}.', 'Sure! I will drop by around {hour}.', 'Oh, nice. Around {hour}, then!', 'Perfect timing, I was bored. See you at {hour}.'],
  /** The player stands in their way: a word before they sidestep. */
  excuse: ['Excuse me.', 'Sorry, can I squeeze past?', 'Pardon me.', 'Just getting by…', 'Mind if I get past?'],
} as const;
