import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import { createCanvas, hashString, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { dayKey } from '@/economy/calendar';
import { KEYS, PersistedStore } from '@/persistence';
import { StockItem } from '@/economy/StockItem';
import { invisibleHitbox } from '../../meshUtils';
import type { Furniture } from '../../Furniture';
import { ForSaleBox } from '../../market/ForSaleBox';
import { snowCovered } from '../snowCover';

export interface GiveawayBoxOptions {
  /** The zone: the free game must be placed to be clickable. */
  host: { place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F; remove(item: Furniture): void; toLocal(point: THREE.Vector3): THREE.Vector3 };
  covers: BoxArtLoader;
  wallet: { readonly coins: number; subscribe(cb: () => void): () => void };
  /** Today's flea-market stock once drawn (the cast-offs are what the dealers left), else null. */
  stock: () => readonly StockItem[] | null;
  owns: (id: string) => boolean;
  isWanted: (id: string) => boolean;
}

/** Whether today (the real date) somebody leaves a box out: about one day in `oneDayIn`. */
export function isGiveawayDay(oneDayIn: number, date = new Date()): boolean {
  return hashString(`giveaway:${dayKey(date)}`) % oneDayIn === 0;
}

/** The day (`dayKey`) the box's game was taken: a reload that day finds only junk, not another game. */
const taken = new PersistedStore<{ day: string }>({
  key: KEYS.giveaway,
  version: 1,
  defaults: () => ({ day: '' }),
  read: (data) => (typeof data === 'object' && data !== null && typeof (data as { day?: unknown }).day === 'string' ? { day: (data as { day: string }).day } : null),
});

const BOX = { width: 0.5, depth: 0.38, height: 0.3 };
/** Seconds between two looks at the market's stock while the box holds only junk. */
const LOOK_EVERY = 2;
const JUNK = [
  'Old magazines, a tangle of cables, a joypad with no lead. Nothing worth taking, yet.',
  'A cracked keyboard and a stack of manuals for games nobody owns.',
];

/**
 * A cardboard box of cast-offs left out by a front door some days, À DONNER written on its flap:
 * old magazines and cables, and once the flea market's stock is drawn (the dealers have been
 * through the lofts of the street) one worn game in it, free to a good home (`ForSaleBox` at 0
 * coins: click to look, B takes it; no haggling over a gift). Taken, the box is only junk again.
 * Origin on the pavement at the box's centre, +z is the side it is read from.
 */
export class GiveawayBox extends THREE.Group implements Furniture, Updatable, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private game: ForSaleBox | null = null;
  private filled = false;
  private lookClock = LOOK_EVERY;
  private line = 0;

  constructor(private readonly options: GiveawayBoxOptions) {
    super();
    this.name = 'GiveawayBox';
    const { width, depth, height } = BOX;
    const card = snowCovered(new THREE.MeshStandardMaterial({ color: 0xa8804e, roughness: 0.95 }));
    const inside = new THREE.MeshStandardMaterial({ color: 0x6e5232, roughness: 1, side: THREE.BackSide });
    // Four walls and a floor (open on top), the flaps folded out.
    const walls = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth, 1, 1, 1), [card, card, inside, card, card, card]);
    walls.position.y = height / 2;
    const lining = new THREE.Mesh(new THREE.BoxGeometry(width - 0.01, height - 0.01, depth - 0.01), inside);
    lining.position.y = height / 2 + 0.005;
    const sign = new THREE.MeshStandardMaterial({ map: flapTexture(), roughness: 0.95 });
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.16), sign);
    flap.position.set(0, height + 0.03, depth / 2 + 0.06);
    flap.rotation.x = -1.0;
    const back = new THREE.Mesh(new THREE.BoxGeometry(width, 0.005, 0.15), card);
    back.position.set(0, height + 0.05, -depth / 2 - 0.05);
    back.rotation.x = 0.9;
    // What fills it: a stack of magazines and a coil of cable.
    const mags = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.22), new THREE.MeshStandardMaterial({ color: 0xd9383a, roughness: 0.8 }));
    mags.position.set(-0.07, height - 0.12, -0.04);
    mags.rotation.y = 0.3;
    const cable = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.008, 6, 20), new THREE.MeshStandardMaterial({ color: 0x1e1e22, roughness: 0.6 }));
    cable.position.set(0.14, height - 0.05, 0.06);
    cable.rotation.x = Math.PI / 2 - 0.3;
    for (const mesh of [walls, flap, back, mags, cable]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    }
    this.add(lining);
    // Below the rim, so a game lying on the magazines is what the crosshair finds from above.
    const hitbox = invisibleHitbox(width + 0.1, height - 0.08, depth + 0.1, { y: (height - 0.08) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    const { width, depth, height } = BOX;
    return new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, height, depth / 2));
  }

  setHovered(): void {
    // The caption says it all.
  }

  label(): string {
    return 'A box of cast-offs: À DONNER · click to rummage';
  }

  activate(session: SessionActions): void {
    session.hint(this.game ? 'Under the magazines, a game. Free to a good home: click it to look.' : JUNK[this.line++ % JUNK.length]!);
  }

  dispose(): void {
    this.game?.dispose();
  }

  update(dt: number): void {
    if (this.filled) return;
    this.lookClock += dt;
    if (this.lookClock < LOOK_EVERY) return;
    this.lookClock = 0;
    const stock = this.options.stock();
    if (stock) this.fill(stock);
  }

  /** One worn game out of today's bin (seeded by the date), none the player owns, lying on the magazines. */
  private fill(stock: readonly StockItem[]): void {
    this.filled = true;
    if (taken.load().day === dayKey()) return; // today's game is gone already
    const { owns, covers, wallet, isWanted, host } = this.options;
    const pool = stock.filter((item) => item.source === 'bin' && !owns(item.game.id));
    if (!pool.length) return;
    const random = seededRandom(hashString(`giveaway-game:${dayKey()}`));
    const item = pool[Math.floor(random() * pool.length)]!;
    const gift = new StockItem(item.game, 'worn', 'bin', { list: 0, final: true });
    const box = new ForSaleBox(gift, covers, {
      pose: { kind: 'flat' },
      tag: false,
      wallet,
      where: 'a box of cast-offs on Front Street',
      isWanted: () => isWanted(gift.game.id),
      thanks: () => 'Nobody minds: that is what the box is for.',
    });
    const at = host.toLocal(this.localToWorld(new THREE.Vector3(0.02, BOX.height - 0.04, 0.04)));
    const place = (): void => {
      host.place(box, at, this.rotation.y + 0.4);
    };
    box.onSold = () => {
      host.remove(box);
      this.game = null;
      taken.save({ day: dayKey() });
    };
    box.restock = () => {
      place();
      this.game = box;
      taken.remove();
    };
    place();
    this.game = box;
  }
}

/** The flap's lettering, in marker: À DONNER. */
function flapTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 82);
  const random = seededRandom(404);
  ctx.fillStyle = '#b08a56';
  ctx.fillRect(0, 0, 256, 82);
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(90,60,30,0.15)' : 'rgba(230,200,150,0.15)';
    ctx.fillRect(random() * 256, random() * 82, 2, 1);
  }
  ctx.fillStyle = '#1a1614';
  ctx.font = 'bold 44px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('À DONNER', 128, 44);
  return toTexture(canvas, 2);
}
