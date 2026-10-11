import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture, OccupancyAware } from '../Furniture';
import { clearReflectionSource, setReflectionSource } from '@/graphics/Environment';
import { SkyReflection } from './SkyReflection';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '@/time/wakefulness';
import { skyDirection } from './skyDirection';
import { airColor, nightnessOf } from './streetAir';
import { DOME_MOON_RADIUS, SKY_DOME_FRAGMENT, SKY_DOME_VERTEX } from './skyDomeShader';
import { MOON_SHADOW_OFFSET } from '../city/skyGlsl';
import { RENDER_ORDER } from '../surface/layers';
import { SKYLINE_COLUMNS, SKYLINE_TOP, SkylineSilhouette } from './SkylineSilhouette';
import { BACKDROP_BLOCKS, BACKDROP_WALLS } from '../city/skyline';
import { FLAT_IN_STREET } from '@/world/measures/street';
import { markShared } from '../materials/sharedResources';
import { random } from '@/random';

/** Inside the camera's far plane (220 m, `core/Engine` `FAR`); the dome follows the eye, so 90 m is enough. */
const RADIUS = 90;
const GLOW = new THREE.Color(0xf08a3a);
const CITY_LIT_CLOUD = new THREE.Color(0x6a4a3a);
const CLOUD_DRIFT = 0.0025;

/**
 * The sky over the street: a big inverted sphere that follows the camera, drawn first and behind
 * everything, with its own shader fed from the `SkyState` (zenith-to-horizon gradient, the glow
 * of sunrise and sunset, the sun and moon discs where the windows show them, stars at night,
 * drifting clouds closing into a grey sheet, the far city on the horizon with its windows lit
 * through the night (a low row of roofs, and the window view's towers where they stand, seen from
 * the player: `SkylineSilhouette`, their aviation beacons blinking at night), the haze and fog, and in a storm the
 * window panes' lightning (the flash in the clouds, the bolt towards a random bearing). No light, no shadow, one draw call, the last of the opaque ones.
 */
