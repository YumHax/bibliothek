import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { furnishShell } from '../shell';
import { furnishDecor, placeRoomLight } from '../build/roomParts';
import { pointSound } from '../build/hearing';
import { followDaylight } from '../build/follow';
import { TiledWainscot } from '../props/TiledWainscot';
import { Bathtub } from '../props/Bathtub';
import { FrostedWindow } from '../props/FrostedWindow';
import { Washbasin } from '../props/Washbasin';
import { Toilet } from '../props/Toilet';
import { TowelRail } from '../props/TowelRail';
import { LaundryBasket } from '../props/LaundryBasket';
import { MirrorCabinet } from '../props/MirrorCabinet';
import { placeWith, placeLeaves, floorPointsToWorld } from '../zone/attach';
import { RunningWater, ToiletFlush, FLUSH_SECONDS } from '@/audio/water';
import type { CatPerch } from '../cat/spots';
import { BATHROOM_PLAN } from './bathroomPlan';

/**
 * Builds the bathroom into its zone from `BATHROOM_PLAN`: shell with its door (opening out into
 * the corridor), ceiling light, the tiled wainscot, the tub under its frosted window (glowing with
 * the shared sky), the basin and the WC facing each other, the mirror cabinet over the basin, the
 * towels by the door, the laundry basket, then the bath mat, the plant and the towel on the tub.
 * The water works: each fitting's click drives its own `PointSound` (the basin's tap, which also
 * drips when shut; the tub's tap and drain; the flush).
 */
export function furnishBathroom(zone: Zone, ctx: BuildContext): ZoneHandle {
  const { sky } = ctx;
  const plan = BATHROOM_PLAN;
  const room = furnishShell(zone, sky, plan.room, { leafColor: plan.leafColor });
  placeRoomLight(zone, room, 'flush', plan.light, plan.lightSwitch);
  // The wainscot wraps the whole shell, so it stands at the room's origin like the Room does.
  zone.place(new TiledWainscot(plan.room, plan.wainscot), new THREE.Vector3());

  const tubWater = new RunningWater({ peak: 0.6 });
  const tub = zone.placeAt(
    new Bathtub({
      tapEnd: 'left',
      ...plan.bathtubSize,
      onWater: ({ running, draining, depth }) => {
        tubWater.setRunning(running);
        tubWater.setDraining(draining);
        tubWater.setDepth(depth);
      },
    }),
    plan.bathtub,
  );
  placeWith(zone, tub, tub.plugSpot);
  placeWith(zone, tub, pointSound(ctx, tubWater, { maxDistance: 6 }), tub.tapPoint);
  followDaylight(zone, sky, zone.placeAt(new FrostedWindow(), plan.window));

  // The basin's tap runs on a click, and never quite shuts: a drop every few seconds.
  const tap = new RunningWater({ drips: true, peak: 0.4 });
  const basin = zone.placeAt(new Washbasin({ shelfSide: 'right', mirror: false, onTap: (running) => tap.setRunning(running) }), plan.washbasin);
  placeWith(zone, basin, pointSound(ctx, tap, { maxDistance: 5 }), new THREE.Vector3(0, 0.82, 0.2));
  placeLeaves(zone, zone.placeAt(new MirrorCabinet(plan.mirrorCabinetOptions), plan.mirrorCabinet));

  const flush = new ToiletFlush();
  const toilet = zone.placeAt(new Toilet({ flushSeconds: FLUSH_SECONDS, onFlush: () => flush.flush() }), plan.toilet);
  placeWith(zone, toilet, toilet.lidSpot);
  placeWith(zone, toilet, pointSound(ctx, flush, { maxDistance: 6 }), new THREE.Vector3(0, 0.6, 0.2));
  zone.placeAt(new TowelRail(), plan.towelRail);
  zone.placeAt(new LaundryBasket(), plan.laundryBasket);
  furnishDecor(zone, ctx, plan.decor);

  // Where the cat naps in here: the dry tub (over its rim), or curled in the basin; never while water runs.
  const inTub: CatPerch = {
    restingSpot: (out) => tub.restingSpot(out),
    approachPoint: (out) => tub.approachPoint(out),
    hopApex: tub.rimHeight,
    available: () => tub.isEmpty,
    catWeight: (night) => (night ? 0.4 : 0.9),
  };
  const inBasin: CatPerch = {
    restingSpot: (out) => basin.restingSpot(out),
    approachPoint: (out) => basin.approachPoint(out),
    available: () => !basin.isRunning,
    catWeight: (night) => (night ? 0.2 : 0.6),
  };
  return { room, catVisits: floorPointsToWorld(zone, plan.catVisits), catPerches: [inTub, inBasin] };
}
