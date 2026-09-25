import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '../props/outdoors/wakefulness';
import { skyDirection } from './skyDirection';
import { airColor, nightnessOf } from './streetAir';
import { SKY_DOME_FRAGMENT, SKY_DOME_VERTEX } from './skyDomeShader';

/** Inside the camera's far plane (100 m). */
const RADIUS = 90;
const GLOW = new THREE.Color(0xf08a3a);
const CITY_LIT_CLOUD = new THREE.Color(0x6a4a3a);
const CLOUD_DRIFT = 0.0025;

/**
 * The sky over the street: a big inverted sphere that follows the camera, drawn first and behind
 * everything, with its own shader fed from the `SkyState` (zenith-to-horizon gradient, the glow
 * of sunrise and sunset, the sun and moon discs where the windows show them, stars at night,
 * drifting clouds closing into a grey sheet, the far city's skyline with its windows lit through
 * the night, the haze and fog). Lightning needs nothing of its own: the state already flashes the
 * sky's colours. No light, no shadow, one draw call.
 */
export class SkyDome extends THREE.Mesh implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly eye = new THREE.Vector3();

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
      moonDir: { value: new THREE.Vector3(0, 1, 0) },
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
    };
    super(
      new THREE.SphereGeometry(RADIUS, 48, 24),
      new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_DOME_VERTEX, fragmentShader: SKY_DOME_FRAGMENT, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }),
    );
    this.uniforms = uniforms;
    this.name = 'SkyDome';
    this.frustumCulled = false;
    this.renderOrder = -1000;
    this.castShadow = false;
    this.receiveShadow = false;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    // Centred on the eye: the zone's group only translates, so local = world - its origin.
    this.camera.getWorldPosition(this.eye);
    if (this.parent) this.parent.worldToLocal(this.eye);
    this.position.copy(this.eye);

    const s = this.dayNight.state;
    const u = this.uniforms;
    (u.zenith!.value as THREE.Color).copy(s.zenith);
    (u.horizon!.value as THREE.Color).copy(s.horizon);
    u.horizonGlow!.value = s.horizonGlow;
    skyDirection(0, s.sunAzimuth, u.glowDir!.value as THREE.Vector3);
    skyDirection(s.sunElevation, s.sunAzimuth, u.sunDir!.value as THREE.Vector3);
    skyDirection(s.moonElevation, s.moonAzimuth, u.moonDir!.value as THREE.Vector3);
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
  }
}
