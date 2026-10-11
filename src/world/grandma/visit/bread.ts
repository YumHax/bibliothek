import type { MemeFeature } from '../memeScene';
import { BREAD, BREAD_WORDS } from '@/grandma/breadErrand';
import { pick, random } from '@/random';

/** Seconds after her hello before she asks for bread (after any hint she lets slip first). */
const ASK_AFTER = 4.5;

/**
 * HER BREAD (docs/grandma.md "Around her flat"): now and then on the way in she asks for a baguette from Lebrun's
 * downstairs next time (`BreadErrand.ask`); brought, it is an entry of her conversation, and she pays it back with
 * something on top when she had asked. Her being found at home also tells the 38 she was not out at the market
 * that morning (`SharedRide.seenHome`).
 */
export const breadAtHers: MemeFeature = {
  id: 'bread',
  start(scene) {
    const { grandmaBread: bread, sharedRide } = scene.ctx;
    if (!bread) return {};
    return {
      arrived(arrival) {
        sharedRide?.seenHome(scene.day());
        if (arrival.first || !bread.ask(scene.day())) return;
        scene.zone.after(arrival.helloEnds + ASK_AFTER, () => {
          if (scene.playerIn && !scene.ctx.memories?.filming) scene.say([pick(random, BREAD_WORDS.ask)]);
        });
      },
      extras: () => [
        {
          id: 'memeBread',
          group: 'give',
          label: BREAD_WORDS.give,
          disabled: () => (bread.carried ? null : 'No bread on you'),
          run: () => {
            const asked = bread.give(scene.day());
            scene.meme.gesture('clap');
            scene.meme.feel({ smile: 1, browsUp: 0.4 }, 2.5);
            if (asked) scene.ctx.money.purse?.earnCoins(BREAD.payBack);
            return { line: pick(random, asked ? BREAD_WORDS.thanks : BREAD_WORDS.unasked) };
          },
        },
      ],
    };
  },
};
