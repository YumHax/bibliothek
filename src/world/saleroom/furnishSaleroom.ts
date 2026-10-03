import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { SALEROOM_BIDDERS } from '@/economy/auction';
import { RIVAL_COLLECTOR } from '@/economy/rivalCollector';
import { furnishShell } from '../shell';
import { furnishDecor, placeRoomLight } from '../build/roomParts';
import { TravelDoor } from '../travel/TravelDoor';
import { Walker } from '../people/Walker';
import { Rostrum } from './Rostrum';
import { LotStand } from './LotStand';
import { SaleBoard } from './SaleBoard';
import { SaleChair } from './SaleChair';
import { Saleroom } from './Saleroom';
import { SALEROOM_PLAN } from './saleroomPlan';

/** The saleroom has no window: it never darkens with the night (its pendant lights it). */
const DAYLIGHT = 0.8;
/** The auctioneer's look. */
const AUCTIONEER_SEED = 461;

/**
 * Builds the saleroom behind the flea market from `SALEROOM_PLAN`: the green room and its pendant, the door back to
 * the hall, the rostrum with the auctioneer behind it, the lot stand, the sale board, the rows of chairs with the
 * room's bidders in their seats (the rival in the front row), the decor, and the `Saleroom` that runs the sale.
 * Without the lot services (`ctx.market.lots`) it is an empty room with its door.
 */
export function furnishSaleroom(zone: Zone, ctx: BuildContext): ZoneHandle {
  const { sky, listener, covers, collection, money, today } = ctx;
  const plan = SALEROOM_PLAN;
  const room = furnishShell(zone, sky, plan.room, { fixedDaylight: DAYLIGHT });
  placeRoomLight(zone, room, 'pendant', plan.light, plan.lightSwitch);
  zone.placeAt(new TravelDoor({ style: 'panelled', leafColor: 0x4a2a1a, ...plan.door, label: 'The flea market · go back', to: 'market' }), plan.exit);
  furnishDecor(zone, ctx, plan.decor);

  const chairs = plan.chairs.map((at) => zone.placeAt(new SaleChair(), at));
  const lots = ctx.market.lots;
  if (!lots) return { room };

  // The rostrum and the stand: a click on either bids on the lot being called.
  let sale: Saleroom | null = null;
  const bid = (session: Parameters<Saleroom['bid']>[0]) => sale?.bid(session);
  const caption = () => sale?.caption() ?? null;
  const rostrum = zone.placeAt(new Rostrum({ label: caption, onActivate: bid }), plan.rostrum);
  const stand = zone.placeAt(new LotStand({ covers, label: caption, onActivate: bid }), plan.lotStand);
  const board = zone.placeAt(new SaleBoard(), plan.board);

  const focus = zone.toWorld(new THREE.Vector3(0, 1.5, rostrum.position.z));
  const [ax, az] = plan.auctioneerAt;
  const auctioneer = zone.place(new Walker({
    viewer: listener,
    seed: AUCTIONEER_SEED,
    speaker: 'The auctioneer',
    label: 'The auctioneer · chat',
    lines: ['Bid with a click on the rostrum, or on the stand. I see every paddle in this room.', 'Silence is golden, and silence sells: three calls and down comes the hammer.', 'Sale every week. The lots are on the board days ahead.'],
  }), new THREE.Vector3(ax, 0, az));
  auctioneer.stand(0, 'lead', 'viewer');

  // The regulars, each on their chair, eyes on the rostrum; the rival talks of how things stand.
  const bidders = new Map<string, Walker>();
  for (const bidder of SALEROOM_BIDDERS) {
    const chair = chairs[plan.seats[bidder.id] ?? -1];
    if (!chair) continue;
    chair.taken = true;
    const rival = bidder.id === 'victor';
    const body = zone.place(new Walker({
      viewer: listener,
      seed: bidder.seed,
      speaker: rival ? RIVAL_COLLECTOR.short : bidder.name,
      label: rival ? `${RIVAL_COLLECTOR.label} · chat` : `${bidder.name} · chat`,
      ...(rival ? { talk: () => { lots.rival.meet(); return lots.rival.greeting(); } } : { lines: bidder.lines }),
    }), chair.position.clone());
    body.traverse((o) => {
      o.castShadow = false;
    });
    body.sit(chair.rotation.y, plan.seatHeight, 'lap', focus);
    bidders.set(bidder.id, body);
  }

  sale = zone.place(new Saleroom({
    lots,
    dayNight: sky.dayNight,
    day: () => today.gameDay,
    wallet: money.wallet,
    owns: (id) => collection.owns(id),
    rostrum,
    stand,
    board,
    auctioneer,
    bidders,
  }), new THREE.Vector3());
  return { room };
}
