import * as THREE from 'three';
import type { MemoryReel } from '@/memories/memoryReel';
import { Walker } from '../people/Walker';
import { Cushion } from '../props/Cushion';
import { childNineLook, felixLook } from './familyLooks';
import { stageFelixFlat } from './felixFlat';
import { WEDNESDAYS_MEMORY_PLAN as PLAN } from './wednesdaysMemoryPlan';
import type { Present } from './albumWiring';

/**
 * WEDNESDAYS AT FÉLIX'S (`MEMORIES` wednesdays, docs/story.md "Mémé"): his flat about 1998, every shelf full, the
 * curtains drawn against the glare and the lamps on; the child at nine on a cushion before the set, blowing into a
 * cartridge, then playing; Félix in his armchair reading the manual out loud, then pointing the way. One scene in
 * the collection room as the opening dreams it; back at Mémé's the player stands by her table, turned to her.
 */
export function wednesdaysReel(present: Present): MemoryReel {
  const [cx, cz] = PLAN.child.at;
  const [fx, fz] = PLAN.felix.at;
  const [bx, bz] = PLAN.after.at;
  const { x: mx, z: mz } = present.meme.position;

  let fired = new Set<string>();
  let cast: { felix: Walker; child: Walker } | null = null;
  let today: { hold(): void; release(): void } | null = null;
  /** World points the eyes go to, set at the staging. */
  let childHead = new THREE.Vector3();
  let felixHead = new THREE.Vector3();
  /** Once, the first frame the clock passes `at`. */
  const once = (t: number, at: number, key: string, run: () => void): void => {
    if (t < at || fired.has(key)) return;
    fired.add(key);
    run();
  };

  return {
    id: 'wednesdays',
    title: 'Wednesdays at Félix’s',
    tagline: 'From Mémé’s album.',
    back: 'Back to Mémé',
    lines: PLAN.lines,
    score: 'chiptune',
    scenes: [
      {
        zone: 'living',
        shots: PLAN.shots,
        light: { curtains: 'drawn', lamps: 'on' },
        stage: (set) => {
          fired = new Set();
          today = stageFelixFlat(set);
          const screen = set.world(...PLAN.screen);
          childHead = set.world(cx, PLAN.childHead, cz);
          felixHead = set.world(fx, PLAN.felixHead, fz);
          set.place(new Cushion(PLAN.cushion), new THREE.Vector3(cx, 0, cz), PLAN.child.yaw);
          const child = set.place(new Walker({ viewer: set.viewer, seed: 1989, look: childNineLook() }), new THREE.Vector3(cx, 0, cz), PLAN.child.yaw);
          child.sit(PLAN.child.yaw, PLAN.child.seat, 'lap', screen);
          const felix = set.place(new Walker({ viewer: set.viewer, seed: 1960, look: felixLook() }), new THREE.Vector3(fx, 0, fz), PLAN.felix.yaw);
          felix.sit(PLAN.felix.yaw, PLAN.felix.seat, 'read', set.world(...PLAN.felix.book));
          felix.hold('book');
          cast = { felix, child };
        },
        beat: (t) => {
          today?.hold();
          if (!cast) return;
          const { felix, child } = cast;
          once(t, PLAN.blowAt, 'blow', () => child.gesture('coverMouth'));
          once(t, PLAN.blowAgainAt, 'blowAgain', () => child.gesture('coverMouth'));
          once(t, PLAN.playFrom, 'play', () => child.setPose('play'));
          once(t, PLAN.felixGlassesAt, 'glasses', () => felix.gesture('adjustGlasses'));
          once(t, PLAN.felixLooksUpAt, 'looksUp', () => {
            felix.hold(null);
            felix.setPose('lap');
            felix.setFocus(childHead);
          });
          once(t, PLAN.felixPointAt, 'point', () => felix.gesture('point'));
          once(t, PLAN.childTurnsAt, 'turn', () => child.setFocus(felixHead));
          once(t, PLAN.childPumpAt, 'pump', () => child.gesture('fistPump'));
          once(t, PLAN.felixClapAt, 'clap', () => felix.gesture('clap'));
          once(t, PLAN.felixNodAt, 'nod', () => felix.nod());
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
