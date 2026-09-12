import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from './Interactable';

export interface InteractorEvents {
  onHoverChange?(item: Interactable | null): void;
  onSelect?(item: Interactable): void;
}

/**
 * Casts a ray from the crosshair every frame and reports which interactable is under it.
 * Hits are attributed to the interactable that registered the hitbox, so callers never see meshes.
 * The ray stops at the nearest `occluder` (a wall): what is clickable behind it is not reachable.
 * Selection is triggered by the caller (see `select()`), so input policy stays outside.
 */
export class Interactor implements Updatable {
  enabled = true;
  maxDistance = 3;
  readonly events: InteractorEvents = {};
  /** Interactables for which this returns true are skipped, letting the ray pass through them. */
  ignore: (item: Interactable) => boolean = () => false;

  private readonly raycaster = new THREE.Raycaster();
  private readonly centre = new THREE.Vector2(0, 0);
  private readonly owners = new Map<THREE.Object3D, Interactable>();
  private hitboxes: THREE.Object3D[] = [];
  private occluders: THREE.Object3D[] = [];
  private hovered: Interactable | null = null;

  constructor(private readonly camera: THREE.Camera) {}

  add(...items: Interactable[]): void {
    for (const item of items) for (const hitbox of item.hitboxes) this.owners.set(hitbox, item);
    this.hitboxes = [...this.owners.keys()];
  }

  remove(item: Interactable): void {
    for (const hitbox of item.hitboxes) this.owners.delete(hitbox);
    this.hitboxes = [...this.owners.keys()];
    if (this.hovered === item) this.setHovered(null);
  }

  /** Meshes the ray cannot see through (walls). Not clickable themselves; they only cut the ray short. */
  addOccluders(...objects: THREE.Object3D[]): void {
    for (const object of objects) if (!this.occluders.includes(object)) this.occluders.push(object);
  }

  removeOccluders(...objects: THREE.Object3D[]): void {
    this.occluders = this.occluders.filter((o) => !objects.includes(o));
  }

  update(): void {
    this.setHovered(this.enabled ? this.pick() : null);
  }

  /** Fires onSelect for the hovered item, if any. Hover is cleared first so the item is handed over clean. */
  select(): boolean {
    const target = this.hovered;
    if (!this.enabled || !target) return false;
    this.setHovered(null);
    this.events.onSelect?.(target);
    return true;
  }

  private setHovered(next: Interactable | null): void {
    if (next === this.hovered) return;
    this.hovered?.setHovered(false);
    this.hovered = next;
    this.hovered?.setHovered(true);
    this.events.onHoverChange?.(this.hovered);
  }

  private pick(): Interactable | null {
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
