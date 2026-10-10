/** What the caption calls a door or drawer (`SwingLeaf`'s noun) where nothing paper is kept: only coins turn up there. */
const NO_PAPER = new Set(['oven', 'fridge', 'freezer']);

/** Whether paper (tickets, a booklet) may turn up behind this door: not in a fridge or an oven. */
export function holdsPaper(noun: string): boolean {
  return !NO_PAPER.has(noun);
}

/** The slip's title for what was picked up; a leftover says whose it was under it. */
export const FIND_TITLES = { coin: 'A coin', coins: 'Loose change', tickets: 'Arcade tickets', manual: 'A lost manual!', leftover: 'The last tenant left it behind.' } as const;

/** Uncle Félix's notebook, at the back of a drawer (`story/FelixNotebook`): its title, and its first page as a card to read. */
export const FELIX_NOTEBOOK = {
  title: 'Uncle Félix’s notebook',
  detail: 'A school exercise book, at the back of the drawer, his name on the cover.',
  page: {
    title: 'Uncle Félix’s notebook',
    text: 'MY GAMES — the ones I would save from a fire.\nA list in blue biro, a line beside each in his small slanted hand, crossed out and written again over the years.\nEvery one of them went in the sale.\nThey are on your wishlist now: the stalls will keep an eye out. The journal keeps his lines, ticked as each comes home.',
  },
} as const;

/**
 * Lying with the first of the last tenant's leftovers the player finds, picked up with it: their note, which says
 * without a rule that more is hidden about the flat.
 */
export const TENANT_NOTE = {
  title: 'A note from the last tenant',
  text: 'To whoever has the flat next:\nI could never hold on to change. It is all over the place, in every cupboard and drawer, I expect. Whatever you find is yours.\nThe tickets are from the arcade on Front Street. Spend them on something silly.\n— Paul',
} as const;
