import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { RETRO_NEWS } from '../props/outdoors/RetroShopLure';
import { Walker } from '../people/Walker';
import { Figure } from './life/Figure';
import type { Vec2 } from './streetPlan';

interface RetroLureOptions {
  /** The banner: its middle on the shop window (zone-local, y up), the way it faces, its size. */
  banner: { at: readonly [number, number, number]; yaw: number; width: number; height: number };
  /** The shop's door (where the queue goes in) and the queue's spots along the pavement, nearest the door first. */
  door: Vec2;
  queue: readonly Vec2[];
  viewer: THREE.Object3D;
  place: (walker: Walker, at: THREE.Vector3) => void;
  talk: () => string;
  drawDistance: number;
  fade: number;
  /** Today's stock colours changed (a new market day): repaint the shop's window and shelves. */
  onStock: (colors: readonly string[]) => void;
  /**
   * What kind of day the market has: how big a crowd its theme draws (`MarketDayTheme.crowd`, 1 ordinary, more on the
   * Grand Flea Fair) and whether a grail is on a stall today. A longer queue then, and it stays all day.
   */
  day?: () => { crowd: number; grail: boolean };
}

/** Seconds between two looks at the news. */
const EVERY = 2;
const SEEDS = [613, 617, 619, 631, 641, 643];

/**
 * RETRO GAMES as the window view shows it from the flat (`props/outdoors/RetroShopLure`, whose
 * `RETRO_NEWS` this reads): on a new market day, until the player has been into the flea market,
 * a NEW IN banner hangs in its window and a few collectors queue along the pavement at its door
 * (as many as the window view's queue, at most the spots there are); once the player has been,
 * the banner comes down and the queue files in through the door. On a new market day the shop's
 * window and shelves show the new stock (`onStock`).
 */
export class RetroLure extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly banner: THREE.Mesh;
  private readonly people: Figure[] = [];
  private readonly eye = new THREE.Vector3();
  private clock = EVERY;
  private stockDay: number;
  private queued = 0;

  constructor(private readonly options: RetroLureOptions) {
    super();
    this.name = 'RetroLure';
    const { banner } = options;
    this.banner = new THREE.Mesh(new THREE.BoxGeometry(banner.width, banner.height, 0.01), new THREE.MeshBasicMaterial({ map: bannerTexture(), fog: true }));
    this.banner.position.set(...banner.at);
    this.banner.rotation.y = banner.yaw;
    this.banner.visible = false;
    this.add(this.banner);
    this.stockDay = RETRO_NEWS.day;
    options.queue.forEach((_, i) => {
      const walker = new Walker({ viewer: options.viewer, seed: SEEDS[i % SEEDS.length]!, speed: 1, talk: options.talk, label: 'Collector · say hello', labelWithin: 4, fade: true });
      walker.traverse((o) => {
        o.castShadow = false;
      });
      options.place(walker, new THREE.Vector3());
      this.people.push(new Figure(walker));
    });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setZoneActive(active: boolean): void {
    // Arriving, the queue is already there (or not).
    if (active) this.clock = EVERY;
    if (active) this.look(true);
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock >= EVERY) this.look(false);
    this.options.viewer.getWorldPosition(this.eye);
    for (const p of this.people) p.update(dt, this.eye, this.options.drawDistance, this.options.fade);
  }

  private look(instantly: boolean): void {
    this.clock = 0;
    const news = RETRO_NEWS;
    if (news.colors && news.day !== this.stockDay) {
      this.stockDay = news.day;
      this.options.onStock(news.colors);
    }
    this.banner.visible = news.fresh;
    const day = this.options.day?.() ?? { crowd: 1, grail: false };
    // A big day (the Fair, a grail on a stall) queues longer, and still queues after the player has been in.
    const big = day.crowd > 1.15 || day.grail;
    const base = Math.round(news.queue * day.crowd) + (day.grail ? 2 : 0);
    const want = news.fresh || big ? Math.min(this.people.length, Math.max(big ? 3 : 1, base)) : 0;
    if (want === this.queued) return;
    const { queue, door } = this.options;
    // Newcomers join at the back; when it is over, everyone files in through the door.
    for (let i = 0; i < this.people.length; i++) {
      const figure = this.people[i]!;
      const spot = queue[i]!;
      if (i < want && !figure.shown) {
        figure.show(new THREE.Vector3(spot[0], 0, spot[1]), instantly);
        figure.walker.stand(towards(spot, door), i % 2 ? 'crossed' : 'pockets');
      } else if (i >= want && figure.shown) {
        if (instantly) figure.hide(true);
        else figure.walker.walk([new THREE.Vector3(door[0], 0, door[1] - 0.3)], () => figure.hide());
      }
    }
    this.queued = want;
  }
}

/** The yaw (0 = +z) looking from `from` towards `to`. */
function towards([x0, z0]: Vec2, [x1, z1]: Vec2): number {
  return Math.atan2(x1 - x0, z1 - z0);
}

/** NEW IN, hand-lettered on a yellow card with a starburst. */
function bannerTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 144);
  ctx.fillStyle = '#ffd22a';
  ctx.fillRect(0, 0, 512, 144);
  ctx.strokeStyle = '#c8201a';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 500, 132);
  ctx.fillStyle = '#c8201a';
  ctx.font = 'bold 88px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NEW IN!', 256, 76);
  return toTexture(canvas, 'facing');
}
