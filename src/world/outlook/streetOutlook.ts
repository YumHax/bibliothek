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
import { FACADES, type FacadeSpec, type Vec2 } from '../street/streetPlan';
import type { WindowLife } from '../street/windowLife';
import { Courtyard } from './Courtyard';
import { COURTYARD_YARD } from './outlookPlan';
import { disposeOutlookScene, type OutlookContents } from './OutlookView';
import type { HomeUpgrades } from '@/economy/HomeUpgrades';

export interface StreetOutlookOptions {
  dayNight: DayNight;
  /** Where the sun (the moon) is, as the window view has it (`Outdoors.lightDirection`). */
  lightDirection: (out: THREE.Vector3) => THREE.Vector3;
  /** Where the window is in the street's frame: the facades within reach of it, facing it, are built. */
  eye: Vec2;
  /** Facades not built: the one the window is in (its back would stand between the eye and the view). */
  without: readonly string[];
  /** Whose homes the lit windows are and the stories behind them (`building/rearWindows`); none: the curfews. */
  windowLife?: WindowLife;
  /** What the flat has bought: our balcony's plants and bistro set show as in the street (none: all shown). */
  upgrades?: HomeUpgrades;
}

/** How far from the window a facade is built (m), and within what distance it is painted at the street's finest. */
const REACH = 110;
const FINE_WITHIN = 35;
const FINE_DETAIL = 34;
/** Real lights among the street lamps, following the ones nearest the window (none on low). */
const LAMP_LIGHTS = { high: 2, medium: 2, low: 0 } as const;
/** Real seconds between two prefilters of the sky for what the view's glass and paint reflect. */
const REFLECT_EVERY = 20;

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
export function buildStreetOutlook(camera: THREE.Camera, options: StreetOutlookOptions): OutlookContents {
  const { dayNight, lightDirection, eye, without, windowLife, upgrades } = options;
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

  const lighting = add(new StreetLighting(dayNight, camera, lightDirection, { shadowMapSize: QUALITY.level === 'high' ? 2048 : 1024, shadowReach: 32 }));
  lighting.setOccupied(true);
  const dome = add(new SkyDome(dayNight, camera));
  // The street's own scenery (`street/streetScenery`): ground, park, the facades facing the window with their relief,
  // lamps, trees (the courtyard's chestnut among them), parked and passing cars, furniture. No colliders, no manoeuvres.
  const detailScale = QUALITY.level === 'low' ? 0.6 : 1;
  const { buildings } = buildStreetBase(add, { dayNight, facades: facadesInView(eye, without), detailScale, shopGoods: null, ...(windowLife ? { windowLife } : {}) });
  buildStreetFronts(add, buildings.fronts, dayNight, upgrades ? { upgrades } : {});
  const traffic = add(new StreetTraffic());
  buildStreetFixtures(add, { dayNight, viewer: camera, traffic, lampLights: LAMP_LIGHTS[QUALITY.level], moreTrees: [COURTYARD_YARD.chestnut] });
  add(new Precipitation(dayNight));
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

/**
 * The facades seen from `eye`: within `REACH` of it, their face turned towards it, less `without`; the near ones
 * painted as finely as the street's nearest (a courtyard's rear building is seen from 15 m, not from the far pavement).
 */
export function facadesInView(eye: Vec2, without: readonly string[]): FacadeSpec[] {
  const [ex, ez] = eye;
  const seen: FacadeSpec[] = [];
  for (const spec of FACADES) {
    if (without.includes(spec.id)) continue;
    const [ax, az] = spec.from;
    const dx = spec.to[0] - ax;
    const dz = spec.to[1] - az;
    const length = Math.hypot(dx, dz);
    // Its face is the left-hand normal of from -> to.
    if (-dz * (ex - ax) + dx * (ez - az) <= 0) continue;
    const t = THREE.MathUtils.clamp(((ex - ax) * dx + (ez - az) * dz) / (length * length), 0, 1);
    const distance = Math.hypot(ax + dx * t - ex, az + dz * t - ez);
    if (distance > REACH) continue;
    seen.push(distance < FINE_WITHIN ? { ...spec, detail: Math.max(spec.detail, FINE_DETAIL) } : spec);
  }
  return seen;
}
