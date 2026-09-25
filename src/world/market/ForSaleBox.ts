import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SaleReaction, SessionActions } from '@/game/SessionActions';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import { getPlatform } from '@/catalog/platforms';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { StockItem } from '@/economy/StockItem';
import { BUDGET_LABEL, describeCondition, describeEdition } from '@/economy/pricing';
import { playCoins } from '@/audio/coins';
import type { Furniture } from '../Furniture';
import { GameBox } from '../GameBox';

/** How the box stands: tipped back onto a support by `angle`, or lying face up on the table. */
export type ForSalePose = { kind: 'lean'; angle?: number } | { kind: 'flat' };

export interface ForSaleBoxOptions {
  pose?: ForSalePose;
  /** A price tag at its foot. Default true (the bargain bin has one sign for all). */
  tag?: boolean;
  /** Whose coins decide whether the tag reads as affordable. */
  wallet: { readonly coins: number; subscribe(cb: () => void): () => void };
  /** Whether the game is on the player's wishlist (read live). */
  isWanted?: () => boolean;
  /** What the stallholder says as the coins change hands. */
  thanks?: () => string;
  /** Where it is sold, for the receipt: "the NES stall". */
  where: string;
  /** In a locked glass case (only a trusted player may take it in hand). */
  behindGlass?: boolean;
  /** The stallholder answers what the player does with it. */
  react?: (reaction: SaleReaction) => void;
}

/** How far a displayed box leans back against whatever stands behind it. */
const LEAN = THREE.MathUtils.degToRad(14);
/** Air between the box's top edge and the support it leans on. */
const LEAN_GAP = 0.003;
/** The price tag: big enough to read from the aisle, narrower than the narrowest box (a Game Boy's 0.127). */
const TAG_W = 0.1;
const TAG_H = 0.06;
const INK = '#2a1a10';
const FADED_INK = '#9a8a78';
const THANKS = ['Enjoy it!', 'Pleasure doing business.', 'Good choice, that one.', 'Look after it.'];
/** The label that floats over a box while the player scans the stalls: its size in the world and in pixels. */
const SCAN_W = 0.2;
const SCAN_PX: [number, number] = [320, 120];

/**
 * A copy on sale at the market: a `GameBox` leaning on the crates, lying face up on the table or
 * standing in the bargain bin, with a price tag at its foot. The box itself is not an interactable
 * here; this wrapper owns the hit volume and asks the Session to hand the box over for a closer
 * look (`inspectForSale`), where B buys it and H haggles. Origin on the table where the support
 * meets it (lean) or under the box's centre (flat). +z faces the buyer. Never collides (the table does).
 * The tag repaints when the price settles, a haggle lands, or the wallet crosses the price.
 */
