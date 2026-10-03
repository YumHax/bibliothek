import * as THREE from 'three';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { RegionUploader } from '@/world/city/regionUpload';
import { syncWorks } from '@/world/street/details/roadworks';
import { MarketCalendar } from '@/economy/MarketCalendar';
import type { DayNight, SkyState } from '../DayNight';
import { EYE_HEIGHT, type Rng, SCENE_WIDTH, Sheet } from './Sheet';
import { FLAT_IN_STREET } from '@/world/street/streetPlan';
import { QUALITY } from '@/graphics/quality';
import { paintSkyDetail } from './SkyDetail';
import { paintSkyline } from './Skyline';
import { paintBackdrops, paintFrontBlock, paintStreetEnds } from './Facades';
import { paintPark } from './Park';
import { paintStreet } from './Street';
import { paintCourtyard } from './Courtyard';
import type { GoodsRect } from './Shopfront';
import { Life } from './Life';
import { beginHoliday } from './Holiday';
import { MOON_RADIUS, fragmentShader, vertexShader } from './shader';
import { MOON_SHADOW_OFFSET as MOON_CRESCENT } from '../../city/skyGlsl';
import { wakefulnessAt } from '@/time/wakefulness';

/** The painting's eye over the flat's floor: painted `EYE_HEIGHT` over the street, whose pavement is the flat's floor's height below. */
const EYE_HEIGHT_OVER_FLOOR = EYE_HEIGHT - FLAT_IN_STREET.height;
import { type Holiday, type Season, holidayOf, seasonOf, useHoliday, useSeason } from '@/time/season';

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
  /** Centre of the scenery sphere (the room's middle), the painting's eye: default 1.7 m over the flat's floor (`EYE_HEIGHT_OVER_FLOOR`). */
  center?: THREE.Vector3;
  /** A wall of the building standing in the view of some windows (see `NearWall`). Default none. */
  nearWall?: NearWall;
  /** The time of year it is painted in (trees, lawn). Default the real calendar's. */
  season?: Season;
  /** The holiday it is dressed for (string lights, pumpkins); default the real calendar's, null for none. */
  holiday?: Holiday | null;
  /** The camera the view is seen from: the moving sprites are placed as it sees them (see `Life.update`). */
  viewer?: THREE.Object3D;
  /**
   * Leave the painting for the first draw of a pane (or of the balcony's open air): where the windows show the
   * street's 3D view (`outlook/sharedOutlook` `streetWindows`), nothing may ever draw it, and it costs some hundreds
   * of milliseconds at start and tens of MB. The life, the sky and the sound go on regardless. Default false.
   */
  paintOnFirstDraw?: boolean;
}

/** The painted view and what goes with it (`Outdoors.paint`). */
interface Painting {
  textures: { scene: THREE.CanvasTexture; lights: THREE.DataTexture; curfew: THREE.DataTexture; ground: THREE.CanvasTexture; fx: THREE.DataTexture; sky: THREE.Texture };
  /** The retro games shop's display boxes, in scene texels. */
  shopGoods: GoodsRect[];
  /** The day colours' canvas texels per scene texel (`Sheet.colorScale`): pixel copies on it scale by it. */
  colorScale: number;
  /** Uploads the repainted shop window alone (`adopt`). */
  upload: RegionUploader | null;
}

/** The painting's seed: the same view whenever it is painted. */
const PAINT_SEED = 1987;
/** The life's own seed when the painting waits for its first draw (painted at start, the life draws on after it). */
const LIFE_SEED = 1988;

/**
 * The day colours are painted twice as fine on high quality (8192 x 2688: about 23 texels a degree,
 * near what a window shows on a large screen) if the GPU takes textures that wide; else at the
 * scene's size. Asked of a throwaway WebGL context, once.
 */
function sceneColorScale(): number {
  if (QUALITY.level !== 'high') return 1;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 1;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return max >= SCENE_WIDTH * 2 ? 2 : 1;
  } catch {
    return 1;
  }
}

