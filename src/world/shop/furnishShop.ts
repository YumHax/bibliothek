import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import type { Furniture } from '../Furniture';
import { furnishShell } from '../shell';
import { placeClock, placeRoomLight } from '../build/roomParts';
import { followUpgrades } from '../build/follow';
import { TravelDoor } from '../travel/TravelDoor';
import { pointSound, type Hearing } from '../build/hearing';
import { homeGood } from '@/economy/homeGoods';
import type { AmbientVoice } from '@/audio/ambient';
import type { FootSurface } from '@/audio/footSurface';
import { CatSettingsStore } from '../cat/catSettings';
import { SHOP_LOOKS } from '../city/shopLooks';
import { Rug } from '../props/Rug';
import { Radio } from '../kitchen/Radio';
import { Birdcage } from './Birdcage';
import { shopDoorOf, streetOf } from './shopOutlook';
import { ShopCounter } from './ShopCounter';
import { ForSale } from './ForSale';
import { buildPiece } from './displayPieces';
import { DisplayTable } from './DisplayTable';
import { TvWall } from './TvWall';
import { GoodsShelf } from './GoodsShelf';
import { FishTank } from './FishTank';
import { FlowerStand } from './FlowerStand';
import { SnowTicker } from './snowScreen';
import { RugRolls } from './RugRolls';
import { DeliveryTrolley } from './DeliveryTrolley';
import { ShopWindow } from './ShopWindow';
import { ShopClerk } from './ShopClerk';
import { ShopCustomer } from './ShopCustomer';
import { PetShopNoises, ShopRadio, ShopRoomTone, SnowHiss, TankBubbler, playTill } from './shopSounds';
import { SHOP_DOOR, SHOP_PLANS, type ShopFixture, type ShopPlan, type ShopSound, type ShopZoneId } from './shopPlan';
import { surfaceOfRoom } from '@/audio/footSurface';

/**
 * The shop's daylight: the sky's through its one window, never darker than this (the back of a shop is lit by its
 * own lamp and the street's glow), nor as bright as out in the open.
 */
const DAYLIGHT = { min: 0.3, max: 0.85 };
/** Where the clerk stands, counter-local: behind it. */
const CLERK_AT = new THREE.Vector3(0, 0, -0.62);
/** The counter's top, where a radio on it stands (`ShopCounter`). */
const COUNTER_TOP = 0.95;

/**
 * Builds one of Front Street's shops into its zone from `SHOP_PLANS[zone.id]`: the room (its daylight the sky's
 * through the front window, `ShopWindow`), its lamp and switch, the exit back to the street (a shopfront door as big as
 * the street's), the shop's own furniture (`fixtures`) and sounds, every piece of the flat it sells standing where a
 * customer can walk up to it with its price tag (`ForSale`: a first click arms it, the second buys it, SOLD once a
 * one-off is at home), the counter with the clerk behind it (`ShopClerk`: off on a chore now and then, a thanks and
 * the till after a sale), whose till opens the shop's list (`HomeShopPanel`), and another customer now and then.
 */
