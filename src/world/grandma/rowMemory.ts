import * as THREE from 'three';
import type { MemoryReel } from '@/memories/memoryReel';
import type { PersonLook } from '../people/looks';
import { Walker } from '../people/Walker';
import { childNineLook, felixLook, gaspardLook, memeThenLook } from './familyLooks';
import { GRANDMA_FLAT_PLAN as PLAN } from './grandmaFlatPlan';
import { ColdSupper } from './memoryProps';
import { beats, hideNamed, holdHandheld, tableTop, turnedTo, type HeldHandheld } from './memoryStage';
import type { Present } from './albumWiring';

/** Where a seated head is at the table (m over the floor), and in the armchair (the child's). */
const TABLE_HEAD = 1.15;
const ARMCHAIR_HEAD = 1.12;
/** Félix's head on his feet. */
const STANDING_HEAD = 1.62;

/** Gaspard at forty-one: the same man as at the sale, the hair still dark. */
function gaspardThenLook(): PersonLook {
  return { ...gaspardLook(), hair: 0x2e241c };
}

/** The player at ten, on a winter Sunday: the nine-year-old's build in a jumper. */
function childTenLook(): PersonLook {
  return { ...childNineLook(), height: 1.38, headScale: 1.11, top: 'stripes', topColor: 0x3a5a3a, topAccent: 0xe8e0c8, longSleeves: true };
}

/**
 * THE ROW (`MEMORIES` row, docs/story.md "Mémé"): Mémé's dining room on a Sunday evening in 1999, the supper gone
 * cold. Gaspard says the cartridges are money asleep; Félix stands up and says they are the kid's; the child of ten
 * in the armchair, Game Boy up, hears it all without looking up, then does; Mémé between them, eyes on her plate.
 * One scene in her flat, the curtains drawn and the lamp on; the score in a minor key. Back in the room the player
 * stands by the table, turned to her.
 */
export function rowReel(present: Present): MemoryReel {
  const plan = PLAN.row;
  const [ax, az] = PLAN.armchair.at;
  const after = plan.after.at;

  const beat = beats();
  let cast: { gaspard: Walker; felix: Walker; felixUp: Walker; meme: Walker; child: Walker; childHead: THREE.Vector3; felixHead: THREE.Vector3 } | null = null;
  let gameBoy: HeldHandheld | null = null;
  let last = 0;

  return {
    id: 'row',
    title: 'Money asleep',
    tagline: 'From Mémé’s album.',
    back: 'Back to Mémé',
    lines: plan.lines,
    score: 'minor',
    scenes: [
      {
        zone: 'grandmaFlat',
        shots: plan.shots,
        light: { curtains: 'drawn', lamps: 'on' },
        stage: (set) => {
          present.meme.setPresent(false);
          beat.reset();
          last = 0;
          // The supper on today's cloth; her Sunday table of today out of the way.
          hideNamed(set, 'SundayTable');
          set.placeAt(new ColdSupper({ top: tableTop(set.zone), width: PLAN.table.width }), PLAN.table.at);
          const seated = (seed: number, look: PersonLook, spot: { at: readonly [number, number]; yaw: number }, eyes: THREE.Vector3): Walker => {
            const person = set.place(new Walker({ viewer: set.viewer, seed, look }), new THREE.Vector3(spot.at[0], 0, spot.at[1]), spot.yaw);
            person.sit(spot.yaw, plan.seat, 'lap', eyes);
            return person;
          };
          const head = (spot: { at: readonly [number, number] }) => set.world(spot.at[0], TABLE_HEAD, spot.at[1]);
          const gaspard = seated(1958, gaspardThenLook(), plan.gaspard, head(plan.felix));
          const felix = seated(1960, felixLook(), plan.felix, head(plan.gaspard));
          const meme = seated(1931, memeThenLook(), plan.meme, set.world(plan.meme.at[0], 0.8, plan.meme.at[1] + 0.35));
          // Félix on his feet, there from his cut on (the chair's Félix gone in the same black).
          const [fx, fz] = plan.felixStands.at;
          const felixUp = set.place(new Walker({ viewer: set.viewer, seed: 1960, look: felixLook() }), new THREE.Vector3(fx, 0, fz), plan.felixStands.yaw);
          felixUp.stand(plan.felixStands.yaw, 'stand', set.world(plan.gaspard.at[0], TABLE_HEAD, plan.gaspard.at[1]));
          felixUp.setPresent(false);
          // The child in her armchair, the Game Boy up, deaf to the table (or so it looks).
          const look = childTenLook();
          const child = set.place(new Walker({ viewer: set.viewer, seed: 1989, look }), new THREE.Vector3(ax, 0, az), PLAN.armchair.yaw);
          gameBoy = holdHandheld(child, look.height, PLAN.seatHeight);
          child.sit(PLAN.armchair.yaw, PLAN.seatHeight, 'play', gameBoy.screen, gameBoy.hands);
          cast = { gaspard, felix, felixUp, meme, child, childHead: set.world(ax, ARMCHAIR_HEAD, az), felixHead: set.world(fx, STANDING_HEAD, fz) };
        },
        beat: (t) => {
          gameBoy?.tick(Math.max(0, t - last));
          last = t;
          if (!cast) return;
          const { gaspard, felix, felixUp, meme, child, childHead, felixHead } = cast;
          beat.at(t, plan.gaspardPointAt, 'point', () => gaspard.gesture('point'));
          beat.at(t, plan.gaspardRubAt, 'rub', () => gaspard.gesture('rubHands'));
          beat.at(t, plan.felixStandAt, 'stand', () => {
            felix.setPresent(false);
            felixUp.setPresent(true);
          });
          beat.at(t, plan.felixPointAt, 'kid', () => {
            felixUp.setFocus(childHead);
            felixUp.gesture('point');
          });
          beat.at(t, plan.childLooksUpAt, 'up', () => child.setFocus(felixHead));
          beat.at(t, plan.childBackAt, 'down', () => {
            if (gameBoy) child.setFocus(gameBoy.screen);
          });
          beat.at(t, plan.memeSighAt, 'sigh', () => {
            meme.gesture('sigh');
            meme.feel({ frown: 0.45, smile: 0 }, 4);
          });
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
