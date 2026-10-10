import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { Updatable } from '@/core/Engine';
import type { Input } from '@/core/Input';
import { ACTIONS } from '@/input/actions';
import type { CollisionWorld } from '@/core/Collider';
import { reduceMotion } from '@/settings/motion';
import { angleTo } from '@/math/angles';
import { damp, dampFactor } from '@/math/damp';

/** Virtual code other input devices hold to sprint (gamepad stick click, touch joystick pushed far). */
export const SPRINT_CODE = 'Sprint';
/** Virtual code other input devices hold to crouch (the gamepad's LB), whichever key the keyboard crouches on. */
export const CROUCH_VIRTUAL = 'Crouch';
/** Keys held to crouch (Shift); while Shift sprints (`sprint: 'hold'`) the crouch moves to `crouchAlt`. */
const CROUCH_CODES = ACTIONS.crouch.codes;
const CROUCH_ALT_CODES = ACTIONS.crouchAlt.codes;
/** The stick's and the finger's look speed while the crosshair is on something clickable, and how fast it eases (1/s). */
const AIM_FRICTION = 0.5;
const AIM_FRICTION_RATE = 1 / 0.15;
/** Physical key whose double tap starts a sprint. */
const FORWARD_CODE = ACTIONS.forward.codes[0];

/** Settings > Controls: how the walk feels. */
interface WalkFeel {
  /** `doubleTap`: double-tap forward and keep it held; `hold`: hold Shift (the crouch then moves to `crouchAlt`). */
  sprint: 'doubleTap' | 'hold';
  /** `hold`: crouched while the key is down; `toggle`: a press crouches, the next stands. */
  crouch: 'hold' | 'toggle';
  /** A few millimetres of bob with the stride (none crouched, none with reduced motion). */
  headBob: boolean;
  /** Vertical field of view, degrees (the sprint widens it a little). */
  fov: number;
}

/** How much the sprint widens the view (degrees), and how fast the sprint comes and goes (1/s). */
const SPRINT_FOV = 4;
const SPRINT_EASE = 6;
/** Climbing stairs: the floor `probe` m ahead more than `rise` m above the feet slows the walk to `factor`, eased at `ease`/s. */
const CLIMB = { probe: 0.35, rise: 0.06, factor: 0.75, ease: 5 };
/** Speeding up is gentler than stopping (1/s, exponential). */
const ACCEL = 8;
const DECEL = 16;
/** The bob: metres of rise per m/s of walk, one bob every half stride, and the sway at a full sprint (m). */
const BOB_PER_SPEED = 0.005;
const STRIDE = 1.5;
const SPRINT_SWAY = 0.006;
/** The eye's dip stepping down a stair (m, at most), and how fast it comes back (1/s). */
const STEP_DIP = 0.025;
const DIP_RECOVER = 9;
/** Sitting down and standing up: an eased move rather than a cut (s). */
const SEAT_MOVE_S = 0.42;

interface FirstPersonOptions {
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
type GroundHeight = (x: number, z: number, feet: number) => number;
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
 * Sprint: double-tap forward (Minecraft creative style), kept while forward stays held, or hold Shift
 * (`setFeel`), or the virtual `SPRINT_CODE` (gamepad / touch); it eases in and out and widens the view
 * a little. Crouch: hold (or toggle) Shift; the eye eases down to `crouchHeight`. A subtle head bob
 * follows the speed, sitting and standing are a short eased move (both off with reduced motion).
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
  /** 1 on the flat, `CLIMB.factor` going up a flight, eased. */
  private climbFactor = 1;
  /** Sprint armed by a double tap; dropped as soon as forward is released. */
  private sprintLatched = false;
  private lastForwardTap = -Infinity;
  /** Settings > Controls (`setFeel`). */
  private feel: WalkFeel = { sprint: 'hold', crouch: 'hold', headBob: true, fov: 70 };
  /** Crouch toggled on by a press (`feel.crouch === 'toggle'`). */
  private crouchToggled = false;
  /** 0 walking .. 1 sprinting, eased: the speed and the view widen together. */
  private sprintAmount = 0;
  /** The field of view's widening last written to the camera (degrees), so others' changes to it survive. */
  private appliedKick = 0;
  /** The settings' field of view has been written once (the first `setFeel` always writes it). */
  private fovSet = false;
  /** The stride's phase (radians), the dip of the last step down (m), and the bob / sway last added to the eye. */
  private bobPhase = 0;
  private dip = 0;
  /** The floor under the feet last frame, to tell the frame a tread steps down, and whether it moved the frame before (a lift's car, not a tread). */
  private lastFloor = 0;
  private floorMoving = false;
  /** The feet ride a floor that moves on its own (the lift's car), set by `followGround`. */
  private ridingFloor = false;
  /** The pitch last set by this controller, for the inverted mouse at the end of the travel (see the constructor). */
  private lastPitch = 0;
  private readonly bobOffset = new THREE.Vector3();
  /** Sitting down / standing up under way: from, to (position and look), elapsed. */
  private seatMove: { from: THREE.Vector3; to: THREE.Vector3; fromYaw: number; toYaw: number; fromPitch: number; toPitch: number; t: number } | null = null;
  /** Settings > Look: the mouse's up and down swapped. */
  private invertMouseY = false;

