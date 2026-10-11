import { STORY_TALK } from '@/grandma/storyLines';
import { PRESENCE_TALK } from '@/grandma/presenceLines';
import { random } from '@/random';
import type { MemeFeature } from '../memeScene';

/** Seconds from the player sitting down to her first line; the time a story takes on the clock (min); the fade's beats (ms). */
const STORY_AFTER = 1.6;
const MINUTES = 25;
const FADE = { outMs: 900, darkMs: 700, inMs: 900 };
const OWNER = 'sitWithHer';

const pick = (list: readonly string[]): string => list[Math.floor(random() * list.length)] ?? list[0] ?? '';

/**
 * SITTING WITH HER (docs/grandma.md "Her presence"): an entry of her conversation: the player sits in the visitor's
 * armchair, she tells one of her stories (`GRANDMA_STORIES`: the first she has not told that the memories seen allow,
 * else one again, said so), and the half hour goes by in a fade (the household's `Pastimes`), the clock wound on. Hidden
 * while she is busy.
 */
export const sitWithHer: MemeFeature = {
  id: 'sitWithHer',
  start(scene) {
    const presence = scene.ctx.grandmaPresence;
    if (!presence) return {};
    const pastimes = scene.ctx.home.household?.pastimes ?? null;
    return {
      extras: (session) => [
        {
          id: 'memeSit',
          group: 'talk',
          label: PRESENCE_TALK.sit,
          disabled: () => (scene.busyWith !== null || pastimes?.isBusy ? 'She is busy' : null),
          run: () => {
            const next = presence.nextStory((id) => scene.visits.hasSeen(id), (n) => Math.floor(random() * n));
            if (!next || !scene.claim(OWNER)) return undefined;
            if (session.seatedIn !== scene.things.visitorChair) {
              if (session.seated) session.stand();
              session.sit(scene.things.visitorChair);
            }
            const { story, again } = next;
            scene.zone.after(STORY_AFTER, () => {
              scene.meme.gesture('adjustGlasses');
              scene.meme.setFocus('viewer');
              scene.say([...(again ? [pick(STORY_TALK.again)] : []), ...story.lines], () => {
                const done = (): void => {
                  presence.toldStory(story.id);
                  scene.reseat();
                  scene.meme.feel({ smile: 0.8 }, 3);
                  scene.meme.speak(pick(STORY_TALK.after));
                  scene.release(OWNER);
                };
                // Gone before the story was out: no half hour to wind on.
                if (pastimes && scene.playerIn) void pastimes.run({ minutes: MINUTES, ...FADE }, () => null).then(done);
                else done();
              });
            });
            return { line: pick(STORY_TALK.settle), close: true };
          },
        },
      ],
    };
  },
};
