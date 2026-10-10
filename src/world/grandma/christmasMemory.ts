import * as THREE from 'three';
import type { MemoryReel } from '@/memories/memoryReel';
import { Walker } from '../people/Walker';
import { ChristmasTree } from '../props/ChristmasTree';
import { childLook, felixLook, memeThenLook } from './familyLooks';
import { GRANDMA_FLAT_PLAN as PLAN } from './grandmaFlatPlan';
import { TableCloth } from './TableCloth';
import { TornParcel } from './memoryProps';
import { bareTableTop, beats, hideNamed, holdHandheld, turnedTo, type HeldHandheld } from './memoryStage';
import type { Present } from './albumWiring';

/** Seated, where a head is (m over the floor), and a standing child's. */
const SEATED_HEAD = 1.12;
const CHILD_HEAD = 1.0;

/**
 * THE CHRISTMAS THE PLAYER WAS SIX (`MEMORIES` christmas95, docs/story.md "Mémé"): Mémé's living room in 1995, the
 * tree in the corner, the festive cloth on the table, Mémé in her armchair, Félix in the visitor's, the child on the
 * rug by the parcel torn out of its sports pages, then playing the Game Boy held up to their face; an evening, the
 * curtains open on the snow outside, the lamp on. One scene in her flat; the people's beats on the film's clock. Back in
 * the room the player stands by the table, turned to her wherever she sits at this hour.
 */
export function christmasReel(present: Present): MemoryReel {
  const plan = PLAN.christmas;
  const [ax, az] = PLAN.armchair.at;
  const [vx, vz] = PLAN.visitorChair.at;
  const [cx, cz] = plan.child.at;
  const after = plan.after.at;

  const beat = beats();
  let cast: { meme: Walker; felix: Walker; child: Walker } | null = null;
  let gameBoy: HeldHandheld | null = null;
  let last = 0;

  return {
    id: 'christmas95',
    title: 'Christmas 1995',
    tagline: 'From Mémé’s album.',
    back: 'Back to Mémé',
    lines: plan.lines,
    score: 'waltz',
    scenes: [
      {
        zone: 'grandmaFlat',
        shots: plan.shots,
        // The curtains open on the snow falling on the avenue (`LindenView` whitens with it), the lamp lit inside.
        light: { curtains: 'open', lamps: 'on', weather: 'snow' },
        stage: (set) => {
          present.meme.setPresent(false);
          beat.reset();
          last = 0;
          // Today's cloth and Sunday table away: the red one of Christmas in their place.
          hideNamed(set, 'TableCloth', 'SundayTable');
          const { width, depth } = PLAN.table;
          set.placeAt(new TableCloth({ width, depth, top: bareTableTop(set.zone), drop: 0.26, color: plan.cloth }), PLAN.table.at);
          set.placeAt(new ChristmasTree({ height: plan.tree.height, radius: plan.tree.radius, presents: 2, seed: 95 }), plan.tree.at);
          const [px, pz] = plan.parcel.at;
          set.place(new TornParcel(), new THREE.Vector3(px, 0, pz), plan.parcel.yaw);
          const childHead = set.world(cx, CHILD_HEAD, cz);
          const meme = set.place(new Walker({ viewer: set.viewer, seed: 1931, look: memeThenLook() }), new THREE.Vector3(ax, 0, az), PLAN.armchair.yaw);
          meme.sit(PLAN.armchair.yaw, PLAN.seatHeight, 'lap', childHead);
          const felix = set.place(new Walker({ viewer: set.viewer, seed: 1960, look: felixLook() }), new THREE.Vector3(vx, 0, vz), PLAN.visitorChair.yaw);
          felix.sit(PLAN.visitorChair.yaw, PLAN.seatHeight, 'lap', childHead);
          const look = childLook();
          const child = set.place(new Walker({ viewer: set.viewer, seed: 1989, look }), new THREE.Vector3(cx, 0, cz), plan.child.yaw);
          child.stand(plan.child.yaw, 'stand', set.world(vx, SEATED_HEAD, vz));
          // The Game Boy, still in its box until it is out of the paper.
          gameBoy = holdHandheld(child, look.height);
          gameBoy.show(false);
          cast = { meme, felix, child };
        },
        beat: (t) => {
          gameBoy?.tick(Math.max(0, t - last));
          last = t;
          if (!cast) return;
          const { meme, felix, child } = cast;
          beat.at(t, plan.cheerAt, 'cheer', () => child.gesture('cheerHop'));
          beat.at(t, plan.clapAt, 'clap', () => meme.gesture('clap'));
          beat.at(t, plan.playFrom, 'play', () => {
            if (!gameBoy) return;
            gameBoy.show(true);
            child.stand(plan.child.yaw, 'play', gameBoy.screen, gameBoy.hands);
          });
          beat.at(t, plan.felixShrugAt, 'shrug', () => felix.gesture('shrug'));
          beat.at(t, plan.childPumpAt, 'pump', () => child.gesture('fistPump'));
          beat.at(t, plan.felixScratchAt, 'scratch', () => felix.gesture('scratchHead'));
          beat.at(t, plan.nodAt, 'nod', () => meme.nod());
        },
        strike: () => {
          gameBoy?.dispose();
          gameBoy = null;
          cast = null;
        },
      },
    ],
    after: { zone: 'grandmaFlat', at: after, yaw: turnedTo(present, after) },
    returned: () => {
      present.meme.setPresent(true);
      present.reseat();
      present.meme.speak(present.afterLine);
    },
  };
}
