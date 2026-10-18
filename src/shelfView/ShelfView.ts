import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Listeners } from '@/core/Listeners';
import type { Interactable } from '@/interaction/Interactable';
import type { Interactor } from '@/interaction/Interactor';
import type { FirstPersonController } from '@/player/FirstPersonController';
import { GameBox } from '@/world/GameBox';
import { Shelf } from '@/world/Shelf';
import type { ShelfTarget, ShelvesSnapshot, ShelvingGroup } from '@/world/shelving/ShelvingGroup';
import { getPlatform } from '@/catalog/platforms';
import { searchKey } from '@/text/strings';
import { dampFactor } from '@/math/damp';
import { playSleeveSlide } from '@/audio/furnitureSounds';
import { facingOf, framePose, frontCentre } from './framing';
import { inScene } from './inScene';
import { ShelfFilter } from './ShelfFilter';

/** Wheel travel (px of delta) for one flip along the row, or one step in to a row. */
const WHEEL_STEP = 100;
/** A press on a box that moves the cursor this far (px) lifts the box to move it; less, it is a click (taken in hand). */
const DRAG_START = 6;
/** "The bookcase over there" (B with nothing clicked): its front within this far (m) and this far off the view's middle. */
const REACH = 4;
const AIM_CONE = THREE.MathUtils.degToRad(40);
/** A neighbour bookcase (A / D) stands within this far of the one faced (m), at least this far to the side. */
const NEIGHBOUR_REACH = 5;
const NEIGHBOUR_SIDE = 0.2;
/** A box lifted off its row is held this far in front of the boards (m), and found its spot within this far. */
const DRAG_LIFT = 0.07;
const DRAG_REACH = 6;
/** The crosshair's reach while facing a bookcase (m): a tall bookcase framed on a narrow screen stands further than arm's length. */
const VIEW_REACH = 6;
/** How fast the lifted box follows the cursor (rate per second, critically damped). */
const DRAG_FOLLOW = 18;

/** How a box lifted off its row was let go: put in the gap (or swapped) and the shelves as they stood before, no room, or nowhere. */
type DropOutcome = { kind: 'placed'; title: string; before: ShelvesSnapshot | null } | { kind: 'full' } | { kind: 'none' };

/** What a release of the mouse did in the view: the box under the cursor taken in hand, a lifted box let go, or nothing. */
type ReleaseOutcome = { kind: 'took' } | ({ kind: 'drop' } & { outcome: DropOutcome }) | { kind: 'nothing' };

interface ShelfViewOptions {
  camera: THREE.PerspectiveCamera;
  /** The 3D view: the cursor moves over it. */
  canvas: HTMLElement;
  /** Where the filter's strip goes (the HUD's container). */
  container: HTMLElement;
  scene: THREE.Scene;
  player: FirstPersonController;
  interactor: Interactor;
  /** The flat's shelves: their bookcases, a box moved along them. */
  shelves: ShelvingGroup;
  /** The hands: a box in them parks the view; one taken from here is looked at up close at once (`Inspector.examine`). */
  hand: { readonly current: object | null; readonly holding: boolean; readonly examining: boolean; examine(on: boolean): void };
  /** A wall stands between two world points. */
  blocked: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
  /** Whether a body would stand inside furniture at a point (world x, z): the eye steps in past a sofa in front of the bookcase. */
  inFurniture?: (at: THREE.Vector3) => boolean;
}

/** A box lifted off its row with the cursor: where it came from, the spot it would go in, the boxes standing aside for it. */
interface Drag {
  box: GameBox;
  home: Shelf;
  target: (ShelfTarget & { point: THREE.Vector3 }) | null;
  parted: Set<GameBox>;
}

const ndc = new THREE.Vector3();
const eye = new THREE.Vector3();
const forward = new THREE.Vector3();
const at = new THREE.Vector3();
const out = new THREE.Vector3();
const toward = new THREE.Vector3();
const side = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const holdAt = new THREE.Vector3();
const holdTurn = new THREE.Quaternion();
const plane = new THREE.Plane();

/**
 * Facing a bookcase (docs/furnishing.md "The bookcase view"): the eye glides square in front of it, far enough back
 * for the whole of it to fit the view (`framing`), or in front of one row to read the spines; the view stops turning
 * and the crosshair goes where the mouse takes it (the `Interactor` aims from it). The box under it leans out of its
 * row; a click takes it in hand (the view waits, parked, until it is put back), a press and a drag lifts it and moves
 * it along the shelves (into a gap, or swapped with the box it is dropped on), the wheel flips along a row's boxes one
 * by one, and the filter's words lean out every box that matches. The eye is a seat's (`FirstPersonController.sit`):
 * leaving stands the player back where they stood, looking the way they looked. The route is `game/ShelfViewing`.
 */
