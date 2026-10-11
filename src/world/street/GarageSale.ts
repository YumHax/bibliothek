import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { StockItem } from '@/economy/StockItem';
import { KEYS } from '@/persistence';
import { DailyList } from '@/time/DailyList';
import { gameDayRandom } from '@/time/daily';
import { streetDay, streetDayMark } from '@/time/streetDay';
import { GARAGE_SALE } from './events/streetSchedules';
import type { Furniture } from '../Furniture';
import { shared } from '../materials/palette';
import { snowPaint } from './snowCover';
import { bareMetal } from './metals';
import { ForSaleBox } from '../market/ForSaleBox';
import { GARAGE_WHERE } from '@/economy/pricing';
import { random as liveRandom } from '@/random';
import { formatCoins } from '@/text/money';
import type { Game } from '@/catalog/types';
import { Walker } from '../people/Walker';
import { markStreet } from '@/social/street/streetMarks';

/** Where the sale's boxes go: the zone (they must be placed to be clickable). */
interface GarageSaleHost {
  place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F;
  remove(item: Furniture): void;
  toLocal(point: THREE.Vector3): THREE.Vector3;
}

interface GarageSaleOptions {
  host: GarageSaleHost;
  covers: BoxArtLoader;
  wallet: { readonly coins: number; subscribe(cb: () => void): () => void };
  /** A loft's worth of games of its own (`MarketStock.randomGames`: not the flea market's stalls), drawn by `seed`. */
  randomGames: (seed: string, count: number) => Promise<Game[]>;
  /** Whose eyes the seller's glances and caption follow: the camera. */
  viewer: THREE.Object3D;
  /** The flat price of the day (the market's bargain-bin price). */
  price: () => number;
  /** Owned copies are never offered. */
  owns: (id: string) => boolean;
  isWanted: (id: string) => boolean;
}

const TABLE = { width: 1.8, depth: 0.75, height: 0.74 };
/** Games on the table, from .. to; and how many more are drawn so the owned ones can be left out. */
const LOT = { min: 2, max: 4, spare: 4 };
/** How the loft kept them: some boxed with their manual, most without, some worn (`BoxCondition`). */
const KEPT: readonly [number, 'complete' | 'noManual' | 'worn'][] = [
  [0.2, 'complete'],
  [0.5, 'noManual'],
  [1, 'worn'],
];
/** Who is selling, a different neighbour each garage-sale day: their seed (the body), their name and why. */
const SELLERS: readonly { seed: number; name: string; lines: readonly string[]; thanks: readonly string[] }[] = [
  {
    seed: 1203,
    name: 'Mrs Ward',
    lines: ['My son’s room. He’s thirty-four. I gave him till Easter.', 'He said they’re worth a fortune. I said then come and get them.', 'Everything on the table is the same price. I’m not a shop.'],
    thanks: ['Coins in the tin, ta!', 'He’ll never notice. He never comes round.'],
  },
  {
    seed: 1217,
    name: 'Ted',
    lines: ['Moving to Lisbon. The games don’t fit in the suitcase. Neither does the sofa, if you know anyone.', 'Played every one of those. Well. Most.', 'Flat price, no haggling. I’m too sad to haggle.'],
    thanks: ['Good home, that one.', 'Look after it. It got me through a winter.'],
  },
  {
    seed: 1229,
    name: 'Mr Patel',
    lines: ['The loft, finally. Forty years of “we might need that”.', 'My grandchildren play on telephones now. Telephones!', 'Take your time. I’ve got a flask.'],
    thanks: ['Clearing out the loft. Enjoy it!', 'One less box for the stairs.'],
  },
  {
    seed: 1231,
    name: 'Josie',
    lines: ['Rent’s due. Hence the table.', 'They were my brother’s. He owes me money. It evens out.', 'If you buy two I’ll pretend I didn’t see you haggle.'],
    thanks: ['My brother will never notice.', 'That’s the gas bill sorted. Ta!'],
  },
];

/** The street's day's draw for `topic` (`time/streetDay`: the game day; day 0 before the wiring, a headless check). */
function streetRandom(topic: string): () => number {
  return gameDayRandom(topic, streetDay() ?? 0);
}

