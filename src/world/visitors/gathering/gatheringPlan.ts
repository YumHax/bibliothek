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
    /** How well player two plays PADDLE WARS (0..1), by who they are: Marco holds the arcade's Duel record. */
    skill: { anyone: 0.6, marco: 0.85, sam: 0.6, ines: 0.5 } as Readonly<Record<string, number>>,
    /** A good evening (a match played): a photo for the string on the wall, and maybe a game or a tip from one of them. */
    giftChance: 0.3,
    tip: [3, 7] as [number, number],
    /** The photo string holds this many; the oldest makes way. */
    photos: 5,
  },
  openHouse: {
    /** Games in the collection (owned or lent) from which the paper takes an open house. */
    minGames: 15,
    /** The paper prints it tomorrow: the open house is the day after (`aheadDays` from the call). */
    aheadDays: 2,
    /** Hours of the in-game clock it is held in (guests ring from `from`, none after `until`). */
    from: 14,
    until: 18.5,
    /** In-game days from one open house to the next at least. */
    everyDays: 4,
    /** Guests come in waves of `perWave`, `waves` of them, `waveGap` real seconds apart (from the last wave's coming in). */
    waves: 3,
    perWave: 2,
    waveGap: [50, 80] as [number, number],
    /** At most this many guests in the flat at once (people cost frames). */
    inFlat: 4,
    /**
     * Each guest drops this many coins in the jar at the door: `entry`, one more for every `entryEvery` games the
     * collection holds past `minGames` (a fuller flat draws a better crowd), never over `entryMax`: the collection
     * earning its keep, 30 coins an afternoon at the start, over a hundred once the shelves are full.
     */
    entry: 5,
    entryEvery: 10,
    entryMax: 20,
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

/**
 * The open house's guests: people from round about, one body each (a wave takes the next two), each a person the
 * player can talk to and who remembers them (`social/people/guests`, by the same id): `back` is their hello when met
 * before.
 */
export const GUESTS: readonly FriendPlan[] = [
  guest('guest-jo', 'Jo', 4101, { platforms: ['nes', 'snes'], genres: ['platform'], years: [1985, 1995] }, 1.12, 0.45, ['Hello! Is this the open house?', 'Hi! The paper said today.'], ['I saw it in THE GAMING WEEKLY.', 'Lovely flat.'], ['{title}! I had that one.']),
  guest('guest-ray', 'Ray', 4202, { platforms: ['megadrive', 'ps1'], genres: ['action', 'fighting'], years: [1990, 2000] }, 1.05, 0.3, ['Afternoon. Here for the collection.', 'Hello, hello. Am I early?'], ['I collect too, a bit. Not like this.', 'How long did this take you?'], ['{title}, and boxed. Respect.']),
  guest('guest-amy', 'Amy', 4303, { platforms: ['gb', 'n64'], genres: ['puzzle', 'adventure'], years: [1995, 2002] }, 1.22, 0.75, ['Hi! Is it really free to look?', 'Hello! My flatmate told me.'], ['This is so cool.', 'I only ever had a Game Boy.'], ['{title}! That was my childhood.']),
  guest('guest-ben', 'Ben', 4404, { platforms: ['nes', 'megadrive'], genres: ['sports', 'racing'], years: [1987, 1994] }, 1.0, 0.25, ['Hello there. The kids are at their gran’s.', 'Hi. Saw the poster.'], ['My wife threw mine out in ’98.', 'Do you play them all?'], ['{title}… I had forgotten that one.']),
  guest('guest-lou', 'Lucie', 4505, { platforms: ['snes', 'ps1'], genres: ['role', 'rpg'], years: [1992, 2000] }, 1.08, 0.5, ['Hello! I run the place round the corner.', 'Hi, I closed the shop for an hour.'], ['Good stock. Very good stock.', 'If you ever sell, you know where I am.'], ['{title}. I sold one last month.']),
  guest('guest-kim', 'Kim', 4606, { platforms: ['n64', 'gb'], genres: ['shooter', 'racing'], years: [1996, 2001] }, 1.18, 0.65, ['Yo! Open house, right?', 'Hey! Where do I pay?'], ['Do you speedrun any of these?', 'I need a flat like this.'], ['{title}, nice. I beat that last week.']),
];

/** Someone from the collectors' club (the market's notice board), who comes to see a completed set. */
export const CLUB_VISITOR: FriendPlan = guest(
  'club', 'Mrs Albers', 4707, { platforms: ['nes', 'snes', 'megadrive'], genres: ['platform', 'adventure'], years: [1985, 1998] }, 0.95, 0.4,
  ['Good afternoon! Albers, from the collectors’ club.', 'Hello! The club sent me, about your set.'],
  ['The club keeps a register, you know. You’re in it now.', 'We were thirty members in 1994. Now we’re twelve, and you.'],
  ['{title}. Beautiful copy.'],
);

/** Lines of the gatherings (shuffle bags kept in the `VisitBook` like the visits' own). */
export const GATHERING_LINES = {
  /** Games night: the one who rang, on coming in. */
  nightLead: ['We’re all here! Well, the others are on the stairs.', 'Games night! I brought crisps. Well, I meant to.', 'Evening! The others are parking. Or lost.'],
  /** The others, coming in behind. */
  nightFollow: ['Made it! Your stairs, honestly.', 'Evening! What are we playing?', 'Sorry, sorry, the bus.', 'Hi! Is there room for one more?'],
  /** At their spot by the TV. */
  nightSpot: ['Right, who is on player two?', 'I call the next game.', 'Is the TV on? Put something on.', 'Best seat in the house. Well, best standing.'],
  /** Player two offers a match. */
  offer: ['Fancy a round of PADDLE WARS? I’m player two.', 'Come on, PADDLE WARS, you and me.', 'One match. Loser makes the tea.', 'Grab the stick, I’ll take player two.'],
  /** A goal for the player, seen by the others. */
  goalFor: ['Ha! Get in!', 'Nice one!', 'Did you see that?', 'Too fast for {name}!'],
  /** A goal for player two. */
  goalAgainst: ['Ooh, unlucky.', '{name} is on fire.', 'Defence! Defence!', 'You let that in on purpose.'],
  /** The match over: the player won, lost, or drew. */
  won: ['{you} to {them}! The champion of the flat.', 'Beaten by the host. Typical.', 'Rematch. I demand a rematch.'],
  lost: ['{them} to {you}! I’m the champion of your flat now.', 'Ha! Home advantage, my foot.', 'Better luck next time, host.'],
  drew: ['{you} all! Nobody wins, nobody makes the tea.', 'A draw. Diplomatic.'],
  /** A friend's own words as player two (`NIGHT_VOICES`) before these. */
  /** With the Nguyens' pad lent, the next friend takes player two. */
  padTurn: ['My turn! Hand over the Nguyens’ pad.', 'Winner stays on? Fine. My go.', 'Move over. Player two is mine now.'],
  /** The evening winding down. */
  nightLeave: ['Right, I have work tomorrow. Brilliant night!', 'Same time next week? Same time next week.', 'Thanks for having us! Night!', 'I’m taking the crisps. Night!'],
  /** Open house: coming in, the coins in the jar. */
  houseEnter: ['{coins} coins in the jar? Gladly.', 'There, {coins} coins. Worth it already.', 'Here’s my {coins}. Where do I start?'],
  /** A guest met at an earlier open house, on coming in. */
  houseBack: ['Me again! I told everyone about your shelves.', 'Back for more! Has anything new gone up?', 'Hello again! I brought a friend. Well, I meant to.', 'You remember me? Good. I remember your shelves.'],
  /** A rare piece seen (a famous game, a first print, a grail). */
  houseRare: ['{title}! I’ve only ever seen that in a magazine.', 'Is that {title}? A real one?', 'You have {title}. Do you know what that’s worth?', 'Look at {title}. Just look at it.'],
  /** A display case (`showcased`): the pieces on show. */
  houseDisplay: ['They deserve their glass, these.', 'The case is the best part. {title}!', 'Under glass, like a museum. Which it is.'],
  houseLeave: ['Thank you! I’ll tell my friends.', 'What a collection. Thank you!', 'Bye! Same again next year?', 'I’ll be back. With my wallet.'],
  /** The club's visitor: at the set's neon. */
  clubSet: ['{set}, complete. The club congratulates you.', 'So this is {set}. All of it. Well done.', 'A neon, even. The club approves.'],
  clubConsole: ['Every game of the {platform} list. That’s rare, these days.', 'The whole {platform} list! I have to sit down. Well, not really.'],
  clubGift: ['The club’s thanks: {coins} coins, from the kitty.', 'And this is from the club: {coins} coins. Spend it on games.'],
} as const;

/** Player two's words in their own voice, by friend: Marco talks trash, Sam is too tired to, Inès is above it. */
export const NIGHT_VOICES: Readonly<Record<string, Partial<Record<'offer' | 'won' | 'lost' | 'goalAgainst', readonly string[]>>>> = {
  marco: {
    offer: ['PADDLE WARS. You and me. I’ll go easy on you. I won’t.', 'Pick up the pad. Prepare to be humbled.', 'Duel record holder, player two. Just so you know who you’re playing.'],
    won: ['Lag. That was lag. Rematch.', 'You got lucky. Twice. REMATCH.', 'I let you have that one. For the host. Never again.'],
    lost: ['{them} to {you}. Bow. Go on, bow.', 'And that’s why I hold the record. Held. Hold.', 'Easy. Too easy. Who’s next?'],
  },
  sam: {
    offer: ['Fancy a round? Be gentle, I’ve been up all night.', 'One match before I fall asleep on your floor.'],
    won: ['Beaten by the host. Fair play. I was on nights.', 'You win. I blame the hospital.'],
    lost: ['Ha! Night-shift reflexes!', '{them} to {you}! Did you see that? I didn’t, I was half asleep.'],
  },
  ines: {
    offer: ['One match. Then we talk about the order of your shelves.', 'Player two. I’ll pretend to care about the score.'],
    won: ['Fine. You win. I was looking at your shelves.', 'Well played. Don’t let it go to your head.'],
    lost: ['{them} to {you}. Don’t sulk.', 'I wasn’t even trying. Imagine if I tried.'],
  },
};

function guest(id: string, name: string, seed: number, taste: FriendPlan['taste'], speed: number, pitch: number, greet: string[], smalltalk: string[], loved: string[]): FriendPlan {
  return { id, name, seed, taste, speed, borrowChance: 0, voice: { pitch }, lines: { greet, smalltalk, loved } };
}
