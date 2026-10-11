/*
 * MÉMÉ'S RECIPES (docs/grandma.md "Sunday lunch, recipes and favours"): taught once each, at the end of a lunch or over
 * the thanks for a favour, on a card in her hand the player keeps; cooked at home on the kitchen's worktop (her recipe
 * tin), a dish out for friends like the cake, and a portion to bring her back.
 */

export type RecipeId = 'blanquette' | 'jam' | 'yoghurtCake';

interface Recipe {
  id: RecipeId;
  /** The card's title, and the tin's caption. */
  title: string;
  /** The dish as the captions name it ("her blanquette"). */
  dish: string;
  /** The portion handed to her, as the entry says it. */
  portion: string;
  /** How long it takes in the kitchen (the fade's clock, minutes: under the household's longest beat). */
  minutes: number;
  /** When she teaches it: at the end of a lunch, or thanking the player for a favour. */
  taught: 'lunch' | 'favour';
  /** What she says handing the card over. */
  teach: string;
  /** The card, in her hand. */
  card: string;
  /** The cooking told (the fade's line, under the crosshair). */
  cooked: string;
  /** What she says when the player brings her some. */
  given: readonly string[];
}

/** In the order she teaches them. */
export const RECIPES: readonly Recipe[] = [
  {
    id: 'blanquette',
    title: 'Mémé’s blanquette',
    dish: 'her blanquette',
    portion: 'some of your blanquette',
    minutes: 120,
    taught: 'lunch',
    teach: 'Here. I wrote it down for you. It was my mother’s, so don’t go adding curry to it.',
    card: 'Veal, the shoulder (ask the butcher, he knows me). Cover with cold water, skim, carrots, an onion stuck with two cloves, the bouquet. Two hours, barely moving. Mushrooms aside. Butter, flour, the stock, then off the heat: one yolk and the cream. Never boil it after the yolk. Rice. Félix always wanted more sauce than meat.',
    cooked: 'Two hours on the lowest flame, and the kitchen smells like Sundays at Mémé’s.',
    given: ['My blanquette! Let me taste. … Not bad. A bit too much salt. Like me, then.', 'You made it yourself? You stirred it after the yolk, I can tell. It’s lovely anyway.'],
  },
  {
    id: 'jam',
    title: 'Mémé’s plum jam',
    dish: 'her plum jam',
    portion: 'a jar of your plum jam',
    minutes: 90,
    taught: 'favour',
    teach: 'You’ve earned this. My plum jam. Don’t tell the woman downstairs, she’s been after it for years.',
    card: 'Damson plums, very ripe, stoned and halved. Their weight in sugar, less a quarter. A night in the bowl. Cook it hard, stirring, until a drop on a cold saucer wrinkles under your finger. A cinnamon stick if it’s for Christmas. Hot jars, lids on, upside down. Write the year on the label, you’ll forget.',
    cooked: 'A night in the bowl, an hour of stirring, and three jars cool upside down on the worktop.',
    given: ['That’s my jam! Not bad. Not quite mine, but not bad.', 'Plum jam, and you wrote the year on it. You do listen, sometimes.'],
  },
  {
    id: 'yoghurtCake',
    title: 'Mémé’s yoghurt cake',
    dish: 'her yoghurt cake',
    portion: 'a slice of your yoghurt cake',
    minutes: 45,
    taught: 'lunch',
    teach: 'And the yoghurt cake, so you stop buying those things in plastic. You measure everything with the pot. Even you can’t get it wrong.',
    card: 'One pot of plain yoghurt, then the pot is your measure: two pots of sugar, three of flour, half a pot of oil, three eggs, a sachet of baking powder, a lemon’s zest. Mix, butter the tin, 35 minutes. It’s done when the knife comes out clean. Félix ate it warm, standing up, like a savage.',
    cooked: 'Measured with the yoghurt pot, as she said: thirty-five minutes, and the knife comes out clean.',
    given: ['My yoghurt cake. With a lemon in it! You found the lemon. Sit down, I’ll make coffee.', 'Mm. It’s risen. Mine sinks in the middle these days, don’t tell anyone.'],
  },
];

export function recipeOf(id: RecipeId): Recipe {
  return RECIPES.find((recipe) => recipe.id === id) ?? RECIPES[0]!;
}

export function isRecipeId(value: unknown): value is RecipeId {
  return RECIPES.some((recipe) => recipe.id === value);
}
