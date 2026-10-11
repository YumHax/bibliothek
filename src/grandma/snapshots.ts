import type { SeasonName } from '@/time/season';

/*
 * THE ALBUM'S OTHER PHOTOS (docs/grandma.md "The album's other photos"): what Mémé's album holds besides the memories
 * she can tell as films. Snapshots she comes across a visit at a time (in a drawer, behind another print, when a game
 * shown to her rings a bell), the family's prints that were always in it, and what she wrote on the back of each, the
 * memories' prints included. Words only: the stills are drawn in `world/grandma/albumStills`, the pages put together in
 * `world/grandma/albumSpreads`.
 */

/** What she wrote on the back of a print: when, where, a line. */
interface PhotoBack {
  date: string;
  place: string;
  line: string;
}

/** What a snapshot's finding reads (`AlbumFinds`). */
export interface SnapshotFacts {
  /** Visits to hers, this one included. */
  visits: number;
  /** A memory of the album seen. */
  seen(id: string): boolean;
  /** How close she is to the player: 1 Friendly, 2 Friend (where she starts), 3 Close (`social/tiers`). */
  closeness: number;
  /** A game shown to her (the gift "show her"), by its id. */
  shown(gameId: string): boolean;
  /** She has been given this (flowers, cake) at least once. */
  given(gift: 'flowers' | 'cake'): boolean;
  /** The time of year now. */
  season: SeasonName;
}

/** A photo of hers with her words: its caption in her hand, its year (its place in the album), its back, what she says. */
interface AlbumPhoto {
  id: string;
  caption: string;
  year: number;
  back: PhotoBack;
  /** What she says, looking at it with the player (2 to 4 lines, in turn). */
  lines: readonly string[];
}

/** A snapshot: found one day, by what `found` reads. */
export interface Snapshot extends AlbumPhoto {
  found(facts: SnapshotFacts): boolean;
  /** For one a game rings a bell for: the game's id (`found` reads it shown), and what she says when it is shown to her. */
  game?: { id: string; line: string };
}

/** The games of Félix's notebook (`story/FelixNotebook`) that bring a photo back to her, and what she says then. */
const shownGame = (id: string, line: string): Snapshot['game'] => ({ id, line });

