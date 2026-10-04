import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { SaleReaction } from '@/game/SessionActions';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { ESTATE_SALE, marketPrice } from '@/economy/pricing';
import type { Views } from '@/economy/Fame';
import { GRAILS, grailGame } from '@/economy/grails';
import { StockItem } from '@/economy/StockItem';
import { drawCondition } from '@/economy/stockDraws';
import { seeded } from '@/economy/seeded';
import { drawGames, pricedCopy, type ReleasePool } from '@/building/pricedCopy';
import { ESTATE, EstateDealer, estatePhase, estateSold, estateStart } from '@/building/estateSale';
import type { Furniture } from '../Furniture';
import { ForSaleBox, type ForSaleBoxOptions } from '../market/ForSaleBox';
import { Walker } from '../people/Walker';
import { randomLook } from '../people/looks';
import { boxMesh } from '../meshUtils';
import { paint, timber } from '../materials/palette';

/** Where the sale's things go: the stairwell's zone (they must be placed to be clickable, and to collide). */
interface EstateHost {
  place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F;
  remove(item: Furniture): void;
}

/** Where the table, the crate and the family's niece stand in the hall (zone-local), as `STAIRWELL_PLAN.estateSale` says. */
interface EstateSpots {
  table: { at: [x: number, z: number]; yaw: number };
  crate: { at: [x: number, z: number]; yaw: number };
  seller: { at: [x: number, z: number]; yaw: number; seed: number };
  /** The hours the table is laid (game hours); out of them it is cleared away for the night. */
  hours: [number, number];
}

interface EstateSaleOptions {
  host: EstateHost;
  spots: EstateSpots;
  covers: BoxArtLoader;
  wallet: ForSaleBoxOptions['wallet'];
  isWanted: (id: string) => boolean;
  owns: (id: string) => boolean;
  /** The market's index of releases, the games are drawn from. */
  pool: ReleasePool;
  viewer: THREE.Object3D;
  day: () => number;
  hours: () => number;
}

const TABLE = { length: 1.5, depth: 0.6, height: 0.74 };
const CRATE = { width: 0.5, depth: 0.36, height: 0.28 };
/** Seconds between two looks at the day and the hour. */
const LOOK_EVERY = 2;
/** Copies lying on the table: two rows. */
const ROWS = 2;
const THANKS = ['He’d be glad it went to someone who cares.', 'Thank you. One less box to carry.', 'Take good care of it.', 'My uncle would have haggled harder. Enjoy it.'];
const LINES = [
  'My uncle Henri. Forty years of cartridges, and he never let anyone in to see them.',
  'We found them in every cupboard. Under the bed. In the oven, I swear.',
  'I don’t know what any of it is worth. Make me an offer, but be kind.',
  'Have a dig in the crate at the end. That’s what was left at the back of the wardrobe.',
  'He was on the third, at the back, over the courtyard. Nobody ever saw him on the stairs.',
];
const REACTIONS: Partial<Record<SaleReaction, string[]>> = {
  pickUp: ['That one was on his bedside table.', 'He had a list for everything. I can’t find the list.'],
  haggleWon: ['Fine, fine. It’s yours.', 'You drive a hard bargain. He would have liked you.'],
  haggleLost: ['No, I think that’s too low. Sorry.'],
  insult: ['That’s a bit rude, with him barely gone.'],
  bought: ['Thank you.'],
};

/** A copy on the family's tables: a market box whose haggle and sale are theirs (`ForSaleLike.dealer`). */
class EstateBox extends ForSaleBox {
  dealer?: EstateDealer;
}

/**
 * The estate sale in the entrance hall (`building/estateSale`), on its days and in its hours: a trestle table along
 * the wall with the late Mr Lambert's games lying face up (drawn once from the index for the sale, at a family's
 * prices: `ESTATE_SALE.discount`, a couple of them his collector's pieces), an open crate at the end with what was
 * left at the back of his wardrobe, the grail at the bottom under two others (bought off the top, it shows), and his
 * niece by the table to talk to, who haggles (`EstateDealer`: no holds, no swaps). Every part is placed into the
 * zone when the sale is on and taken out when it is not: off its days it costs nothing but this tick every
 * `LOOK_EVERY` seconds. Origin: the zone's; never collides itself.
 */
