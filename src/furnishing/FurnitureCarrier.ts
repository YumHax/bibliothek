import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { playBump, playFloorCreak, playGridTick, playSetDown } from '@/audio/furnitureSounds';
import { reduceMotion } from '@/settings/motion';
import { FLOOR } from '@/world/surface/layers';
import { Fit, localBounds, type Blocker, type Occupant } from './fit';
import { ridersOf, type Furnishings, type Piece } from './Furnishings';
import { alignWith, CELL, FREE_WHEEL_STEP, nextAngle, snapFloor, snapWall, toWalls, TURN_STEP, WHEEL_STEP, type Guide } from './grid';
import { PlacementPreview } from './preview/PlacementPreview';
import { aimedPose, clampInside, snapToWall, turnedBounds, wallNormal, type Pose } from './surfaces';
import type { Zone } from '@/world/zone/Zone';
import type { Furniture } from '@/world/Furniture';

/** How far away a piece can be taken or set down (m). */
const REACH = 4;
/** Thinner than this (m), a piece lies flat (a rug): see `Fit`. */
const FLAT = 0.035;
/** A floor piece is never set nearer the player's feet than its own half size plus this (m): it would land on them. */
const FEET_CLEAR = 0.35;
/** How fast the carried piece follows the aim (1/s), and turns. */
const FOLLOW = 16;
/** Carried, a floor piece floats this high (m), a picture this far off its wall: set down, it settles back. */
const LIFT = 0.05;
const WALL_LIFT = 0.025;
/** How long it takes to settle once set down (s). */
const SETTLE = 0.16;
/** The movable piece under the crosshair is looked for this often with free hands (s). */
const HOVER_EVERY = 0.12;
/** Grid ticks are heard at most this often (s). */
const TICK_EVERY = 0.045;
/** A piece's drawn volume (m³) past which it sounds heavy set down (a bed, a sofa). */
const HEAVY = 0.9;
/** A floor piece no bigger than this (m: its longest side, its height) may be set on a table, a dresser, a stool. */
const SMALL_SIDE = 0.7;
const SMALL_HEIGHT = 1.2;
/** Aimed where it may not stand, the nearest spot it may is looked for this many grid steps round (on the grid only). */
const SUGGEST_STEPS = 3;

interface Carried {
  piece: Piece;
  fit: Fit;
  /** Its bounds and what rides it, in its own frame. */
  bounds: THREE.Box3;
  flat: boolean;
  /** Where it stood when taken, and in which room: `cancel` puts it back. */
  start: Pose;
  startZone: Zone;
  /** Taken out of storage: `cancel` puts it away again. */
  fromStore: boolean;
  /** The turn the player gave it (floor and ceiling pieces). */
  yaw: number;
  /** Where the aim puts it now, whether it may stand there, and if not what is in the way. */
  target: Pose | null;
  fits: boolean;
  blocker: Blocker | null;
  /** Aimed where it may not stand: the nearest spot on the grid where it may (a click sets it down there). */
  suggestion: Pose | null;
  /** What the suggestion was looked for from (it is looked for again only when the aim moves). */
  suggestedFor: string;
  guides: Guide[];
  /** The other furniture's boxes (zone-local), to line up with. */
  neighbours: THREE.Box3[];
  /** 0 on the surface, 1 fully lifted. */
  lift: number;
  /** Small enough to be set on another piece's top. */
  small: boolean;
  /** The top it is aimed at (and would stand on), if not the floor. */
  on: { owner: Furniture; box: THREE.Box3 } | null;
}

/** A piece set down, easing the last few centimetres onto its surface. */
interface Settling {
  piece: Piece;
  pose: Pose;
  offset: THREE.Vector3;
  left: number;
}

/** A pose in a given room of the flat. */
export interface PlacedPose extends Pose {
  readonly zone: Zone;
}

/** A piece put somewhere (`setDown`): where it came from (and in which room) and where it went, for the undo. */
export interface Moved {
  readonly piece: Piece;
  readonly from: PlacedPose;
  readonly to: PlacedPose;
}

