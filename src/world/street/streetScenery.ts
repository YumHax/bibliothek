import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import type { DayNight } from '../props/DayNight';
import type { Furniture } from '../Furniture';
import { PARK_TREES, STREET_TREES } from '../city/trees';
import { PARKED_CARS } from '../city/parkedCars';
import { LAWN_REACH, LAWN_Y, StreetGround } from './StreetGround';
import { StreetPark } from './StreetPark';
import { Buildings, paintFacadeAtlas, type PaintedFront } from './Buildings';
import { castByStretch } from './shadowStretches';
import type { WindowLife } from './windowLife';
import { FacadeRelief, type FacadeReliefOptions } from './relief/FacadeRelief';
import { BladeSigns } from './relief/BladeSigns';
import { Shopfronts } from './shopfronts/Shopfronts';
import { Shutters } from './relief/Shutters';
import { ShopGlow } from './relief/ShopGlow';
import { WallMounts } from './relief/WallMounts';
import { StreetLamps } from './StreetLamps';
import { StreetTrees, type TreeSpot } from './StreetTrees';
import { StreetCars, type StreetCarsOptions } from './StreetCars';
import { StreetFurniture, type StreetFurnitureOptions } from './StreetFurniture';
import type { StreetTraffic } from './traffic/StreetTraffic';
import type { FarShadowUniforms } from './shadowFade';
import { STREET_PLAN, type FacadeSpec, type Vec2 } from './streetPlan';

/**
 * The street's scenery, built once here for both pictures of it that are 3D: the walkable street (`furnishStreet`,
 * each piece placed in its zone) and a window's view onto it (`outlook/streetOutlook`, each piece added to its own
 * scene). What only the walker meets (people, doors, sounds, shops' insides) stays in `furnishStreet`; what differs
 * between the two (the lamps' real lights, the cars' manoeuvres, the colliders) is an option here.
 */

/** Where a piece goes: `zone.place(item, origin)` in the street, `scene.add(item)` behind a window. */
export type AddScenery = <T extends Furniture>(item: T) => T;

/** The large atlases' anisotropic filtering, by quality (`QUALITY.anisotropy`: 2 on low, 8 on high). */
export function sceneryAnisotropy(): number {
  return QUALITY.anisotropy;
}

/** The night map's share of the facade atlas: half on high, a quarter else (the surface mask is `Buildings`' own, half on every quality). */
function nightScale(): number {
  return QUALITY.level === 'high' ? 0.5 : 0.25;
}

interface StreetBaseOptions {
  dayNight: DayNight;
  /** The facades built (all of them in the street; those facing the window behind one). */
  facades: readonly FacadeSpec[];
  /** Scales every facade's `detail`. */
  detailScale: number;
  /** RETRO GAMES' display colours (today's stock), if known. */
  shopGoods: readonly string[] | null;
  windowLife?: WindowLife;
  /** The walkable street's park: its walked gardens collide. */
  walkable?: boolean;
  /** The near facades' windows built in 3D (`Buildings.windowFrames`): yes unless false. */
  windowFrames?: boolean;
}

/** Milliseconds of painting between two pauses of `paintStreetBase` (a facade's paint is a few ms: several fit an idle slice). */
const PAINT_SLICE_MS = 6;

/**
 * The facades' atlas painted ahead of `buildStreetBase` with the same facades, scale and frames (`Buildings.paintFacadeAtlas`),
 * a pause (`yield`) whenever `PAINT_SLICE_MS` of painting have gone by: iterate it, awaiting an idle moment at each, and
 * the build that follows finds the atlas painted.
 */
export function* paintStreetBase(options: Pick<StreetBaseOptions, 'facades' | 'detailScale' | 'windowFrames'>): Generator<void, void, void> {
  const { facades, detailScale, windowFrames } = options;
  // A loading budget, in real milliseconds (the paint's own cost), as `OutlookView`'s compile slices.
  let since = performance.now(); // convention-ok: a loading budget in real milliseconds
  for (const _ of paintFacadeAtlas(facades, { detailScale, anisotropy: sceneryAnisotropy(), shopGoods: null, ...(windowFrames === false ? { windowFrames } : {}) })) {
    if (performance.now() - since < PAINT_SLICE_MS) continue; // convention-ok: same
    yield;
    since = performance.now(); // convention-ok: same
  }
}

/** The ground, the park's paths and beds, the facades. */
export function buildStreetBase(add: AddScenery, options: StreetBaseOptions): { buildings: Buildings; park: StreetPark } {
  return drain(streetBaseSteps(add, options));
}

/** `buildStreetBase` a piece at a time (the ground, the park, the rows), a pause (`yield`) after each: the street built ahead never holds a frame for all three. */
export function* streetBaseSteps(add: AddScenery, options: StreetBaseOptions): Generator<void, { buildings: Buildings; park: StreetPark }, void> {
  const { dayNight, facades, detailScale, shopGoods, windowLife, walkable, windowFrames } = options;
  const anisotropy = sceneryAnisotropy();
  add(new StreetGround(dayNight, anisotropy));
  yield;
  const park = add(new StreetPark({ anisotropy, lawnY: LAWN_Y, reach: LAWN_REACH.x, dayNight, ...(walkable ? { walkable } : {}) }));
  yield;
  const buildings = add(new Buildings(facades, dayNight, { detailScale, anisotropy, shopGoods, nightScale: nightScale(), ...(windowLife ? { windowLife } : {}), ...(windowFrames === false ? { windowFrames } : {}) }));
  // The sun's map draws only the stretches of their length it covers (`shadowStretches`).
  castByStretch(park);
  castByStretch(buildings);
  return { buildings, park };
}

