import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import { createCanvas, hashString, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { dayKey } from '@/economy/calendar';
import { StockItem } from '@/economy/StockItem';
import { KEYS, PersistedStore } from '@/persistence';
import type { Furniture } from '../Furniture';
import { ForSaleBox } from '../market/ForSaleBox';

/** Where the sale's boxes go: the zone (they must be placed to be clickable). */
export interface GarageSaleHost {
  place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F;
  remove(item: Furniture): void;
  toLocal(point: THREE.Vector3): THREE.Vector3;
}

export interface GarageSaleOptions {
  host: GarageSaleHost;
  covers: BoxArtLoader;
  wallet: { readonly coins: number; subscribe(cb: () => void): () => void };
  /** Today's flea-market stock if it has been drawn (`MarketStock.peekToday()`), else null. */
  stock: () => readonly StockItem[] | null;
  /** The flat price of the day (the market's bargain-bin price). */
  price: () => number;
  /** Owned copies are never offered. */
  owns: (id: string) => boolean;
  isWanted: (id: string) => boolean;
}

const TABLE = { width: 1.8, depth: 0.75, height: 0.74 };
/** Seconds between two looks at the market's stock while the table is still empty. */
const LOOK_EVERY = 2;
const THANKS = ['Coins in the tin, ta!', 'Clearing out the loft. Enjoy it!', 'My brother will never notice.', 'Good home, that one.'];

/**
 * Whether today (the real date) is a garage-sale day on Front Street: about one day in `oneDayIn`.
 */
export function isGarageSaleDay(oneDayIn: number, date = new Date()): boolean {
  return hashString(`garage:${dayKey(date)}`) % oneDayIn === 0;
}

/**
 * A folding table on the pavement on garage-sale days: a cloth, a cardboard sign, and two to four
 * loose games out of somebody's loft, all at the day's flat price, bought like any market copy
 * (`ForSaleBox`: click to look, B buys, O opens; no haggling at a garage sale, it is bin pricing).
 * The games come from the flea market's own pool (today's stock, read-only), so they turn up only
 * once the stock has been drawn (somebody went to the market today); until then the sign points
 * across the street, where there is more inside. Origin on the pavement at the table's centre,
 * +z is the buyer's side.
 */
export class GarageSale extends THREE.Group implements Furniture, Updatable {
  private readonly boxes: ForSaleBox[] = [];
  private filled = false;
  private lookClock = LOOK_EVERY;

  constructor(private readonly options: GarageSaleOptions) {
    super();
    this.name = 'GarageSale';
    const { width, depth, height } = TABLE;
    const legs = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.6 });
    for (const x of [-width / 2 + 0.1, width / 2 - 0.1]) {
      for (const z of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, height * 1.05, 6), legs);
        leg.position.set(x, height / 2, z * (depth / 2 - 0.12));
        leg.rotation.x = z * 0.18;
        this.add(leg);
      }
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.03, depth), new THREE.MeshStandardMaterial({ color: 0xe8dcc6, roughness: 0.8 }));
    top.position.y = height;
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.26, depth + 0.04), new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.95 }));
    cloth.position.y = height - 0.12;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.44), new THREE.MeshStandardMaterial({ map: signTexture(options.price()), roughness: 0.9 }));
    sign.position.set(-width / 2 + 0.35, height + 0.22, -depth / 2 + 0.1);
    sign.rotation.x = -0.2;
    for (const mesh of [top, cloth, sign]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    }
  }

  get footprint(): THREE.Box3 {
    const { width, depth, height } = TABLE;
    return new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, height, depth / 2));
  }

  dispose(): void {
    for (const box of this.boxes) box.dispose();
  }

  update(dt: number): void {
    if (this.filled) return;
    this.lookClock += dt;
    if (this.lookClock < LOOK_EVERY) return;
    this.lookClock = 0;
    const stock = this.options.stock();
    if (stock) this.fill(stock);
  }

  /** Two to four of today's copies (seeded by the date), none the player owns, laid face up on the table. */
  private fill(stock: readonly StockItem[]): void {
    this.filled = true;
    const { owns, price, covers, wallet, isWanted, host } = this.options;
    const random = seededRandom(hashString(`garage-table:${dayKey()}`));
    // What was bought off this table today stays in the draw (so a reload lays the same table) but is not laid again.
    const soldToday = soldHereToday();
    const pool = stock.filter((item) => (item.source === 'stall' || item.source === 'bin') && (!owns(item.game.id) || soldToday.includes(item.game.id)));
    const count = Math.min(pool.length, 2 + Math.floor(random() * 3));
    const drawn: StockItem[] = [];
    while (drawn.length < count) {
      const item = pool.splice(Math.floor(random() * pool.length), 1)[0]!;
      drawn.push(new StockItem(item.game, random() < 0.5 ? 'worn' : 'noManual', 'bin', { list: price(), final: true }));
    }
    const chosen = drawn.filter((item) => !soldToday.includes(item.game.id));
    if (!chosen.length) return;
    const spacing = TABLE.width / (chosen.length + 1);
    chosen.forEach((item, i) => {
      const box = new ForSaleBox(item, covers, {
        pose: { kind: 'flat' },
        wallet,
        where: 'a garage sale on Front Street',
        isWanted: () => isWanted(item.game.id),
        thanks: () => THANKS[Math.floor(Math.random() * THANKS.length)]!,
      });
      const at = host.toLocal(this.localToWorld(new THREE.Vector3(-TABLE.width / 2 + spacing * (i + 1), TABLE.height + 0.016, 0.08)));
      const place = (): void => {
        host.place(box, at, this.rotation.y + (random() - 0.5) * 0.3);
      };
      box.onSold = () => {
        host.remove(box);
        recordSold(item.game.id, true);
      };
      box.restock = () => {
        place();
        recordSold(item.game.id, false);
      };
      place();
      this.boxes.push(box);
    });
  }
}

/** The games bought off the table on one (real) day: a reload that day does not lay new ones in their place. */
const sales = new PersistedStore<{ day: string; sold: string[] }>({
  key: KEYS.garageSale,
  version: 1,
  defaults: () => ({ day: '', sold: [] }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const { day, sold } = data as { day?: unknown; sold?: unknown };
    return typeof day === 'string' && Array.isArray(sold) ? { day, sold: sold.filter((id): id is string => typeof id === 'string') } : null;
  },
});

function soldHereToday(): string[] {
  const saved = sales.load();
  return saved.day === dayKey() ? saved.sold : [];
}

/** `id` was bought here (or handed back: `sold` false). */
function recordSold(id: string, sold: boolean): void {
  const rest = soldHereToday().filter((other) => other !== id);
  sales.save({ day: dayKey(), sold: sold ? [...rest, id] : rest });
}

/** The cardboard sign: GARAGE SALE, the flat price, and the arrow across the street. */
function signTexture(price: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(320, 228);
  ctx.fillStyle = '#c9a26a';
  ctx.fillRect(0, 0, 320, 228);
  ctx.fillStyle = '#2a2018';
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.fillText('GARAGE SALE', 160, 58);
  ctx.font = 'bold 30px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.fillText(`games ${price} coins`, 160, 112);
  ctx.font = '22px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.fillText('more inside RÉTRO JEUX ➜', 160, 170);
  ctx.fillText('(the flea market, at the back)', 160, 200);
  return toTexture(canvas, 2);
}
