import * as THREE from 'three';
import { PRESENCE_TALK } from '@/grandma/presenceLines';
import { random } from '@/random';
import { placeWith } from '../../zone/attach';
import type { MemeFeature, MemeScene } from '../memeScene';
import { PRESENCE_PLAN } from '../presencePlan';
import { TeaSteam } from '../TeaSteam';
import { walkHer, walkHome } from './herWay';

/** Seconds: her answer before she gets up, a word from the kitchenette, the kettle to the whistle and off it. */
const TIMING = { getUp: 1.2, word: 2.5, kettle: 12 };
const OWNER = 'tea';

const pick = (list: readonly string[]): string => list[Math.floor(random() * list.length)] ?? list[0] ?? '';

/**
 * A CUP OF TEA AT HERS (docs/grandma.md "Her presence"): asked for in her conversation, once a day: she gets up, puts
 * the kettle on at the cooker (it whistles), says a word from the kitchenette, comes back to the side table and pours
 * (the cups on the tray steam a while), then sits down again. Hidden while she is busy with something else.
 */
export const tea: MemeFeature = {
  id: 'tea',
  start(scene) {
    const presence = scene.ctx.grandmaPresence;
    if (!presence) return {};
    const steam = placeWith(scene.zone, scene.things.tray, new TeaSteam(), new THREE.Vector3());
    return {
      extras: () => [
        {
          id: 'memeTea',
          group: 'talk',
          label: PRESENCE_TALK.tea.ask,
          disabled: () => (scene.busyWith !== null ? 'She is busy' : presence.hadTea(scene.day()) ? 'Tea already today' : null),
          run: () => {
            if (!scene.claim(OWNER)) return undefined;
            presence.teaOn(scene.day());
            scene.zone.after(TIMING.getUp, () => makeTea(scene, steam));
            return { line: pick(PRESENCE_TALK.tea.yes), close: true };
          },
        },
      ],
    };
  },
};

/** The kettle on, the word from the kitchenette, the pot poured at the side table, back to her seat. */
function makeTea(scene: MemeScene, steam: TeaSteam): void {
  const { spots } = PRESENCE_PLAN;
  walkHer(scene, spots.kettle, () => {
    scene.things.kettle.whistle();
    scene.meme.gesture('rubHands');
    scene.zone.after(TIMING.word, () => scene.meme.speak(pick(PRESENCE_TALK.tea.kitchen)));
    scene.zone.after(TIMING.kettle, () =>
      walkHer(scene, spots.tray, () => {
        steam.pour();
        scene.meme.gesture('wipeHands');
        scene.meme.speak(pick(PRESENCE_TALK.tea.poured));
        scene.zone.after(2, () => walkHome(scene, () => scene.release(OWNER)));
      }),
    );
  });
}
