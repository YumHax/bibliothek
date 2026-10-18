import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Listeners } from '@/core/Listeners';
import type { Carriable } from './Carriable';
import { reduceMotion } from '@/settings/motion';
import { dampFactor } from '@/math/damp';
import { smoothDamp } from '@/math/springs';
import { clamp, smooth } from '@/math/scalar';
import { noteShadowMotion } from '@/graphics/shadowMotion';

type Phase = 'idle' | 'toHand' | 'inHand' | 'toShelf' | 'stowing';

/** Where a bought box goes in camera space (down out of view, into the bag), and how long it takes. */
const STOW_OFFSET = new THREE.Vector3(0.05, -0.55, -0.3);
const STOW_SECONDS = 0.35;
/** How close to the slid-out point counts as out (m): the flight takes over from there. */
const SLIDE_DONE = 0.006;
/** A box taken from further than this off its rest pose (a stray on a table) flies straight to the hand, no slide first (m). */
const OFF_ITS_SPOT = 0.05;
/** A box put back further than this from its rest pose (another room) goes down out of view and is back home at once (m). */
const FAR_HOME = 3;
/** The box held low in the hand never tips past this, up or down (radians, 80°); looked at closely it turns freely. */
const MAX_TILT = (80 * Math.PI) / 180;
/**
 * The springs moving the box to and from the hand (rad/s, critically damped): its speed carries over from
 * the slide to the flight and back, so the move has no elbow. The slide is short and stiff, the flight softer.
 */
const SLIDE_STIFFNESS = 30;
const FLY_STIFFNESS = 13;
/** Nothing is nearer the eye than this in front of a wall (m): the box in hand is pulled in rather than go through it. */
const WALL_CLEARANCE = 0.06;
const MIN_REACH = 0.24;
/** This close to the hand pose (m), the box is in hand: from there it follows the view tightly. */
const HAND_REACHED = 0.02;
/**
 * How close the box is brought (`closeness`): 0 the hand, low left; 1 looked at, in the middle of the view at reading
 * distance; up to `ZOOM_MAX` the loupe, the face square to the eye filling the view and then magnified.
 */
const ZOOM_MAX = 2;
/** Past this closeness the face fills the view: the mouse looks across it instead of turning the box. */
const LOUPE_FILL = 1.4;
/** At `ZOOM_MAX` the view is magnified this much on top of the face filling it (the camera's zoom: the near plane stops the box). */
const LOUPE_ZOOM = 3;
/** Looked at: never nearer the eye than this (m, its centre), and the whole box in view with this much room about it. */
const EXAMINE_DISTANCE = 0.26;
const EXAMINE_ROOM = 1.25;
/** Looked at, the box sits this far below the middle of the view (m): the caption under the crosshair stays clear of its top. */
const EXAMINE_DROP = 0.008;
/** The right trigger's travel that does nothing (a resting finger), before it starts bringing the box closer. */
const TRIGGER_DEAD = 0.08;
/** How far one notch of the wheel (100 px of delta) brings the box on in the loupe (closeness units). */
const ZOOM_PER_NOTCH = 0.25;
/** Wheel events closer together than this (ms) are one roll of the wheel: one roll stops at the looked-at pose. */
const WHEEL_ROLL_MS = 250;
/** A turn to a face (a key, the snap) eases at this rate, never slower than `TURN_MIN_SPEED` (rad/s). */
const TURN_EASE = 12;
const TURN_MIN_SPEED = 2.5;
/** The mouse still this long (s) with a face within `SNAP_ANGLE` of square to the eye: the box settles onto it. */
const SNAP_IDLE = 0.25;
const SNAP_ANGLE = (10 * Math.PI) / 180;
/** In the loupe, one pixel of mouse moves the view across the face by this many screen pixels of it. */
const PAN_GAIN = 1.2;
/** The view may run this far past a face's edge in the loupe (m): the edge itself is readable. */
const PAN_EDGE = 0.003;

/** Something taken out of the box read in front of the eye (`setAside`): the box held this much lower (m), out of the way. */
const ASIDE_DROP = 0.2;

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

/**
 * What takes the mouse, the wheel and the zoom instead of the box while something lifted out of it is read in front of
 * the eye (the booklet, a card: `world/box/papers`): the box waits low in the hand, the view held still.
 */
export interface AsideReader {
  /** The mouse (or a stick, a finger) moved by `dx`, `dy` pixels; `speed` is the box's turn per pixel for that device. */
  move(dx: number, dy: number, speed: number): void;
  /** One notch of the wheel per unit, towards the eye positive. */
  wheel(notches: number): void;
  /** A pinch: closer (positive) or back (negative). */
  zoomBy(amount: number): void;
  /** The right trigger pressed this far (0..1). */
  holdClose(pressure: number): void;
}

/** The 24 turns that leave a box square to the eye (one of its six faces towards it, upright or on a side), in camera space. */
const SQUARE_TURNS: readonly THREE.Quaternion[] = (() => {
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const basis = new THREE.Matrix4();
  const turns: THREE.Quaternion[] = [];
  for (const [a, b] of [[0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1]] as const) {
    for (const sa of [1, -1]) {
      for (const sb of [1, -1]) {
        const x = axes[a]!.clone().multiplyScalar(sa);
        const y = axes[b]!.clone().multiplyScalar(sb);
        basis.makeBasis(x, y, new THREE.Vector3().crossVectors(x, y));
        turns.push(new THREE.Quaternion().setFromRotationMatrix(basis));
      }
    }
  }
  return turns;
})();