export const SNAPSHOTS: readonly Snapshot[] = [
  {
    id: 'theBoys',
    caption: 'The boys, ’65',
    year: 1965,
    back: { date: 'June 1965', place: 'The garden, rue des Tanneurs', line: 'Gaspard with his money box. He would not put it down for the photo.' },
    lines: [
      'Gaspard was six there, Félix five. Look at Gaspard’s face.',
      'He had that money box everywhere. To the table, to bed.',
      'Félix has a stick. He was a knight that summer. Gaspard charged him rent for the garden.',
    ],
    found: (facts) => facts.seen('row'),
  },
  {
    id: 'conkers',
    caption: 'Conkers, ’68',
    year: 1968,
    back: { date: 'October 1968', place: 'The park by the school', line: 'Félix’s pockets full. Mine to empty, as usual.' },
    lines: ['Every autumn, the conkers. He lined them up on the windowsill like trophies.', 'Then they went wrinkly and he cried. Every autumn.'],
    found: (facts) => facts.season === 'autumn' && facts.visits >= 2,
  },
  {
    id: 'movingDay',
    caption: 'Moving in, ’71',
    year: 1971,
    back: { date: 'March 1971', place: 'Here!', line: 'The day we came to Linden Avenue. The boxes stayed in the hall a year.' },
    lines: [
      'This flat, the day we moved in. The same wallpaper, I’m afraid.',
      'Your grandfather carried the sideboard up four floors. He never let anyone forget it.',
      'Félix had a box of his own. Comics. He wouldn’t let the movers touch it.',
    ],
    found: (facts) => facts.visits >= 4,
  },
  {
    id: 'yourMother',
    caption: 'Your mother, ’76',
    year: 1976,
    back: { date: 'Summer 1976', place: 'The balcony', line: 'Thirteen, and already rolling her eyes at the camera.' },
    lines: ['Your mother. Thirteen. Furious about something, look at her.', 'She and Félix got on. Gaspard teased her; Félix took her side, always.'],
    found: (facts) => facts.visits >= 6,
  },
  {
    id: 'pongBox',
    caption: 'The television game, ’77',
    year: 1977,
    back: { date: 'Christmas 1977', place: 'The living room', line: 'Two white bars and a ball. He played it until the knobs came off.' },
    lines: [
      'His first one. Two little bars and a square. I thought it was a radio.',
      'He saved for it all year. Paper round, washing cars.',
      'Gaspard said it was a waste. Félix said Gaspard was a waste. I sent them both to bed.',
    ],
    found: (facts) => facts.visits >= 2,
  },
  {
    id: 'garden',
    caption: 'My dahlias, ’80',
    year: 1980,
    back: { date: 'August 1980', place: 'The allotment', line: 'First prize at the show. Second, really, but the judge was blind.' },
    lines: ['My allotment. I had dahlias as big as your head.', 'Félix came to help and ate the strawberries. That was his help.'],
    found: (facts) => facts.given('flowers'),
  },
  {
    id: 'camping',
    caption: 'Camping, ’84',
    year: 1984,
    back: { date: 'July 1984', place: 'The Ardèche', line: 'It rained eleven days out of twelve. Félix brought a handheld and a bag of batteries.' },
    lines: [
      'The holiday it never stopped raining. Look at the tent, sagging.',
      'Félix sat in the car with his little game the whole time, the one with two screens that folds.',
      'Your grandfather pretended to be cross. He played it at night, I saw him.',
    ],
    found: (facts) => facts.season === 'summer' && facts.visits >= 2,
  },
  {
    id: 'firstShelf',
    caption: 'His first shelf, ’85',
    year: 1985,
    back: { date: '1985', place: 'Félix’s first flat', line: 'One plank on two bricks. Everything on it in order, even then.' },
    lines: ['His first flat. One plank, two bricks, and every box in order.', 'He showed it to me like a cathedral. I said: where do you sit? He hadn’t thought of that.'],
    found: (facts) => facts.seen('wednesdays'),
  },
  {
    id: 'snowDay',
    caption: 'Snow, ’86',
    year: 1986,
    back: { date: 'January 1986', place: 'Linden Avenue', line: 'The whole avenue white. Félix twenty-six and building a snowman like a boy.' },
    lines: ['The big snow. The buses stopped for three days.', 'He made a snowman with a cartridge for a nose. It was a broken one, he swore.'],
    found: (facts) => facts.season === 'winter' && facts.visits >= 2,
  },
  {
    id: 'zeldaMap',
    caption: 'The map, ’88',
    year: 1988,
    back: { date: 'Winter 1988', place: 'Félix’s kitchen table', line: 'Squared paper all over the table. Don’t touch, he said, it’s Hyrule.' },
    lines: ['Look at all that paper. He drew a map of the whole game, square by square.', 'I asked where Hyrule was. He said: everywhere, Mum. I still don’t know.'],
    found: (facts) => facts.shown('nes-legend-of-zelda'),
    game: shownGame('nes-legend-of-zelda', 'The gold one! He drew maps of it on squared paper. I’ve a photo of that somewhere… in the album, I think.'),
  },
  {
    id: 'thirtieth',
    caption: 'Félix is thirty',
    year: 1990,
    back: { date: '14 May 1990', place: 'At this table', line: 'Chocolate cake, thirty candles, the fire brigade very nearly.' },
    lines: ['His thirtieth. I made the cake. It leaned.', 'He blew the candles out in one go and said he’d wished for a console. Thirty years old!'],
    found: (facts) => facts.given('cake'),
  },
  {
    id: 'marioChristmas',
    caption: 'Christmas ’90',
    year: 1990,
    back: { date: 'Christmas 1990', place: 'Here, by the tree', line: 'He bought it for himself and wrapped it anyway, so he’d have something to open.' },
    lines: ['Christmas 1990. Look at him with that box, like a boy.', 'He wrapped it himself and put it under my tree. Then acted surprised.'],
    found: (facts) => facts.shown('nes-super-mario-bros-3'),
    game: shownGame('nes-super-mario-bros-3', 'That one! Christmas 1990, he wrapped it for himself. There’s a photo of it in my album, I’m sure.'),
  },
  {
    id: 'easter',
    caption: 'Easter ’92',
    year: 1992,
    back: { date: 'Easter 1992', place: 'The park', line: 'You found eleven eggs. Félix hid twelve. We never found the twelfth.' },
    lines: ['You, at three, with your basket. Félix hid the eggs.', 'He hid them far too well. You cried, he dug them out with you. All but one.'],
    found: (facts) => facts.season === 'spring' && facts.visits >= 2,
  },
  {
    id: 'onTheTrain',
    caption: 'The Lyon train, ’94',
    year: 1994,
    back: { date: '1994', place: 'The Lyon train', line: 'A colleague took it. Félix never looked up.' },
    lines: ['Somebody from his work took that. He’s on the train, and look, the little grey game.', 'Every month to Lyon and back, and he never once looked out of the window.'],
    found: (facts) => facts.shown('gb-zelda-links-awakening'),
    game: shownGame('gb-zelda-links-awakening', 'The one he played on the train! A colleague of his took a photo once. It’s in the album now.'),
  },
  {
    id: 'queue',
    caption: 'Third in the queue, ’98',
    year: 1998,
    back: { date: 'December 1998', place: 'Outside the shop', line: 'In the rain since five in the morning. Third. He was furious about the two in front.' },
    lines: ['He queued all night for that one. In the rain. I brought him a thermos.', 'I took the photo so I’d have proof I had a son that silly.'],
    found: (facts) => facts.shown('n64-zelda-ocarina-of-time'),
    game: shownGame('n64-zelda-ocarina-of-time', 'Oh, that one. He queued in the rain for it, I took him a thermos. I took a photo too, it’s in the album.'),
  },
  {
    id: 'cafeSwap',
    caption: 'The café, ’99',
    year: 1999,
    back: { date: '1999', place: 'Café du Marché', line: 'Some swap with a boy at the next table. He looked very pleased with himself.' },
    lines: ['The café on the square. He swapped something with a boy at the next table.', 'Two grown men with their little games, heads together. I took a photo, for the blackmail.'],
    found: (facts) => facts.shown('gb-pokemon-red'),
    game: shownGame('gb-pokemon-red', 'The little red one! He did a swap with somebody in a café for it, I was there. I’ll put the photo in the album.'),
  },
  {
    id: 'park',
    caption: 'You and Félix, ’01',
    year: 2001,
    back: { date: 'Spring 2001', place: 'The park by the river', line: 'The two of you on the bench, one game each, not a word for an hour.' },
    lines: ['You two on a bench. One game each, not a word for an hour.', 'I asked what you were doing. Félix said: talking. You both laughed. I didn’t get it.'],
    found: (facts) => facts.closeness >= 3,
  },
  {
    id: 'odette',
    caption: 'Me, ’52',
    year: 1952,
    back: { date: 'April 1952', place: 'The dance at the Salle des Fêtes', line: 'The night I met your grandfather. Don’t look at the shoes.' },
    lines: ['That’s me. Don’t laugh.', 'The night of the dance. Your grandfather took it, then trod on my feet all evening.', 'I only show that one to people I like, you know.'],
    found: (facts) => facts.closeness >= 3 && facts.visits >= 10,
  },
  {
    id: 'lastFelix',
    caption: 'Félix, last spring',
    year: 2025,
    back: { date: 'Last spring', place: 'His window', line: 'The last one of him. He didn’t know I took it.' },
    lines: ['The last one I have of him. At his window, looking down at the street.', 'He was waiting for the post. A parcel, a game. Always a parcel.', 'I’m glad you’re in his flat, love. Glad it’s you.'],
    found: (facts) => facts.seen('leaving'),
  },
];

