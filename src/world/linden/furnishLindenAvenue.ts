import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { DistantAvenue } from '@/audio/grandmaSounds';
import { streetBusyAt, weekdayOf } from '@/time/wakefulness';
import type { BuildContext, ZoneHandle } from '../buildContext';
import type { Zone } from '../zone/Zone';
import { StreetLighting } from '../street/StreetLighting';
import { SkyDome } from '../street/SkyDome';
import { Buildings } from '../street/Buildings';
import { FacadeRelief } from '../street/relief/FacadeRelief';
import { StreetTrees } from '../street/StreetTrees';
import { StreetLamps } from '../street/StreetLamps';
import { StreetBounds } from '../street/StreetBounds';
import { Precipitation } from '../street/Precipitation';
import { TravelDoor } from '../travel/TravelDoor';
import { pointSound } from '../build/hearing';
import { LindenGround } from './LindenGround';
import { LindenCars } from './LindenCars';
import { Bollards } from './Bollards';
import { WorksFences } from './WorksFences';
import { LindenStop } from './LindenStop';
import { BakeryCounter } from './BakeryCounter';
import { DepotTable } from './DepotTable';
import { DogWalk } from './DogWalk';
import { MemeOffTheBus } from './MemeOffTheBus';
import { LINDEN_PLAN as PLAN } from './lindenPlan';

/** The ambience heard along the avenue: from each end, far off past the works. */
const AIR_AT: readonly [number, number][] = [[-24, 0], [24, 0]];

/**
 * Builds Linden Avenue outside Mémé's building (docs/grandma.md "Around her flat"): the stretch of it walked between
 * the works' fences, under the street's outdoor rig (sun and its shadow, the sky's ambient, the dome, the rain), its
 * stone facades (`Buildings` from `LINDEN_PLAN.facades`, the street's class), the plane trees, the cast-iron lamps,
 * the level roadway with its zebra (`LindenGround`), the cars parked both sides, the bollards; line 38's stop on the
 * far side (the bus back), number 14's street door up to her landing, Lebrun's bakery under her (a baguette, a
 * croissant), the dépôt-vente's trestle of games, Mrs Bassot walking Biscotte at her hours, and Mémé herself off the
 * bus some mornings (`grandma/sharedRide`).
 */