export interface CarrierOptions {
  /** A wall stands between two world points (the crosshair cannot reach through it). */
  blocked: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
  /** Whoever stands in the room (the player's own feet are added): nothing is set down on them. */
  occupants?: () => readonly Occupant[];
  /** Where the preview is drawn (the scene). */
  scene: THREE.Object3D;
  /** Whether the hands are free to take a piece (in the room, no box in hand, not seated): the piece under the crosshair is outlined then. */
  handsFree?: () => boolean;
  /**
   * The room of the flat the player is in, where a carried piece may go (null elsewhere: the stairwell, the
   * street): carried through a doorway, the piece follows into it; taken out of storage, it comes out there.
   */
  roomHere?: () => Zone | null;
}

/**
 * Carries a piece of the flat's furniture (a `Piece` of `Furnishings`) about its room: taken (right-click), it stops
 * colliding, lifts a little and follows the crosshair over its surface (the floor, a wall, the ceiling) on a 10 cm
 * grid, lined up with what stands near and pushed flush against a wall it is brought near, turning a quarter (R, Q)
 * or an eighth (the wheel); G lets it go free. Set down where it may stand (not through another piece, not in a
 * doorway, not on anyone), it settles; or it goes back where it was. The `PlacementPreview` shows the grid, the
 * footprint and what is in the way. What stands on it rides along. The Session's `Rearranging` drives it.
 */
