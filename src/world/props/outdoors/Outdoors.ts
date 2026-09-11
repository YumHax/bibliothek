import * as THREE from 'three';
import { seededRandom } from '@/covers/generated/canvasUtils';
import type { DayNight, SkyState } from '../DayNight';
import { Sheet } from './Sheet';
import { paintSkyDetail } from './SkyDetail';
import { paintSkyline } from './Skyline';
import { paintBackdrops, paintFrontBlock } from './Facades';
import { paintPark } from './Park';
import { paintStreet } from './Street';
import { Life } from './Life';
import { fragmentShader, vertexShader } from './shader';
import { wakefulnessAt } from './wakefulness';

export interface OutdoorsOptions {
  /**
   * `rotationY` of the primary window's mount. `DayNight` expresses the sun's azimuth against that
   * window's outward normal; this turns it into a world direction every window agrees on.
   */
  primaryRotationY: number;
  /**
   * Distance of the scenery in metres. The sky is at infinity, but the scenery sits on a sphere of
   * this radius around `center`, so it slides less than the window frame as you walk, like a real
   * view does. Default 40.
   */
  sceneryDistance?: number;
  /** Centre of the scenery sphere (the room's middle). Default (0, 1.2, 0). */
  center?: THREE.Vector3;
}

/** How much the moon's shadow disc is offset from the moon (yaw, pitch), for the crescent. */
const MOON_SHADOW_OFFSET = { yaw: -0.024, pitch: 0.012 };

/**
 * The world outside the windows: one 360° view shared by every window, painted once at
 * construction. Panes render it with `material`, which casts the eye ray through the pane:
 * neighbouring windows show adjacent parts of the same view, and walking gives a gentle,
 * believable parallax (the sky is at infinity, the scenery on a sphere `sceneryDistance` away).
 *
 * The neighbourhood (see `plan.ts`) is seen from a sixth floor at a street corner: across Front
 * Street, outside the front wall, a row of old mid-rise facades with shops, awnings and parked
 * cars, and the towers of the skyline rising behind their roofs; across Park Street, outside the
 * left wall, a park (lawn, gravel paths, a pond, a bandstand, a hundred-odd trees) with mid-rise
 * blocks and further, hazier towers beyond it. Everything is drawn in true perspective from that
 * eye, far to near, onto the `Sheet`: day colours, the lights that come on at night, how much each
 * surface mirrors the sky and how far away it is. Everything that changes with the time of day is a
 * uniform: sky gradient colours, the sunrise/sunset glow, the sun's tint on the scenery, how dark
 * the night is, star, cloud and light strength, the sun and the moon (drawn analytically exactly
 * where the room's light comes from), and how awake the city is (`wakefulnessAt`: the windows go
 * out one by one after ten, the small hours are dark but for street lamps, signs and a few
 * insomniacs). So the cycle costs the GPU a few extra instructions per pane pixel and the CPU
 * nothing. The only thing that moves is `Life`: cars and pedestrians as sprites the shader draws
 * over the scenery, advanced by `update()` (called by the window that drives the clock), sparser
 * as the city sleeps.
 */
export class Outdoors {
  /** Pane material: samples the view along the ray from the camera through the pane. */
  readonly material: THREE.ShaderMaterial;
  /** The traffic and the passers-by. */
  readonly life: Life;

  private readonly primaryQuaternion: THREE.Quaternion;
  private readonly scratchColor = new THREE.Color();

