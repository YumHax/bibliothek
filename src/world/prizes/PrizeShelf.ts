import * as THREE from 'three';
import { getPrize, type OwnedPrize } from '@/economy/Prizes';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { boxMesh } from '../meshUtils';
import { matte, Prop } from '../props/Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';
import { prizeModel } from './prizeModel';

export interface PrizeShelfOptions {
  /** The prizes taken home, and a way to hear about new ones. */
  prizes: { readonly owned: readonly OwnedPrize[]; subscribe(cb: () => void): () => void };
  /** Shelf length, metres. Default 0.8. */
  width?: number;
  /** Boards, bottom first; each is `gap` above the last. Default 2. */
  tiers?: number;
  gap?: number;
}

const DEPTH = 0.16;
const BOARD = 0.022;
/** Room each prize takes along a board. */
const SLOT = 0.1;
const WOOD = woodMaterial(0x6a4a30, 0.55);
const BRACKET = matte(0x2a2a30, 0.5);

/**
 * The prize shelf at home: a couple of wall-hung boards where what the player won at the arcade
 * stands, in the order they got it (the counter's prizes and the claw's bunnies alike); when the
 * boards are full the newest take the place of the oldest and a card says how many more there
 * are. Follows the prize store live. Wall-hung: origin at the wall, at the bottom board's top,
 * +z into the room. Decoration: never collides.
 */
export class PrizeShelf extends Prop {
  private readonly options: Required<PrizeShelfOptions>;
  private readonly shown = new THREE.Group();
  private readonly unsubscribe: () => void;

  constructor(options: PrizeShelfOptions) {
    super();
    this.name = 'PrizeShelf';
    this.options = { width: 0.8, tiers: 2, gap: 0.32, ...options };
    const { width, tiers, gap } = this.options;
    for (let t = 0; t < tiers; t++) {
      const y = t * gap;
      this.add(boxMesh(width, BOARD, DEPTH, WOOD, { y: y - BOARD / 2, z: DEPTH / 2 }));
      for (const sx of [-1, 1]) this.add(boxMesh(0.015, 0.08, DEPTH * 0.8, BRACKET, { x: sx * (width / 2 - 0.08), y: y - BOARD - 0.04, z: DEPTH * 0.4 }));
    }
    this.add(this.shown);
    this.rebuild();
    this.unsubscribe = options.prizes.subscribe(() => this.rebuild());
  }

  dispose(): void {
    this.unsubscribe();
  }

  private rebuild(): void {
    for (const child of [...this.shown.children]) {
      this.shown.remove(child);
      child.traverse((obj) => (obj as THREE.Mesh).geometry?.dispose());
    }
    const { width, tiers, gap } = this.options;
    const perTier = Math.floor((width - 0.04) / SLOT);
    const capacity = perTier * tiers;
    // What does something at home stands where it does it (the poster, the lamp, the cat's toy), not here.
    const owned = this.options.prizes.owned.filter((p) => !getPrize(p.id)?.home);
    const extra = Math.max(0, owned.length - capacity);
    const onShow = owned.slice(extra);
    onShow.forEach((item, i) => {
      const prize = getPrize(item.id);
      if (!prize) return;
      const model = prizeModel(prize.kind, prize.color);
      const tier = Math.floor(i / perTier);
      const slot = i % perTier;
      // Turned a little each, the way things end up on a shelf.
      model.rotation.y = ((i * 37) % 7 - 3) * 0.08;
      model.position.set(-width / 2 + 0.02 + SLOT * (slot + 0.5), tier * gap, DEPTH * 0.5);
      this.shown.add(model);
    });
    if (extra > 0) this.shown.add(this.moreCard(extra));
    if (!owned.length) this.shown.add(this.emptyCard());
  }

  /** A folded card at the end of the top board: "+N more in the drawer". */
  private moreCard(extra: number): THREE.Mesh {
    return this.card(`+${extra} more`, 'in the drawer');
  }

  /** On an empty shelf: what it is for. */
  private emptyCard(): THREE.Mesh {
    return this.card('Arcade prizes', 'win some!');
  }

  private card(title: string, line: string): THREE.Mesh {
    const [canvas, ctx] = createCanvas(160, 90);
    ctx.fillStyle = '#f4eedc';
    ctx.fillRect(0, 0, 160, 90);
    ctx.fillStyle = '#3a2a1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(title, 80, 34);
    ctx.font = '16px sans-serif';
    ctx.fillText(line, 80, 62);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.056), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }));
    const { width, tiers, gap } = this.options;
    card.position.set(width / 2 - 0.08, (tiers - 1) * gap + 0.03, DEPTH * 0.6);
    card.rotation.x = -0.25;
    return card;
  }
}
