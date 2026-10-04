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
import { ContactShadows } from './ContactShadows';
import { mergeStaticParts } from './mergeStatic';
import { isActivityAware, isDrawnAware, isOccupancyAware } from './lifecycle';

/**
 * How often an undrawn zone's items tick (per second): out of sight, a smooth 60 Hz buys nothing,
 * and each tick is handed the time since the last one, so clocks and walks keep their pace.
 */
const UNDRAWN_TICK_HZ = 20;

/** An item's tick while its zone is undrawn: every `1 / UNDRAWN_TICK_HZ` s, with the time owed (capped like the engine's). */
class ThrottledTick implements Updatable {
  private owed = 0;

  constructor(readonly target: Updatable) {}

  /** For `?stats`: the item's own name. */
  get name(): string {
    const name = (this.target as { name?: unknown }).name;
    return `${typeof name === 'string' && name ? name : this.target.constructor.name} (undrawn)`;
  }

  update(dt: number): void {
    this.owed += dt;
    if (this.owed < 1 / UNDRAWN_TICK_HZ) return;
    const owed = Math.min(this.owed, 0.1);
    this.owed = 0;
    this.target.update(owed);
  }
}

/**
 * A placed item that nothing animates (not `Updatable`, not clickable, no `dispose` (which says it
 * listens to something), nothing under it that is, no light, no skeleton, not flagged
 * `userData.live`, no occluders): its parts' local matrices are composed once here instead of every
 * frame (`matrixAutoUpdate = false`), and `Zone.place` then merges its parts by material
 * (`mergeStaticParts`). The item's own transform stays live, so a builder may still move it after
 * placing. Returns whether it froze the item.
 */
function freezeStatic(item: Furniture): boolean {
  if (isLive(item) || item.occluders?.length) return false;
  let live = false;
  item.traverse((obj) => {
    if (obj !== item && isLive(obj)) live = true;
  });
  if (live) return false;
  item.traverse((obj) => {
    if (obj === item) return;
    obj.updateMatrix();
    obj.matrixAutoUpdate = false;
  });
  return true;
}

function isLive(obj: THREE.Object3D): boolean {
  return (
    isUpdatable(obj) ||
    isInteractable(obj) ||
    typeof (obj as Partial<Furniture>).dispose === 'function' ||
    (obj as THREE.Light).isLight === true ||
    (obj as THREE.Bone).isBone === true ||
    (obj as THREE.SkinnedMesh).isSkinnedMesh === true ||
    obj.userData.live === true
  );
}

/**
 * `empty`: nothing built (costs nothing). `dormant`: built and kept in memory but out of the scene,
 * not ticked, not collidable, not clickable. `active`: plugged into the engine.
 */
type ZoneState = 'empty' | 'dormant' | 'active';

