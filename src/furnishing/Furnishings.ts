import * as THREE from 'three';
import type { HomeUpgrades } from '@/economy/HomeUpgrades';
import { homeGood } from '@/economy/homeGoods';
import type { Furniture } from '@/world/Furniture';
import type { Placement } from '@/world/Placement';
import type { Zone } from '@/world/zone/Zone';
import { isOwned, type Owned } from '@/world/build/owned';
import { GameBox } from '@/world/GameBox';
import { setShownKeepingLights } from '@/world/lighting/keepLights';
import { Room } from '@/world/Room';
import { Fit, localBounds, plainName, type Neighbour } from './fit';
import type { FurnitureLayout } from './FurnitureLayout';
import { surfaceOf, turnedBounds, type Pose, type Surface } from './surfaces';

/** A saved pose is checked on load with this much more slack (m): the plan's own pieces stand close. */
const LOAD_SLACK = 0.03;

/** A piece of the flat's furniture the player may move (`Furnishings.register`). */
export interface Piece {
  /** The room it stands in now (it may have been carried to another, or taken out of storage there). */
  zone: Zone;
  /** The room whose builder placed it: its saved pose is kept under that room's id, and its `home` is there. */
  readonly origin: Zone;
  readonly item: Furniture;
  /** Its name in the saved layout, unique in its origin zone. */
  readonly key: string;
  readonly surface: Surface;
  /** A wall piece: how far off the wall it hangs (m). */
  readonly offset: number;
  /** What the caption calls it. */
  readonly name: string;
  /** What must be bought for it to stand (it cannot be moved before). */
  readonly owned?: Owned;
  /** Where its plan puts it (in `origin`'s frame), and what it stands on there: a room's furniture reset goes back there. */
  readonly home: Pose & { readonly host: THREE.Object3D | null };
  /** It stays in its own room and is never put away (a bookcase: its shelving lays its boxes out). */
  readonly keepsRoom: boolean;
}

interface PieceSpec {
  key: string;
  /** Where its plan puts it: says what it moves over (floor, wall, ceiling). Absent: the floor. */
  at?: Placement;
  owned?: Owned;
  /** The caption's name; the bought good's name by default. */
  name?: string;
  /** Never carried to another room nor put away (a bookcase). */
  keepsRoom?: boolean;
}

/**
 * The flat's movable furniture: what was bought for it, each piece registered by the builder that places it,
 * and where the player has moved it (`FurnitureLayout`). A piece registered with a saved pose goes there once its
 * builder is done (so what stands on it, placed later by the builder, rides along). The carrying is the
 * `FurnitureCarrier`'s.
 */
export class Furnishings {
  private readonly pieces = new Set<Piece>();
  /** The zones pieces were registered in (what `fixedAt` looks through). */
  private readonly zones = new Set<Zone>();
  /** The pieces put away (hidden, out of their zone, lights kept dark), by the player's order of putting them away. */
  private readonly stored = new Set<Piece>();
  private readonly raycaster = new THREE.Raycaster();
  /** The flat's zones by id (`setZones`): where a piece carried to another room is put back on load. */
  private zoneById: (id: string) => Zone | undefined = () => undefined;
  private readonly goneListeners = new Set<(piece: Piece) => void>();

  constructor(
    private readonly layout: FurnitureLayout,
    private readonly upgrades?: HomeUpgrades,
  ) {}

  /** How to find the flat's zones by id (`bootstrap/world`, before the first builder's microtasks run). */
  setZones(byId: (id: string) => Zone | undefined): void {
    this.zoneById = byId;
  }

  /** `listener` hears of a piece gone for good (`unregister`): the carrier lets go of it, the undo forgets it. */
  onGone(listener: (piece: Piece) => void): () => void {
    this.goneListeners.add(listener);
    return () => this.goneListeners.delete(listener);
  }

