import * as THREE from 'three';
import type { CatMind } from './CatMind';
import { TROT_SPEED, WALK_SPEED } from './CatMotion';
import type { WaterBowlLike } from './types';
import { isElevated, pickRestingSpot, pickWeighted } from './spots';
import { chance, rand } from './random';

/** What the cat decides to do next when idle (or is made to do). */
export type Activity =
  | 'none'
  | 'sleep'
  | 'eat'
  | 'beg'
  | 'drink'
  | 'groom'
  | 'wander'
  | 'explore'
  | 'window'
  | 'scratch'
  | 'rugScratch'
  | 'toy'
  | 'tvWatch'
  | 'chase'
  | 'rub'
  | 'sunbathe'
  | 'lap'
  | 'call'
  | 'flee'
  | 'fleeMild';

export interface ActivityDef {
  /** How much an idle cat wants to do it now; without one it is never chosen, only started (a call, a lap, a scare). */
  weight?(mind: CatMind): number;
  /** Sets off: walks there, or enters the state. False when impossible right now (the cat idles and thinks again shortly). */
  begin(mind: CatMind): boolean;
}

/** After finding the way to another room shut, the cat does not try again for this long. */
const EXPLORE_RETRY_S = 45;

/** 1 - `sleepDrive`: how lively the cat is at this time of day. */
function active(mind: CatMind): number {
  return 1 - mind.sleepDrive();
}

function hungry(mind: CatMind): boolean {
  return mind.hunger > 0.55;
}

/**
 * Every activity: how much an idle cat wants it, and how it sets off. The compiler keeps it
 * complete. The ones with a weight come first, in the order of the weighted draw.
 */
