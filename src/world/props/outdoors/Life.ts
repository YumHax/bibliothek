import * as THREE from 'three';
import { createCanvas, canvasTexture } from '@/covers/generated/canvasUtils';
import { QUALITY } from '@/graphics/quality';
import { type Rng, ELEVATION_MAX, ELEVATION_MIN, EYE_HEIGHT, SCENE_HEIGHT, SCENE_WIDTH, azimuthX, elevationY } from './Sheet';
import type { GoodsRect } from './Shopfront';
import { type AtlasPens, type Bounds, type Cell, type LifeEnv, type LifeLayer, WHITE_TINT } from './sprites';
import { Traffic } from './LifeTraffic';
import { VEHICLE_COUNT } from './vehicleShader';
import { Cyclists, type VehiclePose } from './LifeVehicles';
import { Pedestrians } from './LifePedestrians';
import { Birds } from './LifeBirds';
import { Fountain } from './LifeFountain';
import { Critters } from './LifeCritters';
import { Folk, MAX_QUEUE } from './LifeFolk';
import { type LifeEvents, quietStreet } from './lifeEvents';

/**
 * How many moving things the pane shader looks up per pixel as sprites; the arrays below have this
 * many slots. Three vec4 uniforms each, and two per vehicle or cyclist (`VEHICLE_COUNT`, drawn as
 * solids): 42 x 3 + 20 x 2 keeps the pane shader under WebGL's guaranteed 224 fragment uniform
 * vectors. A busy afternoon peaks around 30 sprites now the vehicles and cyclists are not among them;
 * low quality keeps 16 (the pane shader loops over every slot on every pixel), dropping the last pushed.
 */
export const SPRITE_COUNT = QUALITY.level === 'low' ? 16 : 42;
/**
 * Atlas size: pedestrians, dogs, cyclists, pigeons, bats, the fox and the cats, the balcony and
 * shop figures, the fountain, the blinking lights; the glow copy is at half size.
 */
const ATLAS_W = 2048;
const ATLAS_H = 512;
const GLOW_SCALE = 0.5;

/** What `Life.update` reads of the sky (a `SkyState` will do): falling rain and snow, the game hour, the wind. */
interface LifeWeather {
  rain: number;
  snow: number;
  hours?: number;
  wind?: number;
}

/** No rain, no snow: the weather when `update` is given none. */
const CLEAR: LifeWeather = { rain: 0, snow: 0 };

/** One sprite queued this frame: its distance, band-space and atlas rectangles, alpha, lod and packed tint. */
interface Slot {
  d: number;
  rect: number[];
  cell: number[];
  alpha: number;
  lod: number;
  tint: number;
}

/** Sort order of the slots: far to near. */
function farFirst(p: Slot, q: Slot): number {
  return q.d - p.d;
}

/**
 * The life outside: traffic through the crossroads (`Traffic`), cyclists (`Cyclists`), people on
 * the pavements and the park paths with their dogs (`Pedestrians`), the balcony and retro games
 * shop folk (`Folk`), the night's animals (`Critters`), the pigeons (`Birds`) and the fountain's
 * plume (`Fountain`). Each is a `LifeLayer` that paints its cells into the one atlas here and
 * pushes sprites the pane shader draws over the scenery: a rectangle in the panorama's band space
 * textured from the atlas, hidden wherever the scenery is nearer, dimmed by night and distance
 * like everything else, with headlights and tail lights after dark. `update()` moves every layer
 * and refreshes the uniform arrays the shader reads; `events` tells the street's sound what
 * happened.
 */
export class Life {
  readonly atlas: THREE.CanvasTexture;
  readonly glow: THREE.CanvasTexture;
  /** Per sprite: band-space rectangle (u0, v0, u1, v1), atlas rectangle (u0, v0, u1, v1), (alpha, distance, lod, packed tint). */
  readonly rects = new Float32Array(SPRITE_COUNT * 4);
  readonly cells = new Float32Array(SPRITE_COUNT * 4);
  readonly info = new Float32Array(SPRITE_COUNT * 4);
  /** Per vehicle or cyclist (`vehicleShader`): (x, z, heading, kind; kind -1 for an empty slot) and (packed paint, alpha, 0, 0). */
  readonly vehiclePose = new Float32Array(VEHICLE_COUNT * 4);
  readonly vehicleLook = new Float32Array(VEHICLE_COUNT * 4);
  /** What can be heard (see `LifeEvents`); read, never written, by `StreetAmbience`. */
  readonly events: LifeEvents = quietStreet();
  /** How many pixel rows of the atlas the painters used (the headless check reads it). */
  atlasUsed = 0;