/** The square turn nearest `q` (into `out`), and the angle between them (radians). */
function nearestSquare(q: THREE.Quaternion, out: THREE.Quaternion): number {
  let best = SQUARE_TURNS[0]!;
  let bestDot = -1;
  for (const turn of SQUARE_TURNS) {
    const dot = Math.abs(q.dot(turn));
    if (dot > bestDot) {
      bestDot = dot;
      best = turn;
    }
  }
  out.copy(best);
  return q.angleTo(best);
}

/**
 * Pulls a GameBox off its shelf and carries it in front of the camera, low and to the left
 * so the crosshair stays free for other interactions (e.g. the TV). The player can keep
 * walking and looking around; holding the right mouse button rotates the box instead.
 * Brought closer (the wheel, the right trigger, a pinch: `closeness`) the box is *looked at*: it comes to the middle of
 * the view, the view holds still and the mouse turns the box about its centre (a trackball), the arrows turn it a
 * face at a time and it settles onto a face it is nearly square to; closer still it is the loupe, the face square to
 * the eye filling the view, magnified, the mouse looking across it.
 * `toggleOpen()` swings the lid open to show the cartridge and manual; the box slides to the
 * right while open so the whole spread stays in view. `release()` sends it back to its rest pose;
 * `stow()` (a box just bought) drops it down out of view and lets go of it for good. Asked for
 * another box while one is still in hand or on its way back, it takes it once the first is home.
 */
export class Inspector<Box extends Carriable = Carriable> implements Updatable {
  /** Hand pose in camera space (metres): x right, y up, z forward is negative. */
  readonly handOffset = new THREE.Vector3(-0.11, -0.05, -0.42);
  /** Whether the controller's right trigger is bringing the box close (`holdClose`): its release takes it back. */
  private triggerHeld = false;
  /** The box stays close when the trigger is let go (a cartridge lifted out to read, set by `Hands.liftMedia`). */
  keepClose = false;
  /**
   * Looked at, the box stands this far right of the middle of the view (camera metres; negative: left): room made for a
   * second box held beside it to compare (`SecondHand`, which eases it). 0 alone.
   */
  sideShift = 0;
  /** How close the box is brought (0 the hand, 1 looked at, up to `ZOOM_MAX` the loupe): the wheel sets it, the pose eases to it. */
  private closeness = 0;
  private closenessShown = 0;
  /** The box's turn in the hand, in camera space (identity: its front to the eye, upright). */
  private readonly userRotation = new THREE.Quaternion();
  /**
   * Where a turn is easing the box to (a face at a key, the reset, the snap, squaring up for the loupe), or null. A snap
   * gives way to the mouse; a turn asked for carries the mouse's own turn along with it.
   */
  private goal: THREE.Quaternion | null = null;
  private goalIsSnap = false;
  private readonly goalQuat = new THREE.Quaternion();
  /** Seconds since the mouse last turned the box, and whether the snap has looked at this stillness yet. */
  private stillFor = 0;
  private snapLooked = false;
  /** In the loupe: the box's turn squared up to the eye, and the point of its face in the middle of the view (camera metres). */
  private squared = false;
  private readonly pan = new THREE.Vector2();
  private readonly panShown = new THREE.Vector2();
  /** The face square to the eye: half its width and height, and half the box's depth along the view (m). */
  private readonly face = new THREE.Vector3();
  /** The view's own zoom when the loupe took it over (restored when it lets go), and the loupe's factor last set. */
  private zoomBase: number | null = null;
  private zoomSet = 1;
  /** The wheel's roll: when it last moved, and whether this roll stopped at the looked-at pose. */
  private wheelAt = -Infinity;
  private rollStopped = false;
  /** The next box (one queued) is looked at as soon as it is in hand (`examine` while it waits). */
  private examineQueued = false;
  /** Something taken out of the box is being read (`setAside`), and how far the box has gone down out of its way (0..1, eased). */
  private aside: AsideReader | null = null;
  private asideShown = 0;
  /** The offset the hand holds the box at now (camera space), and its length: what the view focuses on. */
  private readonly heldOffset = new THREE.Vector3();
  private heldDistance = 0;
  /** Radians of spin per pixel of mouse travel at sensitivity 1. */
  rotateSpeed = 0.005;
  /** Settings > Look (`setLook`): each device's sensitivity turns the box as it turns the view (the inverted Y does not: it is the view's). */
  private sensitivity = 1;
  private padSensitivity = 1;
  private touchSensitivity = 1;
  /** Taking the box out or putting it back: `slide` is the short move along the shelf's normal, `fly` the way to or from the hand. */
  private stage: 'slide' | 'fly' = 'fly';

  private phase: Phase = 'idle';
  private box: Box | null = null;
  private originalParent: THREE.Object3D | null = null;
  private onStowed: (() => void) | null = null;
  /** Stowing a box on its way home from another room: back on its shelf at once when out of view. */
  private stowingHome = false;
  private stowTime = 0;
  private rotating = false;
  /** Whether the view is held still now (the box turned by the right button, or looked at), and whether it is looked at. */
  private lookHeld = false;
  private examined = false;
  /** The box asked for while another was in hand: taken once that one is home. */
  private queued: Box | null = null;
  private readonly velocity = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly lookListeners = new Listeners<[enabled: boolean]>();
  private readonly examineListeners = new Listeners<[examining: boolean]>();

