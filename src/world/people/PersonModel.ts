import * as THREE from 'three';
import { ANKLE_Y, HEAD_Y, NECK_PIVOT, PELVIS_Y, SHIN_L, THIGH_L } from './body';
import { POSES, type ArmAngles, type Pose } from './poses';
import { heldMesh, hoodMesh, UMBRELLA_ARM, type Held } from './held';
import type { PersonLook } from './looks';
import type { Performer, Reaction } from './performer';
import { buildRig, type ArmBones, type Rig } from './rig';
import { Face } from './motion/face';
import { Footing } from './motion/footing';
import { Gait } from './motion/gait';
import { GesturePlayer, type FaceKey, type GestureName } from './motion/gestures';
import { ankleOver, orientFoot, solveArm, solveLeg, type ArmSolution } from './motion/ik';
import { idleFidget, respond, type Context } from './motion/repertoire';
import { Spring, smooth, spring } from './motion/springs';
import { seedOfLook, temperamentOf, type Temperament } from './motion/temperament';
import { seededRandom } from '@/covers/generated/canvasUtils';

/*
 * A person at real scale (`rig.ts` builds the body: a pelvis, a lower back and a chest the trunk
 * bends with, collarbones, arms to the wrists, hands that curl, legs, a face with expressions),
 * moved the way a body moves. Every frame, in layers:
 *
 * - the stance: feet planted on the floor (`Footing`: they stay put while the body turns, shifts or
 *   crouches over them, and step when they have to) or walking (`Gait`: heel strike to push-off,
 *   the pelvis turning, dropping and swaying with the legs); the legs solved to reach the feet (IK),
 *   the pelvis lowered as far as the standing leg needs (so a walk rises and falls as people's do);
 *   the weight on one leg for a while, then the other, the free knee easing;
 * - the back: a lean spread over the pelvis, the lower back and the chest, the person's own slouch,
 *   the shoulders sharing a wide turn of the head, the chest turning against the hips as they walk;
 * - the arms: a pose, hands on world points (a machine's controls: solved to reach them), or a
 *   gesture's keys, every joint on a spring (the wrist and the fingers quicker than the shoulder,
 *   so a hand trails its arm), the collarbone lifting with a raised arm, the swing of a walk, the
 *   hands coming up with the words while talking;
 * - gestures (`gestures.ts`): reactions to what happens (`react`), fidgets when idle (a scratch, a
 *   look at the watch), each in the person's own tempo and measure (`Temperament`);
 * - the head: a damped spring onto the gaze target, the eyes leading it; nods;
 * - the face (`Face`): expressions, speech, blinks and lids;
 * - what hangs and swings: a ponytail, a bag.
 *
 * Given the viewer, a person far from it (beyond `LOD_FAR`, until back within `LOD_NEAR`, both
 * scaled by the camera's zoom) hides what is under a pixel there (the eyes and lids, the bowls of
 * the ears), lets the face and what swings rest, and animates the rest at `FAR_RATE` with the time
 * it skipped.
 */

/** How long the gait takes to come in from standing, or to settle back (s). */
const GAIT_S = 0.25;
/** How fast the hips come down onto a seat (per second): slower than the legs fold, so no thigh goes through the cushion. */
const SEAT_RATE = 3.2;
/** How far the neck turns the head (radians), standing and walking (a walker keeps their eyes on the way). */
const MAX_YAW = 1;
const MAX_YAW_WALKING = 0.7;
const MAX_PITCH = 0.55;
/** How far the eyes turn in their sockets beyond the head. */
const EYE_YAW = 0.38;
const EYE_PITCH = 0.25;
/** The head's spring stiffness (rad/s); the eyes settle at `EYE_RATE` per second, ahead of it. */
const GAZE_OMEGA = 8;
const EYE_RATE = 22;
/** The arms' springs (rad/s): shoulders, elbows (a little behind), wrists and fingers (quick); hands on moving controls follow stiffly. */
const ARM_OMEGA = 9;
const ELBOW_OMEGA = 8;
const HAND_OMEGA = 13;
const REACH_OMEGA = 22;
/** Standing, a turn of the head wider than `TWIST_FROM` (radians) is shared with the shoulders: this much of the rest, at most `TWIST_MAX`. */
const TWIST_FROM = 0.45;
const TWIST_SHARE = 0.55;
const TWIST_MAX = 0.4;
/** A shift of the head's goal wider than this (radians) comes with a blink, this often. */
const SHIFT_BLINK = 0.32;
const SHIFT_BLINK_CHANCE = 0.55;
/** A nod of acknowledgement: how long (s) and how deep (radians). */
const NOD_S = 0.75;
const NOD_DEPTH = 0.14;
/** Standing, the weight rests on one leg or the other, the hips over it by this much (metres), changing every few seconds. */
const WEIGHT_SHIFT = 0.028;
const WEIGHT_EVERY: readonly [number, number] = [4, 11];
/** A deep crouch lowers the hips this far (reference metres); up on the toes raises them this far. */
const CROUCH_DROP = 0.3;
const RISE_LIFT = 0.05;
/** The leg is never quite straight (a standing knee is soft): the hips come down to within this share of its reach. */
const LEG_REACH = 0.992;
const WALK_REACH = 0.978;
/** The lean's share at the pelvis, the lower back and the chest. */
const LEAN_SHARE = [0.3, 0.4, 0.3] as const;
/** The chest's middle (the trunk mesh's parent's frame, the pelvis's), about which a breath fills it. */
const CHEST_CENTRE = new THREE.Vector3(0, 1.26 - PELVIS_Y, 0.02);
/** The eyes above the neck pivot, in the head's frame: gaze angles are measured from there. */
const EYES_ABOVE_PIVOT = HEAD_Y + 0.014 - NECK_PIVOT.y;
/** Beyond this far from the viewer (metres) a person goes to the far level of detail; back within `LOD_NEAR`, to the near one. */
const LOD_FAR = 16;
const LOD_NEAR = 14;
/** The details (eyes, inner ears) dither out between these distances (alpha hash), not all at once. */
const DETAIL_FADE = [LOD_NEAR, LOD_FAR] as const;
/** Rig updates per second at the far level of detail. */
const FAR_RATE = 15;
/** Those distances hold at the default field of view (70 degrees); a narrower one (photo mode's zoom) brings the far level of detail further out. */
const REFERENCE_TAN = Math.tan(THREE.MathUtils.degToRad(70) / 2);

