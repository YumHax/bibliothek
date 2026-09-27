import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { HomeUpgrades } from '@/economy/HomeUpgrades';
import { homeGood, type HomeGood } from '@/economy/homeGoods';
import type { Furniture } from '../Furniture';
import { invisibleHitbox } from '../meshUtils';
import { mergeStaticParts } from '../zone/mergeStatic';
import type { DisplayPiece } from './displayPieces';
import { PriceTag, type TagStyle, type TagState } from './PriceTag';

export interface ForSaleOptions {
  good: HomeGood;
  piece: DisplayPiece;
  /** What the flat has bought; without it (`?debug`, the flat furnished) nothing is sold. */
  upgrades: HomeUpgrades | undefined;
  /** The shop's colour, across the top of the tag. */
  accent: string;
  /** How the tag stands; default a tent card in front of anything small, a card on a stick by anything big. */
  tag?: TagStyle;
  /** Blocks the player (a bed, a sideboard). Default true; false for a rug, a plant on a table, a print. */
  collides?: boolean;
}

/** What stands in the way of a purchase: nothing, all the room the flat has for it taken, or what it goes with. */
type Status = 'buy' | 'full' | 'needs';

/** A piece taller than this gets its tag on a stick rather than a card at its foot. */
const TALL = 0.6;
/** A little margin round the piece's bounds for the click. */
const PAD = 0.03;

/**
 * A piece of the flat on the shop floor with its price tag: the real thing (a `DisplayPiece`, the flat's own class
 * without its lights, never placed on its own so it never does what it does at home: sit, boil, switch on), one
 * hitbox round it, and the tag (`PriceTag`: the price, SOLD once a one-off is bought, AT HOME once the flat has no
 * room for another). Hover shows the name, price, blurb and what stands in the way; a click buys it
 * (`SessionActions.buyUpgrade`), and it is at home at once (`HomeUpgrades.add`: the flat's plans place it). The
 * display stays (it is the shop's), only its tag changes. Origin and frame are the piece's own. Collides as its
 * bounds unless `collides` is false.
 */
export class ForSale extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  readonly footprint: THREE.Box3;
  update?: Updatable['update'];
  private readonly good: HomeGood;
  private readonly tag: PriceTag;
  private readonly piece: DisplayPiece;

  constructor(private readonly options: ForSaleOptions) {
    super();
    const { good, piece } = options;
    this.name = `ForSale:${good.id}`;
    this.good = good;
    this.piece = piece;
    this.add(piece.object);
    if (piece.update) this.update = (dt) => piece.update!(dt);
    // Clickable, so the zone never freezes or merges it: a still piece does it here (a bed is a hundred parts).
    else freeze(piece.object);

    const bounds = visibleBounds(this);
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    const style = options.tag ?? (size.y > TALL ? 'stand' : 'card');
    this.tag = new PriceTag(good.name, good.price, options.accent, style);
    if (style === 'card') this.tag.position.set(centre.x, bounds.min.y, bounds.max.z + 0.07);
    else if (style === 'stand') this.tag.position.set(bounds.max.x + 0.08, 0, bounds.max.z + 0.1);
    else this.tag.position.set(bounds.max.x + 0.1, centre.y, bounds.min.z);
    this.add(this.tag);

    const hitbox = invisibleHitbox(size.x + PAD * 2, size.y + PAD, size.z + PAD * 2, { x: centre.x, y: centre.y + PAD / 2, z: centre.z });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.footprint = options.collides === false ? new THREE.Box3() : bounds.clone();
  }

  /** Shows on the tag what the flat has of it now (call on every purchase). */
  refresh(): void {
    const status = this.status();
    const state: TagState = status !== 'full' ? 'price' : this.good.max > 1 ? 'full' : 'sold';
    this.tag.setState(state);
    this.piece.setSold?.(status === 'full');
  }

  setHovered(hovered: boolean): void {
    this.tag.setHovered(hovered);
  }

  label(): string {
    const { good } = this;
    const head = `${good.name} · ${good.price} coins`;
    const upgrades = this.options.upgrades;
    if (!upgrades) return `${head} · ${good.blurb}`;
    switch (this.status()) {
      case 'full':
        return good.max > 1 ? `${head} · ${upgrades.count(good.id)} at home: no room for another` : `${head} · yours, it is at home`;
      case 'needs':
        return `${head} · ${good.blurb} · needs the ${homeGood(good.requires!).name.toLowerCase()} first`;
      case 'buy':
        return `${head} · ${good.blurb}${good.max > 1 ? ` (${upgrades.count(good.id)} / ${good.max} at home)` : ''} · click to buy`;
    }
  }

  activate(session: SessionActions): void {
    const { good } = this;
    const upgrades = this.options.upgrades;
    if (!upgrades) {
      session.refuse('The flat is furnished already.');
      return;
    }
    switch (this.status()) {
      case 'full':
        session.refuse(good.max > 1 ? `The flat has no room for another ${good.name.toLowerCase()}.` : `You have the ${good.name.toLowerCase()} already.`);
        return;
      case 'needs':
        session.refuse(`The ${good.name.toLowerCase()} goes with the ${homeGood(good.requires!).name.toLowerCase()}: buy that first.`);
        return;
      case 'buy':
        session.buyUpgrade({ title: good.name, price: good.price, bought: () => upgrades.add(good.id) });
    }
  }

  dispose(): void {
    this.tag.dispose();
  }

  private status(): Status {
    const upgrades = this.options.upgrades;
    if (!upgrades) return 'buy';
    if (upgrades.count(this.good.id) >= this.good.max) return 'full';
    return upgrades.canBuy(this.good.id) ? 'buy' : 'needs';
  }
}

/** Merges a still piece's parts (one mesh per material) and stops recomposing their matrices every frame. */
function freeze(piece: THREE.Object3D): void {
  piece.updateMatrixWorld(true);
  mergeStaticParts(piece);
  piece.traverse((obj) => {
    obj.updateMatrix();
    obj.matrixAutoUpdate = false;
  });
}

/** The box round what `root` draws (its hitboxes and anything invisible left out), in `root`'s frame. */
function visibleBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  const hidden = (obj: THREE.Object3D): boolean => {
    for (let o: THREE.Object3D | null = obj; o && o !== root; o = o.parent) if (!o.visible) return true;
    return false;
  };
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || hidden(mesh)) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.every((m) => !m.visible)) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    part.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
    box.union(part);
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 0.2, 0.1));
  return box;
}