export class ShelfView implements Updatable {
  private shelf: Shelf | null = null;
  private row: number | null = null;
  /** Where the view looked before facing the first bookcase: it looks there again on leaving. */
  private look = { yaw: 0, pitch: 0 };
  /** The cursor on the 3D view (px from its top left). */
  private readonly cursor = new THREE.Vector2();
  /** A box is in hand (taken from here): the camera waits, the crosshair back in the middle. */
  private parked = false;
  private hovered: Interactable | null = null;
  private press: { box: GameBox; moved: number } | null = null;
  private drag: Drag | null = null;
  private wheel = 0;
  private matches = new Set<GameBox>();
  private query = '';
  /** The boxes leaning out now (the one under the cursor, the matches), and the next frame's. */
  private tipped = new Set<GameBox>();
  private wanted = new Set<GameBox>();
  private readonly filter: ShelfFilter;
  private readonly raycaster = new THREE.Raycaster();
  private readonly changes = new Listeners<[]>();

  constructor(private readonly options: ShelfViewOptions) {
    this.filter = new ShelfFilter(options.container, {
      onQuery: (query) => this.find(query),
      onClose: () => this.changes.emit(),
    });
    options.interactor.onHoverChange((item) => (this.hovered = item));
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('wheel', this.onWheel, { passive: true });
    // The lock lost (Esc, a panel) mid-drag: the box goes back on its row, and a press does not take a box on the
    // release that comes after (the click resuming the room). The crosshair waits for the lock to pick again (a panel
    // opening has just muted it: it must stay mute behind the panel).
    options.player.controls.addEventListener('unlock', () => {
      this.press = null;
      this.cancelDrag(false);
    });
    options.player.controls.addEventListener('lock', () => {
      if (!this.interactorOwed) return;
      this.interactorOwed = false;
      options.interactor.enabled = true;
    });
  }

  /** A drag ended while the lock was lost: the crosshair is given back on the lock's return, not under a panel. */
  private interactorOwed = false;
  /** The box the wheel last flipped to: the next flip goes on from it (the hover takes a few frames to follow). */
  private flipped: GameBox | null = null;

  /** Calls `listener` when the view starts or ends, frames something else, parks or comes back, or the filter changes. */
  onChange(listener: () => void): () => void {
    return this.changes.add(listener);
  }

  /** Facing a bookcase (parked or not). */
  get active(): boolean {
    return this.shelf !== null;
  }

  /** A box taken in hand from here: the view waits for it to be put back. */
  get isParked(): boolean {
    return this.parked;
  }

  /** One row framed (else the whole bookcase). */
  get framingRow(): boolean {
    return this.row !== null;
  }

  /** The filter's strip has the keyboard. */
  get typing(): boolean {
    return this.filter.isOpen;
  }

  /** What the filter looks for now (empty: nothing), and how many boxes match on the bookcase faced and in the room. */
  get found(): { query: string; here: number; room: number } {
    let here = 0;
    for (const box of this.matches) if (box.parent === this.shelf) here++;
    return { query: this.query, here, room: this.matches.size };
  }

  /** The bookcase the view is on, or the nearest one in front within reach, in a room drawn now; null for none. */
  aimed(): Shelf | null {
    const { camera, blocked } = this.options;
    camera.getWorldPosition(eye);
    camera.getWorldDirection(forward);
    let best: Shelf | null = null;
    let bestScore = Infinity;
    for (const shelf of this.standing()) {
      frontCentre(shelf, at);
      toward.subVectors(at, eye);
      const distance = toward.length();
      if (distance > REACH || toward.dot(facingOf(shelf, out)) > 0) continue; // too far, or seen from behind
      const angle = forward.angleTo(toward);
      if (angle > AIM_CONE || blocked(eye, at.addScaledVector(out, 0.05))) continue;
      const score = angle + distance * 0.05;
      if (score < bestScore) {
        best = shelf;
        bestScore = score;
      }
    }
    return best;
  }