/** The family's prints that were always in the album (the same prints as on her walls: she had two made of each). */
export const FAMILY_SNAPS: readonly AlbumPhoto[] = [
  {
    id: 'wedding',
    caption: 'Our wedding, ’58',
    year: 1958,
    back: { date: '12 September 1958', place: 'The town hall', line: 'It rained at eleven and stopped at noon. My mother said that was a sign. Of what, she never said.' },
    lines: ['Our wedding. Your grandfather’s suit was borrowed. Too short in the arms, look.', 'Six years after the dance. He took his time, that man.'],
  },
  {
    id: 'felixBoy',
    caption: 'Félix, ’66',
    year: 1966,
    back: { date: 'Summer 1966', place: 'The garden', line: 'Six, and that ball. He slept with it.' },
    lines: ['Félix at six. That ball went everywhere with him.', 'The pear tree is still there, you know. Someone else’s garden now.'],
  },
  {
    id: 'seaside',
    caption: 'The seaside, ’74',
    year: 1974,
    back: { date: 'August 1974', place: 'Saint-Malo', line: 'Félix at fourteen, too old for the bucket and still carrying it.' },
    lines: ['Saint-Malo. My hat blew off twice and Félix ran after it twice.', 'Gaspard took the photo. He charged me for the film.'],
  },
  {
    id: 'felixYoung',
    caption: 'Félix, ’83',
    year: 1983,
    back: { date: '1983', place: 'His room', line: 'His first real console. He said one day he’d fill a whole wall with them.' },
    lines: ['His room, his first proper console. Look at the cartridge, held up like a medal.', 'He said he’d fill a wall one day. He filled three.'],
  },
  {
    id: 'school',
    caption: 'You, ’96',
    year: 1996,
    back: { date: 'Autumn 1996', place: 'Your school', line: 'Your front tooth! You lost it on a caramel at mine.' },
    lines: ['Your school photo. The tooth, look. You lost it on one of my caramels.', 'Félix kept a copy in his wallet. Next to a photo of a screen, would you believe.'],
  },
  {
    id: 'felixAndMeme',
    caption: 'My birthday, ’14',
    year: 2014,
    back: { date: 'March 2014', place: 'At this table', line: 'Félix came on the bus with a cake from the good bakery. Five candles, one per decade-and-a-half, he said.' },
    lines: ['My birthday. He came on the bus with a cake and five candles.', 'One for every fifteen years, he said. He thought he was very funny.'],
  },
];

