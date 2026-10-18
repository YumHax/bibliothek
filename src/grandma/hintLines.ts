import type { MemoryFacts } from './memories';

/*
 * MÉMÉ'S HINTS, IN HER WORDS (docs/grandma.md "Hints toward the next memory"): what she lets slip about the next photo
 * of her album, vaguer the first time, clearer the visits after, always as her memories and never as a rule; when she
 * rings the player because she found more photos, the message she leaves when nobody answers, the letter she posts
 * when the player has not been round for days, and the journal's line of what she said.
 */

/** What a hint may read: the memories' facts, and whether the grey cartridge's trail has started. */
export interface HintFacts extends MemoryFacts {
  trailStarted: boolean;
}

/** A tier's lines: fixed, or read off the facts (what blocks, in her words). */
type Tier = readonly string[] | ((facts: HintFacts) => readonly string[]);

/** "Seven games", "One game", "Not one game" (her way of counting the player's shelves). */
function games(n: number): string {
  return n <= 0 ? 'Not one game' : n === 1 ? 'One game' : `${n} games`;
}

/**
 * Per memory still locked (`MEMORIES` id): three tiers, vague, warmer, then clear but still hers. The first memory
 * plays on the first visit and needs none.
 */
export const HINTS: Readonly<Record<string, readonly [Tier, Tier, Tier]>> = {
  wednesdays: [
    ['Félix’s shelves were never empty. Not one gap. It drove me mad, the dusting.', 'He used to say a room without games was a waiting room.'],
    ['There’s a packet of Wednesdays somewhere. You on his floor, his shelves full behind you. It’ll come back to me.'],
    (f) => [`${games(f.gamesOwned)}, is it? Félix used to say a shelf starts at ten boxes. Get to ten and I’ll dig out your Wednesdays.`],
  ],
  arcade: [
    ['Félix couldn’t walk past an arcade. Neither could you, at fourteen.'],
    ['He took you to the arcade on Saturdays, you remember? He let you think he was trying.'],
    (f) =>
      f.arcadeMedals > 0
        ? ['That arcade photo is somewhere. Three letters on a screen.']
        : ['You’ve never won anything at that arcade on Front Street? Félix lived there on Saturdays. Win one of their medals and I’ll show you a photo he was very proud of.'],
  ],
  row: [
    ['Félix wrote everything down. Prices, dates, who he lent what to.'],
    ['He kept a notebook of the games he loved. An old school exercise book. I wonder where it went.'],
    ['His notebook must still be in that flat, at the back of a drawer. He never threw paper away. Find it, and I’ll tell you about a Sunday I’d rather forget.'],
  ],
  leaving: [
    ['You went off to study with a suitcase and a promise. Do you remember the promise?'],
    ['There’s one photo I keep face down. Your last Wednesday at his. When that flat looks lived in again, I’ll turn it over.'],
    (f) => [`${games(f.gamesOwned)} now? Félix had fifty on his shelves the day you left. Fifty, or one of those complete sets he was always chasing. Then I’ll turn that photo over.`],
  ],
  sale: [
    ['Some of his games must still be out there. In other people’s cupboards.'],
    ['When one of Félix’s own games comes home, I’ll be able to look at the photos from the sale. Not before.'],
    (f) =>
      f.notebookFound
        ? ['The games in his notebook, love. Bring one of those home, one he wrote about, and I’ll tell you how the sale went. All of it.']
        : ['He wrote his favourite games in a notebook. Find it in that flat, bring one of them home, and I’ll tell you how the sale went.'],
  ],
  keys: [
    ['There’s one more photo. The last one. I took it myself; my hands were shaking.'],
    (f) =>
      f.trailStarted && !f.prototypeFound
        ? ['That grey cartridge Félix went on about… If you ever found it, I think I could give you the last photo.']
        : ['When his flat is as full as he had it, I’ll give you the last photo.'],
    (f) =>
      f.prototypeFound
        ? ['There’s one more photo. Sit down when you’re ready.']
        : [
            f.trailStarted
              ? 'Find his grey cartridge, love, or put his room back the way he had it: his armchairs, his lamps, the shelves full. Then the last photo.'
              : 'Put his room back the way he had it, love: his armchairs, his lamps, his plants, the shelves full. Then the last photo.',
          ],
  ],
};

/** Her tier's lines for `id`, read off `facts`; empty when she has nothing to hint. */
export function hintLines(id: string, tier: number, facts: HintFacts): readonly string[] {
  const tiers = HINTS[id];
  const lines = tiers?.[Math.max(0, Math.min(2, tier))];
  if (!lines) return [];
  return typeof lines === 'function' ? lines(facts) : lines;
}

