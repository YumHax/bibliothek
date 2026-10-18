import { holidayOf } from '@/time/season';

/*
 * MÉMÉ'S OCCASIONS (docs/grandma.md "Sunday lunch, recipes and favours"): her birthday (her card's in the social year,
 * game days: the journal knows it), Christmas at hers (the tree in the corner through the season, lunch on the 24th
 * and 25th: `lunch.ts`), All Saints (she went to see Félix in the morning: chrysanthemums on her table). Christmas
 * and All Saints follow the real date, like the street's decorations (`time/season` `holidayOf`).
 */

export type Occasion = 'birthday' | 'christmas' | 'allSaints';

/** The occasion of the day at hers, or null; `birthday` her card's (`social/mood.isBirthday`), `forced` `?debug`'s. */
export function occasionOf(date: Date, birthday: boolean, forced: Occasion | null): Occasion | null {
  if (forced) return forced;
  if (birthday) return 'birthday';
  if (date.getMonth() === 11 && (date.getDate() === 24 || date.getDate() === 25)) return 'christmas';
  if (date.getMonth() === 10 && date.getDate() === 1) return 'allSaints';
  return null;
}

/** Whether her tree stands in the corner: December into the first week of January (the street's lights). */
export function treeSeason(date: Date, forced: Occasion | null): boolean {
  return forced === 'christmas' || holidayOf(date) === 'christmas';
}

/** Whether the chrysanthemums are on her table: the days round All Saints. */
export function chrysanthemumDays(date: Date, forced: Occasion | null): boolean {
  if (forced === 'allSaints') return true;
  const month = date.getMonth();
  const day = date.getDate();
  return (month === 9 && day === 31) || (month === 10 && day <= 3);
}

/** What she says, by occasion. */
export const OCCASION_LINES = {
  birthday: {
    /** On the way in. */
    hello: 'You came! On my birthday. Eighty-something, don’t ask. I made my own cake, at my age.',
    /** A present that day (flowers, a slice of cake, a dish): said after her thanks. */
    present: 'On my birthday too. You’ll make an old woman cry.',
    /** The candles. */
    candles: 'Help me with the candles, I haven’t the breath any more. Félix used to blow them out before I’d finished the song.',
    /** The candles blown out by the player. */
    blown: 'All of them, in one go! Now I’ve got my wish. I won’t tell you what it was. It was you, mostly.',
  },
  christmas: {
    hello: 'Happy Christmas, love! Come and see the tree, I did it myself. The star’s crooked, it’s always been crooked.',
  },
  allSaints: {
    hello: 'I went to see Félix this morning. I took him chrysanthemums. He hated chrysanthemums, but it’s what you take.',
    chat: 'He’s next to your grandfather. They argue less now.',
    /** The conversation's entry: going back with her, the 38 to the cemetery and back (a fade). */
    go: 'Go and see Félix with her',
    ask: 'You’d come? Now? I’ll get my coat. We’ll take him something that isn’t a chrysanthemum.',
    /** Back from it, a line at a time. */
    back: [
      'Thank you, love. He’d have pretended not to care, and rung me about it the next day.',
      'You stood there a long time. He did that at your grandfather’s too.',
      'A packet of sweets on a grave. The keeper will think we’re mad. Félix would have eaten them.',
    ],
    note: 'Went to see Félix at the cemetery with Mémé, on All Saints',
  },
} as const;
