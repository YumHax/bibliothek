import * as THREE from 'three';
import type { MemoryReel } from '@/memories/memoryReel';
import { Walker } from '../people/Walker';
import { Crate } from '../props/Crate';
import { Suitcase } from '../props/Suitcase';
import { felixLaterLook, playerYoungLook } from './familyLooks';
import { stageFelixFlat } from './felixFlat';
import { LEAVING_MEMORY_PLAN as PLAN } from './leavingMemoryPlan';
import type { Present } from './albumWiring';

/**
 * THE LAST WEDNESDAY (`MEMORIES` leaving, docs/story.md "Mémé"): Félix's flat about 2007, an evening of rain, the
 * lamps on; the player at eighteen, a backpack on and the suitcase by the door, come to say goodbye before going off
 * to study; Félix at his shelves, boxes pulled out on the floor, turning to them: "half of these are yours". The
 * promise, then a cut: the player gone, Félix alone at the window watching the bus go. One scene in the collection
 * room as the opening dreams it; back at Mémé's the player stands by her table, turned to her.
 */
export function leavingReel(present: Present): MemoryReel {
  const [fx, fz] = PLAN.felix.at;
  const [px, pz] = PLAN.player.at;
  const [wx, wz] = PLAN.window.at;
  const [bx, bz] = PLAN.after.at;
  const { x: mx, z: mz } = present.meme.position;

  let fired = new Set<string>();
  let cast: { felix: Walker; player: Walker; suitcase: Suitcase } | null = null;
  let today: { hold(): void; release(): void } | null = null;
  /** World points the eyes go to, set at the staging. */
  let playerHead = new THREE.Vector3();
  let street = new THREE.Vector3();
  /** Once, the first frame the clock passes `at`. */
  const once = (t: number, at: number, key: string, run: () => void): void => {
    if (t < at || fired.has(key)) return;
    fired.add(key);
    run();
  };

  return {
    id: 'leaving',
    title: 'The last Wednesday',
    tagline: 'From Mémé’s album.',
    back: 'Back to Mémé',
    lines: PLAN.lines,
    score: 'lullaby',
    scenes: [
      {
        zone: 'living',
        shots: PLAN.shots,
        light: { curtains: 'open', lamps: 'on', weather: 'rain' },
        stage: (set) => {
          fired = new Set();
          today = stageFelixFlat(set);
          playerHead = set.world(px, PLAN.player.head, pz);
          street = set.world(...PLAN.window.street);
          for (const crate of PLAN.crates) {
            set.place(new Crate({ style: 'cardboard', stack: crate.stack, label: crate.label, seed: crate.seed }), new THREE.Vector3(crate.at[0], 0, crate.at[1]), crate.yaw);
          }
          const [sx, sz] = PLAN.suitcase.at;
          const suitcase = set.place(new Suitcase({ color: PLAN.suitcase.color }), new THREE.Vector3(sx, 0, sz), PLAN.suitcase.yaw);
          const felix = set.place(new Walker({ viewer: set.viewer, seed: 1960, look: felixLaterLook() }), new THREE.Vector3(fx, 0, fz), PLAN.felix.yaw);
          felix.stand(PLAN.felix.yaw, 'think', set.world(...PLAN.felix.shelves));
          const player = set.place(new Walker({ viewer: set.viewer, seed: 1989, look: playerYoungLook() }), new THREE.Vector3(px, 0, pz), PLAN.player.yaw);
          player.stand(PLAN.player.yaw, 'pockets', set.world(fx, PLAN.felix.head, fz));
          cast = { felix, player, suitcase };
        },
        beat: (t) => {
          today?.hold();
          if (!cast) return;
          const { felix, player, suitcase } = cast;
          once(t, PLAN.felixTurnsAt, 'turn', () => felix.stand(PLAN.player.yaw + Math.PI, 'stand', playerHead));
          once(t, PLAN.felixPointAt, 'point', () => felix.gesture('point'));
          once(t, PLAN.playerShyAt, 'shy', () => player.gesture('rubNeck'));
          once(t, PLAN.playerNodAt, 'promise', () => player.nod());
          once(t, PLAN.felixGlassesAt, 'glasses', () => felix.gesture('adjustGlasses'));
          once(t, PLAN.felixSighAt, 'sigh', () => felix.gesture('sigh'));
          once(t, PLAN.felixNodAt, 'nod', () => felix.nod());
          // Under the cut's black: the player gone with the suitcase, Félix at the window.
          once(t, PLAN.windowFrom, 'window', () => {
            player.setPresent(false);
            suitcase.visible = false;
            felix.setPresent(true, new THREE.Vector3(wx, 0, wz));
            felix.stand(PLAN.window.yaw, 'pockets', street);
          });
          once(t, PLAN.felixWaveAt, 'wave', () => felix.gesture('wave'));
          once(t, PLAN.felixLastSighAt, 'lastSigh', () => felix.gesture('sigh'));
        },
        strike: () => {
          today?.release();
          today = null;
          cast = null;
        },
      },
    ],
    after: { zone: 'grandmaFlat', at: [bx, bz], yaw: Math.atan2(-(mx - bx), -(mz - bz)) },
    returned: () => {
      present.meme.setPresent(true);
      present.reseat();
      present.meme.speak(present.afterLine);
    },
  };
}