export const ACTIVITIES: Record<Activity, ActivityDef> = {
  sleep: {
    // Sleeping wins most of the day: the weight grows steeply with tiredness so a tired cat rarely does anything else.
    weight: (mind) => {
      const drive = mind.sleepDrive();
      return drive * drive * 14 + (mind.perch ? 1 : 0);
    },
    begin(mind) {
      if (mind.perch) {
        mind.enter('lie');
        return true;
      }
      const { ctx } = mind;
      const spot = pickRestingSpot({
        nav: ctx.nav,
        bounds: ctx.bounds,
        seats: ctx.seats,
        playerSeat: mind.playerSeat,
        bed: ctx.bed,
        windows: ctx.windows,
        rugPoint: ctx.tv ? ctx.tv.watchingSpot(new THREE.Vector3()) : undefined,
        perches: ctx.perches,
        from: ctx.cat.position,
        night: ctx.clock.state.night,
      });
      if (!spot) return false;
      mind.spot = spot;
      if (isElevated(spot)) mind.goTo(spot.approach, 'mount');
      else mind.goTo(spot.position, 'lie');
      return true;
    },
  },
  eat: {
    weight: (mind) => (hungry(mind) && mind.ctx.bowl.level > 0 ? mind.hunger * 5 : 0),
    begin(mind) {
      mind.goTo(mind.ctx.bowl.feedingSpot(mind.goal), 'eat');
      return true;
    },
  },
  beg: {
    weight: (mind) => (hungry(mind) && mind.ctx.bowl.level <= 0 && mind.begCooldown <= 0 ? mind.hunger * 3 : 0),
    begin(mind) {
      mind.goTo(mind.ctx.bowl.feedingSpot(mind.goal), 'beg');
      return true;
    },
  },
  drink: {
    weight: (mind) => ((mind.ctx.water || mind.ctx.waters?.length) && mind.thirst > 0.5 ? mind.thirst * 2 : 0),
    begin(mind) {
      // The nearest bowl first; one behind a shut door is skipped for the next.
      const { cat, nav, motion } = mind.ctx;
      const bowls = [mind.ctx.water, ...(mind.ctx.waters ?? [])].filter((b): b is WaterBowlLike => b !== undefined);
      const distance = (b: WaterBowlLike) => b.drinkingSpot(mind.tmp).distanceToSquared(cat.position);
      bowls.sort((a, b) => distance(a) - distance(b));
      for (const bowl of bowls) {
        if (!nav.isFree(bowl.drinkingSpot(mind.goal)) || !motion.walkTo(mind.goal, WALK_SPEED)) continue;
        mind.drinkingFrom = bowl;
        mind.next = 'drink';
        mind.enter('walk');
        return true;
      }
      return false;
    },
  },
  groom: {
    weight: (mind) => (mind.groomIn <= 0 ? 3 : 0.3),
    begin(mind) {
      mind.enter('groom');
      return true;
    },
  },
  wander: {
    weight: (mind) => 0.6 + active(mind),
    begin(mind) {
      // Its own room: a cat that wandered off elsewhere drifts back home.
      if (!mind.ctx.nav.randomFreePoint(mind.goal, undefined, undefined, mind.ctx.bounds)) return false;
      mind.goTo(mind.goal, 'lookAround');
      return true;
    },
  },
  explore: {
    weight: (mind) => (mind.ctx.visits?.length && mind.exploreCooldown <= 0 ? 0.25 + 0.5 * active(mind) : 0),
    begin(mind) {
      // Another room of the flat, if the doors on the way are open: a look round, then back to its day.
      const visits = mind.ctx.visits;
      if (!visits?.length) return false;
      mind.goal.copy(visits[Math.floor(Math.random() * visits.length)]!);
      mind.goal.x += THREE.MathUtils.randFloatSpread(0.5);
      mind.goal.z += THREE.MathUtils.randFloatSpread(0.5);
      if (mind.ctx.motion.walkTo(mind.goal, WALK_SPEED)) {
        mind.next = 'lookAround';
        mind.enter('walk');
        return true;
      }
      mind.exploreCooldown = EXPLORE_RETRY_S;
      return false;
    },
  },
  window: {
    weight: (mind) => (mind.ctx.windows?.length ? (mind.ctx.clock.state.night ? 0.2 : 0.5 + active(mind)) : 0),
    begin(mind) {
      const windows = mind.ctx.windows;
      if (!windows?.length) return false;
      const window = windows[Math.floor(Math.random() * windows.length)];
      window.lookoutSpot(mind.goal).setY(0);
      mind.setFacing(window.getWorldPosition(mind.tmp));
      mind.goTo(mind.goal, 'window');
      return true;
    },
  },
  scratch: {
    weight: (mind) => (mind.ctx.scratcher ? 0.3 + 0.5 * active(mind) : 0),
    begin(mind) {
      const scratcher = mind.ctx.scratcher;
      if (!scratcher) return false;
      mind.setFacing(scratcher.facingPoint(mind.tmp));
      mind.goTo(scratcher.scratchingSpot(mind.goal).setY(0), 'scratch');
      return true;
    },
  },
  rugScratch: {
    weight: (mind) => (mind.ctx.tv !== undefined ? 0.15 + 0.2 * active(mind) : 0),
    begin(mind) {
      const tv = mind.ctx.tv;
      if (!tv) return false;
      tv.watchingSpot(mind.goal).setY(0);
      mind.goal.x += THREE.MathUtils.randFloatSpread(0.6);
      mind.goal.z += THREE.MathUtils.randFloatSpread(0.6);
      mind.goTo(mind.goal, 'rugScratch');
      return true;
    },
  },
  toy: {
    weight: (mind) => (mind.ctx.toy ? 0.3 + active(mind) : 0),
    begin(mind) {
      const { toy, cat, nav } = mind.ctx;
      if (!toy) return false;
      // A new bout, unless this is the next round of one (straight from watching the ball roll).
      if (mind.state !== 'toyWatch') {
        mind.bout.done = 0;
        mind.bout.of = chance(0.5) ? 2 : 3;
      }
      const { tmp, tmp2, goal } = mind;
      toy.getWorldPosition(tmp).setY(0);
      tmp2.subVectors(cat.position, tmp).setY(0);
      if (tmp2.lengthSq() < 1e-4) tmp2.set(1, 0, 0);
      goal.copy(tmp).addScaledVector(tmp2.normalize(), 0.45);
      if (!nav.isFree(goal) && !nav.randomFreePoint(goal, tmp, 0.6)) return false;
      mind.goTo(goal, 'toyStalk');
      return true;
    },
  },
  tvWatch: {
    weight: (mind) => (mind.ctx.tv?.isPlaying() ? 2.5 : 0),
    begin(mind) {
      const tv = mind.ctx.tv;
      if (!tv) return false;
      const { tmp, goal } = mind;
      tv.watchingSpot(goal).setY(0);
      if (tv.screenPoint) tv.screenPoint(tmp);
      else {
        // No screen point given: face away from the middle of the room, towards the wall the TV is on.
        mind.ctx.bounds.getCenter(mind.tmp2d);
        tmp.set(goal.x - mind.tmp2d.x, 0, goal.z - mind.tmp2d.y);
        if (tmp.lengthSq() < 1e-4) tmp.set(-1, 0, 0);
        tmp.normalize().multiplyScalar(2).add(goal).setY(0.8);
      }
      mind.setFacing(tmp);
      mind.goTo(goal, 'tvWatch');
      return true;
    },
  },
  chase: {
    weight: (mind) => 0.05 + 0.1 * active(mind),
    begin(mind) {
      mind.bout.done = 0;
      mind.bout.of = Math.floor(rand(3, 6));
      mind.enter('flyStalk');
      return true;
    },
  },
  rub: {
    weight: (mind) => 0.3 + 0.3 * active(mind),
    begin(mind) {
      const { seats, nav } = mind.ctx;
      const seat = seats[Math.floor(Math.random() * seats.length)];
      if (!seat) return false;
      const side = chance(0.5) ? 1 : -1;
      for (const s of [side, -side]) {
        seat.localToWorld(mind.goal.set(s * 0.55, 0, -0.2)).setY(0);
        seat.localToWorld(mind.rubEnd.set(s * 0.55, 0, 0.25)).setY(0);
        if (nav.isFree(mind.goal) && nav.isFree(mind.rubEnd)) {
          mind.goTo(mind.goal, 'rub');
          return true;
        }
      }
      return false;
    },
  },
  sunbathe: {
    weight: (mind) => (mind.findSunSpot(mind.tmp) !== null ? 1 + mind.sleepDrive() : 0),
    begin(mind) {
      const window = mind.findSunSpot(mind.goal);
      if (!window) return false;
      mind.setFacing(window.getWorldPosition(mind.tmp));
      mind.goTo(mind.goal, 'sunbathe');
      return true;
    },
  },

  // Never chosen when idle: started by a reaction.
  none: {
    begin: () => false,
  },
  lap: {
    begin(mind) {
      if (!mind.playerSeat) return false;
      mind.goTo(mind.playerSeat.approachPoint(mind.goal).setY(0), 'mountLap');
      return true;
    },
  },
  call: {
    begin(mind) {
      // Stop 0.8 m short of the player, on the side the cat comes from.
      const { tmp, tmp2, goal } = mind;
      tmp.set(mind.eye.x, 0, mind.eye.z);
      tmp2.subVectors(mind.ctx.cat.position, tmp).setY(0);
      if (tmp2.lengthSq() < 1e-4) tmp2.set(0, 0, 1);
      goal.copy(tmp).addScaledVector(tmp2.normalize(), 0.8);
      if (!mind.ctx.nav.isFree(goal) && !mind.ctx.nav.randomFreePoint(goal, tmp, 1)) return false;
      mind.goTo(goal, 'called');
      return true;
    },
  },
  flee: {
    begin: (mind) => runOff(mind, false),
  },
  fleeMild: {
    begin: (mind) => runOff(mind, true),
  },
};