/** How much the moon's shadow disc is offset from the moon (yaw, pitch), for the crescent: the street's dome's, in this moon's radii. */
const MOON_SHADOW_OFFSET = { yaw: MOON_CRESCENT.yaw * MOON_RADIUS, pitch: MOON_CRESCENT.pitch * MOON_RADIUS };
/** Seconds between two moves of the life outside while no pane shows it. */
const UNSEEN_LIFE_STEP = 0.2;
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
export function paintView(random: Rng, season: Season, holiday: Holiday | null = null, colorScale = 1): { sheet: Sheet; shopGoods: GoodsRect[] } {
  useSeason(season);
  useHoliday(holiday);
  beginHoliday();
  const sheet = new Sheet(colorScale);
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
 * pixel and the CPU nothing. What moves is `Life`: the vehicles as solids the shader intersects per
 * pixel (`vehicleShader`), pedestrians, cyclists, birds as sprites it draws over the scenery, advanced
 * by `update()`, sparser as the city sleeps or the rain comes. One thing is not painted but rendered analytically per pixel: the `nearWall`, a wall of
 * the building itself a few metres outside some windows (the flat's kitchen wing).
 */
export class Outdoors {
  /** Pane material: samples the view along the ray from the camera through the pane. */
  readonly material: THREE.ShaderMaterial;
  /** The traffic, the passers-by and the birds. */
  readonly life: Life;

  private readonly primaryQuaternion: THREE.Quaternion;
  private readonly scratchColor = new THREE.Color();
  /** The painting, once done (at construction, or at the first draw with `paintOnFirstDraw`). */
  private painting: Painting | null = null;
  /** What `paint` paints in. */
  private readonly season: Season;
  private readonly holiday: Holiday | null;
  /** The shop's stock and banner asked for before the painting was done: put up as it is. */
  private stock: readonly string[] | null = null;
  private sky: SkyState;
  private strikes = 0;
  private bannerText: string | null = null;
  private bannerUnder: ImageData | null = null;
  /** The camera (`OutdoorsOptions.viewer`; the windows' 3D views are rendered from it too, `outlook/sharedOutlook`). */
  readonly viewer: THREE.Object3D | undefined;
  /** Where the camera is from the painting's eye this frame. */
  private readonly eye = new THREE.Vector3();
  /** Whether a pane was drawn since the last `update`, and the time the life outside has not been moved by. */
  private drawn = true;
  private lifeClock = 0;

  constructor(
    readonly dayNight: DayNight,
    options: OutdoorsOptions,
  ) {
    this.primaryQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), options.primaryRotationY);
    this.viewer = options.viewer;
    const random = seededRandom(PAINT_SEED);

    const season = options.season ?? seasonOf(new Date());
    this.season = season;
    this.holiday = options.holiday === undefined ? holidayOf(new Date()) : options.holiday;
    // Set now whether or not the view is painted yet: the street's trees, the critters and the decor read them.
    useSeason(season);
    useHoliday(this.holiday);
    // The roadworks where the market's calendar has them today (the street syncs them again as it is built).
    syncWorks(MarketCalendar.savedDay());
    const painting = options.paintOnFirstDraw ? null : this.paint(random);
    // Painted now, the life draws on after the painting, as it always has; later, from its own seed.
    this.life = new Life(painting ? random : seededRandom(LIFE_SEED));
    const { nearWall } = options;
    this.sky = dayNight.state;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        // Filled by `adopt` (the painting's textures).
        scene: { value: null },
        lights: { value: null },
        curfew: { value: null },
        ground: { value: null },
        fx: { value: null },
        sky: { value: null },
        sprites: { value: this.life.atlas },
        spriteGlow: { value: this.life.glow },
        spriteRect: { value: this.life.rects },
        spriteCell: { value: this.life.cells },
        spriteInfo: { value: this.life.info },
        vehiclePose: { value: this.life.vehiclePose },
        vehicleLook: { value: this.life.vehicleLook },
        /** Headlights and tail lights: faint by day, full after dark. */
        lightsOn: { value: 0.03 },
        center: { value: options.center ?? new THREE.Vector3(0, EYE_HEIGHT_OVER_FLOOR, 0) },
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
        /** How much of the sky is under cloud (the overcast sheet), and how far the clouds have drifted (xy; z the game hour, for the shops' hours). */
        cloudCover: { value: 0 },
        cloudDrift: { value: new THREE.Vector4() },
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
    this.material.onBeforeRender = this.markDrawn;
    if (painting) this.adopt(painting);

    this.dayNight.onChange((state) => this.apply(state));
  }

  /**
   * Paints the whole view (`paintView`) and the sky's detail with `random`, into textures; the shop's goods
   * placed by `adopt`. Some hundreds of milliseconds on the main thread and tens of MB of canvases.
   */
  private paint(random: Rng): Painting {
    const { sheet, shopGoods } = paintView(random, this.season, this.holiday, sceneColorScale());
    return { textures: { ...sheet.finish(), sky: paintSkyDetail(random) }, shopGoods, colorScale: sheet.colorScale, upload: null };
  }

  /** Hands `painting`'s textures to the panes, puts the life's shop where it is painted and the stock asked for in its window. */
  private adopt(painting: Painting): void {
    this.painting = painting;
    const u = this.material.uniforms;
    for (const [name, texture] of Object.entries(painting.textures)) u[name].value = texture;
    // The shop's restocked window and its banner go up alone, not the whole scenery.
    painting.upload = new RegionUploader(painting.textures.scene);
    painting.upload.attach(this.material);
    this.life.placeShop(painting.shopGoods);
    if (this.stock) this.showShopStock(this.stock);
    const banner = this.bannerText;
    this.bannerText = null;
    if (banner) this.showShopBanner(banner);
  }

  /**
   * Called as a pane (or the balcony's open air, whose material shares these uniforms) is drawn:
   * while none is, `update` moves the life outside only a few times a second. The first draw paints
   * the view if it was left for then (`paintOnFirstDraw`), from the same seed as ever.
   */
  readonly markDrawn = (): void => {
    this.drawn = true;
    if (!this.painting) this.adopt(this.paint(seededRandom(PAINT_SEED)));
  };

  /** Moves the traffic, the passers-by, the birds and the clouds on by `dt` seconds. */
  update(dt: number): void {
    const u = this.material.uniforms;
    u.time.value = ((u.time.value as number) + dt) % 3600;
    const drift = u.cloudDrift.value as THREE.Vector4;
    drift.x = (drift.x + dt * CLOUD_DRIFT * (0.6 + this.sky.cloudCover)) % 1;
    drift.y = (drift.y + dt * CLOUD_DRIFT * 0.3) % 1;
    // Unseen (the street, the arcade, a room without a window), the traffic and the walkers still go
    // on for the street's sound, but a few times a second, not every frame.
    this.lifeClock += dt;
    const drawn = this.drawn;
    this.drawn = false;
    if (!drawn && this.lifeClock < UNSEEN_LIFE_STEP) return;
    if (this.viewer) this.viewer.getWorldPosition(this.eye).sub(u.center.value as THREE.Vector3);
    this.life.update(this.lifeClock, u.nightness.value as number, u.wakefulness.value as number, this.sky, this.viewer ? this.eye : undefined);
    this.lifeClock = 0;
  }

  /**
   * Fills the retro games shop's display shelves across the street with `colors` (one box each, in
   * order, repeating if there are more boxes than colours): the day's market stock seen from the
   * window. Repaints those few texels and uploads their rect alone.
   */
  showShopStock(colors: readonly string[]): void {
    if (colors.length === 0) return;
    this.stock = colors;
    const painting = this.painting;
    if (!painting || painting.shopGoods.length === 0) return;
    const ctx = (painting.textures.scene.image as HTMLCanvasElement).getContext('2d');
    if (!ctx) return;
    painting.shopGoods.forEach((box, i) => {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(box.x, box.y, box.w, box.h);
    });
    this.markGoods(painting, 0);
  }

  /** The shop's goods' rect (with `above` texels over it: the banner) uploaded alone, in the canvas's own texels. */
  private markGoods(painting: Painting, above: number): void {
    const { shopGoods, colorScale: k } = painting;
    const x0 = Math.min(...shopGoods.map((g) => g.x));
    const x1 = Math.max(...shopGoods.map((g) => g.x + g.w));
    const y0 = Math.min(...shopGoods.map((g) => g.y)) - above;
    const y1 = Math.max(...shopGoods.map((g) => g.y + g.h));
    painting.upload?.mark(x0 * k - 1, y0 * k - 1, (x1 - x0) * k + 2, (y1 - y0) * k + 2);
  }

  /**
   * Hangs a banner across the top of the retro games shop's window (`text`, e.g. "NEW IN" on a
   * day of fresh stock), or takes it down (null). Repaints those texels and re-uploads the scenery.
   */
  showShopBanner(text: string | null): void {
    if (text === this.bannerText) return;
    const painting = this.painting;
    if (!painting) {
      // Hung once the view is painted (`adopt`).
      this.bannerText = text;
      return;
    }
    const { shopGoods } = painting;
    if (shopGoods.length === 0) return;
    const ctx = (painting.textures.scene.image as HTMLCanvasElement).getContext('2d');
    if (!ctx) return;
    const x0 = Math.floor(Math.min(...shopGoods.map((g) => g.x)));
    const x1 = Math.ceil(Math.max(...shopGoods.map((g) => g.x + g.w)));
    const y0 = Math.floor(Math.min(...shopGoods.map((g) => g.y)));
    const y1 = Math.ceil(Math.max(...shopGoods.map((g) => g.y + g.h)));
    const h = Math.max(3, Math.round((y1 - y0) * 0.28));
    const top = y0 - Math.round(h * 0.4);
    // What the banner covers, kept to take it down again.
    // Pixel copies ignore the context's scale: in the canvas's own texels.
    const k = painting.colorScale;
    this.bannerUnder ??= ctx.getImageData(x0 * k, top * k, (x1 - x0) * k, h * k);
    ctx.putImageData(this.bannerUnder, x0 * k, top * k);
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
    this.markGoods(painting, y0 - top);
  }

  /**
   * Every window pane under `root` that shows the street (the street is heard through them): this view's, and the
   * windows' 3D views of it (`userData.streetPane`, `RoomWindow`).
   */
  panesIn(root: THREE.Object3D): THREE.Object3D[] {
    const panes: THREE.Object3D[] = [];
    root.traverse((object) => {
      if ((object as THREE.Mesh).material === this.material || object.userData.streetPane === true) panes.push(object);
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
    (u.cloudDrift.value as THREE.Vector4).z = sky.hours;
    const sunLow = 1 - THREE.MathUtils.smoothstep(sky.sunHeight, 0, 0.3);
    // Under cloud the light is flatter and a little dimmer.
    const brightness = THREE.MathUtils.lerp(0.6, 1, THREE.MathUtils.smoothstep(sky.sunHeight, -0.05, 0.25)) * (1 - 0.22 * sky.cloudCover);
    (u.sceneTint.value as THREE.Color)
      .setHex(0xffffff)
      .lerp(sky.lightColor, sky.night ? 0 : 0.45 * sunLow * sky.sunThrough)
      .multiplyScalar(brightness);
    u.sunShadow.value = THREE.MathUtils.smoothstep(sky.sunHeight, 0, 0.2) * sky.sunThrough;
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
    // Behind a closed sky the sun is not drawn at all, not even as a glow (`SkyState.sunThrough`).
    u.sunVisibility.value = THREE.MathUtils.smoothstep(sky.sunHeight, -0.16, -0.06) * sky.sunThrough;
    this.direction(sky.moonElevation, sky.moonAzimuth, u.moonDir.value as THREE.Vector3);
    this.direction(sky.moonElevation + MOON_SHADOW_OFFSET.pitch, sky.moonAzimuth + MOON_SHADOW_OFFSET.yaw, u.moonShadowDir.value as THREE.Vector3);
    u.moonVisibility.value = sky.moonVisibility;
  }
}
