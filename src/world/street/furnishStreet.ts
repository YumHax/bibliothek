import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { getPlatform } from '@/catalog/platforms';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { NewsPanel } from '@/ui/NewsPanel';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../layout';
import { NeonSign } from '../props/NeonSign';
import { StreetLighting } from './StreetLighting';
import { SkyDome } from './SkyDome';
import { StreetGround } from './StreetGround';
import { Buildings } from './Buildings';
import { StreetLamps } from './StreetLamps';
import { StreetTrees, type TreeSpot } from './StreetTrees';
import { StreetCars } from './StreetCars';
import { StreetFurniture } from './StreetFurniture';
import { StreetDoor } from './StreetDoor';
import { StreetBounds } from './StreetBounds';
import { Newsstand } from './Newsstand';
import { writeWeekly } from './gamingWeekly';
import { Busker } from './Busker';
import { GarageSale, isGarageSaleDay } from './GarageSale';
import { StreetCrowd } from './StreetCrowd';
import { Precipitation } from './Precipitation';
import { StreetSound } from './StreetSound';
import { FACADES, STREET_PLAN, WALKABLE, type Vec2 } from './streetPlan';

const ANISOTROPY = 8;
/** Neon letters over the shopfronts: how tall. */
const SIGN_HEIGHT = 0.85;

/**
 * Builds Front Street into its zone from `STREET_PLAN` (see the map in `streetPlan.ts`): no `Room`,
 * an outdoor rig instead (the sun and sky light, the air), the sky dome, the ground, the buildings
 * with their shops and lit windows, the neon over the arcade and the retro games shop, the street
 * lamps, the trees and the park behind its hedge, the cars (parked and driving), the benches, bins
 * and bus shelter, the three doors (home, the arcade, the retro games shop and the flea market at
 * its back), the newsstand with its paper, the busker, the garage sale on its days, the
 * passers-by, the rain and snow, the street's sound, and the invisible edges. Returns how lit the
 * street is (for the reflections and the haze), the one thing `main.ts` asks of a zone.
 */
export function furnishStreet(zone: Zone, { sky, listener, covers, wallet, market, games, cssLayer }: BuildContext): ZoneHandle {
  const plan = STREET_PLAN;
  const { dayNight } = sky;
  const origin = new THREE.Vector3();
  const at = ([x, z]: Vec2): THREE.Vector3 => new THREE.Vector3(x, 0, z);

  // Light, sky, ground and buildings.
  const lighting = zone.place(
    new StreetLighting(dayNight, listener, (out) => sky.outdoors.lightDirection(dayNight.state, out), { shadowMapSize: Math.min(2048, QUALITY.shadowMapSize * 2) }),
    origin,
  );
  zone.place(new SkyDome(dayNight, listener), origin);
  zone.place(new StreetGround(dayNight, ANISOTROPY), origin);
  const stock = market.peekToday();
  const shopGoods = stock?.map((item) => `#${getPlatform(item.game.platform).accentColor.toString(16).padStart(6, '0')}`) ?? null;
  zone.place(new Buildings(FACADES, dayNight, { detailScale: QUALITY.level === 'low' ? 0.6 : 1, anisotropy: ANISOTROPY, shopGoods }), origin);
  for (const sign of plan.signs) {
    zone.place(new NeonSign({ text: sign.text, color: sign.color, width: sign.width, height: SIGN_HEIGHT, intensity: 0, seed: sign.seed }), new THREE.Vector3(...sign.at), sign.yaw);
  }

  // Lamps, trees, cars, street furniture.
  zone.place(new StreetLamps(dayNight, { lamps: plan.lamps, height: plan.lampHeight, lights: plan.lampLights, viewer: listener }), origin);
  const random = seededRandom(plan.park.seed);
  const park = plan.park;
  const trees: TreeSpot[] = [
    ...plan.trees.map((spot) => ({ at: spot, scale: 1 })),
    ...Array.from({ length: park.trees }, () => ({
      at: [park.from[0] + random() * (park.to[0] - park.from[0]), park.from[1] + random() * (park.to[1] - park.from[1])] as Vec2,
      scale: 1.3 + random() * 0.6,
    })),
  ];
  zone.place(new StreetTrees(dayNight, trees), origin);
  const cars = zone.place(new StreetCars(dayNight, { parked: plan.parked, ...plan.traffic, viewer: listener }), origin);
  zone.place(new StreetFurniture({ shelter: plan.shelter, benches: plan.benches, bins: plan.bins, hedge: plan.hedge, railings: plan.railings, anisotropy: ANISOTROPY, dayNight }), origin);

  // The doors.
  for (const door of Object.values(plan.doors)) {
    zone.place(new StreetDoor({ width: door.width, height: door.height, to: door.to, label: door.label }), at(door.at), door.yaw);
  }

  // The newsstand and its paper.
  const owns = (id: string): boolean => games.games.some((g) => g.id === id && g.status !== 'wishlist');
  const isWanted = (id: string): boolean => games.games.some((g) => g.id === id && g.status === 'wishlist');
  const panel = new NewsPanel(cssLayer.renderer.domElement.parentElement ?? document.body);
  zone.onUnload(() => panel.dispose());
  zone.place(new Newsstand({ panel, issue: () => writeWeekly({ stock: market.peekToday(), day: market.day, theme: market.theme, wanted: isWanted }) }), at(plan.kiosk.at), plan.kiosk.yaw);

  // The busker by the bus shelter, the garage sale (some days), the passers-by.
  zone.place(new Busker(dayNight, { viewer: listener, hours: plan.busker.hours, tipsPerDay: plan.busker.tipsPerDay, reach: plan.busker.reach }), at(plan.busker.at), plan.busker.yaw);
  if (isGarageSaleDay(plan.garageSale.oneDayIn)) {
    zone.place(
      new GarageSale({ host: zone, covers, wallet, stock: () => market.peekToday(), price: () => market.binPrice, owns, isWanted }),
      at(plan.garageSale.at),
      plan.garageSale.yaw,
    );
  }
  zone.place(new StreetCrowd(dayNight, { ...plan.crowd, viewer: listener, place: (walker, spot) => zone.place(walker, spot) }), origin);

  // Weather, sound, and the edges of the walkable street.
  zone.place(new Precipitation(dayNight), origin);
  zone.place(new StreetSound(dayNight, { listener, cars: cars.voices }), origin);
  zone.place(new StreetBounds(WALKABLE, [...StreetLamps.colliders(plan.lamps), ...StreetTrees.colliders(plan.trees)]), origin);

  return { lightLevel: () => lighting.lightLevel() };
}
