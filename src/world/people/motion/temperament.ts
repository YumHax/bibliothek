import { seededRandom } from '@/covers/generated/canvasUtils';
import type { PersonLook } from '../looks';

/*
 * How a person carries themselves, from their seed: nobody moves quite like anyone else. Quick or
 * unhurried, big or small in their gestures, upright or a little slumped, fidgety or still, the
 * feet close or apart, and how readily their face and body show what they feel.
 */

export interface Temperament {
  /** Speed of every move, the springs' and the gestures': 0.85 unhurried .. 1.2 brisk. */
  tempo: number;
  /** Size of gestures and reactions: 0.7 contained .. 1.3 exuberant. */
  energy: number;
  /** 0 upright .. 1 a slumped back and the head forward. */
  slouch: number;
  /** Mean seconds between two idle fidgets (a scratch, a look at the watch). */
  fidgetEvery: number;
  /** How far apart the feet stand beyond the hips (metres at the reference height). */
  stance: number;
  /** 0..1: how likely a reaction shows in the body, not only on the face. */
  expressive: number;
}

/** A person's temperament, fixed by `seed` (the build nudges the stance). */
export function temperamentOf(seed: number, look: PersonLook): Temperament {
  const random = seededRandom(seed * 40503 + 911);
  const energy = 0.7 + random() * 0.6;
  return {
    tempo: 0.85 + random() * 0.35,
    energy,
    slouch: random() ** 1.6,
    fidgetEvery: 6 + random() * 16,
    stance: -0.01 + random() * 0.05 + (look.build - 1) * 0.04,
    expressive: Math.min(1, 0.25 + random() * 0.55 + (energy - 1) * 0.5),
  };
}

/** A seed from a look, for a person built without one (the same look always moves the same). */
export function seedOfLook(look: PersonLook): number {
  return Math.round(look.height * 1000) * 31 + look.skin * 7 + look.topColor * 3 + look.trousers;
}
