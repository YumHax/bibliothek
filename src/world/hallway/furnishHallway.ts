import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { floorPointsToWorld, placeWith } from '../zone/attach';
import { furnishShell } from '../shell';
import { furnishDecor, placeRoomLight } from '../build/roomParts';
import { pointSound } from '../build/hearing';
import { showWhenUpgraded } from '../build/follow';
import { HallConsole } from '../props/HallConsole';
import { CoatRack } from '../props/CoatRack';
import { FrontDoor } from './FrontDoor';
import { Wreath } from '../props/Wreath';
import { currentFestivities } from '../props/outdoors/season';
import { Parcel } from '../props/Parcel';
import { HouseKeys } from '../props/HouseKeys';
import { Doormat, DOORMAT_THICKNESS } from '../props/Doormat';
import { MailDrop } from '../props/MailDrop';
import { Rug } from '../props/Rug';
import { KilimRug } from '../props/KilimRug';
import { Poster } from '../props/Poster';
import { shopPoster } from '../props/shopPoster';
import { Homecoming } from './Homecoming';
import { mailFor } from './mail';
import { StairwellSounds } from '@/audio/flatSounds';
import { HALLWAY_PLAN } from './hallwayPlan';
import { Notebook } from '../props/Notebook';
import { StickyNote, ToDoNote } from '@/onboarding';
import { ToDoNotePanel } from '@/ui/ToDoNotePanel';

/**
 * Builds the flat's hallway into its zone from `HALLWAY_PLAN`: the corridor shell with its doors
 * (bathroom, bedroom, kitchen), the flush light, the console (keys in its bowl, a mirror above) and
 * the coat corner by the entrance, the entrance itself (a `FrontDoor` onto the landing and the
 * stairs: it opens only with the keys in the pocket), the coir mat inside it where the mail lands on the
 * way home, the parcel under the console (there while bought games wait in it), the runner (or the
 * kilim, once bought) and the shop poster (once bought), then the decor.
 */
