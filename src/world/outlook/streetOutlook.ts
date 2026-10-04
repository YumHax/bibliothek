import * as THREE from 'three';
import { isUpdatable, type Updatable } from '@/core/Engine';
import { QUALITY } from '@/graphics/quality';
import type { DayNight } from '../props/DayNight';
import { StreetLighting } from '../street/StreetLighting';
import { SkyDome } from '../street/SkyDome';
import { SkyReflection } from '../street/SkyReflection';
import { StreetTraffic } from '../street/traffic/StreetTraffic';
import { Precipitation } from '../street/Precipitation';
import { buildStreetBase, buildStreetFixtures, buildStreetFronts, sceneryAnisotropy } from '../street/streetScenery';
import { airColor, airDensity } from '../street/streetAir';
import { fadeSunShadowEdges } from '../street/shadowFade';
import { STREET_PLAN, type FacadeSpec } from '../street/streetPlan';
import { RetroLure } from '../street/RetroLure';
import { RETRO_NEWS } from '../props/outdoors/RetroShopLure';
import type { WindowLife } from '../street/windowLife';
import { Courtyard } from './Courtyard';
import { COURTYARD_YARD } from '@/world/courtyard/courtyardPlan';
import { disposeOutlookScene, type OutlookContents } from './OutlookView';
import type { HomeUpgrades } from '@/economy/HomeUpgrades';

interface StreetOutlookOptions {
  dayNight: DayNight;
  /** Where the sun (the moon) is, as the window view has it (`Outdoors.lightDirection`). */
  lightDirection: (out: THREE.Vector3) => THREE.Vector3;
  /**
   * The facades built: those seen from one window (`facadesInView`), or from every window of our building
   * (`homeFacades`, the view shared by the flat, the stairwell and the neighbours' flats).
   */
  facades: readonly FacadeSpec[];
  /** Whose homes the lit windows are and the stories behind them (`building/rearWindows`); none: the curfews. */
  windowLife?: WindowLife;
  /** What the flat has bought: our balcony's plants and bistro set show as in the street (none: all shown). */
  upgrades?: HomeUpgrades;
  /** Awaited between the build's steps (`OutlookView`'s idle moment): the street is not built in one freeze. */
  between?: () => Promise<void>;
}

/** Real lights among the street lamps, following the ones nearest the window (none on low). */
const LAMP_LIGHTS = { high: 2, medium: 2, low: 0 } as const;
/** Real seconds between two prefilters of the sky for what the view's glass and paint reflect. */
const REFLECT_EVERY = 20;
/** The view's sun redraws its shadow this many times a second (the cars' shadows move on; the rest barely does). */
const SHADOW_HZ = 5;
/** The facades' paint, finer on high as in the street itself (`furnishStreet`): from the flat they are 20-30 m off. */
const DETAIL_SCALE = { high: 1.35, medium: 1, low: 0.6 } as const;

/**
 * Front Street and our courtyard as seen through a window from inside (`OutlookView`): the street's own pieces built
 * again in a scene of their own, its frame the street's zone-local one, lit by its own sun and sky (`StreetLighting`,
 * occupied: its shadow live, its ambient on) under its own dome, with the air's haze as fog, what the sky dome
 * reflects as the scene's environment. The ground, the park's paths and beds, the facades within reach that face the
 * window with their relief (the walk-in shops' fronts and window displays too), shutters and the shops' spill of light, the lamps, the trees, the parked and passing cars,
 * the benches, bins, the shelter, hedge and railings, the rain and snow, and the courtyard behind our building
 * (`Courtyard`, its chestnut planted with the street's trees). What only matters to someone standing in the street
 * (the people, the doors, the sounds, the shops' insides) is left out. Loaded in the street's chunk (a dynamic import).
 */
export async function buildStreetOutlook(camera: THREE.Camera, options: StreetOutlookOptions): Promise<OutlookContents> {
  const { dayNight, lightDirection, facades, windowLife, upgrades } = options;
  const between = options.between ?? (() => Promise.resolve());
  const scene = new THREE.Scene();
  scene.name = 'StreetOutlook';
  const fog = new THREE.FogExp2(0x000000, 0);
  scene.fog = fog;
  const items: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(item: T): T => {
    scene.add(item);
    items.push(item);
    return item;
  };

  const lighting = add(new StreetLighting(dayNight, camera, lightDirection, { shadowMapSize: QUALITY.level === 'high' ? 2048 : 1024, shadowReach: 32, shadowRefreshHz: SHADOW_HZ }));
  lighting.setOccupied(true);
  const dome = add(new SkyDome(dayNight, camera));
  // The street's own scenery (`street/streetScenery`): ground, park, the facades facing the window with their relief,
  // lamps, trees (the courtyard's chestnut among them), parked and passing cars, furniture. No colliders, no manoeuvres.
  // RETRO GAMES' shelves in today's stock, as the street has them (`RetroLure`'s news), once drawn.
  const shopGoods = RETRO_NEWS.colors ? [...RETRO_NEWS.colors] : null;
  await between();
  const { buildings } = buildStreetBase(add, { dayNight, facades: [...facades], detailScale: DETAIL_SCALE[QUALITY.level], shopGoods, ...(windowLife ? { windowLife } : {}) });
  await between();
  buildStreetFronts(add, buildings.fronts, dayNight, upgrades ? { upgrades } : {});
  await between();
  const traffic = add(new StreetTraffic());
  buildStreetFixtures(add, { dayNight, viewer: camera, traffic, lampLights: LAMP_LIGHTS[QUALITY.level], moreTrees: [COURTYARD_YARD.chestnut] });
  await between();
  add(new Precipitation(dayNight));
  // RETRO GAMES' NEW IN banner on a fresh market day, seen from the flat (the street's own; the queue is people: not here).
  if (facades.some((spec) => spec.id === 'retro')) {
    add(new RetroLure({ ...STREET_PLAN.retroLure, queue: [], door: STREET_PLAN.doors.market.at, viewer: camera, place: () => {}, talk: () => '', drawDistance: 0, fade: 0, onStock: () => {} }));
  }
  add(new Courtyard(dayNight, sceneryAnisotropy()));

  // The sun's shadow fades out at its map's edge into the rows' far shadow, as in the street itself.
  fadeSunShadowEdges(scene, lighting.far);

  const updatables: Updatable[] = items.filter((item): item is THREE.Object3D & Updatable => isUpdatable(item));
  // The air: the street's haze, as its lighting hands it to the street's own scene.
  const tint = new THREE.Color();
  updatables.push({
    update: () => {
      const s = dayNight.state;
      fog.density = airDensity(s);
      fog.color.copy(airColor(s, tint));
    },
  });

  const reflection = new SkyReflection(dome);
  let sinceReflected = REFLECT_EVERY;
  return {
    scene,
    updatables,
    parts: items,
    prepare(renderer, dt) {
      sinceReflected += dt;
      if (scene.environment && sinceReflected < REFLECT_EVERY) return;
      sinceReflected = 0;
      reflection.reset();
      scene.environment = reflection.update(renderer, 0);
    },
    dispose() {
      lighting.setOccupied(false);
      // Not the dome's own `dispose`: it hands the scene's reflection back (`setReflectionSource`), the real street's too.
      for (const item of items) if (item !== dome) (item as { dispose?: () => void }).dispose?.();
      reflection.dispose();
      disposeOutlookScene(scene);
    },
  };
}
