import * as THREE from 'three';
import { isUpdatable, type Updatable } from '@/core/Engine';
import type { ColliderSet, Collisions, CollisionWorld } from '@/core/Collider';
import { isInteractable, type Interactable } from '@/interaction/Interactable';
import type { Furniture } from '../Furniture';
import type { GameBox } from '../GameBox';
import { resolvePlacement, type Placement } from '../Placement';
import type { RoomOptions } from '../Room';
import type { ShelvingHost } from '../shelving/Shelving';
import { disposeTree } from '../props/Prop';

/**
 * `empty`: nothing built (costs nothing). `dormant`: built and kept in memory but out of the scene,
 * not ticked, not collidable, not clickable. `active`: plugged into the engine.
 */
export type ZoneState = 'empty' | 'dormant' | 'active';

/** A zone's place in the world: where it sits, how big it is, who it connects to. */
export interface ZoneSpec {
  id: string;
  /** World position of the zone's local origin (the centre of a room's floor). */
  origin: [x: number, y: number, z: number];
  rotationY?: number;
  /** Extent around the origin (metres): `bounds` is width x height x depth centred on origin on the floor. */
  extent: Pick<RoomOptions, 'width' | 'depth' | 'height'>;
  /** Zones kept active while the player is here (what is seen through the doorways). */
  neighbours: readonly string[];
  /** Never unloaded (the collection room: its shelving follows the collection, the cat lives there). */
  persistent?: boolean;
}

/** What a zone plugs its content into: the World. */
export interface ZoneHost {
  readonly scene: THREE.Scene;
  readonly collisions: CollisionWorld;
  addUpdatable(u: Updatable): void;
  removeUpdatable(u: Updatable): void;
  interactableAdded(item: Interactable): void;
  interactableRemoved(item: Interactable): void;
}

/** Builds a zone's content into it (a room shell, furniture...) and returns whatever the caller wants to keep. */
export type ZoneBuilder = (zone: Zone) => unknown;

/**
 * A zone's view of the collision world: boxes added here only reach the world while the zone is
 * active, and leave with it. Hand this to furniture that moves its own collider (the door leaf) and
 * to creatures that probe (the cat), never the world's `CollisionWorld` directly.
 */
class ScopedCollisions implements Collisions {
  private readonly boxes = new Set<THREE.Box3>();
  private live = false;

  constructor(private readonly world: CollisionWorld) {}

  add(box: THREE.Box3): void {
    this.boxes.add(box);
    if (this.live) this.world.add(box);
  }

  remove(box: THREE.Box3): void {
    this.boxes.delete(box);
    if (this.live) this.world.remove(box);
  }

  intersectsSphere(point: THREE.Vector3, radius: number): boolean {
    return this.world.intersectsSphere(point, radius);
  }

  setLive(live: boolean): void {
    if (live === this.live) return;
    this.live = live;
    for (const box of this.boxes) live ? this.world.add(box) : this.world.remove(box);
  }

  clear(): void {
    this.setLive(false);
    this.boxes.clear();
  }
}

/**
 * A part of the world that loads and unloads as one: a room, a corridor, the street. Everything in
 * it hangs under `group` (positioned at the zone's origin), so `place()` takes zone-local
 * coordinates and a whole zone leaves the scene in one call. Content is built lazily by the
 * builder on first activation; `ZoneManager` decides which zones are active from the player's position.
 */
export class Zone implements ShelvingHost {
  readonly id: string;
  readonly group = new THREE.Group();
  /** World-space box the player is "in this zone" inside of. */
  readonly bounds: THREE.Box3;
  /** Colliders scoped to this zone (see `ScopedCollisions`). */
  readonly collisions: ColliderSet & Collisions;
  /** What the builder returned (the caller who registered the builder knows its type); null until built. */
  handle: unknown = null;

  private state: ZoneState = 'empty';
  private readonly items = new Map<Furniture, THREE.Box3[]>();
  /** Interactables that are not placed furniture themselves (the boxes on the shelves). */
  private readonly looseInteractables = new Set<Interactable>();
  private readonly disposers: Array<() => void> = [];
  private readonly scoped: ScopedCollisions;

