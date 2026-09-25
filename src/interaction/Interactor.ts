import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Listeners } from '@/core/Listeners';
import type { Interactable } from './Interactable';

/**
 * Casts a ray from the crosshair every frame and reports which interactable is under it.
 * Hits are attributed to the interactable that registered the hitbox, so callers never see meshes.
 * The ray stops at the nearest `occluder` (a wall): what is clickable behind it is not reachable.
 * Selection is triggered by the caller (see `select()`), so input policy stays outside.
 */
export class Interactor implements Updatable {
  enabled = true;
  maxDistance = 3;
  /** Interactables for which this returns true are skipped, letting the ray pass through them. */
  ignore: (item: Interactable) => boolean = () => false;

  private readonly raycaster = new THREE.Raycaster();
  private readonly centre = new THREE.Vector2(0, 0);
  private readonly owners = new Map<THREE.Object3D, Interactable>();
  /** What the ray tests, rebuilt from `owners` / `occluderSet` before the next pick after a change (a trip (de)activates hundreds at once). */
  private hitboxes: THREE.Object3D[] = [];
  private occluders: THREE.Object3D[] = [];
  private readonly occluderSet = new Set<THREE.Object3D>();
  private dirty = false;
  private hovered: Interactable | null = null;
  private readonly hoverListeners = new Listeners<[item: Interactable | null]>();
  private readonly selectListeners = new Listeners<[item: Interactable]>();

  constructor(private readonly camera: THREE.Camera) {}

  /** Calls `listener` with what is under the crosshair whenever that changes (null: nothing); returns the unsubscribe. */
  onHoverChange(listener: (item: Interactable | null) => void): () => void {
    return this.hoverListeners.add(listener);
  }

  /** Calls `listener` with the item `select()` picked; returns the unsubscribe. */
  onSelect(listener: (item: Interactable) => void): () => void {
    return this.selectListeners.add(listener);
  }

  add(...items: Interactable[]): void {
    for (const item of items) for (const hitbox of item.hitboxes) this.owners.set(hitbox, item);
    this.dirty = true;
  }

  remove(item: Interactable): void {
    for (const hitbox of item.hitboxes) this.owners.delete(hitbox);
    this.dirty = true;
    if (this.hovered === item) this.setHovered(null);
  }

  /** Meshes the ray cannot see through (walls). Not clickable themselves; they only cut the ray short. */
  addOccluders(...objects: THREE.Object3D[]): void {
    for (const object of objects) this.occluderSet.add(object);
    this.dirty = true;
  }

  removeOccluders(...objects: THREE.Object3D[]): void {
    for (const object of objects) this.occluderSet.delete(object);
    this.dirty = true;
  }

  update(): void {
    this.setHovered(this.enabled ? this.pick() : null);
  }

  /** Fires onSelect for the hovered item, if any. Hover is cleared first so the item is handed over clean. */
  select(): boolean {
    const target = this.hovered;
    if (!this.enabled || !target) return false;
    this.setHovered(null);
    this.selectListeners.emit(target);
    return true;
  }

  private setHovered(next: Interactable | null): void {
    if (next === this.hovered) return;
    this.hovered?.setHovered(false);
    this.hovered = next;
    this.hovered?.setHovered(true);
    this.hoverListeners.emit(this.hovered);
  }

  private pick(): Interactable | null {
    if (this.dirty) {
      this.hitboxes = [...this.owners.keys()];
      this.occluders = [...this.occluderSet];
      this.dirty = false;
    }
    this.raycaster.far = this.maxDistance;
    this.raycaster.setFromCamera(this.centre, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitboxes, false);
    if (!hits.length) return null;
    const wallAt = this.raycaster.intersectObjects(this.occluders, false)[0]?.distance ?? Infinity;
    for (const hit of hits) {
      if (hit.distance > wallAt) return null;
      const owner = this.owners.get(hit.object);
      if (owner && !this.ignore(owner)) return owner;
    }
    return null;
  }
}