  private readonly targetPos = new THREE.Vector3();
  private readonly targetQuat = new THREE.Quaternion();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly turnQuat = new THREE.Quaternion();
  private readonly beforeQuat = new THREE.Quaternion();
  private readonly tmpOffset = new THREE.Vector3();
  private readonly tmpMatrix = new THREE.Matrix4();
  private readonly restPos = new THREE.Vector3();
  private readonly restQuat = new THREE.Quaternion();
  private readonly eye = new THREE.Vector3();
  private readonly ray = new THREE.Raycaster();
  private readonly rayDir = new THREE.Vector3();
  private readonly hits: THREE.Intersection[] = [];
  /** The camera's pose last frame: a box flying to the hand is carried along with the view, so it never trails a walking player. */
  private readonly lastView = new THREE.Matrix4();
  private readonly viewDelta = new THREE.Matrix4();
  private readonly viewTurn = new THREE.Quaternion();
  private hasLastView = false;

  /** `walls`, when given: what the box in hand must not go through (the rooms' walls); it is pulled in towards the eye. */
  constructor(
    private readonly camera: THREE.Camera,
    private readonly scene: THREE.Scene,
    private readonly walls: (() => readonly THREE.Object3D[]) | null = null,
  ) {
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    // The wheel brings the box in hand closer to read, and back (a carried piece of furniture takes it instead: no box then).
    document.addEventListener('wheel', (e) => {
      if (!document.pointerLockElement || !this.holding) return;
      if (this.aside) return this.aside.wheel(-e.deltaY / 100);
      this.wheel(-e.deltaY / 100);
    }, { passive: true });
    // A right button let go outside the window (or the lock lost) never reaches mouseup: stop turning, give the look back.
    window.addEventListener('blur', () => this.setRotating(false));
    document.addEventListener('pointerlockchange', () => this.setRotating(false));
  }

  /**
   * Settings > Look: the spin follows the sensitivity of the device turning it (the mouse; the controller's
   * stick and a finger feed synthetic mouse deltas, read with their own). The inverted Y is the view's
   * only: an object turned in the hand follows the hand.
   */
  setLook(options: { sensitivity: number; padSensitivity?: number; touchSensitivity?: number; invertY: boolean }): void {
    this.sensitivity = options.sensitivity;
    this.padSensitivity = options.padSensitivity ?? options.sensitivity;
    this.touchSensitivity = options.touchSensitivity ?? options.sensitivity;
  }

  /** Stops turning the box (the room was left: the look must not stay frozen). */
  stopRotating(): void {
    this.setRotating(false);
  }

  /** Calls `listener(false)` while the view holds still for the box (turned by the right button, or looked at), `true` afterwards; returns the unsubscribe. */
  onLookEnabledChange(listener: (enabled: boolean) => void): () => void {
    return this.lookListeners.add(listener);
  }

  /** Calls `listener(true)` when the box in hand starts being looked at (brought to the middle of the view), `false` when it stops; returns the unsubscribe. */
  onExamineChange(listener: (examining: boolean) => void): () => void {
    return this.examineListeners.add(listener);
  }

  get isActive(): boolean {
    return this.phase !== 'idle';
  }

  get current(): Box | null {
    return this.box;
  }

  /**
   * The box in hand is looked at: in the middle of the view, the view still, the mouse turning it (or, in the loupe,
   * looking across it); or something taken out of it is read (`setAside`), the view still too.
   */
  get examining(): boolean {
    return this.holding && (this.closeness > 0 || this.aside !== null);
  }

  /** In the loupe: the face square to the eye fills the view and the mouse looks across it. */
  get magnifying(): boolean {
    return this.examining && !this.aside && this.closeness > LOUPE_FILL;
  }

  /** Whether something taken out of the box is being read in front of the eye (`setAside`). */
  get readingAside(): boolean {
    return this.aside !== null;
  }

  /**
   * Something lifted out of the box in hand is read in front of the eye (`reader`; null: it is put back): the box goes
   * down low in the hand, out of its way, the view holds still, and the mouse, the wheel and the zoom are the reader's.
   * Ignored with nothing in hand.
   */
  setAside(reader: AsideReader | null): void {
    if (reader && !this.holding) return;
    this.aside = reader;
    // Out of the loupe: the reader's own magnifies what it holds (one zoom on the camera at a time).
    if (reader) this.closeness = Math.min(this.closeness, 1);
    this.setRotating(false);
    this.sync();
  }

  /** How far into the loupe the box is brought now (0 not in it .. 1 fully magnified), eased: what a reading light may follow. */
  get loupe(): number {
    return this.holding ? clamp((this.closenessShown - 1) / (ZOOM_MAX - 1), 0, 1) : 0;
  }

  /** Whether the box's back faces the eye (or will, once the turn under way ends): its card shows the whole blurb then. */
  get facingBack(): boolean {
    // The box's front (+z) turned into camera space: away from the eye, the back is towards it.
    return this.tmpOffset.set(0, 0, 1).applyQuaternion(this.goal ?? this.userRotation).z < -0.5;
  }

  /** Distance from the eye to the box while it is in (or on its way to) the hand, else null: what the view focuses on. */
  get focusDistance(): number | null {
    return this.holding ? this.heldDistance : null;
  }

  /**
   * Brings the box to the middle of the view to look at it (`true`: at least the looked-at pose), or back to the hand
   * (`false`). Asked while another box is on its way home, the next one is looked at once in hand.
   */
  examine(on: boolean): void {
    if (!this.holding) {
      this.examineQueued = on && this.queued !== null;
      return;
    }
    this.closeness = on ? Math.max(1, this.closeness) : 0;
    this.sync();
  }

  /** Brings the box in hand closer (positive) or back towards the hand (negative), by closeness units (1: from the hand to looked at). */
  zoomBy(amount: number): void {
    if (!this.holding) return;
    if (this.aside) return this.aside.zoomBy(amount);
    this.closeness = clamp(this.closeness + amount, 0, ZOOM_MAX);
    this.sync();
  }