export class PersonModel extends THREE.Group implements Performer {
  readonly hitbox: THREE.Object3D;
  /** Eye height in world metres once scaled, for whoever wants to be looked at. */
  readonly eyeHeight: number;

  private readonly rig: Rig;
  private readonly face: Face;
  private readonly gait = new Gait();
  private readonly footing = new Footing();
  private readonly gestures = new GesturePlayer();
  private readonly temper: Temperament;
  private readonly random: () => number;
  private readonly look: PersonLook;

  private pose: Pose = 'stand';
  private speed = 0;
  /** How much of the gait shows, 0 standing .. 1 walking, eased over `GAIT_S`. */
  private gaitIn = 0;
  private wasMoving = false;
  /** Seconds left of talking (`talk`). */
  private talking = 0;
  private time = Math.random() * 100;

  // The director's asks (`lean`, `crouch`, ...) and the springs that ease the body onto them.
  private leanAngle = 0;
  private crouchAmount = 0;
  private riseAmount = 0;
  private readonly spineSpring = new Spring(0, 6, 0.9);
  private readonly crouchSpring = new Spring(0, 7, 0.75);
  private readonly riseSpring = new Spring(0, 12, 0.8);
  private readonly hipsSpring = new Spring(0, 12, 0.8);
  private readonly shrugSprings = [new Spring(0, 10, 0.8), new Spring(0, 10, 0.8)];
  private readonly armSprings: Record<'ux' | 'uz' | 'lx' | 'ly' | 'lz' | 'wf' | 'tw' | 'curl', Spring>[];
  /** The last drop of the hips the standing legs needed (eased up, never down, so a foot never floats). */
  private drop = 0;

  private target: THREE.Vector3 | null = null;
  /** Where a machine's director has the eyes go, over the `gaze` target (`eyesOn`). */
  private directedGaze: THREE.Vector3 | null = null;
  private yaw = 0;
  private pitch = 0;
  private yawVelocity = 0;
  private pitchVelocity = 0;
  private lastGoalYaw = 0;
  private lastGoalPitch = 0;
  /** The shoulders' share of a wide turn of the head, as a spring. */
  private twist = 0;
  private twistVelocity = 0;
  private eyeYaw = 0;
  private eyePitch = 0;
  private saccadeIn = 0;
  private readonly saccade = new THREE.Vector2();
  private nodding = 0;
  /** Standing, where the weight is (-1 on the -x leg .. 1 on the +x leg), as a spring towards `weightGoal`, changed every so often. */
  private weight = 0;
  private weightVelocity = 0;
  private weightGoal = 0;
  private weightIn = 2 + Math.random() * 6;
  /** Per arm, how far a hand is raised in a gesture while talking (eased to the goal), and when the goals change. */
  private readonly beat = [0, 0];
  private readonly beatGoal = [0, 0];
  private beatIn = 0;
  /** Seconds until the next idle fidget. */
  private fidgetIn: number;
  /** This person's own slow drifts (frequencies, rad/s, and phases): no two sway alike. */
  private readonly drifts = Array.from({ length: 4 }, () => [0.17 + Math.random() * 0.2, 0.47 + Math.random() * 0.4, Math.random() * 6.3, Math.random() * 6.3] as const);

  /** World points the palms are on (a joystick, a flipper button, a ball), per arm; null: the pose decides. */
  private readonly reachTargets: [THREE.Vector3 | null, THREE.Vector3 | null] = [null, null];
  /** A director's hands: curl and wrist flex per hand, over the pose's; null: the pose's. */
  private handCurl: [number, number] | null = null;
  private handFlex: [number, number] = [0.15, 0.15];
  /** Feet a director has put somewhere (world), per foot. */
  private readonly footTargets: [THREE.Vector3 | null, THREE.Vector3 | null] = [null, null];
  /** Seat height (metres over the floor) while sitting, else null: standing. */
  private seatHeight: number | null = null;
  /** How far down onto the seat the hips are (0 standing .. 1 seated), and the last seat's height (to rise from). */
  private seatBlend = 0;
  private lastSeat = 0.45;

  /** The materials `setOpacity` fades and their own opacity, once `enableFade` has run. */
  private fading: { material: THREE.Material; opacity: number }[] | null = null;
  private opacity = 1;
  private detailLevel = 1;
  private readonly viewer: THREE.Object3D | null;
  private far = false;
  private pending = 0;
  private held: Held | null = null;
  private readonly heldMeshes = new Map<Held | 'hood', THREE.Object3D>();

  // What hangs and swings: angles and speeds of the ponytail and the bag, and where they were.
  private readonly swing = { tail: [0, 0, 0, 0], bag: [0, 0, 0, 0] };
  private readonly lastAnchor = { tail: new THREE.Vector3(), bag: new THREE.Vector3() };
  private readonly lastVelocity = { tail: new THREE.Vector3(), bag: new THREE.Vector3() };
  private swingPrimed = false;

  private readonly scratch = new THREE.Vector3();
  private readonly viewerPos = new THREE.Vector3();
  private readonly here = new THREE.Vector3();
  private readonly pelvisQ = new THREE.Quaternion();
  private readonly invPelvisQ = new THREE.Quaternion();
  private readonly worldQ = new THREE.Quaternion();
  private readonly solution: ArmSolution = { ux: 0, uz: 0, lx: 0, ly: 0 };
  private readonly armTarget: Required<ArmAngles> = { ux: 0, uz: 0, lx: 0, ly: 0, lz: 0, wf: 0, tw: 0, curl: 0 };
  private readonly ankles = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly flats = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly spots = [
    { at: new THREE.Vector3(), yaw: 0 },
    { at: new THREE.Vector3(), yaw: 0 },
  ];
  private readonly hipAt = new THREE.Vector3();
  private readonly accel = new THREE.Vector3();
  private readonly toLocal = (p: THREE.Vector3): THREE.Vector3 => this.worldToLocal(p).divideScalar(this.rig.scale);
  private readonly toWorld = (p: THREE.Vector3): THREE.Vector3 => this.localToWorld(p.multiplyScalar(this.rig.scale));

