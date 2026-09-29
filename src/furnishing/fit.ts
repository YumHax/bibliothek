import * as THREE from 'three';
import type { Furniture } from '@/world/Furniture';
import { Room } from '@/world/Room';
import { RoomWindow } from '@/world/props/Window';
import { FrostedWindow } from '@/world/props/FrostedWindow';
import type { Zone } from '@/world/zone/Zone';
import type { Surface } from './surfaces';

/** Thinner than this (m), a piece lies flat (a rug, a mat): flat things only mind each other, furniture stands over them. */
const FLAT = 0.035;
/** How far into the room a doorway is kept clear (the door's swing, the way through), and how much wider than the opening (m). */
const DOORWAY_DEPTH = 0.9;
const DOORWAY_MARGIN = 0.08;
/** On a wall, the opening itself (and its frame) is kept clear: this deep from the wall (m). */
const WALL_DEPTH = 0.12;
/** Overlaps smaller than this are forgiven (m): the plan's own pieces stand close. */
const SLACK = 0.015;
/** A piece's own bounds may reach this far past the room's (m): a picture's back against the wall. */
const ROOM_SLACK = 0.03;

const scratch = new THREE.Box3();
const toItem = new THREE.Matrix4();
const partMatrix = new THREE.Matrix4();

/**
 * The bounds of `item` and of what rides it (`riders`), in the item's own frame: the visible meshes (an invisible
 * hitbox is often generous), lights and sprites left out.
 */
export function localBounds(item: THREE.Object3D, riders: readonly THREE.Object3D[] = []): THREE.Box3 {
  item.updateWorldMatrix(true, true);
  toItem.copy(item.matrixWorld).invert();
  const bounds = new THREE.Box3();
  for (const root of [item, ...riders]) {
    if (!root.visible) continue;
    root.updateWorldMatrix(true, true);
    // What is drawn only: a hidden part (a staged lamp, a shut box's insides) takes no room.
    root.traverseVisible((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.Material | THREE.Material[];
      if (!Array.isArray(material) && !material.visible) return;
      const geometry = mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;
      partMatrix.multiplyMatrices(toItem, mesh.matrixWorld);
      bounds.union(scratch.copy(geometry.boundingBox).applyMatrix4(partMatrix));
    });
  }
  return bounds;
}

/** The world box of what `item` draws (its invisible hitboxes and hidden parts left out). */
function drawnBounds(item: THREE.Object3D): THREE.Box3 {
  const local = localBounds(item);
  return local.isEmpty() ? local : local.applyMatrix4(item.matrixWorld);
}

/** Something a piece being set down must not overlap (world box), and whether it lies flat. */
interface Obstacle {
  box: THREE.Box3;
  flat: boolean;
  /** Minded by flat things too (the way through a doorway: the door would catch a rug). */
  always?: boolean;
}

/**
 * What a piece of `surface` may not be set down over in `zone`, made when it is taken (nothing else moves while
 * it is carried): the other furniture's boxes (footprints, colliders, and the drawn bounds of the other movable
 * pieces: pictures and plants have no footprint), on the floor the way through every doorway, on a wall its
 * windows and doorways.
 */
export class Fit {
  private readonly obstacles: Obstacle[] = [];
  private readonly room: THREE.Box3;

  constructor(zone: Zone, surface: Surface, carried: ReadonlySet<Furniture>, others: readonly THREE.Object3D[]) {
    zone.forEachPlaced((item, boxes) => {
      // A window has no footprint (nothing stops the player at a wall): on a wall it is in the way all the same.
      // (A room window's glass and frame are its hitbox: its whole tree holds shadow masks and a light shaft reaching far past it.)
      if (surface === 'wall' && (item instanceof RoomWindow || item instanceof FrostedWindow)) {
        const glass = item instanceof RoomWindow ? item.hitboxes[0] ?? item : item;
        this.obstacles.push({ box: new THREE.Box3().setFromObject(glass), flat: false, always: true });
      }
      // The room's walls are its bounds (below); what the player carries moves with the piece.
      if (carried.has(item) || item instanceof Room || item.occluders?.length) return;
      for (const box of boxes) if (!box.isEmpty()) this.obstacles.push({ box, flat: box.max.y - box.min.y < FLAT });
    });
    for (const other of others) {
      const box = drawnBounds(other);
      if (!box.isEmpty()) this.obstacles.push({ box, flat: box.max.y - box.min.y < FLAT });
    }
    this.room = zone.bounds.clone().expandByScalar(ROOM_SLACK);
    const room = zone.group.children.find((child): child is Room => child instanceof Room);
    const reach = surface === 'floor' ? DOORWAY_DEPTH : WALL_DEPTH;
    if (room && surface !== 'ceiling') for (const box of doorwayClearances(zone, room, reach)) this.obstacles.push({ box, flat: false, always: true });
    // No room shell (the balcony): its doorways are its portals, kept clear that far round.
    else if (surface !== 'ceiling') for (const portal of zone.portals) this.obstacles.push({ box: portal.bounds.clone().expandByVector(new THREE.Vector3(reach, 0, reach)), flat: false, always: true });
  }

  /** Whether a piece whose bounds are `box` (world) may stand there; `flat` for a rug. */
  allows(box: THREE.Box3, flat: boolean): boolean {
    if (!this.room.containsBox(box)) return false;
    const shrunk = scratch.copy(box).expandByScalar(-SLACK);
    if (shrunk.isEmpty()) shrunk.copy(box);
    // Flat things and furniture pass over each other; a doorway is kept clear of both.
    return !this.obstacles.some((o) => (o.flat === flat || o.always) && o.box.intersectsBox(shrunk));
  }
}

/** A box `reach` deep in front of every doorway of `room`, on its side of the wall, as tall as the opening (world). */
function doorwayClearances(zone: Zone, room: Room, reach: number): THREE.Box3[] {
  const { width, depth } = room.options;
  return (room.options.doorways ?? []).map((doorway) => {
    const half = doorway.width / 2 + DOORWAY_MARGIN;
    const min = new THREE.Vector3();
    const max = new THREE.Vector3();
    switch (doorway.wall) {
      case 'back':
        min.set(doorway.along - half, 0, -depth / 2);
        max.set(doorway.along + half, doorway.height, -depth / 2 + reach);
        break;
      case 'front':
        min.set(doorway.along - half, 0, depth / 2 - reach);
        max.set(doorway.along + half, doorway.height, depth / 2);
        break;
      case 'left':
        min.set(-width / 2, 0, doorway.along - half);
        max.set(-width / 2 + reach, doorway.height, doorway.along + half);
        break;
      case 'right':
        min.set(width / 2 - reach, 0, doorway.along - half);
        max.set(width / 2, doorway.height, doorway.along + half);
        break;
    }
    return new THREE.Box3(min, max).applyMatrix4(zone.group.matrixWorld);
  });
}