  /** Faces `bookcase` (one of the flat's: a `Shelf`), from standing or from another bookcase; false when it cannot. */
  face(bookcase: object): boolean {
    const { player, hand } = this.options;
    if (!(bookcase instanceof Shelf) || !player.isLocked || hand.current) return false;
    if (!this.shelf) {
      if (player.isSeated) return false;
      this.look = player.getLook();
      const rect = this.options.canvas.getBoundingClientRect();
      this.cursor.set(rect.width / 2, rect.height / 2);
    }
    this.cancelDrag();
    this.shelf = bookcase;
    if (this.row !== null) this.row = Math.min(this.row, bookcase.rowCount - 1);
    this.goTo();
    this.showCursor(true);
    this.changes.emit();
    return true;
  }

  /** Steps back from the bookcase: the player stands where they stood, looking where they looked. */
  leave(instant = false): void {
    if (!this.shelf) return;
    const look = this.look;
    this.end();
    if (this.options.player.isSeated) this.options.player.stand(instant, look);
  }

  /** The whole bookcase framed: in to the row under the cursor (the middle one when it is on none). False when a row is framed already. */
  stepIn(): boolean {
    const shelf = this.shelf;
    if (!shelf || this.row !== null || this.parked) return false;
    this.row = this.rowUnderCursor(shelf) ?? Math.floor(shelf.rowCount / 2);
    this.goTo();
    this.changes.emit();
    return true;
  }

  /** A row framed: back out to the whole bookcase. False when the whole of it is framed already. */
  stepOut(): boolean {
    if (!this.shelf || this.row === null || this.parked) return false;
    this.row = null;
    this.goTo();
    this.changes.emit();
    return true;
  }

  /** The row above (-1) or below (+1); from the whole bookcase, its top or bottom row. False past the last. */
  moveRow(step: -1 | 1): boolean {
    const shelf = this.shelf;
    if (!shelf || this.parked) return false;
    const next = this.row === null ? (step < 0 ? 0 : shelf.rowCount - 1) : this.row + step;
    if (next < 0 || next >= shelf.rowCount) return false;
    this.row = next;
    this.goTo();
    this.changes.emit();
    return true;
  }

  /** The next bookcase to the left (-1) or the right (+1) of the one faced, the same row framed; false when there is none. */
  nextBookcase(step: -1 | 1): boolean {
    const shelf = this.shelf;
    if (!shelf || this.parked) return false;
    const { blocked } = this.options;
    frontCentre(shelf, at);
    // The view looks into the bookcase (against its facing): its right is that way across the up.
    side.copy(facingOf(shelf, out)).negate().cross(UP).normalize();
    let best: Shelf | null = null;
    let bestDistance = Infinity;
    for (const other of this.standing()) {
      if (other === shelf) continue;
      frontCentre(other, toward).sub(at);
      const distance = toward.length();
      if (distance > NEIGHBOUR_REACH || toward.dot(side) * step < NEIGHBOUR_SIDE || distance >= bestDistance) continue;
      if (blocked(at.clone().addScaledVector(out, 0.3), frontCentre(other).addScaledVector(facingOf(other), 0.3))) continue;
      best = other;
      bestDistance = distance;
    }
    return best !== null && this.face(best);
  }

  /** Opens the filter's strip (the words lean out the boxes that match); false when the view is not free for it. */
  openFilter(): boolean {
    // Not with a box lifted off its row: the typing would mute the crosshair under it.
    if (!this.cursorLive || this.drag) return false;
    this.filter.open();
    this.changes.emit();
    return true;
  }

  /** The left button pressed: on a shelf box, armed (a drag lifts it, a release takes it); true when the press is the view's. */
  pressAt(): boolean {
    if (!this.cursorLive || this.drag) return false;
    const box = this.hovered;
    if (!(box instanceof GameBox) || !(box.parent instanceof Shelf) || !box.castsShadow) return false;
    // The flat's own shelf boxes only (a stray, a display's box, a ghost in a gap are clicked as ever).
    if (this.options.shelves.findBox(box.game.id) !== box) return false;
    this.press = { box, moved: 0 };
    return true;
  }

  /** The left button let go: a press that hardly moved takes the box in hand; a lifted box is let go where it is aimed. */
  release(): ReleaseOutcome {
    const press = this.press;
    this.press = null;
    if (this.drag) return { kind: 'drop', outcome: this.drop() };
    if (press && this.hovered === press.box) {
      // Taken from the bookcase faced: straight up close, the mouse turning it (even queued behind a box going home).
      if (this.options.interactor.select()) this.options.hand.examine(true);
      return { kind: 'took' };
    }
    return { kind: 'nothing' };
  }

