import * as THREE from 'three';
import { PRESENCE_TALK } from '@/grandma/presenceLines';
import { playRotaryRing } from '@/audio/grandmaVoice';
import { loudness } from '@/audio/hearing';
import { stereoPan } from '@/audio/spatial';
import { random } from '@/random';
import type { MemeFeature, MemeScene } from '../memeScene';
import { PRESENCE_PLAN } from '../presencePlan';
import { walkHer, walkHome } from './herWay';

/** The share of visits he rings on (when he may), seconds after the hello before he does, a retry while she is not free. */
const CHANCE = 0.5;
const AFTER = { min: 45, max: 100 };
const RETRY = 15;
/** The bell: rings, its level at the set, how far it carries, the set's height; seconds before she gets up to it. */
const BELL = { rings: 2, level: 0.14, maxDistance: 12, y: 0.75 };
const GET_UP = 1.2;
/** Seconds between two of her words into the receiver, and after hanging up before she goes back. */
const WORD_GAP = 2.8;
const HANG_UP = 1.5;
const OWNER = 'gaspardCall';

const pick = <T>(list: readonly T[]): T | undefined => list[Math.floor(random() * list.length)];

/**
 * GASPARD RINGS (docs/grandma.md "Her presence"): once Félix's notebook is found (the row's memory open) and at most
 * once a week, on some visits the rotary telephone by the door rings while the player is there: she gets up to it,
 * her side of the call is heard ("Yes, Gaspard. No, Gaspard."), her face falls, she hangs up and comes back with a
 * word about her son. Gaspard in person is the end of the story's (docs/grandma.md "The end of the story"): after the
 * reckoning he never rings again if she showed him the door or he left without a word; sorry, he rings as a son does.
 */
export const gaspardCall: MemeFeature = {
  id: 'gaspardCall',
  start(scene) {
    const presence = scene.ctx.grandmaPresence;
    if (!presence) return {};
    /** Seconds until he rings this visit, or null: not this visit. */
    let ringIn: number | null = null;
    return {
      arrived(arrival) {
        const end = scene.ctx.family?.gaspardEnd ?? null;
        const open = (scene.visits.hasSeen('row') || scene.visits.facts().notebookFound) && end !== 'gone' && end !== 'silent';
        // Not while he is at her table himself (one of his Sundays).
        // Not his ring while he sits at her table (or is due at it this hour).
        const family = scene.ctx.family;
        const here = family ? family.gaspardIn(scene.day()) || family.gaspardAt(scene.day(), scene.hour()) : false;
        ringIn = !arrival.first && open && !here && presence.gaspardMayRing(scene.day()) && random() < CHANCE ? arrival.helloEnds + AFTER.min + random() * (AFTER.max - AFTER.min) : null;
      },
      left() {
        ringIn = null;
      },
      update(dt) {
        if (ringIn === null || !scene.playerIn) return;
        ringIn -= dt;
        if (ringIn > 0) return;
        if (scene.talking || scene.busyWith !== null || !scene.claim(OWNER)) {
          ringIn = RETRY;
          return;
        }
        ringIn = null;
        presence.gaspardRang(scene.day());
        call(scene, scene.ctx.family?.gaspardEnd === 'apologised');
      },
    };
  },
};

/** The bell, her walk to it, her side of the call (a softer one once he has said sorry), back to her seat with a word. */
function call(scene: MemeScene, mended: boolean): void {
  const talk: { pickUp: string; side: readonly (readonly string[])[]; back: readonly string[] } = mended ? PRESENCE_TALK.gaspardMended : PRESENCE_TALK.gaspard;
  const { phone } = PRESENCE_PLAN.spots;
  const set = scene.world(phone.at[0], BELL.y, phone.at[1]);
  const ear = scene.ctx.listener.getWorldPosition(new THREE.Vector3());
  playRotaryRing(BELL.rings, BELL.level * loudness(ear.distanceTo(set), { referenceDistance: 1, maxDistance: BELL.maxDistance }), { pan: stereoPan(scene.ctx.listener, set), walls: 0 });
  const side = pick(talk.side) ?? [];
  scene.zone.after(GET_UP, () =>
    walkHer(scene, phone, () => {
      scene.meme.setPose('phone');
      scene.meme.speak(talk.pickUp);
      scene.meme.feel(mended ? { smile: 0.3 } : { frown: 0.6 }, 3);
      side.forEach((line, i) =>
        scene.zone.after((i + 1) * WORD_GAP, () => {
          scene.meme.say(line);
          scene.meme.feel(mended ? { smile: 0.25 } : { frown: 0.8, squint: 0.3 }, WORD_GAP);
        }),
      );
      scene.zone.after((side.length + 1) * WORD_GAP, () => {
        scene.meme.setPose('stand');
        scene.meme.gesture(mended ? 'touchCheek' : 'sigh');
        scene.zone.after(HANG_UP, () =>
          walkHome(scene, () => {
            const back = pick(talk.back);
            if (back) scene.meme.speak(back);
            scene.release(OWNER);
          }),
        );
      });
    }),
  );
}
