import { mannerOf } from './voices';
import type { Manner, PersonId } from './types';

/*
 * A word on what the player has on (`household/outfits`), now and then as someone's first line (`conversation.opening`,
 * once a game day each): the arcade tee, the hunter's jacket, the Sunday best, Mémé's scarf. Everyday clothes get
 * nothing. Said in their manner (`voices.mannerOf`) when it has its own words, else plainly.
 */

type Remarks = { plain: readonly string[] } & Partial<Record<Manner, readonly string[]>>;

const REMARKS: Record<string, Remarks> = {
  arcadeTee: {
    plain: ['INSERT COIN, eh? I see where your evenings go.', 'Nice shirt. Did it come with tickets?'],
    gruff: ['That shirt. INSERT COIN. Hm. At least it’s honest.'],
    lively: ['INSERT COIN! Ha! I’d put one in, if I had any.', 'Love the shirt. Player one has entered the building!'],
    shy: ['Oh, I like your shirt. The arcade one.'],
  },
  hunterJacket: {
    plain: ['That jacket! You look ready to haggle the whole market down.', 'Twelve pockets? What do you keep in all of them?'],
    proud: ['A proper dealer’s jacket. You wear it well.'],
    gruff: ['You look like someone from the auction house. Shifty.'],
    lively: ['Look at you, all pockets! Off to empty the flea market?'],
  },
  sundayBest: {
    plain: ['Very smart today! Somewhere special?', 'Look at you, all dressed up.'],
    proud: ['Now that is how one ought to dress. Very good.'],
    gruff: ['All dressed up. Who died? Sorry. Habit.'],
    shy: ['You look… really nice today.'],
    warm: ['Oh, how smart you look! It does me good to see.'],
  },
  memeScarf: {
    plain: ['What a lovely scarf. Hand-knitted, isn’t it?', 'That scarf! Someone loves you, to knit that.'],
    gruff: ['Lumpy scarf. Somebody’s gran made it. Keep it.'],
    warm: ['Is that hand-knitted? Oh, somebody took their time over that.'],
  },
};

let worn: () => string = () => 'everyday';

/** Where the outfit the player has on is read (`bootstrap/social`). */
export function watchOutfit(source: () => string): void {
  worn = source;
}

/** What `id` says about the player's clothes today, or null (everyday clothes: nothing to say). */
export function outfitRemark(id: PersonId, r: number): string | null {
  const remarks = REMARKS[worn()];
  if (!remarks) return null;
  const manner = mannerOf(id);
  const lines = (manner && remarks[manner]) || remarks.plain;
  return lines[Math.floor(r * lines.length) % lines.length] ?? null;
}