/** The activities an idle cat picks from, in the order of the draw. */
const CHOOSABLE = (Object.keys(ACTIVITIES) as Activity[]).filter((activity) => ACTIVITIES[activity].weight !== undefined);

/** An idle cat's weighted pick; `wander` when nothing weighs anything. */
export function pickActivity(mind: CatMind): Activity {
  const options = CHOOSABLE.map((activity) => ({ activity, weight: ACTIVITIES[activity].weight?.(mind) ?? 0 }));
  return pickWeighted(options)?.activity ?? 'wander';
}

/** Away from the player: trotting when scared, walking off when merely fed up. */
function runOff(mind: CatMind, mild: boolean): boolean {
  if (!pointAwayFromPlayer(mind, mind.goal, mild ? 1.5 : 2)) return false;
  mind.goTo(mind.goal, 'idle', mild ? WALK_SPEED : TROT_SPEED, 'flee');
  return true;
}

/** A free floor point at least `minDistance` from the player (the furthest of a few tries). */
function pointAwayFromPlayer(mind: CatMind, out: THREE.Vector3, minDistance: number): boolean {
  const { tmp, eye } = mind;
  let bestDistance = -1;
  for (let i = 0; i < 12; i++) {
    // Near where it is: the grid spans the whole flat, and a point behind a shut door is no escape.
    if (!mind.ctx.nav.randomFreePoint(tmp, mind.ctx.cat.position, 3.5)) continue;
    const d = Math.hypot(tmp.x - eye.x, tmp.z - eye.z);
    if (d > bestDistance) {
      bestDistance = d;
      out.copy(tmp);
    }
    if (d >= minDistance && d < minDistance + 1.5 && chance(0.5)) break;
  }
  return bestDistance >= 0;
}
