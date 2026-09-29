import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Listeners } from '@/core/Listeners';
import type { Carriable } from './Carriable';
import { reduceMotion } from '@/settings/motion';

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
/** The box never tips past this, up or down (radians, 80°). */
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
 * Pulls a GameBox off its shelf and carries it in front of the camera, low and to the left
 * so the crosshair stays free for other interactions (e.g. the TV). The player can keep
 * walking and looking around; holding the right mouse button rotates the box instead.
 * `toggleOpen()` swings the lid open to show the cartridge and manual; the box slides to the
 * right while open so the whole spread stays in view. `release()` sends it back to its rest pose;
 * `stow()` (a box just bought) drops it down out of view and lets go of it for good. Asked for
 * another box while one is still in hand or on its way back, it takes it once the first is home.
 */
export class Inspector<Box extends Carriable = Carriable> implements Updatable {
  /** Hand pose in camera space (metres): x right, y up, z forward is negative. */
  readonly handOffset = new THREE.Vector3(-0.11, -0.05, -0.42);
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
  /** The box asked for while another was in hand: taken once that one is home. */
  private queued: Box | null = null;
  private readonly velocity = new THREE.Vector3();
  private readonly userRotation = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly lookListeners = new Listeners<[enabled: boolean]>();

  private readonly targetPos = new THREE.Vector3();
  private readonly targetQuat = new THREE.Quaternion();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpOffset = new THREE.Vector3();
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

  /** Calls `listener(false)` while the player turns the box (right button held), `true` afterwards; returns the unsubscribe. */
  onLookEnabledChange(listener: (enabled: boolean) => void): () => void {
    return this.lookListeners.add(listener);
  }

  get isActive(): boolean {
    return this.phase !== 'idle';
  }

  get current(): Box | null {
    return this.box;
  }

  /** Distance from the eye to the box while it is in (or on its way to) the hand, else null: what the view focuses on. */
  get focusDistance(): number | null {
    return this.phase === 'toHand' || this.phase === 'inHand' ? this.handOffset.length() : null;
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
    this.euler.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.hasLastView = false;
    this.phase = 'toHand';
    this.stage = offSpot || farAway ? 'fly' : 'slide';
  }

  /** Opens or closes the carried box's lid. No-op when nothing is in hand. */
  toggleOpen(): void {
    if (this.box && (this.phase === 'inHand' || this.phase === 'toHand')) this.box.toggleOpen();
  }

  release(): void {
    this.queued = null;
    if (this.phase === 'toHand' || this.phase === 'inHand') {
      this.box?.close();
      this.setRotating(false);
      this.restPose(this.box!);
      if (this.box!.position.distanceTo(this.restPos) > FAR_HOME) {
        // Its shelf is in another room: down out of view, then home at once (no flight through the walls).
        this.phase = 'stowing';
        this.stowTime = 0;
        this.stowingHome = true;
        return;
      }
      // Back to the slid-out point first, then into the row (a box still sliding out goes straight back in).
      this.stage = this.phase === 'toHand' && this.stage === 'slide' ? 'slide' : 'fly';
      this.phase = 'toShelf';
    }
  }

  /**
   * The carried box is the player's now: it goes down into the bag, out of view, and is taken out
   * of the scene; `onStowed` then runs (whoever owned it disposes of it). At once when nothing is in hand.
   */
  stow(onStowed: () => void): void {
    this.queued = null;
    if (!this.box || (this.phase !== 'inHand' && this.phase !== 'toHand')) {
      onStowed();
      return;
    }
    this.box.close();
    this.setRotating(false);
    this.phase = 'stowing';
    this.stowingHome = false;
    this.stowTime = 0;
    this.onStowed = onStowed;
  }

