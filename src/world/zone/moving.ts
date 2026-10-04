import * as THREE from 'three';
import type { CollisionWorld } from '@/core/Collider';
import type { Furniture } from '../Furniture';

/*
 * Moving a zone's placed furniture about (docs/furnishing.md): what stands on what (`ride`), a piece the player
 * carries (`lift` / `setDown`), a new pose with everything riding it (`move`), and a piece carried through a doorway
 * into another zone (`handOver`). The zone keeps the placing and the loading; this keeps the riders and the lifted,
 * and asks the zone for the rest through `MovingHost`.
 */

/** What moving needs of its zone: where its items are, and how to take their solidity, shadow and place away or back. */
interface MovingHost {
  readonly group: THREE.Object3D;
  /** The layer this zone's content casts shadows on (an item handed over leaves it). */
  readonly shadowLayer: number;
  /** Whether the zone's items collide and are clickable now. */
  readonly isActive: boolean;
  /** The world's collisions, where a placed item's boxes live while the zone is active. */
  readonly collisions: CollisionWorld;
  /** A placed item's world boxes (footprint and colliders); none when it is not placed here. */
  boxesOf(item: Furniture): THREE.Box3[] | undefined;
  setBoxes(item: Furniture, boxes: THREE.Box3[]): void;
  /** Lays or takes away the item's contact shadow. */
  shadow(item: Furniture, shown: boolean): void;
  /** What a lifted item gives up or gets back: its colliders and its place under the crosshair. */
  plugSolid(item: Furniture, boxes: readonly THREE.Box3[]): void;
  unplugSolid(item: Furniture, boxes: readonly THREE.Box3[]): void;
  /** Shows again what the zone's culling hid of the item. */
  reveal(item: Furniture): void;
  /** Undoes the item's placing here, and forgets it among what the zone keeps unplaced. */
  remove(item: Furniture): void;
  forget(item: Furniture): void;
}

/** Where a handed-over item goes: another zone, its moving and its placing. */
interface HandOverTarget {
  readonly moving: Moving;
  readonly group: THREE.Object3D;
  place(item: Furniture, position: THREE.Vector3, rotationY: number): void;
}

export class Moving {
  /** What stands on what (`ride`): per host, each rider's pose in the host's frame; `move` carries them along. */
  private readonly riders = new Map<THREE.Object3D, Map<Furniture, THREE.Matrix4>>();
  /** Placed items the player is carrying (`lift`): drawn and ticked, neither colliding nor clickable until `setDown`. */
  private readonly lifted = new Set<Furniture>();

  constructor(private readonly zone: MovingHost) {}

  /** Whether the player is carrying `item` (it collides with nothing and takes no click until set down). */
  isLifted(item: Furniture): boolean {
    return this.lifted.has(item);
  }

  /** `item` is no longer placed: it is not lifted either. */
  forget(item: Furniture): void {
    this.lifted.delete(item);
  }

  /** The zone unloads: nothing rides or is carried any more. */
  clear(): void {
    this.riders.clear();
    this.lifted.clear();
  }

  /**
   * Records `rider` as standing on (or hanging from, or belonging to) `host` as they stand now: `move(host)`
   * carries it along, keeping its pose in the host's frame.
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
    const zone = this.zone;
    item.position.copy(position);
    item.rotation.y = rotationY;
    item.updateWorldMatrix(true, false);
    const old = zone.boxesOf(item);
    if (old) {
      const boxes = [item.footprint, ...(item.colliders ?? [])].map((box) => box.clone().applyMatrix4(item.matrixWorld));
      const solid = zone.isActive && !this.lifted.has(item);
      if (solid) for (const box of old) zone.collisions.remove(box);
      zone.setBoxes(item, boxes);
      if (solid) for (const box of boxes) zone.collisions.add(box);
      if (!this.lifted.has(item)) {
        zone.shadow(item, false);
        zone.shadow(item, true);
      }
    }
    const riders = this.riders.get(item);
    if (!riders) return;
    const toZone = new THREE.Matrix4().copy(zone.group.matrixWorld).invert();
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
    const boxes = this.zone.boxesOf(item);
    if (boxes && !this.lifted.has(item)) {
      if (this.zone.isActive) this.zone.unplugSolid(item, boxes);
      this.lifted.add(item);
      this.zone.shadow(item, false);
    }
    for (const rider of this.ridersOf(item)) this.lift(rider);
  }

  /** Undoes `lift` where the item (and what rides it) now stands. */
  setDown(item: Furniture): void {
    const boxes = this.zone.boxesOf(item);
    if (boxes && this.lifted.delete(item)) {
      if (this.zone.isActive) this.zone.plugSolid(item, boxes);
      this.zone.shadow(item, true);
    }
    for (const rider of this.ridersOf(item)) this.setDown(rider);
  }

  /**
   * Hands `item` (placed here) and what rides it to zone `to`, standing where it stands now in the world: out of this
   * zone's group, colliders, ticks, culling and shadow layer, into `to`'s (the player carried it through a doorway,
   * or took it out of storage in another room). Lifted, it stays lifted there; it rides nothing any more. For the
   * flat's zones, which are never unloaded (the item is disposed with the zone that holds it then).
   */
  handOver(item: Furniture, to: HandOverTarget): void {
    if (to.moving === this || !this.zone.boxesOf(item)) return;
    const lifted = this.lifted.has(item);
    const riders = this.riders.get(item);
    item.updateWorldMatrix(true, false);
    const world = item.matrixWorld.clone();
    // What culling hid of it here comes back (`to` hides it again if it is not drawn).
    this.zone.reveal(item);
    this.zone.remove(item);
    this.zone.forget(item);
    this.riders.delete(item);
    for (const list of this.riders.values()) list.delete(item);
    item.traverse((obj) => obj.layers.disable(this.zone.shadowLayer));
    const at = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    to.group.updateMatrixWorld();
    new THREE.Matrix4().copy(to.group.matrixWorld).invert().multiply(world).decompose(at, turn, new THREE.Vector3());
    // Its riders go too, keeping their pose on it; recorded on `to` before it is placed, so a lift there reaches them.
    if (riders) {
      to.moving.riders.set(item, riders);
      for (const rider of riders.keys()) this.handOver(rider, to);
    }
    to.place(item, at, new THREE.Euler().setFromQuaternion(turn, 'YXZ').y);
    if (lifted) to.moving.lift(item);
  }
}
