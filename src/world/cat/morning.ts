import * as THREE from 'three';
import type { CatMind } from './CatMind';
import type { CatPerch } from './spots';
import { chance, rand } from './random';
import { HOUSEHOLD } from '@/household/rules';

/**
 * Hours that count as the morning after (the player woke in bed): the cat is placed then; later jumps
 * only move the needs on. It runs to an hour past the alarm clock's latest setting (a lie-in till noon is a morning too).
 */
const MORNING = { from: 5, to: Math.max(...HOUSEHOLD.alarm.hours) + 1 };
/**
 * On the bed, it sleeps on this long (s) before stretching: the wake-up's curtain (a beat of dark and
 * the fade back, `game/Sleep`) is over by then, so the player sees the stretch and the yawn.
 */
const LIE_IN_S = [2.8, 4] as const;
/** A night without food or water: at least this hungry and thirsty by the morning. */
const NIGHT_NEEDS = { hunger: 0.8, thirst: 0.6 };
/** Chance it spent the end of the night on the people's bed rather than already waiting by its bowl (when there is food in it). */
const ON_THE_BED = 0.5;

/**
 * The clock jumped over a night (see `CatBrain.noticeTimeSkip`): nobody saw what the cat did, so
 * it is put where a cat is at breakfast time: waiting by its bowl, begging when it is empty
 * (eating when it is not), or stretching awake on the people's bed. Needs a free spot; else it
 * stays where it was, only hungrier.
 */
export function placeForMorning(mind: CatMind, night = true): void {
  const { ctx } = mind;
  if (night) {
    mind.hunger = Math.max(mind.hunger, NIGHT_NEEDS.hunger);
    mind.thirst = Math.max(mind.thirst, NIGHT_NEEDS.thirst);
  }
  const hours = ctx.clock.state.hours;
  if (hours < MORNING.from || hours >= MORNING.to) return;

  const bed = favouriteBed(mind);
  const { tmp, tmp2, goal } = mind;
  // Only once it is sure to be moved: left where it was, it keeps its perch (else it would drop off it on its next walk).
  const moved = (): void => {
    mind.setPurr(false);
    mind.sleepRemaining = 0;
    mind.spot = null;
    mind.perch = null;
  };

  if (bed && ctx.bowl.level > 0 && chance(ON_THE_BED)) {
    moved();
    const position = bed.restingSpot(new THREE.Vector3());
    const approach = bed.approachPoint(new THREE.Vector3());
    mind.perch = {
      kind: 'perch',
      position,
      approach,
      facing: null,
      seat: null,
      hopApex: bed.hopApex,
      available: bed.available ? () => bed.available!() : undefined,
    };
    // Facing the side it hops down from (its paws stretch out over the bed, not into the headboard or the wall).
    ctx.motion.teleport(position, Math.atan2(approach.x - position.x, approach.z - position.z));
    mind.enter('sleep');
    mind.timer = rand(LIE_IN_S[0], LIE_IN_S[1]);
    return;
  }

  ctx.bowl.feedingSpot(goal).setY(0);
  if (!ctx.nav.isFree(goal)) return;
  moved();
  ctx.bowl.getWorldPosition(tmp);
  tmp2.subVectors(tmp, goal);
  ctx.motion.teleport(goal, Math.atan2(tmp2.x, tmp2.z));
  mind.enter(ctx.bowl.level > 0 ? 'eat' : 'beg');
}

/** The perch it likes best at night (the people's bed), if it can be slept on and reached. */
function favouriteBed(mind: CatMind): CatPerch | null {
  let best: CatPerch | null = null;
  let bestWeight = 0;
  for (const perch of mind.ctx.perches ?? []) {
    if (perch.available && !perch.available()) continue;
    if (!mind.ctx.nav.isFree(perch.approachPoint(mind.tmp))) continue;
    const weight = perch.catWeight?.(true) ?? 3;
    if (weight > bestWeight) {
      best = perch;
      bestWeight = weight;
    }
  }
  return best;
}