  /** `viewer` (the camera), when given, sets the level of detail by distance; `seed` the way they move (default: from the look). */
  constructor(look: PersonLook, viewer?: THREE.Object3D, seed?: number) {
    super();
    this.name = 'PersonModel';
    this.viewer = viewer ?? null;
    this.look = look;
    const s = seed ?? seedOfLook(look);
    this.temper = temperamentOf(s, look);
    this.random = seededRandom(s * 2654435761 + 7);
    this.fidgetIn = this.temper.fidgetEvery * (0.4 + Math.random());
    this.rig = buildRig(look);
    this.add(this.rig.root);
    this.hitbox = this.rig.hitbox;
    this.add(this.hitbox);
    this.eyeHeight = this.rig.eyeHeight;
    this.face = new Face(this.rig.face, this.rig.morphs, this.rig.eyes, 0.03 + Math.random() * 0.05);
    this.armSprings = this.rig.arms.map((arm) => {
      const c = arm.current;
      const make = (value: number, omega: number, zeta = 0.9): Spring => new Spring(value, omega, zeta);
      return {
        ux: make(c.ux, ARM_OMEGA),
        uz: make(c.uz, ARM_OMEGA),
        lx: make(c.lx, ELBOW_OMEGA, 0.8),
        ly: make(c.ly, ELBOW_OMEGA, 0.8),
        lz: make(c.lz, ELBOW_OMEGA, 0.8),
        wf: make(0, HAND_OMEGA, 0.7),
        tw: make(0, HAND_OMEGA, 0.8),
        curl: make(0, HAND_OMEGA, 0.8),
      };
    });
  }

  // --- What the owner asks for ----------------------------------------------------------------

  /** Walking speed in m/s; 0 stands still (the feet then stay planted and step when they must). Drives the gait only, moving the model is the owner's job. */
  setSpeed(speed: number): void {
    this.speed = Math.max(0, speed);
  }

  /** Talking for `seconds`: the jaw on the syllables, small nods, the hands with the words. */
  talk(seconds: number): void {
    this.talking = Math.max(this.talking, seconds);
  }

  /** A small nod of acknowledgement (meeting someone's eyes, a greeting). */
  nod(): void {
    if (this.nodding <= 0) this.nodding = NOD_S;
  }

  /** What the arms do while standing; walking always swings them. */
  setPose(pose: Pose): void {
    this.pose = pose;
  }

  /** The gesture under way, if any (a reaction, a fidget). */
  get gesturing(): GestureName | null {
    return this.gestures.name;
  }

  /** Plays a gesture now, over whatever they do (in their own tempo). */
  gesture(name: GestureName): void {
    this.gestures.play(name, this.temper.tempo);
  }

  /** Shows a feeling on the face for `seconds`. */
  feel(expression: FaceKey, seconds: number): void {
    this.face.feel(expression, seconds);
  }

  /** Something happened to them: they show it in their own way (a gesture, a face, a nod). */
  react(reaction: Reaction): void {
    const response = respond(reaction, this.context(), this.random);
    if (response.gesture) this.gesture(response.gesture);
    this.face.feel(response.face, response.seconds);
    if (response.nod) this.nod();
    this.fidgetIn = Math.max(this.fidgetIn, 4);
  }

  /**
   * Puts the hands on two world points (the controls of a machine) while standing: each arm is
   * solved to reach its point, the elbows falling out and down; a point out of reach gets a
   * straight arm towards it. Whichever point is on a hand's side goes to that hand. Null: back to the pose.
   */
  reach(points: readonly [THREE.Vector3, THREE.Vector3] | null): void {
    if (!points) {
      this.reachTargets[0] = this.reachTargets[1] = null;
      return;
    }
    const [a, b] = points;
    const aLocal = this.worldToLocal(this.scratch.copy(a)).x;
    const bLocal = this.worldToLocal(this.scratch.copy(b)).x;
    const [low, high] = aLocal <= bLocal ? [a, b] : [b, a];
    (this.reachTargets[0] ??= new THREE.Vector3()).copy(low);
    (this.reachTargets[1] ??= new THREE.Vector3()).copy(high);
  }

  reachEach(left: THREE.Vector3 | null, right: THREE.Vector3 | null): void {
    for (const [i, point] of [left, right].entries()) {
      if (point) (this.reachTargets[i] ??= new THREE.Vector3()).copy(point);
      else this.reachTargets[i] = null;
    }
  }

  crouch(amount: number): void {
    this.crouchAmount = THREE.MathUtils.clamp(amount, 0, 1);
  }

  rise(amount: number): void {
    this.riseAmount = THREE.MathUtils.clamp(amount, 0, 1);
  }

  hands(curl: readonly [number, number] | null, flex?: readonly [number, number]): void {
    this.handCurl = curl ? [curl[0], curl[1]] : null;
    this.handFlex = flex ? [flex[0], flex[1]] : [0.15, 0.15];
  }

  eyesOn(point: THREE.Vector3 | null): void {
    if (point) (this.directedGaze ??= new THREE.Vector3()).copy(point);
    else this.directedGaze = null;
  }

  standOn(height: number): void {
    this.rig.root.position.y = height;
  }

  release(): void {
    this.reachTargets[0] = this.reachTargets[1] = null;
    this.footTargets[0] = this.footTargets[1] = null;
    this.crouchAmount = this.riseAmount = 0;
    this.handCurl = null;
    this.handFlex = [0.15, 0.15];
    this.directedGaze = null;
    this.rig.root.position.y = 0;
  }

