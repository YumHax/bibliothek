import * as THREE from 'three';
import { DECOR_KINDS, buildDecor, type DecorEntry } from '../props/decor';
import { SHOP_PROPS, makeShopProp, type ShopContext, type ShopPropName } from '../shop/shopProps';
import type { ShopPlan } from '../shop/shopPlan';
import { buildFixture } from '../shop/buildFixture';
import { DisplayColumn } from '../showcase/DisplayColumn';
import { HomeVitrine } from '../collector/HomeVitrine';
import { CollectorsBook } from '../collector/CollectorsBook';
import { Radio } from '../kitchen/Radio';
import { Corkboard } from '../kitchen/Corkboard';
import { Seat } from '../Seat';
import { SasShell } from '../airlock/SasShell';
import { ShopCounter } from '../shop/ShopCounter';
import { GadgetCase } from '../shop/tv/GadgetCase';
import { FlowerChiller } from '../shop/florist/FlowerChiller';
import { AquariumWall } from '../shop/pets/AquariumWall';
import { RugRolls } from '../shop/RugRolls';
import { DisplayTable } from '../shop/DisplayTable';
import { buildStreetBase, buildStreetFixtures, buildStreetFronts, type AddScenery } from '../street/streetScenery';
import { STREET_PLAN, WAYFINDING } from '../street/streetPlan';
import { STREET_PLACES } from '../street/streetPlacesPlan';
import { StreetTraffic } from '../street/traffic/StreetTraffic';
import { StreetGround } from '../street/StreetGround';
import { Terraces } from '../street/life/Terraces';
import { StreetChristmas } from '../street/StreetChristmas';
import { Snowman } from '../street/Snowman';
import { STREET_TREES } from '../city/trees';
import { groundHeight } from '../street/relief/ground';
import { SignalHeads } from '../street/traffic/SignalHeads';
import { StreetDetails } from '../street/details/StreetDetails';
import { StreetFixtures } from '../street/details/StreetFixtures';
import { StreetClutter } from '../street/clutter/StreetClutter';
import { ShopSpill } from '../street/shopfronts/ShopSpill';
import { Signpost } from '../street/wayfinding/Signpost';
import { StreetPlanBoard } from '../street/wayfinding/StreetPlanBoard';
import { StreetClock } from '../street/wayfinding/StreetClock';
import { BusStopPole } from '../street/wayfinding/BusStopPole';
import { PostBox } from '../street/wayfinding/PostBox';
import { PhoneBox } from '../street/wayfinding/PhoneBox';
import { FACADES } from '@/world/city/facades';
import { DayNight } from '../props/DayNight';
import { Room, type RoomOptions } from '../Room';
import { resolvePlacement, type Placement } from '../Placement';
import { ROOM_PLAN } from '../roomPlan';
import { HALLWAY_PLAN } from '../hallway/hallwayPlan';
import { BEDROOM_PLAN } from '../bedroom/bedroomPlan';
import { BALCONY_PLAN } from '../balcony/balconyPlan';
import { ARCADE_PLAN } from '../arcade/arcadePlan';
import { BATHROOM_PLAN } from '../bathroom/bathroomPlan';
import { SALEROOM_PLAN } from '../saleroom/saleroomPlan';
import { ANNEX_PLAN } from '../annex/annexPlan';
import { SELLER_FLAT_PLAN } from '../sellerFlat/sellerFlatPlan';
import { GRANDMA_FLAT_PLAN } from '../grandma/grandmaFlatPlan';
import { LINDEN_LANDING_PLAN } from '../linden/lindenLandingPlan';
import { LindenStop } from '../linden/LindenStop';
import { WorksFences } from '../linden/WorksFences';
import { PhotoAlbum } from '../grandma/PhotoAlbum';
import { grandmaDressingSample } from '../grandma/dressingSample';
import { MARKET_PLAN } from '../market/marketPlan';
import { KITCHEN_PLAN } from '../kitchen/kitchenPlan';
import { FLOWER_SHOP } from '../shop/plans/flowerShop';
import { FURNITURE_SHOP } from '../shop/plans/furnitureShop';
import { PET_SHOP } from '../shop/plans/petShop';
import { TV_SHOP } from '../shop/plans/tvShop';
import { YardDressing } from '../courtyard/YardDressing';
import { YardGroundFloors } from '../courtyard/YardGroundFloors';
import { Courtyard } from '../outlook/Courtyard';
import { bulkyPileSample } from '../courtyard/bulkyModels';
import { cinemaSample } from '../courtyard/YardCinemaPieces';