  update(dt: number): void {
    if (!this.box || this.phase === 'idle') return;
    const box = this.box;
    box.tick(dt);

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

    const flying = this.phase === 'toHand' || this.phase === 'toShelf';
    if (this.phase === 'toHand' && this.stage === 'fly' && this.hasLastView) {
      // What the view moved since last frame moves the box with it: the spring only closes the gap in the hand's frame.
      this.viewDelta.copy(this.lastView).invert().premultiply(this.camera.matrixWorld);
      box.position.applyMatrix4(this.viewDelta);
      this.viewTurn.setFromRotationMatrix(this.viewDelta);
      this.velocity.applyQuaternion(this.viewTurn);
      box.quaternion.premultiply(this.viewTurn);
    }
    this.lastView.copy(this.camera.matrixWorld);
    this.hasLastView = true;
    if (flying && !reduceMotion()) {
      // A critically damped spring: the box keeps its speed from one stage to the next.
      // (The closed form of `SmoothDamp`: stable at any frame time.)
      const w = this.stage === 'slide' ? SLIDE_STIFFNESS : FLY_STIFFNESS;
      const x = w * dt;
      const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      const change = this.tmpOffset.subVectors(box.position, this.targetPos);
      const temp = this.eye.copy(this.velocity).addScaledVector(change, w).multiplyScalar(dt);
      this.velocity.addScaledVector(temp, -w).multiplyScalar(decay);
      box.position.copy(this.targetPos).addScaledVector(change.add(temp), decay);
      box.quaternion.slerp(this.targetQuat, 1 - Math.exp(-(this.stage === 'slide' ? 16 : 9) * dt));
    } else {
      // Snappier when following the hand so the box does not lag behind head movement; with reduced motion the flights are short.
      const rate = reduceMotion() ? 28 : this.phase === 'inHand' ? 18 : 10;
      const t = 1 - Math.exp(-rate * dt);
      box.position.lerp(this.targetPos, t);
      box.quaternion.slerp(this.targetQuat, t);
      this.velocity.set(0, 0, 0);
    }

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

  /** Where the hand holds the box: low left of the view, pulled in when a wall stands nearer than the hand's reach. */
  private handPose(box: Box): void {
    this.camera.getWorldPosition(this.eye);
    this.camera.getWorldQuaternion(this.tmpQuat);
    // A lid swings out to the left (the box shifts right so the spread stays centred), or the contents rise out of the top (it drops).
    this.tmpOffset.copy(this.handOffset);
    const shift = box.openShift;
    this.tmpOffset.x += box.openness * (shift ? shift.x : box.dimensions.width * 0.5);
    this.tmpOffset.y += box.openness * (shift?.y ?? 0);
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
        if (room < reach) this.tmpOffset.multiplyScalar(Math.max(MIN_REACH, room) / reach);
      }
    }
    this.targetPos.copy(this.eye).add(this.tmpOffset.applyQuaternion(this.tmpQuat));
    this.targetQuat.copy(this.tmpQuat).multiply(this.userRotation);
  }

  /** The box's rest pose in world space (`restPos`, `restQuat`). */
  private restPose(box: Box): void {
    const parent = this.originalParent!;
    parent.updateWorldMatrix(true, false);
    this.restPos.copy(box.restPosition).applyMatrix4(parent.matrixWorld);
    parent.getWorldQuaternion(this.restQuat);
    this.restQuat.multiply(box.restQuaternion);
  }

  /** From the rest pose out of the row: along the box's front (+z, the face that looks out of the shelf), world metres. */
  private slideOffset(box: Box): THREE.Vector3 {
    return this.tmpOffset.set(0, 0, box.slideOut).applyQuaternion(this.restQuat);
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
    this.originalParent!.attach(box);
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
    this.velocity.set(0, 0, 0);
    const next = this.queued;
    this.queued = null;
    if (next) this.inspect(next);
  }

  private setRotating(rotating: boolean): void {
    if (this.rotating === rotating) return;
    this.rotating = rotating;
    this.lookListeners.emit(!rotating);
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 2 && (this.phase === 'inHand' || this.phase === 'toHand')) this.setRotating(true);
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 2) this.setRotating(false);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.rotating) return;
    // A real mouse, or the synthetic deltas of the controller's stick or a finger (`SyntheticMouse`): each device's own sensitivity.
    const device = e.isTrusted ? this.sensitivity : document.body.classList.contains('input-touch') ? this.touchSensitivity : this.padSensitivity;
    const speed = this.rotateSpeed * device;
    this.euler.y += e.movementX * speed;
    this.euler.x = THREE.MathUtils.clamp(this.euler.x + e.movementY * speed, -MAX_TILT, MAX_TILT);
    this.userRotation.setFromEuler(this.euler);
  };
}