export function furnishShop(zone: Zone, ctx: BuildContext): ZoneHandle {
  const { sky, listener, panels, home: { upgrades } } = ctx;
  const plan = SHOP_PLANS[zone.id as ShopZoneId];
  if (!plan) throw new Error(`[shop] no SHOP_PLANS entry for zone ${zone.id}`);
  const room = furnishShell(zone, sky, plan.room, { fixedDaylight: DAYLIGHT.min });
  placeRoomLight(zone, room, plan.lamp.kind, plan.lamp.at, plan.lamp.switchAt);
  // The door onto the street it is on (TV REPAIR is round the corner on Park Street), and the shop's name and colours there.
  const door = shopDoorOf(zone.id as ShopZoneId);
  zone.placeAt(new TravelDoor({ style: 'glazed', shopfront: true, width: SHOP_DOOR.width, height: SHOP_DOOR.height, label: `${streetOf(door)} · go out`, to: 'street' }), plan.exit);
  const look = SHOP_LOOKS[plan.shop as keyof typeof SHOP_LOOKS];
  const name = door?.shop.name ?? look.name;

  // The front window: what its door looks out on behind the glass, and the daylight through it.
  const accent = `#${plan.accent.toString(16).padStart(6, '0')}`;
  const { along, width, height } = plan.window;
  const window = zone.placeAt(
    new ShopWindow({ width, height, name, letters: look.letters, door, along, front: plan.room.depth / 2, zoneFrame: zone.group, dayNight: sky.dayNight, outdoors: sky.outdoors, viewer: listener as THREE.Camera }),
    { wall: 'front', along, y: 0 },
  );
  zone.onUnload(
    sky.dayNight.onChange((state) => {
      window.setSky(state);
      room.setDaylight(DAYLIGHT.min + (DAYLIGHT.max - DAYLIGHT.min) * state.daylight, state.ambient);
    }),
  );
  // The room tone by the window: the building's hum, the street muffled behind the glass.
  zone.place(pointSound(ctx, new ShopRoomTone(), { referenceDistance: 2.5, rolloff: 0.6, maxDistance: 14 }), zone.toLocal(window.localToWorld(new THREE.Vector3(0, 1.4, 0.2))));
  for (const sound of plan.sounds ?? []) zone.place(pointSound(ctx, soundOf(sound)), new THREE.Vector3(...sound.at));

  const tables = placeFixtures(zone, plan.fixtures, ctx);

  // The counter and the clerk behind it; the till has the whole list.
  const counter = zone.placeAt(
    new ShopCounter({
      width: plan.counter.width,
      front: plan.accent,
      label: upgrades ? 'The till · see everything for the flat' : 'The till',
      open: (session) => {
        if (upgrades) session.openPanel(panels.homeShop.forShop(plan.shop));
        else session.refuse('The flat is furnished already.');
      },
    }),
    plan.counter.at,
  );
  const home = zone.toLocal(counter.localToWorld(CLERK_AT.clone()));
  const { seed, lines, callOuts, thanks, chores } = plan.clerk;
  const clerk = zone.place(new ShopClerk({ viewer: listener, seed, lines, callOuts, thanks, chores, home: { at: home.clone(), yaw: counter.rotation.y }, label: 'The shopkeeper · chat' }), home, counter.rotation.y);
  const sold = (): void => {
    clerk.thank();
    playTill();
  };
  // The radios, on their table or on the counter, once both are there.
  placeRadios(zone, plan.fixtures, ctx, (on) => (on === 'counter' ? { host: counter, top: COUNTER_TOP } : tables.get(on) ? { host: tables.get(on)!, top: tables.get(on)!.topHeight } : null));

  // Another customer, now and then.
  const customer = zone.place(new ShopCustomer({ viewer: listener, seed: plan.customer.seed, browsing: plan.customer, lines: plan.customer.lines }), new THREE.Vector3());
  zone.place(customer.walker, customer.walker.position.clone(), Math.PI);

  // What the flat can be sold, on the floor, on the walls and on the tables.
  const coat = plan.shop === 'pets' ? new CatSettingsStore().settings.coat : undefined;
  const displays: ForSale[] = [];
  for (const display of plan.displays) {
    const piece = buildPiece(display.good, display.variant, coat);
    if (!piece) continue;
    const item = new ForSale({ good: homeGood(display.good), piece, upgrades, accent, tag: display.tag, collides: display.collides, wallet: ctx.money.wallet, onBought: sold });
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
  return { room, surfaceAt: rugsOnShow(zone, displays, plan.room) };
}

/**
 * What the feet walk on in a shop: a rug on show (its `Rug`, wherever it lies) is soft underfoot like the flat's, else
 * the shop's floor. The displays do not move: each rug's footprint is worked out once.
 */
function rugsOnShow(zone: Zone, displays: readonly ForSale[], room: ShopPlan['room']): (local: THREE.Vector3) => FootSurface {
  const floor = surfaceOfRoom(room);
  const rugs: { toRug: THREE.Matrix4; half: THREE.Vector2 }[] = [];
  zone.group.updateMatrixWorld(true);
  const toZone = new THREE.Matrix4();
  for (const display of displays) {
    display.traverse((obj) => {
      if (!(obj instanceof Rug)) return;
      // Zone-local -> the rug's own frame (its footprint centred there, length along x).
      toZone.copy(zone.group.matrixWorld).invert().multiply(obj.matrixWorld);
      rugs.push({ toRug: toZone.clone().invert(), half: obj.size.clone().multiplyScalar(0.5) });
    });
  }
  const p = new THREE.Vector3();
  return (local) => {
    for (const { toRug, half } of rugs) {
      p.set(local.x, 0, local.z).applyMatrix4(toRug);
      if (Math.abs(p.x) <= half.x && Math.abs(p.z) <= half.y) return 'carpet';
    }
    return floor;
  };
}

/** Places the shop's own furniture and the sounds it makes; returns its tables by id (the displays that stand on them need them). */
function placeFixtures(zone: Zone, fixtures: ShopPlan['fixtures'], hearing: Hearing & Pick<BuildContext, 'sky'>): Map<string, DisplayTable> {
  const tables = new Map<string, DisplayTable>();
  let snow = false;
  const at = (item: THREE.Object3D, x: number, y: number, z: number): THREE.Vector3 => zone.toLocal(item.localToWorld(new THREE.Vector3(x, y, z)));
  for (const fixture of fixtures) {
    // The clock ticks as its hand steps (`placeClock`); a radio stands on something placed later (`placeRadios`).
    if (fixture.kind === 'clock') {
      placeClock(zone, hearing, fixture.at);
      continue;
    }
    if (fixture.kind === 'radio') continue;
    const item = zone.placeAt(buildFixture(fixture), fixture.at);
    item.updateMatrixWorld(true);
    if (fixture.kind === 'table') tables.set(fixture.id, item as DisplayTable);
    if (fixture.kind === 'tvWall') {
      snow = true;
      zone.place(pointSound(hearing, new SnowHiss(), { referenceDistance: 1.2, maxDistance: 8 }), at(item, 0, 1.1, 0.4));
    }
    if (fixture.kind === 'fishTank') zone.place(pointSound(hearing, new TankBubbler(), { referenceDistance: 0.6, maxDistance: 6 }), at(item, 0, 0.95, 0));
    if (item instanceof Birdcage) zone.place(pointSound(hearing, new PetShopNoises(), { referenceDistance: 1, maxDistance: 9 }), at(item, item.voiceAt.x, item.voiceAt.y, item.voiceAt.z));
  }
  // The TV wall's sets stay static (their parts merge); one ticker repaints the snow they share.
  if (snow) zone.place(new SnowTicker(), new THREE.Vector3());
  return tables;
}

/** The shop's radio sets, each on its `on` (a table, the counter): switched on the first time heard, its voice at its speaker. */
function placeRadios(zone: Zone, fixtures: ShopPlan['fixtures'], hearing: Hearing, hostOf: (on: string) => { host: THREE.Object3D; top: number } | null): void {
  for (const fixture of fixtures) {
    if (fixture.kind !== 'radio') continue;
    const found = hostOf(fixture.on);
    if (!found) throw new Error(`[shop] ${zone.id}: no '${fixture.on}' for the radio`);
    const { host, top } = found;
    host.updateMatrixWorld(true);
    const [x, z] = fixture.spot;
    const radio = zone.place(new Radio(), zone.toLocal(host.localToWorld(new THREE.Vector3(x, top, z))), host.rotation.y + (fixture.yaw ?? 0));
    radio.updateMatrixWorld(true);
    zone.place(pointSound(hearing, new ShopRadio(radio), { maxDistance: 10 }), zone.toLocal(radio.localToWorld(new THREE.Vector3(-0.05, 0.08, 0.04))));
  }
}

function buildFixture(fixture: Exclude<ShopFixture, { kind: 'clock' | 'radio' }>): Furniture {
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
    case 'rugRolls':
      return new RugRolls(fixture.options);
    case 'trolley':
      return new DeliveryTrolley();
    case 'birdcage':
      return new Birdcage();
  }
}

/** The voice of one of the shop's own sounds. */
function soundOf(sound: ShopSound): AmbientVoice {
  switch (sound.kind) {
    case 'pets':
      return new PetShopNoises();
  }
}