export class ForSaleBox extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  readonly box: GameBox;
  private readonly holder = new THREE.Group();
  private readonly tagMaterial: THREE.MeshStandardMaterial | null = null;
  private readonly wallet: ForSaleBoxOptions['wallet'];
  private readonly isWanted: () => boolean;
  private readonly thanksLine: () => string;
  private readonly unsubscribe: (() => void)[] = [];
  private affordable: boolean;
  private disposed = false;
  /** Where it is sold, for the receipt. */
  readonly where: string;
  readonly behindGlass: boolean;
  private readonly reactTo?: (reaction: SaleReaction) => void;
  private scanLabel: THREE.Sprite | null = null;
  /** False when what the scan label shows has changed since it was painted. */
  private scanPainted = false;
  /** Assigned by the market's builder: takes the box off the stall once bought. */
  onSold?: () => void;
  /** Assigned by the market's builder: puts a copy handed back on its stall again. */
  restock?: () => void;

  constructor(readonly item: StockItem, covers: BoxArtLoader, options: ForSaleBoxOptions) {
    super();
    this.name = `ForSale:${item.game.id}`;
    this.wallet = options.wallet;
    this.isWanted = options.isWanted ?? (() => false);
    this.thanksLine = options.thanks ?? (() => THANKS[Math.floor(Math.random() * THANKS.length)]!);
    this.where = options.where;
    this.behindGlass = options.behindGlass ?? false;
    this.reactTo = options.react;
    this.affordable = this.wallet.coins >= item.price;
    this.box = new GameBox(item.game, covers);
    const { height, depth } = this.box.dimensions;
    const pose = options.pose ?? { kind: 'lean' };
    let tagAt: { y: number; z: number; tilt: number };
    if (pose.kind === 'lean') {
      // Pivot on the box's bottom-back edge, set far enough from the support for the tipped-back top to just touch it.
      const angle = pose.angle ?? LEAN;
      this.holder.rotation.x = -angle;
      this.holder.position.z = height * Math.sin(angle) + LEAN_GAP;
      this.box.position.set(0, height / 2, depth / 2);
      tagAt = { y: TAG_H / 2 - 0.004, z: this.holder.position.z + depth * Math.cos(angle) + 0.02, tilt: -0.35 };
    } else {
      // Face up, top edge away from the buyer.
      this.holder.rotation.x = -Math.PI / 2;
      this.box.position.set(0, 0, depth / 2);
      tagAt = { y: 0.012, z: height / 2 + 0.03, tilt: -1.2 };
    }
    this.box.saveRestPose();
    this.holder.add(this.box);
    this.add(this.holder);

    if (options.tag !== false) {
      this.tagMaterial = new THREE.MeshStandardMaterial({ map: this.paintTag(), roughness: 0.8 });
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(TAG_W, TAG_H), this.tagMaterial);
      tag.position.set(0, tagAt.y, tagAt.z);
      tag.rotation.x = tagAt.tilt;
      this.add(tag);
    }

    this.hitboxes = [this.box];
    this.unsubscribe.push(item.subscribe(() => {
      this.repaintTag();
      if (this.scanLabel?.visible) this.paintScanLabel();
    }));
    this.unsubscribe.push(this.wallet.subscribe(() => {
      const affordable = this.wallet.coins >= this.item.price;
      if (affordable === this.affordable) return;
      this.affordable = affordable;
      this.repaintTag();
    }));
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  get width(): number {
    return this.box.dimensions.width;
  }

  /** True while the box is out of its place (in the player's hand, or on its way). */
  get isHeld(): boolean {
    return this.box.parent !== this.holder;
  }

  get wanted(): boolean {
    return this.isWanted();
  }

  /** Called by the Session once paid for and put away. */
  sold(): void {
    this.onSold?.();
  }

  react(reaction: SaleReaction): void {
    this.reactTo?.(reaction);
  }

  /**
   * Shows (or hides) the title and price floating over the box, for a player scanning the stalls
   * from the aisle; painted on first show and whenever the price changes while shown.
   */
  setScanVisible(visible: boolean): void {
    if (!visible) {
      if (this.scanLabel) this.scanLabel.visible = false;
      return;
    }
    if (!this.scanLabel) {
      const [w, h] = SCAN_PX;
      const [canvas] = createCanvas(w, h);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.scanLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
      this.scanLabel.scale.set(SCAN_W, (SCAN_W * h) / w, 1);
      this.scanLabel.position.set(0, this.box.dimensions.height + 0.1, 0.02);
      this.scanLabel.renderOrder = 9;
      this.add(this.scanLabel);
    }
    if (!this.scanLabel.visible || !this.scanPainted) this.paintScanLabel();
    this.scanLabel.visible = true;
  }

  private paintScanLabel(): void {
    const sprite = this.scanLabel;
    if (!sprite) return;
    const texture = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const [w, h] = SCAN_PX;
    const { item } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(20, 16, 12, 0.82)';
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 16);
    ctx.fill();
    ctx.fillStyle = '#f4ecd8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 30;
    do {
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      size -= 2;
    } while (ctx.measureText(item.game.title).width > w - 30 && size > 14);
    ctx.fillText(item.game.title, w / 2, 40);
    const extra = [describeCondition(item.condition), this.wanted ? '★ wishlist' : ''].filter(Boolean).join(' · ');
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillStyle = !item.priced ? FADED_INK : this.wallet.coins >= item.due ? '#f1d48a' : '#ff9a8a';
    ctx.fillText(item.priced ? `${item.price} coins${extra ? `  ·  ${extra}` : ''}` : 'being priced…', w / 2, 84);
    texture.needsUpdate = true;
    this.scanPainted = true;
  }

  /** Coins change hands: the clink, and the stallholder's word. */
  thanks(): string {
    playCoins();
    return this.thanksLine();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.unsubscribe.splice(0)) off();
    this.box.dispose();
    this.tagMaterial?.map?.dispose();
    this.tagMaterial?.dispose();
    this.scanLabel?.material.map?.dispose();
    this.scanLabel?.material.dispose();
  }

  setHovered(hovered: boolean): void {
    this.box.setHovered(hovered);
  }

  label(): string {
    const { game, price, condition, priced } = this.item;
    const state = describeCondition(condition);
    const platform = getPlatform(game.platform).shortName;
    const what = `${game.title} (${platform}${state ? `, ${state}` : ''})`;
    if (!priced) return `${what} — being priced… click to look closer`;
    const coins = this.wallet.coins;
    const edition = describeEdition(this.item.edition, game.platform);
    const was = this.item.beforeSale;
    const cost = `${price} coin${price > 1 ? 's' : ''}${this.item.haggled ? ' (haggled)' : was !== undefined ? ` (clearance, was ${was})` : ''}${this.item.source === 'grail' ? ' · a grail' : ''}`;
    const due = this.item.due;
    const short = coins < due ? ` · you have ${coins}` : '';
    const wish = this.wanted ? ' · ★ on your wishlist' : '';
    const held = this.item.source === 'ordered' ? ' · your order' : this.item.deposit ? ` · held for you, ${due} to pay` : '';
    const glass = this.behindGlass ? ' · behind glass' : '';
    return `${what}${edition ? `, ${edition}` : ''} — ${cost}${held}${short}${wish}${glass} · click to look closer`;
  }

  activate(session: SessionActions): void {
    session.inspectForSale(this);
  }

  /** Something the tag shows changed (the box may have been sold or unloaded meanwhile). */
  private repaintTag(): void {
    this.scanPainted = false;
    if (this.disposed || !this.tagMaterial) return;
    this.tagMaterial.map?.dispose();
    this.tagMaterial.map = this.paintTag();
    this.tagMaterial.needsUpdate = true;
  }

  /**
   * The tag: the price and a coin; "…" while still being priced; the old price struck out over
   * the new one after a haggle; faded ink when the wallet does not stretch to it; a gold band on
   * a stall's showpiece; a red star when the game is on the wishlist.
   */
  private paintTag(): THREE.Texture {
    const { item } = this;
    const [canvas, ctx] = createCanvas(200, 120);
    const faded = item.priced && !this.affordable;
    const band = tagBand(item);
    ctx.fillStyle = faded ? '#e6dfcc' : '#fff6d6';
    ctx.fillRect(0, 0, 200, 120);
    ctx.strokeStyle = band?.color ?? '#c9a75b';
    ctx.lineWidth = band ? 10 : 6;
    ctx.strokeRect(3, 3, 194, 114);
    if (band) {
      ctx.fillStyle = band.color;
      ctx.fillRect(0, 0, 200, 22);
      ctx.fillStyle = '#fff6d6';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(band.text, 100, 12);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = band ? 70 : 62;
    if (!item.priced) {
      ctx.fillStyle = FADED_INK;
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.fillText('…', 100, y - 8);
      return toTexture(canvas, 2);
    }
    ctx.fillStyle = faded ? FADED_INK : INK;
    // The old price struck out: before a haggle, or before a clearance's cut.
    const struck = item.haggled ? item.tagPrice : item.beforeSale;
    if (struck !== undefined) {
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.fillText(String(struck), 44, y - 30);
      ctx.fillRect(22, y - 31, 44, 3);
      ctx.fillStyle = faded ? FADED_INK : '#8a2a1a';
    }
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.fillText(String(item.price), 88, y);
    ctx.beginPath();
    ctx.arc(160, y, 22, 0, Math.PI * 2);
    ctx.fillStyle = faded ? '#c8b98a' : '#d4a52a';
    ctx.fill();
    ctx.strokeStyle = '#9a731a';
    ctx.lineWidth = 3;
    ctx.stroke();
    if (this.wanted) {
      ctx.fillStyle = '#c8342a';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.fillText('★', 180, band ? 42 : 24);
    }
    return toTexture(canvas, 2);
  }
}