/** A zone's place in the world: where it sits, how big it is, who it connects to. */
export interface ZoneSpec<Id extends string = string> {
  id: Id;
  /** World position of the zone's local origin (the centre of a room's floor). */
  origin: [x: number, y: number, z: number];
  rotationY?: number;
  /** Extent around the origin (metres): `bounds` is width x height x depth centred on origin on the floor. */
  extent: Pick<RoomOptions, 'width' | 'depth' | 'height'>;
  /** Zones kept active while the player is here (what is seen through the doorways). */
  neighbours: readonly Id[];
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

/**
 * Builds a zone's content into it (a room shell, furniture...) and returns whatever the caller wants to keep. A builder
 * may also come `sliced`: the same build as steps (a generator yielding between its sections, returning the handle),
 * which `Zone.buildSliced` runs with a pause between steps (the street, built ahead at idle moments, never freezes
 * the stairs); a plain `build()` runs them all at once.
 */
export type ZoneBuilder = ((zone: Zone) => unknown) & { readonly sliced?: (zone: Zone) => Iterator<void, unknown, void> };

/**
 * A builder whose module is fetched on demand (a dynamic `import()`, its own chunk): the zones
 * reached by travel. `Zone.load()` resolves it; until then the zone cannot be built, and the
 * `ZoneManager` keeps the player's current zone while it loads (a travel loads it behind the curtain).
 */
export interface LazyZoneBuilder {
  load(): Promise<ZoneBuilder>;
}

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

export type { DrawnAware } from './lifecycle';

/** A doorway into another zone: `bounds` is the opening (world space); `door` the leaf hung in it by this side, if any. */
interface Portal {
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
export class Zone<Id extends string = string> implements ShelvingHost {
  readonly id: Id;
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
  /** Interactables `setDrawn(false)` took off the crosshair (the ray ignores `visible`), to hand back when drawn again. */
  private readonly culled = new Set<Interactable>();
  /** The slowed ticks standing in for the items' own while the zone is undrawn (see `UNDRAWN_TICK_HZ`). */
  private readonly throttled = new Map<Updatable, ThrottledTick>();
  private readonly items = new Map<Furniture, THREE.Box3[]>();
  /** What the zone holds without it being placed now (`keep`): disposed on unload with the placed items. */
  private readonly kept = new Set<Furniture>();
  /** Interactables that are not placed furniture themselves (the boxes on the shelves). */
  private readonly looseInteractables = new Set<Interactable>();
  /** What stands on what (`ride`): per host, each rider's pose in the host's frame; `move` carries them along. */
  private readonly riders = new Map<THREE.Object3D, Map<Furniture, THREE.Matrix4>>();
  /** Placed items the player is carrying (`lift`): drawn and ticked, neither colliding nor clickable until `setDown`. */
  private readonly lifted = new Set<Furniture>();
  private readonly disposers: Array<() => void> = [];
  private readonly scoped: ScopedCollisions;
  /** The soft shadows where the furniture stands on the floor, one instanced mesh for the zone. */
  private readonly contactShadows: ContactShadows;
  /** The builder, once its module is there (at once for an eager one). */
  private builder: ZoneBuilder | null;
  private readonly lazy: LazyZoneBuilder | null;
  private loading: Promise<void> | null = null;
  /** A sliced build under way (`buildSliced`): its remaining steps, run at once by a `build()` that cannot wait. */
  private building: Iterator<void, unknown, void> | null = null;

  constructor(
    readonly spec: ZoneSpec<Id>,
    private readonly host: ZoneHost,
    source: ZoneBuilder | LazyZoneBuilder,
    /** The layer this zone's content casts shadows on, for this zone's lights only (see `SHARED_SHADOW_LAYER`). */
    readonly shadowLayer: number,
  ) {
    this.builder = typeof source === 'function' ? source : null;
    this.lazy = typeof source === 'function' ? null : source;
    this.id = spec.id;
    this.group.name = `Zone:${spec.id}`;
    this.group.position.set(...spec.origin);
    this.group.rotation.y = spec.rotationY ?? 0;
    this.group.updateMatrixWorld(true);
    // A zone never moves: its matrix is composed once (automatic, it would push a world-matrix update through the whole zone every frame).
    this.group.matrixAutoUpdate = false;
    const { width, depth, height } = spec.extent;
    this.bounds = new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, height, depth / 2)).applyMatrix4(this.group.matrixWorld);
    this.scoped = new ScopedCollisions(host.collisions);
    this.collisions = this.scoped;
    this.contactShadows = new ContactShadows(this.group);
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

  /** Whether the zone is drawn this frame (see `setDrawn`). */
  get isDrawn(): boolean {
    return this.drawn;
  }