  constructor(
    readonly spec: ZoneSpec,
    private readonly host: ZoneHost,
    private readonly builder: ZoneBuilder,
  ) {
    this.id = spec.id;
    this.group.name = `Zone:${spec.id}`;
    this.group.position.set(...spec.origin);
    this.group.rotation.y = spec.rotationY ?? 0;
    this.group.updateMatrixWorld(true);
    const { width, depth, height } = spec.extent;
    this.bounds = new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, height, depth / 2)).applyMatrix4(this.group.matrixWorld);
    this.scoped = new ScopedCollisions(host.collisions);
    this.collisions = this.scoped;
  }

  /** ShelvingHost: shelves are parented to the zone, not the scene. */
  get scene(): THREE.Object3D {
    return this.group;
  }

  get status(): ZoneState {
    return this.state;
  }

  get isActive(): boolean {
    return this.state === 'active';
  }

  /** World-space XZ rectangle of the zone (the cat's world when it lives here). */
  get floorBounds(): THREE.Box2 {
    return new THREE.Box2(new THREE.Vector2(this.bounds.min.x, this.bounds.min.z), new THREE.Vector2(this.bounds.max.x, this.bounds.max.z));
  }

  /** True when `point` (world space) is inside the zone, grown by `margin` on every side. */
  contains(point: THREE.Vector3, margin = 0): boolean {
    const b = this.bounds;
    return point.x >= b.min.x - margin && point.x <= b.max.x + margin && point.y >= b.min.y - margin && point.y <= b.max.y + margin && point.z >= b.min.z - margin && point.z <= b.max.z + margin;
  }

  /** World -> zone-local (in place). */
  toLocal(point: THREE.Vector3): THREE.Vector3 {
    return this.group.worldToLocal(point);
  }

  /** Zone-local -> world (in place). */
  toWorld(point: THREE.Vector3): THREE.Vector3 {
    return this.group.localToWorld(point);
  }

  // --- content ------------------------------------------------------------------------------------

  /**
   * Puts furniture in the zone at a zone-local position: parents it to `group`, records its
   * footprint + `colliders` in world space; while the zone is active it is also collidable, ticked
   * if `Updatable` and clickable if `Interactable` right away (otherwise on activation).
   */
  place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY = 0): F {
    item.position.copy(position);
    item.rotation.y = rotationY;
    this.group.add(item);
    item.updateWorldMatrix(true, false);
    const boxes = [item.footprint, ...(item.colliders ?? [])].map((box) => box.clone().applyMatrix4(item.matrixWorld));
    this.items.set(item, boxes);
    if (this.state === 'active') this.plug(item, boxes);
    return item;
  }

  /** `place()` at a plan `Placement` (floor / ceiling / corner / wall, see `Placement.ts`), relative to the zone. */
  placeAt<F extends Furniture>(item: F, at: Placement): F {
    const { position, rotationY } = resolvePlacement(this.spec.extent, at);
    return this.place(item, position, rotationY);
  }

  /** Undoes `place()`. Safe to call twice. */
  remove(item: Furniture): void {
    const boxes = this.items.get(item);
    if (!boxes) return;
    if (this.state === 'active') this.unplug(item, boxes);
    this.items.delete(item);
    this.group.remove(item);
  }

  /** ShelvingHost: boxes are interactables that come and go with rebuilds. */
  boxesChanged(added: readonly GameBox[], removed: readonly GameBox[]): void {
    for (const box of removed) {
      this.looseInteractables.delete(box);
      if (this.state === 'active') this.host.interactableRemoved(box);
    }
    for (const box of added) {
      this.looseInteractables.add(box);
      if (this.state === 'active') this.host.interactableAdded(box);
    }
  }

  /** Registers clean-up for things the builder created that are not furniture (subscriptions, a Shelving). */
  onUnload(dispose: () => void): void {
    this.disposers.push(dispose);
  }

  // --- lifecycle ------------------------------------------------------------------------------------

  /** Builds the content if it is not there yet; the zone stays out of the scene until `activate()`. */
  build(): unknown {
    if (this.state === 'empty') {
      this.handle = this.builder(this);
      this.state = 'dormant';
    }
    return this.handle;
  }

  /** Builds if needed and plugs everything into the scene, the collision world and the loop. */
  activate(): unknown {
    const handle = this.build();
    if (this.state !== 'active') {
      this.host.scene.add(this.group);
      for (const [item, boxes] of this.items) this.plug(item, boxes);
      this.scoped.setLive(true);
      for (const item of this.looseInteractables) this.host.interactableAdded(item);
      this.state = 'active';
    }
    return handle;
  }

  /** Takes the zone out of the scene and the loop; keeps it in memory for a quick return. */
  deactivate(): void {
    if (this.state !== 'active') return;
    for (const item of this.looseInteractables) this.host.interactableRemoved(item);
    this.scoped.setLive(false);
    for (const [item, boxes] of this.items) this.unplug(item, boxes);
    this.host.scene.remove(this.group);
    this.state = 'dormant';
  }

  /** Frees everything (GPU resources included); the builder runs again on the next activation. Persistent zones refuse. */
  unload(): void {
    if (this.spec.persistent) throw new Error(`[zone] ${this.id} is persistent`);
    this.deactivate();
    if (this.state === 'empty') return;
    for (const dispose of this.disposers.splice(0)) dispose();
    for (const item of this.items.keys()) item.dispose?.();
    disposeTree(this.group);
    this.group.clear();
    this.items.clear();
    this.looseInteractables.clear();
    this.scoped.clear();
    this.handle = null;
    this.state = 'empty';
  }

  private plug(item: Furniture, boxes: THREE.Box3[]): void {
    for (const box of boxes) this.host.collisions.add(box);
    if (isUpdatable(item)) this.host.addUpdatable(item);
    if (isInteractable(item)) this.host.interactableAdded(item);
  }

  private unplug(item: Furniture, boxes: THREE.Box3[]): void {
    for (const box of boxes) this.host.collisions.remove(box);
    if (isUpdatable(item)) this.host.removeUpdatable(item);
    if (isInteractable(item)) this.host.interactableRemoved(item);
  }
}
