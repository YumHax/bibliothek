import * as THREE from 'three';
import type { HomeUpgrades } from '@/economy/HomeUpgrades';
import { homeGood } from '@/economy/homeGoods';
import type { Furniture } from '@/world/Furniture';
import type { Placement } from '@/world/Placement';
import type { Zone } from '@/world/zone/Zone';
import { isOwned, type Owned } from '@/world/build/owned';
import type { FurnitureLayout } from './FurnitureLayout';
import { surfaceOf, type Surface } from './surfaces';

/** A piece of the flat's furniture the player may move (`Furnishings.register`). */
export interface Piece {
  readonly zone: Zone;
  readonly item: Furniture;
  /** Its name in the saved layout, unique in its zone. */
  readonly key: string;
  readonly surface: Surface;
  /** A wall piece: how far off the wall it hangs (m). */
  readonly offset: number;
  /** What the caption calls it. */
  readonly name: string;
  /** What must be bought for it to stand (it cannot be moved before). */
  readonly owned?: Owned;
}

export interface PieceSpec {
  key: string;
  /** Where its plan puts it: says what it moves over (floor, wall, ceiling). Absent: the floor. */
  at?: Placement;
  owned?: Owned;
  /** The caption's name; the bought good's name by default. */
  name?: string;
}

/**
 * The flat's movable furniture: what was bought for it, each piece registered by the builder that places it,
 * and where the player has moved it (`FurnitureLayout`). A piece registered with a saved pose goes there once its
 * builder is done (so what stands on it, placed later by the builder, rides along). The carrying is the
 * `FurnitureCarrier`'s.
 */
export class Furnishings {
  private readonly pieces = new Set<Piece>();
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly layout: FurnitureLayout,
    private readonly upgrades?: HomeUpgrades,
  ) {}

  /**
   * `item`, placed (or staged till bought) in `zone` by its builder, may be moved by the player. Nothing happens
   * for a piece its plan sets on something else (a pot on a worktop: it stays).
   */
  register(zone: Zone, item: Furniture, spec: PieceSpec): void {
    const surface = surfaceOf(spec.at);
    if (!surface) return;
    const piece: Piece = {
      zone,
      item,
      key: spec.key,
      surface: surface.surface,
      offset: surface.offset,
      name: spec.name ?? nameOf(spec.owned) ?? 'This',
      ...(spec.owned !== undefined ? { owned: spec.owned } : {}),
    };
    this.pieces.add(piece);
    zone.onUnload(() => this.pieces.delete(piece));
    const saved = this.layout.get(zone.id, spec.key);
    // Once the builder is done: whatever it stands on it by then rides along.
    if (saved) queueMicrotask(() => zone.move(item, new THREE.Vector3(saved.x, saved.y, saved.z), saved.yaw));
  }

  /** Whether `piece` can be moved now: bought, and standing in its zone. */
  movable(piece: Piece): boolean {
    return isOwned(this.upgrades, piece.owned) && piece.zone.isPlaced(piece.item);
  }

  /** The other movable pieces of `piece`'s zone: what it must not be set down over. */
  neighboursOf(piece: Piece): Furniture[] {
    return [...this.pieces].filter((p) => p !== piece && p.zone === piece.zone && this.movable(p)).map((p) => p.item);
  }

  /** The movable piece `ray` (world) meets first within `far` metres (what stands on a piece picks the piece), and where. */
  pieceAt(ray: THREE.Ray, far: number): { piece: Piece; point: THREE.Vector3 } | null {
    this.raycaster.set(ray.origin, ray.direction);
    this.raycaster.far = far;
    let best: { piece: Piece; point: THREE.Vector3; distance: number } | null = null;
    for (const piece of this.pieces) {
      if (!piece.zone.isActive || !this.movable(piece)) continue;
      for (const part of [piece.item, ...ridersOf(piece.zone, piece.item)]) {
        const hit = this.raycaster.intersectObject(part, true)[0];
        if (hit && (!best || hit.distance < best.distance)) best = { piece, point: hit.point, distance: hit.distance };
      }
    }
    return best && { piece: best.piece, point: best.point };
  }

  /** `piece` was set down where it stands: remembered. */
  save(piece: Piece): void {
    const { position, rotation } = piece.item;
    this.layout.set(piece.zone.id, piece.key, { x: position.x, y: position.y, z: position.z, yaw: rotation.y });
  }
}

/**
 * What rides `host` in `zone` and stands there now, all the way down (a lamp on a table, the stray box on the lamp's
 * table...): one taken out of the zone (the cake while there is none) or staged, unbought (hidden), is left out. They
 * still move with it (`Zone.move`); they only take no room and cannot be aimed at.
 */
export function ridersOf(zone: Zone, host: THREE.Object3D): Furniture[] {
  const all: Furniture[] = [];
  for (const rider of zone.ridersOf(host)) if (zone.isPlaced(rider) && shownIn(rider, zone.group)) all.push(rider, ...ridersOf(zone, rider));
  return all;
}

/** Whether `object` and every parent up to `root` are visible. */
function shownIn(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o && o !== root; o = o.parent) if (!o.visible) return false;
  return true;
}

/** The bought good's name ("Armchair"), from what it needs bought. */
function nameOf(owned: Owned | undefined): string | null {
  if (owned === undefined) return null;
  if (typeof owned === 'string') return homeGood(owned).name;
  if (isList(owned)) return owned.length ? nameOf(owned[0]) : null;
  return homeGood(owned.good).name;
}

/** A stable key for a plan entry needing `owned` bought ("houseplant#3", "speakers"), unique per zone with `seen` counting repeats. */
export function ownedKey(owned: Owned, seen: Map<string, number>): string {
  const base = baseKey(owned);
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n ? `${base}~${n}` : base;
}

function baseKey(owned: Owned): string {
  if (typeof owned === 'string') return owned;
  if (isList(owned)) return owned.map(baseKey).join('+');
  return `${owned.good}#${owned.nth}`;
}

function isList(owned: Owned): owned is readonly Owned[] {
  return Array.isArray(owned);
}
