import type { FriendPlan } from '../friendsPlan';

/*
 * GATHERINGS: more than one person round at once (docs/visitors.md "Gatherings"). Pure data: the rules of a games
 * night (the three friends for the evening, a match of PADDLE WARS on the TV), of an open house (strangers up the
 * stairs in waves, a coin each at the door, the paper's article the next day) and of the collectors' club's visit
 * (someone from the club comes to see a completed set's neon). Where they stand is `ROOM_PLAN.visitor.party`.
 *
 * Templates: {title} a game, {platform} its console, {coins} coins, {name} a friend, {set} a set's name,
 * {you} and {them} a match's goals.
 */

export const GATHERING_RULES = {
  gamesNight: {
    /** The phone asks everyone round for tonight until this hour of the in-game clock. */
    callUntil: 20,
    /** They come at this hour, or `inHours` after the call if that is later. */
    from: 19.5,
    inHours: 1,
    /** In-game days from one games night to the next at least. */
    everyDays: 3,
    /** Real seconds between two friends coming up the stairs behind the one who rang. */
    stagger: [5, 9] as [number, number],
    /** Each looks at this many shelves on the way in. */
    stops: 1,
    /** The evening, once they are in: they stay until `matches` matches were played, `stay` s at most, `minStay` s at least. */
    matches: 2,
    stay: 360,
    minStay: 75,
    /** Real seconds after the last friend reached their spot before player two offers a match. */
    offerAfter: 6,
    /** A match left unanswered this long is offered again (s). */
    offerAgain: 45,
    /** How well player two plays (0..1): the name on the screen only, PADDLE WARS's player two plays as it plays. */
    skill: 0.6,
    /** A good evening (a match played): a photo for the string on the wall, and maybe a game or a tip from one of them. */
    giftChance: 0.3,
    tip: [3, 7] as [number, number],
    /** The photo string holds this many; the oldest makes way. */
    photos: 5,
  },
  openHouse: {
    /** Games in the collection (owned or lent) from which the paper takes an open house. */
    minGames: 40,
    /** The paper prints it tomorrow: the open house is the day after (`aheadDays` from the call). */
    aheadDays: 2,
    /** Hours of the in-game clock it is held in (guests ring from `from`, none after `until`). */
    from: 14,
    until: 18.5,
    /** In-game days from one open house to the next at least. */
    everyDays: 7,
    /** Guests come in waves of `perWave`, `waves` of them, `waveGap` real seconds apart (from the last wave's coming in). */
    waves: 3,
    perWave: 2,
    waveGap: [50, 80] as [number, number],
    /** At most this many guests in the flat at once (people cost frames). */
    inFlat: 4,
    /**
     * Each guest drops this many coins in the jar at the door: `entry`, one more for every `entryEvery` games the
     * collection holds past `minGames` (a fuller flat draws a better crowd), never over `entryMax`. A small thing next
     * to the arcade: the collection earning its keep, never a living.
     */
    entry: 2,
    entryEvery: 30,
    entryMax: 6,
    /** They look round this many spots. */
    stops: 3,
    /** Real seconds after an unanswered wave rings before they go back down (they ring twice). */
    giveUpAfter: 70,
  },
  club: {
    /** The club's secretary comes to see a completed set from this hour of the in-game clock, never after `until`. */
    from: 15,
    until: 19.5,
    /** Coins the club brings: a set of theirs, a whole console's list. */
    gift: { set: 25, console: 60 },
  },
  /** On the landing: the bell again after this long (s), and they give up after `giveUpAfter`. */
  ringAgainAfter: 30,
  giveUpAfter: 75,
} as const;

/** The open house's guests: strangers from the neighbourhood, one body each (a wave takes the next two). */
export const GUESTS: readonly FriendPlan[] = [
  guest('guest-jo', 'A neighbour', 4101, { platforms: ['nes', 'snes'], genres: ['platform'], years: [1985, 1995] }, 1.12, 0.45, ['Hello! Is this the open house?', 'Hi! The paper said today.'], ['I saw it in THE GAMING WEEKLY.', 'Lovely flat.'], ['{title}! I had that one.']),
  guest('guest-ray', 'A collector', 4202, { platforms: ['megadrive', 'ps1'], genres: ['action', 'fighting'], years: [1990, 2000] }, 1.05, 0.3, ['Afternoon. Here for the collection.', 'Hello, hello. Am I early?'], ['I collect too, a bit. Not like this.', 'How long did this take you?'], ['{title}, and boxed. Respect.']),
  guest('guest-amy', 'A student', 4303, { platforms: ['gb', 'n64'], genres: ['puzzle', 'adventure'], years: [1995, 2002] }, 1.22, 0.75, ['Hi! Is it really free to look?', 'Hello! My flatmate told me.'], ['This is so cool.', 'I only ever had a Game Boy.'], ['{title}! That was my childhood.']),
  guest('guest-ben', 'A dad', 4404, { platforms: ['nes', 'megadrive'], genres: ['sports', 'racing'], years: [1987, 1994] }, 1.0, 0.25, ['Hello there. The kids are at their gran’s.', 'Hi. Saw the poster.'], ['My wife threw mine out in ’98.', 'Do you play them all?'], ['{title}… I had forgotten that one.']),
  guest('guest-lou', 'A shopkeeper', 4505, { platforms: ['snes', 'ps1'], genres: ['role', 'rpg'], years: [1992, 2000] }, 1.08, 0.5, ['Hello! I run the place round the corner.', 'Hi, I closed the shop for an hour.'], ['Good stock. Very good stock.', 'If you ever sell, you know where I am.'], ['{title}. I sold one last month.']),
  guest('guest-kim', 'A gamer', 4606, { platforms: ['n64', 'gb'], genres: ['shooter', 'racing'], years: [1996, 2001] }, 1.18, 0.65, ['Yo! Open house, right?', 'Hey! Where do I pay?'], ['Do you speedrun any of these?', 'I need a flat like this.'], ['{title}, nice. I beat that last week.']),
];

