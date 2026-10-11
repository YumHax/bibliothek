import type { Zone } from '../zone/Zone';
import type { BuildContext, HouseholdContext } from '../buildContext';
import type { GrandmaRituals } from '@/grandma/GrandmaRituals';
import { recipeOf } from '@/grandma/recipes';
import { presentWhile } from '../build/presence';
import { playOven, playWhisk } from '@/audio/householdSounds';
import { RecipeTin, MemeDish } from './MemeRecipeThings';
import { KITCHEN_PLAN } from './kitchenPlan';

/** The fade of a recipe cooked (ms), like the household's baking. */
const BEAT = { outMs: 900, darkMs: 2400, inMs: 900 } as const;

/**
 * Mémé's recipes in the kitchen (docs/grandma.md "Sunday lunch, recipes and favours"): once she has taught one, her
 * recipe tin on the worktop cooks the next of them in a fade (the clock on by the recipe's time); the dish stands
 * beside it while it lasts (a friend who drops by has some, like the cake: `bootstrap/worldLife`'s hosting), and a
 * portion goes in the bag for her.
 */
export function furnishMemeRecipes(zone: Zone, ctx: Pick<BuildContext, 'sky' | 'grandmaRituals'>, household: HouseholdContext): void {
  const rituals = ctx.grandmaRituals;
  if (!rituals) return;
  const { notices, pastimes } = household;
  const plan = KITCHEN_PLAN.household;
  // What the tin and the dish show follows her ways and the clock (a dish goes off the worktop after its days).
  const follow = (cb: () => void): (() => void) => {
    const offRituals = rituals.onChange(cb);
    const offClock = ctx.sky.dayNight.onChange(cb);
    return () => {
      offRituals();
      offClock();
    };
  };
  const tin = zone.placeAt(new RecipeTin({ label: () => tinLabel(rituals), use: () => cook() }), plan.recipeTin);
  presentWhile(zone, tin, () => rituals.learned.length > 0, follow);
  const dish = zone.placeAt(new MemeDish(), plan.memeDish);
  const showDish = (): void => dish.show(rituals.dishOut);
  presentWhile(zone, dish, () => rituals.dishOut !== null, follow);
  zone.onUnload(follow(showDish));
  showDish();

  const cook = (): void => {
    const out = rituals.dishOut;
    if (out) {
      notices.react(`There’s still some of ${recipeOf(out).dish} out`);
      return;
    }
    const id = rituals.nextToCook();
    if (!id) return;
    const recipe = recipeOf(id);
    if (!pastimes) {
      if (rituals.cook(id)) notices.react(recipe.cooked);
      return;
    }
    void pastimes.run({ minutes: recipe.minutes, ...BEAT, start: () => playWhisk(BEAT.outMs / 1000 + 0.4), dark: () => playOven(), end: () => playOven(true) }, () => rituals.cook(id)).then((cooked) => {
      if (cooked) notices.react(recipe.cooked);
    });
  };
}

/** The tin's caption: what it cooks next, or that a dish is still out. */
function tinLabel(rituals: GrandmaRituals): string {
  const out = rituals.dishOut;
  if (out) return `Mémé’s recipe tin · ${recipeOf(out).dish} is still out`;
  const next = rituals.nextToCook();
  return next ? `Mémé’s recipe tin · cook ${recipeOf(next).dish}` : 'Mémé’s recipe tin';
}