  /**
   * `item`, placed (or staged till bought) in `zone` by its builder, may be moved by the player. Nothing happens
   * for a piece its plan sets on something else (a pot on a worktop: it stays).
   */
  register(zone: Zone, item: Furniture, spec: PieceSpec): void {
    const surface = surfaceOf(spec.at);
    if (!surface) return;
    const piece: Piece = {
      zone,
      origin: zone,
      item,
      key: spec.key,
      surface: surface.surface,
      offset: surface.offset,
      name: spec.name ?? nameOf(spec.owned) ?? 'This',
      ...(spec.owned !== undefined ? { owned: spec.owned } : {}),
      home: { position: item.position.clone(), yaw: item.rotation.y, host: zone.hostOf(item) },
      keepsRoom: spec.keepsRoom ?? false,
    };
    this.pieces.add(piece);
    // One clean-up per zone (a bookcase registered again at every rebuild adds none).
    if (!this.zones.has(zone)) zone.onUnload(() => {
      for (const p of this.pieces) if (p.origin === zone) this.pieces.delete(p);
    });
    this.zones.add(zone);
    const saved = this.layout.get(zone.id, spec.key);
    if (!saved) return;
    // Once the builder is done: whatever it stands on it by then rides along. Once every piece stands where it was
    // saved (the next turn of microtasks), a pose the plan has since made impossible (a new wall unit there) is dropped.
    queueMicrotask(() => {
      const home = { position: item.position.clone(), yaw: item.rotation.y, host: zone.hostOf(item) };
      (piece as { home: Piece['home'] }).home = home;
      // Carried to another room of the flat: handed over there first, then posed in that room's frame. A room that
      // is gone, or a piece that may no longer change rooms, stays where its plan puts it.
      if (saved.in && saved.in !== zone.id) {
        const there = this.zoneById(saved.in);
        if (!there || !this.canChangeRoom(piece) || !zone.isPlaced(item)) {
          this.layout.delete(zone.id, spec.key);
          return;
        }
        this.handTo(piece, there);
      }
      // Moved on its own, it no longer stands on what its plan put it on.
      piece.zone.unride(item);
      piece.zone.move(item, new THREE.Vector3(saved.x, saved.y, saved.z), saved.yaw);
      if (saved.stored && !piece.keepsRoom) this.putAway(piece);
      else queueMicrotask(() => this.checkSaved(piece));
    });
  }

  /** A saved pose that no longer fits (the plan changed under it): the piece goes back where the plan puts it. */
  private checkSaved(piece: Piece): void {
    const { zone, item } = piece;
    if (!zone.isPlaced(item) || !isOwned(this.upgrades, piece.owned)) return;
    const riders = ridersOf(zone, item);
    const bounds = localBounds(item, riders);
    if (bounds.isEmpty()) return;
    zone.group.updateMatrixWorld();
    const box = turnedBounds(bounds, item.rotation.y).translate(item.position).applyMatrix4(zone.group.matrixWorld).expandByScalar(-LOAD_SLACK);
    if (box.isEmpty()) return;
    const fit = new Fit(zone, piece.surface, new Set([item, ...riders]), this.neighboursOf(piece));
    const blocker = fit.check(box, bounds.max.y - bounds.min.y < 0.035);
    if (!blocker || blocker.kind === 'someone') {
      this.standOnWhatIsUnder(piece, fit);
      return;
    }
    console.info(`[furnishing] ${zone.id}/${piece.key}: its saved spot is taken (${blocker.kind}${blocker.name ? `: ${blocker.name}` : ''}); back where the plan puts it`);
    this.sendHome(piece);
  }

  /**
   * `item` is gone for good (a bookcase a shelving rebuild took down): no longer a piece. Its saved pose stays, for
   * the item registered next under the same key (the bookcase put up in its place).
   */
  unregister(item: Furniture): void {
    for (const piece of this.pieces) {
      if (piece.item !== item) continue;
      this.pieces.delete(piece);
      this.stored.delete(piece);
      for (const listener of this.goneListeners) listener(piece);
    }
  }

  /** Whether `piece` is still one of the flat's pieces (not taken down by a rebuild). */
  has(piece: Piece): boolean {
    return this.pieces.has(piece);
  }

  /** Whether `piece` can be moved now: bought, and standing in its zone. */
  movable(piece: Piece): boolean {
    return isOwned(this.upgrades, piece.owned) && piece.zone.isPlaced(piece.item);
  }

  /** The other movable pieces of `zone` (`piece`'s by default), by name: what it must not be set down over. */
  neighboursOf(piece: Piece, zone: Zone = piece.zone): Neighbour[] {
    return [...this.pieces].filter((p) => p !== piece && p.zone === zone && this.movable(p)).map((p) => ({ item: p.item, name: p.name.toLowerCase() }));
  }

  /** The movable pieces of `zone` (bought, standing there). */
  piecesIn(zone: Zone): Piece[] {
    return [...this.pieces].filter((p) => p.zone === zone && this.movable(p));
  }

