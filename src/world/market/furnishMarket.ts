import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../layout';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { furnishShell } from '../shell';
import { TiledWainscot } from '../props/TiledWainscot';
import { IndustrialPendant } from '../props/IndustrialPendant';
import { placeDecor } from '../props/decor';
import { TravelDoor } from '../travel/TravelDoor';
import { ForSaleBox } from './ForSaleBox';
import { Vendor } from '../people/Vendor';
import { Shopper } from '../people/Shopper';
import { HallRoof } from './HallRoof';
import { MarketStall } from './MarketStall';
import { OrderCounter } from './OrderCounter';
import { MARKET_PLAN } from './marketPlan';

/**
 * Builds the flea market into its zone from `MARKET_PLAN`: the hall (brick wainscot, trussed roof
 * with its roof light following the sky, a row of pendants chained to the room's light), one stall
 * per platform, the mail-order counter, the exit door, the decor; then, once the day's stock
 * arrives, a `ForSaleBox` per copy on the matching stall. A bought box leaves the stall on the
 * spot; the stock itself forgets nothing (it filters out what the collection owns).
 */
export function furnishMarket(zone: Zone, { sky, covers, market, games, listener }: BuildContext): ZoneHandle {
  const plan = MARKET_PLAN;
  const room = furnishShell(zone, sky, plan.room);
  // Wainscot and roof wrap the whole shell, so they stand at the room's origin like the Room does.
  zone.place(new TiledWainscot(plan.room, plan.wainscot), new THREE.Vector3());
  const roof = zone.place(new HallRoof(plan.room, plan.roof), new THREE.Vector3());
  zone.onUnload(sky.dayNight.onChange((state) => roof.setDaylight(state.daylight, state.ambient)));
  // The pendants are the hall's visible light: clicking any of them switches them all, and the room's lamp with them.
  const pendants: IndustrialPendant[] = [];
  const switchAll = (on: boolean): void => {
    room.setLampOn(on);
    for (const pendant of pendants) if (pendant.isOn !== on) pendant.setOn(on);
  };
  for (const at of plan.pendants) pendants.push(zone.placeAt(new IndustrialPendant({ ...plan.pendant, onSwitch: switchAll }), at));
  zone.placeAt(new OrderCounter(), plan.counter);
  zone.placeAt(new TravelDoor({ style: 'glazed', label: 'Click to leave the market' }), plan.exit);
  placeDecor(zone, plan.decor);

  const stalls = PLATFORM_LIST.map((platform, i) => {
    const spot = plan.stalls[i % plan.stalls.length]!;
    return { platform, stall: zone.placeAt(new MarketStall({ sign: platform.name, cloth: spot.cloth, accent: platform.accentColor, seed: i + 1 }), spot.at) };
  });

  // The people: a stallholder behind each table (placed in the stall's frame, so they face the
  // aisle with it), and shoppers set down along the aisle, each starting at their own spot.
  const { crowd } = plan;
  stalls.forEach(({ stall }, i) => {
    const behind = stall.localToWorld(new THREE.Vector3(crowd.vendorAt[0], 0, crowd.vendorAt[1]));
    zone.place(new Vendor({ viewer: listener, lines: crowd.lines, seed: i + 1 }), zone.toLocal(behind), stall.rotation.y);
  });
  for (let i = 0; i < crowd.shoppers; i++) {
    const x = THREE.MathUtils.lerp(crowd.aisle.x[0], crowd.aisle.x[1], (i + 0.5) / crowd.shoppers);
    zone.place(new Shopper({ viewer: listener, spots: crowd.browseSpots, aisle: crowd.aisle, seed: i + 1, speed: 0.65 + i * 0.08 }), new THREE.Vector3(x, 0, crowd.aisle.z), i % 2 ? Math.PI / 2 : -Math.PI / 2);
  }

  // The stock is fetched (the index, once per platform) after the hall stands; a zone unloaded
  // meanwhile must not get boxes placed into it.
  let live = true;
  zone.onUnload(() => {
    live = false;
  });
  const displayed = new Set<ForSaleBox>();
  const takeOff = (box: ForSaleBox): void => {
    displayed.delete(box);
    zone.remove(box);
    box.dispose();
  };
  void market.todays().then((items) => {
    if (!live) return;
    for (const { platform, stall } of stalls) {
      const boxes = items.filter((item) => item.game.platform === platform.id).map((item) => new ForSaleBox(item, covers));
      const anchors = stall.anchors(boxes.map((b) => b.width));
      boxes.forEach((box, i) => {
        const anchor = anchors[i];
        if (!anchor) {
          box.dispose();
          return;
        }
        zone.place(box, zone.toLocal(stall.localToWorld(anchor.clone())), stall.rotation.y);
        box.onSold = () => takeOff(box);
        displayed.add(box);
      });
    }
  }).catch((err) => console.warn('[market] no stock today', err));
  // A copy ordered from the catalogue (or imported) while its twin sits on a stall: the stall copy goes too.
  zone.onUnload(games.subscribe(() => {
    const owned = new Set(games.games.map((g) => g.id));
    for (const box of [...displayed]) if (owned.has(box.item.game.id)) takeOff(box);
  }));

  return { room };
}
