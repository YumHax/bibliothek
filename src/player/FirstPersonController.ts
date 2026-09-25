import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { Updatable } from '@/core/Engine';
import type { Input } from '@/core/Input';
import { ACTIONS } from '@/input/actions';
import type { CollisionWorld } from '@/core/Collider';

/** Virtual code other input devices hold to sprint (gamepad stick click, touch joystick pushed far). */
export const SPRINT_CODE = 'Sprint';
/** Physical keys held to crouch; gamepad / touch may hold them virtually too. */
export const CROUCH_CODES = ACTIONS.crouch.codes;
/** Physical key whose double tap starts a sprint. */
const FORWARD_CODE = ACTIONS.forward.codes[0];

export interface FirstPersonOptions {
  eyeHeight?: number;
  /** Eye height while crouching (metres). */
  crouchHeight?: number;
  walkSpeed?: number;
  sprintMultiplier?: number;
  /** Walk speed factor while crouching. */
  crouchMultiplier?: number;
  /** Two forward presses closer than this (ms) start a sprint that lasts while forward stays held. */
  doubleTapMs?: number;
  /** Radius of the player's collision sphere (metres). */
  bodyRadius?: number;
}

/** What `PointerLockControls` turns per pixel of mouse travel at `pointerSpeed` 1. */
const MOUSE_RADIANS_PER_PIXEL = 0.002;
/**
 * The height of the floor under (x, z), world metres, given where the feet are now: stairs stack
 * flight over flight, so the surface is the one just under the feet (a step up is allowed).
 */
export type GroundHeight = (x: number, z: number, feet: number) => number;
/** A drop or rise bigger than this in one frame is a teleport, not a step: the feet go straight there. */
const SNAP = 1.2;

/** Keep the camera off the exact poles so the yaw stays well defined. */
const MAX_PITCH = Math.PI / 2 - 0.01;
/** Height of the lower collision probe (see `blockedAt`): what a knee bumps into. */
const KNEE_HEIGHT = 0.35;

/**
 * First-person look + WASD/ZQSD movement with simple sphere-vs-AABB collision (the room's walls
 * are colliders too, with the doorways left open, so the player may walk out into the hallway).
 * Movement is resolved per axis so the player slides along obstacles instead of sticking.
 * Sprint: double-tap forward (Minecraft creative style), kept while forward stays held, or hold the
 * virtual `SPRINT_CODE` (gamepad / touch). Crouch: hold Shift; the eye eases down to `crouchHeight`.
 *
 * Look has two entry points that both end in `camera.quaternion` (YXZ, roll 0):
 * - the mouse, through `PointerLockControls` while the pointer is really locked;
 * - `applyLook()` / `setLook()` / `lookAt()` for gamepad sticks, touch drags and scripted turns.
 * `PointerLockControls` re-reads yaw/pitch from the camera on every mouse move, so both stay in sync.
 *
 * "In the room" is `isLocked`: either a real pointer lock or a *virtual* lock (`enterVirtual()`),
 * used by gamepad / touch modes where the browser cannot or will not lock the pointer. Both fire
 * `lock` / `unlock` on `controls`, so listeners need not care which one they got.
 */
export class FirstPersonController implements Updatable {
  readonly controls: PointerLockControls;

  private readonly eyeHeight: number;
  private readonly crouchHeight: number;
  private readonly walkSpeed: number;
  private readonly sprintMultiplier: number;
  private readonly crouchMultiplier: number;
  private readonly doubleTapMs: number;
  private readonly bodyRadius: number;

  /** When false, mouse-look and movement are frozen (e.g. while inspecting a game). */
  private _movementEnabled = true;
  /** While seated, walking is disabled and the camera is parked at the seat; look still works. */
  private seated = false;
  private readonly standingPosition = new THREE.Vector3();
  /** "In the room" without a real pointer lock (gamepad / touch). */
  private virtualLock = false;
  /** Current eye height, eased between standing and crouching. */
  private height: number;
  /** The floor under the feet (0 everywhere but on the stairwell's stairs), and who says where it is. */
  private feet = 0;
  private ground: GroundHeight | null = null;
  /** Sprint armed by a double tap; dropped as soon as forward is released. */
  private sprintLatched = false;
  private lastForwardTap = -Infinity;
  /** Settings > Look: the mouse's up and down swapped. */
  private invertMouseY = false;

