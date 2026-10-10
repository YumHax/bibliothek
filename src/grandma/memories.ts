/*
 * The memories in Mémé's album (docs/story.md "Mémé"): the player's childhood with Félix, from the first console to
 * the day the keys came too late, each unlocked by something done in the game. A memory plays only once its film is
 * built (`GrandmaVisits.setFilmed`, the reels in `world/grandma/`).
 */

/** What a memory's unlocking may read (`GrandmaVisits`, from the services' stores). */
export interface MemoryFacts {
  /** Visits to Mémé's, this one included. */
  visits: number;
  /** Games in the collection (owned or lent). */
  gamesOwned: number;
  /** Medals won on the arcade's machines, all told. */
  arcadeMedals: number;
  /** Félix's notebook found at the back of its drawer. */
  notebookFound: boolean;
  /** One of the notebook's games come home after it was found: a copy of his bought back. */
  felixHome: boolean;
  /** A club set complete (docs/economy.md). */
  clubSet: boolean;
  /** The lost prototype found (the trail's end). */
  prototypeFound: boolean;
  /** The memories already seen. */
  seen: number;
}

export interface Memory {
  id: string;
  /** Its title on the film's last card and on the album's caption. */
  title: string;
  unlocked(facts: MemoryFacts): boolean;
  /** What she says once the film is over and the player is back in the room, the first time. */
  after: string;
  /** And when it is watched again. */
  againAfter: string;
}

/** The dream room is not built yet: a room this full stands in for it (memory 7). */
const FULL_ROOM = 120;

export const MEMORIES: readonly Memory[] = [
  {
    // The Christmas the player was six: Félix's present, the first console (the first visit opens the album).
    id: 'christmas95',
    title: 'Christmas 1995',
    unlocked: (facts) => facts.visits >= 1,
    after: 'He was a good boy, your uncle. Stubborn, but good.',
    againAfter: 'The sports pages. He never bought wrapping paper in his life.',
  },
  {
    // Wednesdays at Félix's: the child on the floor before his set, the shelves full.
    id: 'wednesdays',
    title: 'Wednesdays at Félix’s',
    unlocked: (facts) => facts.gamesOwned >= 10,
    after: 'Every Wednesday. Your mother said you’d ruin your eyes. You didn’t, did you?',
    againAfter: 'Those shelves… I dusted them once. He moved everything back a centimetre.',
  },
  {
    // The arcade: Félix takes the teenager, the first high score.
    id: 'arcade',
    title: 'Three letters',
    unlocked: (facts) => facts.arcadeMedals >= 1,
    after: 'He kept the photo of that screen in his wallet. Your three letters.',
    againAfter: 'He was so proud you’d have thought he’d won it himself.',
  },
  {
    // The row: Félix and Gaspard at Mémé's table, "your cartridges are money asleep".
    id: 'row',
    title: 'Money asleep',
    unlocked: (facts) => facts.notebookFound,
    after: 'I should have said something that night. I passed the potatoes.',
    againAfter: 'Gaspard was always counting. Even as a boy, he counted his sweets.',
  },
  {
    // Leaving: the player off to study, the last visit to Félix, a promise.
    id: 'leaving',
    title: 'The last Wednesday',
    unlocked: (facts) => facts.gamesOwned >= 50 || facts.clubSet,
    after: 'You kept your promise, you know. You came back. Just a bit late, like all of us.',
    againAfter: 'He stood at the window till the bus turned the corner. He told me so.',
  },
  {
    // The sale, as Mémé saw it: Gaspard, the papers, Crane in the front row.
    id: 'sale',
    title: 'Lot 1 to 412',
    unlocked: (facts) => facts.felixHome,
    after: 'I signed where Gaspard pointed. I should have read them. I’m sorry, love.',
    againAfter: 'That man in the front row raised his card for everything. Everything.',
  },
  {
    // The keys: Mémé hands them over, a day too late; it meets the opening. Last: the six before it seen.
    id: 'keys',
    title: 'A day late',
    unlocked: (facts) => facts.seen >= 6 && (facts.prototypeFound || facts.gamesOwned >= FULL_ROOM),
    after: 'There. Now you know all of it. It’s your flat, love. It always was going to be.',
    againAfter: 'A day late. And look what you did with it.',
  },
];
