import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { Game } from '@/catalog/types';
import { GameBox } from '../GameBox';
import { invisibleHitbox } from '../meshUtils';
import type { StrayGames } from './StrayGames';

export interface StrayBoxOptions {
  strays: StrayGames;
  /** The slot's name, unique in the flat: with the day it seeds which game lies here. */
  slot: string;
  covers: BoxArtLoader;
}

/** The click target covers the largest box lying flat (a PC big box would overhang it a little). */
const HIT = { width: 0.24, height: 0.06, depth: 0.3 };

/**
 * A game from the collection left lying on a surface (the kitchen table, a nightstand): a real
 * `GameBox`, cover up, placed where the builder puts this spot (origin on the surface, the box's
 * long side along local z). Each new day an empty spot takes one of the owned games (`setDay`);
 * clicking it picks the game up like any shelf box, and the one in hand is then its shelf's own
 * box, so putting it down sends it home and the spot stays empty until tomorrow. Collides with
 * nothing.
 */
export class StrayBox extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly hitbox: THREE.Mesh;
  private box: GameBox | null = null;
  private day = -1;
  private readonly worldPos = new THREE.Vector3();
  private readonly worldQuat = new THREE.Quaternion();
  private readonly parentQuat = new THREE.Quaternion();

  constructor(private readonly options: StrayBoxOptions) {
    super();
    this.name = 'StrayBox';
    this.hitbox = invisibleHitbox(HIT.width, HIT.height, HIT.depth, { y: HIT.height / 2 });
    this.add(this.hitbox);
    this.hitboxes = [this.hitbox];
    this.setClickable(false);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** A new day: an empty spot gets a game from the shelves (the same one all day). */
  setDay(day: number): void {
    if (day === this.day) return;
    this.day = day;
    if (this.box) return;
    const game = this.options.strays.claim(this.options.slot, day, () => this.empty());
    if (game) this.show(game);
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.box?.setHovered(hovered);
  }

  label(player: PlayerState): string | null {
    if (!this.box) return null;
    return player.held ? 'Click to put the box in hand back' : `${this.box.game.title}, left out here: click to pick up`;
  }

  /** Picks the game up; in hand it is its shelf's box, which goes home when put down. */
  activate(session: SessionActions): void {
    if (session.held) {
      session.putBack();
      return;
    }
    const box = this.box;
    if (!box) return;
    const { strays, slot } = this.options;
    box.getWorldPosition(this.worldPos);
    box.getWorldQuaternion(this.worldQuat);
    strays.release(slot);
    const home = strays.homeBox?.(box.game.id);
    const shelf = home?.parent;
    if (!home || !shelf) {
      // No shelf has room for it (or none is wired): it stays a box of its own, put back here.
      strays.claim(slot, this.day, () => this.empty(), box.game.id);
      session.pickUp(box);
      return;
    }
    // Its shelf's box, moved to where this one lies: the hand takes it from here, and returns it to the shelf.
    shelf.updateWorldMatrix(true, false);
    home.position.copy(shelf.worldToLocal(this.worldPos.clone()));
    home.quaternion.copy(shelf.getWorldQuaternion(this.parentQuat).invert().multiply(this.worldQuat));
    home.updateMatrixWorld();
    this.empty();
    session.pickUp(home);
  }

  private show(game: Game): void {
    const box = new GameBox(game, this.options.covers);
    const { depth } = box.dimensions;
    // Lying on its back, cover up, the top of the cover towards local -z.
    box.rotation.set(-Math.PI / 2, 0, 0);
    box.position.set(0, depth / 2 + 0.001, 0);
    box.saveRestPose();
    // The zone's shadow layer (the spot was adopted when placed) and the default one.
    const mask = this.hitbox.layers.mask | 1;
    box.traverse((obj) => {
      obj.layers.mask = mask;
    });
    this.add(box);
    this.box = box;
    this.setClickable(true);
  }

  /** Empties the spot (picked up, or the game left the collection). */
  private empty(): void {
    const box = this.box;
    if (!box) return;
    this.box = null;
    this.setClickable(false);
    if (box.parent === this) {
      this.remove(box);
      box.dispose();
    }
  }

  private setClickable(on: boolean): void {
    if (on) this.hitbox.layers.enable(0);
    else this.hitbox.layers.disable(0);
  }
}
