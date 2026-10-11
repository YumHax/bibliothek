import type { MemeFeature } from '../memeScene';

/** Seconds after her hello before she lets a hint slip (a breath, as if it just came back to her). */
const AFTER_HELLO = 1.2;

/**
 * HER HINTS AT HERS (docs/grandma.md "Hints toward the next memory"): the next photo of her album let slip on the way
 * in now and then (`GrandmaHints.arrivalLine`: vaguer, then clearer with the visits), and mixed into her chat.
 */
export const hintsAtHers: MemeFeature = {
  id: 'hints',
  start(scene) {
    const hints = scene.ctx.grandmaHints;
    if (!hints) return {};
    scene.talk.addLines(() => hints.chatLines());
    return {
      arrived(arrival) {
        // The first visit is the album's own (its first memory plays): nothing to hint at yet.
        if (arrival.first) return;
        scene.zone.after(arrival.helloEnds + AFTER_HELLO, () => {
          if (!scene.playerIn || scene.ctx.memories?.filming) return;
          const line = hints.arrivalLine();
          if (line) scene.say([line]);
        });
      },
    };
  },
};
