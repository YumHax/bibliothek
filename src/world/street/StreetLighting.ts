import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture, OccupancyAware } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { airColor, airDensity } from './streetAir';

export interface StreetLightingOptions {
  /** Shadow map size of the sun (square). */
  shadowMapSize: number;
  /** Half the side of the square of street the sun's shadow map covers around the player (metres). */
  shadowReach?: number;
}

/** The light's distance from the patch of street it shadows, and its shadow camera's depth. */
const SUN_DISTANCE = 70;
const SHADOW_FAR = 150;
/** The sun's share of the `SkyState` light (tuned for the windows' beams, too strong for a whole street). */
const SUN_SHARE = 0.75;
const GROUND_BOUNCE = new THREE.Color(0x6a6560);
const GLOW = new THREE.Color(0xffb070);

/**
 * The outdoor lighting rig, instead of a `Room`'s: a shadow-casting `DirectionalLight` for the sun
 * (the moon at night), shining from where `SkyState` puts it, its shadow camera a square of street
 * around the player that follows them in whole shadow texels (so the shadows do not crawl); a
 * `HemisphereLight` from the sky's colours, only while the player is out here (it lights the whole
 * scene, like a room's); and the air: it takes over the scene's haze (`graphics/Haze`, which
 * runs before it every frame) with the weather's fog, density and colour, and gives it back when
 * the zone goes. `lightLevel` is what the reflections follow.
 */
export class StreetLighting extends THREE.Group implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  private readonly sun: THREE.DirectionalLight;
  private readonly sky: THREE.HemisphereLight;
  private readonly target = new THREE.Object3D();
  private readonly reach: number;
  private occupied = false;
  private readonly eye = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly lightUp = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly airTint = new THREE.Color();

  constructor(
    private readonly dayNight: DayNight,
    private readonly camera: THREE.Object3D,
    private readonly lightDirection: (out: THREE.Vector3) => THREE.Vector3,
    options: StreetLightingOptions,
  ) {
    super();
    this.name = 'StreetLighting';
    this.reach = options.shadowReach ?? 28;
    this.sun = new THREE.DirectionalLight(0xffffff, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(options.shadowMapSize, options.shadowMapSize);
    const cam = this.sun.shadow.camera;
    cam.left = -this.reach;
    cam.right = this.reach;
    cam.top = this.reach;
    cam.bottom = -this.reach;
    cam.near = 1;
    cam.far = SHADOW_FAR;
    cam.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.sun.target = this.target;
    this.add(this.target, this.sun);

    this.sky = new THREE.HemisphereLight(0xffffff, GROUND_BOUNCE, 0);
    this.add(this.sky);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.sun.shadow.autoUpdate = occupied;
    this.sun.shadow.needsUpdate = true;
    if (!occupied) this.sky.intensity = 0;
  }

  /** How lit the street is: 0 deep night .. 1 full day. */
  lightLevel(): number {
    return THREE.MathUtils.clamp(0.18 + 0.82 * this.dayNight.state.daylight, 0, 1);
  }

  update(): void {
    const s = this.dayNight.state;
    // The sun (or moon), shining at the patch of street around the player.
    this.lightDirection(this.dir);
    this.camera.getWorldPosition(this.eye);
    if (this.parent) this.parent.worldToLocal(this.eye);
    this.eye.y = 0;
    this.snapToTexels(this.eye);
    this.target.position.copy(this.eye);
    this.sun.position.copy(this.eye).addScaledVector(this.dir, SUN_DISTANCE);
    this.sun.color.copy(s.lightColor);
    this.sun.intensity = s.lightIntensity * SUN_SHARE;

    // The sky's ambient: its hue, brighter by day, a moonlit trace at night; a flash in a storm.
    if (this.occupied) {
      this.sky.color.copy(s.ambient).lerp(s.zenith, 0.25);
      this.sky.groundColor.copy(GROUND_BOUNCE).lerp(GLOW, 0.2 * (1 - s.daylight));
      this.sky.intensity = 0.14 + 1.05 * s.daylight + 1.4 * s.lightning;
      this.applyAir();
    }
  }

  /** Takes the scene's haze over: the weather's density, the air's colour (see `streetAir`). */
  private applyAir(): void {
    let root: THREE.Object3D = this;
    while (root.parent) root = root.parent;
    const fog = (root as THREE.Scene).fog as THREE.FogExp2 | null | undefined;
    if (!fog || !('density' in fog)) return;
    const s = this.dayNight.state;
    fog.density = airDensity(s);
    fog.color.copy(airColor(s, this.airTint));
  }

  /** Moves `point` to the nearest whole shadow texel in the light's view, so the map does not shimmer as the player walks. */
  private snapToTexels(point: THREE.Vector3): void {
    const texel = (2 * this.reach) / this.sun.shadow.mapSize.x;
    this.forward.copy(this.dir).negate();
    this.right.set(0, 1, 0).cross(this.forward);
    if (this.right.lengthSq() < 1e-6) this.right.set(1, 0, 0);
    this.right.normalize();
    this.lightUp.copy(this.forward).cross(this.right).normalize();
    const a = Math.round(point.dot(this.right) / texel) * texel;
    const b = Math.round(point.dot(this.lightUp) / texel) * texel;
    const c = point.dot(this.forward);
    point.copy(this.right).multiplyScalar(a).addScaledVector(this.lightUp, b).addScaledVector(this.forward, c);
  }
}
