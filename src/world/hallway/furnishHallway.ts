import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../layout';
import { floorPointsToWorld, placeWith } from '../zone/attach';
import { furnishShell } from '../shell';
import { FlushLamp } from '../props/FlushLamp';
import { WallSwitch } from '../props/WallSwitch';
import { HallConsole } from '../props/HallConsole';
import { CoatRack } from '../props/CoatRack';
import { TravelDoor } from '../travel/TravelDoor';
import { Parcel } from '../props/Parcel';
import { HouseKeys } from '../props/HouseKeys';
import { Doormat, DOORMAT_THICKNESS } from '../props/Doormat';
import { MailDrop } from '../props/MailDrop';
import { Rug } from '../props/Rug';
import { KilimRug } from '../props/KilimRug';
import { Poster } from '../props/Poster';
import { shopPoster } from '../props/shopPoster';
import { placeDecor } from '../props/decor';
import { Homecoming } from './Homecoming';
import { mailFor } from './mail';
import { PointSound } from '../acoustics/PointSound';
import { tickRadiators } from '../acoustics/radiatorTicks';
import { StairwellSounds } from '@/audio/flatSounds';
import { HALLWAY_PLAN } from './hallwayPlan';

/**
 * Builds the flat's hallway into its zone from `HALLWAY_PLAN`: the corridor shell with its doors
 * (bathroom, bedroom, kitchen), the flush light, the console (keys in its bowl, a mirror above) and
 * the coat corner by the entrance, the entrance itself (a `TravelDoor`: with the keys in the pocket,
 * clicking it offers the arcade and the market), the coir mat inside it where the mail lands on the
 * way home, the parcel under the console (there while bought games wait in it), the runner (or the
 * kilim, once bought) and the shop poster (once bought), then the decor.
 */
export function furnishHallway(zone: Zone, { sky, deliveries, listener, acoustics, market, arcadeDaily, upgrades }: BuildContext): ZoneHandle {
  const plan = HALLWAY_PLAN;
  const room = furnishShell(zone, sky, plan.room, { leafColor: plan.leafColor });
  const light = zone.placeAt(new FlushLamp({ onSwitch: (on) => room.setLampOn(on) }), plan.light);
  zone.placeAt(new WallSwitch({ lamp: light }), plan.lightSwitch);
  const hallConsole = zone.placeAt(new HallConsole({ width: 0.8 }), plan.console);
  zone.placeAt(new CoatRack({ shoeRack: false }), plan.coatRack);
  if (deliveries) zone.placeAt(new Parcel(deliveries), plan.parcel);

  // Going out takes the keys from the bowl; coming home (set down on the arrival spot) drops them
  // back in it, and some days a flyer or two waits on the mat (at most one delivery per in-game day).
  const keys = placeWith(zone, hallConsole, new HouseKeys(), hallConsole.bowl);
  const doormat = zone.placeAt(new Doormat({ width: plan.doormat.width, depth: plan.doormat.depth }), plan.doormat.at);
  const mail = placeWith(zone, doormat, new MailDrop(), new THREE.Vector3(0, DOORMAT_THICKNESS, 0));
  let lastMailDay = -1;
  const [ax, az] = plan.arrival.at;
  const homecoming = zone.place(
    new Homecoming({
      listener,
      arrival: zone.toWorld(new THREE.Vector3(ax, 0, az)),
      onHome: (session) => {
        keys.setInPocket(false);
        if (market.day !== lastMailDay) {
          lastMailDay = market.day;
          mail.deliver(mailFor(market.day, { arcadeDaily, market }));
        }
        session.hint(mail.count ? 'Home: keys back in the bowl, and there is mail on the mat' : 'Home: keys back in the bowl');
      },
    }),
    new THREE.Vector3(),
  );
  zone.placeAt(
    new TravelDoor({
      style: 'entrance',
      mat: false,
      label: 'Click to go out',
      to: 'street',
      guard: () => (keys.inPocket ? null : { label: 'Click to go out (you need your keys)', hint: 'Your keys are still in the bowl on the console' }),
      onGo: (session) => homecoming.wentOut(session),
    }),
    plan.entrance,
  );

  // The runner, or the kilim on the same spot once it is bought; the shop poster once bought.
  const runner = zone.placeAt(new Rug(plan.runner.options), plan.runner.at);
  if (upgrades) {
    const { rug, poster: posterSlot } = plan.homeGoods;
    const kilim = zone.placeAt(new KilimRug(rug.options), rug.at);
    const poster = zone.placeAt(new Poster(posterSlot.width, posterSlot.height, shopPoster()), posterSlot.at);
    const refresh = (): void => {
      const hasKilim = upgrades.count('rug') > 0;
      kilim.visible = hasKilim;
      runner.visible = !hasKilim;
      poster.visible = upgrades.count('poster') > 0;
    };
    refresh();
    zone.onUnload(upgrades.subscribe(refresh));
  }

  tickRadiators(zone, placeDecor(zone, plan.decor), { listener, occlusion: acoustics });
  // The building beyond the front door: the stairs, the lift, the neighbours' doors, now and then.
  const [sx, sy, sz] = plan.stairwell;
  zone.place(new PointSound(new StairwellSounds(), { listener, occlusion: acoustics, volume: { referenceDistance: 1.5, maxDistance: 9 } }), new THREE.Vector3(sx, sy, sz));
  return { room, catVisits: floorPointsToWorld(zone, plan.catVisits) };
}