/**
 * What `npm run zfight` (scripts/zfight.mjs) builds headless and runs `findZFighting` over, and what `npm run
 * scene-lint` (scripts/scene-lint.mjs, `world/lint/`) checks for lights, placement and disposal; never imported by the
 * game: every decor kind and every shop prop on its own (each with its default options, and each shop prop again
 * with the options its shop's plan gives it), then each room as its plan lays it out: the shell (walls, floor,
 * skirting) and the plan's decor, or a shop's props, where the plan puts them. What needs the running game (the
 * shelves and their boxes, seats, screens, visitors, the street and its traffic) is checked in the browser
 * (`bibliothek.zfight()`, `?debug`).
 */
interface ZFightSubject {
  /** Stable name, the baseline's key: `prop:<kind>`, `shopProp:<shop>:<prop>#<n>`, `room:<plan>`. */
  name: string;
  /** Distance the pairs are judged at (m), as the browser's check judges the zone it stands in. */
  viewDistance: number;
  /** A room subject's shell options (scene-lint judges where its plan put things against them); absent for a prop on its own. */
  room?: RoomOptions;
  /** An outdoor subject's ground height at world (x, z) (scene-lint judges where its things stand on it); absent indoors. */
  ground?: (x: number, z: number) => number;
  build(): THREE.Object3D;
}

/** Front Street's far end, from where the player can walk (`bootstrap/debug` FARTHEST). */
const STREET_DISTANCE = 140;

/** A prop is judged from about where it is looked at. */
const PROP_DISTANCE = 6;

/**
 * A prop stands on a floor (or hangs where its own origin puts it): the slab under y 0 hides the faces it rests on,
 * as the room's floor does in play (the detector skips a face pressed on another solid's opposite face).
 */
function onFloor(item: THREE.Object3D): THREE.Object3D {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 20), new THREE.MeshStandardMaterial({ color: 0x808080 }));
  floor.name = 'Floor';
  floor.position.y = -0.05;
  group.add(floor, item);
  return group;
}

const ROOMS: Record<string, { room: RoomOptions; decor: readonly DecorEntry[] }> = {
  living: ROOM_PLAN,
  hallway: HALLWAY_PLAN,
  bedroom: BEDROOM_PLAN,
  balcony: BALCONY_PLAN,
  arcade: ARCADE_PLAN,
  bathroom: BATHROOM_PLAN,
  saleroom: SALEROOM_PLAN,
  annex: ANNEX_PLAN,
  sellerFlat: SELLER_FLAT_PLAN,
  grandmaFlat: GRANDMA_FLAT_PLAN,
  lindenLanding: LINDEN_LANDING_PLAN,
  market: MARKET_PLAN,
  kitchen: KITCHEN_PLAN,
};

const SHOPS: Record<string, ShopPlan> = { flowerShop: FLOWER_SHOP, furnitureShop: FURNITURE_SHOP, petShop: PET_SHOP, tvShop: TV_SHOP };

/** What a piece is handed that it only uses in play (a panel to open, covers to load): calls that do nothing. */
const inert = new Proxy({}, { get: () => () => Promise.resolve(null) }) as never;

/**
 * Pieces the plans do not name as decor or shop props (built by their zone's wiring), each with what it needs to
 * stand: the ones whose parts meet most (glass on frames, filleted bands, boards on carcasses).
 */
const PIECES: Record<string, () => unknown> = {
  displayColumn: () => new DisplayColumn(),
  homeVitrine: () => new HomeVitrine({ covers: inert }),
  collectorsBook: () => new CollectorsBook({ panel: inert }),
  photoAlbum: () => new PhotoAlbum({ label: () => null, use: () => {} }),
  // Mémé's things (`furnishGrandmaDecor`): the clock, the cabinet, the kitchenette, the set, the Sunday table...
  grandmaDressing: () => grandmaDressingSample((clock ??= new DayNight())),
  radio: () => new Radio(),
  // The kitchen's pinboard for friends' keepsakes, once bought (`kitchen/fridgeKeepsakes`).
  corkboard: () => new Corkboard(),
  seat: () => new Seat(),
  sasShell: () => new SasShell(),
  shopCounter: () => new ShopCounter({ front: 0.4, label: 'TILL', open: () => {} }),
  gadgetCase: () => new GadgetCase(),
  flowerChiller: () => new FlowerChiller(),
  aquariumWall: () => new AquariumWall(),
  rugRolls: () => new RugRolls(),
  displayTable: () => new DisplayTable(),
  // Linden Avenue's own things (`world/linden`): line 38's shelter and pole, the works' fences, the bollards.
  lindenStop: () => new LindenStop({ width: 3.2, pole: [-2.7, -2.05], line: '38', towards: 'Front Street' }),
  worksFences: () => new WorksFences(4, -3, 3),
  // The walked courtyard's own things (in the street's frame, as the yard places them), and a bulky-waste pile's every model in a row.
  yardDressing: () => new YardDressing((clock ??= new DayNight())),
  bulkyPile: () => bulkyPileSample(),
  // The film night's chairs, trestles (warm and cold), the stacked chairs and the sheet hung and rolled.
  yardCinema: () => cinemaSample(),
  // The yard's built ground floors with what stands against them (the dressing, the bins, shed and workshop's back).
  yardGroundFloors: () => {
    clock ??= new DayNight();
    return new THREE.Group().add(new YardGroundFloors(clock), new YardDressing(clock), new Courtyard(clock, 1));
  },
};

