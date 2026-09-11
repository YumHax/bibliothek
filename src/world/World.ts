import * as THREE from 'three';
import { isUpdatable, type Engine } from '@/core/Engine';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { GameSource } from '@/collection/GameSource';
import { isInteractable, type Interactable } from '@/interaction/Interactable';
import { CollisionWorld } from '@/core/Collider';
import { Room } from './Room';
import { DEFAULT_ROOM } from './roomPlan';
import type { GameBox } from './GameBox';
import type { Furniture } from './Furniture';
import { Shelving, type ShelvingHost, type ShelvingOptions } from './shelving/Shelving';

export interface WorldEvents {
  /** Something clickable appeared after start-up (e.g. a box on rebuilt shelving). */
  onInteractableAdded?(item: Interactable): void;
  onInteractableRemoved?(item: Interactable): void;
}

/** Assembles the collector room: the room shell, its furniture and the displayed games. */
export class World implements ShelvingHost {
  readonly room: Room;
  readonly collisions = new CollisionWorld();
  /** Everything the crosshair can target, in placement order. Live: see `events`. */
  readonly interactables: Interactable[] = [];
  readonly events: WorldEvents = {};

  private readonly footprints = new Map<Furniture, THREE.Box3>();
  private _shelving: Shelving | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly covers: BoxArtLoader,
  ) {
    this.room = new Room(DEFAULT_ROOM);
    engine.scene.add(this.room);
  }

  get scene(): THREE.Scene {
    return this.engine.scene;
  }

  /** The bookcases and their boxes; available once `addShelving` ran (layout does it). */
  get shelving(): Shelving {
    if (!this._shelving) throw new Error('[world] shelving not installed yet');
    return this._shelving;
  }

  /** Builds shelving sized to the collection and keeps it in sync with the source. */
  addShelving(games: GameSource, options: Omit<ShelvingOptions, 'room'> = {}): Shelving {
    this._shelving?.dispose();
    this._shelving = new Shelving(this, this.covers, games, { room: this.room.options, ...options });
    return this._shelving;
  }

  /**
   * Puts a piece of furniture in the room: adds it to the scene, registers its footprint as a
   * collider, ticks it every frame if it is Updatable and makes it clickable if it is Interactable.
   */
  place<T extends Furniture>(item: T, position: THREE.Vector3, rotationY = 0): T {
    item.position.copy(position);
    item.rotation.y = rotationY;
    this.engine.scene.add(item);
    item.updateWorldMatrix(true, false);
    const footprint = item.footprint.applyMatrix4(item.matrixWorld);
    this.footprints.set(item, footprint);
    this.collisions.add(footprint);
    if (isUpdatable(item)) this.engine.addUpdatable(item);
    if (isInteractable(item)) this.addInteractable(item);
    return item;
  }

  /** Undoes `place()`: scene, collider, per-frame tick and clickability. Safe to call twice. */
  remove(item: Furniture): void {
    this.engine.scene.remove(item);
    const footprint = this.footprints.get(item);
    if (footprint) {
      this.collisions.remove(footprint);
      this.footprints.delete(item);
    }
    if (isUpdatable(item)) this.engine.removeUpdatable(item);
    if (isInteractable(item)) this.removeInteractable(item);
  }

  /** ShelvingHost: boxes are interactables that come and go with rebuilds. */
  boxesChanged(added: readonly GameBox[], removed: readonly GameBox[]): void {
    for (const box of removed) this.removeInteractable(box);
    for (const box of added) this.addInteractable(box);
  }

  private addInteractable(item: Interactable): void {
    if (this.interactables.includes(item)) return;
    this.interactables.push(item);
    this.events.onInteractableAdded?.(item);
  }

  private removeInteractable(item: Interactable): void {
    const i = this.interactables.indexOf(item);
    if (i === -1) return;
    this.interactables.splice(i, 1);
    this.events.onInteractableRemoved?.(item);
  }
}
