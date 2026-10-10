import * as THREE from 'three';
import type { MemoryReel } from '@/memories/memoryReel';
import { RIVAL_COLLECTOR } from '@/economy/rivalCollector';
import { Walker } from '../people/Walker';
import type { GestureName } from '../people/motion/gestures';
import { randomLook } from '../people/looks';
import { Crate } from '../props/Crate';
import { gaspardLook, memeLook } from './familyLooks';
import { SALE_MEMORY_PLAN as PLAN } from './saleMemoryPlan';
import { GRANDMA_FLAT_PLAN } from './grandmaFlatPlan';
import { presentPeople } from './presentPeople';
import type { Present } from './albumWiring';

/**
 * LOT 1 TO 412 (`MEMORIES` sale, docs/story.md "Mémé"): the sale of Félix's games as Mémé saw it from the back row,
 * Gaspard beside her checking his watch, the auctioneer calling lot after lot and Victor Crane in the front row
 * raising his paddle for every one: it was arranged between them. Filmed in the saleroom as it stands, today's
 * bidders and auctioneer kept out of the picture; Félix's boxes by the rostrum. Back at Mémé's after.
 */
export function saleReel(present: Present): MemoryReel {
  const [bx, bz] = GRANDMA_FLAT_PLAN.christmas.after.at;
  const { x: mx, z: mz } = present.meme.position;

  let fired = new Set<string>();
  let cast: { auctioneer: Walker; victor: Walker; meme: Walker; gaspard: Walker; bidders: Walker[] } | null = null;
  let today: ReturnType<typeof presentPeople> | null = null;
  const once = (t: number, at: number, key: string, run: () => void): void => {
    if (t < at || fired.has(key)) return;
    fired.add(key);
    run();
  };
  const gesture = (who: Walker | undefined, name: GestureName) => who?.gesture(name);

  return {
    id: 'sale',
    title: 'Lot 1 to 412',
    tagline: 'From Mémé’s album.',
    back: 'Back to Mémé',
    lines: PLAN.lines,
    score: 'minor',
    scenes: [
      {
        zone: 'saleroom',
        shots: PLAN.shots,
        stage: (set) => {
          fired = new Set();
          today = presentPeople(set.zone);
          const rostrum = set.world(...PLAN.rostrum);
          const at = ([x, z]: readonly [number, number]) => new THREE.Vector3(x, 0, z);
          /** Someone on a chair, eyes on the rostrum. */
          const seated = (walker: Walker, spot: readonly [number, number], pose: 'lap' | 'crossed' = 'lap'): Walker => {
            const person = set.place(walker, at(spot), Math.PI);
            person.sit(Math.PI, PLAN.seatHeight, pose, rostrum);
            return person;
          };
          for (const crate of PLAN.crates) set.placeAt(new Crate({ style: 'cardboard', stack: crate.stack, seed: crate.seed, label: PLAN.crateLabel }), crate.at);
          const a = PLAN.auctioneer;
          const auctioneer = set.place(new Walker({ viewer: set.viewer, seed: a.seed }), at(a.at), a.yaw);
          auctioneer.stand(a.yaw, 'lead', set.world(0, 1.2, 0.4));
          // The same man as on Front Street and in the saleroom today: his seed draws his look.
          const victor = seated(new Walker({ viewer: set.viewer, seed: RIVAL_COLLECTOR.seed }), PLAN.victor.at);
          victor.hold('paddle');
          const meme = seated(new Walker({ viewer: set.viewer, seed: 1931, look: memeLook() }), PLAN.meme.at);
          const gaspard = seated(new Walker({ viewer: set.viewer, seed: 1958, look: gaspardLook() }), PLAN.gaspard.at, 'crossed');
          const bidders = PLAN.bidders.map((b) => {
            const bidder = seated(new Walker({ viewer: set.viewer, seed: b.seed, look: randomLook(b.seed, 'shopper', { season: 'autumn' }) }), b.at);
            bidder.hold('paddle');
            return bidder;
          });
          cast = { auctioneer, victor, meme, gaspard, bidders };
        },
        beat: (t) => {
          today?.hold();
          const { auctioneer, victor, meme, gaspard, bidders } = cast ?? {};
          PLAN.callsAt.forEach((at, i) => once(t, at, `call${i}`, () => gesture(auctioneer, 'point')));
          PLAN.victorBidsAt.forEach((at, i) => once(t, at, `bid${i}`, () => gesture(victor, 'wave')));
          PLAN.giveUpAt.forEach((at, i) => once(t, at, `giveUp${i}`, () => gesture(bidders?.[i], 'headShake')));
          once(t, PLAN.gaspardWatchAt, 'watch', () => gesture(gaspard, 'checkWatch'));
          once(t, PLAN.memeGlassesAt, 'glasses', () => gesture(meme, 'adjustGlasses'));
          once(t, PLAN.gaspardRubAt, 'rub', () => gesture(gaspard, 'rubHands'));
          once(t, PLAN.memeSighAt, 'sigh', () => gesture(meme, 'sigh'));
          once(t, PLAN.soldAt, 'sold', () => {
            gesture(auctioneer, 'point');
            bidders?.forEach((bidder) => gesture(bidder, 'clap'));
          });
          once(t, PLAN.victorNodAt, 'nod', () => victor?.nod());
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
      present.reseat();
      present.meme.speak(present.afterLine);
    },
  };
}
