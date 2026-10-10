import type { PlatformId } from '@/catalog/types';
import type { ClueId } from '@/building/hunt/huntPlan';
import type { StoryStage } from '@/story/prototype';

/*
 * THE COURTYARD'S KIDS, as data (`building/kids/yardKids` reads it, `world/courtyard/YardKids` puts them in the yard):
 * the building's children down in the yard after school with a handheld, carts to swap, a score to beat and every
 * piece of news in the building. Hugo is the Moreaus' son, Mai and Tuan the Nguyens' twins (one handheld between
 * them), Lina Mrs Haddad's niece, there on Wednesdays and at weekends. Numbers, words and when, here; rules there.
 */

export type KidId = 'hugo' | 'mai' | 'tuan' | 'lina';

/** What a kid plays on: its shell (the world's model and the challenge's frame). */
export type HandheldKind = 'pocket' | 'colour' | 'sega';

export interface KidPlan {
  id: KidId;
  name: string;
  age: number;
  /** Their family on the stairs (the parent's person id), and the role the People book gives them. */
  family: string;
  role: string;
  /** Their handheld; null: they share someone else's (`shares`), looking over a shoulder. */
  handheld: HandheldKind | null;
  shares?: KidId;
  /** The carts in their pencil case come from these platforms; kids who share a handheld share the case too. */
  carts: readonly PlatformId[];
  /** `school`: every day after school; `free`: only Wednesdays and weekends (Lina comes to her aunt's then). */
  days: 'school' | 'free';
  /** Their game on the handheld (an arcade game's id) and how good they are at it, in tickets' worth of points. */
  game: 'snake' | 'frog' | 'stacker' | 'breakout';
  skill: readonly [number, number];
  /** How they look: their body's seed, their height (m), hair kept long or not. */
  look: { seed: number; height: number; long?: boolean };
}

export const KIDS: readonly KidPlan[] = [
  { id: 'hugo', name: 'Hugo Moreau', age: 12, family: 'moreau', role: 'the Moreaus’ son, 4th floor', handheld: 'colour', carts: ['gb', 'nes'], days: 'school', game: 'snake', skill: [14, 26], look: { seed: 4101, height: 1.5 } },
  { id: 'mai', name: 'Mai Nguyen', age: 8, family: 'nguyen', role: 'one of the Nguyen twins, 3rd floor', handheld: 'pocket', carts: ['gb'], days: 'school', game: 'frog', skill: [9, 18], look: { seed: 4207, height: 1.28, long: true } },
  { id: 'tuan', name: 'Tuan Nguyen', age: 8, family: 'nguyen', role: 'one of the Nguyen twins, 3rd floor', handheld: null, shares: 'mai', carts: ['gb'], days: 'school', game: 'frog', skill: [8, 17], look: { seed: 4213, height: 1.3 } },
  { id: 'lina', name: 'Lina Haddad', age: 10, family: 'haddad', role: 'Mrs Haddad’s niece, Wednesdays and weekends', handheld: 'sega', carts: ['megadrive'], days: 'free', game: 'breakout', skill: [11, 22], look: { seed: 4333, height: 1.4, long: true } },
];

export const KIDS_RULES = {
  /** When they are down, game hours: after school, Wednesday afternoons, weekend mornings and afternoons. */
  hours: {
    school: [[16.75, 19.25]] as readonly (readonly [number, number])[],
    wednesday: [[13.5, 19.25]] as readonly (readonly [number, number])[],
    weekend: [[10.5, 12.5], [14.5, 19.5]] as readonly (readonly [number, number])[],
  },
  /** Some days a kid stays in (homework, a cold): the odds they come down, drawn per kid and game day. */
  comesDown: 0.85,
  /** Each comes a little after the window opens and goes a little before it shuts (game hours, drawn per day). */
  late: 0.5,
  early: 0.35,
  /** Rain this hard, or a sky this dark, sends them in. */
  rainOver: 0.2,
  daylightUnder: 0.16,
  /** Carts in a pencil case (drawn per game week); the odds one of them is a big hit of their platform. */
  carts: 3,
  hitChance: 0.5,
  /**
   * How a kid weighs a game: how many people read about it (monthly page views), never its price. A big name is
   * hyped (`hype`), their own cart is worth a bit more to them (`own`), a game for another machine a bit less
   * (`otherMachine`). A game they never heard of (no article) is worth `unheard`; one still being looked up, `unknown`.
   */
  weigh: { own: 1.15, otherMachine: 0.75, hype: 2, unheard: 25, unknown: 250 },
  /** Names every kid has heard of. */
  hyped: /mario|zelda|pok[eé]mon|sonic|tetris|kirby|donkey kong|mega ?man|street fighter|metroid|wario|yoshi|final fantasy|bomberman|tony hawk|crash|spyro|goldeneye/i,
  /** The offer against what they give: from `yes` a deal, from `more` a deal with tickets thrown in, below that a no. */
  yes: 1,
  more: 0.6,
  /** The tickets they ask on top, by how short the offer falls: under half way, then under that. */
  tickets: [10, 20, 30] as const,
  /** Offers they will hear in one go before they want to get back to their game. */
  offers: 6,
  /** What a swap does between you (warmth, trust), a challenge played (won or lost: they love a go against a grown-up), the news. */
  swapWarmth: 5,
  swapTrust: 3,
  challengeWarmth: 3,
  newsWarmth: 1,
  /** Their score grows with the games they lost to the player (they practise): each loss, by this, up to `practiceCap`. */
  practice: 0.12,
  practiceCap: 2,
  /** The first time the player beats them in a game week, the odds they hand over a cart they are bored of. */
  boredCart: 0.5,
} as const;