interface StreetFrontsOptions extends FacadeReliefOptions {
  /** A shutter rolling (the street's rattle); none behind a window. */
  onRoll?: (at: Vec2) => void;
}

/** What stands out of the painted facades: awnings, balconies, the landmark fronts, bracket signs, the walk-in shops' fronts, shutters, the shops' glow, what is fixed to the walls (lanterns, alarms, cables, posters). */
export function buildStreetFronts(add: AddScenery, fronts: readonly PaintedFront[], dayNight: DayNight, options: StreetFrontsOptions = {}): { shopfronts: Shopfronts } {
  return drain(streetFrontsSteps(add, fronts, dayNight, options));
}

/** `buildStreetFronts` with a pause (`yield`) after the relief and after the shopfronts, the heavy two. */
export function* streetFrontsSteps(add: AddScenery, fronts: readonly PaintedFront[], dayNight: DayNight, options: StreetFrontsOptions = {}): Generator<void, { shopfronts: Shopfronts }, void> {
  const { onRoll, ...relief } = options;
  const facadeRelief = add(new FacadeRelief(fronts, { dayNight, ...relief }));
  yield;
  add(new BladeSigns(fronts, dayNight));
  const shopfronts = add(new Shopfronts(fronts, dayNight));
  yield;
  add(new Shutters(fronts, dayNight, onRoll));
  add(new ShopGlow(fronts, dayNight));
  const mounts = add(new WallMounts(fronts, dayNight));
  // The sun's map draws only the stretches of their length it covers (`shadowStretches`).
  for (const caster of [facadeRelief, shopfronts, mounts]) castByStretch(caster);
  return { shopfronts };
}

/** What only the walkable street gives its furniture: the gate's hours, the colliders, the shelter's live poster. */
type FurnitureExtras = Pick<StreetFurnitureOptions, 'collisions' | 'viewer' | 'ad'> & { gateHours?: readonly [number, number] };
/** What only the walkable street gives its cars: free bays, manoeuvres, taxis, solid parked cars, drivers' words. */
type CarExtras = Omit<Partial<StreetCarsOptions>, 'parked' | 'routes' | 'speed' | 'gap' | 'cars' | 'stopFor' | 'viewer' | 'traffic'>;

interface StreetFixturesOptions {
  dayNight: DayNight;
  /** Whose position the lamps' real lights and the cars follow (the camera, or the listener on it). */
  viewer: THREE.Object3D;
  traffic: StreetTraffic;
  /** How many real point lights follow the lamps nearest the viewer. */
  lampLights: number;
  /** Trees besides the street's and the park's (the courtyard's chestnut, seen from the stairwell). */
  moreTrees?: readonly TreeSpot[];
  cars?: CarExtras;
  furniture?: FurnitureExtras;
  /** What else the lamps without a real light wash at night (`StreetLamps.wash`: the facades); the trees and cars always. */
  washed?: readonly THREE.Object3D[];
  /** The street's sun (`StreetLighting.far`): the trees lay their shadows past its map with it. */
  farShadow?: FarShadowUniforms;
}

/** The lamps, the trees, the parked and passing cars, the benches, bins, shelter, hedge and railings. */
export function buildStreetFixtures(add: AddScenery, options: StreetFixturesOptions): { lamps: StreetLamps; cars: StreetCars } {
  const { dayNight, viewer, traffic, lampLights, moreTrees = [], cars: carExtras = {}, furniture = {}, washed = [], farShadow } = options;
  const plan = STREET_PLAN;
  const anisotropy = sceneryAnisotropy();
  const lamps = add(new StreetLamps(dayNight, { lamps: plan.lamps, height: plan.lampHeight, lights: lampLights, viewer, flickering: plan.flickeringLamp }));
  const trees = add(new StreetTrees(dayNight, [...STREET_TREES, ...PARK_TREES, ...moreTrees], farShadow?.farSun));
  const cars = add(new StreetCars(dayNight, { parked: PARKED_CARS, ...plan.traffic, cars: plan.traffic.carsByQuality[QUALITY.level], viewer, traffic, ...carExtras }));
  // Every lamp lights the walls, trees and cars round it at night, not only the few with a real light (not on low).
  if (QUALITY.level !== 'low') lamps.wash.over([...washed, trees, cars]);
  const { gateHours, ...furnitureExtras } = furniture;
  add(
    new StreetFurniture({
      shelter: plan.shelter, benches: plan.benches, bins: plan.bins, hedge: plan.hedge, railings: plan.railings,
      gate: { z: plan.parkGate.at[1], width: plan.parkGate.width, ...(gateHours ? { hours: gateHours } : {}) },
      anisotropy, dayNight, ...furnitureExtras,
    }),
  );
  return { lamps, cars };
}

/** A builder's steps run straight through: its result. */
function drain<T>(steps: Generator<void, T, void>): T {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