export function furnishLindenAvenue(zone: Zone, ctx: BuildContext): ZoneHandle {
  const { sky, listener, today, covers, collection, money, market } = ctx;
  const { dayNight } = sky;
  const origin = new THREE.Vector3();
  const at = ([x, z]: readonly [number, number], y = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const hours = (): number => dayNight.state.hours;
  const day = (): number => today.gameDay;

  // Light, sky, ground and the buildings round it.
  const lighting = zone.place(
    new StreetLighting(dayNight, listener, (out) => sky.outdoors.lightDirection(dayNight.state, out), { shadowMapSize: Math.min(2048, QUALITY.shadowMapSize * 2), shadowReach: 22 }),
    origin,
  );
  zone.place(new SkyDome(dayNight, listener), origin);
  zone.place(new LindenGround(QUALITY.anisotropy), origin);
  const buildings = zone.place(new Buildings(PLAN.facades, dayNight, { detailScale: QUALITY.level === 'low' ? 0.8 : 1.1, anisotropy: QUALITY.anisotropy, shopGoods: null, nightScale: QUALITY.level === 'high' ? 0.5 : 0.25 }), origin);
  zone.place(new FacadeRelief(buildings.fronts), origin);
  const trees = zone.place(new StreetTrees(dayNight, PLAN.trees), origin);
  const lamps = zone.place(new StreetLamps(dayNight, { lamps: PLAN.lamps, height: PLAN.lampHeight, lights: PLAN.lampLights, viewer: listener }), origin);
  if (QUALITY.level !== 'low') lamps.wash.over([buildings, trees]);
  zone.place(new Precipitation(dayNight), origin);
  zone.place(new LindenCars(PLAN.parked), origin);
  zone.place(new Bollards(bollardSpots(), PLAN.bollards.height), origin);
  zone.place(new WorksFences(PLAN.ends.at, PLAN.lines.hers, PLAN.lines.far), origin);
  zone.place(new StreetBounds(PLAN.facades, [...StreetTrees.colliders(PLAN.trees.map((tree) => tree.at)), ...StreetLamps.colliders(PLAN.lamps)]), origin);
  for (const spot of AIR_AT) {
    const air = new DistantAvenue(() => streetBusyAt(hours(), weekdayOf(day())), () => dayNight.state.daylight);
    zone.place(pointSound(ctx, air, { referenceDistance: 8, maxDistance: 40 }), at(spot, 1.5));
  }

  // Line 38's stop on the far side: the bus back to Front Street.
  const { stop } = PLAN;
  zone.place(new LindenStop({ width: stop.width, pole: [stop.pole[0] - stop.shelter[0], stop.pole[1] - stop.shelter[1]], line: '38', towards: 'Front Street' }), at(stop.shelter), 0);

  // Number 14: up the stairs to her landing.
  const { herDoor } = PLAN;
  zone.place(new TravelDoor({ style: 'panelled', width: herDoor.width, height: herDoor.height, leafColor: herDoor.colour, label: `Number ${herDoor.number} · up to Mémé’s`, to: 'lindenLanding' }), at(herDoor.at), 0);

  // Lebrun's under her: the door sells a baguette, the window a croissant.
  const { bakery } = PLAN;
  for (const [offer, x] of [['baguette', bakery.door], ['croissant', bakery.window]] as const) {
    zone.place(new BakeryCounter({ offer, name: bakery.name, hours: bakery.hours, closedWeekday: bakery.closedWeekday, bread: ctx.grandmaBread ?? null, day, hour: hours }), at([x, PLAN.lines.hers]), 0);
  }

  // The dépôt-vente's trestle on the pavement.
  const { depot } = PLAN;
  const table = zone.place(
    new DepotTable({
      host: zone,
      covers,
      wallet: money.wallet,
      games: (seed, count) => market.stock.randomGames(seed, count),
      binPrice: () => market.stock.binPrice,
      owns: (id) => collection.owns(id),
      isWanted: (id) => collection.isWanted(id),
      day,
      count: depot.games,
    }),
    at(depot.table),
    depot.yaw,
  );
  void table.fill();

  // Mrs Bassot and Biscotte at their hours; Mémé off the bus some mornings.
  const walk = zone.place(new DogWalk({ viewer: listener, from: PLAN.dogWalk.from, path: PLAN.dogWalk.path, hours: PLAN.dogWalk.hours, hour: hours, day }), origin);
  // Placed (to be clicked), then out of sight until their walk.
  zone.place(walk.walker, at(PLAN.dogWalk.from)).setPresent(false);
  if (ctx.sharedRide) {
    const meme = zone.place(new MemeOffTheBus({ viewer: listener, ride: ctx.sharedRide, day, path: PLAN.memeWalk }), origin);
    zone.place(meme.walker, at(PLAN.memeWalk[0]!)).setPresent(false);
  }

  return { lightLevel: () => lighting.lightLevel(), surfaceAt: (local) => (Math.abs(local.z) < PLAN.lines.kerb ? 'asphalt' : 'stone') };
}

/** The bollards' spots: along both kerbs, every `every` metres, none where the zebra and the bus's bay are nor by a tree or a lamp. */
function bollardSpots(): [number, number][] {
  const { bollards, lines, ends, trees, lamps } = PLAN;
  const taken = [...trees.map((tree) => tree.at), ...lamps.map((lamp) => lamp.at)];
  const spots: [number, number][] = [];
  const z = lines.kerb + 0.35;
  for (let x = -ends.at + 1; x < ends.at - 0.5; x += bollards.every) {
    if (bollards.skip.some(([a, b]) => x > a && x < b)) continue;
    for (const side of [-z, z]) if (!taken.some(([tx, tz]) => Math.abs(tx - x) < 0.8 && Math.sign(tz) === Math.sign(side))) spots.push([x, side]);
  }
  return spots;
}