  constructor(
    readonly dayNight: DayNight,
    options: OutdoorsOptions,
  ) {
    this.primaryQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), options.primaryRotationY);
    const random = seededRandom(1987);

    const sheet = new Sheet();
    paintSkyline(sheet, random);
    paintBackdrops(sheet, random);
    paintPark(sheet, random);
    paintFrontBlock(sheet, random);
    paintStreet(sheet, random);
    const { scene, lights, curfew } = sheet.finish();
    const sky = paintSkyDetail(random);
    this.life = new Life(random);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        scene: { value: scene },
        lights: { value: lights },
        curfew: { value: curfew },
        sky: { value: sky },
        sprites: { value: this.life.atlas },
        spriteGlow: { value: this.life.glow },
        spriteRect: { value: this.life.rects },
        spriteCell: { value: this.life.cells },
        spriteInfo: { value: this.life.info },
        /** Headlights and tail lights: faint by day, full after dark. */
        lightsOn: { value: 0.03 },
        center: { value: options.center ?? new THREE.Vector3(0, 1.2, 0) },
        radius: { value: options.sceneryDistance ?? 40 },
        zenith: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        /** 0 by day .. 1 at night: how far the scenery has gone dark. */
        nightness: { value: 0 },
        starAlpha: { value: 0 },
        cloudTint: { value: new THREE.Color(0xffffff) },
        cloudAlpha: { value: 0 },
        litAlpha: { value: 0 },
        /** How awake the city is, 0..1: lights whose curfew is above it are out. */
        wakefulness: { value: 1 },
        /** The sun's tint and brightness on the scenery by day. */
        sceneTint: { value: new THREE.Color(0xffffff) },
        /** Direction of the point on the horizon under the sun, and the glow strength there. */
        glowDir: { value: new THREE.Vector3(0, 0, -1) },
        glowStrength: { value: 0 },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color(0xfff4e6) },
        /** 0 high sun (small white disc) .. 1 sun on the horizon (big orange halo). */
        sunLow: { value: 0 },
        /** Fades the sun out once it is well below the horizon. */
        sunVisibility: { value: 1 },
        moonDir: { value: new THREE.Vector3(0, 1, 0) },
        moonShadowDir: { value: new THREE.Vector3(0, 1, 0) },
        moonVisibility: { value: 0 },
      },
      vertexShader,
      fragmentShader,
    });

    this.dayNight.onChange((sky) => this.apply(sky));
  }

  /** Moves the traffic and the passers-by on by `dt` seconds. */
  update(dt: number): void {
    const u = this.material.uniforms;
    this.life.update(dt, u.nightness.value as number, u.wakefulness.value as number);
  }

  /** World-space unit direction the sun (or moon) shines *from*. */
  lightDirection(sky: SkyState, out = new THREE.Vector3()): THREE.Vector3 {
    return this.direction(sky.lightElevation, sky.lightAzimuth, out);
  }

  /** World-space unit direction of a point in the sky given in the primary window's frame. */
  private direction(elevation: number, azimuth: number, out: THREE.Vector3): THREE.Vector3 {
    // In the primary window's frame: outward is -z, positive azimuth swings towards +x.
    return out
      .set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation))
      .applyQuaternion(this.primaryQuaternion);
  }

  /** Pushes the sky state into the uniforms; nothing is repainted. */
  private apply(sky: SkyState): void {
    const u = this.material.uniforms;
    const skyNight = 1 - sky.daylight;
    (u.zenith.value as THREE.Color).copy(sky.zenith);
    (u.horizon.value as THREE.Color).copy(sky.horizon);
    u.starAlpha.value = skyNight > 0.05 ? skyNight * skyNight * 0.9 : 0;
    // Clouds: bright by day, catching the horizon colour at dusk, gone at night.
    const dusk = 1 - THREE.MathUtils.smoothstep(sky.sunHeight, 0.05, 0.4);
    (u.cloudTint.value as THREE.Color).copy(this.scratchColor.setHex(0xffffff).lerp(sky.horizon, 0.35 * dusk));
    u.cloudAlpha.value = 0.55 * sky.daylight;

    // The ground goes dark later than the sky brightens at dawn and earlier at dusk; the lights
    // come on around sunset and the low sun warms and dims everything it still reaches.
    const nightness = 1 - THREE.MathUtils.smoothstep(sky.sunHeight, -0.2, 0.12);
    u.nightness.value = nightness;
    u.litAlpha.value = THREE.MathUtils.smoothstep(nightness, 0.15, 0.7);
    u.lightsOn.value = 0.03 + 0.97 * THREE.MathUtils.smoothstep(nightness, 0.1, 0.5);
    u.wakefulness.value = wakefulnessAt(sky.hours);
    const sunLow = 1 - THREE.MathUtils.smoothstep(sky.sunHeight, 0, 0.3);
    const brightness = THREE.MathUtils.lerp(0.6, 1, THREE.MathUtils.smoothstep(sky.sunHeight, -0.05, 0.25));
    (u.sceneTint.value as THREE.Color)
      .setHex(0xffffff)
      .lerp(sky.lightColor, sky.night ? 0 : 0.45 * sunLow)
      .multiplyScalar(brightness);

    this.direction(0, sky.sunAzimuth, u.glowDir.value as THREE.Vector3);
    u.glowStrength.value = sky.horizonGlow;
    this.direction(sky.sunElevation, sky.sunAzimuth, u.sunDir.value as THREE.Vector3);
    (u.sunColor.value as THREE.Color).copy(sky.lightColor);
    if (sky.night) (u.sunColor.value as THREE.Color).setHex(0xff6a26);
    u.sunLow.value = sunLow;
    u.sunVisibility.value = THREE.MathUtils.smoothstep(sky.sunHeight, -0.16, -0.06);
    this.direction(sky.moonElevation, sky.moonAzimuth, u.moonDir.value as THREE.Vector3);
    this.direction(sky.moonElevation + MOON_SHADOW_OFFSET.pitch, sky.moonAzimuth + MOON_SHADOW_OFFSET.yaw, u.moonShadowDir.value as THREE.Vector3);
    u.moonVisibility.value = sky.moonVisibility;
  }
}