/** When she rings because a memory is ready: what she says when the player picks up, by memory. */
export const CALL_LINES: Readonly<Record<string, string>> = {
  wednesdays: 'Is that you? I was in the cupboard and found a packet from Félix’s flat. You, on his floor. Come and look, they’re on the table.',
  arcade: 'It’s me. I found the one of the arcade screen, the one from his wallet. Come on the 38 when you can.',
  row: 'Hello, love. I found the photos of that Sunday. I’d rather show you than tell you. Come round.',
  leaving: 'It’s Mémé. I turned that photo over. Your last Wednesday. Come and see it with me.',
  sale: 'It’s me. I’ve got the photos from the sale out. I’ve been staring at them all morning. Come.',
  keys: 'Is that you? There’s one photo left. The last one. Come and sit with me for it.',
};

/** The message she leaves when nobody picks up (read off the phone after). */
export const MISSED = {
  title: 'Missed call · Mémé',
  text: (id: string): string =>
    `“It’s only me. ${MISSED_TEASE[id] ?? 'I found more photos.'} Come on the 38 when you can. Don’t ring back, I’ll be at the shops.”`,
};

const MISSED_TEASE: Readonly<Record<string, string>> = {
  wednesdays: 'I found you on Félix’s floor, in a packet of photos.',
  arcade: 'I found the photo from his wallet.',
  row: 'I found the photos of that Sunday.',
  leaving: 'I turned that photo over.',
  sale: 'I got the photos from the sale out.',
  keys: 'There’s one photo left.',
};

/** What a ringing phone's caption says, and the phone's caption with her message on it. */
export const RING = {
  calling: 'Phone · Mémé calling · answer',
  message: 'Phone · a message from Mémé · listen',
};

/** The letter she posts when a memory waits and the player has not been round for days, by memory. */
export const LETTERS: Readonly<Record<string, { lines: string[] }>> = {
  wednesdays: {
    lines: [
      'Dear,',
      'I was tidying the cupboard and found a whole packet from Félix’s flat. You on his floor in front of the television, blowing into one of those cartridges.',
      'Come and see the rest. It’s still the 38.',
      'P.S. I’ve put one in. It’s no good on its own.',
    ],
  },
  arcade: {
    lines: ['Dear,', 'Remember the photo Félix kept in his wallet? I have it. Three letters on a screen, and him prouder than you.', 'The kettle’s always on.', 'P.S. The corner is a bit bent. That was his wallet, not me.'],
  },
  row: {
    lines: ['Dear,', 'There are photos of a Sunday I should have talked to you about long ago. Your uncles at my table.', 'Come when you can. Not on a Sunday, perhaps.', 'P.S. Here is the edge of one. The rest is easier with you there.'],
  },
  leaving: {
    lines: ['Dear,', 'I turned the photo over. Your suitcase by his door, the last Wednesday.', 'You kept your promise, you know. Come and let me tell you so.', 'P.S. One corner, so you know I’m not making it up.'],
  },
  sale: {
    lines: ['Dear,', 'I got the sale out of the drawer. The catalogue, the photos, all of it. I owe you the truth about it.', 'Come on the 38. I’ll make a proper lunch.', 'P.S. I couldn’t bring myself to send a whole one.'],
  },
  keys: {
    lines: ['Dear,', 'There is one photo left in the album. I took it myself.', 'Come and sit with me for it. Nothing else to do but that.', 'P.S. Just the corner. The rest is for when you’re here.'],
  },
};

/** The letter's title on the mat and on the card, and its signature. */
export const LETTER = { title: 'A letter from Mémé', from: 'Mémé', accent: 0x8a5a7a };

/** Her first letter, on the mat from the second day while the player has never been round: come for lunch. */
export const INVITATION: readonly string[] = [
  'My dear,',
  'Your mother tells me you’re in Félix’s flat now. Good. It shouldn’t stand empty, and neither should you.',
  'Come for Sunday lunch. I’ve got the album out, the one with him in it, and you in it too, smaller.',
  'Number 14, Linden Avenue, as ever, by the pharmacy. Mind the dog on the stairs, he’s all bark.',
  'P.S. The 38 stops in Front Street. Two coins, and the driver waits for nobody.',
];

/** The journal's line while a memory waits for a visit, once she has rung or written about it. */
export const JOURNAL_DUE = { rang: 'Mémé rang: more photos on her table', wrote: 'Mémé wrote: more photos on her table' };

/** The journal's line of what she said about the next photo (once she has said more than the vaguest). */
export const JOURNAL_HINT: Readonly<Record<string, string>> = {
  wednesdays: 'Mémé: “A shelf starts at ten boxes, Félix said”',
  arcade: 'Mémé: “He took you to the arcade on Saturdays”',
  row: 'Mémé: “His notebook, at the back of a drawer”',
  leaving: 'Mémé: “When that flat looks lived in again”',
  sale: 'Mémé: “When one of his own games comes home”',
  keys: 'Mémé: “The last photo”',
};