/** Someone from the collectors' club (the market's notice board), who comes to see a completed set. */
export const CLUB_VISITOR: FriendPlan = guest(
  'club', 'Mrs Albers', 4707, { platforms: ['nes', 'snes', 'megadrive'], genres: ['platform', 'adventure'], years: [1985, 1998] }, 0.95, 0.4,
  ['Good afternoon! Albers, from the collectors’ club.', 'Hello! The club sent me, about your set.'],
  ['The club keeps a register, you know. You are in it now.', 'We were thirty members in 1994. Now we are twelve, and you.'],
  ['{title}. Beautiful copy.'],
);

/** Lines of the gatherings (shuffle bags kept in the `VisitBook` like the visits' own). */
export const GATHERING_LINES = {
  /** Games night: the one who rang, on coming in. */
  nightLead: ['We are all here! Well, the others are on the stairs.', 'Games night! I brought crisps. Well, I meant to.', 'Evening! The others are parking. Or lost.'],
  /** The others, coming in behind. */
  nightFollow: ['Made it! Your stairs, honestly.', 'Evening! What are we playing?', 'Sorry, sorry, the bus.', 'Hi! Is there room for one more?'],
  /** At their spot by the TV. */
  nightSpot: ['Right, who is on player two?', 'I call the next game.', 'Is the TV on? Put something on.', 'Best seat in the house. Well, best standing.'],
  /** Player two offers a match. */
  offer: ['Fancy a round of PADDLE WARS? I am player two.', 'Come on, PADDLE WARS, you and me.', 'One match. Loser makes the tea.', 'Grab the stick, I will take player two.'],
  /** A goal for the player, seen by the others. */
  goalFor: ['Ha! Get in!', 'Nice one!', 'Did you see that?', 'Too fast for {name}!'],
  /** A goal for player two. */
  goalAgainst: ['Ooh, unlucky.', '{name} is on fire.', 'Defence! Defence!', 'You let that in on purpose.'],
  /** The match over: the player won, lost, or drew. */
  won: ['{you} to {them}! The champion of the flat.', 'Beaten by the host. Typical.', 'Rematch. I demand a rematch.'],
  lost: ['{them} to {you}! I am the champion of your flat now.', 'Ha! Home advantage, my foot.', 'Better luck next time, host.'],
  drew: ['{you} all! Nobody wins, nobody makes the tea.', 'A draw. Diplomatic.'],
  /** The evening winding down. */
  nightLeave: ['Right, I have work tomorrow. Brilliant night!', 'Same time next week? Same time next week.', 'Thanks for having us! Night!', 'I am taking the crisps. Night!'],
  /** Open house: coming in, the coins in the jar. */
  houseEnter: ['{coins} coins in the jar? Gladly.', 'There, {coins} coins. Worth it already.', 'Here is my {coins}. Where do I start?'],
  /** A rare piece seen (a famous game, a first print, a grail). */
  houseRare: ['{title}! I have only ever seen that in a magazine.', 'Is that {title}? A real one?', 'You have {title}. Do you know what that is worth?', 'Look at {title}. Just look at it.'],
  /** A display case (`showcased`): the pieces on show. */
  houseDisplay: ['They deserve their glass, these.', 'The case is the best part. {title}!', 'Under glass, like a museum. Which it is.'],
  houseLeave: ['Thank you! I will tell my friends.', 'What a collection. Thank you!', 'Bye! Same again next year?', 'I will be back. With my wallet.'],
  /** The club's visitor: at the set's neon. */
  clubSet: ['{set}, complete. The club congratulates you.', 'So this is {set}. All of it. Well done.', 'A neon, even. The club approves.'],
  clubConsole: ['Every game of the {platform} list. That is rare, these days.', 'The whole {platform} list! I have to sit down. Well, not really.'],
  clubGift: ['The club’s thanks: {coins} coins, from the kitty.', 'And this is from the club: {coins} coins. Spend it on games.'],
} as const;

function guest(id: string, name: string, seed: number, taste: FriendPlan['taste'], speed: number, pitch: number, greet: string[], smalltalk: string[], loved: string[]): FriendPlan {
  return { id, name, seed, taste, speed, borrowChance: 0, voice: { pitch }, lines: { greet, smalltalk, loved } };
}