export class EstateSale extends THREE.Group implements Furniture, Updatable {
  readonly footprint = new THREE.Box3();
  readonly contactShadow = false;
  private readonly table: SaleFurniture;
  private readonly crate: SaleFurniture;
  private readonly seller: Walker;
  private readonly dealer: EstateDealer;
  private boxes: EstateBox[] = [];
  private stock: Promise<StockItem[]> | null = null;
  private shown = false;
  private clock = LOOK_EVERY;
  private disposed = false;

  constructor(private readonly options: EstateSaleOptions) {
    super();
    this.name = 'EstateSale';
    this.table = new SaleFurniture(saleTable(), new THREE.Box3(new THREE.Vector3(-TABLE.length / 2, 0, -TABLE.depth / 2), new THREE.Vector3(TABLE.length / 2, TABLE.height, TABLE.depth / 2)));
    this.crate = new SaleFurniture(openCrate(), new THREE.Box3(new THREE.Vector3(-CRATE.width / 2, 0, -CRATE.depth / 2), new THREE.Vector3(CRATE.width / 2, CRATE.height, CRATE.depth / 2)));
    const { seller } = options.spots;
    this.seller = new Walker({ viewer: options.viewer, seed: seller.seed, look: randomLook(seller.seed + 900, 'shopper'), lines: LINES, label: `${ESTATE.family} · chat`, speaker: ESTATE.family, yields: false });
    this.dealer = new EstateDealer(options.day);
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock < LOOK_EVERY) return;
    this.clock = 0;
    const { day, hours, spots } = this.options;
    const h = hours();
    const on = estatePhase(day()) === 'on' && h >= spots.hours[0] && h < spots.hours[1];
    if (on !== this.shown) this.setShown(on);
  }

  private setShown(shown: boolean): void {
    this.shown = shown;
    const { host, spots } = this.options;
    const at = (xz: [number, number]) => new THREE.Vector3(xz[0], 0, xz[1]);
    if (shown) {
      host.place(this.table, at(spots.table.at), spots.table.yaw);
      host.place(this.crate, at(spots.crate.at), spots.crate.yaw);
      this.seller.setPresent(true, at(spots.seller.at));
      this.seller.rotation.y = spots.seller.yaw;
      host.place(this.seller, at(spots.seller.at), spots.seller.yaw);
      this.seller.stand(spots.seller.yaw, 'crossed', 'viewer');
      void this.lay();
      return;
    }
    host.remove(this.table);
    host.remove(this.crate);
    host.remove(this.seller);
    for (const box of this.boxes) if (!box.isHeld) host.remove(box);
  }

  /** The sale's copies, drawn once (the same for the whole sale, by its first day), laid on the table and in the crate. */
  private async lay(): Promise<void> {
    this.stock ??= this.draw();
    const items = await this.stock;
    if (!this.shown || this.disposed) return;
    if (!this.boxes.length) this.makeBoxes(items);
    for (const box of this.boxes) if (!box.isHeld && !estateSold(box.item.game.id)) this.placeBox(box);
  }

  private async draw(): Promise<StockItem[]> {
    const { pool, owns, day } = this.options;
    const start = estateStart(day()) ?? day();
    const rng = seeded(`estate:${start}`);
    const platforms = PLATFORM_LIST.map((p) => p.id);
    const games = await drawGames(pool, `estate:${start}`, platforms, ESTATE_SALE.copies + 2, (id) => owns(id) && !estateSold(id));
    const items = games.map((game, i) => {
      const condition = drawCondition(rng());
      // A couple of his collector's pieces, priced as such; the rest as a family clearing a flat prices them.
      const piece = i === 1 || i === 4;
      const price = (views: Views) => marketPrice(game, views, condition, ESTATE_SALE.discount * (piece ? 1.35 : 1));
      return pricedCopy(game, condition, piece ? 'estate' : 'stall', price);
    });
    // At the bottom of the crate, the grail they do not know about (none if the player has it already).
    const grail = GRAILS[Math.floor(rng() * GRAILS.length)]!;
    const grailCopy = grailGame(grail);
    if (!owns(grailCopy.id) || estateSold(grailCopy.id)) items.push(new StockItem(grailCopy, 'noManual', 'stall', { list: Math.round(grail.price * ESTATE_SALE.grailShare), final: true }));
    return items;
  }

  /** One box per copy: the table's face up in two rows, the last three in the crate, piled flat (the grail at the bottom). */
  private makeBoxes(items: readonly StockItem[]): void {
    const { covers, wallet, isWanted } = this.options;
    this.boxes = items.map((item, i) => {
      const box = new EstateBox(item, covers, {
        pose: { kind: 'flat' },
        // The crate's pile has no tags: the price shows on a closer look.
        tag: i < items.length - 3,
        wallet,
        where: `${ESTATE.deceased}’s estate sale`,
        isWanted: () => isWanted(item.game.id),
        thanks: () => THANKS[Math.floor(Math.random() * THANKS.length)]!,
        react: (reaction) => {
          const lines = REACTIONS[reaction];
          if (lines) this.seller.say(lines[Math.floor(Math.random() * lines.length)]!);
        },
        speak: (line) => this.seller.speak(line),
      });
      box.dealer = this.dealer;
      box.onSold = () => this.options.host.remove(box);
      box.restock = () => this.placeBox(box);
      return box;
    });
  }

  /** Where box `box` lies: on the table, or in the crate (the last three, piled up from the bottom: the grail first). */
  private placeBox(box: EstateBox): void {
    if (!this.shown) return;
    const i = this.boxes.indexOf(box);
    const inCrate = this.boxes.length - 1 - i;
    if (inCrate < 3) {
      // The grail is the last copy: the bottom of the pile, the two before it on top.
      const level = inCrate;
      const local = new THREE.Vector3(-0.08 + level * 0.07, 0.03 + level * 0.032, -0.03 + level * 0.02);
      this.options.host.place(box, this.crate.localToWorldOf(local), this.crate.rotation.y + level * 0.25);
      return;
    }
    const perRow = Math.ceil((this.boxes.length - 3) / ROWS);
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const local = new THREE.Vector3(-TABLE.length / 2 + (TABLE.length / perRow) * (col + 0.5), TABLE.height + 0.016, row === 0 ? 0.13 : -0.15);
    this.options.host.place(box, this.table.localToWorldOf(local), this.table.rotation.y + ((i * 37) % 7 - 3) * 0.03);
  }

  dispose(): void {
    this.disposed = true;
    for (const box of this.boxes) box.dispose();
    this.boxes = [];
  }
}

