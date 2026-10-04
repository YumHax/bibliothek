import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { Game } from '@/catalog/types';
import type { Furniture } from '../Furniture';
import { GameBox } from '../GameBox';

/** Air between the box's top edge and the back panel it leans on. */
const LEAN_GAP = 0.003;

interface ShelfCopyOptions {
  covers: BoxArtLoader;
  /** How far it leans back on the shelf's back panel (radians). */
  lean: number;
  /** The hover caption: "<Name>'s copy", and whether a swap of theirs offers it. */
  caption: () => string;
  /** Clicked: the host says something about it. */
  onLook: (game: Game) => void;
}

/**
 * One of a neighbour's own games, leaning on their shelf: theirs, not for sale (no tag). Hovered it names whose copy
 * it is; clicked, the host tells its story (`onLook`). A game of theirs comes to the player only through their swap
 * (`NeighbourTrades`). Origin on the board under the box's bottom-back edge, +z into the room.
 */
export class ShelfCopy extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly box: GameBox;

  constructor(readonly game: Game, private readonly options: ShelfCopyOptions) {
    super();
    this.name = 'ShelfCopy';
    this.box = new GameBox(game, options.covers);
    const { height, depth } = this.box.dimensions;
    // Pivot on the box's bottom-back edge, far enough from the panel for the tipped-back top to just touch it.
    const holder = new THREE.Group();
    holder.rotation.x = -options.lean;
    holder.position.z = height * Math.sin(options.lean) + LEAN_GAP;
    this.box.position.set(0, height / 2, depth / 2);
    this.box.saveRestPose();
    holder.add(this.box);
    this.add(holder);
    this.hitboxes = [this.box];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(hovered: boolean): void {
    this.box.setHovered(hovered);
  }

  label(): string {
    return this.options.caption();
  }

  activate(_session: SessionActions): void {
    this.options.onLook(this.game);
  }

  dispose(): void {
    this.box.dispose();
  }
}
