import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { canvasTexture } from '@/graphics/canvas';
import { assemble } from '@/graphics/glslAssemble';
import { markGlass, unmarkGlass } from '@/graphics/glassMask';
import { currentSeason } from '@/time/season';
import { onSurface, WALL } from '../surface/layers';
import { Prop } from '../props/Prop';
import type { DayNight, SkyState } from '../props/DayNight';
import { LINDEN, paintFacades, paintRoad, paintTown, paintTrees } from './lindenPainters';
import VERTEX from './lindenView.vert.glsl?raw';
import fragment from './lindenView.frag.glsl?raw';

/**
 * Where the avenue lies from the glass (m, outwards): our pavement to the near kerb, the roadway, the far kerb and
 * pavement, the facades across; the two rows of plane trees and of lamps along the kerbs; the town past the side street.
 */
const AVENUE = { roadNear: LINDEN.road.near, roadFar: LINDEN.road.far, facades: 21.5, treesNear: 2.4, treesFar: 18.9, lampsNear: 3.1, lampsFar: 18.2, town: 220 };
/** The facades' strip is shifted so the side street's gap falls off to the right of her window. */
const FACADE_SHIFT = 34;
/** The light on the avenue: at night (a blue dark) and at noon. */
const NIGHT_LIGHT = new THREE.Color(0.05, 0.06, 0.1);
const DAY_LIGHT = new THREE.Color(1.0, 0.97, 0.9);
const SUNSET = new THREE.Color(1.0, 0.68, 0.42);
/** The haze per metre: clear air, and what fog and falling rain or snow add. */
const HAZE = { clear: 0.004, fog: 0.05, fall: 0.008 };

/** A define as GLSL reads a float. */
const float = (n: number): string => n.toFixed(3);

const FRAGMENT = assemble(fragment, {
  defines: {
    TS_TOWN_D: float(AVENUE.town),
    TS_TOWN_PERIOD: float(LINDEN.town.period),
    TS_TOWN_H: float(LINDEN.town.height),
    TS_ROAD_NEAR: float(AVENUE.roadNear),
    TS_ROAD_FAR: float(AVENUE.roadFar),
    TS_ROAD_PERIOD: float(LINDEN.road.period),
    TS_FACADE_D: float(AVENUE.facades),
    TS_FACADE_PERIOD: float(LINDEN.facades.period),
    TS_FACADE_H: float(LINDEN.facades.height),
    TS_FACADE_SHIFT: float(FACADE_SHIFT),
    TS_TREE_NEAR_D: float(AVENUE.treesNear),
    TS_TREE_FAR_D: float(AVENUE.treesFar),
    TS_TREE_PERIOD: float(LINDEN.trees.period),
    TS_TREE_H: float(LINDEN.trees.height),
    TS_LAMP_NEAR_D: float(AVENUE.lampsNear),
    TS_LAMP_FAR_D: float(AVENUE.lampsFar),
  },
});

/**
 * LINDEN AVENUE THROUGH MÉMÉ'S WINDOW (docs/story.md "Mémé"): she lives across town, so her window does not show the
 * flat's painted panorama nor Front Street but the avenue two floors down, as layers the eye's ray meets through the
 * pane (`lindenView.frag.glsl`): the town past a side street, the roadway seen from above with its parked cars and a
 * car going by each way, the stone facades across with their lights at night, the plane trees on both kerbs dressed
 * for the season, the lamps' pools after dark, the haze of the hour. Lit by the shared sky (`DayNight`). Placed at the
 * zone's origin (it ticks the traffic); `glass` goes to the `RoomWindow`.
 */
export class LindenView extends Prop implements Updatable {
  readonly glass: THREE.Mesh;
  private readonly uniforms: {
    facades: THREE.IUniform<THREE.Texture>;
    facadeLights: THREE.IUniform<THREE.Texture>;
    trees: THREE.IUniform<THREE.Texture>;
    road: THREE.IUniform<THREE.Texture>;
    town: THREE.IUniform<THREE.Texture>;
    zenith: THREE.IUniform<THREE.Color>;
    horizon: THREE.IUniform<THREE.Color>;
    lit: THREE.IUniform<THREE.Color>;
    night: THREE.IUniform<number>;
    haze: THREE.IUniform<number>;
    snow: THREE.IUniform<number>;
    wet: THREE.IUniform<number>;
    time: THREE.IUniform<number>;
    groundY: THREE.IUniform<number>;
  };
  private readonly unsubscribe: () => void;

  /**
   * A pane `width` x `height`, its middle `paneOverFloor` over her floor, which is `floorOverStreet` over the avenue.
   */
  constructor(dayNight: DayNight, { width, height, paneOverFloor, floorOverStreet = 6.4, seed = 38 }: { width: number; height: number; paneOverFloor: number; floorOverStreet?: number; seed?: number }) {
    super();
    this.name = 'LindenView';
    const { color, lights } = paintFacades(seed);
    this.uniforms = {
      facades: { value: canvasTexture(color, { repeat: true }) },
      facadeLights: { value: canvasTexture(lights, { repeat: true, data: true }) },
      trees: { value: canvasTexture(paintTrees(currentSeason(), seed + 1), { repeat: true }) },
      road: { value: canvasTexture(paintRoad(seed + 2), { repeat: true }) },
      town: { value: canvasTexture(paintTown(seed + 3), { repeat: true }) },
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      lit: { value: new THREE.Color() },
      night: { value: 0 },
      haze: { value: HAZE.clear },
      snow: { value: 0 },
      wet: { value: 0 },
      time: { value: 0 },
      groundY: { value: -(floorOverStreet + paneOverFloor) },
    };
    const material = onSurface(new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT }), WALL.pane);
    this.glass = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    this.glass.name = 'LindenPane';
    this.glass.castShadow = false;
    this.glass.receiveShadow = false;
    markGlass(this.glass);
    this.unsubscribe = dayNight.onChange((sky) => this.light(sky));
    this.light(dayNight.state);
  }

  update(dt: number): void {
    this.uniforms.time.value += dt;
  }

  /** The hour's sky over the avenue: its colours, the light on the stone, the dark, the weather. */
  private light(s: SkyState): void {
    const u = this.uniforms;
    u.zenith.value.copy(s.zenith);
    u.horizon.value.copy(s.horizon);
    const day = THREE.MathUtils.clamp(s.daylight, 0, 1);
    // Low sun: the light goes warm; clouds and rain grey it.
    const low = THREE.MathUtils.smoothstep(day, 0.05, 0.35) * (1 - THREE.MathUtils.smoothstep(day, 0.35, 0.8));
    u.lit.value.copy(NIGHT_LIGHT).lerp(DAY_LIGHT, day).lerp(SUNSET, 0.5 * low * s.sunThrough).multiplyScalar(1 - 0.3 * s.cloudCover * day);
    u.night.value = 1 - THREE.MathUtils.smoothstep(day, 0.05, 0.4);
    u.haze.value = HAZE.clear + HAZE.fog * s.fog + HAZE.fall * Math.max(s.rain, s.snow);
    u.snow.value = s.snowCover;
    u.wet.value = s.wetness;
  }

  dispose(): void {
    this.unsubscribe();
    unmarkGlass(this.glass);
  }
}
