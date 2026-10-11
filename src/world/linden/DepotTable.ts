import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { Game, BoxCondition } from '@/catalog/types';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { StockItem } from '@/economy/StockItem';
import { DEPOT_WHERE } from '@/economy/pricing';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { pick, random } from '@/random';
import { gameDayRandom } from '@/time/daily';
import { formatCoins } from '@/text/money';
import { weekdayOf } from '@/time/wakefulness';
import type { Furniture } from '../Furniture';
import { invisibleHitbox } from '../meshUtils';
import { part } from '../props/Prop';
import { shared } from '../materials/palette';
import { snowPaint } from '../street/snowCover';
import { bareMetal } from '../street/metals';
import { ForSaleBox } from '../market/ForSaleBox';

/** Where the table's boxes go: the zone (they must be placed to be clickable). */
interface DepotHost {
  place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F;
  remove(item: Furniture): void;
  toLocal(point: THREE.Vector3): THREE.Vector3;
  onUnload(fn: () => void): void;
}

interface DepotOptions {
  host: DepotHost;
  covers: BoxArtLoader;
  wallet: { readonly coins: number; subscribe(cb: () => void): () => void };
  /** Games from the index at large, seeded (`MarketStock.randomGames`). */
  games: (seed: string, count: number) => Promise<Game[]>;
  /** The flea market's bargain-bin price: the depot asks a little over it. */
  binPrice: () => number;
  owns: (id: string) => boolean;
  isWanted: (id: string) => boolean;
  /** The game day (the table is laid out anew each week). */
  day: () => number;
  /** How many games are on it. */
  count: number;
}

const TABLE = { width: 1.6, depth: 0.7, height: 0.74 };
/** What the depot asks over the bin's price, by the copy's state. */
const OVER_BIN: Record<BoxCondition, number> = { complete: 2, noManual: 1, worn: 0 };
const CONDITIONS: readonly BoxCondition[] = ['complete', 'noManual', 'noManual', 'worn'];
const THANKS = ['You’re Madame Aubry’s grandchild? She talks about you all the time.', 'Off a gentleman on the third floor. He’ll be glad it found a home.', 'Coins in the saucer by the till, thank you.', 'Come back next week, I get boxes in on Mondays.'];

/**
 * The dépôt-vente's trestle out on Linden Avenue's pavement (docs/grandma.md "Around her flat"): a few games the
 * neighbourhood left to be sold, laid out anew each Monday (seeded by the week, so a reload lays the same ones),
 * at a little over the flea market's bin price by their state; bought like any market copy (`ForSaleBox`: pick one
 * up to look, B buys), the ones bought gone for the week. A different stock from Front Street's: drawn from the whole
 * index (`MarketStock.randomGames`), not the stalls'. Origin on the pavement at the table's middle, +z the buyer's side.
 */