  update(dt: number): void {
    const shelf = this.shelf;
    if (!shelf) return;
    const { player, hand } = this.options;
    // Stood up some other way (a trip, the random pick's walk): the view is over, wherever the player stands now.
    if (!player.isSeated) return this.end();
    // Taken down by a rebuild (a bookcase bought), or its room left: step back.
    if (!inScene(shelf, this.options.scene) || !this.standing().includes(shelf)) return this.leave();
    const parked = hand.current !== null;
    if (parked !== this.parked) {
      this.parked = parked;
      this.cancelDrag();
      // Back from the box in hand: square in front again (the view may have turned while it was held).
      if (!parked) this.goTo();
      this.showCursor(!parked);
      this.changes.emit();
    }
    // The view does not turn while facing (the mouse moves the crosshair); a box in hand turns as it pleases, but one on
    // its way home holds the look still until it lands and the view squares up again (no wobble in between).
    if (!parked || !hand.holding) player.controls.enabled = false;
    if (this.drag) this.followDrag(this.drag, dt);
    this.retip();
  }

  /** The cursor moves and clicks: facing, nothing in hand, not typing, in the room. */
  private get cursorLive(): boolean {
    return this.shelf !== null && !this.parked && !this.filter.isOpen && this.options.player.isLocked;
  }

  /** The flat's bookcases in a room drawn now. */
  private standing(): Shelf[] {
    return this.options.shelves.bookcaseList().map((b) => b.shelf).filter((shelf) => inScene(shelf, this.options.scene));
  }

  /** The eye to where the bookcase (or its row) is framed: a seat's eased move. */
  private goTo(): void {
    const shelf = this.shelf;
    if (!shelf) return;
    const pose = framePose(shelf, this.row, this.options.camera, this.options.blocked, this.options.inFurniture);
    this.options.player.sit(pose.position, pose.yaw, false, pose.pitch);
  }

  private end(): void {
    const { player, interactor } = this.options;
    this.cancelDrag();
    this.filter.close(false);
    this.find('');
    this.press = null;
    this.flipped = null;
    this.shelf = null;
    this.row = null;
    this.parked = false;
    this.retip();
    this.showCursor(false);
    interactor.aim.set(0, 0);
    // The look back, unless the box taken from here is still being looked at (it holds the view itself, `Inspector`).
    player.controls.enabled = !this.options.hand.examining;
    this.changes.emit();
  }

  /** The crosshair freed to the cursor (and the ray with it), or back in the middle. */
  private showCursor(on: boolean): void {
    document.body.classList.toggle('shelf-viewing', on);
    const { interactor } = this.options;
    if (on) {
      this.walkReach ??= interactor.maxDistance;
      interactor.maxDistance = Math.max(this.walkReach, VIEW_REACH);
      this.applyCursor();
    } else {
      if (this.walkReach !== null) interactor.maxDistance = this.walkReach;
      this.walkReach = null;
      interactor.aim.set(0, 0);
    }
  }

  /** The crosshair's reach on the walk, kept while the view lengthens it (null: not lengthened). */
  private walkReach: number | null = null;