  private readonly velocity = new THREE.Vector3();
  /** How fast the feet really went over the floor (m/s, eased): the bob and the sprint's wider view follow it, not the keys. */
  private groundSpeed = 0;
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
      // Toggle crouch: a press of the crouch key (or the controller's LB) flips it, only while walking about
      // (not on a menu, in a panel, at a machine, seated or in photo mode, which sits the player: Shift is theirs there).
      if (this.feel.crouch === 'toggle' && (this.crouchKeys.includes(code) || code === 'GamepadLB')) {
        if (this.isLocked && !this.seated && this._movementEnabled) this.crouchToggled = !this.crouchToggled;
        return;
      }
      if (code !== FORWARD_CODE || !e.isTrusted || this.feel.sprint !== 'doubleTap') return;
      const now = performance.now();
      if (now - this.lastForwardTap < this.doubleTapMs) this.sprintLatched = true;
      this.lastForwardTap = now;
    });

    this.controls = new PointerLockControls(camera, domElement);
    // The same stops as `setLook`: never the exact poles, where the YXZ yaw is undefined.
    this.controls.minPolarAngle = Math.PI / 2 - MAX_PITCH;
    this.controls.maxPolarAngle = Math.PI / 2 + MAX_PITCH;
    // A real lock supersedes a virtual one, so the following real unlock takes us back to the card.
    this.controls.addEventListener('lock', () => (this.virtualLock = false));
    // Inverted mouse: PointerLockControls has already turned the camera (its listener came first). Its pitch is
    // replaced by the opposite move from where the look was: undone from what it did, or, when it hit its stop
    // (and did less than asked), from the pitch this controller last set.
    domElement.ownerDocument.addEventListener('mousemove', (e) => {
      if (!this.invertMouseY || !this.controls.isLocked || !this.controls.enabled || !e.movementY) return;
      this.lookEuler.setFromQuaternion(this.camera.quaternion);
      const step = e.movementY * MOUSE_RADIANS_PER_PIXEL * this.controls.pointerSpeed;
      const atStop = Math.abs(this.lookEuler.x) >= MAX_PITCH - 1e-4;
      const before = atStop ? this.lastPitch : this.lookEuler.x + step;
      this.setLook(this.lookEuler.y, before + step);
    });
    domElement.ownerDocument.addEventListener('mousemove', () => {
      if (this.invertMouseY || !this.controls.isLocked) return;
      this.lastPitch = this.getLook().pitch;
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

  /** The keys that crouch now: Shift, or `crouchAlt` while Shift sprints. */
  private get crouchKeys(): readonly string[] {
    return this.feel.sprint === 'hold' ? CROUCH_ALT_CODES : CROUCH_CODES;
  }

  get isCrouching(): boolean {
    if (this.feel.crouch === 'toggle') return this.crouchToggled;
    return this.held(this.crouchKeys) || this.input.strength(CROUCH_VIRTUAL) > 0;
  }

  get isSprinting(): boolean {
    if (this.isCrouching) return false;
    const key = this.feel.sprint === 'hold' ? this.held(CROUCH_CODES) : this.sprintLatched;
    return key || this.input.strength(SPRINT_CODE) > 0;
  }

  /** The walk's speed factor where the player is (`setPace`): under 1 indoors, a browsing pace; the sprint keeps its multiplier over it. */
  private pace = 1;

  /** Sets the walk's pace for the zone the player is in (1 = the full walk). */
  setPace(pace: number): void {
    this.pace = pace;
  }

  /** Settings > Controls and Display: the sprint and crouch keys, the head bob, the field of view. */
  setFeel(feel: WalkFeel): void {
    if (feel.crouch !== this.feel.crouch) this.crouchToggled = false;
    if (feel.sprint !== this.feel.sprint) this.sprintLatched = false;
    const fovChanged = feel.fov !== this.feel.fov || !this.fovSet;
    this.fovSet = true;
    this.feel = { ...feel };
    if (fovChanged) {
      this.camera.fov = feel.fov + this.appliedKick;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Sits: the eye moves to `eyePosition`, turned to `yaw` (an eased move, or at once when `instant` or
   * with reduced motion), and remembers where the player stood.
   */
  sit(eyePosition: THREE.Vector3, yaw: number, instant = false): void {
    if (!this.seated) this.standingPosition.copy(this.camera.position).sub(this.bobOffset);
    this.seated = true;
    this.velocity.set(0, 0, 0);
    this.groundSpeed = 0;
    this.crouchToggled = false;
    this.clearBob();
    // Sat down from a sprint: the view narrows back (photo mode, `instant`, keeps the lens it read).
    if (!instant) {
      this.sprintAmount = 0;
      this.setSprintKick(0);
    }
    this.moveSeat(eyePosition, yaw, 0, instant);
  }

  /** Returns to the spot the player stood on before sitting, so they never stand inside the chair. */
  stand(instant = false): void {
    if (!this.seated) return;
    this.seated = false;
    this.standingPosition.y = this.feet + this.height;
    const { yaw, pitch } = this.seatMove ? { yaw: this.seatMove.toYaw, pitch: this.seatMove.toPitch } : this.getLook();
    this.moveSeat(this.standingPosition, yaw, pitch, instant);
  }

  /** Eases the eye to `to` and the look to (`yaw`, `pitch`), from where they are now. */
  private moveSeat(to: THREE.Vector3, yaw: number, pitch: number, instant: boolean): void {
    if (instant || reduceMotion()) {
      this.seatMove = null;
      this.camera.position.copy(to);
      this.setLook(yaw, pitch);
      return;
    }
    const look = this.getLook();
    // The shorter way round.
    const turn = angleTo(look.yaw, yaw);
    this.seatMove = {
      from: this.camera.position.clone(),
      to: to.clone(),
      fromYaw: look.yaw,
      toYaw: look.yaw + turn,
      fromPitch: look.pitch,
      toPitch: pitch,
      t: 0,
    };
  }

  /** One frame of the sit / stand move; true while it runs (the walk waits). */
  private stepSeatMove(dt: number): boolean {
    const move = this.seatMove;
    if (!move) return false;
    move.t = Math.min(1, move.t + dt / SEAT_MOVE_S);
    const k = move.t < 0.5 ? 4 * move.t ** 3 : 1 - (-2 * move.t + 2) ** 3 / 2; // ease in-out
    this.camera.position.lerpVectors(move.from, move.to, k);
    this.setLook(move.fromYaw + (move.toYaw - move.fromYaw) * k, move.fromPitch + (move.toPitch - move.fromPitch) * k);
    if (move.t >= 1) this.seatMove = null;
    return true;
  }

  /** True while any of `codes` is held (without spreading an array each frame). */
  private held(codes: readonly string[]): boolean {
    for (const code of codes) if (this.input.strength(code) > 0) return true;
    return false;
  }

  /** The floor's height wherever the player walks (the stairwell's stairs and landings); null: flat floors at 0. */
  setGround(ground: GroundHeight | null): void {
    this.ground = ground;
  }

  /** What the walk's bob and sway add to the eye right now (world metres; read-only): the crosshair's ray aims without it. */
  get eyeSway(): THREE.Vector3 {
    return this.bobOffset;
  }

  /** The height of the floor under the player's feet (world). */
  /** True while the feet ride a moving floor (the lift's car): its rise is not a climb. */
  get isRiding(): boolean {
    return this.ridingFloor;
  }

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
    this.setLook(this.lookEuler.y - yawDelta * this.aimFriction, this.lookEuler.x - pitchDelta * this.aimFriction);
  }

  /** The stick's and the finger's look over something clickable (`setAimFriction`), eased: 1 free, `AIM_FRICTION` on it. */
  private aimFriction = 1;
  private aimFrictionTarget = 1;

  /**
   * Aim friction for the stick and the finger (the mouse is exact enough): while the crosshair is on something that can
   * be clicked, the look turns at about half speed, so a 25 mm box spine is not overshot. Eased in and out (~150 ms).
   */
  setAimFriction(on: boolean): void {
    this.aimFrictionTarget = on ? AIM_FRICTION : 1;
  }

  /** Sets the absolute orientation (radians, YXZ). Pitch is clamped short of the poles, roll is zero. */
  setLook(yaw: number, pitch: number): void {
    this.lastPitch = THREE.MathUtils.clamp(pitch, -MAX_PITCH, MAX_PITCH);
    this.lookEuler.set(this.lastPitch, yaw, 0);
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
      const onLock = () => { cleanup(); resolve(true); };
      const onError = () => { cleanup(); resolve(false); };
      // The refused raw request's own `pointerlockerror` (queued after its promise's rejection) is not the plain one's.
      const onDocError = () => {
        if (this.rawErrorPending) this.rawErrorPending = false;
        else onError();
      };
      const cleanup = () => {
        this.controls.removeEventListener('lock', onLock);
        doc.removeEventListener('pointerlockerror', onDocError);
      };
      this.rawErrorPending = false;
      this.controls.addEventListener('lock', onLock);
      doc.addEventListener('pointerlockerror', onDocError);
      this.requestRawLock(onError);
    });
  }

  /** The browser refused raw mouse input once (`unadjustedMovement`): ask for a plain lock from then on. */
  private rawRefused = false;
  /** That refusal's `pointerlockerror` may still be on its way: it does not fail the plain lock asked for after it. */
  private rawErrorPending = false;

  /**
   * Asks for the lock with raw mouse input (no OS acceleration, none of Chrome's movement spikes), falling back to a
   * plain lock where that is not supported. Browsers without the promise form (Firefox ignores the option) lock plainly.
   */
  private requestRawLock(onError: () => void): void {
    const el = this.controls.domElement as HTMLElement;
    if (this.rawRefused) {
      void Promise.resolve(el.requestPointerLock()).catch(onError);
      return;
    }
    const raw = el.requestPointerLock({ unadjustedMovement: true }) as unknown as Promise<void> | undefined;
    raw?.catch?.((err: unknown) => {
      if ((err as { name?: string } | null)?.name !== 'NotSupportedError') return onError();
      this.rawRefused = true;
      this.rawErrorPending = true;
      void Promise.resolve(el.requestPointerLock()).catch(onError);
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
    this.seatMove = null;
    this.bobOffset.set(0, 0, 0);
    this.dip = 0;
    this.crouchToggled = false;
    this.velocity.set(0, 0, 0);
    this.groundSpeed = 0;
    this.feet = feet ?? (this.ground ? this.ground(x, z, this.feet) : 0);
    this.camera.position.set(x, this.feet + this.height, z);
  }

  /**
   * Moves the player `dy` straight up or down without a jolt: the walk, the bob and the ground's easing go on as if
   * nothing happened (a seamless wrap, the stairwell's endless stairs: the same flight a storey higher).
   */
  shiftVertically(dy: number): void {
    this.feet += dy;
    this.lastFloor += dy;
    this.camera.position.y += dy;
  }

  // --- Movement ---------------------------------------------------------------------------------

  update(dt: number): void {
    this.aimFriction = damp(this.aimFriction, this.aimFrictionTarget, AIM_FRICTION_RATE, dt);
    if (this.stepSeatMove(dt)) return;
    if (this.seated) return;
    if (!this.isLocked || !this._movementEnabled) {
      // Standing still (a menu, a panel, Esc), the floor may still move under the feet: the lift's car.
      this.clearBob();
      this.setSprintKick(0);
      this.sprintAmount = 0;
      this.groundSpeed = 0;
      this.followGround(dt);
      this.camera.position.y = this.feet + this.height;
      return;
    }
    // The bob of the last frame comes off before moving (the collisions see the body, not the eye's sway).
    this.camera.position.sub(this.bobOffset);

    // WASD (QWERTY) and ZQSD (AZERTY) both work because we read physical key codes.
    // A gamepad stick / touch joystick feeds the same codes with fractional strengths.
    const strafe = this.input.axis(ACTIONS.left.codes, ACTIONS.right.codes);
    const advance = this.input.axis(ACTIONS.back.codes, ACTIONS.forward.codes);
    if (advance <= 0) this.sprintLatched = false; // letting go of forward ends the sprint
    const crouch = this.isCrouching;
    const sprint = this.isSprinting;

    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.crossVectors(this.forward, this.camera.up).normalize();

    // The sprint comes and goes over a moment (the speed and the wider view together).
    this.sprintAmount = damp(this.sprintAmount, sprint && (advance !== 0 || strafe !== 0) ? 1 : 0, SPRINT_EASE, dt);
    const speed = this.walkSpeed * this.pace * (crouch ? this.crouchMultiplier : 1 + (this.sprintMultiplier - 1) * this.sprintAmount);
    this.target
      .set(0, 0, 0)
      .addScaledVector(this.forward, advance)
      .addScaledVector(this.right, strafe);
    // Keys give unit (or diagonal) input, clamped to full speed; a half-tilted stick walks slower.
    if (this.target.lengthSq() > 1) this.target.normalize();
    // Going up a flight is slower than the flat: the floor a stride ahead is a tread higher (eased, so landings do not jerk).
    let climbing = false;
    if (this.ground && this.target.lengthSq() > 0.01) {
      const ahead = this.ground(this.camera.position.x + this.target.x * CLIMB.probe, this.camera.position.z + this.target.z * CLIMB.probe, this.feet);
      climbing = ahead - this.feet > CLIMB.rise;
    }
    this.climbFactor = damp(this.climbFactor, climbing ? CLIMB.factor : 1, CLIMB.ease, dt);
    this.target.multiplyScalar(speed * this.climbFactor);

    // Exponential smoothing gives a bit of acceleration/deceleration without a full physics step:
    // a gentle start, a quicker stop (slowing down, or turning back against the way the body goes).
    const braking = this.target.lengthSq() < this.velocity.lengthSq() || this.target.dot(this.velocity) < 0;
    this.velocity.lerp(this.target, dampFactor(braking ? DECEL : ACCEL, dt));

    const fromX = this.camera.position.x;
    const fromZ = this.camera.position.z;
    this.moveAxis('x', this.velocity.x * dt);
    this.moveAxis('z', this.velocity.z * dt);
    // What the body really covered (a wall stops it whatever the keys say), eased over a few frames.
    const moved = dt > 0 ? Math.hypot(this.camera.position.x - fromX, this.camera.position.z - fromZ) / dt : 0;
    this.groundSpeed = damp(this.groundSpeed, moved, 12, dt);

    this.followGround(dt);

    // Crouching eases the eye down and back up rather than snapping.
    const targetHeight = crouch ? this.crouchHeight : this.eyeHeight;
    this.height = damp(this.height, targetHeight, 10, dt);
    this.camera.position.y = this.feet + this.height;
    // The wider view follows the speed really reached past a walk (none against a wall), off with reduced motion or no head bob.
    const pastWalk = THREE.MathUtils.clamp((this.groundSpeed / (this.walkSpeed * this.pace) - 1) / (this.sprintMultiplier - 1), 0, 1);
    const kickOn = this.feel.headBob && !reduceMotion();
    this.setSprintKick(kickOn ? Math.min(this.sprintAmount, pastWalk) * SPRINT_FOV : 0);
    this.applyBob(dt, crouch);
  }

  /** The sprint's wider view, written only when it changes (photo mode and the settings own the rest of the FOV). */
  private setSprintKick(kick: number): void {
    const rounded = Math.round(kick * 100) / 100;
    if (rounded === this.appliedKick) return;
    this.camera.fov += rounded - this.appliedKick;
    this.appliedKick = rounded;
    this.camera.updateProjectionMatrix();
  }

  /** A few millimetres of rise with each step, a little sway at a sprint, and the dip of a step down. */
  private applyBob(dt: number, crouch: boolean): void {
    this.dip *= Math.exp(-DIP_RECOVER * dt);
    const speed = this.groundSpeed;
    this.bobPhase = (this.bobPhase + (speed / STRIDE) * Math.PI * 2 * dt) % (Math.PI * 4);
    const on = this.feel.headBob && !crouch && !reduceMotion();
    // A bump each step round the eye's own height (|sin| averages 2/π), a sway each stride.
    const rise = on ? (Math.abs(Math.sin(this.bobPhase)) - 2 / Math.PI) * speed * BOB_PER_SPEED : 0;
    const sway = on ? Math.sin(this.bobPhase) * SPRINT_SWAY * this.sprintAmount : 0;
    this.bobOffset.set(this.right.x * sway, rise - this.dip, this.right.z * sway);
    this.camera.position.add(this.bobOffset);
  }

  /** Takes the bob off the eye (sitting, a panel, a teleport). */
  private clearBob(): void {
    this.camera.position.sub(this.bobOffset);
    this.bobOffset.set(0, 0, 0);
    this.dip = 0;
  }

  /** The feet follow the floor (stairs, the lift's car), a little eased so each step does not jolt the eye. */
  private followGround(dt: number): void {
    if (!this.ground) return;
    const floor = this.ground(this.camera.position.x, this.camera.position.z, this.feet);
    const drop = this.feet - floor;
    // Stepping down a stair: the eye dips a touch below the eased feet, then comes back. Once per tread (the frame
    // the floor itself steps down), so the dip does not depend on the frame rate.
    // A floor that moves frame after frame is a lift's car: the feet ride it exactly, with no dip (a tread
    // steps down in one frame, the frames around it still). Whatever the frame rate.
    const stepped = this.lastFloor - floor;
    const moving = Math.abs(stepped) > 1e-4;
    const riding = moving && this.floorMoving && Math.abs(stepped) <= SNAP;
    this.floorMoving = moving;
    this.ridingFloor = riding;
    this.lastFloor = floor;
    if (!riding && stepped > 0.05 && stepped <= SNAP && drop <= SNAP && this.feel.headBob && !reduceMotion()) this.dip = Math.min(STEP_DIP, this.dip + stepped * 0.12);
    if (riding) this.feet = floor;
    else this.feet = Math.abs(floor - this.feet) > SNAP ? floor : damp(this.feet, floor, 18, dt);
  }

  private moveAxis(axis: 'x' | 'z', delta: number): void {
    if (delta === 0) return;
    this.candidate.copy(this.camera.position);
    this.candidate[axis] += delta;

    // Test collision at waist height so the shelf's overhang does not matter. A player already
    // inside a collider (a door shut on them) is let through, so they can never be stuck.
    if (this.blockedAt(this.candidate) && !this.blockedAt(this.camera.position)) {
      // On the very corner of a door frame: a little to one side the way is open, so the body slips round it
      // (a flat wall is blocked on both sides and stops as before).
      if (this.slipRound(axis, delta)) return;
      // Close the gap with half the step, and bleed half the blocked axis's speed each frame: brushing past a
      // corner of furniture barely slows the walk, pushing into a wall stops the body (and its bob) quickly.
      this.velocity[axis] *= 0.5;
      this.candidate[axis] = this.camera.position[axis] + delta / 2;
      if (!this.blockedAt(this.candidate)) this.camera.position[axis] = this.candidate[axis];
      return;
    }
    this.camera.position[axis] = this.candidate[axis];
  }

  /**
   * Blocked going `delta` along `axis`: tries the same step shifted sideways by one or two and a half
   * steps' worth; if exactly one side is open, moves there (half the sideways shift, so it eases round).
   */
  private slipRound(axis: 'x' | 'z', delta: number): boolean {
    const side = axis === 'x' ? 'z' : 'x';
    const step = Math.abs(delta);
    for (const reach of [step, step * 2.5]) {
      let open = 0;
      let way = 0;
      for (const sign of [1, -1]) {
        this.candidate.copy(this.camera.position);
        this.candidate[axis] += delta;
        this.candidate[side] += sign * reach;
        if (!this.blockedAt(this.candidate)) {
          open++;
          way = sign;
        }
      }
      if (open !== 1) continue;
      this.candidate.copy(this.camera.position);
      this.candidate[side] += way * reach * 0.5;
      if (this.blockedAt(this.candidate)) return false;
      this.camera.position[side] = this.candidate[side];
      return true;
    }
    return false;
  }

  /**
   * The body is a sphere tested at two heights: the knees, so low furniture (a bed, a bath, a side
   * table) blocks the way, and the waist, so a shelf's overhang or a worktop does not need a
   * collider down to the floor.
   */
  private blockedAt(position: THREE.Vector3): boolean {
    this.probe.set(position.x, this.feet + KNEE_HEIGHT, position.z);
    if (this.collisions.intersectsSphere(this.probe, this.bodyRadius)) return true;
    this.probe.y = this.feet + this.eyeHeight * 0.6;
    return this.collisions.intersectsSphere(this.probe, this.bodyRadius);
  }
}
