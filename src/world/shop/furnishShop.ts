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
import { LightPool } from '../lighting/LightPool';
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
import { FlowerStand } from './FlowerStand';
import { SnowTicker } from './snowScreen';
import { RugRolls } from './RugRolls';
import { DeliveryTrolley } from './DeliveryTrolley';
import { ShopWindow, SILL } from './ShopWindow';
import { ShopClerk } from './ShopClerk';
import { ShopCustomer } from './ShopCustomer';
import { WindowDisplay } from './common/WindowDisplay';
import { isShopFitting, isShopVoiced, type ShopFitting } from './common/fitting';
import { makeShopProp, type ShopContext } from './shopProps';
import { PetShopNoises, ShopRadio, ShopRoomTone, SnowHiss, playTill } from './shopSounds';
import { SHOP_DOOR, SHOP_PLANS, type OnSurface, type ShopFixture, type ShopPlan, type ShopSound, type ShopZoneId } from './shopPlan';
import { surfaceOfRoom } from '@/audio/footSurface';

/**
 * The shop's daylight: the sky's through its one window, never darker than this (the back of a shop is lit by its
 * own lamp and the street's glow), nor as bright as out in the open.
 */
const DAYLIGHT = { min: 0.3, max: 0.85 };
/** Where the clerk stands, counter-local: behind it. */
const CLERK_AT = new THREE.Vector3(0, 0, -0.62);
/** The counter's top, where things on it stand (`ShopCounter`). */
const COUNTER_TOP = 0.95;
/** Real lights the shop's glows share by default (`LightPool`, `ShopPlan.glowLights`). */
const GLOW_LIGHTS = 2;
/** The window's frame round the glass (`ShopWindow`), for the openings what runs round the walls leaves out. */
const WINDOW_FRAME = 0.08;
/** The exit's architrave either side of its leaf. */
const DOOR_TRIM = 0.08;

/** A surface things stand on: its host (placed), the height of its top, and where on its top the spots are measured from (host-local z). */
interface Surface {
  host: THREE.Object3D;
  top: number;
  centreZ?: number;
}

/**
 * Builds one of Front Street's shops into its zone from `SHOP_PLANS[zone.id]`: the room (its daylight the sky's
 * through the front window, `ShopWindow`, and the display plinth inside it), its lamp and switch (which works the
 * shop's other fittings too), the exit back to the street (a shopfront door as big as the street's), the shop's own
 * furniture and props (`fixtures`: the shared ones of `common/`, the shop's own of `<shop>/props.ts`, by name) and
 * sounds, the glows' shared lights (`LightPool`), every piece of the flat it sells standing where a customer can walk
 * up to it with its price tag (`ForSale`: a first click arms it, the second buys it, SOLD once a one-off is at home),
 * the counter with the clerk behind it (`ShopClerk`: off on a chore now and then, a thanks and the till after a sale),
 * whose till opens the shop's list (`HomeShopPanel`), and another customer now and then.
 */