export function furnishHallway(zone: Zone, ctx: BuildContext): ZoneHandle {
  const { sky, listener, building, collection: { deliveries }, market: { stock: market }, arcade: { daily: arcadeDaily }, home: { upgrades } } = ctx;
  const plan = HALLWAY_PLAN;
  const room = furnishShell(zone, sky, plan.room, { leafColor: plan.leafColor });
  placeRoomLight(zone, room, 'flush', plan.light, plan.lightSwitch);
  const hallConsole = zone.placeAt(new HallConsole({ width: 0.8 }), plan.console);
  zone.placeAt(new CoatRack({ shoeRack: false }), plan.coatRack);
  if (deliveries) zone.placeAt(new Parcel(deliveries), plan.parcel);

  // Going out takes the keys from the bowl; coming home (set down on the arrival spot) drops them
  // back in it, and some days a flyer or two waits on the mat (at most one delivery per in-game day).
  const keys = placeWith(zone, hallConsole, new HouseKeys(), hallConsole.bowl);
  const doormat = zone.placeAt(new Doormat({ width: plan.doormat.width, depth: plan.doormat.depth }), plan.doormat.at);
  const mail = placeWith(zone, doormat, new MailDrop(), new THREE.Vector3(0, DOORMAT_THICKNESS, 0));
  let lastMailDay = -1;
  // Notes slipped under the door (a neighbour's swap, the postman's card) land on the mat too.
  if (building) zone.onUnload(building.doorstep.onNote((piece) => mail.deliver([piece])));
  const [ax, az] = plan.arrival.at;
  const entrance = plan.room.doorways!.find((d) => d.wall === 'right')!;
  const homecoming = zone.place(
    new Homecoming({
      listener,
      arrival: zone.toWorld(new THREE.Vector3(ax, 0, az)),
      door: zone.toWorld(new THREE.Vector3(plan.room.width / 2, 0, entrance.along)),
      onHome: (session) => {
        keys.setInPocket(false);
        if (market.day !== lastMailDay) {
          lastMailDay = market.day;
          mail.deliver(mailFor(market.day, { arcadeDaily, market }));
        }
        // A mail order whose round came while the player was out: the concierge took it in.
        const posted = building?.post?.deliver().length ?? 0;
        const parcel = posted ? `; the concierge took in a parcel for you (under the console)` : '';
        session.hint(mail.count ? `Home: keys back in the bowl, and there is mail on the mat${parcel}` : `Home: keys back in the bowl${parcel}`);
      },
    }),
    new THREE.Vector3(),
  );
  // The front door: out onto the landing only with the keys; it closes itself behind the player.
  const frontDoor = zone.placeAt(
    new FrontDoor(entrance, {
      collisions: zone.collisions,
      leafColor: plan.frontDoorColor,
      viewer: listener,
      guard: () => (keys.inPocket ? null : { label: 'The front door (you need your keys)', hint: 'Your keys are still in the bowl on the console' }),
      onOpen: (session) => homecoming.wentOut(session),
    }),
    plan.entrance,
  );
  // Whoever rings from the landing (the postman; the visitors chained behind: `Doorstep.also`).
  if (building) frontDoor.visitors = building.doorstep;
  zone.addPortal({ to: 'stairwell', bounds: entrancePortal(zone, plan.room.width / 2, entrance.along, entrance.width, entrance.height), door: frontDoor });
  // At Christmas, a wreath on its landing side, for the neighbours.
  if (currentFestivities().includes('christmas')) frontDoor.attachToLeaf(new Wreath(), plan.wreath.along, plan.wreath.y, true);

  // The journal on the console; on the first day, the to-do list by the letters and "KEYS!" on the front door.
  const notes = ctx.home;
  const onConsole = (item: Notebook | ToDoNote, spot: { at: [number, number, number]; yaw: number }): void => {
    item.rotation.y = spot.yaw;
    placeWith(zone, hallConsole, item, new THREE.Vector3(...spot.at));
  };
  onConsole(new Notebook({ panel: () => notes.journalPanel }), plan.journal);
  if (notes.firstDay) {
    const panel = new ToDoNotePanel(ctx.cssLayer.renderer.domElement.parentElement ?? document.body, notes.firstDay);
    zone.onUnload(() => panel.close());
    onConsole(new ToDoNote(notes.firstDay, panel), plan.toDoNote);
    const sticky = new StickyNote(plan.keysNote.lines, notes.firstDay, 'out');
    frontDoor.attachToLeaf(sticky, plan.keysNote.along, plan.keysNote.y);
    zone.onUnload(() => sticky.dispose());
  }

  // The runner, or the kilim on the same spot once it is bought; the shop poster once bought.
  const runner = zone.placeAt(new Rug(plan.runner.options), plan.runner.at);
  if (upgrades) {
    const { rug, poster: posterSlot } = plan.homeGoods;
    const kilim = zone.placeAt(new KilimRug(rug.options), rug.at);
    const poster = zone.placeAt(new Poster(posterSlot.width, posterSlot.height, shopPoster()), posterSlot.at);
    showWhenUpgraded(zone, upgrades, 'rug', kilim, runner);
    showWhenUpgraded(zone, upgrades, 'poster', poster);
  }

  furnishDecor(zone, ctx, plan.decor);
  // The building beyond the front door: the stairs, the lift, the neighbours' doors, now and then.
  const [sx, sy, sz] = plan.stairwell;
  zone.place(pointSound(ctx, new StairwellSounds(), { referenceDistance: 1.5, maxDistance: 9 }), new THREE.Vector3(sx, sy, sz));
  return { room, catVisits: floorPointsToWorld(zone, plan.catVisits) };
}

/** World-space box of the front door's opening through the right wall (x = `x`, local). */
function entrancePortal(zone: Zone, x: number, along: number, width: number, height: number): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(x - 0.15, 0, along - width / 2), new THREE.Vector3(x + 0.15, height, along + width / 2)).applyMatrix4(zone.group.matrixWorld);
}
