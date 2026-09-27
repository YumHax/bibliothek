import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import type { Furniture } from '../Furniture';
import { furnishShell } from '../shell';
import { placeRoomLight } from '../build/roomParts';
import { followUpgrades } from '../build/follow';
import { TravelDoor } from '../travel/TravelDoor';
import { Vendor } from '../people/Vendor';
import { homeGood } from '@/economy/homeGoods';
import { CatSettingsStore } from '../cat/catSettings';
import { ShopCounter } from './ShopCounter';
import { ForSale } from './ForSale';
import { buildPiece } from './displayPieces';
import { DisplayTable } from './DisplayTable';
import { TvWall } from './TvWall';
import { GoodsShelf } from './GoodsShelf';
import { FishTank } from './FishTank';
import { FlowerStand } from './FlowerStand';
import { SnowTicker } from './snowScreen';
import { SHOP_PLANS, type ShopFixture, type ShopPlan, type ShopZoneId } from './shopPlan';

/** The shop rooms have no window: their light holds this daylight, noon or midnight (they keep shop hours anyway). */
const INDOOR_DAYLIGHT = 0.8;
/** Where the clerk stands, counter-local: behind it. */
const CLERK_AT = new THREE.Vector3(0, 0, -0.62);

/**
 * Builds one of Front Street's shops into its zone from `SHOP_PLANS[zone.id]`: the room (no window: a steady indoor
 * light), its lamp and switch, the exit back to the street, the shop's own furniture (`fixtures`), every piece of the
 * flat it sells standing where a customer can walk up to it with its price tag (`ForSale`: a click buys it, SOLD once
 * a one-off is at home), and the counter with the clerk behind it, whose till opens the shop's list (`HomeShopPanel`).
 */
export function furnishShop(zone: Zone, ctx: BuildContext): ZoneHandle {
  const { sky, listener, panels, home: { upgrades } } = ctx;
  const plan = SHOP_PLANS[zone.id as ShopZoneId];
  if (!plan) throw new Error(`[shop] no SHOP_PLANS entry for zone ${zone.id}`);
  const room = furnishShell(zone, sky, plan.room, { fixedDaylight: INDOOR_DAYLIGHT });
  placeRoomLight(zone, room, plan.lamp.kind, plan.lamp.at, plan.lamp.switchAt);
  zone.placeAt(new TravelDoor({ style: 'glazed', label: 'Click to go back out to the street', to: 'street' }), plan.exit);

  const tables = placeFixtures(zone, plan.fixtures);

  // The counter and the clerk behind it; the till has the whole list.
  const counter = zone.placeAt(
    new ShopCounter({
      width: plan.counter.width,
      front: plan.accent,
      label: upgrades ? 'Click the till to see everything the shop has for the flat' : 'The till',
      open: (session) => {
        if (upgrades) session.openPanel(panels.homeShop.forShop(plan.shop));
        else session.refuse('The flat is furnished already.');
      },
    }),
    plan.counter.at,
  );
  zone.place(
    new Vendor({ viewer: listener, seed: plan.clerk.seed, lines: plan.clerk.lines, callOuts: plan.clerk.callOuts, label: 'Click to chat with the shopkeeper', focus: [0, 1.0, 0.8] }),
    zone.toLocal(counter.localToWorld(CLERK_AT.clone())),
    counter.rotation.y,
  );

  // What the flat can be sold, on the floor, on the walls and on the tables.
  const accent = `#${plan.accent.toString(16).padStart(6, '0')}`;
  const coat = plan.shop === 'pets' ? new CatSettingsStore().settings.coat : undefined;
  const displays: ForSale[] = [];
  for (const display of plan.displays) {
    const piece = buildPiece(display.good, display.variant, coat);
    if (!piece) continue;
    const item = new ForSale({ good: homeGood(display.good), piece, upgrades, accent, tag: display.tag, collides: display.collides });
    if ('on' in display) {
      const table = tables.get(display.on);
      if (!table) throw new Error(`[shop] ${zone.id}: no table '${display.on}' for ${display.good}`);
      const [x, z] = display.spot;
      zone.place(item, zone.toLocal(table.localToWorld(new THREE.Vector3(x, table.topHeight, z))), table.rotation.y + (display.yaw ?? 0));
    } else {
      zone.placeAt(item, display.at);
    }
    displays.push(item);
  }
  if (upgrades) followUpgrades(zone, upgrades, () => displays.forEach((item) => item.refresh()));
  return { room };
}

/** Places the shop's own furniture; returns its tables by id (the displays that stand on them need them). */
function placeFixtures(zone: Zone, fixtures: ShopPlan['fixtures']): Map<string, DisplayTable> {
  const tables = new Map<string, DisplayTable>();
  let snow = false;
  for (const fixture of fixtures) {
    const item = zone.placeAt(buildFixture(fixture), fixture.at);
    if (fixture.kind === 'table') tables.set(fixture.id, item as DisplayTable);
    if (fixture.kind === 'tvWall') snow = true;
  }
  // The TV wall's sets stay static (their parts merge); one ticker repaints the snow they share.
  if (snow) zone.place(new SnowTicker(), new THREE.Vector3());
  return tables;
}

function buildFixture(fixture: ShopFixture): Furniture {
  switch (fixture.kind) {
    case 'tvWall':
      return new TvWall(fixture.options);
    case 'goodsShelf':
      return new GoodsShelf(fixture.options);
    case 'fishTank':
      return new FishTank();
    case 'flowerStand':
      return new FlowerStand(fixture.options);
    case 'table':
      return new DisplayTable(fixture.options);
  }
}
