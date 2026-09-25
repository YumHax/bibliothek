import * as THREE from 'three';
import { seededRandom } from '@/covers/generated/canvasUtils';
import type { DayNight, SkyState } from '../DayNight';
import { type Rng, Sheet } from './Sheet';
import { paintSkyDetail } from './SkyDetail';
import { paintSkyline } from './Skyline';
import { paintBackdrops, paintFrontBlock, paintStreetEnds } from './Facades';
import { paintPark } from './Park';
import { paintStreet } from './Street';
import { paintCourtyard } from './Courtyard';
import type { GoodsRect } from './Shopfront';
import { Life } from './Life';
import { beginHoliday } from './Holiday';
import { fragmentShader, vertexShader } from './shader';
import { wakefulnessAt } from './wakefulness';
import { type Holiday, type Season, holidayOf, seasonOf, useHoliday, useSeason } from './season';

/**
 * A wall of the building itself, close outside some windows, facing +z (world): the pane shader
 * renders it in true perspective before the painted scenery, which sits 40 m out and could not
 * show something a few metres away. `x` and `y` are the world extents of the rectangle, `z` its plane;
 * `storey` the height of a floor of the building, counted up from the wall's bottom (the street).
 */
export interface NearWall {
  z: number;
  x: [number, number];
  y: [number, number];
  storey: number;
}

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
  /** A wall of the building standing in the view of some windows (see `NearWall`). Default none. */
  nearWall?: NearWall;
  /** The time of year it is painted in (trees, lawn). Default the real calendar's. */
  season?: Season;
  /** The holiday it is dressed for (string lights, pumpkins); default the real calendar's, null for none. */
  holiday?: Holiday | null;
}

/** How much the moon's shadow disc is offset from the moon (yaw, pitch), for the crescent. */
const MOON_SHADOW_OFFSET = { yaw: -0.024, pitch: 0.012 };
/** How fast the clouds drift across the sky: a turn of the cumulus map in about forty minutes. */
const CLOUD_DRIFT = 1 / 2400;
/** Distance over which the air dissolves about two thirds of a thing's own colour into the sky, in clear weather. */
const HAZE_DISTANCE = 900;
/** Clouds lit from below by the city at night. */
const CITY_LIT_CLOUD = new THREE.Color(0x4a3e36);

/**
 * Paints the whole view, far to near, onto a new `Sheet` in `season`: the skyline, the blocks
 * behind the park, the park, Front Street's block, the buildings closing both streets, then the
 * streets themselves with everything standing on them. Returns the sheet and the retro games
 * shop's display boxes. Shared with the headless check (see `docs/outdoors.md`).
 */
