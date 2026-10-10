/** What the player can put on from the bedroom's wardrobe. */
export type OutfitId = 'everyday' | 'arcadeTee' | 'hunterJacket' | 'sundayBest' | 'memeScarf';

/** What an outfit's unlock is judged on: the prizes brought home, the market's regard, the collection's size. */
export interface OutfitFacts {
  ownsPrize(id: string): boolean;
  reputationLevel: number;
  gamesOwned: number;
  /** Mémé has knitted the player a scarf (her `knitsScarf`, a close grandchild: docs/social.md "Mémé"). */
  knitted: boolean;
}

export interface Outfit {
  id: OutfitId;
  name: string;
  /** What it looks like, one line. */
  look: string;
  /** What it does, in the world's words, one line ('' for none): no numbers, the player feels the rest. */
  perk: string;
  /** The note pinned on its bag while it is not earned: where to look, not a rule. */
  earn: string;
  unlocked(facts: OutfitFacts): boolean;
}

/** Tickets on top of a ticket play's own in the arcade tee (a share, rounded, at least 1). */
export const ARCADE_TEE_BONUS = 0.1;
/** The bargain hunter's jacket: every stallholder's lowest price moves this share of the tag. */
export const HUNTER_JACKET_FLOOR = -0.03;
/** Reputation level the jacket is earned at (`REPUTATION.levels`: "Regular"), and games owned for the Sunday best. */
const JACKET_LEVEL = 1;
const SUNDAY_BEST_GAMES = 25;

/**
 * The wardrobe's rail. Every outfit helps in one place only, so there is a choice and never a
 * chore: what is worn stays on (saved) until changed, and `everyday` costs nothing.
 */
export const OUTFITS: readonly Outfit[] = [
  {
    id: 'everyday',
    name: 'Everyday',
    look: 'Jeans and a jumper. Nobody looks twice.',
    perk: 'Comfortable, and that is all it asks.',
    earn: '',
    unlocked: () => true,
  },
  {
    id: 'arcadeTee',
    name: 'Arcade tee',
    look: 'The black INSERT COIN shirt, a little faded.',
    perk: 'The regulars nod you through, and the ticket slot seems a little more generous.',
    earn: 'For the day a trophy comes home from the arcade.',
    unlocked: (f) => f.ownsPrize('trophy') || f.ownsPrize('pennant') || f.ownsPrize('saturdayCup'),
  },
  {
    id: 'hunterJacket',
    name: 'Bargain hunter’s jacket',
    look: 'Waxed cotton, twelve pockets, a tape measure in one of them.',
    perk: 'Stallholders take you for a dealer: every haggle starts lower.',
    earn: 'For when the stallholders know your face.',
    unlocked: (f) => f.reputationLevel >= JACKET_LEVEL,
  },
  {
    id: 'sundayBest',
    name: 'Sunday best',
    look: 'The good coat, polished shoes. You look like money.',
    perk: 'The glass case’s stallholder hands you anything you point at.',
    earn: `For a collection worth dressing up for: ${SUNDAY_BEST_GAMES} games on the shelves.`,
    unlocked: (f) => f.gamesOwned >= SUNDAY_BEST_GAMES,
  },
  {
    id: 'memeScarf',
    name: 'Mémé’s scarf',
    look: 'Burgundy wool, a little lumpy, knitted in front of the quiz shows.',
    perk: 'Mémé beams every time you wear it to hers.',
    earn: 'Something Mémé has been knitting, for when she’s finished.',
    unlocked: (f) => f.knitted,
  },
];

export function outfitById(id: OutfitId): Outfit {
  return OUTFITS.find((o) => o.id === id) ?? OUTFITS[0]!;
}

export function isOutfitId(value: unknown): value is OutfitId {
  return typeof value === 'string' && OUTFITS.some((o) => o.id === value);
}
