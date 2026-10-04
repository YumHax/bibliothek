import { ATTIC_PLAN } from '@/world/attic/atticPlan';

/*
 * THE SIXTH FLOOR, the building's treasure hunt, as data. Albert Vasseur, a collector, lived up in the
 * maids' rooms where no stair goes any more; the old lift took him up for whoever pressed its buttons
 * in the right order. On 24 December 1991 he locked the last of his good games in his trunk, with Henri
 * there, and left for his sister's in Lyon.
 * Henri Lambert, the paperboy who became his friend (later the 3rd floor's collector, courtyard side,
 * the man of the estate sale), kept the way up in pieces round the building and never rode the lift
 * himself. Before he goes, he hands it on to the player: the code in two halves (the cellars' chalk,
 * the nameless mailbox), the year in three (the board and the chestnut, an old neighbour, the cat, the
 * aerial), the trunk's end (`ATTIC_PLAN.chest`). Each clue is read where it is found; the journal keeps
 * the file. Nothing here is d7's prototype trail (docs/story.md): no post, no market, no radio, no arcade.
 */

export type ClueId = 'letter' | 'chalk' | 'mailbox' | 'board' | 'chestnut' | 'memory' | 'cat' | 'attic' | 'aerial' | 'chest';

/** A clue: what must be found first, what the player reads there, and what the journal's file says of it. */
interface Clue {
  needs: readonly ClueId[];
  /** The card's title and text, read where it is found. */
  title: string;
  text: string;
  /** The line in the journal's file, in the player's words. */
  note: string;
}

const [a, b, c, d, e, f] = ATTIC_PLAN.liftCode.floors;
const YEAR = ATTIC_PLAN.chest.code;