  /**
   * Two fingers spread (positive) or pinched by `amount` of a full spread (`TouchControls.onPinch`): one full spread goes
   * from the hand all the way into the loupe, as the right trigger's full travel does.
   */
  pinch(amount: number): void {
    if (this.aside) return this.zoomBy(amount);
    this.zoomBy(amount * ZOOM_MAX);
  }

  /**
   * The controller's right trigger, pressed this far (0..1): held, the box comes that close (all the way into the loupe
   * at full travel); let go, it goes back to the hand. Only a press moves it, so the mouse wheel's closeness is left
   * alone while the trigger rests.
   */
  holdClose(pressure: number): void {
    if (!this.holding) {
      this.triggerHeld = false;
      return;
    }
    if (this.aside) return this.aside.holdClose(pressure);
    if (pressure > TRIGGER_DEAD) {
      this.triggerHeld = true;
      this.closeness = clamp((pressure - TRIGGER_DEAD) / (1 - TRIGGER_DEAD), 0, 1) * ZOOM_MAX;
    } else if (this.triggerHeld) {
      this.triggerHeld = false;
      // Back to the hand, unless something keeps the box close (a cartridge lifted out to read: `Hands.liftMedia`).
      this.closeness = this.keepClose ? 1 : 0;
    }
    this.sync();
  }

  /** Turns the box in hand over (half a turn about the vertical, eased): the back cover, then the front again. False when nothing is in hand to turn. */
  turnOver(): boolean {
    return this.turn(UP, Math.PI);
  }

  /**
   * Turns the box looked at a quarter turn: `left` / `right` about the view's vertical (a side to the eye), `up` / `down`
   * about its horizontal (the top, the bottom). False when no box is looked at.
   */
  turnFace(way: 'left' | 'right' | 'up' | 'down'): boolean {
    if (!this.examining) return false;
    const quarter = Math.PI / 2;
    // Its cartridge lifted out: that turns a quarter instead (its back, its contacts), the box held as it is.
    const axis = way === 'left' || way === 'right' ? UP : RIGHT;
    if (this.turnLifted(axis, way === 'left' || way === 'down' ? -quarter : quarter, true)) return true;
    if (way === 'left') return this.turn(UP, -quarter);
    if (way === 'right') return this.turn(UP, quarter);
    return this.turn(RIGHT, way === 'up' ? quarter : -quarter);
  }

  /** The box looked at back to its front, upright, the loupe in the middle of it. False when no box is looked at. */
  squareUp(): boolean {
    if (!this.examining) return false;
    if (this.box?.squareLifted?.()) return true;
    this.setGoal(this.tmpQuat.identity(), false);
    this.pan.set(0, 0);
    return true;
  }

  /** True while the carried box is open (or opening). */
  get isOpen(): boolean {
    return this.box?.isOpen ?? false;
  }

  /**
   * Takes `box` in hand. The box already in hand (or on its way back) is taken again; another one is
   * taken once the carried box is home (`release` it first).
   */
  inspect(box: Box): void {
    if (this.phase !== 'idle') {
      if (box === this.box && this.phase === 'toShelf' && !this.stowingHome) {
        this.phase = 'toHand';
        this.queued = null;
        this.sync();
      } else if (box !== this.box) {
        if (this.queued && this.queued !== box) this.queued.onDisposed = null;
        this.queued = box;
        // Rebuilt away while it waits (its shelf re-sorted): nothing to take any more.
        box.onDisposed = () => {
          if (this.queued === box) this.queued = null;
          box.onDisposed = null;
        };
      }
      return;
    }
    this.box = box;
    this.originalParent = box.parent;
    box.onDisposed = () => this.abandon(box);
    box.setHovered(false);
    box.snapClosed();
    // Lying somewhere else than its spot (a stray on a table, its shelf's box moved there): straight to the hand.
    const offSpot = box.position.distanceTo(box.restPosition) > OFF_ITS_SPOT;
    this.scene.attach(box); // keep world transform, reparent to scene
    this.camera.getWorldPosition(this.eye);
    const farAway = box.position.distanceTo(this.eye) > FAR_HOME;
    if (farAway) {
      // Its shelf is in another room (a box rebuilt in the dark, `boxJob`): up into the hand from below the view, not through the walls.
      this.camera.getWorldQuaternion(this.tmpQuat);
      box.position.copy(this.eye).add(this.tmpOffset.copy(STOW_OFFSET).applyQuaternion(this.tmpQuat));
      box.quaternion.copy(this.tmpQuat);
    }
    box.setInHand(true); // the openable shell, its back, cartridge and manual
    this.userRotation.identity();
    this.goal = null;
    this.squared = false;
    this.pan.set(0, 0);
    this.panShown.set(0, 0);
    this.closeness = this.examineQueued ? 1 : 0;
    this.examineQueued = false;
    this.closenessShown = 0;
    this.heldDistance = this.handOffset.length();
    this.velocity.set(0, 0, 0);
    this.hasLastView = false;
    this.phase = 'toHand';
    this.stage = offSpot || farAway ? 'fly' : 'slide';
    this.sync();
  }

  /** Opens or closes the carried box's lid. No-op when nothing is in hand. */
  toggleOpen(): void {
    if (this.box && this.holding) this.box.toggleOpen();
  }