  footAt(foot: 0 | 1, point: THREE.Vector3 | null): void {
    if (point) (this.footTargets[foot] ??= new THREE.Vector3()).copy(point);
    else this.footTargets[foot] = null;
  }

  palm(hand: 0 | 1, out: THREE.Vector3): THREE.Vector3 {
    const wrist = this.rig.arms[hand].wrist;
    wrist.updateWorldMatrix(true, false);
    return wrist.localToWorld(out.set(0, -this.rig.palm, 0));
  }

  /**
   * Something in the right hand: a phone (pair it with the `phone` pose), an open book (`read`),
   * an umbrella over the head (the arm holds it up even while walking); null: empty-handed.
   */
  hold(item: Held | null): void {
    if (item === this.held) return;
    if (this.held) this.heldMeshes.get(this.held)!.visible = false;
    this.held = item;
    if (!item) return;
    let mesh = this.heldMeshes.get(item);
    if (!mesh) {
      const seed = Math.round(this.look.height * 1000);
      mesh = heldMesh(item, seed);
      (item === 'umbrella' ? this.rig.torso : this.rig.arms[1].wrist).add(mesh);
      this.adoptFade(mesh);
      this.heldMeshes.set(item, mesh);
    }
    mesh.visible = true;
  }

  /** The hood up over the head (in the snow) or down. */
  setHood(up: boolean): void {
    let hood = this.heldMeshes.get('hood');
    if (!up && !hood) return;
    if (!hood) {
      hood = hoodMesh(this.look.top === 'jacket' ? this.look.topAccent : this.look.topColor);
      this.rig.head.add(hood);
      this.adoptFade(hood);
      this.heldMeshes.set('hood', hood);
    }
    hood.visible = up;
  }

  /** Leans the upper body forward by `angle` radians while standing (over a pinball, a control panel), spread down the back. */
  lean(angle: number): void {
    this.leanAngle = angle;
  }

  /**
   * Sits on a seat `height` metres over the floor (thighs level, shins hanging, the body lowered
   * so the seat is under it; the origin is where the seat's back edge is), or stands again (null).
   * Walking always stands; pair it with a pose for the arms (`lap`).
   */
  sit(height: number | null): void {
    this.seatHeight = height;
    if (height !== null) this.lastSeat = height;
    else this.footing.reset();
  }

  /** World point the head turns towards, or null to look ahead (with idle glances). */
  gaze(target: THREE.Vector3 | null): void {
    if (!target) {
      this.target = null;
      return;
    }
    (this.target ??= new THREE.Vector3()).copy(target);
  }