let clock: DayNight | null = null;

function shopContext(plan: ShopPlan | null, seed: number): ShopContext {
  clock ??= new DayNight();
  return {
    name: plan ? plan.shop.toUpperCase() : 'SHOP',
    accent: plan?.accent ?? 0x335577,
    fascia: 0x223344,
    letters: '#f4efe2',
    font: 'serif',
    kind: plan?.shop ?? 'furniture',
    dayNight: clock,
    room: plan?.room ?? { width: 6, depth: 6, height: 3 },
    openings: [],
    seed,
  };
}

/** The room's own diagonal, as `bootstrap/debug` judges a zone (most of it, at least 6 m). */
function roomDistance(room: RoomOptions): number {
  return Math.max(6, Math.hypot(room.width, room.depth, room.height) * 0.8);
}

/**
 * Places `item` as the plan says and labels it for scene-lint: `userData.lint` is the plan's kind and its ordinal
 * (`plant#2`), `userData.lintAt` what the plan hung it on (`wall`, `ceiling`, else `floor`).
 */
function placed(group: THREE.Group, item: THREE.Object3D, room: RoomOptions, at: Placement, label: string): void {
  const { position, rotationY } = resolvePlacement(room, at);
  item.position.copy(position);
  item.rotation.y = rotationY;
  item.userData.lint = label;
  item.userData.lintAt = 'wall' in at ? 'wall' : 'ceiling' in at || ('corner' in at && at.hung) ? 'ceiling' : 'floor';
  group.add(item);
}

/** `kind#n`: the n-th entry of that kind in its plan, so a finding keeps its key when another kind is added. */
function labeller(): (kind: string) => string {
  const seen = new Map<string, number>();
  return (kind) => {
    const n = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, n);
    return `${kind}#${n}`;
  };
}