  /** The piece `key` of zone `zoneId`, if it is registered now. */
  find(zoneId: string, key: string): Piece | null {
    for (const piece of this.pieces) if (piece.zone.id === zoneId && piece.key === key) return piece;
    return null;
  }

  /** Whether `piece` stands somewhere else than its plan puts it (it was moved and saved). */
  moved(piece: Piece): boolean {
    return this.layout.get(piece.origin.id, piece.key) !== null;
  }

  /**
   * A floor piece standing raised (set on a table, a dresser) rides what it stands on, found under its feet with
   * `fit`'s boxes; one on the floor rides nothing. Pieces hung on a wall or the ceiling are left as they are.
   */
  standOnWhatIsUnder(piece: Piece, fit: Fit): void {
    const { zone, item } = piece;
    if (piece.surface !== 'floor') return;
    const bounds = localBounds(item);
    zone.group.updateMatrixWorld();
    const foot = item.position.clone().setY(item.position.y + bounds.min.y).applyMatrix4(zone.group.matrixWorld);
    const host = item.position.y > 0.02 ? fit.hostUnder(foot) : null;
    if (host === zone.hostOf(item)) return;
    zone.unride(item);
    if (host) zone.ride(host, item);
  }

  /** `piece` goes back where its plan puts it (in its own room), and is forgotten by the saved layout. */
  sendHome(piece: Piece): void {
    if (this.stored.has(piece)) this.bringOut(piece);
    this.handTo(piece, piece.origin);
    const { zone, item, home } = piece;
    zone.unride(item);
    zone.move(item, home.position, home.yaw);
    if (home.host) zone.ride(home.host, item);
    this.layout.delete(piece.origin.id, piece.key);
  }

  /** Sends `pieces` home, what others stand on first (so they do not drag what went home before them). */
  sendAllHome(pieces: readonly Piece[]): void {
    const order = [...pieces].sort((a, b) => Number(a.home.host !== null) - Number(b.home.host !== null));
    for (const piece of order) this.sendHome(piece);
  }

  /**
   * Whether `piece` may go to another room: not a bookcase, and nothing unbought stands on it (a lamp staged on its
   * table, still its room's till bought).
   */
  canChangeRoom(piece: Piece): boolean {
    return !piece.keepsRoom && !this.hasStagedRiders(piece.zone, piece.item);
  }

  private hasStagedRiders(zone: Zone, host: THREE.Object3D): boolean {
    return zone.ridersOf(host).some((rider) => !zone.isPlaced(rider) || this.hasStagedRiders(zone, rider));
  }

  /**
   * `piece` (placed, carried or not) handed to `zone` where it stands in the world (it follows the player through a
   * doorway), and every piece riding it with it.
   */
  handTo(piece: Piece, zone: Zone): void {
    if (piece.zone === zone || !this.canChangeRoom(piece)) return;
    const riding = this.riderPieces(piece);
    piece.zone.handOver(piece.item, zone);
    piece.zone = zone;
    for (const rider of riding) rider.zone = zone;
  }

  /** The pieces standing on `piece` (a plant set on the table), all the way up. */
  private riderPieces(piece: Piece): Piece[] {
    const items = new Set<THREE.Object3D>(ridersOf(piece.zone, piece.item));
    return [...this.pieces].filter((p) => p !== piece && items.has(p.item));
  }

  // --- putting away -----------------------------------------------------------------------------------

  /** Whether `piece` may be put away now: not a bookcase, and nothing stands on it (a lamp would float in the dark). */
  storable(piece: Piece): boolean {
    return !piece.keepsRoom && piece.zone.ridersOf(piece.item).length === 0;
  }

  /** Puts `piece` away (carried or standing): out of its room, hidden, its lights kept dark; saved so. False when it may not be. */
  store(piece: Piece): boolean {
    if (!this.storable(piece) || this.stored.has(piece)) return false;
    this.putAway(piece);
    this.save(piece);
    return true;
  }

  /** The pieces put away, anywhere in the flat, first put away first. */
  storedPieces(): Piece[] {
    return [...this.stored].filter((p) => this.pieces.has(p));
  }

  /** Whether `piece` is put away. */
  isStored(piece: Piece): boolean {
    return this.stored.has(piece);
  }