  /**
   * Makes the whole person fadeable (`setOpacity`): every visible material dithers by its opacity
   * (alpha hash, so no sorting). Call it once, early (it changes the shader programs).
   */
  enableFade(): void {
    if (this.fading) return;
    const list: { material: THREE.Material; opacity: number }[] = [];
    const seen = new Set<THREE.Material>();
    this.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh === this.hitbox) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!material.visible || seen.has(material)) continue;
        seen.add(material);
        if (!material.transparent) material.alphaHash = true;
        list.push({ material, opacity: material.opacity });
      }
    });
    this.fading = list;
  }

  /** 0 gone .. 1 solid, after `enableFade` (a no-op before). */
  setOpacity(opacity: number): void {
    if (!this.fading) return;
    this.opacity = opacity;
    for (const f of this.fading) f.material.opacity = f.opacity * opacity * (this.rig.detailMaterials.has(f.material) ? this.detailLevel : 1);
    // The trunk's own shadow materials do not dither: it stops casting a shadow as it fades.
    this.rig.trunk.castShadow = opacity > 0.5;
  }

  update(dt: number): void {
    if (this.viewer) this.pickDetail(this.viewer);
    this.pending += dt;
    if (this.far && this.pending < 1 / FAR_RATE) return;
    const step = Math.min(0.25, this.pending);
    this.pending = 0;
    this.animate(step);
  }

  // --- Level of detail and fading -------------------------------------------------------------

  /** A part added after `enableFade` fades with the rest. */
  private adoptFade(object: THREE.Object3D): void {
    if (!this.fading) return;
    const current = this.opacity;
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.Material;
      material.alphaHash = true;
      this.fading!.push({ material, opacity: material.opacity });
      material.opacity *= current;
    });
  }

  /** Near or far from `viewer`, with some slack both ways so it does not flicker at the edge. */
  private pickDetail(viewer: THREE.Object3D): void {
    viewer.getWorldPosition(this.viewerPos);
    const distance = this.getWorldPosition(this.here).distanceTo(this.viewerPos) / magnification(viewer);
    this.fadeDetails(1 - THREE.MathUtils.smoothstep(distance, DETAIL_FADE[0], DETAIL_FADE[1]));
    this.far = distance > (this.far ? LOD_NEAR : LOD_FAR);
  }

  /** The details at `level` (0..1): dithered by their materials' opacity, hidden (not drawn) at 0. */
  private fadeDetails(level: number): void {
    if (level === this.detailLevel) return;
    this.detailLevel = level;
    for (const detail of this.rig.details) detail.visible = level > 0;
    for (const [material, opacity] of this.rig.detailMaterials) material.opacity = opacity * this.opacity * level;
  }

  // --- A frame of the body --------------------------------------------------------------------

  private animate(dt: number): void {
    this.time += dt;
    const t = this.time;
    const tempo = this.temper.tempo;
    const rig = this.rig;
    this.updateWorldMatrix(true, false);
    const bodyYaw = worldYaw(this.getWorldQuaternion(this.worldQ));

    // The gait comes in and settles over `GAIT_S`; its feet are left where they are when it stops.
    const moving = this.speed > 0.02;
    if (moving && !this.wasMoving && this.gaitIn === 0) this.gait.phase = 0.62;
    if (!moving && this.wasMoving) this.footing.follow(this.gait.feet, this.toWorld, bodyYaw);
    this.wasMoving = moving;
    this.gaitIn = moving ? Math.min(1, this.gaitIn + dt / GAIT_S) : Math.max(0, this.gaitIn - dt / GAIT_S);
    const w = smooth(this.gaitIn);
    const walking = w > 0;
    // The gait lays the feet out in the rig's own (reference) metres: the speed too.
    if (moving) this.gait.update(dt, this.speed / rig.scale, this.look.build);
    const seated = !walking && this.seatHeight !== null;
    const standing = !walking && !seated;
    const talk = this.talking > 0 ? Math.min(1, this.talking / 0.3) : 0;
    this.talking = Math.max(0, this.talking - dt);
    const reaching = !moving && (this.reachTargets[0] !== null || this.reachTargets[1] !== null);

    // Gestures: what plays, and a fidget now and then when idle.
    this.fidgetIn -= dt;
    if (this.fidgetIn <= 0) {
      this.fidgetIn = this.temper.fidgetEvery * (0.5 + this.random());
      if (!walking && !talk && !this.gestures.playing) {
        const fidget = idleFidget(this.context(), this.random);
        if (fidget) this.gesture(fidget);
      }
    }
    const g = this.gestures.update(dt);

    // Weight on one leg for a while, then the other (or both).
    this.weightIn -= dt;
    if (this.weightIn <= 0) {
      this.weightIn = THREE.MathUtils.lerp(WEIGHT_EVERY[0], WEIGHT_EVERY[1], this.random());
      const roll = this.random();
      this.weightGoal = roll < 0.2 ? 0 : (roll < 0.6 ? -1 : 1) * (0.6 + this.random() * 0.4);
    }
    const stepping = this.footing.stepping;
    // While a foot steps the weight is on the other one.
    const weightGoal = !standing ? 0 : stepping >= 0 ? (stepping === 0 ? 1 : -1) : reaching ? this.weightGoal * 0.4 : this.weightGoal;
    [this.weight, this.weightVelocity] = spring(this.weight, this.weightVelocity, weightGoal, stepping >= 0 ? 7 : 2.6, dt);

    // The back, the knees, the toes, the hips: the director's asks, the gesture's, the person's own carriage.
    const slouch = this.temper.slouch;
    const spine = this.spineSpring.step(
      (seated ? this.leanAngle : this.leanAngle * (1 - w)) + g.spine + slouch * 0.1 + 0.05 * w * this.gait.amount + (reaching ? 0.03 : 0),
      dt,
      6 * tempo,
    );
    const crouch = this.crouchSpring.step(seated ? 0 : this.crouchAmount * (1 - w) + g.crouch, dt, 7 * tempo);
    const rise = this.riseSpring.step(seated || walking ? 0 : this.riseAmount + g.rise, dt, 12 * tempo);
    const hips = this.hipsSpring.step(g.hips, dt);

    // Pelvis: turned, tilted and swayed by the gait, shifted over the standing leg, lowered by a crouch, back as the body bends.
    const pelvis = rig.pelvis;
    const pelvisPitch = spine * LEAN_SHARE[0] + (walking ? 0.03 * w : 0);
    const pelvisYaw = this.gait.pelvisYaw * w;
    const pelvisRoll = this.gait.pelvisRoll * w + 0.045 * this.weight * (1 - w);
    const scale = rig.scale;
    // Down onto a seat slower than the legs fold (no thigh through the cushion); up from it with the legs pushing (solved to the planted feet).
    this.seatBlend += ((seated ? 1 : 0) - this.seatBlend) * Math.min(1, dt * SEAT_RATE);
    const sat = this.seatBlend;
    pelvis.position.set(
      (this.gait.sway * w + WEIGHT_SHIFT * this.weight * (1 - w)) * (1 - sat),
      THREE.MathUtils.lerp(PELVIS_Y + rise * RISE_LIFT - crouch * CROUCH_DROP, (this.lastSeat + 0.07) / scale, sat),
      THREE.MathUtils.lerp(-0.16 * Math.sin(Math.max(0, spine - 0.05)) - 0.1 * crouch + hips, 0.12 / scale, sat),
    );
    if (seated) pelvis.rotation.set(-0.06 + spine * 0.2, this.drift(t, 0) * 0.02, 0, 'YXZ');
    else pelvis.rotation.set(pelvisPitch * (1 - sat) + (-0.06 + spine * 0.2) * sat, pelvisYaw, pelvisRoll * (1 - sat), 'YXZ');
    this.pelvisQ.copy(pelvis.quaternion);

    // The back: the lean shared down it, the chest turning against the hips as they walk and with a wide turn of the head.
    const drift0 = this.drift(t, 0);
    const drift1 = this.drift(t, 1);
    rig.lumbar.rotation.set(spine * LEAN_SHARE[1] + slouch * 0.04, this.twist * 0.35 - pelvisYaw * 0.4, -pelvisRoll * 0.35, 'YXZ');
    rig.chest.rotation.set(
      spine * LEAN_SHARE[2] + slouch * 0.08 + (standing ? drift1 * 0.012 : 0),
      this.twist * 0.65 + g.twist - pelvisYaw * 0.55 + (walking ? 0 : drift0 * 0.03),
      -pelvisRoll * 0.3 + talk * Math.sin(t * 2.3) * 0.015,
      'YXZ',
    );
    const breath = Math.sin(t * (1.5 + 0.3 * tempo)) * 0.012 * (1 + 0.5 * w);
    rig.spine.update(rig.lumbar, rig.chest, rig.trunk.position, breath, CHEST_CENTRE);

    // Legs: seated they fold on the seat; otherwise the feet, planted or walking, and the legs solved to reach them.
    if (seated) this.seatLegs(dt);
    else this.standLegs(dt, w, bodyYaw, tempo);

    // Talking with the arms free, the hands come up with the words now and then.
    const beats = talk > 0 && standing && !reaching && this.pose === 'stand' && !this.held && !this.gestures.playing;
    this.beatIn -= dt;
    if (this.beatIn <= 0) {
      this.beatIn = 0.5 + this.random() * 1.1;
      const main = this.random() < 0.65 ? 1 : 0;
      this.beatGoal[main] = beats && this.random() < 0.75 ? (0.35 + this.random() * 0.65) * this.temper.energy : 0;
      this.beatGoal[1 - main] = beats && this.random() < 0.3 ? (0.3 + this.random() * 0.5) * this.temper.energy : 0;
    }
    if (!beats) this.beatGoal[0] = this.beatGoal[1] = 0;

    // Arms, hands, collarbones.
    for (const [i, arm] of rig.arms.entries()) this.moveArm(i, arm, dt, t, w, moving, standing, talk, tempo);

    this.moveHead(dt, t, walking, seated, reaching, talk, g.head, g.ownGaze);

    if (this.far) {
      this.face.rest();
      this.swingPrimed = false;
      return;
    }
    const concentrate = reaching && !g.face.smile ? 1 : 0;
    const face = g.face;
    this.face.update(
      dt,
      t,
      talk,
      { smile: face.smile, browsUp: face.browsUp, frown: face.frown + concentrate * 0.18, squint: face.squint + concentrate * 0.1, jaw: face.jaw },
      this.eyeYaw,
      this.eyePitch,
    );
    this.swingParts(dt);
  }

  /** Thighs level on the seat, shins hanging a little forward, feet flat; the knees a touch apart. */
  private seatLegs(dt: number): void {
    const ease = Math.min(1, dt * 6);
    for (const leg of this.rig.legs) {
      leg.hip.rotation.x += (-1.5 - leg.hip.rotation.x) * ease;
      leg.hip.rotation.y += (0 - leg.hip.rotation.y) * ease;
      leg.hip.rotation.z += (0 - leg.hip.rotation.z) * ease;
      leg.knee.rotation.x += (1.38 - leg.knee.rotation.x) * ease;
      leg.ankle.rotation.set(leg.ankle.rotation.x + (0.1 - leg.ankle.rotation.x) * ease, 0, 0);
    }
    this.footing.reset();
  }

  /** The feet where they are planted (or where the gait has them), the hips down as far as a standing leg needs, the legs solved. */
  private standLegs(dt: number, w: number, bodyYaw: number, tempo: number): void {
    const rig = this.rig;
    const stance = this.temper.stance;
    // Where the stance wants the feet: under the hips, turned out; the free foot a little forward; or where a director put them.
    const free = Math.abs(this.weight) > 0.3 ? (this.weight > 0 ? 0 : 1) : -1;
    for (const [i, spot] of this.spots.entries()) {
      const side = i ? 1 : -1;
      const put = this.footTargets[i];
      if (put) {
        this.toLocal(spot.at.copy(put)).setY(0);
        spot.yaw = side * 0.1;
      } else {
        spot.at.set(side * (rig.hipHalf + 0.012 + stance), 0, free === i ? 0.05 : 0.005);
        spot.yaw = side * (0.12 + stance);
      }
    }
    const directed = this.footTargets[0] !== null || this.footTargets[1] !== null;
    // Setting off or settling, the planted feet hold still (the gait blends in or out over them); standing, they step as they must.
    if (w < 1) this.footing.update(dt, this.spots, this.toLocal, this.toWorld, bodyYaw, directed ? tempo * 1.8 : tempo, w === 0);
    const planted = this.footing.feet;
    const walk = this.gait.feet;

    // Each ankle: the feet blended from planted to walking by the gait's weight, rolled on heel or ball.
    let needed = 0;
    this.invPelvisQ.copy(this.pelvisQ).invert();
    for (let i = 0; i < 2; i++) {
      const p = planted[i]!;
      const g = walk[i]!;
      const flat = this.flats[i]!.copy(p.flat).lerp(g.flat, w);
      flat.y += ANKLE_Y;
      const freeHeel = w < 1 && free === i && this.footing.stepping < 0 ? 0.1 * Math.min(1, Math.abs(this.weight)) : 0;
      const rising = this.riseSpring.value * 0.55;
      const pitch = THREE.MathUtils.lerp(p.pitch + freeHeel + rising, g.pitch, w);
      const yaw = THREE.MathUtils.lerp(p.yaw, g.yaw, w);
      const ankle = ankleOver(flat, pitch, yaw, this.ankles[i]!);
      // How far the hips must come down for this leg to reach, if it bears weight (or is about to: the hips lower into the heel strike).
      const bearing = w < 0.5 ? this.footing.stepping !== i : g.stance > 0.5 || g.swing > 0.8;
      if (bearing) {
        const hip = this.hipAt.copy(rig.legs[i]!.hip.position).applyQuaternion(this.pelvisQ).add(rig.pelvis.position);
        // Walking, the standing knee stays soft (it takes the weight at the strike).
        const reach = THREE.MathUtils.lerp(LEG_REACH, WALK_REACH, w) * (THIGH_L + SHIN_L);
        const across = Math.hypot(hip.x - ankle.x, hip.z - ankle.z);
        needed = Math.max(needed, hip.y - ankle.y - Math.sqrt(Math.max(0, reach * reach - across * across)));
      }
      rig.legs[i]!.ankle.userData.pitch = pitch;
      rig.legs[i]!.ankle.userData.yaw = yaw;
    }
    // Down at once, up eased: no foot ever floats, no hitch when a leg comes under the body.
    needed = Math.max(0, needed);
    this.drop = needed > this.drop ? needed : this.drop + (needed - this.drop) * Math.min(1, dt * 10);
    rig.pelvis.position.y -= this.drop;
    for (let i = 0; i < 2; i++) {
      const leg = rig.legs[i]!;
      const side = i ? 1 : -1;
      const local = this.scratch.copy(this.ankles[i]!).sub(rig.pelvis.position).applyQuaternion(this.invPelvisQ);
      solveLeg(leg.hip, leg.knee, local, -side * 0.07);
      orientFoot(leg.ankle, this.pelvisQ, leg.hip, leg.knee, leg.ankle.userData.pitch as number, leg.ankle.userData.yaw as number);
    }
    if (w >= 1) this.footing.follow(walk, this.toWorld, bodyYaw);
  }

  /** One arm: its goal (a gesture's key, something held up, a point to reach, the pose), eased on its springs, then set on its bones. */
  private moveArm(i: number, arm: ArmBones, dt: number, t: number, w: number, moving: boolean, standing: boolean, talk: number, tempo: number): void {
    const side = i ? 1 : -1;
    const g = this.gestures.frame.arms[i];
    const holding = i === 1 && (this.held === 'umbrella' || (moving && (this.held === 'phone' || this.held === 'book')));
    const reachPoint = moving ? null : this.reachTargets[i];
    const pose = POSES[moving ? 'stand' : this.pose];
    const target = this.armTarget;
    let stiff = false;
    if (g) Object.assign(target, g);
    else if (holding) Object.assign(target, { wf: 0, tw: 0, curl: 0.6 }, this.held === 'phone' ? POSES.phone.right : this.held === 'book' ? POSES.read.right : UMBRELLA_ARM);
    else if (reachPoint) {
      // The arm solved to the point from where the collarbone is (it follows the reach, below).
      const s = solveArm(arm.shoulder, side, reachPoint, this.rig.palm, this.solution);
      Object.assign(target, s);
      target.lz = 0;
      target.wf = this.handFlex[i]!;
      target.tw = 0;
      target.curl = this.handCurl ? this.handCurl[i]! : 0.55;
      stiff = true;
    } else {
      Object.assign(target, { wf: 0, tw: 0, curl: 0 }, i ? pose.right : pose.left);
      if (this.handCurl) target.curl = this.handCurl[i]!;
    }
    // The walk's swing (against the other side's leg), a faint sway when standing, the hands with the words.
    if (!holding && !g) {
      const forward = this.gait.arms[i]! * w;
      const a = this.gait.amount;
      target.ux += -forward * 0.34 * a + (standing ? this.drift(t, 3 - i) * 0.025 : 0);
      target.lx += -(0.12 + Math.max(0, forward) * 0.3) * a * w;
      target.curl += 0.15 * w;
    }
    this.beat[i]! += (this.beatGoal[i]! - this.beat[i]!) * Math.min(1, dt * 3.5);
    const b = this.beat[i]!;
    target.ux -= 0.22 * b;
    target.uz += side * 0.05 * b;
    target.lx -= 0.95 * b;
    target.ly -= side * 0.35 * b;
    target.tw += 0.6 * b;
    target.curl -= 0.4 * b;

    const springs = this.armSprings[i]!;
    const c = arm.current;
    const shoulderOmega = (stiff ? REACH_OMEGA : ARM_OMEGA) * tempo;
    const elbowOmega = (stiff ? REACH_OMEGA : ELBOW_OMEGA) * tempo;
    c.ux = springs.ux.step(target.ux, dt, shoulderOmega);
    c.uz = springs.uz.step(target.uz, dt, shoulderOmega);
    c.lx = springs.lx.step(target.lx, dt, elbowOmega);
    c.ly = springs.ly.step(target.ly, dt, elbowOmega);
    c.lz = springs.lz.step(target.lz, dt, elbowOmega);
    c.wf = springs.wf.step(target.wf, dt, HAND_OMEGA * tempo);
    c.tw = springs.tw.step(target.tw, dt, HAND_OMEGA * tempo);
    c.curl = springs.curl.step(THREE.MathUtils.clamp(target.curl, -1, 1), dt, HAND_OMEGA * tempo);

    // The collarbone: up with an arm raised high or out, forward with a reach, and whatever shrug is asked for.
    const raised = Math.max(0, -c.ux - 1.3) * 0.2 + Math.max(0, Math.abs(c.uz) - 0.4) * 0.15;
    const forward = Math.max(0, -c.ux - 0.4) * 0.1;
    const shrug = this.shrugSprings[i]!.step(this.gestures.frame.shrug[i]! + talk * 0.02 * Math.sin(t * 3.1 + i), dt, 10 * tempo);
    arm.clavicle.rotation.set(0, -side * forward, side * (raised + shrug), 'YXZ');
    arm.shoulder.rotation.set(c.ux, 0, c.uz, 'YXZ');
    arm.elbow.rotation.set(c.lx, c.ly, c.lz, 'YXZ');
    arm.wrist.rotation.set(0, side * c.tw, -side * c.wf, 'YXZ');
    const influences = arm.hand.morphTargetInfluences;
    if (influences) {
      influences[0] = Math.max(0, c.curl);
      influences[1] = Math.max(0, -c.curl);
    }
  }

  /** The head onto the gaze (the director's look first, then the owner's target), the eyes leading it; nods; a gesture's own turn on top. */
  private moveHead(dt: number, t: number, walking: boolean, seated: boolean, reaching: boolean, talk: number, extra: readonly number[], ownGaze: boolean): void {
    const head = this.rig.head;
    let yaw = this.drift(t, 2) * 0.07;
    let pitch = 0.03 + this.drift(t, 3) * 0.035;
    let twist = 0;
    let eyeYaw = 0;
    let eyePitch = 0;
    const maxYaw = walking ? MAX_YAW_WALKING : MAX_YAW;
    const target = ownGaze ? null : (this.directedGaze ?? this.target);
    if (target) {
      const local = head.worldToLocal(this.scratch.copy(target));
      // `worldToLocal` includes the head's current turn: undo it to get the target in the neck's frame.
      local.applyEuler(head.rotation);
      local.y -= EYES_ABOVE_PIVOT;
      const rawYaw = Math.atan2(local.x, local.z);
      const rawPitch = -Math.atan2(local.y, Math.hypot(local.x, local.z));
      // The whole turn from the hips' frame: the shoulders take part of a wide one.
      const turn = rawYaw + this.twist;
      if (!walking && !reaching) twist = Math.sign(turn) * Math.min(seated ? TWIST_MAX * 0.5 : TWIST_MAX, Math.max(0, Math.abs(turn) - TWIST_FROM) * TWIST_SHARE);
      yaw = THREE.MathUtils.clamp(rawYaw, -maxYaw, maxYaw);
      pitch = THREE.MathUtils.clamp(rawPitch, -MAX_PITCH, MAX_PITCH);
      // The eyes get there first and make up what the neck cannot; tiny shifts about what they rest on.
      eyeYaw = THREE.MathUtils.clamp(rawYaw - this.yaw + this.saccade.x * 0.15, -EYE_YAW, EYE_YAW);
      eyePitch = THREE.MathUtils.clamp(rawPitch - this.pitch + this.saccade.y * 0.15, -EYE_PITCH, EYE_PITCH);
    } else {
      eyeYaw = this.saccade.x;
      eyePitch = this.saccade.y + (ownGaze ? 0.1 : 0);
    }
    if (!this.far) {
      this.saccadeIn -= dt;
      if (this.saccadeIn <= 0) {
        this.saccadeIn = 0.5 + Math.random() * 2;
        this.saccade.set((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.08);
      }
    }
    // A wide shift of the goal: the eyes jump and, often, the lids blink with it.
    if (Math.hypot(yaw - this.lastGoalYaw, pitch - this.lastGoalPitch) > SHIFT_BLINK && Math.random() < SHIFT_BLINK_CHANCE) this.face.blink();
    this.lastGoalYaw = yaw;
    this.lastGoalPitch = pitch;
    [this.twist, this.twistVelocity] = spring(this.twist, this.twistVelocity, twist, GAZE_OMEGA * 0.45, dt);
    [this.yaw, this.yawVelocity] = spring(this.yaw, this.yawVelocity, yaw, GAZE_OMEGA * this.temper.tempo, dt);
    [this.pitch, this.pitchVelocity] = spring(this.pitch, this.pitchVelocity, pitch, GAZE_OMEGA * this.temper.tempo, dt);
    let nod = 0;
    if (this.nodding > 0) {
      this.nodding = Math.max(0, this.nodding - dt);
      nod = Math.sin((1 - this.nodding / NOD_S) * Math.PI) * NOD_DEPTH;
    }
    if (talk) nod += talk * Math.max(0, Math.sin(t * 4.1) * Math.sin(t * 1.3 + 0.7)) * 0.06;
    const tilt = talk ? talk * this.drift(t, 1) * 0.06 : this.drift(t, 0) * 0.02;
    head.rotation.set(this.pitch + nod + extra[0]!, this.yaw + extra[1]!, tilt + extra[2]!, 'YXZ');
    const eyeEase = Math.min(1, dt * EYE_RATE);
    this.eyeYaw += (eyeYaw - this.eyeYaw) * eyeEase;
    this.eyePitch += (eyePitch - this.eyePitch) * eyeEase;
  }

  /**
   * The ponytail and the bag, each a damped pendulum on its bone: they lag the body's accelerations
   * (a stop swings them forward, the walk's bob sets them bouncing) and hang with gravity whatever the head does.
   */
  private swingParts(dt: number): void {
    const parts = [
      ['tail', this.rig.tail, 5.5, 0.35, 0.9] as const,
      ['bag', this.rig.bag, 4.2, 0.3, 0.35] as const,
    ];
    for (const [key, bone, omega, zeta, reach] of parts) {
      if (!bone) continue;
      const anchor = bone.getWorldPosition(this.scratch);
      const last = this.lastAnchor[key];
      const velocity = this.here.copy(anchor).sub(last).divideScalar(Math.max(dt, 1e-3));
      const accel = this.accel.copy(velocity).sub(this.lastVelocity[key]).divideScalar(Math.max(dt, 1e-3));
      last.copy(anchor);
      this.lastVelocity[key].copy(velocity);
      if (!this.swingPrimed) accel.set(0, 0, 0);
      // Into the bone's parent's frame: forward and sideways accelerations swing it the other way.
      bone.parent!.getWorldQuaternion(this.worldQ);
      accel.applyQuaternion(this.worldQ.invert());
      const s = this.swing[key];
      const gravityX = key === 'tail' ? -this.rig.head.rotation.x * 0.8 : 0;
      const pushX = THREE.MathUtils.clamp(accel.z * 0.03 * reach, -1.5, 1.5);
      const pushZ = THREE.MathUtils.clamp(-accel.x * 0.03 * reach, -1.5, 1.5);
      [s[0], s[1]] = spring(s[0]!, s[1]!, gravityX + pushX, omega, dt, zeta);
      [s[2], s[3]] = spring(s[2]!, s[3]!, pushZ, omega, dt, zeta);
      bone.rotation.set(THREE.MathUtils.clamp(s[0]!, -0.6, 0.6) * (key === 'tail' ? 1 : 0.4), 0, THREE.MathUtils.clamp(s[2]!, -0.5, 0.5) * (key === 'tail' ? 1 : 0.5));
    }
    this.swingPrimed = true;
  }

  /** What the repertoire needs to know to pick a gesture that suits them now. */
  private context(): Context {
    return {
      pose: this.pose,
      seated: this.seatHeight !== null,
      handsBusy: this.reachTargets[0] !== null || this.reachTargets[1] !== null,
      holding: this.held !== null,
      glasses: this.look.glasses !== undefined,
      expressive: this.temper.expressive,
    };
  }

  /** One of this person's slow drifts (`k`, 0..3): a sum of two incommensurate waves, -1..1. */
  private drift(t: number, k: number): number {
    const [a, b, pa, pb] = this.drifts[k]!;
    return Math.sin(t * a + pa) * 0.6 + Math.sin(t * b + pb) * 0.4;
  }
}

const FORWARD = new THREE.Vector3();

/** The heading (about y) of a world rotation. */
function worldYaw(q: THREE.Quaternion): number {
  const forward = FORWARD.set(0, 0, 1).applyQuaternion(q);
  return Math.atan2(forward.x, forward.z);
}

/** How many times larger than at the default field of view things look through `viewer`; 1 for anything but a perspective camera. */
function magnification(viewer: THREE.Object3D): number {
  const camera = viewer as THREE.PerspectiveCamera;
  if (!camera.isPerspectiveCamera) return 1;
  return (REFERENCE_TAN * camera.zoom) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
}