export class DepotTable extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private onTable = 0;
  private filled = false;

  constructor(private readonly options: DepotOptions) {
    super();
    this.name = 'DepotTable';
    const { width, depth, height } = TABLE;
    const legs = shared('linden|depot-legs', () => bareMetal({ color: 0x8a8e92, roughness: 0.45 }));
    for (const x of [-width / 2 + 0.1, width / 2 - 0.1]) {
      for (const z of [-1, 1]) {
        const leg = part(this, 0.03, height * 1.04, 0.03, legs, { x, y: height / 2, z: z * (depth / 2 - 0.12) });
        leg.rotation.x = z * 0.18;
      }
    }
    part(this, width, 0.03, depth, snowPaint(0xe0d6c4, 0.8), { y: height });
    part(this, width + 0.04, 0.24, depth + 0.04, snowPaint(0x6a2a32, 0.95), { y: height - 0.12 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.36), new THREE.MeshStandardMaterial({ map: signTexture(options.binPrice()), roughness: 0.9 }));
    sign.position.set(-width / 2 + 0.3, height + 0.2, -depth / 2 + 0.08);
    sign.rotation.x = -0.2;
    sign.castShadow = true;
    this.add(sign);
    const hitbox = invisibleHitbox(width, height, depth, { y: height / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    const { width, depth, height } = TABLE;
    return new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, height, depth / 2));
  }

  setHovered(): void {
    // A trestle table does not glow.
  }

  label(): string {
    return 'Dépôt-vente · have a look';
  }

  activate(session: SessionActions): void {
    if (!this.filled) session.react('“Still pricing this week’s, give me a minute.”');
    else if (this.onTable > 0) session.react('Left by the neighbours to be sold. Pick one up to look at it.');
    else session.react('“Cleaned out! New boxes come in on Mondays.”');
  }

  /** Lays this week's games (once placed in the zone): drawn, then each on the cloth with its tag. */
  async fill(): Promise<void> {
    const { host, games, count, owns, day } = this.options;
    let gone = false;
    host.onUnload(() => (gone = true));
    // The week by its Monday (new boxes come in on Mondays).
    const week = day() - weekdayOf(day());
    const sold = soldThisWeek(week);
    const drawn = await games(`linden-depot:${week}`, count * 3).catch(() => [] as Game[]);
    if (gone) return;
    this.filled = true;
    const rng = gameDayRandom('linden-depot-state', week);
    const chosen = drawn.filter((game) => !owns(game.id) || sold.includes(game.id)).slice(0, count).filter((game) => !sold.includes(game.id));
    const spacing = TABLE.width / (chosen.length + 1);
    chosen.forEach((game, i) => this.lay(game, pick(rng, CONDITIONS), -TABLE.width / 2 + spacing * (i + 1), rng() - 0.5, week));
  }

  private lay(game: Game, condition: BoxCondition, x: number, turn: number, week: number): void {
    const { host, covers, wallet, binPrice, isWanted } = this.options;
    const item = new StockItem(game, condition, 'bin', { list: binPrice() + OVER_BIN[condition], final: true }, { firm: true });
    const box = new ForSaleBox(item, covers, {
      pose: { kind: 'flat' },
      wallet,
      where: DEPOT_WHERE,
      isWanted: () => isWanted(game.id),
      thanks: () => pick(random, THANKS),
    });
    const at = host.toLocal(this.localToWorld(new THREE.Vector3(x, TABLE.height + 0.016, 0.06)));
    const place = (): void => {
      host.place(box, at, this.rotation.y + turn * 0.3);
    };
    box.onSold = () => {
      host.remove(box);
      markSold(week, game.id);
      this.onTable--;
    };
    box.restock = () => {
      place();
      unmarkSold(week, game.id);
      this.onTable++;
    };
    place();
    this.onTable++;
  }
}

/** The games bought off the trestle in one game week (its Monday's game day): a reload that week does not lay them again. */
interface DepotState {
  week: number;
  sold: string[];
}

const store = new PersistedStore<DepotState>({
  key: KEYS.lindenDepot,
  version: 1,
  storage: safeStorage(),
  defaults: () => ({ week: -1, sold: [] }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const o = data as Partial<DepotState>;
    return { week: typeof o.week === 'number' ? o.week : -1, sold: Array.isArray(o.sold) ? o.sold.filter((id): id is string => typeof id === 'string') : [] };
  },
});

function soldThisWeek(week: number): string[] {
  const state = store.load();
  return state.week === week ? state.sold : [];
}

function markSold(week: number, id: string): void {
  store.save({ week, sold: [...soldThisWeek(week), id] });
}

function unmarkSold(week: number, id: string): void {
  store.save({ week, sold: soldThisWeek(week).filter((sold) => sold !== id) });
}

/** The cardboard sign: DÉPÔT-VENTE, the price from the bin's, pay inside. */
function signTexture(price: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(300, 216);
  ctx.fillStyle = '#e8dcc0';
  ctx.fillRect(0, 0, 300, 216);
  ctx.fillStyle = '#2a2018';
  ctx.textAlign = 'center';
  ctx.font = 'bold 38px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.fillText('DÉPÔT-VENTE', 150, 58, 280);
  ctx.font = 'bold 28px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.fillText(`games from ${formatCoins(price)}`, 150, 112, 280);
  ctx.font = '22px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.fillText('new boxes every Monday', 150, 160, 280);
  ctx.fillText('pay at the till inside', 150, 192, 280);
  return toTexture(canvas);
}