export class FurnitureCarrier implements Updatable {
  private carried: Carried | null = null;
  private settling: Settling[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly centre = new THREE.Vector2(0, 0);
  private readonly toZone = new THREE.Matrix4();
  private readonly eye = new THREE.Vector3();
  private readonly shown = { position: new THREE.Vector3(), yaw: 0 };
  private readonly preview: PlacementPreview;
  private hoveredPiece: Piece | null = null;
  private hoverClock = 0;
  private tickClock = 0;
  private lastCell = '';
  private readonly hoverListeners = new Set<() => void>();
  /** Snapping to the grid (G turns it off and on). */
  snapping = true;
  /** Where the aim comes from when not the crosshair (the planning view's mouse), and how far it may reach then. */
  private aimSource: { ray: () => THREE.Ray; reach: number; feet?: () => THREE.Vector3 } | null = null;
  private readonly lostListeners = new Set<() => void>();
  private moved: Moved | null = null;
  /** Who stands in the room this frame (read once a frame: every cell of the footprint asks). */
  private standing: Occupant[] = [];

  constructor(
    private readonly camera: THREE.Camera,
    private readonly furnishings: Furnishings,
    private readonly options: CarrierOptions,
  ) {
    this.preview = new PlacementPreview(options.scene);
    // A bookcase a shelving rebuild takes down while it is carried: let go (nothing to put back).
    furnishings.onGone((piece) => {
      this.settling = this.settling.filter((s) => s.piece !== piece);
      if (this.carried?.piece !== piece) return;
      this.carried = null;
      this.preview.hide();
      for (const listener of this.lostListeners) listener();
    });
    document.addEventListener('wheel', (e) => {
      if (!this.carried || !document.pointerLockElement) return;
      this.turn(Math.sign(e.deltaY), this.snapping ? WHEEL_STEP : FREE_WHEEL_STEP);
    }, { passive: true });
  }

  /** The piece being carried, if any. */
  get piece(): Piece | null {
    return this.carried?.piece ?? null;
  }

  /** Whether the carried piece may be set down where it is aimed. */
  get fits(): boolean {
    return this.carried?.fits ?? false;
  }

  /** What stops the carried piece standing where it is aimed (null when it fits, or when aimed at nothing). */
  get blocker(): Blocker | null {
    return this.carried && !this.carried.fits ? this.carried.blocker : null;
  }

  /** Aimed where it may not stand, there is a spot a step or two off where it may: a click sets it down there. */
  get suggested(): boolean {
    return this.carried !== null && !this.carried.fits && this.carried.suggestion !== null;
  }

  /** Whether the carried piece is aimed at a surface it could go on at all (looking up with a rug, it is not). */
  get aiming(): boolean {
    return this.carried?.target != null;
  }

  /** The movable piece under the crosshair with free hands (`options.handsFree`), looked for a few times a second. */
  get hovered(): Piece | null {
    return this.hoveredPiece;
  }

  /** `listener` hears when the carried piece is gone from the hands without a set-down or a put-back (a rebuild took it). */
  onCarryLost(listener: () => void): () => void {
    this.lostListeners.add(listener);
    return () => this.lostListeners.delete(listener);
  }

  /** `listener` hears when `hovered` changes. */
  onHoverChange(listener: () => void): () => void {
    this.hoverListeners.add(listener);
    return () => this.hoverListeners.delete(listener);
  }

  /** The movable piece under the crosshair within reach, not behind a wall (and that `accept` takes); null when there is none. */
  aimed(accept?: (piece: Piece) => boolean): Piece | null {
    const ray = this.ray();
    const hit = this.furnishings.pieceAt(ray, this.reach, accept);
    if (!hit || (!this.aimSource && this.blocked(ray.origin, hit.point))) return null;
    return hit.piece;
  }

  /** What the crosshair is on within reach when it is furniture that never moves (the wardrobe), by name; null otherwise. */
  fixedAimed(): string | null {
    const ray = this.ray();
    return this.furnishings.fixedAt(ray, this.reach, (point) => !this.aimSource && this.blocked(ray.origin, point));
  }

  /** Takes `piece` (movable, in an active zone) to move it; `fromStore` when it just came out of storage. */
  take(piece: Piece, fromStore = false): void {
    if (this.carried) this.cancel();
    this.finishSettling(piece);
    const { zone, item } = piece;
    const riders = ridersOf(zone, item);
    const bounds = localBounds(item, riders);
    zone.lift(item);
    const carried = new Set([item, ...riders]);
    const fit = new Fit(zone, piece.surface, carried, this.furnishings.neighboursOf(piece), () => this.standing);
    const flat = bounds.max.y - bounds.min.y < FLAT;
    zone.group.updateMatrixWorld();
    this.toZone.copy(zone.group.matrixWorld).invert();
    this.carried = {
      piece,
      fit,
      bounds,
      flat,
      start: { position: item.position.clone(), yaw: item.rotation.y },
      startZone: zone,
      fromStore,
      yaw: item.rotation.y,
      target: null,
      fits: false,
      blocker: null,
      suggestion: null,
      suggestedFor: '',
      guides: [],
      neighbours: fit.alignTargets(flat).map((box) => box.clone().applyMatrix4(this.toZone)),
      lift: 0,
      small: piece.surface === 'floor' && !flat && Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) <= SMALL_SIDE && bounds.max.y - bounds.min.y <= SMALL_HEIGHT,
      on: null,
    };
    this.shown.position.copy(item.position);
    this.shown.yaw = item.rotation.y;
    this.lastCell = '';
    this.setHovered(null);
    this.preview.show(zone, piece.surface, bounds, fromStore ? null : this.carried.start, fit.clearances());
    playFloorCreak(0.03);
  }

