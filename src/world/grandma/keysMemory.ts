import * as THREE from 'three';
import type { MemoryReel } from '@/memories/memoryReel';
import { Walker } from '../people/Walker';
import { memeLook } from './familyLooks';
import { KEYS_MEMORY_PLAN as PLAN } from './keysMemoryPlan';
import { KeyRing } from './memoryProps';
import { beats, hideNamed, tableTop, turnedTo } from './memoryStage';
import { presentPeople } from './presentPeople';
import type { Present } from './albumWiring';

/** How far over the palms the keys lie (m). */
const IN_PALMS = 0.018;

/**
 * THE KEYS (`MEMORIES` keys, docs/story.md "Mémé"): the last memory, the nearest. At Mémé's on a Monday afternoon
 * this year, Félix's keys on the table before her, then held out to the player (the camera's eyes: the player is never
 * seen); then our landing, the push in to the flat's door, and the opening's own line to end on ("By the time you got
 * the keys…"): the film the game began with picks up from there. The lullaby. Back in her room after, by the table.
 */
export function keysReel(present: Present): MemoryReel {
  const after = PLAN.after.at;
  const beat = beats();
  let her: { seated: Walker; standing: Walker; keys: KeyRing; palms: THREE.Vector3; eyes: THREE.Vector3 } | null = null;
  let landing: { hold(): void; release(): void } | null = null;

  return {
    id: 'keys',
    title: 'A day late',
    tagline: 'From Mémé’s album. The last page.',
    back: 'Back to Mémé',
    lines: PLAN.lines,
    score: 'lullaby',
    scenes: [
      {
        zone: 'grandmaFlat',
        shots: PLAN.shots.flat,
        light: { curtains: 'open', lamps: 'off' },
        stage: (set) => {
          present.meme.setPresent(false);
          beat.reset();
          hideNamed(set, 'SundayTable');
          const top = tableTop(set.zone);
          const [kx, kz] = PLAN.keysOnTable.at;
          const keys = set.place(new KeyRing(), new THREE.Vector3(kx, top, kz), PLAN.keysOnTable.yaw);
          // Today's Mémé, as the player knows her: at the table, then on her feet (one or the other shown).
          const { seated: s, standing: u, hands } = PLAN;
          const seated = set.place(new Walker({ viewer: set.viewer, seed: 1931, look: memeLook() }), new THREE.Vector3(s.at[0], 0, s.at[1]), s.yaw);
          seated.sit(s.yaw, s.seat, 'lap', set.world(kx, top, kz));
          const standing = set.place(new Walker({ viewer: set.viewer, seed: 1931, look: memeLook() }), new THREE.Vector3(u.at[0], 0, u.at[1]), u.yaw);
          const ahead = u.at[1] + hands.ahead;
          const left = set.world(u.at[0] + hands.apart, hands.y, ahead);
          const right = set.world(u.at[0] - hands.apart, hands.y, ahead);
          const palms = set.world(u.at[0], hands.y + IN_PALMS, ahead);
          standing.stand(u.yaw, 'stand', palms, () => [left, right]);
          standing.setPresent(false);
          her = { seated, standing, keys, palms: new THREE.Vector3(u.at[0], hands.y + IN_PALMS, ahead), eyes: set.world(0.05, 1.62, 0.2) };
        },
        beat: (t) => {
          if (!her) return;
          const { seated, standing, keys, palms, eyes } = her;
          beat.at(t, PLAN.standAt, 'up', () => {
            seated.setPresent(false);
            standing.setPresent(true);
            keys.position.copy(palms);
          });
          beat.at(t, PLAN.lookUpAt, 'look', () => {
            standing.setFocus(eyes);
            standing.feel({ smile: 0.3, frown: 0.3 }, 5);
          });
        },
        strike: () => {
          her = null;
        },
      },
      {
        zone: 'stairwell',
        shots: PLAN.shots.landing,
        stage: (set) => {
          // Nobody on the stairs that day: today's neighbours kept out of the picture.
          landing = presentPeople(set.zone);
        },
        beat: () => landing?.hold(),
        strike: () => {
          landing?.release();
          landing = null;
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
