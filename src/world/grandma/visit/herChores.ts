import { inHours } from '@/time/clock';
import { PRESENCE_TALK } from '@/grandma/presenceLines';
import { random } from '@/random';
import type { MemeFeature, MemeScene } from '../memeScene';
import { GRANDMA_FLAT_PLAN } from '../grandmaFlatPlan';
import { PRESENCE_PLAN, type HerSpot } from '../presencePlan';
import { walkHer, walkHome } from './herWay';
import type { GestureName } from '../../people/motion/gestures';

/** Seconds between two of her little jobs (a draw in the range), the first after the way in, and a retry when she is not free. */
const EVERY = { min: 60, max: 150 };
const FIRST = { min: 35, max: 80 };
const RETRY = 20;
/** Seconds at the job before she goes back, and the share of jobs she says a word over. */
const AT_JOB = 3.2;
const WORD_SHARE = 0.5;
/** Dusk and morning for the curtains (game hours: drawn in the first span, opened in the second), the plant's watering hours. */
const CURTAINS: { shut: [number, number]; open: [number, number] } = { shut: [18.5, 24], open: [5, 11] };
const PLANT_HOURS: [number, number] = [8, 18];
const OWNER = 'chores';

/** One of her jobs: where, what she looks at, the hand's gesture, her word, and what it does. */
interface Chore {
  spot: HerSpot;
  look: readonly [number, number, number] | null;
  gesture: GestureName;
  words: readonly string[];
  done?: () => void;
}

const between = ({ min, max }: { min: number; max: number }): number => min + random() * (max - min);

/**
 * HER LIFE WHILE THE PLAYER IS THERE (docs/grandma.md "Her presence"): now and then, when nobody has her and no
 * conversation is open, she gets up for a little job fitting the hour (seeds for the canary in its waking hours, the
 * longcase clock, the curtains drawn at dusk or opened in the morning, the monstera watered by day, the frame over the
 * telephone straightened), says a word to herself, and sits down again.
 */
export const herChores: MemeFeature = {
  id: 'herChores',
  start(scene) {
    let wait = between(FIRST);
    return {
      arrived() {
        wait = between(FIRST);
      },
      update(dt) {
        if (!scene.playerIn) return;
        wait -= dt;
        if (wait > 0) return;
        if (scene.talking || scene.busyWith !== null || scene.ctx.memories?.filming) {
          wait = RETRY;
          return;
        }
        wait = between(EVERY);
        const chore = choose(scene);
        if (chore && scene.claim(OWNER)) doChore(scene, chore);
      },
    };
  },
};

/** The jobs fitting the hour, one drawn. */
function choose(scene: MemeScene): Chore | null {
  const { spots, lookAt } = PRESENCE_PLAN;
  const words = PRESENCE_TALK.chores;
  const hour = scene.hour();
  const window = scene.things.window;
  const chores: Chore[] = [
    { spot: spots.clock, look: lookAt.clock, gesture: 'insertCoin', words: words.clock },
    { spot: spots.phone, look: lookAt.frame, gesture: 'insertCoin', words: words.frame },
  ];
  if (inHours(hour, GRANDMA_FLAT_PLAN.dressing.canaryHours)) chores.push({ spot: spots.cage, look: lookAt.cage, gesture: 'insertCoin', words: words.canary });
  if (inHours(hour, PLANT_HOURS)) chores.push({ spot: spots.plant, look: lookAt.plant, gesture: 'wipeHands', words: words.plant });
  if (inHours(hour, CURTAINS.shut) && !window.curtainsDrawn) chores.push({ spot: spots.curtains, look: null, gesture: 'insertCoin', words: words.curtainsShut, done: () => window.setCurtainsDrawn(true) });
  else if (inHours(hour, CURTAINS.open) && window.curtainsDrawn) chores.push({ spot: spots.curtains, look: null, gesture: 'insertCoin', words: words.curtainsOpen, done: () => window.setCurtainsDrawn(false) });
  // The curtains, when due, before anything else.
  const curtains = chores.find((c) => c.spot === spots.curtains);
  return curtains ?? chores[Math.floor(random() * chores.length)] ?? null;
}

/** Up, to the job, the hand, a word maybe, and back to her seat. */
function doChore(scene: MemeScene, chore: Chore): void {
  walkHer(scene, chore.spot, () => {
    if (chore.look) scene.meme.setFocus(scene.world(...chore.look));
    scene.meme.gesture(chore.gesture);
    chore.done?.();
    if (random() < WORD_SHARE) {
      const word = chore.words[Math.floor(random() * chore.words.length)];
      if (word) scene.meme.say(word);
    }
    scene.zone.after(AT_JOB, () => walkHome(scene, () => scene.release(OWNER)));
  });
}
