import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Haze } from '@/graphics/Haze';
import type { ActivityAware, Furniture, OccupancyAware } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { airColor, airDensity } from './streetAir';
import { ShadowRefresh } from '../lighting/shadowRefresh';
import { snapDirection } from '../props/shadowTexels';

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
/** Per second: the sky's ambient comes and goes this fast as the player steps out of the sas or back in (no pop). */
const SKY_RATE = 3;
/**
 * The height (m) of the tallest casters whose shadows should not crawl: the sun's direction moves in
 * steps that shift their shadow tips by a texel (a lamp post's, a tree's), not a little every notice
 * of the sky (the edges of every shadow would creep along the pavement).
 */
const CASTER_HEIGHT = 8;

/**
 * The outdoor lighting rig, instead of a `Room`'s: a shadow-casting `DirectionalLight` for the sun
 * (the moon at night), shining from where `SkyState` puts it, its shadow camera a square of street
 * around the player that follows them in whole shadow texels (so the shadows do not crawl); a
 * `HemisphereLight` from the sky's colours, only while the player is out here (it lights the whole
 * scene, like a room's), eased in and out; and the air: it hands the scene's haze (`graphics/Haze`,
 * the fog's one writer) the weather's density and colour while the player is out here, and gives
 * it back when they leave (the haze eases to either). `lightLevel` is what the reflections follow.
 */
export class StreetLighting extends THREE.Group implements Furniture, Updatable, OccupancyAware, ActivityAware {
  readonly contactShadow = false;
  private readonly sun: THREE.DirectionalLight;
  private readonly sky: THREE.HemisphereLight;
  private readonly target = new THREE.Object3D();
  private readonly reach: number;
  /** When the sun's map is redrawn: at `QUALITY.shadowRefreshHz` while the player is in the street, else never. */
  private readonly sunShadow: ShadowRefresh;
  private occupied = false;
  /** The sky's steady ambient, eased (the lightning's flash comes on top at once). */
  private skyLevel = 0;
  private readonly eye = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly rawDir = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly lightUp = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly airTint = new THREE.Color();
  /** The scene's haze, found the first time the street is occupied (null outside a scene with one). */
  private haze: Haze | null = null;

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
    this.sunShadow = new ShadowRefresh(this.sun);

    this.sky = new THREE.HemisphereLight(0xffffff, GROUND_BOUNCE, 0);
    this.add(this.sky);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.sunShadow.setLive(occupied);
    // The sky's ambient eases out in `update` (the zone may stay active a while: the sas next door).
    if (!occupied) this.haze?.setAir(null);
  }

  /** Out of the loop, the easing stops: the ambient goes at once (it lights the whole scene) and the air is given back. */
  setZoneActive(active: boolean): void {
    if (active) return;
    this.skyLevel = 0;
    this.sky.intensity = 0;
    this.haze?.setAir(null);
  }

  /** How lit the street is: 0 deep night .. 1 full day. */
  lightLevel(): number {
    return THREE.MathUtils.clamp(0.18 + 0.82 * this.dayNight.state.daylight, 0, 1);
  }

  update(dt: number): void {
    this.sunShadow.update(dt);
    const s = this.dayNight.state;
    // The sun (or moon), shining at the patch of street around the player.
    this.lightDirection(this.rawDir);
    const texel = (2 * this.reach) / this.sun.shadow.mapSize.x;
    snapDirection(this.rawDir, texel / CASTER_HEIGHT, this.dir);
    this.camera.getWorldPosition(this.eye);
    if (this.parent) this.parent.worldToLocal(this.eye);
    this.eye.y = 0;
    this.snapToTexels(this.eye);
    this.target.position.copy(this.eye);
    this.sun.position.copy(this.eye).addScaledVector(this.dir, SUN_DISTANCE);
    this.sun.color.copy(s.lightColor);
    this.sun.intensity = s.lightIntensity * SUN_SHARE;

    // The sky's ambient: its hue, brighter by day, a moonlit trace at night; a flash in a storm (at once).
    const ease = 1 - Math.exp(-SKY_RATE * dt);
    if (this.occupied) {
      this.sky.color.copy(s.ambient).lerp(s.zenith, 0.25);
      this.sky.groundColor.copy(GROUND_BOUNCE).lerp(GLOW, 0.2 * (1 - s.daylight));
      const steady = 0.14 + 1.05 * s.daylight;
      const flash = 1.4 * s.lightning;
      this.skyLevel += (steady - this.skyLevel) * ease;
      this.sky.intensity = this.skyLevel + flash;
      this.applyAir();
    } else if (this.skyLevel > 0) {
      this.skyLevel = this.skyLevel < 1e-3 ? 0 : this.skyLevel * (1 - ease);
      this.sky.intensity = this.skyLevel;
    }
  }

  /** Hands the scene's haze the weather's density and the air's colour (see `streetAir`); it eases to them. */
  private applyAir(): void {
    if (!this.haze) {
      let root: THREE.Object3D = this;
      while (root.parent) root = root.parent;
      this.haze = (root as THREE.Scene).isScene ? Haze.of(root as THREE.Scene) : null;
    }
    const s = this.dayNight.state;
    this.haze?.setAir(airDensity(s), airColor(s, this.airTint));
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
