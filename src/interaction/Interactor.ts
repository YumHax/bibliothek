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
  /**
   * The hitboxes within reach, re-sorted out of all of them when the camera has moved `NEAR_STEP`
   * or `NEAR_SECONDS` went by (things move: a walker, a box in hand): the ray then tests a handful,
   * not every box on every shelf of every loaded room.
   */
  private near: THREE.Object3D[] = [];
  private readonly nearFrom = new THREE.Vector3(Infinity, 0, 0);
  private nearAge = Infinity;
  private readonly scratch = new THREE.Vector3();
  private readonly sphere = new THREE.Sphere();
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

  update(dt = 0): void {
    this.nearAge += dt;
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
    const eye = this.camera.getWorldPosition(this.scratch);
    if (this.dirty) {
      this.hitboxes = [...this.owners.keys()];
      this.occluders = [...this.occluderSet];
      this.dirty = false;
      this.nearAge = Infinity;
    }
    if (this.nearAge > NEAR_SECONDS || eye.distanceToSquared(this.nearFrom) > NEAR_STEP * NEAR_STEP) this.sortNear(eye);
    this.raycaster.far = this.maxDistance;
    this.raycaster.setFromCamera(this.centre, this.camera);
    const hits = this.raycaster.intersectObjects(this.near, false);
    if (!hits.length) return null;
    const wallAt = this.raycaster.intersectObjects(this.occluders, false)[0]?.distance ?? Infinity;
    for (const hit of hits) {
      if (hit.distance > wallAt) return null;
      const owner = this.owners.get(hit.object);
      if (owner && !this.ignore(owner)) return owner;
    }
    return null;
  }

  /** Keeps the hitboxes whose bounding sphere comes within `maxDistance + NEAR_STEP` of `eye`. */
  private sortNear(eye: THREE.Vector3): void {
    this.nearFrom.copy(eye);
    this.nearAge = 0;
    const reach = this.maxDistance + NEAR_STEP;
    this.near = this.hitboxes.filter((hitbox) => {
      const geometry = (hitbox as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (!geometry) return true;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      this.sphere.copy(geometry.boundingSphere!).applyMatrix4(hitbox.matrixWorld);
      return this.sphere.center.distanceTo(eye) - this.sphere.radius < reach;
    });
  }
}

/** How far the camera moves, and how long it waits, before the hitboxes within reach are sorted again. */
const NEAR_STEP = 0.75;
const NEAR_SECONDS = 0.5;