  release(): void {
    this.queued = null;
    this.examineQueued = false;
    this.aside = null;
    if (this.holding) {
      this.box?.close();
      this.setRotating(false);
      this.closeness = 0; // the loupe's zoom eases back as the box goes home
      this.restPose(this.box!);
      if (this.box!.position.distanceTo(this.restPos) > FAR_HOME) {
        // Its shelf is in another room: down out of view, then home at once (no flight through the walls).
        this.phase = 'stowing';
        this.stowTime = 0;
        this.stowingHome = true;
        this.sync();
        return;
      }
      // Back to the slid-out point first, then into the row (a box still sliding out goes straight back in).
      this.stage = this.phase === 'toHand' && this.stage === 'slide' ? 'slide' : 'fly';
      this.phase = 'toShelf';
      this.sync();
    }
  }

  /**
   * The carried box is the player's now: it goes down into the bag, out of view, and is taken out
   * of the scene; `onStowed` then runs (whoever owned it disposes of it). At once when nothing is in hand.
   */
  stow(onStowed: () => void): void {
    this.queued = null;
    this.examineQueued = false;
    this.aside = null;
    if (!this.box || !this.holding) {
      onStowed();
      return;
    }
    this.box.close();
    this.setRotating(false);
    this.closeness = 0;
    this.phase = 'stowing';
    this.stowingHome = false;
    this.stowTime = 0;
    this.onStowed = onStowed;
    this.sync();
  }

  update(dt: number): void {
    if (!this.box || this.phase === 'idle') return;
    const box = this.box;
    box.tick(dt);
    // A box in hand moves with every look: its shadow keeps up (`graphics/shadowMotion`).
    noteShadowMotion();
    this.closenessShown += (this.closeness - this.closenessShown) * dampFactor(reduceMotion() ? 30 : 10, dt);
    this.asideShown += ((this.aside ? 1 : 0) - this.asideShown) * dampFactor(reduceMotion() ? 30 : 8, dt);
    this.stillFor += dt;
    this.settleTurn(box);
    this.stepTurn(dt);
    this.panShown.lerp(this.pan, dampFactor(reduceMotion() ? 30 : 16, dt));
    this.aimTarget(box, dt);
    this.followView(box);
    this.moveTowardsTarget(box, dt);
    this.advancePhase(box);
    this.setZoom(this.loupeZoom());
    this.sync();
  }

  // --- Turning the box ------------------------------------------------------------------------------

  /** A box is in (or on its way to) the hand: not idle, not on its way home or into the bag. */
  get holding(): boolean {
    return this.phase === 'inHand' || this.phase === 'toHand';
  }

  /** Eases the box's turn by `angle` about `axis` (camera space), on from where a turn under way is going. */
  private turn(axis: THREE.Vector3, angle: number): boolean {
    if (!this.holding) return false;
    const from = this.goal && !this.goalIsSnap ? this.goal : this.userRotation;
    this.turnQuat.setFromAxisAngle(axis, angle).multiply(from);
    this.setGoal(this.turnQuat, false);
    this.pan.set(0, 0); // another face: the loupe starts from its middle
    return true;
  }

  /** Turns what is lifted out of the box (`Carriable.turnLifted`) by `angle` about the view's `axis`; false when nothing is. */
  private turnLifted(axis: THREE.Vector3, angle: number, eased: boolean): boolean {
    const box = this.box;
    if (!box?.turnLifted) return false;
    this.camera.getWorldQuaternion(this.turnQuat);
    return box.turnLifted(this.tmpOffset.copy(axis).applyQuaternion(this.turnQuat), angle, eased);
  }

  private setGoal(to: THREE.Quaternion, snap: boolean): void {
    this.goal = this.goalQuat.copy(to).normalize();
    this.goalIsSnap = snap;
  }

  /**
   * The box looked at settles: squared up to the eye on the way into the loupe; still a moment within `SNAP_ANGLE` of a
   * face (and not opening or shutting), onto it.
   */
  private settleTurn(box: Box): void {
    if (!this.magnifying) {
      this.squared = false;
      this.pan.set(0, 0); // out of the loupe the view drifts back to the middle of the face
    } else if (!this.squared) {
      this.squared = true;
      nearestSquare(this.goal && !this.goalIsSnap ? this.goal : this.userRotation, this.tmpQuat);
      this.setGoal(this.tmpQuat, false);
    }
    const swinging = box.openness > 0.01 && box.openness < 0.99;
    if (!this.examining || this.magnifying || this.goal || this.snapLooked || this.stillFor < SNAP_IDLE || swinging) return;
    this.snapLooked = true;
    const off = nearestSquare(this.userRotation, this.tmpQuat);
    if (off > 1e-3 && off < SNAP_ANGLE) this.setGoal(this.tmpQuat, true);
  }

  /** One frame of the turn under way: eased, and never slower than `TURN_MIN_SPEED` near its end. */
  private stepTurn(dt: number): void {
    const goal = this.goal;
    if (!goal) return;
    const angle = this.userRotation.angleTo(goal);
    if (reduceMotion() || angle < 1e-3) {
      this.userRotation.copy(goal);
      this.goal = null;
      return;
    }
    this.userRotation.rotateTowards(goal, Math.max(angle * dampFactor(TURN_EASE, dt), TURN_MIN_SPEED * dt));
  }