/** What she pencilled in the corners of a memory not in the album yet: a name, nothing more (docs/grandma.md). */
export const MEMORY_PENCIL: Readonly<Record<string, string>> = {
  christmas95: 'Christmas, ’95',
  wednesdays: 'Wednesdays…',
  row: 'Sunday supper, ’99',
  arcade: 'The arcade, ’03',
  leaving: 'The last Wednesday',
  sale: 'The sale',
  keys: 'The keys',
};

/** The memories' years (their place among the photos) and what she wrote on their backs (a nudge, sometimes, to the next). */
export const MEMORY_NOTES: Readonly<Record<string, { year: number; back: PhotoBack }>> = {
  christmas95: { year: 1995, back: { date: 'Christmas 1995', place: 'Here, by the tree', line: 'One game, and you on the rug. By the summer he had you counting ten on his shelf.' } },
  wednesdays: { year: 1998, back: { date: '1998', place: 'Félix’s flat', line: 'Every Wednesday. He said he’d take you to the arcade once you could reach the buttons.' } },
  row: { year: 1999, back: { date: 'A Sunday, 1999', place: 'At this table', line: 'The night of the potatoes. Félix wrote everything in a notebook after; he always did when he was cross.' } },
  arcade: { year: 2003, back: { date: 'A Saturday, 2003', place: 'The arcade on Front Street', line: 'Your three letters at the top. He kept the notebook of his favourites in a drawer. Always a drawer.' } },
  leaving: { year: 2007, back: { date: 'September 2007', place: 'Félix’s flat', line: 'Half of these are yours, he said. He meant it. He meant all of them, really.' } },
  sale: { year: 2025, back: { date: 'This spring', place: 'The saleroom', line: 'Four hundred and twelve lots. If even one of his came home, he’d be pleased. Even one.' } },
  keys: { year: 2026, back: { date: 'This year', place: 'Here, then your landing', line: 'He talked about a grey cartridge at the end. I never knew what he meant.' } },
};

/** What she says as she glues the player's own photos in after Félix's pages, and on their backs. */
export const PRINT_WORDS = {
  /** The entry of her conversation. */
  give: 'Give her your photos',
  /** Her thanks, as she takes them. */
  thanks: [
    'Photos! Of your flat? Let me find the glue.',
    'Look at that. Your flat. His shelves, your things on them.',
    'I’ll put them in after his. That’s the right place for them.',
  ],
  /** Her captions on the player's prints, in turn. */
  captions: ['Your flat', 'Look at that', 'Your shelves', 'Yours now', 'Your things', 'Like his, almost', 'Your photo'],
  /** Her line on their backs. */
  back: 'From you, on a visit. Glued in after his.',
  /** On the way in, once, when she has none of the player's photos yet and the player has been a few times. */
  ask: 'You should bring me photos of the flat, you know. I’d like to see what you’ve done with it. My knees won’t do the stairs.',
  /** The album full of the player's prints: she keeps the old ones in the drawer. */
  full: 'There’s no room left, so the old ones go in the drawer. I keep them, don’t worry.',
  /** On the way in, when a snapshot was found since the last visit. */
  found: [
    'I was tidying the drawer and look what turned up. It’s in the album, on the table.',
    'I found an old photo behind another one. Have a look, it’s in the album.',
    'There’s a new old photo in the album. Don’t ask me where it was hiding.',
  ],
} as const;