export function paintView(random: Rng, season: Season, holiday: Holiday | null = null): { sheet: Sheet; shopGoods: GoodsRect[] } {
  useSeason(season);
  useHoliday(holiday);
  beginHoliday();
  const sheet = new Sheet();
  paintSkyline(sheet, random);
  paintBackdrops(sheet, random);
  paintPark(sheet, random);
  const shops = paintFrontBlock(sheet, random);
  paintStreetEnds(sheet, random);
  paintStreet(sheet, random, shops);
  paintCourtyard(sheet, random);
  return { sheet, shopGoods: shops.find((shop) => shop.landmark)?.goods ?? [] };
}

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
 * blocks and further, hazier towers beyond it; both streets close on a building across their far
 * end. The trees and the lawn are painted in the season of the real calendar. Everything is drawn
 * in true perspective from that eye, far to near, onto the `Sheet`: day colours, the lights that
 * come on at night, how much each surface mirrors the sky, how far away it is, the shadows cast on
 * it and how it takes rain and snow. Everything that changes with the time of day and the weather
 * is a uniform: sky gradient colours, the sunrise/sunset glow, the sun's tint on the scenery and how
 * strongly it casts shadows, how dark the night is, star, cloud and light strength, the drifting
 * clouds and the overcast, how wet or white the ground is, falling rain and snow, the sun and the
 * moon (drawn analytically exactly where the room's light comes from), and how awake the city is
 * (`wakefulnessAt`: the windows go out one by one after ten, the small hours are dark but for street
 * lamps, signs and a few insomniacs). So the cycle costs the GPU a few extra instructions per pane
 * pixel and the CPU nothing. What moves is `Life`: cars, a bus, pedestrians, birds, ducks as sprites
 * the shader draws over the scenery, advanced by `update()`, sparser as the city sleeps or the rain
 * comes. One thing is not painted but rendered analytically per pixel: the `nearWall`, a wall of
 * the building itself a few metres outside some windows (the flat's kitchen wing).
 */
export class Outdoors {
  /** Pane material: samples the view along the ray from the camera through the pane. */
  readonly material: THREE.ShaderMaterial;
  /** The traffic, the passers-by and the birds. */
  readonly life: Life;

  private readonly primaryQuaternion: THREE.Quaternion;
  private readonly scratchColor = new THREE.Color();
  private readonly scene: THREE.CanvasTexture;
  private readonly shopGoods: GoodsRect[];
  private sky: SkyState;
  private strikes = 0;
  private bannerText: string | null = null;
  private bannerUnder: ImageData | null = null;

  constructor(
    readonly dayNight: DayNight,
    options: OutdoorsOptions,
  ) {
    this.primaryQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), options.primaryRotationY);
    const random = seededRandom(1987);

    const season = options.season ?? seasonOf(new Date());
    const { sheet, shopGoods } = paintView(random, season, options.holiday === undefined ? holidayOf(new Date()) : options.holiday);
    this.shopGoods = shopGoods;
    const { scene, lights, curfew, ground, fx } = sheet.finish();
    this.scene = scene;
    const sky = paintSkyDetail(random);
    this.life = new Life(random);
    this.life.placeShop(shopGoods);
    const { nearWall } = options;
    this.sky = dayNight.state;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        scene: { value: scene },
        lights: { value: lights },
        curfew: { value: curfew },
        ground: { value: ground },
        fx: { value: fx },
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
        /** The near wall's x0, x1, y0, y1 (an empty y range when there is none), its plane and its storey height. */
        nearWall: { value: nearWall ? new THREE.Vector4(nearWall.x[0], nearWall.x[1], nearWall.y[0], nearWall.y[1]) : new THREE.Vector4(0, 0, 1, 0) },
        nearWallZ: { value: nearWall?.z ?? 0 },
        nearWallStorey: { value: nearWall?.storey ?? 3 },
        zenith: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        /** 0 by day .. 1 at night: how far the scenery has gone dark. */
        nightness: { value: 0 },
        starAlpha: { value: 0 },
        cloudTint: { value: new THREE.Color(0xffffff) },
        cloudAlpha: { value: 0 },
        /** How much of the sky is under cloud (the overcast sheet), and how far the clouds have drifted. */
        cloudCover: { value: 0 },
        cloudDrift: { value: new THREE.Vector2() },
        /** The city's orange glow on the night sky, stronger under cloud. */
        cityGlow: { value: 0 },
        litAlpha: { value: 0 },
        /** How awake the city is, 0..1: lights whose curfew is above it are out. */
        wakefulness: { value: 1 },
        /** The sun's tint and brightness on the scenery by day, and how strongly it casts shadows. */
        sceneTint: { value: new THREE.Color(0xffffff) },
        sunShadow: { value: 1 },
        /** The ground: how wet, how white with snow; what is falling now; drops on the glass. */
        wetness: { value: 0 },
        snowCover: { value: 0 },
        rain: { value: 0 },
        snow: { value: 0 },
        paneWet: { value: 0 },
        /** How hard the wind blows (the trees sway), how thick the fog is and its colour. */
        wind: { value: 0 },
        fog: { value: 0 },
        fogColor: { value: new THREE.Color(0xb8bcc0) },
        /** A lightning flash: how bright, the bolt's direction on the horizon, its shape and whether it is near enough to see. */
        lightning: { value: 0 },
        boltDir: { value: new THREE.Vector3(0, 0, 1) },
        boltSeed: { value: 0 },
        boltReach: { value: 0 },
        /** Spring blossom blowing past on the wind (1 in spring while the trees flower, else 0). */
        petals: { value: season.name === 'spring' && season.depth < 0.75 ? 1 : 0 },
        hazeDistance: { value: HAZE_DISTANCE },
        /** Seconds, for what flickers, blinks and falls. */
        time: { value: 0 },
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

    this.dayNight.onChange((state) => this.apply(state));
  }

  /** Moves the traffic, the passers-by, the birds and the clouds on by `dt` seconds. */
  update(dt: number): void {
    const u = this.material.uniforms;
    u.time.value = ((u.time.value as number) + dt) % 3600;
    const drift = u.cloudDrift.value as THREE.Vector2;
    drift.x = (drift.x + dt * CLOUD_DRIFT * (0.6 + this.sky.cloudCover)) % 1;
    drift.y = (drift.y + dt * CLOUD_DRIFT * 0.3) % 1;
    this.life.update(dt, u.nightness.value as number, u.wakefulness.value as number, this.sky);
  }

  /**
   * Fills the retro games shop's display shelves across the street with `colors` (one box each, in
   * order, repeating if there are more boxes than colours): the day's market stock seen from the
   * window. Repaints those few texels and re-uploads the scenery texture once.
   */
  showShopStock(colors: readonly string[]): void {
    if (colors.length === 0 || this.shopGoods.length === 0) return;
    const ctx = (this.scene.image as HTMLCanvasElement).getContext('2d');
    if (!ctx) return;
    this.shopGoods.forEach((box, i) => {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(box.x, box.y, box.w, box.h);
    });
    this.scene.needsUpdate = true;
  }

  /**
   * Hangs a banner across the top of the retro games shop's window (`text`, e.g. "NOUVEAUTÉS" on a
   * day of fresh stock), or takes it down (null). Repaints those texels and re-uploads the scenery.
   */
  showShopBanner(text: string | null): void {
    if (this.shopGoods.length === 0 || text === this.bannerText) return;
    const ctx = (this.scene.image as HTMLCanvasElement).getContext('2d');
    if (!ctx) return;
    const x0 = Math.floor(Math.min(...this.shopGoods.map((g) => g.x)));
    const x1 = Math.ceil(Math.max(...this.shopGoods.map((g) => g.x + g.w)));
    const y0 = Math.floor(Math.min(...this.shopGoods.map((g) => g.y)));
    const y1 = Math.ceil(Math.max(...this.shopGoods.map((g) => g.y + g.h)));
    const h = Math.max(3, Math.round((y1 - y0) * 0.28));
    const top = y0 - Math.round(h * 0.4);
    // What the banner covers, kept to take it down again.
    this.bannerUnder ??= ctx.getImageData(x0, top, x1 - x0, h);
    ctx.putImageData(this.bannerUnder, x0, top);
    this.bannerText = text;
    if (text) {
      ctx.fillStyle = '#d8262a';
      ctx.fillRect(x0, top, x1 - x0, h);
      ctx.fillStyle = '#ffe14a';
      ctx.fillRect(x0, top, x1 - x0, 1);
      ctx.fillRect(x0, top + h - 1, x1 - x0, 1);
      ctx.save();
      ctx.font = `bold ${h * 0.75}px Arial, sans-serif`;
      const squeeze = Math.min(1, ((x1 - x0) * 0.9) / Math.max(1, ctx.measureText(text).width));
      ctx.translate((x0 + x1) / 2, top + h / 2 + 0.5);
      // Mirrored, like all the lettering across the street (texture x runs right to left as seen).
      ctx.scale(-squeeze, 1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
    this.scene.needsUpdate = true;
  }

  /** Every window pane under `root` that shows this view (the street is heard through them). */
  panesIn(root: THREE.Object3D): THREE.Object3D[] {
    const panes: THREE.Object3D[] = [];
    root.traverse((object) => {
      if ((object as THREE.Mesh).material === this.material) panes.push(object);
    });
    return panes;
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
    this.sky = sky;
    const u = this.material.uniforms;
    // Stars follow the sun alone (the weather dims `daylight` too, and a grey noon has no stars).
    const skyNight = 1 - THREE.MathUtils.smoothstep(sky.sunHeight, -0.12, 0.3);
    (u.zenith.value as THREE.Color).copy(sky.zenith);
    (u.horizon.value as THREE.Color).copy(sky.horizon);
    u.starAlpha.value = skyNight > 0.05 ? skyNight * skyNight * 0.9 : 0;

    // The ground goes dark later than the sky brightens at dawn and earlier at dusk; the lights
    // come on around sunset and the low sun warms and dims everything it still reaches.
    const nightness = 1 - THREE.MathUtils.smoothstep(sky.sunHeight, -0.2, 0.12);
    u.nightness.value = nightness;
    // Clouds: bright by day, catching the horizon colour at dusk, lit dull orange by the city at night.
    const dusk = 1 - THREE.MathUtils.smoothstep(sky.sunHeight, 0.05, 0.4);
    (u.cloudTint.value as THREE.Color)
      .copy(this.scratchColor.setHex(0xffffff).lerp(sky.horizon, 0.35 * dusk))
      .lerp(CITY_LIT_CLOUD, THREE.MathUtils.smoothstep(nightness, 0.3, 0.9));
    u.cloudAlpha.value = THREE.MathUtils.lerp(0.2, 0.55, sky.daylight);
    u.cloudCover.value = sky.cloudCover;
    u.cityGlow.value = nightness * (0.45 + 0.9 * sky.cloudCover);
    u.litAlpha.value = THREE.MathUtils.smoothstep(nightness, 0.15, 0.7);
    u.lightsOn.value = 0.03 + 0.97 * THREE.MathUtils.smoothstep(nightness, 0.1, 0.5);
    u.wakefulness.value = wakefulnessAt(sky.hours);
    const sunLow = 1 - THREE.MathUtils.smoothstep(sky.sunHeight, 0, 0.3);
    // Under cloud the light is flatter and a little dimmer.
    const brightness = THREE.MathUtils.lerp(0.6, 1, THREE.MathUtils.smoothstep(sky.sunHeight, -0.05, 0.25)) * (1 - 0.22 * sky.cloudCover);
    (u.sceneTint.value as THREE.Color)
      .setHex(0xffffff)
      .lerp(sky.lightColor, sky.night ? 0 : 0.45 * sunLow * (1 - sky.cloudCover))
      .multiplyScalar(brightness);
    u.sunShadow.value = THREE.MathUtils.smoothstep(sky.sunHeight, 0, 0.2) * (1 - 0.9 * sky.cloudCover);
    u.wetness.value = sky.wetness;
    u.snowCover.value = sky.snowCover;
    u.rain.value = sky.rain;
    u.snow.value = sky.snow;
    u.paneWet.value = Math.max(sky.rain, sky.wetness * 0.3);
    u.wind.value = sky.wind;
    u.fog.value = sky.fog;
    // Fog takes the horizon's colour, whiter by day, and the city's orange glow at night.
    (u.fogColor.value as THREE.Color)
      .copy(sky.horizon)
      .lerp(this.scratchColor.setHex(0xaab0b6).multiplyScalar(brightness), 0.55 * (1 - nightness))
      .lerp(this.scratchColor.setHex(0x2a2420), 0.6 * nightness);
    u.lightning.value = sky.lightning;
    if (sky.strikes !== this.strikes) {
      // A new strike: somewhere round the horizon, a fresh bolt; only the nearer ones show theirs.
      this.strikes = sky.strikes;
      this.direction(0, Math.random() * Math.PI * 2, u.boltDir.value as THREE.Vector3);
      u.boltSeed.value = Math.random() * 100;
      u.boltReach.value = 1 - THREE.MathUtils.smoothstep(sky.strikeDistance, 1200, 3500);
    }
    u.hazeDistance.value = HAZE_DISTANCE * (1 - 0.5 * sky.rain - 0.4 * sky.snow - 0.2 * sky.cloudCover);

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
