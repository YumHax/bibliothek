import { PRESENCE_TALK } from '@/grandma/presenceLines';
import { random } from '@/random';
import type { MemeFeature } from '../memeScene';

/**
 * THE PLAYER'S NEWS (docs/grandma.md "Her presence"): "Guess what!" in her conversation while the journal of the
 * last week holds something she has not been told (a game found, a medal, a cat, a party, a neighbour met, one of
 * Félix's games home…): the most telling first, each once, and her answer to it. Hidden when there is nothing new.
 */
export const tellHer: MemeFeature = {
  id: 'tellHer',
  start(scene) {
    const presence = scene.ctx.grandmaPresence;
    if (!presence) return {};
    return {
      extras: () => [
        {
          id: 'memeNews',
          group: 'talk',
          label: PRESENCE_TALK.tell.ask,
          disabled: () => (presence.news(scene.day()) ? null : 'Nothing new to tell her'),
          run: () => {
            const news = presence.news(scene.day());
            if (!news) return undefined;
            presence.toldNews(news.key);
            const answers = PRESENCE_TALK.tell.heard[news.kind];
            const line = answers[Math.floor(random() * answers.length)] ?? answers[0] ?? '';
            scene.meme.feel({ smile: 0.9, browsUp: 0.6 }, 2.5);
            return { line: line.replace('{x}', news.x).replace('{who}', news.who) };
          },
        },
      ],
    };
  },
};