  /**
   * Takes `piece` out of storage in the room the player is in, in front of them, and into the hands. False when the
   * player is in no room of the flat.
   */
  takeOut(piece: Piece): boolean {
    const zone = this.options.roomHere?.() ?? null;
    if (!zone || !this.furnishings.isStored(piece)) return false;
    zone.group.updateMatrixWorld();
    this.toZone.copy(zone.group.matrixWorld).invert();
    const eye = this.camera.getWorldPosition(new THREE.Vector3());
    const ahead = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize().multiplyScalar(1.3).add(eye).applyMatrix4(this.toZone);
    const { height } = zone.spec.extent;
    ahead.y = piece.surface === 'floor' ? 0 : piece.surface === 'wall' ? Math.min(1.5, height - 0.4) : height - 0.3;
    clampInside(ahead, zone.spec.extent, new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 0.3, 0.3)), 0);
    // Facing the player, square to the room.
    const facing = this.camera.getWorldDirection(new THREE.Vector3()).transformDirection(this.toZone);
    const yaw = Math.round(Math.atan2(-facing.x, -facing.z) / TURN_STEP) * TURN_STEP;
    this.furnishings.takeOut(piece, zone, { position: ahead, yaw });
    this.take(piece, true);
    return true;
  }

  /** Puts the carried piece away (out of sight, taken out again later anywhere in the flat); false when it may not be. */
  store(): boolean {
    const carried = this.carried;
    if (!carried || !this.furnishings.storable(carried.piece)) return false;
    carried.piece.zone.setDown(carried.piece.item);
    this.furnishings.store(carried.piece);
    this.carried = null;
    this.preview.hide();
    playFloorCreak(0.025);
    return true;
  }

  /** Whether the player is in one of the flat's rooms (where furniture moves: the undo and the store work there only). */
  get atHome(): boolean {
    return (this.options.roomHere?.() ?? null) !== null;
  }

  /** The last `setDown`'s move (null after one out of storage). */
  get lastMove(): Moved | null {
    return this.moved;
  }

  /** Whether the carried piece may be put away (not a bookcase, nothing standing on it). */
  get storable(): boolean {
    return this.carried !== null && this.furnishings.storable(this.carried.piece);
  }

  /**
   * Turns the carried piece one `step` in `direction` (+1, -1), onto the absolute grid of that step while snapping
   * (a piece at an odd angle squares up first); a wall piece keeps facing into the room.
   */
  turn(direction: number, step = TURN_STEP): void {
    const carried = this.carried;
    if (!carried || carried.piece.surface === 'wall' || direction === 0) return;
    carried.yaw = this.snapping ? nextAngle(carried.yaw, direction, step) : carried.yaw + direction * step;
    playGridTick(0.025);
  }

  /**
   * Sets the carried piece down where it is aimed (or on the spot beside it suggests); false (it stays in hand, a
   * bump heard) when it may not stand there. `lastMove` then says where it came from, for the undo.
   */
  setDown(): boolean {
    const carried = this.carried;
    const target = carried?.fits ? carried.target : carried?.suggestion ?? null;
    if (!carried || !target) {
      if (carried) playBump();
      return false;
    }
    const { piece, start, startZone, bounds, fromStore } = carried;
    const to = { position: target.position.clone(), yaw: target.yaw };
    // Drawn where it floats now (lifted), it eases the last few centimetres down (or back onto its wall).
    const offset = this.shown.position.clone().add(this.liftOffset(piece, target, carried.lift)).sub(target.position);
    // The spot beside is on the same top (or the floor) as the aim.
    const on = carried.on;
    piece.zone.move(piece.item, target.position, target.yaw);
    piece.zone.setDown(piece.item);
    // Set on a table, it goes with the table; set on the floor, it stands on nothing.
    piece.zone.unride(piece.item);
    if (on) piece.zone.ride(on.owner, piece.item);
    this.furnishings.save(piece);
    this.carried = null;
    this.preview.hide();
    if (!reduceMotion() && offset.lengthSq() > 1e-6) {
      this.settling.push({ piece, pose: to, offset, left: SETTLE });
      piece.zone.move(piece.item, target.position.clone().add(offset), target.yaw);
    }
    const size = bounds.getSize(new THREE.Vector3());
    playSetDown(Math.min(1, (size.x * size.y * size.z) / HEAVY));
    // Out of storage, there is nowhere to undo it back to.
    this.moved = fromStore ? null : { piece, from: { ...start, zone: startZone }, to: { ...to, zone: piece.zone } };
    return true;
  }

  /** Puts the carried piece back where it was taken from (in the room it was taken in), or away again if it came out of storage. */
  cancel(): void {
    const carried = this.carried;
    if (!carried) return;
    const { piece, start, startZone } = carried;
    this.carried = null;
    this.preview.hide();
    if (carried.fromStore) {
      piece.zone.setDown(piece.item);
      this.furnishings.store(piece);
      return;
    }
    this.furnishings.handTo(piece, startZone);
    piece.zone.move(piece.item, start.position, start.yaw);
    piece.zone.setDown(piece.item);
  }

  /** Whether `piece` is still one of the flat's pieces, standing (the undo forgets one a rebuild took down or put away). */
  available(piece: Piece): boolean {
    return this.furnishings.has(piece) && this.furnishings.movable(piece);
  }

  /**
   * Puts `piece` (not carried) at `pose` (zone-local) if it may stand there, saved: the undo, a piece sent home.
   * Returns what stands in the way when it may not (nothing moves then), else null.
   */
  moveTo(piece: Piece, pose: Pose & { zone?: Zone }): Blocker | null {
    const zone = pose.zone ?? piece.zone;
    if (this.carried?.piece === piece) this.cancel();
    this.finishSettling(piece);
    const item = piece.item;
    const riders = ridersOf(piece.zone, item);
    const bounds = localBounds(item, riders);
    this.standing = this.occupants();
    const fit = new Fit(zone, piece.surface, new Set([item, ...riders]), this.furnishings.neighboursOf(piece, zone), () => this.standing);
    zone.group.updateMatrixWorld();
    const box = turnedBounds(bounds, pose.yaw).translate(pose.position).applyMatrix4(zone.group.matrixWorld);
    const blocker = fit.check(box, bounds.max.y - bounds.min.y < FLAT);
    if (blocker) return blocker;
    this.furnishings.handTo(piece, zone);
    zone.move(item, pose.position, pose.yaw);
    this.furnishings.standOnWhatIsUnder(piece, fit);
    this.furnishings.save(piece);
    playSetDown(0.3, 0.07);
    return null;
  }

  update(dt: number): void {
    this.settle(dt);
    const carried = this.carried;
    if (!carried) {
      this.updateHover(dt);
      return;
    }
    // Out of the flat (the stairwell, the street) with it: it goes back where it was, the hands free again.
    if (!this.aimSource && this.options.roomHere && !this.options.roomHere()) {
      this.cancel();
      for (const listener of this.lostListeners) listener();
      return;
    }
    this.standing = this.occupants();
    this.followInto(carried);
    const { piece, bounds } = carried;
    const { zone, item } = piece;
    const ray = this.ray();
    this.toZone.copy(zone.group.matrixWorld).invert();
    const local = ray.clone().applyMatrix4(this.toZone);
    const aimed = aimedPose(local, zone.spec.extent, piece.surface, piece.offset, bounds, carried.yaw);
    if (aimed) {
      carried.guides = this.place(aimed, carried);
      carried.target = aimed;
      const near = this.aimSource !== null || this.eye.distanceTo(aimed.position.clone().applyMatrix4(zone.group.matrixWorld)) <= REACH + 1;
      const blocker = carried.fit.check(this.worldBox(aimed, bounds), carried.flat, carried.on?.box ?? null);
      carried.blocker = blocker;
      const inRoom = this.aimSource !== null || zone.contains(this.eye, 0.2);
      carried.fits = near && inRoom && blocker === null;
      carried.suggestion = carried.fits || !inRoom ? null : this.suggest(aimed, carried);
      this.tickOnCell(aimed);
    } else {
      carried.fits = false;
      carried.blocker = null;
      carried.suggestion = null;
    }
    const target = carried.target;
    if (!target) return;
    const t = reduceMotion() ? 1 : 1 - Math.exp(-FOLLOW * dt);
    this.shown.position.lerp(target.position, t);
    this.shown.yaw += shortest(target.yaw - this.shown.yaw) * t;
    carried.lift = reduceMotion() ? 1 : Math.min(1, carried.lift + dt / SETTLE);
    const drawn = this.shown.position.clone().add(this.liftOffset(piece, target, carried.lift));
    zone.move(item, drawn, this.shown.yaw);
    this.preview.update(zone, {
      target,
      shown: { position: drawn, yaw: this.shown.yaw },
      fits: carried.fits,
      blocker: carried.blocker?.box ?? null,
      suggestion: carried.suggestion,
      guides: carried.guides,
      taken: (cell) => carried.fit.check(cell, carried.flat, carried.on?.box ?? null) !== null,
      surfaceY: carried.on ? target.position.y + bounds.min.y : null,
      grid: this.snapping,
    });
  }

  /**
   * The aimed pose (zone-local, changed in place) made a place to stand: within reach of the feet, on the grid,
   * lined up with what stands near, flush against a wall it comes near, inside the room. Returns the guides.
   */
  private place(aimed: Pose, carried: Carried): Guide[] {
    const { piece, bounds, flat, neighbours } = carried;
    const extent = piece.zone.spec.extent;
    let guides: Guide[] = [];
    const centre = new THREE.Vector3();
    carried.on = null;
    if (piece.surface === 'floor' && carried.small && this.onTop(aimed, carried)) {
      const box = turnedBounds(bounds, aimed.yaw);
      if (this.snapping) snapFloor(aimed.position, box, extent);
      clampInside(aimed.position, extent, bounds, aimed.yaw);
    } else if (piece.surface === 'floor') {
      if (!this.aimSource) this.keepNear(aimed, bounds);
      const box = turnedBounds(bounds, aimed.yaw);
      if (this.snapping) {
        snapFloor(aimed.position, box, extent);
        guides = alignWith(aimed.position, box, neighbours, FLOOR.placement.lift + 0.003, centre);
        toWalls(aimed.position, box, extent);
      } else if (!flat) snapToWall(aimed, extent, bounds);
      clampInside(aimed.position, extent, bounds, aimed.yaw); // pushed off the feet, it never goes through a wall
    } else if (piece.surface === 'ceiling') {
      const box = turnedBounds(bounds, aimed.yaw);
      if (this.snapping) {
        snapFloor(aimed.position, box, extent);
        guides = alignWith(aimed.position, box, neighbours, extent.height - 0.02, centre);
      }
      clampInside(aimed.position, extent, bounds, aimed.yaw);
    } else if (this.snapping) {
      // On a wall: the grid along it and up it, centred on the wall or over what stands below.
      const normal = wallNormal(aimed.yaw);
      const box = turnedBounds(bounds, aimed.yaw);
      const across = normal.x !== 0 ? 'x' : 'z';
      const keep = aimed.position[across];
      snapWall(aimed.position, box, normal, extent);
      guides = alignWith(aimed.position, box, neighbours, aimed.position.y, centre, [across === 'x' ? 'z' : 'x']);
      aimed.position[across] = keep;
      // The guide runs up the wall, from the top of what it lined up with to the picture's bottom edge.
      for (const guide of guides) {
        const along = guide.axis;
        const wallAt = keep + normal[across] * 0.004;
        guide.from.set(0, guide.target ? guide.target.max.y : 0, 0);
        guide.to.set(0, aimed.position.y + box.min.y, 0);
        guide.from[along] = guide.line;
        guide.to[along] = guide.line;
        guide.from[across] = wallAt;
        guide.to[across] = wallAt;
      }
    }
    return guides;
  }

  /**
   * Aimed at `aimed` where it may not stand: the nearest pose a few grid steps round (along the surface) where it
   * may, or null. Looked for again only when the aim moves to another step.
   */
  private suggest(aimed: Pose, carried: Carried): Pose | null {
    if (!this.snapping) return null;
    const key = `${aimed.position.x.toFixed(3)},${aimed.position.y.toFixed(3)},${aimed.position.z.toFixed(3)},${aimed.yaw.toFixed(3)}`;
    if (key === carried.suggestedFor) return carried.suggestion;
    carried.suggestedFor = key;
    const { piece, bounds, fit, flat } = carried;
    const extent = piece.zone.spec.extent;
    // The two axes the piece slides along on its surface.
    const [u, v] = piece.surface === 'wall' ? (wallNormal(aimed.yaw).x !== 0 ? (['z', 'y'] as const) : (['x', 'y'] as const)) : (['x', 'z'] as const);
    const feet = this.eye.clone().applyMatrix4(this.toZone).setY(0);
    let best: { pose: Pose; distance: number } | null = null;
    for (let ring = 1; ring <= SUGGEST_STEPS && !best; ring++) {
      for (let a = -ring; a <= ring; a++) {
        for (let b = -ring; b <= ring; b++) {
          if (Math.max(Math.abs(a), Math.abs(b)) !== ring) continue;
          const pose = { position: aimed.position.clone(), yaw: aimed.yaw };
          pose.position[u] += a * CELL;
          pose.position[v] += b * CELL;
          if (piece.surface !== 'wall') clampInside(pose.position, extent, bounds, pose.yaw);
          // Not onto the player's feet, nor out of reach.
          if (piece.surface === 'floor' && !this.aimSource && pose.position.clone().setY(0).distanceTo(feet) > REACH) continue;
          if (fit.check(this.worldBox(pose, bounds), flat, carried.on?.box ?? null)) continue;
          const distance = pose.position.distanceTo(aimed.position);
          if (!best || distance < best.distance) best = { pose, distance };
        }
      }
    }
    return best?.pose ?? null;
  }

  /**
   * Carried through a doorway into another room of the flat, the piece goes with the player: handed to that room,
   * its surroundings (what it must not stand on, what it lines up with, the grid) taken again there.
   */
  private followInto(carried: Carried): void {
    if (this.aimSource) return;
    const here = this.options.roomHere?.() ?? null;
    const { piece } = carried;
    const from = piece.zone;
    if (!here || here === from || piece.keepsRoom) return;
    // What the carrier keeps in the old room's frame, brought into the new one's.
    from.group.updateMatrixWorld();
    here.group.updateMatrixWorld();
    const toHere = new THREE.Matrix4().copy(here.group.matrixWorld).invert().multiply(from.group.matrixWorld);
    const turn = here.group.rotation.y - from.group.rotation.y;
    this.shown.position.applyMatrix4(toHere);
    this.shown.yaw -= turn;
    carried.yaw -= turn;
    this.furnishings.handTo(piece, here);
    const riders = ridersOf(here, piece.item);
    // (`neighboursOf` reads the piece's room, which is `here` now.)
    carried.fit = new Fit(here, piece.surface, new Set([piece.item, ...riders]), this.furnishings.neighboursOf(piece), () => this.standing);
    this.toZone.copy(here.group.matrixWorld).invert();
    carried.neighbours = carried.fit.alignTargets(carried.flat).map((box) => box.clone().applyMatrix4(this.toZone));
    carried.target = null;
    carried.suggestion = null;
    carried.suggestedFor = '';
    this.preview.show(here, piece.surface, carried.bounds, null, carried.fit.clearances());
  }

  /**
   * A small piece aimed across the top of a table, a dresser, a stool: put on it (`aimed` changed in place, zone-local,
   * `carried.on` set). False when the aim crosses no top within reach.
   */
  private onTop(aimed: Pose, carried: Carried): boolean {
    const ray = this.raycaster.ray;
    const top = carried.fit.topAt(ray, this.reach);
    if (!top) return false;
    const at = top.point.clone().applyMatrix4(this.toZone);
    aimed.position.set(at.x, at.y - carried.bounds.min.y, at.z);
    carried.on = { owner: top.owner, box: top.box };
    return true;
  }

  /** How far the carried piece floats off its surface while `lift` (0..1): up off the floor, out from its wall. */
  private liftOffset(piece: Piece, target: Pose, lift: number): THREE.Vector3 {
    const eased = lift * lift * (3 - 2 * lift);
    if (piece.surface === 'floor') return new THREE.Vector3(0, LIFT * eased, 0);
    if (piece.surface === 'wall') return wallNormal(target.yaw).clone().multiplyScalar(WALL_LIFT * eased);
    return new THREE.Vector3();
  }

  /** A faint tick each time the piece moves onto another grid step or turn. */
  private tickOnCell(pose: Pose): void {
    if (!this.snapping) return;
    const cell = `${pose.position.x.toFixed(2)},${pose.position.y.toFixed(2)},${pose.position.z.toFixed(2)},${pose.yaw.toFixed(2)}`;
    if (cell === this.lastCell) return;
    const first = this.lastCell === '';
    this.lastCell = cell;
    const now = performance.now() / 1000;
    if (first || now - this.tickClock < TICK_EVERY) return;
    this.tickClock = now;
    playGridTick();
  }

  /** The pieces just set down ease onto their surface. */
  private settle(dt: number): void {
    if (!this.settling.length) return;
    for (const s of this.settling) {
      s.left -= dt;
      const k = Math.max(0, s.left / SETTLE);
      s.piece.zone.move(s.piece.item, s.pose.position.clone().addScaledVector(s.offset, k * k), s.pose.yaw);
    }
    this.settling = this.settling.filter((s) => s.left > 0);
  }

  /** A piece still settling is put where it goes at once (it is taken again, or moved). */
  private finishSettling(piece: Piece): void {
    const s = this.settling.find((one) => one.piece === piece);
    if (!s) return;
    piece.zone.move(piece.item, s.pose.position, s.pose.yaw);
    this.settling = this.settling.filter((one) => one !== s);
  }

  /** With free hands, the movable piece under the crosshair, outlined. */
  private updateHover(dt: number): void {
    this.hoverClock -= dt;
    if (this.hoverClock > 0) return;
    this.hoverClock = HOVER_EVERY;
    const piece = this.options.handsFree?.() ?? document.pointerLockElement !== null ? this.aimed() : null;
    this.setHovered(piece);
  }

  private setHovered(piece: Piece | null): void {
    if (piece) {
      const { zone, item } = piece;
      this.preview.hover(zone, localBounds(item, ridersOf(zone, item)), { position: item.position, yaw: item.rotation.y });
    } else this.preview.hover(null, null, null);
    if (piece === this.hoveredPiece) return;
    this.hoveredPiece = piece;
    for (const listener of this.hoverListeners) listener();
  }

  /** Who stands in the room: the player (their feet under the eye, or where the planning view says they stand) and whoever else `options.occupants` says. */
  private occupants(): Occupant[] {
    const feet = this.aimSource?.feet?.().clone() ?? this.camera.getWorldPosition(new THREE.Vector3());
    feet.y = 0;
    return [{ at: feet, radius: 0.22, height: 1.7, name: 'you' }, ...(this.options.occupants?.() ?? [])];
  }

  private blocked(from: THREE.Vector3, to: THREE.Vector3): boolean {
    return this.options.blocked(from, to);
  }

  /**
   * Aims with `ray` (world) instead of the crosshair, reaching `reach` metres (the planning view's mouse over the
   * room seen from above); null: the crosshair again. The player's feet still count, from where they stand.
   */
  setAim(source: { ray: () => THREE.Ray; reach: number; feet?: () => THREE.Vector3 } | null): void {
    this.aimSource = source;
  }

  /** How far a piece may be taken or set down from the aim's origin (m). */
  private get reach(): number {
    return this.aimSource?.reach ?? REACH;
  }

  /** The aim's ray (world): the crosshair's, or `setAim`'s; `eye` is left at its origin. */
  private ray(): THREE.Ray {
    if (this.aimSource) {
      this.raycaster.ray.copy(this.aimSource.ray());
    } else this.raycaster.setFromCamera(this.centre, this.camera);
    this.eye.copy(this.raycaster.ray.origin);
    return this.raycaster.ray;
  }

  /** A floor piece stays within reach: aimed at the player's own feet it is pushed out ahead, aimed far off it is pulled in. */
  private keepNear(pose: Pose, bounds: THREE.Box3): void {
    const feet = this.eye.clone().applyMatrix4(this.toZone).setY(0);
    const near = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) / 2 + FEET_CLEAR;
    const far = Math.max(near, REACH);
    const away = pose.position.clone().setY(0).sub(feet);
    const distance = away.length();
    if (distance >= near && distance <= far) return;
    const ahead = distance > 1e-3 ? away.divideScalar(distance) : this.camera.getWorldDirection(new THREE.Vector3()).transformDirection(this.toZone).setY(0).normalize();
    const to = THREE.MathUtils.clamp(distance, near, far);
    pose.position.x = feet.x + ahead.x * to;
    pose.position.z = feet.z + ahead.z * to;
  }

  /** The world box of a piece of local `bounds` standing at `pose` (zone-local). */
  private worldBox(pose: Pose, bounds: THREE.Box3): THREE.Box3 {
    return turnedBounds(bounds, pose.yaw).translate(pose.position).applyMatrix4(this.toZone.clone().invert());
  }
}

/** `angle` brought into (-pi, pi]. */
function shortest(angle: number): number {
  return THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
}