  /**
   * Takes `piece` out of storage into `zone`, standing at `pose` (`zone`-local) for the carrier to take it at once;
   * saved only once it is set down.
   */
  takeOut(piece: Piece, zone: Zone, pose: Pose): void {
    if (!this.stored.has(piece)) return;
    this.bringOut(piece);
    this.handTo(piece, zone);
    piece.zone.move(piece.item, pose.position, pose.yaw);
  }

  private putAway(piece: Piece): void {
    const { zone, item } = piece;
    // It stands on nothing any more: the table it was on moves without it.
    zone.unride(item);
    if (zone.isPlaced(item)) zone.remove(item);
    // Out of the zone, still its: disposed with it (the flat's zones never unload).
    zone.keep(item);
    setShownKeepingLights(item, false);
    this.stored.add(piece);
  }

  /** Back in its zone where it stood when put away (hidden lights lit again). */
  private bringOut(piece: Piece): void {
    const { zone, item } = piece;
    this.stored.delete(piece);
    setShownKeepingLights(item, true);
    zone.place(item, item.position.clone(), item.rotation.y);
  }

  /**
   * What `ray` (world) meets first within `far` metres among the furniture that never moves (a built-in, the
   * TV), when that is nearer than any movable piece and not behind a wall (`blocked`): its name for the caption
   * ("the wardrobe"), '' when it has none. Null: nothing fixed there.
   */
  fixedAt(ray: THREE.Ray, far: number, blocked: (point: THREE.Vector3) => boolean): string | null {
    this.raycaster.set(ray.origin, ray.direction);
    this.raycaster.far = far;
    const movable = new Set([...this.pieces].map((p) => p.item as THREE.Object3D));
    let best: { name: string; distance: number } | null = null;
    for (const zone of this.zones) {
      if (!zone.isActive) continue;
      zone.forEachPlaced((item) => {
        if (item instanceof Room || item.occluders?.length || movable.has(item) || !item.visible) return;
        const hit = this.raycaster.intersectObject(item, true).find((h) => h.object.visible);
        if (hit && (!best || hit.distance < best.distance) && !blocked(hit.point)) best = { name: fixedName(item), distance: hit.distance };
      });
    }
    const fixed = best as { name: string; distance: number } | null;
    if (!fixed) return null;
    const piece = this.pieceAt(ray, far);
    return piece && piece.point.distanceTo(ray.origin) <= fixed.distance ? null : fixed.name;
  }

  /** The movable piece `ray` (world) meets first within `far` metres (what stands on a piece picks the piece), and where. */
  pieceAt(ray: THREE.Ray, far: number, accept?: (piece: Piece) => boolean): { piece: Piece; point: THREE.Vector3 } | null {
    this.raycaster.set(ray.origin, ray.direction);
    this.raycaster.far = far;
    let best: { piece: Piece; point: THREE.Vector3; distance: number } | null = null;
    // A box on a bookcase is the box's (a click takes it): it hides the bookcase behind it.
    let box = Infinity;
    for (const piece of this.pieces) {
      if (!piece.zone.isActive || !this.movable(piece) || (accept && !accept(piece))) continue;
      for (const part of [piece.item, ...ridersOf(piece.zone, piece.item)]) {
        const hit = this.raycaster.intersectObject(part, true)[0];
        if (!hit) continue;
        if (onBox(hit.object)) box = Math.min(box, hit.distance);
        else if (!best || hit.distance < best.distance) best = { piece, point: hit.point, distance: hit.distance };
      }
    }
    return best && best.distance < box ? { piece: best.piece, point: best.point } : null;
  }

  /**
   * `piece` was set down where it stands (or put away): remembered, with the room it is in when not its own; the pieces
   * standing on it (moved with it) too.
   */
  save(piece: Piece): void {
    for (const rider of this.riderPieces(piece)) this.savePose(rider);
    this.savePose(piece);
  }

  private savePose(piece: Piece): void {
    const { position, rotation } = piece.item;
    this.layout.set(piece.origin.id, piece.key, {
      x: position.x,
      y: position.y,
      z: position.z,
      yaw: rotation.y,
      ...(piece.zone !== piece.origin ? { in: piece.zone.id } : {}),
      ...(this.stored.has(piece) ? { stored: true } : {}),
    });
  }
}

/** Whether `object` is (part of) a game box. */
function onBox(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o instanceof GameBox) return true;
  return false;
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

/** What the caption calls a fixed piece: its own name spelled out ("hall console"), else ''. */
function fixedName(item: THREE.Object3D): string {
  return plainName(item) ?? '';
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