  private readonly folk: Folk;
  private readonly traffic: Traffic;
  private readonly cyclists: Cyclists;
  /** This frame's vehicles and cyclists together (scratch for `writeVehicles`). */
  private readonly solids: VehiclePose[] = [];
  /** In update (and push priority) order: vehicles first, the fountain's spray last. */
  private readonly layers: readonly LifeLayer[];
  /** This frame's sprites, in push order until sorted; each one of the `pool`'s slots. */
  private readonly slots: Slot[] = [];
  private readonly pool: Slot[] = Array.from({ length: SPRITE_COUNT }, () => ({ d: 0, alpha: 0, lod: 0, tint: 0, rect: [0, 0, 0, 0], cell: [0, 0, 0, 0] }));
  /** The moment every layer reads, rewritten each frame. */
  private readonly env: LifeEnv = { hours: 12, nightness: 0, dusk: 0, wakefulness: 1, rain: 0, snow: 0, wet: 0, wind: 0 };
  /** Where the camera is, metres from the painting's eye (see `update`), and a scratch for `seenFromEye`. */
  private readonly eye = new THREE.Vector3();
  private readonly scratch: Bounds = [0, 0, 0, 0];
  private readonly push = (bounds: Bounds, cell: Cell, d: number, alpha: number, tint = WHITE_TINT): void => this.pushSprite(bounds, cell, d, alpha, tint);

  constructor(random: Rng) {
    // Everything draws from the one shared random in a fixed order: the animals' and the folk's
    // starting state here, then the atlas, then (`populate`) the traffic, the birds and the walkers.
    const traffic = new Traffic(random, this.events);
    const cyclists = new Cyclists(random, traffic.obstacles);
    const critters = new Critters(random);
    this.folk = new Folk(random);
    const pedestrians = new Pedestrians(random, this.events);
    const birds = new Birds(random);
    const fountain = new Fountain(random, this.events);
    this.traffic = traffic;
    this.cyclists = cyclists;
    this.layers = [traffic, cyclists, this.folk, pedestrians, critters, birds, fountain];
    const [colorCanvas, color] = createCanvas(ATLAS_W, ATLAS_H);
    const [glowCanvas, glow] = createCanvas(ATLAS_W * GLOW_SCALE, ATLAS_H * GLOW_SCALE);
    // Opaque black under additive light: on a transparent canvas the faint beam would be un-premultiplied
    // to full white at upload.
    glow.fillStyle = '#000000';
    glow.fillRect(0, 0, glowCanvas.width, glowCanvas.height);
    glow.scale(GLOW_SCALE, GLOW_SCALE);
    // The atlas keeps its packing: the blinking lights come after the spray, the self-painting layers last.
    this.paintAtlas(color, glow, [traffic, pedestrians, birds, fountain, traffic.flashes, cyclists, critters, this.folk]);
    this.atlas = canvasTexture(colorCanvas, { anisotropy: 'facing' });
    this.atlas.premultiplyAlpha = true;
    this.glow = canvasTexture(glowCanvas, { data: true, anisotropy: 'facing' });
    for (const layer of [traffic, birds, pedestrians]) layer.populate();
  }

  /** Has `count` people (0..6) queue on the pavement at the retro games shop's door while it is open. */
  setShopQueue(count: number): void {
    this.folk.setQueue(Math.min(count, MAX_QUEUE));
  }

  /** Tells the shop's figures where the retro games shop really is, from the boxes in its windows (see `paintView`). */
  placeShop(goods: readonly GoodsRect[]): void {
    this.folk.setShop(goods);
  }

  /**
   * Moves everything `dt` seconds on and rewrites the sprite arrays. `nightness` sends most walkers
   * home at dusk; `wakefulness` (0..1, see `wakefulnessAt`) sends the night owls home too as the
   * city falls asleep and spaces the cars out: at 0.1 a car sets off ten times less often. The
   * `weather` (a `SkyState` will do) carries the rain and snow, and the game hour the dustcart, the
   * van, the shop and the animals keep to. `eye` is where the camera is, metres from the painting's
   * eye (`Outdoors` center): every sprite is placed as seen from there (`pushSprite`).
   */
  update(dt: number, nightness: number, wakefulness = 1, weather: LifeWeather = CLEAR, eye?: THREE.Vector3): void {
    if (eye) this.eye.copy(eye);
    else this.eye.set(0, 0, 0);
    this.slots.length = 0;
    const env = this.env;
    env.hours = weather.hours ?? 12;
    env.nightness = nightness;
    env.dusk = THREE.MathUtils.smoothstep(nightness, 0.3, 0.7);
    env.wakefulness = wakefulness;
    env.rain = weather.rain;
    env.snow = weather.snow;
    env.wet = Math.max(weather.rain, weather.snow);
    env.wind = weather.wind ?? 0;
    for (const layer of this.layers) layer.update(dt, env, this.push);
    this.writeVehicles();

    // Far to near, so nearer sprites are composited over farther ones.
    this.slots.sort(farFirst);
    for (let i = 0; i < SPRITE_COUNT; i++) {
      const slot = this.slots[i];
      this.info[i * 4] = slot ? slot.alpha : 0;
      if (!slot) continue;
      this.rects.set(slot.rect, i * 4);
      this.cells.set(slot.cell, i * 4);
      this.info[i * 4 + 1] = slot.d;
      this.info[i * 4 + 2] = slot.lod;
      this.info[i * 4 + 3] = slot.tint;
    }
  }

