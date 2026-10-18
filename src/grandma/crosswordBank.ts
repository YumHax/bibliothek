/*
 * THE MORNING CROSSWORD at Mémé's table (docs/grandma.md "Things to do with her"): the word she is stuck on, with the
 * paper's clue and the letters she already has from the words across it. Easy words, an old paper's clues.
 */

export interface CrosswordWord {
  id: string;
  /** The paper's clue, as printed. */
  clue: string;
  /** The answer, capitals A–Z only. */
  answer: string;
  /** The letters she already has (indexes into `answer`). */
  given: readonly number[];
}

export const CROSSWORD_BANK: readonly CrosswordWord[] = [
  { id: 'kettle', clue: 'It sings when it boils (6)', answer: 'KETTLE', given: [0, 3] },
  { id: 'canary', clue: 'Yellow singer in a cage (6)', answer: 'CANARY', given: [1, 4] },
  { id: 'albums', clue: 'Books of photographs (6)', answer: 'ALBUMS', given: [0, 3] },
  { id: 'cartridge', clue: 'A game you blow into (9)', answer: 'CARTRIDGE', given: [0, 3, 6] },
  { id: 'umbrella', clue: 'Opened in the rain, never in the house (8)', answer: 'UMBRELLA', given: [1, 4, 7] },
  { id: 'harbour', clue: 'Where the boats sleep (7)', answer: 'HARBOUR', given: [0, 4] },
  { id: 'stitch', clue: 'One in time saves nine (6)', answer: 'STITCH', given: [1, 4] },
  { id: 'teapot', clue: 'Warm it first, then the leaves (6)', answer: 'TEAPOT', given: [0, 3] },
  { id: 'pigeon', clue: 'It carries letters, or begs in the square (6)', answer: 'PIGEON', given: [1, 4] },
  { id: 'chimney', clue: 'Father Christmas comes down it (7)', answer: 'CHIMNEY', given: [0, 4] },
  { id: 'bakery', clue: 'Where the bread is warm at seven (6)', answer: 'BAKERY', given: [0, 3] },
  { id: 'orchard', clue: 'A field of apple trees (7)', answer: 'ORCHARD', given: [1, 5] },
  { id: 'lantern', clue: 'A light you carry (7)', answer: 'LANTERN', given: [0, 4] },
  { id: 'violin', clue: 'Played under the chin (6)', answer: 'VIOLIN', given: [1, 4] },
  { id: 'jigsaw', clue: 'A thousand pieces and one missing (6)', answer: 'JIGSAW', given: [0, 3] },
  { id: 'pyjamas', clue: 'Worn to bed, in two pieces (7)', answer: 'PYJAMAS', given: [1, 4] },
  { id: 'meadow', clue: 'A field of grass and flowers (6)', answer: 'MEADOW', given: [0, 4] },
  { id: 'thimble', clue: 'It saves a sewing finger (7)', answer: 'THIMBLE', given: [0, 4] },
  { id: 'parcel', clue: 'Wrapped up and sent by post (6)', answer: 'PARCEL', given: [1, 4] },
  { id: 'joystick', clue: 'The stick a game is steered with (8)', answer: 'JOYSTICK', given: [0, 3, 6] },
  { id: 'saucepan', clue: 'It has a handle and sits on the hob (8)', answer: 'SAUCEPAN', given: [0, 4, 7] },
  { id: 'garden', clue: 'Where the roses are (6)', answer: 'GARDEN', given: [1, 4] },
  { id: 'pendulum', clue: 'It swings in a longcase clock (8)', answer: 'PENDULUM', given: [0, 3, 6] },
  { id: 'console', clue: 'Comfort, or a games machine under the telly (7)', answer: 'CONSOLE', given: [1, 4] },
  { id: 'sideboard', clue: 'Where the good plates live (9)', answer: 'SIDEBOARD', given: [0, 4, 7] },
  { id: 'tandem', clue: 'A bicycle made for two (6)', answer: 'TANDEM', given: [0, 3] },
  { id: 'tortoise', clue: 'It won the race, slowly (8)', answer: 'TORTOISE', given: [1, 4, 7] },
  { id: 'plumber', clue: 'Mends the pipes, or jumps on mushrooms (7)', answer: 'PLUMBER', given: [0, 4] },
  { id: 'arcade', clue: 'A covered row of shops, or of machines (6)', answer: 'ARCADE', given: [1, 4] },
  { id: 'blanquette', clue: 'Veal in a white sauce, on a Sunday (10)', answer: 'BLANQUETTE', given: [0, 3, 6, 9] },
  { id: 'cushion', clue: 'Sat on in front of the set (7)', answer: 'CUSHION', given: [0, 4] },
  { id: 'ticket', clue: 'Punched on the bus (6)', answer: 'TICKET', given: [1, 4] },
  { id: 'trophy', clue: 'A cup on the mantelpiece (6)', answer: 'TROPHY', given: [0, 3] },
  { id: 'needles', clue: 'Two of them make a scarf (7)', answer: 'NEEDLES', given: [1, 5] },
  { id: 'postcard', clue: 'Wish you were here, on the back (8)', answer: 'POSTCARD', given: [0, 3, 6] },
  { id: 'mantel', clue: 'The shelf over the fireplace (6)', answer: 'MANTEL', given: [0, 4] },
  { id: 'cassette', clue: 'Wound back with a pencil (8)', answer: 'CASSETTE', given: [1, 4, 7] },
  { id: 'pinball', clue: 'Flippers, a ball and a tilt (7)', answer: 'PINBALL', given: [0, 4] },
  { id: 'saucer', clue: 'Under the cup, or flown by Martians (6)', answer: 'SAUCER', given: [1, 4] },
  { id: 'avenue', clue: 'A wide street with trees (6)', answer: 'AVENUE', given: [0, 3] },
];

/**
 * The paper's grid round the word: the words going down through the letters she already has, from a stock of easy
 * ones, so the given letters come from somewhere (none of them is ever a day's word, to give nothing away).
 */
const DOWN_WORDS: readonly string[] = [
  'TEA', 'LACE', 'PEARL', 'ROSE', 'OVEN', 'SALT', 'NEST', 'BREAD', 'SCARF', 'STAMP', 'TRAIN', 'PIANO', 'SOUP', 'LEMON',
  'HONEY', 'BENCH', 'GLOVE', 'MOUSE', 'JAM', 'KNIT', 'YARN', 'WOOL', 'VASE', 'QUILT', 'ZINC', 'BOX', 'FIG', 'HAT', 'DUCK',
  'CAKE', 'MILK', 'APRON', 'TULIP', 'OWL', 'BEE', 'EGG', 'RUG', 'PIPE', 'SOCK',
];

/** A word going down through the word's `col`-th letter: its letters, and which of them is on the word's row. */
interface DownWord {
  col: number;
  letters: string;
  at: number;
}

/** The words going down through `word`'s given letters (picked by the word, so the grid is the same each time it comes). */
export function downWordsOf(word: CrosswordWord): DownWord[] {
  const seed = [...word.id].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const used = new Set<string>();
  const downs: DownWord[] = [];
  word.given.forEach((col, n) => {
    const letter = word.answer[col];
    if (!letter) return;
    const fits = DOWN_WORDS.filter((w) => w.includes(letter) && !used.has(w));
    const down = fits[(seed + n * 7) % Math.max(1, fits.length)];
    if (!down) return;
    used.add(down);
    downs.push({ col, letters: down, at: down.indexOf(letter) });
  });
  return downs;
}
