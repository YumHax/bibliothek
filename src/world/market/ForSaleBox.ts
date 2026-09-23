import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import { getPlatform } from '@/catalog/platforms';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { StockItem } from '@/economy/MarketStock';
import { describeCondition } from '@/economy/pricing';
import type { Furniture } from '../Furniture';
import { GameBox } from '../GameBox';

/** How far a displayed box leans back against whatever stands behind it. */
const LEAN = THREE.MathUtils.degToRad(14);
/** Air between the box's top edge and the support it leans on. */
const LEAN_GAP = 0.003;
/** The price tag: big enough to read from the aisle, narrower than the narrowest box (a Game Boy's 0.127). */
const TAG_W = 0.1;
const TAG_H = 0.06;

/**
 * A copy on a market stall: a `GameBox` standing on the table with a price tag at its foot. The
 * box itself is not an interactable here (its click would pick it up); this wrapper owns the hit
 * volume and asks the Session to sell it. Origin on the table where the support (crate, wall) the
 * box leans on meets it: the box tips back on its bottom edge until its top touches the support,
 * so nothing of it sinks into the support. +z faces the buyer. Never collides (the table does).
 * The tag is repainted once the item's price settles (see `StockItem.settled`).
 */
export class ForSaleBox extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  readonly box: GameBox;
  private readonly tagMaterial: THREE.MeshStandardMaterial;
  private disposed = false;
  /** Assigned by the stall's builder: takes the box off the stall once bought. */
  onSold?: () => void;

  constructor(readonly item: StockItem, covers: BoxArtLoader) {
    super();
    this.name = `ForSale:${item.game.id}`;
    this.box = new GameBox(item.game, covers);
    const { height, depth } = this.box.dimensions;
    // Pivot on the box's bottom-back edge, set far enough from the support for the tipped-back top to just touch it.
    const lean = new THREE.Group();
    lean.rotation.x = -LEAN;
    lean.position.z = height * Math.sin(LEAN) + LEAN_GAP;
    this.box.position.set(0, height / 2, depth / 2);
    this.box.saveRestPose();
    lean.add(this.box);
    this.add(lean);

    this.tagMaterial = new THREE.MeshStandardMaterial({ map: this.paintTag(), roughness: 0.8 });
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(TAG_W, TAG_H), this.tagMaterial);
    tag.position.set(0, TAG_H / 2 - 0.004, lean.position.z + depth * Math.cos(LEAN) + 0.02);
    tag.rotation.x = -0.35;
    this.add(tag);

    this.hitboxes = [this.box];
    void item.settled.then(() => this.repaintTag());
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  get width(): number {
    return this.box.dimensions.width;
  }

  /** Called by the Session once paid for. */
  sold(): void {
    this.onSold?.();
  }

  dispose(): void {
    this.disposed = true;
    this.box.dispose();
    this.tagMaterial.map?.dispose();
    this.tagMaterial.dispose();
  }

  setHovered(hovered: boolean): void {
    this.box.setHovered(hovered);
  }

  label(): string {
    const { game, price, condition } = this.item;
    const state = describeCondition(condition);
    const platform = getPlatform(game.platform).shortName;
    return `${game.title} (${platform}${state ? `, ${state}` : ''}) — ${price} coin${price > 1 ? 's' : ''}, click to buy`;
  }

  activate(session: SessionActions): void {
    session.buy(this);
  }

  /** The price settled after the tag was painted: swap the texture (the box may have been sold or unloaded meanwhile). */
  private repaintTag(): void {
    if (this.disposed) return;
    this.tagMaterial.map?.dispose();
    this.tagMaterial.map = this.paintTag();
    this.tagMaterial.needsUpdate = true;
  }

  private paintTag(): THREE.Texture {
    const [canvas, ctx] = createCanvas(200, 120);
    ctx.fillStyle = '#fff6d6';
    ctx.fillRect(0, 0, 200, 120);
    ctx.strokeStyle = '#c9a75b';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 194, 114);
    ctx.fillStyle = '#2a1a10';
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(this.item.price), 88, 62);
    ctx.beginPath();
    ctx.arc(160, 62, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#d4a52a';
    ctx.fill();
    ctx.strokeStyle = '#9a731a';
    ctx.lineWidth = 3;
    ctx.stroke();
    return toTexture(canvas, 2);
  }
}