export function furnishShop(zone: Zone, ctx: BuildContext): ZoneHandle {
  const { sky, listener, panels, home: { upgrades } } = ctx;
  const plan = SHOP_PLANS[zone.id as ShopZoneId];
  if (!plan) throw new Error(`[shop] no SHOP_PLANS entry for zone ${zone.id}`);
  const room = furnishShell(zone, sky, plan.room, { fixedDaylight: DAYLIGHT.min });
  // The shop's fittings (tubes, spots, glowing shades) follow the ceiling lamp's switch.
  const fittings: ShopFitting[] = [];
  let lampOn = true;
  placeRoomLight(zone, room, plan.lamp.kind, plan.lamp.at, plan.lamp.switchAt, (on) => {
    lampOn = on;
    for (const fitting of fittings) fitting.setLit(on);
  });
  // The door onto the street it is on (TV REPAIR is round the corner on Park Street), and the shop's name and colours there.
  const door = shopDoorOf(zone.id as ShopZoneId);
  zone.placeAt(new TravelDoor({ style: 'glazed', shopfront: true, width: SHOP_DOOR.width, height: SHOP_DOOR.height, label: `${streetOf(door)} · go out`, to: 'street' }), plan.exit);
  const look = SHOP_LOOKS[plan.shop];
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
  // The display bed inside the window, what the shop shows the street standing on it.
  const display = plan.windowDisplay === false ? null : placeWindowDisplay(zone, plan);

  const exitAlong = 'wall' in plan.exit ? plan.exit.along : 0;
  const shop: ShopContext = {
    name,
    accent: plan.accent,
    fascia: Number.parseInt(look.fascia.slice(1), 16),
    letters: look.letters,
    kind: plan.shop,
    dayNight: sky.dayNight,
    room: plan.room,
    openings: [
      { wall: 'front', along: exitAlong, width: SHOP_DOOR.width + 2 * DOOR_TRIM, bottom: 0, top: SHOP_DOOR.height },
      // The stall riser under the glass runs down to the floor.
      { wall: 'front', along, width: width + 2 * WINDOW_FRAME, bottom: 0, top: SILL + height + WINDOW_FRAME },
    ],
    seed: 0,
  };
  const placed: Furniture[] = [];
  const tables = placeFixtures(zone, plan.fixtures, ctx, shop, placed);

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
  // What stands on a surface, once every surface is there: the radios, the props on the counter, the tables, the window.
  const surfaceOf = (on: string): Surface => {
    if (on === 'counter') return { host: counter, top: COUNTER_TOP };
    if (on === 'windowDisplay') {
      if (!display) throw new Error(`[shop] ${zone.id}: no window display (windowDisplay: false)`);
      return { host: display, top: display.topHeight, centreZ: display.topCentre };
    }
    const table = tables.get(on);
    if (!table) throw new Error(`[shop] ${zone.id}: no table '${on}'`);
    return { host: table, top: table.topHeight };
  };
  const placeOn = <F extends Furniture>(item: F, surface: OnSurface): F => {
    const { host, top, centreZ = 0 } = surfaceOf(surface.on);
    host.updateMatrixWorld(true);
    const [x, z] = surface.spot;
    return zone.place(item, zone.toLocal(host.localToWorld(new THREE.Vector3(x, top, centreZ + z))), host.rotation.y + (surface.yaw ?? 0));
  };
  plan.fixtures.forEach((fixture, index) => {
    if (fixture.kind === 'radio') {
      const radio = placeOn(new Radio(), fixture);
      radio.updateMatrixWorld(true);
      zone.place(pointSound(ctx, new ShopRadio(radio), { maxDistance: 10 }), zone.toLocal(radio.localToWorld(new THREE.Vector3(-0.05, 0.08, 0.04))));
    } else if (fixture.kind === 'prop' && 'on' in fixture) {
      placed.push(placeOn(makeShopProp(fixture.prop, fixture.options, { ...shop, seed: index + 1 }), fixture));
    }
  });
  // The fittings, now all there, lit as the switch is; the props' sounds at their places.
  for (const item of placed) {
    if (isShopFitting(item)) {
      fittings.push(item);
      item.setLit(lampOn);
    }
    if (isShopVoiced(item)) {
      item.updateMatrixWorld(true);
      for (const { voice, at, options } of item.voices()) zone.place(pointSound(ctx, voice, options), zone.toLocal(item.localToWorld(at.clone())));
    }
  }
  // The real lights the glows (`PooledLight`s of the fittings and props) are lent, nearest the eye first.
  const glowLights = plan.glowLights ?? GLOW_LIGHTS;
  if (glowLights > 0) zone.place(new LightPool(glowLights, listener), new THREE.Vector3());

  // Another customer, now and then.
  const customer = zone.place(new ShopCustomer({ viewer: listener, seed: plan.customer.seed, browsing: plan.customer, lines: plan.customer.lines }), new THREE.Vector3());
  zone.place(customer.walker, customer.walker.position.clone(), Math.PI);

  // What the flat can be sold, on the floor, on the walls and on the surfaces.
  const coat = plan.shop === 'pets' ? new CatSettingsStore().settings.coat : undefined;
  const displays: ForSale[] = [];
  for (const shown of plan.displays) {
    const piece = buildPiece(shown.good, shown.variant, coat);
    if (!piece) continue;
    const item = new ForSale({ good: homeGood(shown.good), piece, upgrades, accent, tag: shown.tag, collides: shown.collides, wallet: ctx.money.wallet, onBought: sold });
    if ('on' in shown) placeOn(item, shown);
    else zone.placeAt(item, shown.at);
    displays.push(item);
  }
  if (upgrades) followUpgrades(zone, upgrades, () => displays.forEach((item) => item.refresh()));
  return { room, surfaceAt: rugsOnShow(zone, displays, plan.room) };
}