  /** Whether the player is in this zone (see `setOccupied`). */
  get isOccupied(): boolean {
    return this.occupied;
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
    this.contactShadows.add(item);
    if (freezeStatic(item)) mergeStaticParts(item);
    if (!this.drawn && !item.seenFromNextDoor) this.hide(item);
    if (this.state === 'active') this.plug(item, boxes);
    else if (isActivityAware(item)) item.setZoneActive(false);
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
    for (const item of this.items.keys()) if (isDrawnAware(item)) item.setZoneDrawn(drawn);
    if (this.state === 'active') for (const item of this.items.keys()) this.retime(item);
    if (drawn) {
      for (const mesh of this.hiddenMeshes) mesh.visible = true;
      this.hiddenMeshes = [];
      if (this.state === 'active') for (const item of this.culled) this.host.interactableAdded(item);
      this.culled.clear();
      return;
    }
    this.hide(this.contactShadows.mesh);
    for (const item of this.items.keys()) {
      if (item.seenFromNextDoor) continue;
      this.hide(item);
      if (isInteractable(item)) this.cull(item);
    }
    // A box in the player's hand has left the zone's group for the scene: it stays in view.
    for (const box of this.looseInteractables) {
      if (!this.holds(box as unknown as THREE.Object3D)) continue;
      this.hide(box as unknown as THREE.Object3D);
      this.cull(box);
    }
  }

  /** Takes an interactable of this undrawn zone off the crosshair until `setDrawn(true)`. */
  private cull(item: Interactable): void {
    this.culled.add(item);
    if (this.state === 'active') this.host.interactableRemoved(item);
  }

  /** Shows again what culling hid under `root`: a shelf box taken in hand while its zone was out of view (a stray game, `world/strays`). */
  unhide(root: THREE.Object3D): void {
    this.reveal(root);
    const item = root as unknown as Interactable;
    if (this.culled.delete(item) && this.state === 'active') this.host.interactableAdded(item);
  }

  /** Shows again the meshes under `root` that culling hid (and forgets them). */
  private reveal(root: THREE.Object3D): void {
    this.hiddenMeshes = this.hiddenMeshes.filter((mesh) => {
      let obj: THREE.Object3D | null = mesh;
      while (obj && obj !== root) obj = obj.parent;
      if (!obj) return true;
      mesh.visible = true;
      return false;
    });
  }