  private applyCursor(): void {
    const rect = this.options.canvas.getBoundingClientRect();
    this.cursor.x = THREE.MathUtils.clamp(this.cursor.x, 0, rect.width);
    this.cursor.y = THREE.MathUtils.clamp(this.cursor.y, 0, rect.height);
    this.options.interactor.aim.set((this.cursor.x / Math.max(1, rect.width)) * 2 - 1, 1 - (this.cursor.y / Math.max(1, rect.height)) * 2);
    const style = document.body.style;
    style.setProperty('--shelf-cursor-x', `${rect.left + this.cursor.x}px`);
    style.setProperty('--shelf-cursor-y', `${rect.top + this.cursor.y}px`);
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.cursorLive) return;
    this.cursor.x += e.movementX;
    this.cursor.y += e.movementY;
    if (e.movementX || e.movementY) this.flipped = null;
    if (this.press) {
      this.press.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (this.press.moved >= DRAG_START) this.startDrag(this.press.box);
    }
    this.applyCursor();
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.cursorLive || this.drag) return;
    this.wheel += e.deltaY;
    if (Math.abs(this.wheel) < WHEEL_STEP) return;
    const step = this.wheel > 0 ? 1 : -1;
    this.wheel = 0;
    // The whole bookcase: the wheel turned up steps in to the row under the cursor; a row framed, it flips along it.
    if (this.row === null) {
      if (step < 0) this.stepIn();
    } else this.flip(step);
  };

  /** The next box along the framed row (left -1, right +1) comes under the cursor, as a finger walks along spines. */
  private flip(step: -1 | 1): void {
    const shelf = this.shelf;
    if (!shelf || this.row === null) return;
    const boxes = rowBoxes(shelf, this.row);
    if (!boxes.length) return;
    const from = this.flipped ?? (this.hovered instanceof GameBox ? this.hovered : null);
    let index = from ? boxes.indexOf(from) : -1;
    if (index < 0) {
      // From the box nearest the cursor, across.
      const rect = this.options.canvas.getBoundingClientRect();
      const aimX = (this.cursor.x / Math.max(1, rect.width)) * 2 - 1;
      let nearest = Infinity;
      boxes.forEach((box, i) => {
        const x = this.project(shelf, box).x;
        if (Math.abs(x - aimX) < nearest) {
          nearest = Math.abs(x - aimX);
          index = i - step; // the step below lands on it
        }
      });
    }
    const next = boxes[THREE.MathUtils.clamp(index + step, 0, boxes.length - 1)]!;
    const rect = this.options.canvas.getBoundingClientRect();
    const spot = this.project(shelf, next);
    this.cursor.set(((spot.x + 1) / 2) * rect.width, ((1 - spot.y) / 2) * rect.height);
    this.applyCursor();
    if (next !== from) playSleeveSlide(0.02);
    this.flipped = next;
  }

  /** Where `box` stands at rest on `shelf`, on the view (normalised device coordinates). */
  private project(shelf: Shelf, box: GameBox): THREE.Vector3 {
    shelf.updateWorldMatrix(true, false);
    return shelf.localToWorld(ndc.copy(box.restPosition)).project(this.options.camera);
  }

  /** The row (0 = top) of `shelf` under the cursor, or null. */
  private rowUnderCursor(shelf: Shelf): number | null {
    this.raycaster.setFromCamera(this.options.interactor.aim, this.options.camera);
    shelf.updateWorldMatrix(true, false);
    const front = frontCentre(shelf, at);
    plane.setFromNormalAndCoplanarPoint(facingOf(shelf, out), front);
    if (!this.raycaster.ray.intersectPlane(plane, holdAt)) return null;
    const row = shelf.rowAt(shelf.worldToLocal(holdAt));
    return row >= 0 ? row : null;
  }

  /** The filter's words: every box on the flat's shelves drawn now whose title, platform or year has them. */
  private find(query: string): void {
    this.query = query.trim();
    const key = searchKey(this.query);
    const matches = new Set<GameBox>();
    if (key) {
      for (const box of this.options.shelves.boxes) {
        if (!(box.parent instanceof Shelf) || !box.castsShadow || !inScene(box.parent, this.options.scene)) continue;
        const { game } = box;
        const platform = getPlatform(game.platform);
        if (searchKey(game.title).includes(key) || searchKey(platform.name).includes(key) || searchKey(platform.shortName) === key || game.releaseDate?.startsWith(key)) matches.add(box);
      }
    }
    this.matches = matches;
    this.changes.emit();
  }

  /** Leans out the box under the cursor, the box a lifted one would swap with, and the filter's matches; the rest back in. */
  private retip(): void {
    const wanted = this.wanted;
    wanted.clear();
    if (this.shelf) {
      for (const box of this.matches) wanted.add(box);
      const hovered = this.hovered;
      if (!this.parked && !this.drag && hovered instanceof GameBox && hovered.parent instanceof Shelf && hovered.castsShadow) wanted.add(hovered);
      const swap = this.drag?.target?.spot.fits ? this.drag.target.spot.swap : undefined;
      if (swap) wanted.add(swap);
    }
    for (const box of this.tipped) if (!wanted.has(box) && box.parent instanceof Shelf) box.setTipped(false);
    for (const box of wanted) if (!this.tipped.has(box) && box.parent instanceof Shelf) box.setTipped(true);
    this.wanted = this.tipped;
    this.tipped = wanted;
  }

  // --- A box lifted off its row ------------------------------------------------------------------

  private startDrag(box: GameBox): void {
    this.press = null;
    const home = box.parent;
    if (!(home instanceof Shelf)) return;
    const { interactor, scene } = this.options;
    // Nothing hovered while it is off its shelf (a hover would put it back at its rest pose, in the room's frame).
    interactor.enabled = false;
    interactor.update(0);
    this.hovered = null;
    this.retip();
    scene.attach(box);
    box.onDisposed = () => {
      // Rebuilt away under the cursor (a sort): gone, nothing to put back.
      if (this.drag?.box !== box) return;
      this.part(this.drag, null);
      this.drag = null;
      interactor.enabled = true;
    };
    this.drag = { box, home, target: null, parted: new Set() };
    playSleeveSlide(0.035);
  }

  /** The lifted box follows the cursor a hand's breadth in front of the boards; over a gap it stands in front of it, the row parting. */
  private followDrag(drag: Drag, dt: number): void {
    const { camera, shelves, blocked } = this.options;
    this.raycaster.setFromCamera(this.options.interactor.aim, camera);
    const ray = this.raycaster.ray;
    let hit = shelves.spotAt(ray, drag.box, DRAG_REACH);
    if (hit && blocked(ray.origin, hit.point)) hit = null;
    drag.target = hit;
    const frame = hit?.spot.fits ? hit.shelf : (this.shelf ?? drag.home);
    frame.updateWorldMatrix(true, false);
    frame.getWorldQuaternion(holdTurn).multiply(drag.box.restQuaternion);
    if (hit?.spot.fits) frame.localToWorld(holdAt.copy(hit.spot.centre).setZ(hit.spot.centre.z + DRAG_LIFT));
    else {
      plane.setFromNormalAndCoplanarPoint(facingOf(frame, out), frontCentre(frame, at).addScaledVector(out, DRAG_LIFT));
      if (!ray.intersectPlane(plane, holdAt)) holdAt.copy(drag.box.position);
    }
    const t = dampFactor(DRAG_FOLLOW, dt);
    drag.box.position.lerp(holdAt, t);
    drag.box.quaternion.slerp(holdTurn, t);
    this.part(drag, hit?.spot.fits && !hit.spot.swap ? hit.spot.parting : null);
  }

  /** Stands `parting`'s boxes aside for the lifted one, and every box parted before and not now back. */
  private part(drag: Drag, parting: readonly (readonly [GameBox, number])[] | null): void {
    const now = new Set<GameBox>();
    for (const [box, dx] of parting ?? []) {
      box.setParted(dx);
      now.add(box);
    }
    for (const box of drag.parted) if (!now.has(box)) box.setParted(0);
    drag.parted = now;
  }

  /** Lets the lifted box go: into the spot aimed at when it has room (the shelves become the player's arrangement), else back to its row. */
  private drop(): DropOutcome {
    const drag = this.drag!;
    this.drag = null;
    const { box, target } = drag;
    box.onDisposed = null;
    // Back to their rest poses first: the rebuild slides every box from where it stands now.
    this.part(drag, null);
    let outcome: DropOutcome = { kind: target ? 'full' : 'none' };
    if (target?.spot.fits) {
      const { shelves } = this.options;
      const before = shelves.snapshot();
      if (target.spot.swap) shelves.swapBoxes(box, target.spot.swap);
      else shelves.moveBox(box, target);
      outcome = { kind: 'placed', title: box.game.title, before };
    }
    this.settle(box, drag.home);
    return outcome;
  }

  /**
   * Puts a lifted box back on its row as it stood (the lock lost, the view left, a box taken in hand); `pick` false
   * (the lock lost) leaves the crosshair mute until the lock is back.
   */
  private cancelDrag(pick = true): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    drag.box.onDisposed = null;
    this.part(drag, null);
    this.settle(drag.box, drag.home, pick);
  }

  /** The let-go box onto its shelf (its new one, or the one it came from), sliding from where it is held to its rest pose. */
  private settle(box: GameBox, from: Shelf, pick = true): void {
    if (!box.isDisposed) {
      const home = box.home instanceof Shelf ? box.home : from;
      home.attach(box);
      box.slideToRest(0);
    }
    if (pick) this.options.interactor.enabled = true;
    else this.interactorOwed = true;
  }
}

/** The boxes on row `row` of `shelf`, left to right as the view sees them (ghosts in gaps left out). */
function rowBoxes(shelf: Shelf, row: number): GameBox[] {
  return shelf.children
    .filter((child): child is GameBox => child instanceof GameBox && child.castsShadow && shelf.rowOf(child) === row)
    .sort((a, b) => a.restPosition.x - b.restPosition.x);
}