  /** The mouse (or a stick, a finger) moved by `dx`, `dy` pixels while the box is turned or looked at. */
  private handle(dx: number, dy: number, speed: number): void {
    if (this.magnifying) return this.lookAcross(dx, dy);
    // Its cartridge (or disc) lifted out to be read: the mouse turns that, a trackball about the view's own axes.
    if (this.examining && this.turnLifted(UP, dx * speed, false)) {
      this.turnLifted(RIGHT, dy * speed, false);
      this.stillFor = 0;
      return;
    }
    this.beforeQuat.copy(this.userRotation);
    if (this.examining) {
      // A trackball: across turns the box about the view's vertical, up and down about its horizontal, whatever its turn.
      this.userRotation.premultiply(this.turnQuat.setFromAxisAngle(UP, dx * speed));
      this.userRotation.premultiply(this.turnQuat.setFromAxisAngle(RIGHT, dy * speed)).normalize();
    } else {
      // Low in the hand, as it always turned: round the vertical, tipped up or down no further than `MAX_TILT`.
      this.euler.setFromQuaternion(this.userRotation, 'YXZ');
      const x = this.euler.x;
      this.euler.y += dx * speed;
      this.euler.x = clamp(x + dy * speed, Math.min(-MAX_TILT, x), Math.max(MAX_TILT, x));
      this.userRotation.setFromEuler(this.euler);
    }
    this.stillFor = 0;
    this.snapLooked = false;
    if (!this.goal) return;
    if (this.goalIsSnap) {
      this.goal = null; // the hand takes over from a snap
      return;
    }
    // A turn asked for (a face, the half turn) goes on with the mouse's own turn added to it.
    this.turnQuat.copy(this.beforeQuat).invert().premultiply(this.userRotation);
    this.goal.premultiply(this.turnQuat).normalize();
  }

  /** In the loupe the mouse looks across the face, as far as its edges. */
  private lookAcross(dx: number, dy: number): void {
    const perPixel = (2 * this.visibleHalfHeight() * PAN_GAIN) / Math.max(1, window.innerHeight);
    this.pan.x += dx * perPixel;
    this.pan.y -= dy * perPixel;
    this.clampPan();
  }

  // --- The loupe ------------------------------------------------------------------------------------

  private get fovTan(): number {
    const fov = this.camera instanceof THREE.PerspectiveCamera ? this.camera.fov : 70;
    return Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  }

  private get aspect(): number {
    return this.camera instanceof THREE.PerspectiveCamera ? this.camera.aspect : 16 / 9;
  }

  /** The camera's zoom the loupe asks for at the closeness shown (1 until the face fills the view). */
  private loupeZoom(): number {
    if (!this.holding || this.closenessShown <= LOUPE_FILL) return 1;
    return Math.pow(LOUPE_ZOOM, smooth((this.closenessShown - LOUPE_FILL) / (ZOOM_MAX - LOUPE_FILL)));
  }

  /** Half the height of the view at the face's distance (m), magnified by the loupe. */
  private visibleHalfHeight(): number {
    return (Math.max(0.01, this.heldDistance - this.face.z) * this.fovTan) / this.loupeZoom();
  }

  private clampPan(): void {
    const halfHeight = this.visibleHalfHeight();
    const maxX = Math.max(0, this.face.x - halfHeight * this.aspect + PAN_EDGE);
    const maxY = Math.max(0, this.face.y - halfHeight + PAN_EDGE);
    this.pan.set(clamp(this.pan.x, -maxX, maxX), clamp(this.pan.y, -maxY, maxY));
  }

  /** The face square to the eye for the box's turn (the nearest square of it): half its width, height and depth along the view (`face`). */
  private measureFace(box: Box): void {
    nearestSquare(this.goal ?? this.userRotation, this.tmpQuat);
    const e = this.tmpMatrix.makeRotationFromQuaternion(this.tmpQuat).elements;
    const { width, height, depth } = box.dimensions;
    // Column-major: row r of the turn says how much of each of the box's axes lies along camera axis r.
    const along = (r: number): number => Math.abs(e[r]!) * width + Math.abs(e[r + 4]!) * height + Math.abs(e[r + 8]!) * depth;
    this.face.set(along(0) / 2, along(1) / 2, along(2) / 2);
  }

  /** Looked at, how far from the eye the box's centre goes (m): the whole box in view, never nearer than `EXAMINE_DISTANCE`. */
  private examineDistance(box: Box): number {
    const { width, height, depth } = box.dimensions;
    return Math.max(EXAMINE_DISTANCE, (Math.hypot(width, height, depth) / 2 / this.fovTan) * EXAMINE_ROOM);
  }

  /** The face filling the view: how far the box's centre goes (m), its face never inside the camera's near plane. */
  private fillDistance(): number {
    const tan = this.fovTan;
    const fit = Math.max(this.face.y / tan, this.face.x / (tan * this.aspect));
    const near = this.camera instanceof THREE.PerspectiveCamera ? this.camera.near : 0.1;
    return Math.max(fit, near + 0.012) + this.face.z;
  }

  /** The loupe's zoom on the camera, over the view's own (restored exactly once the loupe lets go). */
  private setZoom(factor: number): void {
    const camera = this.camera;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const z = factor < 1.002 ? 1 : factor;
    if (z === this.zoomSet) return;
    this.zoomBase ??= camera.zoom;
    camera.zoom = this.zoomBase * z;
    camera.updateProjectionMatrix();
    this.zoomSet = z;
    if (z === 1) this.zoomBase = null;
  }

  /**
   * One roll of the wheel by `notches` (positive: towards the eye). From the hand the first notch brings the box to be
   * looked at and the rest of that roll stops there, so a quick roll never overshoots into the loupe; on, it goes into
   * the loupe a notch at a time. Back, it stops at the looked-at pose the same way before going back to the hand.
   */
  private wheel(notches: number): void {
    const now = performance.now();
    if (now - this.wheelAt > WHEEL_ROLL_MS) this.rollStopped = false;
    this.wheelAt = now;
    if (notches > 0) {
      if (this.closeness < 1) {
        this.closeness = 1;
        this.rollStopped = true;
      } else if (!this.rollStopped) this.closeness = Math.min(ZOOM_MAX, this.closeness + notches * ZOOM_PER_NOTCH);
    } else if (notches < 0) {
      if (this.closeness > 1) {
        this.closeness = Math.max(1, this.closeness + notches * ZOOM_PER_NOTCH);
        if (this.closeness === 1) this.rollStopped = true;
      } else if (!this.rollStopped) this.closeness = 0;
    }
    this.sync();
  }