  private readonly velocity = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly candidate = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly probe = new THREE.Vector3();
  private readonly lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly lookDir = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    private readonly input: Input,
    private readonly collisions: CollisionWorld,
    options: FirstPersonOptions = {},
  ) {
    this.eyeHeight = options.eyeHeight ?? 1.7;
    this.crouchHeight = options.crouchHeight ?? 1.15;
    this.walkSpeed = options.walkSpeed ?? 2.5;
    this.sprintMultiplier = options.sprintMultiplier ?? 1.8;
    this.crouchMultiplier = options.crouchMultiplier ?? 0.5;
    this.doubleTapMs = options.doubleTapMs ?? 300;
    this.bodyRadius = options.bodyRadius ?? 0.3;
    this.height = this.eyeHeight;
    // Only genuine key presses count: virtual presses (a gamepad stick engaging, a touch joystick)
    // are not taps, those devices hold `SPRINT_CODE` instead.
    input.onPress((code, e) => {
      if (code !== FORWARD_CODE || !e.isTrusted) return;
      const now = performance.now();
      if (now - this.lastForwardTap < this.doubleTapMs) this.sprintLatched = true;
      this.lastForwardTap = now;
    });

    this.controls = new PointerLockControls(camera, domElement);
    // A real lock supersedes a virtual one, so the following real unlock takes us back to the card.
    this.controls.addEventListener('lock', () => (this.virtualLock = false));
    // Inverted mouse: PointerLockControls has already turned the camera (its listener came first); undo its pitch twice over.
    domElement.ownerDocument.addEventListener('mousemove', (e) => {
      if (!this.invertMouseY || !this.controls.isLocked || !this.controls.enabled || !e.movementY) return;
      this.lookEuler.setFromQuaternion(this.camera.quaternion);
      this.setLook(this.lookEuler.y, this.lookEuler.x + 2 * e.movementY * MOUSE_RADIANS_PER_PIXEL * this.controls.pointerSpeed);
    });
    this.camera.position.y = this.eyeHeight;
  }

  /** True while the player is "in the room": real pointer lock or virtual (gamepad / touch) lock. */
  get isLocked(): boolean {
    return this.hasPointerLock || this.virtualLock;
  }

  /**
   * True only for a genuine browser pointer lock (mouse mode). Read from the document, not from
   * `controls.isLocked`: PointerLockControls dispatches its `lock` event *before* setting that flag,
   * so listeners of that event would otherwise see a stale false.
   */
  get hasPointerLock(): boolean {
    const el = this.controls.domElement;
    return !!el && el.ownerDocument.pointerLockElement === el;
  }

  get isVirtualLocked(): boolean {
    return this.virtualLock;
  }

  get movementEnabled(): boolean {
    return this._movementEnabled;
  }

  /** False while something else owns the pointer deltas (e.g. the Inspector rotating a box). */
  get lookEnabled(): boolean {
    return this.controls.enabled;
  }

  get isSeated(): boolean {
    return this.seated;
  }

  get isCrouching(): boolean {
    return this.input.isDown(...CROUCH_CODES);
  }

  get isSprinting(): boolean {
    return !this.isCrouching && (this.sprintLatched || this.input.isDown(SPRINT_CODE));
  }

  /** Parks the camera at `eyePosition`, turned to `yaw`, and remembers where the player stood. */
  sit(eyePosition: THREE.Vector3, yaw: number): void {
    if (!this.seated) this.standingPosition.copy(this.camera.position);
    this.seated = true;
    this.velocity.set(0, 0, 0);
    this.camera.position.copy(eyePosition);
    this.setLook(yaw, 0);
  }

  /** Returns to the spot the player stood on before sitting, so they never stand inside the chair. */
  stand(): void {
    if (!this.seated) return;
    this.seated = false;
    this.camera.position.copy(this.standingPosition);
    this.camera.position.y = this.feet + this.height;
  }

  /** The floor's height wherever the player walks (the stairwell's stairs and landings); null: flat floors at 0. */
  setGround(ground: GroundHeight | null): void {
    this.ground = ground;
  }

  /** The height of the floor under the player's feet (world). */
  get feetHeight(): number {
    return this.feet;
  }

  set movementEnabled(enabled: boolean) {
    this._movementEnabled = enabled;
    this.controls.enabled = enabled;
    if (!enabled) this.velocity.set(0, 0, 0);
  }

  // --- Look -------------------------------------------------------------------------------------

  /** Settings > Look: mouse speed (a multiplier of three.js's 0.002 rad per pixel) and inverted Y. */
  setMouseLook(options: { sensitivity: number; invertY: boolean }): void {
    this.controls.pointerSpeed = options.sensitivity;
    this.invertMouseY = options.invertY;
  }

  /**
   * Turns the camera by `yawDelta` / `pitchDelta` radians, mouse convention: positive yaw turns
   * right, positive pitch looks down. Ignored when not in the room or while look is disabled,
   * exactly like mouse movement would be.
   */
  applyLook(yawDelta: number, pitchDelta: number): void {
    if (!this.isLocked || !this.controls.enabled) return;
    this.lookEuler.setFromQuaternion(this.camera.quaternion);
    this.setLook(this.lookEuler.y - yawDelta, this.lookEuler.x - pitchDelta);
  }

  /** Sets the absolute orientation (radians, YXZ). Pitch is clamped short of the poles, roll is zero. */
  setLook(yaw: number, pitch: number): void {
    this.lookEuler.set(THREE.MathUtils.clamp(pitch, -MAX_PITCH, MAX_PITCH), yaw, 0);
    this.camera.quaternion.setFromEuler(this.lookEuler);
  }

  /** Current orientation in radians (yaw about +y, pitch positive when looking up). */
  getLook(): { yaw: number; pitch: number } {
    this.lookEuler.setFromQuaternion(this.camera.quaternion);
    return { yaw: this.lookEuler.y, pitch: this.lookEuler.x };
  }

  /** World position of the eye (the camera). */
  getEyePosition(out = new THREE.Vector3()): THREE.Vector3 {
    return this.camera.getWorldPosition(out);
  }

  /** Points the camera at a world position (roll stays zero). */
  lookAt(target: THREE.Vector3): void {
    this.lookDir.copy(target).sub(this.camera.position);
    const length = this.lookDir.length();
    if (length < 1e-6) return;
    this.lookDir.divideScalar(length);
    // Camera looks down -z; YXZ yaw maps (0,0,-1) to (-sin yaw, 0, -cos yaw), pitch lifts y by sin(pitch).
    const yaw = Math.atan2(-this.lookDir.x, -this.lookDir.z);
    const pitch = Math.asin(THREE.MathUtils.clamp(this.lookDir.y, -1, 1));
    this.setLook(yaw, pitch);
  }

  // --- Entering / leaving the room ---------------------------------------------------------------

  /**
   * Requests pointer lock. Resolves true once the browser confirms the lock, false if it refuses
   * (e.g. Chrome's ~1s cooldown after Esc, or an iframe without `allow="pointer-lock"`).
   */
  lock(): Promise<boolean> {
    if (this.controls.isLocked) return Promise.resolve(true);
    const doc = this.controls.domElement!.ownerDocument;
    if (typeof this.controls.domElement!.requestPointerLock !== 'function') return Promise.resolve(false);
    return new Promise((resolve) => {
      const cleanup = () => {
        this.controls.removeEventListener('lock', onLock);
        doc.removeEventListener('pointerlockerror', onError);
      };
      const onLock = () => { cleanup(); resolve(true); };
      const onError = () => { cleanup(); resolve(false); };
      this.controls.addEventListener('lock', onLock);
      doc.addEventListener('pointerlockerror', onError);
      this.controls.lock();
    });
  }

  unlock(): void {
    this.controls.unlock();
  }

  /**
   * Enters the room without pointer lock (gamepad / touch). Fires `lock` on `controls` so the
   * rest of the app treats it exactly like a real lock. The mouse stays ignored: `PointerLockControls`
   * only reacts to a genuine lock.
   */
  enterVirtual(): void {
    if (this.virtualLock || this.controls.isLocked) return;
    this.virtualLock = true;
    this.controls.dispatchEvent({ type: 'lock' });
  }

  /** Leaves a virtual lock, firing `unlock` on `controls` like an Esc would. No-op for a real lock. */
  exitVirtual(): void {
    if (!this.virtualLock) return;
    this.virtualLock = false;
    this.controls.dispatchEvent({ type: 'unlock' });
  }

  /** Puts the player at (x, z), their feet at `feet` (world floor height; default the ground there, else 0). */
  setPosition(x: number, z: number, feet?: number): void {
    this.feet = feet ?? (this.ground ? this.ground(x, z, this.feet) : 0);
    this.camera.position.set(x, this.feet + this.height, z);
  }

  // --- Movement ---------------------------------------------------------------------------------

  update(dt: number): void {
    if (!this.isLocked || !this._movementEnabled || this.seated) return;

    // WASD (QWERTY) and ZQSD (AZERTY) both work because we read physical key codes.
    // A gamepad stick / touch joystick feeds the same codes with fractional strengths.
    const strafe = this.input.axis([...ACTIONS.left.codes], [...ACTIONS.right.codes]);
    const advance = this.input.axis([...ACTIONS.back.codes], [...ACTIONS.forward.codes]);
    if (advance <= 0) this.sprintLatched = false; // letting go of forward ends the sprint
    const crouch = this.isCrouching;
    const sprint = this.isSprinting;

    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.crossVectors(this.forward, this.camera.up).normalize();

    const speed = this.walkSpeed * (crouch ? this.crouchMultiplier : sprint ? this.sprintMultiplier : 1);
    this.target
      .set(0, 0, 0)
      .addScaledVector(this.forward, advance)
      .addScaledVector(this.right, strafe);
    // Keys give unit (or diagonal) input, clamped to full speed; a half-tilted stick walks slower.
    if (this.target.lengthSq() > 1) this.target.normalize();
    this.target.multiplyScalar(speed);

    // Exponential smoothing gives a bit of acceleration/deceleration without a full physics step.
    const smoothing = 1 - Math.exp(-12 * dt);
    this.velocity.lerp(this.target, smoothing);

    this.moveAxis('x', this.velocity.x * dt);
    this.moveAxis('z', this.velocity.z * dt);

    // The feet follow the floor (stairs), a little eased so each step does not jolt the eye.
    if (this.ground) {
      const floor = this.ground(this.camera.position.x, this.camera.position.z, this.feet);
      this.feet = Math.abs(floor - this.feet) > SNAP ? floor : this.feet + (floor - this.feet) * (1 - Math.exp(-18 * dt));
    }

    // Crouching eases the eye down and back up rather than snapping.
    const targetHeight = crouch ? this.crouchHeight : this.eyeHeight;
    this.height += (targetHeight - this.height) * (1 - Math.exp(-10 * dt));
    this.camera.position.y = this.feet + this.height;
  }

  private moveAxis(axis: 'x' | 'z', delta: number): void {
    if (delta === 0) return;
    this.candidate.copy(this.camera.position);
    this.candidate[axis] += delta;

    // Test collision at waist height so the shelf's overhang does not matter. A player already
    // inside a collider (a door shut on them) is let through, so they can never be stuck.
    if (this.blockedAt(this.candidate) && !this.blockedAt(this.camera.position)) {
      this.velocity[axis] = 0;
      return;
    }
    this.camera.position[axis] = this.candidate[axis];
  }

  /**
   * The body is a sphere tested at two heights: the knees, so low furniture (a bed, a bath, a side
   * table) blocks the way, and the waist, so a shelf's overhang or a worktop does not need a
   * collider down to the floor.
   */
  private blockedAt(position: THREE.Vector3): boolean {
    for (const y of [KNEE_HEIGHT, this.eyeHeight * 0.6]) {
      this.probe.set(position.x, this.feet + y, position.z);
      if (this.collisions.intersectsSphere(this.probe, this.bodyRadius)) return true;
    }
    return false;
  }
}
