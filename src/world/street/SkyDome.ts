import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture, OccupancyAware } from '../Furniture';
import { setReflectionSource } from '@/graphics/Environment';
import { SkyReflection } from './SkyReflection';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '@/time/wakefulness';
import { skyDirection } from './skyDirection';
import { airColor, nightnessOf } from './streetAir';
import { DOME_MOON_RADIUS, SKY_DOME_FRAGMENT, SKY_DOME_VERTEX } from './skyDomeShader';
import { MOON_SHADOW_OFFSET } from '../city/skyGlsl';
import { RENDER_ORDER } from '../surface/layers';
import { SKYLINE_COLUMNS, SKYLINE_TOP, SkylineSilhouette } from './SkylineSilhouette';

/** Inside the camera's far plane (100 m). */
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
    };
    super(
      new THREE.SphereGeometry(RADIUS, 48, 24),
      new THREE.ShaderMaterial({ uniforms, defines: { SKYLINE_COLUMNS: SKYLINE_COLUMNS.toFixed(1) }, vertexShader: SKY_DOME_VERTEX, fragmentShader: SKY_DOME_FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false }),
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
    setReflectionSource(occupied ? this.reflection : null);
    if (!occupied) this.reflection.reset();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    // Centred on the eye: the zone's group only translates, so local = world - its origin.
    this.camera.getWorldPosition(this.eye);
    if (this.parent) this.parent.worldToLocal(this.eye);
    this.position.copy(this.eye);
    this.skyline.update(this.eye);

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
    u.sunVisible!.value = THREE.MathUtils.smoothstep(s.sunHeight, -0.1, 0.02);
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
    // Lightning: the window panes' bolt (a random bearing each strike; only the nearer ones show theirs).
    u.lightning!.value = s.lightning;
    if (s.strikes !== this.strikes) {
      this.strikes = s.strikes;
      skyDirection(0, Math.random() * Math.PI * 2, u.boltDir!.value as THREE.Vector3);
      u.boltSeed!.value = Math.random() * 100;
      u.boltReach!.value = 1 - THREE.MathUtils.smoothstep(s.strikeDistance, 1200, 3500);
    }
  }

  dispose(): void {
    setReflectionSource(null);
    this.reflection.dispose();
    this.skyline.dispose();
  }
}