/** The display plinth inside the front window, as wide as the glass, in the shop's colour darkened. */
function placeWindowDisplay(zone: Zone, plan: ShopPlan): WindowDisplay {
  const options = plan.windowDisplay || {};
  const color = options.color ?? new THREE.Color(plan.accent).multiplyScalar(0.7).getHex();
  const item = zone.placeAt(new WindowDisplay({ width: plan.window.width, depth: options.depth, height: options.height, color }), { wall: 'front', along: plan.window.along, y: 0 });
  item.updateMatrixWorld(true);
  return item;
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

/**
 * Places the shop's own furniture standing on the floor or hung on a wall or the ceiling, and the sounds it makes
 * (what stands on a surface comes after the counter: `furnishShop`); its props go into `placed`. Returns its tables by
 * id (what stands on them needs them).
 */
function placeFixtures(zone: Zone, fixtures: ShopPlan['fixtures'], hearing: Hearing & Pick<BuildContext, 'sky'>, shop: ShopContext, placed: Furniture[]): Map<string, DisplayTable> {
  const tables = new Map<string, DisplayTable>();
  let snow = false;
  const at = (item: THREE.Object3D, x: number, y: number, z: number): THREE.Vector3 => zone.toLocal(item.localToWorld(new THREE.Vector3(x, y, z)));
  fixtures.forEach((fixture, index) => {
    // The clock ticks as its hand steps (`placeClock`); a radio or a prop on a surface is placed later.
    if (fixture.kind === 'clock') {
      placeClock(zone, hearing, fixture.at);
      return;
    }
    if (fixture.kind === 'radio' || 'on' in fixture) return;
    if (fixture.kind === 'prop') {
      placed.push(zone.placeAt(makeShopProp(fixture.prop, fixture.options, { ...shop, seed: index + 1 }), fixture.at));
      return;
    }
    const item = zone.placeAt(buildFixture(fixture), fixture.at);
    item.updateMatrixWorld(true);
    if (fixture.kind === 'table') tables.set(fixture.id, item as DisplayTable);
    if (fixture.kind === 'tvWall') {
      snow = true;
      zone.place(pointSound(hearing, new SnowHiss(), { referenceDistance: 1.2, maxDistance: 8 }), at(item, 0, 1.1, 0.4));
    }
    if (item instanceof Birdcage) zone.place(pointSound(hearing, new PetShopNoises(), { referenceDistance: 1, maxDistance: 9 }), at(item, item.voiceAt.x, item.voiceAt.y, item.voiceAt.z));
  });
  // The TV wall's sets stay static (their parts merge); one ticker repaints the snow they share.
  if (snow) zone.place(new SnowTicker(), new THREE.Vector3());
  return tables;
}

function buildFixture(fixture: Exclude<ShopFixture, { kind: 'clock' | 'radio' | 'prop' }>): Furniture {
  switch (fixture.kind) {
    case 'tvWall':
      return new TvWall(fixture.options);
    case 'goodsShelf':
      return new GoodsShelf(fixture.options);
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