/** The band across the top of a tag, if the copy has something to say for itself. */
function tagBand(item: StockItem): { text: string; color: string } | null {
  if (item.source === 'ordered') return { text: 'PUT BY FOR YOU', color: '#3f7a4a' };
  if (item.deposit) return { text: 'ON HOLD', color: '#2f5f8f' };
  if (item.source === 'keptAside') return { text: 'KEPT FOR YOU', color: '#3f7a4a' };
  if (item.source === 'upgrade') return { text: 'UPGRADE YOUR COPY', color: '#8a2a1a' };
  if (item.source === 'grail') return { text: '★ GRAIL ★', color: '#6b1f5a' };
  if (item.sale < 1) return { text: `CLEARANCE −${Math.round((1 - item.sale) * 100)}%`, color: '#c8342a' };
  if (item.source === 'showpiece' || item.source === 'estate') return { text: 'COLLECTOR’S PIECE', color: '#b8892a' };
  if (item.edition === 'firstPrint') return { text: 'FIRST PRINT', color: '#8a2a1a' };
  if (item.edition === 'budget') return { text: BUDGET_LABEL[item.game.platform].toUpperCase(), color: '#c8443a' };
  if (item.game.region?.includes('Japan')) return { text: 'JAPANESE IMPORT', color: '#2a2a3a' };
  return null;
}