  /** Whether `obj` is (still) inside this zone's group. */
  private holds(obj: THREE.Object3D): boolean {
    let node: THREE.Object3D | null = obj.parent;
    while (node && node !== this.group) node = node.parent;
    return node === this.group;
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

  /** Undoes `place()`. Safe to call twice. What rides it (`ride`) is kept: placed again, it carries them again. */
  remove(item: Furniture): void {
    const boxes = this.items.get(item);
    if (!boxes) return;
    if (this.state === 'active') this.unplug(item, boxes);
    this.items.delete(item);
    this.lifted.delete(item);
    this.contactShadows.remove(item);
    this.group.remove(item);
  }

  /** Whether `item` is placed in this zone now (not staged, not taken out). */
  isPlaced(item: Furniture): boolean {
    return this.items.has(item);
  }

  /**
   * Records `rider` as standing on (or hanging from, or belonging to) `host` as they stand now: `move(host)`
   * carries it along, keeping its pose in the host's frame. `placeWith` records it for what it places.
   */
  ride(host: THREE.Object3D, rider: Furniture): void {
    host.updateWorldMatrix(true, false);
    rider.updateWorldMatrix(true, false);
    let list = this.riders.get(host);
    if (!list) this.riders.set(host, (list = new Map()));
    list.set(rider, new THREE.Matrix4().copy(host.matrixWorld).invert().multiply(rider.matrixWorld));
  }

  /** `rider` stands on nothing any more (taken off the table it stood on): moving that host leaves it. */
  unride(rider: Furniture): void {
    for (const list of this.riders.values()) list.delete(rider);
  }

  /** What `rider` stands on (`ride`), if anything. */
  hostOf(rider: Furniture): THREE.Object3D | null {
    for (const [host, list] of this.riders) if (list.has(rider)) return host;
    return null;
  }

  /** What rides `host` (`ride`), directly. */
  ridersOf(host: THREE.Object3D): Furniture[] {
    return [...(this.riders.get(host)?.keys() ?? [])];
  }

  /**
   * Moves `item` to a new zone-local pose, and what rides it with it (`ride`, all the way down). A placed item
   * takes its colliders and its contact shadow along; one staged or taken out just stands there when it comes.
   */
  move(item: Furniture, position: THREE.Vector3, rotationY: number): void {
    item.position.copy(position);
    item.rotation.y = rotationY;
    item.updateWorldMatrix(true, false);
    const old = this.items.get(item);
    if (old) {
      const boxes = [item.footprint, ...(item.colliders ?? [])].map((box) => box.clone().applyMatrix4(item.matrixWorld));
      const solid = this.state === 'active' && !this.lifted.has(item);
      if (solid) for (const box of old) this.host.collisions.remove(box);
      this.items.set(item, boxes);
      if (solid) for (const box of boxes) this.host.collisions.add(box);
      if (!this.lifted.has(item)) {
        this.contactShadows.remove(item);
        this.contactShadows.add(item);
      }
    }
    const riders = this.riders.get(item);
    if (!riders) return;
    const toZone = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const pose = new THREE.Matrix4();
    const at = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (const [rider, local] of riders) {
      pose.multiplyMatrices(item.matrixWorld, local).premultiply(toZone).decompose(at, turn, scale);
      this.move(rider, at.clone(), new THREE.Euler().setFromQuaternion(turn, 'YXZ').y);
    }
  }

  /**
   * The player takes `item` (placed here) to move it: it and what rides it stop colliding and being clickable
   * and lose their contact shadow, but stay in the group (a lamp's light never leaves the scene) and keep ticking.
   */
  lift(item: Furniture): void {
    const boxes = this.items.get(item);
    if (boxes && !this.lifted.has(item)) {
      if (this.state === 'active') this.unplugSolid(item, boxes);
      this.lifted.add(item);
      this.contactShadows.remove(item);
    }
    for (const rider of this.ridersOf(item)) this.lift(rider);
  }

  /** Undoes `lift` where the item (and what rides it) now stands. */
  setDown(item: Furniture): void {
    const boxes = this.items.get(item);
    if (boxes && this.lifted.delete(item)) {
      if (this.state === 'active') this.plugSolid(item, boxes);
      this.contactShadows.add(item);
    }
    for (const rider of this.ridersOf(item)) this.setDown(rider);
  }

  /**
   * Hands `item` (placed here) and what rides it to zone `to`, standing where it stands now in the world: out of this
   * zone's group, colliders, ticks, culling and shadow layer, into `to`'s (the player carried it through a doorway,
   * or took it out of storage in another room). Lifted, it stays lifted there; it rides nothing any more. For the
   * flat's zones, which are never unloaded (the item is disposed with the zone that holds it then).
   */
  handOver(item: Furniture, to: Zone): void {
    if (to === this || !this.items.has(item)) return;
    const lifted = this.lifted.has(item);
    const riders = this.riders.get(item);
    item.updateWorldMatrix(true, false);
    const world = item.matrixWorld.clone();
    // What culling hid of it here comes back (`to` hides it again if it is not drawn).
    this.reveal(item);
    this.remove(item);
    this.kept.delete(item);
    this.riders.delete(item);
    for (const list of this.riders.values()) list.delete(item);
    item.traverse((obj) => obj.layers.disable(this.shadowLayer));
    const at = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    to.group.updateMatrixWorld();
    new THREE.Matrix4().copy(to.group.matrixWorld).invert().multiply(world).decompose(at, turn, new THREE.Vector3());
    // Its riders go too, keeping their pose on it; recorded on `to` before it is placed, so a lift there reaches them.
    if (riders) {
      to.riders.set(item, riders);
      for (const rider of riders.keys()) this.handOver(rider, to);
    }
    to.place(item, at, new THREE.Euler().setFromQuaternion(turn, 'YXZ').y);
    if (lifted) to.lift(item);
  }

  /**
   * Calls `visit` with every placed item and its world boxes (footprint and colliders), what is lifted left out:
   * what a piece being set down must not stand in.
   */
  forEachPlaced(visit: (item: Furniture, boxes: readonly THREE.Box3[]) => void): void {
    for (const [item, boxes] of this.items) if (!this.lifted.has(item)) visit(item, boxes);
  }

  /** ShelvingHost: boxes are interactables that come and go with rebuilds. */
  boxesChanged(added: readonly GameBox[], removed: readonly GameBox[], handedOver: readonly GameBox[] = []): void {
    // Shown by another zone's shelves now (which may have registered them already): forgotten, not taken off the crosshair.
    // Either way, what this zone's culling hid of them is shown again: another zone's shelves may stand them in view.
    for (const box of handedOver) {
      this.looseInteractables.delete(box);
      this.culled.delete(box);
      this.reveal(box);
    }
    for (const box of removed) {
      this.reveal(box);
      this.looseInteractables.delete(box);
      this.culled.delete(box);
      if (this.state === 'active') this.host.interactableRemoved(box);
    }
    for (const box of added) {
      this.looseInteractables.add(box);
      this.adopt(box);
      // One in the player's hand (it came to these shelves while carried) stays in view, like in `setDrawn`.
      if (!this.drawn && this.holds(box)) {
        this.hide(box);
        this.culled.add(box);
      } else if (this.state === 'active') this.host.interactableAdded(box);
    }
  }

  /**
   * Hands the zone a piece it holds without it being placed now: one staged until it is bought
   * (`build/owned`: in the group, hidden), one taken out while it is not wanted (`build/presence`:
   * out of the group). On unload it is disposed like a placed one: its `dispose()` (subscriptions),
   * and its GPU resources when it is out of the group (`disposeTree(group)` does the rest). Placed
   * again meanwhile, it is disposed as a placed item, once.
   */
  keep(item: Furniture): void {
    this.kept.add(item);
  }

  /** Registers clean-up for things the builder created that are not furniture (subscriptions, a Shelving). */
  onUnload(dispose: () => void): void {
    this.disposers.push(dispose);
  }

  // --- lifecycle ------------------------------------------------------------------------------------

  /** Whether the builder is a `LazyZoneBuilder` (its own chunk): the zones reached by travel, the dearest to rebuild. */
  get isLazy(): boolean {
    return this.lazy !== null;
  }

  /** Whether the builder's module is there: an eager builder always, a lazy one once `load()` resolved. */
  get isLoaded(): boolean {
    return this.builder !== null;
  }

  /** Fetches a lazy builder's module (once; a failed fetch may be retried). Resolves at once for an eager builder. */
  load(): Promise<void> {
    if (this.builder || !this.lazy) return Promise.resolve();
    this.loading ??= this.lazy.load().then(
      (builder) => {
        this.builder = builder;
      },
      (error: unknown) => {
        this.loading = null;
        throw error;
      },
    );
    return this.loading;
  }

  /** Builds the content if it is not there yet; the zone stays out of the scene until `activate()`. A lazy builder must be `load()`ed first. */
  build(): unknown {
    if (this.state === 'empty') {
      if (!this.builder) throw new Error(`[zone] ${this.id} cannot be built before its module is loaded (await zone.load() first)`);
      if (this.building) {
        // A sliced build was under way: its remaining steps now, in one go.
        let step = this.building.next();
        while (!step.done) step = this.building.next();
        this.building = null;
        this.handle = step.value;
      } else {
        this.handle = this.builder(this);
      }
      this.state = 'dormant';
    }
    return this.handle;
  }

  /**
   * Builds as `build()` does, but a `sliced` builder's steps one at a time, awaiting `between` after each (the browser's
   * next idle moment): a long build spread over several. A `build()` or `activate()` meanwhile finishes it at once.
   */
  async buildSliced(between: () => Promise<void>): Promise<unknown> {
    if (this.state !== 'empty') return this.handle;
    if (!this.builder) throw new Error(`[zone] ${this.id} cannot be built before its module is loaded (await zone.load() first)`);
    if (!this.builder.sliced) return this.build();
    this.building ??= this.builder.sliced(this);
    for (;;) {
      const steps = this.building;
      // Finished meanwhile (`build()` ran the rest), or unloaded.
      if (this.state !== 'empty' || !steps) return this.handle;
      const step = steps.next();
      if (step.done) {
        this.building = null;
        this.handle = step.value;
        this.state = 'dormant';
        return this.handle;
      }
      await between();
    }
  }

  /** Builds if needed and plugs everything into the scene, the collision world and the loop. */
  activate(): unknown {
    const handle = this.build();
    if (this.state !== 'active') {
      this.host.scene.add(this.group);
      for (const [item, boxes] of this.items) this.plug(item, boxes);
      this.scoped.setLive(true);
      for (const item of this.looseInteractables) if (!this.culled.has(item)) this.host.interactableAdded(item);
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
    // Half built (a sliced build under way): finished first, so what its steps placed is freed with the rest.
    if (this.building) this.build();
    if (this.state === 'empty') return;
    for (const dispose of this.disposers.splice(0)) dispose();
    for (const item of this.items.keys()) item.dispose?.();
    for (const item of this.kept) {
      if (this.items.has(item)) continue;
      item.dispose?.();
      if (!this.holds(item)) disposeTree(item);
    }
    this.kept.clear();
    disposeTree(this.group);
    this.group.clear();
    this.contactShadows.clear();
    this.group.add(this.contactShadows.mesh);
    this.items.clear();
    this.riders.clear();
    this.lifted.clear();
    this.looseInteractables.clear();
    this.portals.length = 0;
    this.hiddenMeshes = [];
    this.culled.clear();
    this.drawn = true;
    this.scoped.clear();
    this.handle = null;
    this.state = 'empty';
  }

  /** Whether `item` ticks slowed now: an Updatable of an undrawn zone that does not ask for every frame. */
  private slowed(item: Furniture): item is Furniture & Updatable {
    return !this.drawn && isUpdatable(item) && !item.tickEveryFrame && !item.seenFromNextDoor;
  }

  private tick(item: Furniture & Updatable): void {
    if (!this.slowed(item)) return this.host.addUpdatable(item);
    const throttled = new ThrottledTick(item);
    this.throttled.set(item, throttled);
    this.host.addUpdatable(throttled);
  }

  private untick(item: Furniture & Updatable): void {
    const throttled = this.throttled.get(item);
    if (throttled) {
      this.throttled.delete(item);
      this.host.removeUpdatable(throttled);
    } else {
      this.host.removeUpdatable(item);
    }
  }

  /** Swaps an active item between its own tick and the slowed one after a change of `drawn`. */
  private retime(item: Furniture): void {
    if (!isUpdatable(item) || this.slowed(item) === this.throttled.has(item)) return;
    this.untick(item);
    this.tick(item);
  }

  private plug(item: Furniture, boxes: THREE.Box3[]): void {
    for (const object of item.occluders ?? []) this.host.occluderAdded(object);
    if (isUpdatable(item)) this.tick(item);
    if (isActivityAware(item)) item.setZoneActive(true);
    if (!this.lifted.has(item)) this.plugSolid(item, boxes);
  }

  private unplug(item: Furniture, boxes: THREE.Box3[]): void {
    for (const object of item.occluders ?? []) this.host.occluderRemoved(object);
    if (isUpdatable(item)) this.untick(item);
    if (isActivityAware(item)) item.setZoneActive(false);
    if (!this.lifted.has(item)) this.unplugSolid(item, boxes);
  }

  /** What a lifted item gives up: its colliders and its place under the crosshair. */
  private plugSolid(item: Furniture, boxes: readonly THREE.Box3[]): void {
    for (const box of boxes) this.host.collisions.add(box);
    if (!isInteractable(item)) return;
    if (this.drawn || item.seenFromNextDoor) this.host.interactableAdded(item);
    else this.culled.add(item);
  }

  private unplugSolid(item: Furniture, boxes: readonly THREE.Box3[]): void {
    for (const box of boxes) this.host.collisions.remove(box);
    if (!isInteractable(item)) return;
    this.host.interactableRemoved(item);
    this.culled.delete(item);
  }
}
