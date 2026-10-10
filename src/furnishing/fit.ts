import * as THREE from 'three';
import type { Furniture } from '@/world/Furniture';
import { Room } from '@/world/Room';
import { RoomWindow } from '@/world/props/Window';
import { FrostedWindow } from '@/world/props/FrostedWindow';
import type { Zone } from '@/world/zone/Zone';
import type { Surface } from './surfaces';
import { WayThrough } from './way';

/** Thinner than this (m), a piece lies flat (a rug, a mat): flat things only mind each other, furniture stands over them. */
const FLAT = 0.035;
/** How far into the room a doorway is kept clear (the door's swing, the way through), and how much wider than the opening (m). */
const DOORWAY_DEPTH = 0.9;
const DOORWAY_MARGIN = 0.08;
/** On a wall, the opening itself (and its frame) is kept clear: this deep from the wall (m). */
const WALL_DEPTH = 0.12;
/** A top a small piece may be set on stands between these heights (m): a stool, a table, a dresser, not a wardrobe. */
const MIN_TOP = 0.25;
const MAX_TOP = 1.6;
/** A piece set on a top may overhang its edge by this much (m). */
const OVERHANG = 0.03;
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

/** Why a piece may not stand somewhere: what the caption says, and what is outlined in red. */
export type BlockKind = 'room' | 'doorway' | 'window' | 'piece' | 'furniture' | 'someone' | 'edge' | 'way';

/** What stops a piece being set down: its kind, its world box, and its name when it has one ("the armchair"). */
export interface Blocker {
  readonly kind: BlockKind;
  readonly box: THREE.Box3;
  readonly name?: string;
}

/** Something a piece being set down must not overlap (world box), and whether it lies flat. */
interface Obstacle extends Blocker {
  flat: boolean;
  /** The furniture it is the box of (a small piece may be set on its top). */
  owner?: Furniture;
  /** Minded by flat things too (the way through a doorway: the door would catch a rug). */
  always?: boolean;
}

/** Another movable piece of the zone: its object and what the caption calls it. */
export interface Neighbour {
  readonly item: THREE.Object3D;
  readonly name: string;
}

/** Someone standing in the room (the player, the cat, a friend): their feet (world) and how wide they stand (m). */
export interface Occupant {
  readonly at: THREE.Vector3;
  readonly radius: number;
  readonly height: number;
  readonly name: string;
}

/**
 * What a piece of `surface` may not be set down over in `zone`, made when it is taken (nothing else moves while
 * it is carried): the other furniture's boxes (footprints, colliders, and the drawn bounds of the other movable
 * pieces: pictures and plants have no footprint), on the floor the way through every doorway, on a wall its
 * windows and doorways; and, asked each time, whoever stands in the room (`occupants`).
 */
export class Fit {
  private readonly obstacles: Obstacle[] = [];
  /** The occupants' boxes, made again only when `occupants()` hands a new list (the carrier's, once a frame). */
  private feet: { from: readonly Occupant[] | null; boxes: Blocker[] } = { from: null, boxes: [] };
  private readonly room: THREE.Box3;
  private readonly roomBox: THREE.Box3;
  /** The way through the room on foot, made the first time a floor piece asks. */
  private way: WayThrough | null = null;

  constructor(
    zone: Zone,
    private readonly surface: Surface,
    carried: ReadonlySet<Furniture>,
    others: readonly Neighbour[],
    private readonly occupants: () => readonly Occupant[] = () => [],
  ) {
    const named = new Map(others.map((other) => [other.item, other.name]));
    zone.forEachPlaced((item, boxes) => {
      // A window has no footprint (nothing stops the player at a wall): on a wall it is in the way all the same.
      // (A room window's glass and frame are its hitbox: its whole tree holds shadow masks and a light shaft reaching far past it.)
      if (surface === 'wall' && (item instanceof RoomWindow || item instanceof FrostedWindow)) {
        const glass = item instanceof RoomWindow ? item.hitboxes[0] ?? item : item;
        this.obstacles.push({ kind: 'window', box: new THREE.Box3().setFromObject(glass), flat: false, always: true });
      }
      // The room's walls are its bounds (below); what the player carries moves with the piece.
      if (carried.has(item) || item instanceof Room || item.occluders?.length) return;
      const name = named.get(item) ?? plainName(item);
      for (const box of boxes) if (!box.isEmpty()) this.obstacles.push({ kind: named.has(item) ? 'piece' : 'furniture', box, flat: box.max.y - box.min.y < FLAT, owner: item, ...(name ? { name } : {}) });
    });
    for (const other of others) {
      // What rides the carried piece (a plant on the table) moves with it.
      if (carried.has(other.item as Furniture)) continue;
      const box = drawnBounds(other.item);
      if (!box.isEmpty()) this.obstacles.push({ kind: 'piece', box, flat: box.max.y - box.min.y < FLAT, owner: other.item as Furniture, name: other.name });
    }
    this.roomBox = zone.bounds.clone();
    this.room = zone.bounds.clone().expandByScalar(ROOM_SLACK);
    const room = zone.group.children.find((child): child is Room => child instanceof Room);
    const reach = surface === 'floor' ? DOORWAY_DEPTH : WALL_DEPTH;
    if (room && surface !== 'ceiling') for (const box of doorwayClearances(zone, room, reach)) this.obstacles.push({ kind: 'doorway', box, flat: false, always: true });
    // No room shell (the balcony): its doorways are its portals, kept clear that far round.
    else if (surface !== 'ceiling') for (const portal of zone.portals) this.obstacles.push({ kind: 'doorway', box: portal.bounds.clone().expandByVector(new THREE.Vector3(reach, 0, reach)), flat: false, always: true });
  }

