import * as THREE from 'three';
import { isUpdatable, type Updatable } from '@/core/Engine';
import type { ColliderSet, Collisions, CollisionWorld } from '@/core/Collider';
import { isInteractable, type Interactable } from '@/interaction/Interactable';
import { isOccupancyAware, type Furniture } from '../Furniture';
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
  occluderAdded(object: THREE.Object3D): void;
  occluderRemoved(object: THREE.Object3D): void;
}

/** Builds a zone's content into it (a room shell, furniture...) and returns whatever the caller wants to keep. */
export type ZoneBuilder = (zone: Zone) => unknown;

/**
 * Shadow maps do not know about walls: a light renders every caster in range, the room next door
 * included. So every zone's shadow-casting lights render two layers only: their own zone's
 * (`Zone.shadowLayer`, set on everything placed in it) and this shared one, which holds what keeps
 * light in its room: the room shells (their opaque-wall casters) and the doors (`shareShadowCaster`).
 * Zones take layers from `FIRST_ZONE_SHADOW_LAYER` up; three.js has 32 (layer 0 is the camera's).
 */
export const SHARED_SHADOW_LAYER = 1;
export const FIRST_ZONE_SHADOW_LAYER = 2;

/** Puts `root` and everything under it on `SHARED_SHADOW_LAYER` (it keeps its other layers). */
export function shareShadowCaster(root: THREE.Object3D): void {
  root.traverse((obj) => obj.layers.enable(SHARED_SHADOW_LAYER));
}

/** A doorway into another zone: `bounds` is the opening (world space); `door` the leaf hung in it by this side, if any. */
export interface Portal {
  to: string;
  bounds: THREE.Box3;
  door?: { readonly openness: number };
}

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
  /** The doorways out of this zone, registered by its builder; the `PortalCuller` looks through them. */
  readonly portals: Portal[] = [];

  private state: ZoneState = 'empty';
  private occupied = false;
  private drawn = true;
  /** Meshes `setDrawn(false)` hid, to show again; only those that were visible, so a prop's own hiding is respected. */
  private hiddenMeshes: THREE.Mesh[] = [];
  private readonly items = new Map<Furniture, THREE.Box3[]>();
  /** Interactables that are not placed furniture themselves (the boxes on the shelves). */
  private readonly looseInteractables = new Set<Interactable>();
  private readonly disposers: Array<() => void> = [];
  private readonly scoped: ScopedCollisions;

  constructor(
    readonly spec: ZoneSpec,
    private readonly host: ZoneHost,
    private readonly builder: ZoneBuilder,
    /** The layer this zone's content casts shadows on, for this zone's lights only (see `SHARED_SHADOW_LAYER`). */
    readonly shadowLayer: number,
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
    this.adopt(item);
    if (!this.drawn && !item.seenFromNextDoor) this.hide(item);
    if (this.state === 'active') this.plug(item, boxes);
    if (isOccupancyAware(item)) item.setOccupied(this.occupied);
    return item;
  }

  /** Whether the player is in this zone; forwarded to every placed `OccupancyAware` item (`main.ts` calls it on zone change). */
  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    for (const item of this.items.keys()) if (isOccupancyAware(item)) item.setOccupied(occupied);
  }

  /** A doorway out of this zone (the builder registers one per doorway leading to another zone). */
  addPortal(portal: Portal): void {
    this.portals.push(portal);
  }

  /**
   * Whether the zone is drawn this frame (the `PortalCuller` decides: the player's zone, and those
   * seen through an open doorway in view). An undrawn zone keeps its lights (taking them out would
   * recompile every shader) and its doors (both rooms see a door); only its meshes are hidden, so
   * they cost no draw call, no shadow pass and no raycast.
   */
  setDrawn(drawn: boolean): void {
    if (drawn === this.drawn) return;
    this.drawn = drawn;
    if (drawn) {
      for (const mesh of this.hiddenMeshes) mesh.visible = true;
      this.hiddenMeshes = [];
      return;
    }
    for (const item of this.items.keys()) if (!item.seenFromNextDoor) this.hide(item);
    for (const box of this.looseInteractables) this.hide(box as unknown as THREE.Object3D);
  }

  private hide(root: THREE.Object3D): void {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      mesh.visible = false;
      this.hiddenMeshes.push(mesh);
    });
  }

  /** Content casts shadows on this zone's layer; the zone's own shadow-casting lights render that layer and the shared one, nothing else. */
  private adopt(root: THREE.Object3D): void {
    root.traverse((obj) => {
      obj.layers.enable(this.shadowLayer);
      const light = obj as THREE.Light & { shadow?: THREE.LightShadow };
      if (light.isLight && light.castShadow && light.shadow) {
        light.shadow.camera.layers.set(SHARED_SHADOW_LAYER);
        light.shadow.camera.layers.enable(this.shadowLayer);
      }
    });
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
      this.adopt(box);
      if (!this.drawn) this.hide(box);
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
    this.portals.length = 0;
    this.hiddenMeshes = [];
    this.drawn = true;
    this.scoped.clear();
    this.handle = null;
    this.state = 'empty';
  }

  private plug(item: Furniture, boxes: THREE.Box3[]): void {
    for (const box of boxes) this.host.collisions.add(box);
    for (const object of item.occluders ?? []) this.host.occluderAdded(object);
    if (isUpdatable(item)) this.host.addUpdatable(item);
    if (isInteractable(item)) this.host.interactableAdded(item);
  }

  private unplug(item: Furniture, boxes: THREE.Box3[]): void {
    for (const box of boxes) this.host.collisions.remove(box);
    for (const object of item.occluders ?? []) this.host.occluderRemoved(object);
    if (isUpdatable(item)) this.host.removeUpdatable(item);
    if (isInteractable(item)) this.host.interactableRemoved(item);
  }
}