  /**
   * Queues a sprite: `bounds` are scenery-texture pixels (left, top, right, bottom) as the painting's
   * eye sees it, `d` its distance on the ground. It is moved to where the camera (`eye`) sees it: the
   * shader matches sprites against the camera ray's own direction, not the scenery point behind them
   * (which slides with the depth of whatever the sprite passes over, and made it wobble), so a car
   * driving straight stays on its line from any window, the balcony included.
   */
  private pushSprite(bounds: Bounds, cell: Cell, d: number, alpha: number, tint: number): void {
    if (this.slots.length >= SPRITE_COUNT || alpha <= 0.01) return;
    const [left, top, right, bottom] = this.seenFromEye(bounds, d);
    const slot = this.pool[this.slots.length]!; // the pool holds SPRITE_COUNT, checked above
    slot.d = d;
    slot.alpha = alpha;
    slot.lod = Math.max(0, Math.log2(cell.h / Math.max(1, bottom - top)));
    slot.tint = tint;
    const { rect, cell: uv } = slot;
    rect[0] = left / SCENE_WIDTH;
    rect[1] = 1 - bottom / SCENE_HEIGHT;
    rect[2] = right / SCENE_WIDTH;
    rect[3] = 1 - top / SCENE_HEIGHT;
    uv[0] = cell.x / ATLAS_W;
    uv[1] = 1 - (cell.y + cell.h) / ATLAS_H;
    uv[2] = (cell.x + cell.w) / ATLAS_W;
    uv[3] = 1 - cell.y / ATLAS_H;
    this.slots.push(slot);
  }

  /** Copies this frame's vehicles and cyclists into the shader's arrays: the nearest to the camera when there are more than the slots. */
  private writeVehicles(): void {
    const vehicles = this.solids;
    vehicles.length = 0;
    vehicles.push(...this.traffic.vehicles, ...this.cyclists.poses);
    const eye = this.eye;
    if (vehicles.length > VEHICLE_COUNT) vehicles.sort((p, q) => Math.hypot(p.x - eye.x, p.z - eye.z) - Math.hypot(q.x - eye.x, q.z - eye.z));
    for (let i = 0; i < VEHICLE_COUNT; i++) {
      const v = vehicles[i];
      const k = i * 4;
      if (!v || v.alpha <= 0.01) {
        this.vehiclePose[k + 3] = -1;
        continue;
      }
      this.vehiclePose[k] = v.x;
      this.vehiclePose[k + 1] = v.z;
      this.vehiclePose[k + 2] = v.heading;
      this.vehiclePose[k + 3] = v.kind;
      this.vehicleLook[k] = v.paint;
      this.vehicleLook[k + 1] = v.alpha;
    }
  }

  /** Bounds from the painting's eye turned into bounds from the camera (`eye`), for a sprite `d` metres out on the ground. */
  private seenFromEye(bounds: Bounds, d: number): Bounds {
    const { x: ox, y: oy, z: oz } = this.eye;
    if (ox === 0 && oy === 0 && oz === 0) return bounds;
    const [left, top, right, bottom] = bounds;
    const a = (((left + right) / 2) / SCENE_WIDTH - 0.5) * Math.PI * 2;
    const heightAt = (y: number): number => EYE_HEIGHT + Math.tan(ELEVATION_MIN + (1 - y / SCENE_HEIGHT) * (ELEVATION_MAX - ELEVATION_MIN)) * d;
    const dx = Math.sin(a) * d - ox;
    const dz = Math.cos(a) * d - oz;
    const near = Math.max(0.5, Math.hypot(dx, dz));
    const half = ((right - left) / 2) * (d / near);
    const centre = azimuthX(Math.atan2(dx, dz));
    const elevation = (y: number): number => elevationY(Math.atan2(heightAt(y) - EYE_HEIGHT - oy, near));
    const out = this.scratch;
    out[0] = centre - half;
    out[1] = elevation(top);
    out[2] = centre + half;
    out[3] = elevation(bottom);
    return out;
  }

  /**
   * The atlas, each painter packing its cells in turn (see the constructor for the order). Lights
   * (headlights, tail lights, the beam on the road, lamps, a cigarette's tip) go to the glow canvas.
   */
  private paintAtlas(color: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, painters: readonly Pick<LifeLayer, 'paint'>[]): void {
    let penX = 0;
    let penY = 0;
    let rowH = 0;
    const place = (w: number, h: number): Cell => {
      if (penX + w > ATLAS_W) {
        penX = 0;
        penY += rowH;
        rowH = 0;
      }
      const cell = { x: penX, y: penY, w, h };
      penX += w;
      rowH = Math.max(rowH, h);
      return cell;
    };
    const pens: AtlasPens = { place, color, glow };
    for (const painter of painters) painter.paint(pens);
    if (penY + rowH > ATLAS_H) console.warn('[outdoors] sprite atlas overflow');
    this.atlasUsed = penY + rowH;
  }
}