  /** Whether a piece whose bounds are `box` (world) may stand there; `flat` for a rug. */
  allows(box: THREE.Box3, flat: boolean): boolean {
    return this.check(box, flat) === null;
  }

  /**
   * What stops a piece whose bounds are `box` (world) standing there, or null when it may; `flat` for a rug; `on`
   * the top it is set on (world box of the furniture under it), which it may not hang off.
   */
  check(box: THREE.Box3, flat: boolean, on: THREE.Box3 | null = null): Blocker | null {
    if (!this.room.containsBox(box)) return { kind: 'room', box: this.roomBox };
    if (on && (box.min.x < on.min.x - OVERHANG || box.max.x > on.max.x + OVERHANG || box.min.z < on.min.z - OVERHANG || box.max.z > on.max.z + OVERHANG)) return { kind: 'edge', box: on };
    const shrunk = scratch.copy(box).expandByScalar(-SLACK);
    if (shrunk.isEmpty()) shrunk.copy(box);
    // Flat things and furniture pass over each other; a doorway is kept clear of both.
    const hit = this.obstacles.find((o) => (o.flat === flat || o.always) && o.box.intersectsBox(shrunk));
    if (hit) return hit;
    // Nothing is set down on anyone's feet (a rug slides under them, a picture hangs over them).
    if (flat || this.surface !== 'floor') return null;
    // Nor where it shuts part of the room away from its doorways (outlined: the floor it would cut off).
    if (!on) {
      const cut = this.wayThrough().cutOff(shrunk);
      if (cut) return { kind: 'way', box: cut };
    }
    const occupants = this.occupants();
    if (occupants !== this.feet.from) {
      this.feet = {
        from: occupants,
        boxes: occupants.map((who) => ({
          kind: 'someone' as const,
          box: new THREE.Box3(new THREE.Vector3(who.at.x - who.radius, who.at.y, who.at.z - who.radius), new THREE.Vector3(who.at.x + who.radius, who.at.y + who.height, who.at.z + who.radius)),
          name: who.name,
        })),
      };
    }
    return this.feet.boxes.find((who) => who.box.intersectsBox(shrunk)) ?? null;
  }

  /**
   * The top of a piece of furniture the aim `ray` (world) crosses first within `far` metres, between knee and
   * shoulder height: where a small piece may be set (on a table, a dresser, a stool). Its world box and height.
   */
  topAt(ray: THREE.Ray, far: number): { point: THREE.Vector3; owner: Furniture; box: THREE.Box3 } | null {
    const { origin, direction } = ray;
    if (direction.y > -1e-4) return null;
    let best: { t: number; point: THREE.Vector3; owner: Furniture; box: THREE.Box3 } | null = null;
    for (const o of this.obstacles) {
      if (!o.owner || o.flat || o.always) continue;
      const top = o.box.max.y;
      if (top < MIN_TOP || top > MAX_TOP || origin.y < top) continue;
      const t = (top - origin.y) / direction.y;
      if (t <= 0 || t > far || (best && t >= best.t)) continue;
      const point = origin.clone().addScaledVector(direction, t);
      if (point.x < o.box.min.x || point.x > o.box.max.x || point.z < o.box.min.z || point.z > o.box.max.z) continue;
      best = { t, point, owner: o.owner, box: o.box };
    }
    return best && { point: best.point, owner: best.owner, box: best.box };
  }

  /** The furniture (world boxes, placed items) whose top holds a point just under `at` (world): what a piece set there stands on. */
  hostUnder(at: THREE.Vector3): Furniture | null {
    for (const o of this.obstacles) {
      if (!o.owner || o.flat || o.always) continue;
      const { min, max } = o.box;
      if (at.x >= min.x && at.x <= max.x && at.z >= min.z && at.z <= max.z && Math.abs(max.y - at.y) < 0.03) return o.owner;
    }
    return null;
  }

  private wayThrough(): WayThrough {
    this.way ??= new WayThrough(
      this.roomBox,
      this.obstacles.filter((o) => !o.flat && (o.kind === 'piece' || o.kind === 'furniture')).map((o) => o.box),
      this.obstacles.filter((o) => o.kind === 'doorway').map((o) => o.box),
    );
    return this.way;
  }

  /** The ways through the doorways (and the window openings on a wall) kept clear (world): drawn faintly while carrying. */
  clearances(): THREE.Box3[] {
    return this.obstacles.filter((o) => o.kind === 'doorway' || o.kind === 'window').map((o) => o.box);
  }

  /** The other furniture's boxes (world), flat or not as the piece is: what a carried piece lines up with. */
  alignTargets(flat: boolean): THREE.Box3[] {
    return this.obstacles.filter((o) => o.flat === flat && (o.kind === 'piece' || o.kind === 'furniture')).map((o) => o.box);
  }
}

/** A piece's own name for the caption: "HallConsole" is "hall console"; nothing for an unnamed group. */
export function plainName(item: THREE.Object3D): string | undefined {
  const name = item.name.trim();
  if (!name || /[^A-Za-z ]/.test(name) || ['Group', 'Object3D', 'Mesh', 'Furniture'].includes(name)) return undefined;
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
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