export const HUNT = {
  /** The first letter comes under the door from this game day on. */
  startDay: 4,
  /** Waiting this many game days at the chalk (no cellar key yet?), Lambert slips its words under the door himself. */
  chalkFallbackDays: 6,
  /** The residents who remember Albert Vasseur, the first of them still in the building (door keys). */
  rememberers: ['0:0', '3:0'] as const,
  clues: {
    letter: {
      needs: [],
      title: 'A letter under the door',
      text:
        'To the collector on the 5th. You are the one carrying all those boxes up, I hear you on the stairs. ' +
        'Before your time, Albert Vasseur lived over your head, on the sixth floor, in the old maids’ rooms. No stair goes there now. The lift does, if you know how to ask it. ' +
        'I was his paperboy in 1961, his friend after. He told me the way up, and I wrote it down where nobody looks: the far end of the cellars. The concierge keeps the key. ' +
        'I am too old for that lift. You are not. — Henri Lambert, 3rd floor, courtyard side',
      note: 'Henri Lambert (3rd, courtyard side) wrote: Albert Vasseur lived on a sixth floor no stair reaches. The lift goes up “if you know how to ask it”. The way up is chalked at the far end of the cellars.',
    },
    chalk: {
      needs: ['letter'],
      title: 'Chalk on the cellar wall',
      text: `Six buttons drawn in chalk, like the lift’s panel. Three are ringed, with arrows between them: ${a} → ${b} → ${c} → … Under them, in a shaky hand: “The rest in the box with no name. H.L.”`,
      note: `The cellars’ chalk: the lift’s buttons, ${a}, ${b}, ${c}, then “the rest in the box with no name”.`,
    },
    mailbox: {
      needs: ['chalk'],
      title: 'A card in the nameless mailbox',
      text: `“… → ${d} → ${e} → ${f}. Inside the car, one after the other, never slower than a breath. Albert scratched it where he looked at himself every morning, so he would not forget. When you have been up, read the board. — H.L.”`,
      note: `The nameless mailbox, the rest: ${d}, ${e}, ${f}. All six in the car, quickly. Albert scratched them where he looked at himself (the car’s mirror?).`,
    },
    board: {
      needs: ['mailbox'],
      title: 'A card on the board',
      text: '“A.V. and H.L., under the chestnut, since 1961. It remembers more than I do now.” No name, but the same shaky hand.',
      note: 'On the hall’s board, his hand again: “under the chestnut”, in the courtyard.',
    },
    chestnut: {
      needs: ['board'],
      title: 'Carved in the chestnut',
      text: `A.V. + H.L. 1961, deep in the bark, and lower down, newer: 24·XII·${YEAR}. At its foot a biscuit tin holds a photograph: two men by the lift’s gate, one old, one not so old, and a trunk between them. On the back: “The day we locked it. Same number as the year.”`,
      note: `The chestnut: A.V. + H.L. 1961, and 24·XII·${YEAR}, the day they locked a trunk. “Same number as the year.”`,
    },
    memory: {
      needs: ['letter'],
      title: 'A neighbour remembers',
      text: `Albert Vasseur? A lovely man. He hummed in the lift, going up past my floor. He told me once: “Some numbers you never forget. The year you lock your treasure away.” That was ${YEAR}, the Christmas he left.`,
      note: `An old neighbour remembers Albert humming in the lift, and his words: “the year you lock your treasure away”. He left at Christmas ${YEAR}.`,
    },
    cat: {
      needs: ['letter'],
      title: 'Something in its mouth',
      text: `The corner of an old photograph, chewed. Two hands on a trunk’s lid, a padlock with four wheels, and in biro on the back: “A.V. ${YEAR}”.`,
      note: `What the cat brought back: a corner of a photo, a trunk with a four-wheel padlock, “A.V. ${YEAR}”.`,
    },
    attic: {
      needs: [],
      title: 'The sixth floor',
      text: 'The lift went past your landing, and up. The maids’ corridor, the dust, and at the end, his room.',
      note: 'The lift took me up to the sixth floor: the maids’ rooms, and Albert Vasseur’s room at the end.',
    },
    aerial: {
      needs: ['attic'],
      title: 'A tag on the aerial’s mast',
      text: `Wired to the old aerial’s mast, a brass tag, green with years: “A. VASSEUR · 6e · ${YEAR}”. He must have climbed up here to get his TV in tune, the year he locked everything away.`,
      note: `The roof: a brass tag on the aerial, “A. VASSEUR · 6e · ${YEAR}”.`,
    },
    chest: {
      needs: [],
      title: 'In the trunk, under the game',
      text:
        'A note in Henri’s hand, under the wrap: “Christmas 1991. Albert says whoever opens this next should keep it, and that it will not be him. He is going to his sister’s in Lyon. I will not be coming up here again either: my knees, and then my nerve. Whoever you are, thank you for finishing it for us both. — H.L.”',
      note: `The trunk opened on ${YEAR}: ${ATTIC_PLAN.chest.game.title}, sealed, and Henri’s thank-you.`,
    },
  } satisfies Record<ClueId, Clue>,
  /** Where to look next, by the last clue of the main way found (vague on purpose). */
  next: {
    letter: 'The far end of the cellars. The concierge has the key.',
    chalk: 'A mailbox with no name, in the hall.',
    mailbox: 'Six buttons, in the lift’s car. Then the board.',
    board: 'The chestnut in the courtyard.',
    chestnut: 'Up the lift, and the trunk in his room.',
  } as Partial<Record<ClueId, string>>,
  /** The fallback note under the door when the chalk waits too long. */
  chalkNote: { title: 'H.L., 3RD FLOOR', lines: [`In case the cellars stay shut to you:`, `the chalk says ${a}, ${b}, ${c}…`, 'and the rest is in the box with no name.', 'Henri Lambert'], accent: 0x6f5a3a },
  /** The letter under the door (its card on the mat; its text read in full there as `clues.letter`). */
  letterNote: { title: 'TO THE 5TH FLOOR', lines: ['Albert Vasseur lived over your head,', 'on a sixth floor no stair reaches.', 'The way up is chalked at the far end', 'of the cellars. The concierge has the key.', 'Henri Lambert, 3rd, courtyard side'], accent: 0x6f5a3a },
  /** Delivered after he died (a save that reaches the letter past his estate sale's mourning): his niece's cover line. */
  posthumous: { title: 'FOUND AMONG HIS PAPERS', lines: ['“For the collector on the 5th”,', 'in my uncle’s hand. — Claire Lambert', 'Albert Vasseur lived over your head.', 'The way up is chalked at the far end', 'of the cellars. The concierge has the key.'], accent: 0x5a5a6a },
  /** The board's card: pinned over the others (`weight`), so a busy board (a meeting, a sale) never hides it. */
  boardCard: { id: 'hunt-chestnut', title: 'A.V. + H.L.', lines: ['Under the chestnut,', 'since 1961.', 'It remembers more than I do now.'], paper: 0xf4ecd2, weight: 9 },
  /** The file's title in the journal. */
  fileTitle: 'The sixth floor',
};
