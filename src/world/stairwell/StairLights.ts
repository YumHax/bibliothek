import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { Furniture, OccupancyAware } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { STAIRWELL_PLAN as plan, STOREY, STOREYS, landingY } from './stairwellPlan';

export interface StairLightsOptions {
  /** The eye: the real lights follow the landings nearest to it. */
  viewer: THREE.Object3D;
}

/** How many real lights follow the player, their candela and reach (a lamp never lights a landing two floors off). */
const LIGHTS = 2;
const INTENSITY = 9;
const REACH = 6.5;
const WARM = new THREE.Color(0xffd9a8);
const TOP = landingY(0) + 2.8;
/** Seconds the lights take to come up once the player is in (the stair lights' sensor), and to go down after. */
const RAMP = 0.6;

/**
 * The stairwell's light: a frosted globe on every landing's wall and over the hall, glowing while
 * someone is on the stairs (a sensor, like the building's timer lights) and dark otherwise; two
 * real point lights (no shadow; never added or removed) that move to the globes nearest the
 * player, dimmed to 0 while nobody is here (the lights ignore walls, so they must not shine into
 * the flat); a hemisphere for the soft light bouncing down the shaft, on only while occupied; and
 * the skylight in the roof, as bright as the sky. `lightLevel` is what the reflections follow.
 */
export class StairLights extends THREE.Group implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  private readonly bulbs: THREE.PointLight[] = [];
  private readonly spots: THREE.Vector3[] = [];
  private readonly order: number[];
  private readonly globes: THREE.MeshBasicMaterial;
  private readonly sky: THREE.MeshBasicMaterial;
  private readonly ambient: THREE.HemisphereLight;
  private readonly eye = new THREE.Vector3();
  private occupied = false;
  private on = 0;
  private chooseClock = 0;

  constructor(private readonly dayNight: DayNight, private readonly options: StairLightsOptions) {
    super();
    this.name = 'StairLights';
    const half = STOREY / 2;
    const { shaft, hall, floorLanding, halfLanding } = plan;
    const mid = (shaft.x0 + shaft.x1) / 2 - 0.4;
    for (let k = 0; k <= STOREYS; k++) this.spots.push(new THREE.Vector3(mid, landingY(k) + 2.35, floorLanding.z1 - 0.07));
    for (let k = 0; k < STOREYS; k++) this.spots.push(new THREE.Vector3(mid, landingY(k) - half + 2.35, halfLanding.z0 + 0.07));
    this.spots.push(new THREE.Vector3((hall.x0 + hall.x1) / 2, hall.height - 0.12, (hall.z0 + hall.z1) / 2));
    this.spots.push(new THREE.Vector3((plan.strip.x0 + plan.strip.x1) / 2, landingY(0) + plan.strip.ceiling - 0.1, (plan.strip.z0 + plan.strip.z1) / 2));
    this.order = this.spots.map((_, i) => i);

    this.globes = new THREE.MeshBasicMaterial({ color: WARM.clone() });
    const globe = mergeGeometries(this.spots.map((p) => new THREE.SphereGeometry(0.11, 12, 8).translate(p.x, p.y, p.z)))!;
    this.add(new THREE.Mesh(globe, this.globes));

    // The skylight over the well.
    this.sky = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const skylight = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4).rotateX(Math.PI / 2), this.sky);
    skylight.position.set((plan.well.x0 + plan.well.x1) / 2, TOP - 0.01, (plan.well.z0 + plan.well.z1) / 2);
    this.add(skylight);

    for (let i = 0; i < LIGHTS; i++) {
      const bulb = new THREE.PointLight(WARM, 0, REACH, 2);
      bulb.castShadow = false;
      bulb.position.copy(this.spots[i]!);
      this.bulbs.push(bulb);
      this.add(bulb);
    }
    this.ambient = new THREE.HemisphereLight(0xfff1dc, 0x7a6a58, 0);
    this.add(this.ambient);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
  }

  /** How lit the stairwell is, 0 dark .. 1 bright: the lights once on, a little daylight from the roof. */
  lightLevel(): number {
    return THREE.MathUtils.clamp(0.25 + 0.5 * this.on + 0.25 * this.dayNight.state.daylight, 0, 1);
  }

  update(dt: number): void {
    const target = this.occupied ? 1 : 0;
    this.on += THREE.MathUtils.clamp(target - this.on, -dt / RAMP, dt / RAMP);
    const s = this.dayNight.state;
    this.globes.color.copy(WARM).multiplyScalar(0.12 + 1.6 * this.on);
    this.sky.color.copy(s.zenith).lerp(s.horizon, 0.4).multiplyScalar(0.25 + 1.1 * s.daylight);
    this.ambient.intensity = this.occupied ? 0.1 + 0.45 * this.on + 0.2 * s.daylight : 0;
    for (const bulb of this.bulbs) bulb.intensity = INTENSITY * this.on;
    this.chooseClock -= dt;
    if (this.chooseClock > 0 || !this.occupied) return;
    this.chooseClock = 0.25;
    this.options.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    const eye = this.eye;
    const spots = this.spots;
    this.order.sort((a, b) => spots[a]!.distanceToSquared(eye) - spots[b]!.distanceToSquared(eye));
    for (let i = 0; i < this.bulbs.length; i++) this.bulbs[i]!.position.copy(spots[this.order[i]!]!);
  }
}
