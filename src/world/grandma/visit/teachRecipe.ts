import type { GrandmaRituals } from '@/grandma/GrandmaRituals';
import { recipeOf } from '@/grandma/recipes';
import type { MemeScene } from '../memeScene';

/**
 * Her recipe of the moment handed over (docs/grandma.md "Sunday lunch, recipes and favours"): at the end of a lunch or
 * thanking the player for a favour, the first recipe of that moment not taught yet: her words, then the card to read
 * (kept: the kitchen's recipe tin cooks it). `then` once said, or at once when there is none to teach.
 */
export function teachRecipe(scene: MemeScene, rituals: GrandmaRituals, moment: 'lunch' | 'favour', then: () => void): void {
  const id = rituals.nextRecipe(moment);
  if (!id) {
    then();
    return;
  }
  const recipe = recipeOf(id);
  scene.meme.gesture('adjustGlasses');
  scene.say([recipe.teach], () => {
    if (rituals.learn(id)) scene.ctx.notices.read({ title: recipe.title, text: recipe.card, look: 'note', from: 'Mémé' });
    then();
  });
}
