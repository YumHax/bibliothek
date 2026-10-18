import { PROMISE } from '../socialPlan';
import type { GiftKind } from '../types';
import type { FavourKind } from './lifeStore';

/*
 * The favours people ask (docs/social.md "Promises"): how often, how long they stand, what each kind asks and pays,
 * what is said. A favour said yes to is a promise: kept, a stamp of trust (`PROMISE.kept`); broken, the stamp lost
 * (`PROMISE.broken`); turned down, nothing. Data only: `favours.ts` reads it. Placeholders: {thing}, {game}, {name}
 * (the asker's short name).
 */

export const FAVOURS = {
  /** A met person at Acquaintance or warmer, without a favour going, asks on a game day with `base` + warmth × `perWarmth` odds. */
  odds: { base: 0.022, perWarmth: 0.0006, max: 0.1 },
  /** At most this many new favours a game day across everyone, and a person asks again `gapDays` after their last one ended. */
  perDay: 3,
  gapDays: 5,
  /** An offer not taken up lapses after this many game days (nothing lost). */
  offerDays: 2,
  /** What a favour done pays (a promise kept), and what one let lapse after a yes costs (a promise broken). */
  done: PROMISE.kept,
  failed: PROMISE.broken,
  /** Coins paid with a done favour, some of the time (`coinOdds`), in this range. */
  coins: { odds: 0.35, min: 5, max: 15 },
  /** A make-amends favour done lifts their warmth to at least this (a Stranger again). */
  amendsTo: -10,
  /** A lent game comes back after this many game days. */
  lendDays: 3,
  /** The player asks "Anything I can do for you?": they find something, `gapDays` after their last favour ended, this often at most. */
  askEveryDays: 3,
} as const;

/** What each kind gives the player to do, by game days to do it in. */
export const FAVOUR_DAYS: Record<FavourKind, number> = { fetch: 2, findGame: 7, lend: 1, checkIn: 3, parcel: 2 };

/** What a fetch asks for, by what the asker likes (else one of `FETCH_ANY`; cat treats only from someone with a cat). */
export const FETCHABLE: readonly GiftKind[] = ['croissant', 'flowers', 'treats', 'coffee', 'cake'];
export const FETCH_ANY: readonly GiftKind[] = ['croissant', 'flowers', 'coffee'];

/**
 * What they say asking (the panel's line after "What can I do for you?"), the To-do's words, their thanks; and in
 * their words, for the People book's notes: the need before the player answered (`need`), the promise's ticket after
 * a yes (`note`).
 */
export const FAVOUR_LINES: Record<FavourKind, { ask: string; todo: string; thanks: string; need: string; note: string }> = {
  fetch: {
    need: 'Could you bring me {thing} some time?',
    note: 'Bring me {thing} from Front Street.',
    ask: 'Would you pick me up {thing} on Front Street? I can’t get away today.',
    todo: 'Bring {name} {thing} from Front Street (give it to them).',
    thanks: 'You’re an angel. Thank you, really.',
  },
  findGame: {
    need: 'If you ever come across {game}…',
    note: 'Find me {game}, if you can.',
    ask: 'I’ve been hunting for {game} for ages. If you ever find a copy, I’d take it off your hands. Gladly.',
    todo: 'Find {game} for {name} (give it to them within a week).',
    thanks: '{game}! You found it! I don’t know how to thank you.',
  },
  lend: {
    need: 'I’d love to borrow {game} one day.',
    note: 'Lend me {game} for a few days.',
    ask: 'Could I borrow {game} for a few days? I’ll take good care of it. Promise.',
    todo: 'Lend {game} to {name} (talk to them).',
    thanks: 'I’ll bring it back in a few days, cross my heart.',
  },
  checkIn: {
    need: 'Would you knock on my door one of these days?',
    note: 'Knock on my door one of these days.',
    ask: 'I’m expecting a delivery and I may not hear the bell. Would you knock on my door in the next couple of days?',
    todo: 'Knock on {name}’s door in the next few days.',
    thanks: 'Ah, it’s you! The delivery came this morning: I’d never have heard the bell. Thanks for knocking.',
  },
  parcel: {
    need: 'Mme Pereira has a parcel of mine I can never collect.',
    note: 'Bring my parcel up from the lodge.',
    ask: 'Mme Pereira has a parcel for me and her hours never match mine. Would you fetch it up from the lodge?',
    todo: 'Collect {name}’s parcel from Mme Pereira, then bring it up to them.',
    thanks: 'My parcel! You’re a star.',
  },
};

/**
 * Who asks a favour, for the words they ask it in (`favours.voiceOf`): someone old, a kid, someone at work behind a
 * counter or a stall, an old friend; anyone else says `FAVOUR_LINES` as they are. No line assumes more than its band.
 */
export type FavourVoice = 'elder' | 'kid' | 'trade' | 'friend' | 'gruff';