/** Who sells at the garage sale today (the same all day): one of the street's neighbours. */
function sellerToday(): (typeof SELLERS)[number] {
  return SELLERS[Math.floor(streetRandom('garage-seller')() * SELLERS.length)]!;
}

/**
 * Whether game `day` is a garage-sale day on Front Street: about one day in the plan's `oneDayIn`, as the
 * sale's schedule says (`events/streetSchedules`, the one rule the paper and the pavement share; the plan's number
 * is passed by the builder and read there).
 */
export function isGarageSaleDay(_oneDayIn: number, day: number): boolean {
  return GARAGE_SALE.isDay(day);
}

/**
 * A folding table on the pavement on garage-sale days: a cloth, a cardboard sign, two to four loose games out of a
 * neighbour's loft, all at the day's flat price, bought like any market copy (`ForSaleBox`: click to look, B buys, O
 * opens; no haggling at a garage sale, it is bin pricing), and the neighbour selling them behind it (one of
 * `SELLERS` a day: a word when clicked, their thanks when something goes). The games are the loft's own, drawn for
 * the day (`randomGames`, seeded by the date: never the flea market's stalls), kept as the loft kept them (a few
 * complete, most without their manual, some worn); a copy off this table is a moment of the street's (`streetMarks`).
 * Origin on the pavement at the table's centre, +z is the buyer's side.
 */
