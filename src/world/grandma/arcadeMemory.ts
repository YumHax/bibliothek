import * as THREE from 'three';
import type { MemoryReel } from '@/memories/memoryReel';
import { Walker } from '../people/Walker';
import type { GestureName } from '../people/motion/gestures';
import { randomLook, type PersonLook } from '../people/looks';
import { felixLook, playerTeenLook } from './familyLooks';
import { ARCADE_MEMORY_PLAN as PLAN } from './arcadeMemoryPlan';
import { GRANDMA_FLAT_PLAN } from './grandmaFlatPlan';
import { presentPeople } from './presentPeople';
import { hideNamed } from './memoryStage';
import type { Present } from './albumWiring';

/**
 * THREE LETTERS (`MEMORIES` arcade, docs/story.md "Mémé"): a Saturday at the arcade on Front Street, the player at
 * fourteen on the space-invaders cabinet with Félix behind their shoulder, the record beaten, the initials typed in.
 * Filmed in the arcade as it stands, today's regulars and attendant kept out of the picture; back at Mémé's after.
 */
export function arcadeReel(present: Present): MemoryReel {
  const [bx, bz] = GRANDMA_FLAT_PLAN.christmas.after.at;
  const { x: mx, z: mz } = present.meme.position;

  let fired = new Set<string>();
  let cast: { teen: Walker; felix: Walker; watchers: Walker[]; neighbour: Walker } | null = null;
  let today: ReturnType<typeof presentPeople> | null = null;
  /** The tournament's topper: it polls its own `visible` (on a tournament day), so it is put out of sight every frame. */
  let toppers: THREE.Object3D[] = [];
  const once = (t: number, at: number, key: string, run: () => void): void => {
    if (t < at || fired.has(key)) return;
    fired.add(key);
    run();
  };
  const gesture = (who: Walker | undefined, name: GestureName) => who?.gesture(name);

  return {
    id: 'arcade',
    title: 'Three letters',
    tagline: 'From Mémé’s album.',
    back: 'Back to Mémé',
    lines: PLAN.lines,
    score: 'chiptune',
    scenes: [
      {
        zone: 'arcade',
        shots: PLAN.shots,
        stage: (set) => {
          fired = new Set();
          today = presentPeople(set.zone);
          // What the hall of 2003 had not: the LexiPunk cabinet, the Saturday tournament's board and topper, the player's medals of today.
          hideNamed(set, 'ArcadeCabinet:lexipunk', 'TournamentBoard', 'MedalRow');
          toppers = [];
          set.zone.group.traverse((obj) => {
            if (obj.name === 'TournamentTopper') toppers.push(obj);
          });
          const screen = set.world(...PLAN.screen);
          const person = (seed: number, look: PersonLook, [x, z]: readonly [number, number], yaw: number) =>
            set.place(new Walker({ viewer: set.viewer, seed, look }), new THREE.Vector3(x, 0, z), yaw);
          const teen = person(1989, playerTeenLook(), PLAN.teen.at, PLAN.teen.yaw);
          teen.stand(PLAN.teen.yaw, 'play', screen);
          const felix = person(1960, felixLook(), PLAN.felix.at, PLAN.felix.yaw);
          felix.stand(PLAN.felix.yaw, 'pockets', screen);
          const watchers = PLAN.watchers.map((w) => {
            const kid = person(w.seed, randomLook(w.seed, 'shopper', { age: 'child', season: 'autumn' }), w.at, w.yaw);
            kid.stand(w.yaw, w.pose, screen);
            return kid;
          });
          const n = PLAN.neighbour;
          const neighbour = person(n.seed, randomLook(n.seed, 'shopper', { season: 'autumn' }), n.at, n.yaw);
          neighbour.stand(n.yaw, 'play', set.world(...n.screen));
          cast = { teen, felix, watchers, neighbour };
        },
        beat: (t) => {
          today?.hold();
          for (const topper of toppers) topper.visible = false;
          const { teen, felix, watchers, neighbour } = cast ?? {};
          once(t, PLAN.recordAt, 'record', () => gesture(teen, 'cheerHop'));
          once(t, PLAN.felixClapAt, 'clap', () => gesture(felix, 'clap'));
          once(t, PLAN.neighbourLookAt, 'look', () => gesture(neighbour, 'lookAround'));
          once(t, PLAN.watcherClapAt, 'watchers', () => watchers?.forEach((kid, i) => gesture(kid, i ? 'cheerHop' : 'clap')));
          once(t, PLAN.felixPumpAt, 'pump', () => gesture(felix, 'fistPump'));
          once(t, PLAN.initialsFrom, 'initials', () => teen?.setPose('play'));
          once(t, PLAN.felixPointAt, 'point', () => gesture(felix, 'point'));
          once(t, PLAN.felixNudgeAt, 'nudge', () => gesture(felix, 'nudge'));
          once(t, PLAN.teenPumpAt, 'teenPump', () => gesture(teen, 'fistPump'));
        },
        strike: () => {
          today?.release();
          today = null;
          // The topper shows itself again at its next poll, if it is a tournament day.
          toppers = [];
          cast = null;
        },
      },
    ],
    after: { zone: 'grandmaFlat', at: [bx, bz], yaw: Math.atan2(-(mx - bx), -(mz - bz)) },
    returned: () => {
      present.reseat();
      present.meme.speak(present.afterLine);
    },
  };
}