/** A piece of the sale's furniture, placed and taken out with it: its group, its footprint. */
class SaleFurniture extends THREE.Group implements Furniture {
  constructor(object: THREE.Object3D, readonly footprint: THREE.Box3) {
    super();
    this.add(object);
  }

  /** A point of this piece's frame in the frame of the zone it stands in (its parent's). */
  localToWorldOf(local: THREE.Vector3): THREE.Vector3 {
    return local.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y).add(this.position);
  }
}

/** A pasting table on trestles under a cloth, long side along x, the buyer's side +z. */
function saleTable(): THREE.Group {
  const g = new THREE.Group();
  const legs = timber(0x8a6a48, 0.7);
  for (const x of [-TABLE.length / 2 + 0.12, TABLE.length / 2 - 0.12]) {
    for (const z of [-TABLE.depth / 2 + 0.06, TABLE.depth / 2 - 0.06]) g.add(boxMesh(0.035, TABLE.height - 0.03, 0.035, legs, { x, y: (TABLE.height - 0.03) / 2, z }));
  }
  g.add(boxMesh(TABLE.length, 0.025, TABLE.depth, timber(0xc8b08a, 0.6), { y: TABLE.height - 0.0125 }));
  // A white sheet over it, hanging a little down the front.
  g.add(boxMesh(TABLE.length + 0.02, 0.004, TABLE.depth + 0.02, paint(0xe8e4da, 0.95), { y: TABLE.height + 0.002 }));
  g.add(boxMesh(TABLE.length + 0.02, 0.18, 0.004, paint(0xe8e4da, 0.95), { y: TABLE.height - 0.09, z: TABLE.depth / 2 + 0.012 }));
  return g;
}

/** An open wooden crate on the floor, low sides, a scrawled "JEUX" on the front. */
function openCrate(): THREE.Group {
  const g = new THREE.Group();
  const pine = timber(0xa8804f, 0.75);
  const t = 0.015;
  g.add(boxMesh(CRATE.width, t, CRATE.depth, pine, { y: t / 2 }));
  for (const sx of [-1, 1]) g.add(boxMesh(t, CRATE.height, CRATE.depth, pine, { x: sx * (CRATE.width / 2 - t / 2), y: CRATE.height / 2 }));
  for (const sz of [-1, 1]) g.add(boxMesh(CRATE.width - 2 * t, CRATE.height * (sz > 0 ? 0.6 : 1), t, pine, { y: (CRATE.height * (sz > 0 ? 0.6 : 1)) / 2, z: sz * (CRATE.depth / 2 - t / 2) }));
  return g;
}