  /** Tells who listens when the box starts or stops being looked at, and holds the view still while it is (or turned by the right button). */
  private sync(): void {
    const examined = this.examining;
    if (examined !== this.examined) {
      this.examined = examined;
      this.stillFor = 0;
      this.snapLooked = false;
      this.examineListeners.emit(examined);
    }
    const held = this.rotating || examined;
    if (held === this.lookHeld) return;
    this.lookHeld = held;
    this.lookListeners.emit(!held);
  }

  // --- Moving the box -------------------------------------------------------------------------------

  /** Where the box is heading this frame (`targetPos` / `targetQuat`): into the bag, the rest pose or the point just out of the row, or the hand. */
  private aimTarget(box: Box, dt: number): void {
    if (this.phase === 'stowing') {
      this.stowTime += dt;
      this.camera.getWorldPosition(this.targetPos);
      this.camera.getWorldQuaternion(this.tmpQuat);
      this.targetPos.add(this.tmpOffset.copy(STOW_OFFSET).applyQuaternion(this.tmpQuat));
      this.targetQuat.copy(this.tmpQuat);
    } else if (this.phase === 'toShelf' || (this.phase === 'toHand' && this.stage === 'slide')) {
      // The rest pose, or the point just out of the row in front of it (the flight's end on the way back, its start on the way out).
      this.restPose(box);
      this.targetPos.copy(this.restPos);
      this.targetQuat.copy(this.restQuat);
      if ((this.phase === 'toShelf') === (this.stage === 'fly')) this.targetPos.add(this.slideOffset(box));
    } else {
      this.handPose(box);
    }
  }

  /** What the view moved since last frame moves a box flying to the hand with it: the spring only closes the gap in the hand's frame. */
  private followView(box: Box): void {
    if (this.phase === 'toHand' && this.stage === 'fly' && this.hasLastView) {
      this.viewDelta.copy(this.lastView).invert().premultiply(this.camera.matrixWorld);
      box.position.applyMatrix4(this.viewDelta);
      this.viewTurn.setFromRotationMatrix(this.viewDelta);
      this.velocity.applyQuaternion(this.viewTurn);
      box.quaternion.premultiply(this.viewTurn);
    }
    this.lastView.copy(this.camera.matrixWorld);
    this.hasLastView = true;
  }

  /**
   * One frame of motion towards the target: in flight a critically damped spring (the box keeps its speed from one
   * stage to the next; the closed form of `SmoothDamp`, stable at any frame time), else a tight follow, snappier in the
   * hand so the box does not lag behind head movement; with reduced motion the flights are short.
   */
  private moveTowardsTarget(box: Box, dt: number): void {
    const flying = this.phase === 'toHand' || this.phase === 'toShelf';
    if (flying && !reduceMotion()) {
      const w = this.stage === 'slide' ? SLIDE_STIFFNESS : FLY_STIFFNESS;
      smoothDamp(box.position, this.targetPos, this.velocity, w, dt, [this.tmpOffset, this.eye]);
      box.quaternion.slerp(this.targetQuat, dampFactor(this.stage === 'slide' ? 16 : 9, dt));
    } else {
      const rate = reduceMotion() ? 28 : this.phase === 'inHand' ? 18 : 10;
      const t = dampFactor(rate, dt);
      box.position.lerp(this.targetPos, t);
      box.quaternion.slerp(this.targetQuat, t);
      this.velocity.set(0, 0, 0);
    }
  }

  /** The stage and phase a frame's motion earns: out of the row then flying, into the hand, back into the row once the lid is shut, home or into the bag. */
  private advancePhase(box: Box): void {
    const gap = box.position.distanceToSquared(this.targetPos);
    const still = this.velocity.lengthSq() < 0.0004;
    const settled = gap < 1e-6 && box.quaternion.angleTo(this.targetQuat) < 0.005;
    if (this.phase === 'toHand' && this.stage === 'slide' && gap < SLIDE_DONE * SLIDE_DONE) this.stage = 'fly';
    // Near the hand the tight follow takes over (a spring alone would trail behind a walking player).
    else if (this.phase === 'toHand' && this.stage === 'fly' && gap < HAND_REACHED * HAND_REACHED) this.phase = 'inHand';
    // Into the row only once the lid is shut, so an open box never catches its neighbours.
    if (this.phase === 'toShelf' && this.stage === 'fly' && gap < SLIDE_DONE * SLIDE_DONE && box.quaternion.angleTo(this.targetQuat) < 0.05 && box.openness < 0.01) this.stage = 'slide';
    else if (this.phase === 'toShelf' && this.stage === 'slide' && settled && still) this.finishReturn();
    if (this.phase === 'stowing' && this.stowTime >= STOW_SECONDS) {
      if (this.stowingHome) this.finishReturn();
      else this.finishStow();
    }
  }

