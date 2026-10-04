/*
 * The shapes of the social layer (docs/social.md): who the people are (`PersonCard`), what the player
 * stands at with each (`PersonState`), what talking does (`InteractionId`, `Outcome`). Types only.
 */

/** A person's id: kebab-case, stable across saves ("leclerc", "mme-pereira", "victor"). */
export type PersonId = string;

/** Where the People book files them. */
export type SocialGroup = 'building' | 'street' | 'market' | 'arcade' | 'friends' | 'rivals';

/** Where a conversation takes place (some talk only fits some places: a dinner invitation is not made at a stall). */
export type SocialPlace = 'stairs' | 'theirFlat' | 'flat' | 'street' | 'shop' | 'market' | 'arcade' | 'saleroom' | 'courtyard' | 'phone' | 'elsewhere';

/** A personality trait: how an action lands with them (`socialPlan.TRAITS`). */
export type Trait =
  | 'chatty'
  | 'grumpy'
  | 'nightOwl'
  | 'earlyBird'
  | 'nostalgic'
  | 'competitive'
  | 'proud'
  | 'generous'
  | 'gossip'
  | 'catPerson'
  | 'neat'
  | 'collector'
  | 'shy'
  | 'businesslike'
  | 'romantic'
  | 'funny';

/** The warmth tiers, coldest first (`tiers.ts`). */
export type TierId = 'nemesis' | 'hostile' | 'cold' | 'stranger' | 'acquaintance' | 'friendly' | 'friend' | 'close';

/** The two axes read together: what the relationship is like. */
export type Bond = 'friend' | 'charmer' | 'business' | 'enemy' | 'neutral';

/** A thing in the player's pocket or hand that can be given (errands' items, a game, coins). */
export type GiftKind = 'croissant' | 'flowers' | 'treats' | 'scrap' | 'coins' | 'game' | 'cake' | 'coffee' | 'plush' | 'record';

/** What they know about themselves that the player may learn, one fact at a time. */
export interface PersonFact {
  id: string;
  /** As the book shows it: "Plays the piano every evening". */
  text: string;
  /** Said when it comes up in talk: "I play every evening. You must hear it through the floor!" */
  says: string;
  /** Learned from this tier on (talking at a lower tier never brings it up). Default 'stranger'. */
  from?: TierId;
}

/**
 * A perk (a tier reached) or a penalty (a tier fallen to): what it does, for the book and the banners, and the
 * value a system reads through `perks.effect(id, key)`.
 */
export interface SocialEffect {
  /** What a system asks for: 'noiseThreshold', 'holdsParcels', 'discount'. */
  key: string;
  /** From this tier up (a perk) or down (a penalty: `down`). */
  at: TierId;
  down?: boolean;
  /** Needs this trust at least too (a key, credit). */
  trust?: number;
  /** The value read (a share, a price factor, an hour); `true` when only on / off. */
  value?: number | boolean;
  /** As the book and the banner say it: "Holds your parcels at the lodge". */
  text: string;
}

/** Someone the player can know. Data: `src/social/people/*`. */
export interface PersonCard {
  id: PersonId;
  /** As they introduce themselves, in full: "Rania Haddad". */
  name: string;
  /** As everyone calls them: "Mrs Haddad", "Victor". Default `name`. */
  short?: string;
  /** What they are to the player, a few words: "3rd floor, left", "the NES stall". */
  role: string;
  group: SocialGroup;
  /** Where and when to find them, as the book says it once known: "On the stairs mornings and evenings". */
  whereabouts: string;
  /** How they introduce themselves the first time (the name is learned then). */
  intro: string;
  traits: readonly Trait[];
  /** Their tastes in games: platforms and genres they love (gifts of a game and game talk land better). */
  tastes?: { platforms?: readonly string[]; genres?: readonly string[]; era?: [number, number] };
  /** Gifts they love and gifts they do not want. */
  likes?: readonly GiftKind[];
  dislikes?: readonly GiftKind[];
  /** Their birthday: a day of the social year (0 .. `BIRTHDAY_CYCLE` - 1, `socialPlan`). */
  birthday: number;
  /** The portrait's look: the seed their body is drawn with, and its role (`world/people/looks.randomLook`). */
  look: { seed: number; role: 'vendor' | 'shopper' };
  /** They have a phone the player can be given the number of (asked from 'acquaintance'). */
  phone?: boolean;
  /** Their door on the stairs (`stairwell/building.doorKey`): the old friendship store was keyed by it. */
  door?: string;
  /** How they stand with others: -1 (can't stand them) .. 1 (close). What the player does to one reaches the others. */
  ties?: Readonly<Record<PersonId, number>>;
  facts?: readonly PersonFact[];
  /** Perks and penalties of theirs (`SocialEffect`). */
  effects?: readonly SocialEffect[];
  /** Their own words by interaction (they replace the shared lines of `socialLines` when present). */
  lines?: Partial<Record<InteractionId | 'hello' | 'cold' | 'hostile', readonly string[]>>;
  /** Where the warmth starts (a friend from before, the rival). Default 0. */
  startWarmth?: number;
  startTrust?: number;
  /** Not in the book until met (default); `always`: in it from the start (the friends). */
  listed?: 'met' | 'always';
}

/** A moment they remember. */
export interface Memory {
  day: number;
  /** As they would say it: "you lent me Zelda". */
  text: string;
  /** How it felt: positive warms their lines, negative is a grudge. */
  weight: number;
}

/** What the player stands at with one person (saved). */
export interface PersonState {
  warmth: number;
  trust: number;
  /** The game day they were first met (introduced), or null: a stranger whose name the book does not know. */
  met: number | null;
  /** Facts learned (`PersonFact.id`). */
  known: string[];
  /** Traits found out (talk shows them over time). */
  traitsKnown: Trait[];
  memories: Memory[];
  /** `reason` -> the game day it last counted (a reason counts once a day). */
  last: Record<string, number>;
  /** The day the social battery was last drawn on, how much of it, and the warmth talk brought that day (`GAIN.talkPerDay`). */
  battery: { day: number; used: number; warmed: number };
  /** The game day of the last conversation or deed (drift starts after a while without one). */
  lastSeen: number;
  /** The tier last announced (a change is told once). */
  told: TierId;
  /** The player has their number (the phone can ring them). */
  number: boolean;
}

/** Every interaction of the conversation panel (`socialPlan.INTERACTIONS`). */
export type InteractionId =
  | 'chat'
  | 'askDay'
  | 'talkGames'
  | 'compliment'
  | 'joke'
  | 'gossip'
  | 'complain'
  | 'apologise'
  | 'askNumber'
  | 'askFavour'
  | 'askTip'
  | 'askDiscount'
  | 'tease'
  | 'insult'
  | 'challenge'
  | 'giveGift'
  | 'giveGame'
  | 'giveCoins';

/** The panel's groups. */
export type InteractionGroup = 'talk' | 'give' | 'ask' | 'trade' | 'invite' | 'mean';

/** What a nudge changed: for the chip, the banner, the listeners. */
export interface SocialChange {
  id: PersonId;
  warmth: number;
  trust: number;
  /** Why, as the chip says it: "loved the flowers". */
  why?: string;
  before: TierId;
  after: TierId;
  /** Came through the grapevine (someone they know heard of it), not from the player directly. */
  heard?: boolean;
}