export function zfightSubjects(): ZFightSubject[] {
  const subjects: ZFightSubject[] = [];
  for (const kind of Object.keys(DECOR_KINDS) as (keyof typeof DECOR_KINDS)[]) {
    subjects.push({ name: `prop:${kind}`, viewDistance: PROP_DISTANCE, build: () => onFloor(buildDecor({ kind } as DecorEntry) as unknown as THREE.Object3D) });
  }
  for (const prop of Object.keys(SHOP_PROPS) as ShopPropName[]) {
    subjects.push({ name: `shopProp:${prop}`, viewDistance: PROP_DISTANCE, build: () => onFloor(makeShopProp(prop, undefined as never, shopContext(null, 1)) as unknown as THREE.Object3D) });
  }
  for (const [name, make] of Object.entries(PIECES)) {
    subjects.push({ name: `piece:${name}`, viewDistance: PROP_DISTANCE, build: () => onFloor(make() as unknown as THREE.Object3D) });
  }
  for (const [name, plan] of Object.entries(ROOMS)) {
    subjects.push({
      name: `room:${name}`,
      viewDistance: roomDistance(plan.room),
      room: plan.room,
      build: () => {
        const group = new THREE.Group();
        const label = labeller();
        group.add(new Room(plan.room));
        for (const entry of plan.decor) placed(group, buildDecor(entry) as unknown as THREE.Object3D, plan.room, entry.at, label(entry.kind));
        return group;
      },
    });
  }
  for (const [name, plan] of Object.entries(SHOPS)) {
    subjects.push({
      name: `room:${name}`,
      viewDistance: roomDistance(plan.room),
      room: plan.room,
      build: () => {
        const group = new THREE.Group();
        const label = labeller();
        group.add(new Room(plan.room));
        plan.fixtures.forEach((fixture, i) => {
          // As `furnishShop` places them; the clock and what stands on a surface need the running zone.
          if (fixture.kind === 'clock' || fixture.kind === 'radio' || !('at' in fixture)) return;
          const item = fixture.kind === 'prop' ? makeShopProp(fixture.prop, fixture.options as never, shopContext(plan, i + 1)) : buildFixture(fixture);
          placed(group, item as unknown as THREE.Object3D, plan.room, fixture.at, label(fixture.kind === 'prop' ? fixture.prop : fixture.kind));
        });
        return group;
      },
    });
  }
  // The street's built parts (as `furnishStreet` builds them at high quality): the facades and their 3D windows, the
  // ground and the park, the shopfronts, awnings, balconies, shutters. Judged as far as Front Street is seen down.
  subjects.push({
    name: 'street:base',
    viewDistance: STREET_DISTANCE,
    build: () => {
      const group = new THREE.Group();
      const add: AddScenery = (item) => {
        group.add(item as unknown as THREE.Object3D);
        return item;
      };
      clock ??= new DayNight();
      const { buildings } = buildStreetBase(add, { dayNight: clock, facades: FACADES, detailScale: 1.35, shopGoods: null, walkable: true });
      buildStreetFronts(add, buildings.fronts, clock);
      return group;
    },
  });
  // What stands in the street besides its facades (as `furnishStreet` places it, at high quality): the lamps, trees,
  // parked cars, benches, bins, shelter, railings; the works, drains, hydrants, cabinets, signs and fountain; the bags
  // and bins put out, what the shops put out, the signals, the wayfinding, the post and phone boxes, a pop-up's board.
  subjects.push({
    name: 'street:fixtures',
    viewDistance: STREET_DISTANCE,
    ground: groundHeight,
    build: () => {
      const group = new THREE.Group();
      const add: AddScenery = (item) => {
        group.add(item as unknown as THREE.Object3D);
        return item;
      };
      const at = <T extends THREE.Object3D>(item: T, [x, z]: readonly [number, number], yaw = 0, y = 0): T => {
        item.position.set(x, y, z);
        item.rotation.y = yaw;
        group.add(item);
        return item;
      };
      clock ??= new DayNight();
      const plan = STREET_PLAN;
      const viewer = new THREE.Object3D();
      const traffic = new StreetTraffic(clock);
      // The ground under them, so a foot or a base pressed on the road or the pavement is known to be unseen.
      add(new StreetGround(clock, 1)).userData.ground = true;
      buildStreetFixtures(add, { dayNight: clock, viewer, traffic, lampLights: 0 });
      add(new StreetDetails(1, clock));
      add(new StreetFixtures());
      add(new StreetClutter(clock, { trees: plan.trees, bins: plan.bins, benches: plan.benches, binHours: plan.binLorry.hours, viewer }));
      add(new ShopSpill(clock, { spots: plan.shopSpill, board: plan.chalkBoard }));
      add(new SignalHeads(traffic, clock, plan.signals.posts));
      const { signpost, planBoard, clock: pillar } = WAYFINDING;
      at(new Signpost(signpost.at, signpost.arms, 1), signpost.at);
      at(new StreetPlanBoard({ at: planBoard.at, width: planBoard.width, height: planBoard.height, places: signpost.arms, far: () => false }, 1), planBoard.at, planBoard.yaw, planBoard.y);
      at(new StreetClock(clock, pillar.height, () => null), pillar.at, pillar.yaw);
      const pole = plan.busRide.pole;
      at(new BusStopPole({ line: plan.bus.line, towards: 'TOWN', stops: 'the town', fare: plan.busRide.fare, every: plan.bus.every, nightEvery: plan.bus.nightEvery, dueIn: () => 60, dayNight: clock }), pole.at, pole.yaw);
      at(new PostBox(() => {}), STREET_PLACES.postBox.at, STREET_PLACES.postBox.yaw);
      at(new PhoneBox(clock, { price: 1, call: () => {} }), STREET_PLACES.phoneBox.at, STREET_PLACES.phoneBox.yaw);
      // The terraces' tables and chairs (their customers are people: not here), December's bulbs, the snowman.
      const collisions = { add: () => {}, remove: () => {} };
      add(new Terraces(clock, { terraces: plan.terraces, viewer, collisions, toWorld: (p) => p, place: () => {}, talk: () => '', weekday: () => 2, season: 'summer', drawDistance: 0, fade: 0, maxCustomers: 0 }));
      add(new StreetChristmas(clock, { trees: STREET_TREES }));
      at(new Snowman({ viewer }), plan.snowman.at, plan.snowman.yaw);
      return group;
    },
  });
  return subjects;
}