/** The words a voice changes (the To-do's `todo` stays the player's own). */
export const FAVOUR_VOICES: Record<FavourVoice, Partial<Record<FavourKind, Partial<Record<'ask' | 'need' | 'note' | 'thanks', string>>>>> = {
  elder: {
    fetch: {
      need: 'Could you bring me {thing}? My legs won’t do the hill.',
      ask: 'Would you bring me {thing} from Front Street? My legs won’t do the hill today.',
      thanks: 'You’re an angel. Thank you, really.',
    },
    checkIn: {
      need: 'Would you look in on me one of these days?',
      note: 'Knock on my door, check on me.',
      ask: 'I’m expecting a delivery and I don’t always hear the bell any more. Would you knock in the next couple of days, check on me?',
      thanks: 'Ah, it’s you! The delivery came, and here you are too. Thank you for checking on me. That’s neighbourly.',
    },
    lend: { ask: 'Could I borrow {game} for a few days? I’ll be careful, I don’t know how to break things any more.' },
  },
  kid: {
    fetch: {
      need: 'Can you get me {thing}? I’m not allowed to cross on my own.',
      ask: 'Can you get me {thing} from Front Street? I’m not allowed to cross on my own.',
      thanks: 'Yesss! Thank you!',
    },
    findGame: {
      need: 'Everyone at school has {game}…',
      ask: 'Do you know where I could find {game}? Everyone at school has it except me.',
      thanks: '{game}! For real? You’re the best!',
    },
    lend: {
      need: 'Can I borrow {game} one day?',
      ask: 'Can I borrow {game}? I’ll be super careful. Super super careful.',
      thanks: 'I’ll give it back, I promise. Pinky promise.',
    },
  },
  trade: {
    fetch: {
      need: 'Could you grab me {thing}? I can’t leave the counter.',
      note: 'Bring me {thing}, I can’t leave the counter.',
      ask: 'Could you grab me {thing} on Front Street? I can’t leave the counter.',
      thanks: 'Lifesaver. Thank you.',
    },
    findGame: {
      need: 'A customer keeps asking me for {game}…',
      ask: 'A customer keeps asking me for {game}. If you come across a copy, bring it to me?',
    },
  },
  friend: {
    fetch: {
      need: 'Bring me {thing} next time you’re out?',
      ask: 'You going to Front Street? Grab me {thing}, would you? I’ll owe you one.',
      thanks: 'Legend. Thank you!',
    },
    lend: { ask: 'Lend me {game} for a few days? I’ll guard it with my life.' },
  },
  // Someone grumpy or proud asks without quite asking.
  gruff: {
    fetch: {
      need: 'I don’t suppose you’re passing the shops…',
      ask: 'I don’t suppose you’re passing Front Street. I could do with {thing}. If it’s no trouble. It probably is.',
      thanks: 'Hm. Thank you. That was… decent of you.',
    },
    checkIn: {
      need: 'There’s a delivery I mustn’t miss. Not that I need help.',
      ask: 'There’s a delivery coming and that bell is useless. Knock on my door in the next day or two. If you remember.',
      thanks: 'You knocked. Good. The parcel came. I’d have heard it myself, probably. Thank you.',
    },
    parcel: {
      ask: 'Mme Pereira has a parcel of mine, and her hours are a mystery. You could bring it up. If you’re going that way.',
      thanks: 'My parcel. Hm. Thank you.',
    },
    findGame: { ask: 'There’s a game I’ve looked for. {game}. Not that it matters. If you see it, you see it.', thanks: '{game}. You found it. I… thank you. Truly.' },
  },
};

/** How they take a yes and a no, by voice (`anyone` for the rest): a lend's yes is a borrowing's thanks. */
export const FAVOUR_ANSWERS: Record<FavourVoice | 'anyone', { yes: string; lendYes: string; no: string; back: string }> = {
  anyone: { yes: 'Thank you! I knew I could count on you.', lendYes: 'Oh, thank you! Whenever suits.', no: 'Never mind. Another time.', back: 'Thank you, I loved it.' },
  elder: { yes: 'Bless you. You’re a good soul.', lendYes: 'Thank you, dear. I’ll be so careful.', no: 'Oh, don’t worry, dear. I’ll manage. I always do.', back: 'Thank you, dear. I played it every evening. Badly, but every evening.' },
  kid: { yes: 'YES! Thank you!', lendYes: 'Really? Thank you thank you thank you!', no: 'Oh. Okay. Maybe another time?', back: 'I nearly finished it! Nearly. Thank you SO much.' },
  trade: { yes: 'Lifesaver. I owe you one.', lendYes: 'Cheers! I’ll look after it.', no: 'No worries. I’ll manage.', back: 'Played it on my breaks. Cheers for that.' },
  friend: { yes: 'You’re the best. Seriously.', lendYes: 'Legend. You won’t regret it.', no: 'No stress. Another time.', back: 'Back, as promised. Loved every minute.' },
  gruff: { yes: 'Hm. Good. Thank you.', lendYes: 'Hm. I’ll bring it back. Of course I will.', no: 'Fine. I didn’t expect you to.', back: 'It’s back. It was… good. Thank you.' },
};

/** The player offering a hand, and their answer when there is truly nothing (a favour of theirs just done). */
export const OFFER_LINES = {
  label: 'Anything I can do for you?',
  nothing: 'That’s kind of you to ask. Nothing just now. Ask me again some time.',
} as const;

/** The make-amends offer's lines (said by someone cross with the player). */
export const AMENDS_LINES = {
  extra: 'Is there anything I can do to make it up to you?',
  /** Their word for the player while the offer stands (the People book's note). */
  word: 'Perhaps we could patch things up, you and I.',
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
