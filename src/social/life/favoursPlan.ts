import type { GiftKind } from '../types';
import type { FavourKind } from './lifeStore';

/*
 * The favours people ask (docs/social.md "Favours"): how often, how long they stand, what each kind asks and pays,
 * what is said. Data only: `favours.ts` reads it. Placeholders: {thing}, {game}, {name} (the asker's short name).
 */

export const FAVOURS = {
  /** A met person at Acquaintance or warmer, without a favour going, asks on a game day with `base` + warmth × `perWarmth` odds. */
  odds: { base: 0.06, perWarmth: 0.0015, max: 0.2 },
  /** At most this many new favours a game day across everyone, and a person asks again `gapDays` after their last one ended. */
  perDay: 2,
  gapDays: 5,
  /** An offer not taken up lapses after this many game days (nothing lost). */
  offerDays: 2,
  /** What a favour done pays, and what one let lapse after a yes costs. */
  done: { warmth: 8, trust: 12 },
  failed: { warmth: -3, trust: -5 },
  /** Coins paid with a done favour, some of the time (`coinOdds`), in this range. */
  coins: { odds: 0.35, min: 5, max: 15 },
  /** A make-amends favour done lifts their warmth to at least this (a Stranger again). */
  amendsTo: -10,
  /** A lent game comes back after this many game days. */
  lendDays: 3,
} as const;

/** What each kind gives the player to do, by game days to do it in. */
export const FAVOUR_DAYS: Record<FavourKind, number> = { fetch: 2, findGame: 7, lend: 1, checkIn: 3, parcel: 2 };

/** What a fetch asks for, by what the asker likes (else one of these). */
export const FETCHABLE: readonly GiftKind[] = ['croissant', 'flowers', 'treats'];

/** What they say asking (the panel's line after "What can I do for you?"), and the To-do's words. */
export const FAVOUR_LINES: Record<FavourKind, { ask: string; todo: string; thanks: string }> = {
  fetch: {
    ask: 'Would you bring me {thing} from Front Street? My legs won’t do the hill today.',
    todo: 'Bring {name} {thing} from Front Street (give it to them).',
    thanks: 'You’re an angel. Thank you, really.',
  },
  findGame: {
    ask: 'I’ve been hunting for {game} for ages. If you ever find a copy, I’d take it off your hands. Gladly.',
    todo: 'Find {game} for {name} (give it to them within a week).',
    thanks: '{game}! You found it! I don’t know how to thank you.',
  },
  lend: {
    ask: 'Could I borrow {game} for a few days? I’ll take good care of it. Promise.',
    todo: 'Lend {game} to {name} (talk to them).',
    thanks: 'I’ll bring it back in a few days, cross my heart.',
  },
  checkIn: {
    ask: 'I’m expecting a delivery and I may not hear the bell. Would you knock on my door in the next couple of days, check on me?',
    todo: 'Knock on {name}’s door in the next few days.',
    thanks: 'Ah, it’s you! Thank you for checking. That’s neighbourly.',
  },
  parcel: {
    ask: 'Mme Pereira has a parcel for me and her hours never match mine. Would you fetch it up from the lodge?',
    todo: 'Collect {name}’s parcel from Mme Pereira, then bring it up to them.',
    thanks: 'My parcel! You’re a star.',
  },
};

/** The make-amends offer's lines (said by someone cross with the player). */
export const AMENDS_LINES = {
  extra: 'Is there anything I can do to make it up to you?',
  ask: 'Well. You could start by doing something for me, for once.',
  done: 'All right. We’re… all right. Let’s start again.',
} as const;

/** The extras' words. */
export const FAVOUR_EXTRAS = {
  ask: 'What can I do for you?',
  accept: 'I’ll do it',
  decline: 'Sorry, I can’t',
  declined: 'Never mind. Another time.',
  lendIt: 'Lend them {game}',
  lendGone: 'You don’t have it to lend now',
  collect: 'Collect {name}’s parcel',
  collected: 'For {name}? Here. Mind, it is heavy. Not a scratch on it, please.',
  deliver: 'Here’s your parcel',
} as const;