/** What they say. `{n}` is a number of tickets, `{game}` a title, `{owner}` a neighbour, `{when}` a day. */
export const KIDS_LINES = {
  hello: ['Hi!', 'Oh, it’s you.', 'Hey! Look, I’m on the last level.', 'Shh, I’m concentrating.'],
  yes: ['Deal! No take-backs!', 'Yesss. Shake on it.', 'OK OK OK. Deal.', 'Done. You can’t change your mind now.'],
  boxToo: ['Can I keep the box? It’s going on my shelf.', 'With the box! Nobody at school has the box.'],
  more: ['Hmm… only if you throw in {n} tickets. For the arcade.', 'Add {n} tickets and it’s yours.', '{n} tickets on top. Final offer. Maybe.'],
  no: ['Nah. Nobody plays that.', 'No way, that’s my best one!', 'My cousin says that one’s rubbish.', 'Hmm. No.'],
  unheard: ['Never heard of it. Is that even a real game?', 'What even is that?', 'Is that one of your weird old ones?'],
  otherMachine: ['That doesn’t even go in my handheld.', 'I can’t play that here though.'],
  talkedOut: ['Stop asking, I’m trying to play!', 'Ask me tomorrow. I’m busy.'],
  thinking: ['Hmm…', 'Let me think…', 'Wait wait wait.'],
  swapOpen: ['Swap? Show me what you’ve got.', 'OK, but no rubbish ones.', 'I only swap good ones.'],
  challenge: ['Bet you can’t beat me. One go!', 'You? Against me? OK. One go.', 'My score’s on it. Try and beat it.'],
  won: ['No way! Again tomorrow. I’m practising tonight.', 'You cheated. How did you do that?', 'OK that was good. Lucky, but good.'],
  lost: ['HA! Grown-ups are so bad at this.', 'Told you. Want another go?', 'Better luck next time, old person.'],
  quit: ['Chicken!', 'You can’t stop in the middle!'],
  bored: ['Here, have this one. I’m bored of it anyway.', 'Keep this one. I’ve finished it like ten times.'],
  /** Their cheer and their groan, watching another kid's go or the player's. */
  cheer: ['Yesss!', 'GO GO GO!', 'Whoa!'],
  groan: ['Noooo!', 'Aww!', 'Ugh, again!'],
  noNews: ['Nothing happens here. Ever.', 'That’s all I know! Ask me tomorrow.', 'Nope. Nothing.'],
} as const;

/** The news, in their words: what is coming to the yard, the building's hunt, the lost game, Victor, the cupboards. */
export const KIDS_NEWS = {
  bulkyTomorrow: '{owner} is putting stuff out by the bins tomorrow. My mum saw boxes!',
  bulkyConsole: ' There’s a console in it, I think. A real one!',
  bulkyToday: 'There’s free stuff by the bins! Games too, I checked.',
  party: 'There’s a party down here {when}! With a cabinet and everything.',
  rivalStreet: 'That man in the long coat is outside RETRO GAMES again. He looks at everybody’s carts like this.',
  rivalMarket: 'That collector was at the flea market this morning. Buying EVERYTHING.',
  /** The treasure hunt: a nudge towards the next place, by the clue last found. */
  hunt: {
    letter: 'The cellars go really far back. I’m not allowed down there. The concierge has the key.',
    chalk: 'There’s a mailbox in the hall with no name on it. Creepy, right?',
    mailbox: 'Everybody says if you press the lift buttons in a special order something happens. I tried. Nothing happened.',
    board: 'Somebody carved letters in our chestnut tree. Ages ago. A.V. Who’s A.V.?',
    chestnut: 'Old Vasseur lived right at the top, under the roof. There’s a trunk up there, I bet.',
  } satisfies Partial<Record<ClueId, string>>,
  /** The lost prototype: a nudge towards where the trail goes on, by its stage. */
  story: {
    clipping: 'The NES man at the flea market knows EVERYTHING about old games. Ask him anything.',
    stall: 'My mum has the radio on in the kitchen every morning. Boring stuff. But they talked about a lost game!',
    radio: 'Gus at the arcade knows who made every game. Every single one.',
    arcade: 'There’s a man outside RETRO GAMES some days with a suitcase full of games. Also the small ads! In the paper!',
    trader: 'Your friends should come round more. Grown-ups always know stuff.',
    found: 'Did you try the grey cartridge in the NES yet? DO IT.',
  } satisfies Partial<Record<StoryStage, string>>,
  /** What is in the building's cupboards, heard through the walls. */
  cupboards: [
    'Mr Martin has a box of his brother’s cartridges in the cellar. He never opens it. Never.',
    'Mrs Roux has a box of games in her wardrobe. For her grandson. He’s like thirty.',
    'Mr Girard lost his Game Boy on a train when he was a kid. He told me. Twice.',
    'The student in the attic opens up consoles with a screwdriver. On purpose!',
    'Lina’s aunt has ALL the Sega games. She won’t let Lina touch the good ones.',
  ],
} as const;