export class GarageSale extends THREE.Group implements Furniture, Updatable, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly boxes: ForSaleBox[] = [];
  /** The games still on the table (bought ones leave it). */
  private onTable = 0;
  private filled = false;
  /** The loft's games asked for once (the draw is a promise). */
  private asked = false;
  private readonly seller = sellerToday();
  private readonly person: Walker;
  private line = 0;

  constructor(private readonly options: GarageSaleOptions) {
    super();
    this.name = 'GarageSale';
    const { width, depth, height } = TABLE;
    const legs = shared('street|trestle-legs', () => bareMetal({ color: 0x9aa0a6, roughness: 0.4 }));
    for (const x of [-width / 2 + 0.1, width / 2 - 0.1]) {
      for (const z of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, height * 1.05, 6), legs);
        leg.position.set(x, height / 2, z * (depth / 2 - 0.12));
        leg.rotation.x = z * 0.18;
        this.add(leg);
      }
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.03, depth), snowPaint(0xe8dcc6, 0.8));
    top.position.y = height;
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.26, depth + 0.04), snowPaint(0x3a6a8a, 0.95));
    cloth.position.y = height - 0.12;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.44), new THREE.MeshStandardMaterial({ map: signTexture(options.price()), roughness: 0.9 }));
    sign.position.set(-width / 2 + 0.35, height + 0.22, -depth / 2 + 0.1);
    sign.rotation.x = -0.2;
    for (const mesh of [top, cloth, sign]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    }
    // The table itself answers a click (the games on it are their own `ForSaleBox`es, hit first when looked at).
    const hitbox = invisibleHitbox(width, height, depth, { y: height / 2 });
    // The neighbour selling, behind the table (the far side from the buyer), arms crossed, a word when clicked.
    this.person = new Walker({ viewer: options.viewer, seed: this.seller.seed, label: `${this.seller.name} · chat`, speaker: this.seller.name, lines: this.seller.lines, fade: true });
    this.person.traverse((o) => {
      o.castShadow = false;
    });
    this.person.position.set(width * 0.2, 0, -depth / 2 - 0.45);
    this.person.stand(0, 'crossed');
    this.add(this.person);
    this.hitboxes = [hitbox, ...this.person.hitboxes];
    this.add(hitbox);
  }

  /** The seller, for the street's people budget (`life/PeopleBudget`): drawn only while among the nearest few. */
  get figure(): Walker {
    return this.person;
  }

  setHovered(): void {
    // A trestle table does not glow.
  }

  label(): string {
    return `Garage sale · ${this.seller.name}`;
  }

  /** What the table holds now: loft games at the flat price, still being unpacked, or picked clean; in the seller's words. */
  activate(session: SessionActions): void {
    const price = this.options.price();
    if (!this.filled) this.person.speak(`Still unpacking, love. Games ${formatCoins(price)} each. There’s more at the flea market, in RETRO GAMES.`);
    else if (this.onTable > 0) {
      this.person.speak(this.seller.lines[this.line++ % this.seller.lines.length]!);
      session.react(`Loft finds, ${formatCoins(price)} each, no haggling. Pick one up to look at it.`);
    } else this.person.speak('Picked clean! A box of cables and a broken joypad are all that’s left. Want the joypad?');
  }

  get footprint(): THREE.Box3 {
    const { width, depth, height } = TABLE;
    return new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, height, depth / 2));
  }

  dispose(): void {
    for (const box of this.boxes) box.dispose();
  }

  update(dt: number): void {
    this.person.update(dt);
    if (this.asked) return;
    this.asked = true;
    // The loft's own games, the same all day (seeded by the date); the owned ones left out.
    const seed = `garage:${streetDay() ?? 0}`;
    void this.options
      .randomGames(seed, LOT.max + LOT.spare)
      .catch(() => [])
      .then((games) => this.fill(games));
  }

  /** Two to four of the loft's games (seeded by the date), none the player owns, laid face up on the table. */
  private fill(games: readonly Game[]): void {
    if (this.filled || !this.parent) return;
    this.filled = true;
    const { owns, price, covers, wallet, isWanted, host } = this.options;
    const random = streetRandom('garage-table');
    // What was bought off this table today stays in the draw (so a reload lays the same table) but is not laid again.
    const soldToday = sales.today();
    const pool = games.filter((game) => !owns(game.id) || soldToday.includes(game.id));
    const count = Math.min(pool.length, LOT.min + Math.floor(random() * (LOT.max - LOT.min + 1)));
    const drawn: StockItem[] = pool.slice(0, count).map((game) => {
      const r = random();
      const kept = KEPT.find(([upTo]) => r < upTo)?.[1] ?? 'worn';
      return new StockItem(game, kept, 'bin', { list: price(), final: true });
    });
    const chosen = drawn.filter((item) => !soldToday.includes(item.game.id));
    if (!chosen.length) return;
    const spacing = TABLE.width / (chosen.length + 1);
    chosen.forEach((item, i) => {
      const box = new ForSaleBox(item, covers, {
        pose: { kind: 'flat' },
        wallet,
        where: GARAGE_WHERE,
        isWanted: () => isWanted(item.game.id),
        thanks: () => this.seller.thanks[Math.floor(liveRandom() * this.seller.thanks.length)]!,
      });
      const at = host.toLocal(this.localToWorld(new THREE.Vector3(-TABLE.width / 2 + spacing * (i + 1), TABLE.height + 0.016, 0.08)));
      const place = (): void => {
        host.place(box, at, this.rotation.y + (random() - 0.5) * 0.3);
      };
      box.onSold = () => {
        host.remove(box);
        sales.add(item.game.id);
        this.onTable--;
        markStreet('garageFind');
      };
      box.restock = () => {
        place();
        sales.remove(item.game.id);
        this.onTable++;
      };
      place();
      this.boxes.push(box);
      this.onTable++;
    });
  }
}

/**
 * The games bought off the table on one game day (`{ day, sold }`): a reload that day does not
 * lay new ones in their place; one handed back is removed.
 */
const sales = new DailyList<string>({
  key: KEYS.garageSale,
  version: 1,
  field: 'sold',
  isItem: (id): id is string => typeof id === 'string',
  mark: streetDayMark,
});

/** The cardboard sign: GARAGE SALE, the flat price, and the arrow across the street. */
function signTexture(price: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(320, 228);
  ctx.fillStyle = '#c9a26a';
  ctx.fillRect(0, 0, 320, 228);
  ctx.fillStyle = '#2a2018';
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.fillText('GARAGE SALE', 160, 58, 296);
  ctx.font = 'bold 30px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.fillText(`games ${formatCoins(price)}`, 160, 112);
  ctx.font = '22px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.fillText('more inside RETRO GAMES ➜', 160, 170, 296);
  ctx.fillText('(the flea market, at the back)', 160, 200, 296);
  return toTexture(canvas, 'facing');
}