export class SkyDome extends THREE.Mesh implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly eye = new THREE.Vector3();
  private readonly skyline = new SkylineSilhouette();
  /** The strikes seen so far (a new one reseeds the bolt). */
  private strikes = -1;
  /** The facades' material when they are reflected (`reflectRows`): its night glow is the reflected windows'. */
  private rowsLit: THREE.MeshStandardMaterial | null = null;
  private readonly wallLight = new THREE.Color();
  private readonly sunPart = new THREE.Color();
  /** Seconds to the next airliner over the street, and how long the one up there takes to cross. */
  private planeWait = 40 + random() * 80;
  private planeTime = 0;
  private planeLength = 0;
  /** This sky, prefiltered: what the street's glass, paint and puddles reflect while the player is out here. */
  private readonly reflection: SkyReflection;

  constructor(
    private readonly dayNight: DayNight,
    private readonly camera: THREE.Object3D,
  ) {
    const uniforms: Record<string, THREE.IUniform> = {
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      glowColor: { value: GLOW.clone() },
      glowDir: { value: new THREE.Vector3(0, 0, 1) },
      horizonGlow: { value: 0 },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() },
      sunVisible: { value: 0 },
      sunLow: { value: 0 },
      moonDir: { value: new THREE.Vector3(0, 1, 0) },
      moonShadowDir: { value: new THREE.Vector3(0, 1, 0) },
      moonVisibility: { value: 0 },
      starAlpha: { value: 0 },
      cloudCover: { value: 0 },
      cloudTint: { value: new THREE.Color() },
      cloudDrift: { value: new THREE.Vector2() },
      fog: { value: 0 },
      fogColor: { value: new THREE.Color() },
      cityGlow: { value: 0 },
      nightness: { value: 0 },
      wakefulness: { value: 1 },
      skyline: { value: null },
      skylineTop: { value: SKYLINE_TOP },
      towerColors: { value: [] },
      beaconTime: { value: 0 },
      lightning: { value: 0 },
      boltDir: { value: new THREE.Vector3(0, 0, 1) },
      boltSeed: { value: 0 },
      boltReach: { value: 0 },
      blocks: { value: backdropTexture() },
      blockEye: { value: new THREE.Vector3() },
      planeFrom: { value: new THREE.Vector3(1, 0.5, 0).normalize() },
      planeTo: { value: new THREE.Vector3(-1, 0.5, 0).normalize() },
      planeT: { value: -1 },
      planeTrail: { value: 0 },
      planeBlink: { value: 0 },
      blockWalls: { value: BACKDROP_WALLS.map((hex) => new THREE.Color(hex)) },
    };
    super(
      new THREE.SphereGeometry(RADIUS, 48, 24),
      new THREE.ShaderMaterial({ uniforms, defines: { SKYLINE_COLUMNS: SKYLINE_COLUMNS.toFixed(1), BLOCKS: String(BACKDROP_BLOCKS.length) }, vertexShader: SKY_DOME_VERTEX, fragmentShader: SKY_DOME_FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.uniforms = uniforms;
    uniforms.skyline!.value = this.skyline.texture;
    uniforms.towerColors!.value = this.skyline.colors;
    this.name = 'SkyDome';
    this.frustumCulled = false;
    // Drawn after everything opaque, on the far plane with the depth test on: its clouds (five octaves of
    // noise) are only worked out where the sky is actually seen, not under every facade in front of it.
    this.renderOrder = RENDER_ORDER.overlay;
    this.castShadow = false;
    this.receiveShadow = false;
    this.reflection = new SkyReflection(this);
  }

  /** Out here, the scene reflects this sky (`Environment`); back inside, the look's own again. */
  setOccupied(occupied: boolean): void {
    // Leaving (or placed in a zone loading out of sight): only our own source is let go, never a room's (`RoomReflection`).
    if (occupied) setReflectionSource(this.reflection);
    else clearReflectionSource(this.reflection);
    if (!occupied) this.reflection.reset();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /**
   * The street's facades (`Buildings`) in what the street reflects (`SkyReflection.withRows`): taken again each time
   * the eye has walked `moveEvery` metres.
   */
  reflectRows(buildings: THREE.Mesh, moveEvery: number): void {
    this.reflection.withRows(buildings, moveEvery);
    this.rowsLit = (buildings.material as THREE.MeshStandardMaterial);
  }

  update(dt: number): void {
    // Centred on the eye: the zone's group only translates, so local = world - its origin.
    this.camera.getWorldPosition(this.eye);
    if (this.rowsLit) this.lightRows();
    if (this.parent) this.parent.worldToLocal(this.eye);
    this.position.copy(this.eye);
    this.skyline.update(this.eye);
    (this.uniforms.blockEye!.value as THREE.Vector3).copy(this.eye);

    const s = this.dayNight.state;
    const u = this.uniforms;
    (u.zenith!.value as THREE.Color).copy(s.zenith);
    (u.horizon!.value as THREE.Color).copy(s.horizon);
    u.horizonGlow!.value = s.horizonGlow;
    skyDirection(0, s.sunAzimuth, u.glowDir!.value as THREE.Vector3);
    skyDirection(s.sunElevation, s.sunAzimuth, u.sunDir!.value as THREE.Vector3);
    skyDirection(s.moonElevation, s.moonAzimuth, u.moonDir!.value as THREE.Vector3);
    // The crescent, as the window view has it (its shadow disc offset by moon radii).
    skyDirection(s.moonElevation + MOON_SHADOW_OFFSET.pitch * DOME_MOON_RADIUS, s.moonAzimuth + MOON_SHADOW_OFFSET.yaw * DOME_MOON_RADIUS, u.moonShadowDir!.value as THREE.Vector3);
    u.sunLow!.value = 1 - THREE.MathUtils.smoothstep(s.sunHeight, 0, 0.3);
    (u.sunColor!.value as THREE.Color).copy(s.night ? GLOW : s.lightColor);
    u.sunVisible!.value = THREE.MathUtils.smoothstep(s.sunHeight, -0.1, 0.02) * s.sunThrough;
    u.moonVisibility!.value = s.moonVisibility;
    const skyNight = 1 - THREE.MathUtils.smoothstep(s.sunHeight, -0.12, 0.3);
    u.starAlpha!.value = skyNight > 0.05 ? skyNight * skyNight * 0.9 : 0;
    u.cloudCover!.value = s.cloudCover;
    const nightness = nightnessOf(s);
    const dusk = 1 - THREE.MathUtils.smoothstep(s.sunHeight, 0.05, 0.4);
    const brightness = THREE.MathUtils.lerp(0.35, 1, s.daylight);
    (u.cloudTint!.value as THREE.Color)
      .setRGB(1, 1, 1)
      .lerp(s.horizon, 0.35 * dusk)
      .lerp(CITY_LIT_CLOUD, THREE.MathUtils.smoothstep(nightness, 0.3, 0.9))
      .multiplyScalar(brightness * (1 - 0.35 * s.cloudCover));
    const drift = u.cloudDrift!.value as THREE.Vector2;
    drift.x = (drift.x + dt * CLOUD_DRIFT * (0.4 + s.wind)) % 100;
    drift.y = (drift.y + dt * CLOUD_DRIFT * 0.3) % 100;
    u.fog!.value = Math.min(1, s.fog + 0.35 * Math.max(s.rain, s.snow));
    airColor(s, u.fogColor!.value as THREE.Color);
    u.cityGlow!.value = nightness * (0.45 + 0.9 * s.cloudCover);
    u.nightness!.value = nightness;
    u.wakefulness!.value = wakefulnessAt(s.hours);
    u.beaconTime!.value = (u.beaconTime!.value + dt) % 1000;
    this.fly(dt);
    // Lightning: the window panes' bolt (a random bearing each strike; only the nearer ones show theirs).
    u.lightning!.value = s.lightning;
    if (s.strikes !== this.strikes) {
      this.strikes = s.strikes;
      skyDirection(0, random() * Math.PI * 2, u.boltDir!.value as THREE.Vector3);
      u.boltSeed!.value = random() * 100;
      u.boltReach!.value = 1 - THREE.MathUtils.smoothstep(s.strikeDistance, 1200, 3500);
    }
  }

  /**
   * How the reflected rows are lit: what a white wall gives back under the street's rig (`StreetLighting`: the sky's
   * hemisphere and the sun at a slant, over pi), and the windows as bright as the facades' own night glow.
   */
  private lightRows(): void {
    const s = this.dayNight.state;
    const sky = 0.14 + 1.05 * s.daylight;
    this.sunPart.copy(s.lightColor).multiplyScalar(0.75 * s.lightIntensity * 0.45);
    this.wallLight.copy(s.ambient).multiplyScalar(sky).add(this.sunPart).multiplyScalar(1 / Math.PI);
    this.reflection.light(this.eye, this.wallLight, this.rowsLit?.emissiveIntensity ?? 0);
  }

  /**
   * Now and then an airliner crosses high over the street: from a bearing to about the opposite one, 25 to 60
   * degrees up, in a minute and a half; its contrail lasts longer in humid air (more cloud about) and none forms in
   * rain, fog or at night (its lights blink instead). A new one every two to six minutes.
   */
  private fly(dt: number): void {
    const u = this.uniforms;
    const s = this.dayNight.state;
    if (this.planeLength > 0) {
      this.planeTime += dt;
      u.planeT!.value = this.planeTime / this.planeLength;
      u.planeBlink!.value = (this.planeTime % 1.3) < 0.08 ? 1 : 0;
      if (this.planeTime < this.planeLength * 1.6) return;
      // Its trail has gone too: the next one later.
      this.planeLength = 0;
      u.planeT!.value = -1;
      this.planeWait = 120 + random() * 240;
      return;
    }
    this.planeWait -= dt;
    if (this.planeWait > 0) return;
    const az = random() * Math.PI * 2;
    skyDirection(0.45 + random() * 0.35, az, u.planeFrom!.value as THREE.Vector3);
    skyDirection(0.45 + random() * 0.6, az + Math.PI + (random() - 0.5) * 0.9, u.planeTo!.value as THREE.Vector3);
    this.planeLength = 80 + random() * 40;
    this.planeTime = 0;
    const humid = THREE.MathUtils.clamp(0.25 + s.cloudCover * 0.9, 0, 1) * (1 - Math.max(s.rain, s.snow, s.fog));
    u.planeTrail!.value = humid > 0.2 ? 0.15 + 0.7 * humid : 0;
  }

  dispose(): void {
    clearReflectionSource(this.reflection);
    this.reflection.dispose();
    this.skyline.dispose();
  }
}

let backdrop: THREE.DataTexture | null = null;

/**
 * The backdrop blocks (`city/skyline` BACKDROP_BLOCKS) for the dome's shader, in the street's frame: a
 * float texture two rows high, a column a block (row 0 its footprint x0, z0, x1, z1; row 1 its height,
 * its facing, a seed for its windows). Built once, shared by every dome (the street's, the windows').
 */
function backdropTexture(): THREE.DataTexture {
  if (backdrop) return backdrop;
  const n = BACKDROP_BLOCKS.length;
  const data = new Float32Array(n * 2 * 4);
  BACKDROP_BLOCKS.forEach((b, i) => {
    data.set([b.x0 + FLAT_IN_STREET.x, b.z0 + FLAT_IN_STREET.z, b.x1 + FLAT_IN_STREET.x, b.z1 + FLAT_IN_STREET.z], i * 4);
    data.set([b.height, b.wall, i * 13.7 + 3, 0], (n + i) * 4);
  });
  const texture = new THREE.DataTexture(data, n, 2, THREE.RGBAFormat, THREE.FloatType);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  backdrop = markShared(texture);
  return backdrop;
}
