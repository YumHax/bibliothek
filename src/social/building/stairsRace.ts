import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { STOREY } from '@/world/measures/building';
import { addExtras } from '../extras';
import { has } from '../perks';
import { nudge } from '../standing';
import type { TalkExtra } from '../talk';
import { BUILDING_PERKS } from './buildingPerksPlan';
import type { PerkDeps } from './perkDeps';
import { doneOn, markDay } from './perkState';
import { random } from '@/random';

/*
 * Pascal Girard's race up the stairs (docs/social.md "The building's perks"): Friendly with him and met at least
 * `minStoreys` below our landing, "Race you up!" starts the clock. He takes `perStorey` s a storey (give or take);
 * reaching our landing (world y 0, the flat's floor) before him wins `coins`. One race a game day; past `limit` s
 * it is off.
 */

const RACE = BUILDING_PERKS.race;
/** The eye is back on our landing above this world height (the flat's floor is y 0). */
const FINISH_EYE = 1;
const EYE = 1.7;

export class StairsRace implements Updatable {
  private running: { elapsed: number; his: number } | null = null;
  private readonly eye = new THREE.Vector3();

  constructor(private readonly deps: PerkDeps, private readonly camera: THREE.Object3D) {
    addExtras(({ person, place, day }) => {
      if (person !== 'girard' || place !== 'stairs' || !has('girard', 'stairsRace') || this.running) return [];
      const storeys = this.storeysBelow();
      if (storeys < RACE.minStoreys) return [];
      const extra: TalkExtra = {
        id: 'girard-race',
        group: 'mean',
        label: 'Race you up!',
        disabled: () => (doneOn('girard-race', day) ? 'He has run enough today' : null),
        run: () => {
          markDay('girard-race', day);
          const [lo, hi] = RACE.spread;
          this.running = { elapsed: 0, his: storeys * RACE.perStorey * (lo + random() * (hi - lo)) };
          return { line: RACE.start, close: true };
        },
      };
      return [extra];
    });
  }

  /** Whole storeys between the player's feet and our landing. */
  private storeysBelow(): number {
    this.camera.getWorldPosition(this.eye);
    return Math.max(0, Math.round(-(this.eye.y - EYE) / STOREY));
  }

  update(dt: number): void {
    const race = this.running;
    if (!race) return;
    race.elapsed += dt;
    this.camera.getWorldPosition(this.eye);
    const day = this.deps.day();
    if (this.eye.y > FINISH_EYE) {
      this.running = null;
      if (race.elapsed <= race.his) {
        this.deps.wallet.earnCoins(RACE.coins);
        nudge('girard', { warmth: RACE.warmth, day, why: 'loved the race', reason: 'race' });
        this.deps.notices.say(RACE.won, 'Pascal');
        this.deps.notices.reward({ title: 'Beat Pascal up the stairs', detail: `${race.elapsed.toFixed(1)} s against his ${race.his.toFixed(1)} s.`, coins: RACE.coins });
      } else {
        nudge('girard', { warmth: RACE.warmth, day, why: 'loved the race', reason: 'race' });
        this.deps.notices.say(RACE.lost, 'Pascal');
        this.deps.notices.react(`Pascal won: ${race.his.toFixed(1)} s, you ${race.elapsed.toFixed(1)} s`);
      }
      return;
    }
    if (race.elapsed > RACE.limit) this.running = null;
  }
}