  /**
   * Where the hand holds the box: low left of the view; looked at, in the middle at reading distance; in the loupe,
   * nearer, its face filling the view, the point looked at in the middle. Pulled in when a wall stands nearer.
   */
  private handPose(box: Box): void {
    this.measureFace(box); // first: it works in `tmpQuat`, the view's turn below
    this.camera.getWorldPosition(this.eye);
    this.camera.getWorldQuaternion(this.tmpQuat);
    const c = this.closenessShown;
    const examine = this.examineDistance(box);
    if (c <= 1) {
      this.tmpOffset.set(0, -EXAMINE_DROP, -examine);
      this.tmpOffset.lerpVectors(this.handOffset, this.tmpOffset, smooth(c));
    } else {
      // Into the loupe: nearer until the face fills the view (the zoom then magnifies it), the drop gone, the face looked across.
      const t = smooth(Math.min(1, (c - 1) / (LOUPE_FILL - 1)));
      const distance = THREE.MathUtils.lerp(examine, this.fillDistance(), t);
      this.clampPan();
      this.tmpOffset.set(-this.panShown.x, -EXAMINE_DROP * (1 - t) - this.panShown.y, -distance);
    }
    // A lid swings out to the left (the box shifts right so the spread stays centred), or the contents rise out of the top (it drops).
    const shift = box.openShift;
    this.tmpOffset.x += box.openness * (shift ? shift.x : box.dimensions.width * 0.5);
    this.tmpOffset.y += box.openness * (shift?.y ?? 0);
    // Room for a second box held beside it (`SecondHand`), as much as it is looked at.
    this.tmpOffset.x += this.sideShift * smooth(Math.min(1, c));
    // Something taken out of it read in front of the eye: the box down low in the hand, out of its way.
    this.tmpOffset.y -= ASIDE_DROP * smooth(this.asideShown);
    const walls = this.walls?.();
    if (walls?.length) {
      const reach = this.tmpOffset.length();
      this.rayDir.copy(this.tmpOffset).applyQuaternion(this.tmpQuat).normalize();
      this.ray.set(this.eye, this.rayDir);
      this.ray.far = reach + box.dimensions.width;
      this.hits.length = 0;
      this.ray.intersectObjects(walls as THREE.Object3D[], false, this.hits);
      const hit = this.hits[0];
      if (hit) {
        const room = hit.distance - WALL_CLEARANCE - box.dimensions.width * 0.5;
        // Never pushed out further than it is held (a box brought close is already nearer than `MIN_REACH`).
        if (room < reach) this.tmpOffset.multiplyScalar(Math.max(Math.min(MIN_REACH, reach), room) / reach);
      }
    }
    this.heldOffset.copy(this.tmpOffset);
    this.heldDistance = this.heldOffset.length();
    this.targetPos.copy(this.eye).add(this.tmpOffset.applyQuaternion(this.tmpQuat));
    this.targetQuat.copy(this.tmpQuat).multiply(this.userRotation);
  }

  /** Where the box goes back to: its `home` when it has one (re-shelved while in hand), else where it was taken from. */
  private homeOf(box: Box): THREE.Object3D {
    return box.home ?? this.originalParent!;
  }

  /** The box's rest pose in world space (`restPos`, `restQuat`). */
  private restPose(box: Box): void {
    const parent = this.homeOf(box);
    parent.updateWorldMatrix(true, false);
    this.restPos.copy(box.restPosition).applyMatrix4(parent.matrixWorld);
    parent.getWorldQuaternion(this.restQuat);
    this.restQuat.multiply(box.restQuaternion);
  }

  /** From the rest pose out of the row: along the box's front (+z, the face that looks out of the shelf), world metres. */
  private slideOffset(box: Box): THREE.Vector3 {
    // A box standing spine out comes out by its spine (`slideAxis`): still straight out of the shelf.
    const axis = box.slideAxis;
    return (axis ? this.tmpOffset.copy(axis).multiplyScalar(box.slideOut) : this.tmpOffset.set(0, 0, box.slideOut)).applyQuaternion(this.restQuat);
  }

  private finishStow(): void {
    const done = this.onStowed;
    const box = this.box;
    if (box) box.onDisposed = null;
    box?.setInHand(false);
    box?.removeFromParent();
    this.onStowed = null;
    this.idle();
    done?.();
  }

  private finishReturn(): void {
    const box = this.box!;
    box.onDisposed = null;
    this.homeOf(box).attach(box);
    box.position.copy(box.restPosition);
    box.quaternion.copy(box.restQuaternion);
    box.snapClosed();
    box.setInHand(false); // back to the one-draw closed box
    this.idle();
  }

  /** The carried box was disposed under the hand (its shelf rebuilt it with a new state): it is gone, nothing flies home. */
  private abandon(box: Box): void {
    if (box !== this.box) return;
    box.onDisposed = null;
    box.removeFromParent();
    this.setRotating(false);
    this.idle();
  }

  private idle(): void {
    this.phase = 'idle';
    this.box = null;
    this.originalParent = null;
    this.stowingHome = false;
    this.closeness = 0;
    this.closenessShown = 0;
    this.aside = null;
    this.asideShown = 0;
    this.goal = null;
    this.velocity.set(0, 0, 0);
    this.setZoom(1);
    this.sync();
    const next = this.queued;
    this.queued = null;
    if (next) this.inspect(next);
  }

  private setRotating(rotating: boolean): void {
    if (this.rotating === rotating) return;
    this.rotating = rotating;
    this.sync();
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 2 && this.holding) this.setRotating(true);
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 2) this.setRotating(false);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.rotating && !this.examining) return;
    // Looked at, a real mouse turns the box only under the lock (a pointer over the pause menu moves nothing).
    if (!this.rotating && e.isTrusted && !document.pointerLockElement) return;
    // A real mouse, or the synthetic deltas of the controller's stick or a finger (`SyntheticMouse`): each device's own sensitivity.
    const device = e.isTrusted ? this.sensitivity : document.body.classList.contains('input-touch') ? this.touchSensitivity : this.padSensitivity;
    if (this.aside) return this.aside.move(e.movementX, e.movementY, this.rotateSpeed * device);
    this.handle(e.movementX, e.movementY, this.rotateSpeed * device);
  };
}
