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
];
