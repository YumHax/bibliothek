import * as THREE from 'three';
import { invisibleHitbox } from '../meshUtils';
import { CoatTextures, COAT_PALETTES } from './coats';
import type { CatBody, CatPose, CoatKind } from './types';
import { QUALITY } from '@/graphics/quality';
import { fabric } from '@/world/materials/finishes';
import { CatFur } from './CatFur';

/*
 * The procedural cat body: primitives on a small rig of pivots, posed by a table of joint angles
 * and brought to life by idle motion. Everything is in metres; local +z is forward, +y up, and
 * the origin is on the floor under the body centre.
 *
 *   CatModel (floor origin)
 *   ├ hitbox                    one invisible box over body + head, fixed whatever the pose
 *   └ root                      position.y = body-centre height, rotation.x = pitch (+ = nose
 *     │                         down), rotation.z = roll; the pose lives here
 *     ├ torso                   chest + belly capsules along z; scale.y breathes
 *     ├ neck pivot              at the front top of the chest, rotation.x (+ = head down)
 *     │ └ head                  skull, muzzle, nose, whiskers; rotation.y/x = gaze (YXZ)
 *     │   ├ ear pivots (2)      rotation.x (+ = forward, - = back), cone + pink inner
 *     │   └ eye sockets (2)     eyeball sphere (scale.y squashes when closing) + upper eyelid cap
 *     ├ leg pivots (4)          hip / shoulder, rotation.x (+ = lower end swings back)
 *     │ └ knee pivot            rotation.x (+ = paw swings back), lower capsule + paw
 *     └ tail chain (6)          each pivot rotation.x (+ = up) / rotation.y (+ = to the right),
 *                               segment i's pivot is the child of segment i-1's
 *
 * A pose is a `JointAngles` record; `setPose` chooses the target and `update` eases the current
 * angles towards it (~0.4 s). On top of the blended pose, `update` layers the gait (leg swing,
 * body and head bob), the pose's own periodic motion (grooming bob, scratching paws, lapping),
 * the gaze, blinking, ear twitches, breathing, purring tremble, tail sway and flicks, then writes
 * the result into the pivots. Nothing allocates per frame.
 */

/** Nose to rump, tail excluded. */
const BODY_LENGTH = 0.45;
/** Top of the back when standing. */
const STAND_HEIGHT = 0.25;
/** Body-centre height when standing (root y). */
const ROOT_STAND_Y = 0.17;
const CHEST = { r: 0.07, len: 0.1, z: 0.06 };
const BELLY = { r: 0.078, len: 0.12, z: -0.05 };
const FRONT_PIVOT = { x: 0.045, y: -0.015, z: 0.09 };
const HIND_PIVOT = { x: 0.05, y: -0.015, z: -0.1 };
const UPPER_LEN = 0.08;
const LOWER_LEN = 0.06;
const PAW_R = 0.016;
const NECK_PIVOT = { x: 0, y: 0.045, z: 0.13 };
const HEAD_OFFSET = { x: 0, y: 0.045, z: 0.06 };
const SKULL_R = 0.045;
const EYE_R = 0.009;
const TAIL_PIVOT = { x: 0, y: 0.02, z: -0.17 };
const TAIL_SEGMENTS = 6;
const TAIL_SEG_LEN = 0.047;
/** Pose blend time constant: 3τ ≈ 0.4 s to settle. */
const POSE_TAU = 0.13;
const GAZE_YAW_MAX = THREE.MathUtils.degToRad(70);
const GAZE_PITCH_MAX = THREE.MathUtils.degToRad(35);
const HOVER_EMISSIVE = 0x1a1410;
const FLICK_DURATION = 0.6;

/** Every joint of the rig, radians except `rootY` (metres) and `eyes` (0 closed .. 1 open). */
interface JointAngles {
  rootY: number;
  pitch: number;
  roll: number;
  neck: number;
  headPitch: number;
  headYaw: number;
  ears: number;
  eyes: number;
  tailBase: number;
  /** Extra pitch of every tail segment after the first (curls the tail up or down). */
  tailCurl: number;
  tailYaw: number;
  /** Extra yaw of every tail segment after the first (wraps the tail round the body). */
  tailWrap: number;
  flUpper: number;
  flLower: number;
  frUpper: number;
  frLower: number;
  hlUpper: number;
  hlLower: number;
  hrUpper: number;
  hrLower: number;
}

type UpperKey = 'flUpper' | 'frUpper' | 'hlUpper' | 'hrUpper';
type LowerKey = 'flLower' | 'frLower' | 'hlLower' | 'hrLower';

const STAND: JointAngles = {
  rootY: ROOT_STAND_Y,
  pitch: 0,
  roll: 0,
  neck: 0,
  headPitch: 0,
  headYaw: 0,
  ears: 0.2,
  eyes: 1,
  tailBase: 0.8,
  tailCurl: 0.1,
  tailYaw: 0,
  tailWrap: 0,
  flUpper: 0,
  flLower: 0,
  frUpper: 0,
  frLower: 0,
  hlUpper: -0.25,
  hlLower: 0.5,
  hrUpper: -0.25,
  hrLower: 0.5,
};
const JOINT_KEYS = Object.keys(STAND) as (keyof JointAngles)[];

function pose(overrides: Partial<JointAngles>): JointAngles {
  return { ...STAND, ...overrides };
}

/** Both legs of a pair. */
function front(upper: number, lower: number): Partial<JointAngles> {
  return { flUpper: upper, flLower: lower, frUpper: upper, frLower: lower };
}
function hind(upper: number, lower: number): Partial<JointAngles> {
  return { hlUpper: upper, hlLower: lower, hrUpper: upper, hrLower: lower };
}

// Body pitch is applied to the whole root, so a leg that must stay vertical in the world gets
// `-pitch`, and the tail's world elevation is `tailBase + pitch`.
const SIT: JointAngles = pose({
  rootY: 0.14,
  pitch: -0.55,
  neck: 0.45,
  ears: 0.15,
  tailBase: 0.45,
  tailCurl: 0,
  tailYaw: 0.6,
  tailWrap: 0.25,
  ...front(0.55, 0),
  ...hind(-0.17, -0.85),
});
const LIE: JointAngles = pose({
  rootY: 0.09,
  neck: 0.1,
  ears: 0.15,
  tailBase: -0.35,
  tailCurl: 0.07,
  tailYaw: 0.4,
  tailWrap: 0.2,
  ...front(-1.25, 0.35),
  ...hind(-1.3, 2.4),
});
const POSES: Record<CatPose, JointAngles> = {
  stand: STAND,
  sit: SIT,
  lie: LIE,
  sleep: pose({
    rootY: 0.085,
    pitch: 0.05,
    roll: 0.25,
    neck: 0.8,
    headPitch: 0.4,
    headYaw: 0.9,
    ears: -0.1,
    eyes: 0,
    tailBase: -0.3,
    tailCurl: 0.05,
    tailYaw: 1.2,
    tailWrap: 0.3,
    ...front(-1.6, 2.2),
    ...hind(-1.5, 2.4),
  }),
  loaf: pose({
    rootY: 0.085,
    neck: 0.15,
    ears: 0.1,
    eyes: 0.5,
    tailBase: -0.35,
    tailCurl: 0.07,
    tailYaw: 1.0,
    tailWrap: 0.3,
    ...front(-1.2, 2.5),
    ...hind(-1.3, 2.4),
  }),
  stretch: pose({
    rootY: 0.125,
    pitch: 0.45,
    neck: 0.1,
    ears: 0.1,
    eyes: 0.6,
    tailBase: 0.15,
    tailCurl: 0.1,
    ...front(-1.54, 0.05),
    ...hind(-0.45, 0),
  }),
  groom: { ...SIT, neck: 1.1, headYaw: -0.25, eyes: 0.6, ears: 0.1, frUpper: -1.45, frLower: -0.5 },
  eat: pose({
    rootY: 0.15,
    pitch: 0.3,
    neck: 1.3,
    ears: 0.4,
    eyes: 0.8,
    tailBase: -0.1,
    tailCurl: 0.05,
    ...front(-0.4, 1.5),
    ...hind(-0.55, 0.4),
  }),
  drink: pose({
    rootY: 0.15,
    pitch: 0.3,
    neck: 1.15,
    ears: 0.3,
    eyes: 0.9,
    tailBase: -0.2,
    tailCurl: 0.05,
    ...front(-0.4, 1.5),
    ...hind(-0.55, 0.4),
  }),
  scratch: pose({
    rootY: 0.25,
    pitch: -1.05,
    neck: -0.2,
    ears: 0.3,
    eyes: 0.9,
    tailBase: 0.55,
    tailCurl: 0.25,
    ...front(-1.35, -0.3),
    ...hind(0.7, 0.5),
  }),
  crouch: pose({
    rootY: 0.115,
    pitch: 0.05,
    neck: -0.15,
    ears: 0.45,
    tailBase: -0.15,
    tailCurl: 0.02,
    ...front(-1.05, 1.95),
    ...hind(-1.1, 2.0),
  }),
  pounce: pose({
    rootY: 0.2,
    pitch: -0.25,
    neck: -0.1,
    ears: 0.4,
    tailBase: 0.3,
    tailCurl: 0,
    ...front(-1.4, -0.2),
    ...hind(0.9, 0.1),
  }),
};

/** Resting amplitude of the tail-tip sway per pose (radians at the tip). */
const TAIL_SWAY: Record<CatPose, number> = {
  stand: 0.22,
  sit: 0.22,
  lie: 0.14,
  sleep: 0.03,
  loaf: 0.12,
  stretch: 0.1,
  groom: 0.14,
  eat: 0.2,
  drink: 0.2,
  scratch: 0.1,
  crouch: 0.08,
  pounce: 0.05,
};

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  upper: UpperKey;
  lower: LowerKey;
  /** Offset in the walk cycle: diagonal pairs move together. */
  phase: number;
}

interface Eye {
  ball: THREE.Mesh;
  lid: THREE.Mesh;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function shadowed<T extends THREE.Mesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function capsuleZ(radius: number, length: number, material: THREE.Material, backwards = false): THREE.Mesh {
  const mesh = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 16), material));
  mesh.rotation.x = backwards ? -Math.PI / 2 : Math.PI / 2;
  return mesh;
}

/** House cat built from primitives; see the file header for the rig. */
export class CatModel extends THREE.Group implements CatBody {
  readonly bodyLength = BODY_LENGTH;
  readonly standHeight = STAND_HEIGHT;
  readonly hitbox: THREE.Object3D;

  private readonly root = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly neckPivot = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly ears: THREE.Group[] = [];
  private readonly eyes: Eye[] = [];
  private readonly legs: Leg[] = [];
  private readonly tail: THREE.Group[] = [];

  private readonly textures: CoatTextures;
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly tailMaterial: THREE.MeshStandardMaterial;
  private readonly furMaterial: THREE.MeshStandardMaterial;
  private readonly muzzleMaterial: THREE.MeshStandardMaterial;
  private readonly pawMaterial: THREE.MeshStandardMaterial;
  private readonly earInnerMaterial: THREE.MeshStandardMaterial;
  private readonly noseMaterial: THREE.MeshStandardMaterial;
  private readonly eyeMaterial: THREE.MeshStandardMaterial;
  private readonly furMaterials: THREE.MeshStandardMaterial[];
  /** Shell fur over the torso, head, thighs and tail (`QUALITY.fur`). */
  private readonly fur = QUALITY.fur ? new CatFur() : null;

  private currentPose: CatPose = 'stand';
  private target: JointAngles = STAND;
  private readonly current: JointAngles = { ...STAND };
  /** Seconds since the last `setPose`; drives the pose's own periodic motion. */
  private poseTime = 0;
  private time = 0;

  private speed = 0;
  private gaitPhase = 0;
  private gaitWeight = 0;

  private gazeTarget: THREE.Vector3 | null = null;
  private readonly gazePoint = new THREE.Vector3();
  private headYaw = 0;
  private headPitch = 0;

  private purring = false;
  private purrWeight = 0;
  private flickLeft = 0;

  private eyeOpen = 1;
  private blinkIn = 3;
  private blinkLeft = 0;
  private twitchIn = 6;
  private twitchSide = 0;
  private twitchAmount = 0;

  constructor(coat: CoatKind = 'tabby') {
    super();
    this.name = 'Cat';
    const palette = COAT_PALETTES[coat];
    this.textures = new CoatTextures(coat);
    // Fur has the sheen of cloth at a grazing angle (high quality: a physical material).
    const sheenTint = 0xb8b0a4;
    this.bodyMaterial = fabric({ map: this.textures.body, roughness: 0.95, sheenTint });
    this.tailMaterial = fabric({ map: this.textures.tail, roughness: 0.95, sheenTint });
    this.furMaterial = fabric({ color: palette.base, roughness: 0.95, sheenTint });
    this.muzzleMaterial = fabric({ color: palette.muzzle, roughness: 0.95, sheenTint });
    this.pawMaterial = fabric({ color: palette.paws, roughness: 0.95, sheenTint });
    this.earInnerMaterial = new THREE.MeshStandardMaterial({ color: palette.earInner, roughness: 0.8 });
    this.noseMaterial = new THREE.MeshStandardMaterial({ color: palette.nose, roughness: 0.4 });
    this.eyeMaterial = new THREE.MeshStandardMaterial({ map: this.textures.eye, roughness: 0.15, metalness: 0.1 });
    this.furMaterials = [this.bodyMaterial, this.tailMaterial, this.furMaterial, this.muzzleMaterial, this.pawMaterial];

    this.add(this.root);
    this.root.position.y = ROOT_STAND_Y;
    this.buildTorso();
    this.buildHead();
    this.buildLegs();
    this.buildTail();

    this.hitbox = invisibleHitbox(0.25, 0.38, 0.55, { y: 0.19, z: 0.02 });
    this.add(this.hitbox);

    this.blinkIn = 3 + Math.random() * 4;
    this.twitchIn = 5 + Math.random() * 10;
    this.applyJoints();
  }

  // ---------------------------------------------------------------- construction

  private buildTorso(): void {
    const chest = capsuleZ(CHEST.r, CHEST.len, this.bodyMaterial);
    chest.position.z = CHEST.z;
    const belly = capsuleZ(BELLY.r, BELLY.len, this.bodyMaterial);
    belly.position.z = BELLY.z;
    this.torso.add(chest, belly);
    this.fur?.grow(chest);
    this.fur?.grow(belly);
    this.root.add(this.torso);
  }

  private buildHead(): void {
    this.neckPivot.position.set(NECK_PIVOT.x, NECK_PIVOT.y, NECK_PIVOT.z);
    this.root.add(this.neckPivot);
    const neck = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.04, 4, 12), this.furMaterial));
    neck.position.set(0, HEAD_OFFSET.y * 0.45, HEAD_OFFSET.z * 0.45);
    neck.rotation.x = -Math.atan2(HEAD_OFFSET.z, HEAD_OFFSET.y);
    this.neckPivot.add(neck);
    this.fur?.grow(neck);

    this.head.position.set(HEAD_OFFSET.x, HEAD_OFFSET.y, HEAD_OFFSET.z);
    this.head.rotation.order = 'YXZ';
    this.neckPivot.add(this.head);

    const skull = shadowed(new THREE.Mesh(new THREE.SphereGeometry(SKULL_R, 20, 14), this.furMaterial));
    skull.scale.set(1, 0.92, 1.02);
    this.fur?.grow(skull);
    const muzzle = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), this.muzzleMaterial));
    muzzle.position.set(0, -0.012, 0.036);
    muzzle.scale.set(1.25, 0.8, 1);
    const nose = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 6), this.noseMaterial));
    nose.position.set(0, -0.004, 0.058);
    nose.scale.set(1.2, 0.8, 0.8);
    this.head.add(skull, muzzle, nose);

    for (const side of [1, -1]) {
      // Ears: a cone on a pivot at the top of the skull, splayed outwards, with a pink inner face.
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.026, 0.032, -0.004);
      const ear = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.032, 8), this.furMaterial));
      ear.position.y = 0.013;
      ear.rotation.z = -side * 0.35;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.022, 8), this.earInnerMaterial);
      inner.position.set(0, 0.01, 0.004);
      inner.rotation.z = -side * 0.35;
      inner.scale.x = 0.6;
      pivot.add(ear, inner);
      this.head.add(pivot);
      this.ears.push(pivot);

      // Eyes: the socket turns a little outwards; the ball squashes and the lid cap rotates to close.
      const socket = new THREE.Group();
      socket.position.set(side * 0.017, 0.008, 0.038);
      socket.rotation.y = side * 0.3;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(EYE_R, 16, 12), this.eyeMaterial);
      ball.castShadow = false;
      const lid = new THREE.Mesh(new THREE.SphereGeometry(EYE_R * 1.08, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.furMaterial);
      lid.castShadow = false;
      socket.add(ball, lid);
      this.head.add(socket);
      this.eyes.push({ ball, lid });
    }

    // Whiskers: three thin lines per side fanning out from the muzzle.
    const points: number[] = [];
    for (const side of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const spread = (i - 1) * 0.012;
        points.push(side * 0.012, -0.012 + spread * 0.5, 0.05, side * 0.075, -0.018 + spread * 2.2 + 0.006, 0.03 + spread);
      }
    }
    const whiskerGeometry = new THREE.BufferGeometry();
    whiskerGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const whiskers = new THREE.LineSegments(whiskerGeometry, new THREE.LineBasicMaterial({ color: 0xf4f0e8, transparent: true, opacity: 0.55 }));
    this.head.add(whiskers);
  }

  private buildLegs(): void {
    const legs: [number, number, number, UpperKey, LowerKey, number][] = [
      [FRONT_PIVOT.x, FRONT_PIVOT.y, FRONT_PIVOT.z, 'flUpper', 'flLower', 0],
      [-FRONT_PIVOT.x, FRONT_PIVOT.y, FRONT_PIVOT.z, 'frUpper', 'frLower', 0.5],
      [HIND_PIVOT.x, HIND_PIVOT.y, HIND_PIVOT.z, 'hlUpper', 'hlLower', 0.5],
      [-HIND_PIVOT.x, HIND_PIVOT.y, HIND_PIVOT.z, 'hrUpper', 'hrLower', 0],
    ];
    for (const [x, y, z, upper, lower, phase] of legs) {
      const hip = new THREE.Group();
      hip.position.set(x, y, z);
      const thigh = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.018, UPPER_LEN - 0.02, 4, 12), this.furMaterial));
      thigh.position.y = -UPPER_LEN / 2;
      this.fur?.grow(thigh);
      const knee = new THREE.Group();
      knee.position.y = -UPPER_LEN;
      const shank = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.014, LOWER_LEN - 0.02, 4, 12), this.furMaterial));
      shank.position.y = -LOWER_LEN / 2;
      const paw = shadowed(new THREE.Mesh(new THREE.SphereGeometry(PAW_R, 12, 8), this.pawMaterial));
      paw.position.set(0, -LOWER_LEN - 0.004, 0.01);
      paw.scale.set(1, 0.7, 1.15);
      knee.add(shank, paw);
      hip.add(thigh, knee);
      this.root.add(hip);
      this.legs.push({ hip, knee, upper, lower, phase });
    }
  }

  private buildTail(): void {
    let parent: THREE.Object3D = this.root;
    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      const pivot = new THREE.Group();
      if (i === 0) pivot.position.set(TAIL_PIVOT.x, TAIL_PIVOT.y, TAIL_PIVOT.z);
      else pivot.position.z = -TAIL_SEG_LEN;
      const radius = 0.013 - i * 0.0009;
      const segment = capsuleZ(radius, TAIL_SEG_LEN - radius, this.tailMaterial, true);
      segment.position.z = -TAIL_SEG_LEN / 2;
      this.fur?.grow(segment);
      pivot.add(segment);
      parent.add(pivot);
      this.tail.push(pivot);
      parent = pivot;
    }
  }

  // ---------------------------------------------------------------- CatBody API

  setPose(pose: CatPose): void {
    if (pose === this.currentPose) return;
    this.currentPose = pose;
    this.target = POSES[pose];
    this.poseTime = 0;
  }

  setSpeed(mps: number): void {
    this.speed = Math.max(0, mps);
  }

  gaze(target: THREE.Vector3 | null): void {
    if (target) {
      this.gazePoint.copy(target);
      this.gazeTarget = this.gazePoint;
    } else {
      this.gazeTarget = null;
    }
  }

  setPurring(on: boolean): void {
    this.purring = on;
  }

  flick(): void {
    this.flickLeft = FLICK_DURATION;
  }

  setCoat(coat: CoatKind): void {
    const palette = COAT_PALETTES[coat];
    this.textures.paint(coat);
    this.furMaterial.color.set(palette.base);
    this.muzzleMaterial.color.set(palette.muzzle);
    this.pawMaterial.color.set(palette.paws);
    this.earInnerMaterial.color.set(palette.earInner);
    this.noseMaterial.color.set(palette.nose);
    this.fur?.sync();
  }

  setHovered(hovered: boolean): void {
    for (const material of this.furMaterials) material.emissive.setHex(hovered ? HOVER_EMISSIVE : 0x000000);
    this.fur?.sync();
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.time += dt;
    this.poseTime += dt;

    // Ease every joint towards the pose.
    const blend = 1 - Math.exp(-dt / POSE_TAU);
    const cur = this.current;
    const tgt = this.target;
    for (const key of JOINT_KEYS) cur[key] += (tgt[key] - cur[key]) * blend;

    this.purrWeight += ((this.purring ? 1 : 0) - this.purrWeight) * Math.min(1, dt * 4);
    if (this.flickLeft > 0) this.flickLeft = Math.max(0, this.flickLeft - dt);
    this.updateGait(dt);
    this.updateGaze(dt);
    this.updateEyes(dt);
    this.updateEars(dt);
    this.applyJoints();
  }

  // ---------------------------------------------------------------- per-frame pieces

  private updateGait(dt: number): void {
    const walking = this.speed > 0 && (this.currentPose === 'stand' || this.currentPose === 'crouch');
    this.gaitWeight += ((walking ? 1 : 0) - this.gaitWeight) * Math.min(1, dt * 8);
    if (walking) {
      const stride = this.speed > 0.8 ? 0.35 : 0.25;
      this.gaitPhase = (this.gaitPhase + (this.speed * dt) / stride) % 1;
    }
  }

  private updateGaze(dt: number): void {
    let yaw = this.current.headYaw;
    let pitch = this.current.headPitch;
    if (this.gazeTarget) {
      // Direction from the head to the target in the body's (root) frame, clamped.
      this.head.getWorldPosition(tmpA);
      this.root.worldToLocal(tmpA);
      tmpB.copy(this.gazeTarget);
      this.root.worldToLocal(tmpB).sub(tmpA);
      const horizontal = Math.hypot(tmpB.x, tmpB.z);
      if (horizontal > 1e-4 || Math.abs(tmpB.y) > 1e-4) {
        yaw = THREE.MathUtils.clamp(Math.atan2(tmpB.x, tmpB.z), -GAZE_YAW_MAX, GAZE_YAW_MAX);
        pitch = THREE.MathUtils.clamp(-Math.atan2(tmpB.y, horizontal), -GAZE_PITCH_MAX, GAZE_PITCH_MAX) - this.current.neck;
      }
    }
    const k = Math.min(1, dt * 6);
    this.headYaw += (yaw - this.headYaw) * k;
    this.headPitch += (pitch - this.headPitch) * k;
  }

  private updateEyes(dt: number): void {
    // Blink now and then, unless the eyes are (nearly) shut anyway.
    if (this.blinkLeft > 0) {
      this.blinkLeft -= dt;
    } else {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) {
        this.blinkIn = 3 + Math.random() * 4;
        if (this.current.eyes > 0.3) this.blinkLeft = 0.12;
      }
    }
    let open = this.current.eyes;
    open = THREE.MathUtils.lerp(open, Math.min(open, 0.4), this.purrWeight);
    if (this.blinkLeft > 0) open = 0;
    this.eyeOpen += (open - this.eyeOpen) * Math.min(1, dt * 30);
  }

  private updateEars(dt: number): void {
    this.twitchIn -= dt;
    if (this.twitchIn <= 0) {
      this.twitchIn = 5 + Math.random() * 10;
      this.twitchSide = Math.random() < 0.5 ? 0 : 1;
      this.twitchAmount = 0.4;
    }
    this.twitchAmount *= Math.exp(-dt * 9);
  }

  /** Writes the blended pose plus every animated layer into the pivots. */
  private applyJoints(): void {
    const cur = this.current;
    const t = this.time;
    const pose = this.currentPose;
    const purr = this.purrWeight;
    // Full strength at once (startled), eased out over the last tenth of a second.
    const flick = Math.min(1, this.flickLeft / 0.1);

    // Gait: diagonal pairs swing, knees fold on the forward swing, the body bobs twice a cycle.
    const trot = this.speed > 0.8;
    const cycle = this.gaitPhase * Math.PI * 2;
    const swing = (trot ? 0.55 : 0.4) * this.gaitWeight;
    const fold = (trot ? 0.7 : 0.5) * this.gaitWeight;
    const bob = Math.sin(cycle * 2) * (trot ? 0.008 : 0.004) * this.gaitWeight;
    let neckMod = -Math.sin(cycle * 2) * (trot ? 0.06 : 0.035) * this.gaitWeight;

    // The pose's own periodic motion.
    const pt = this.poseTime * Math.PI * 2;
    let frLowerMod = 0;
    let flUpperMod = 0;
    let frUpperMod = 0;
    if (pose === 'groom') {
      neckMod += Math.sin(pt * 1.3) * 0.12;
      frLowerMod = Math.sin(pt * 1.3 + 0.5) * 0.15;
    } else if (pose === 'scratch') {
      const alternate = Math.sin(pt * 1.1) * 0.3;
      flUpperMod = alternate;
      frUpperMod = -alternate;
    } else if (pose === 'eat') {
      neckMod += Math.max(0, Math.sin(pt * 2)) * 0.06;
    } else if (pose === 'drink') {
      neckMod += Math.sin(pt * 3) * 0.035;
    }

    // Root: height, pitch, roll, the purring tremble.
    const tremble = Math.sin(t * Math.PI * 2 * 25) * 0.0006 * purr;
    this.root.position.y = cur.rootY + bob + tremble;
    this.root.rotation.x = cur.pitch;
    this.root.rotation.z = cur.roll;

    // Breathing.
    const breathRate = pose === 'sleep' ? 0.3 : 0.5;
    this.torso.scale.y = 1 + Math.sin(t * Math.PI * 2 * breathRate) * 0.015;

    // Head.
    this.neckPivot.rotation.x = cur.neck + neckMod;
    this.head.rotation.y = this.headYaw;
    this.head.rotation.x = this.headPitch;

    // Ears: pose angle, relaxed while purring, pinned back on a flick, one twitching now and then.
    const earBase = cur.ears - 0.15 * purr - 0.9 * flick;
    for (let i = 0; i < this.ears.length; i++) {
      this.ears[i].rotation.x = earBase - (i === this.twitchSide ? this.twitchAmount : 0);
    }

    // Eyes: the ball squashes, the upper lid cap rolls down over it.
    const open = this.eyeOpen;
    const lidAngle = -1.15 + (1 - open) * 1.75;
    for (const eye of this.eyes) {
      eye.ball.scale.y = 0.25 + 0.75 * open;
      eye.lid.rotation.x = lidAngle;
    }

    // Legs.
    for (const leg of this.legs) {
      const angle = cycle + leg.phase * Math.PI * 2;
      let upper = cur[leg.upper] + Math.sin(angle) * swing;
      let lower = cur[leg.lower] + Math.max(0, -Math.cos(angle)) * fold;
      if (leg.upper === 'flUpper') upper += flUpperMod;
      else if (leg.upper === 'frUpper') {
        upper += frUpperMod;
        lower += frLowerMod;
      }
      leg.hip.rotation.x = upper;
      leg.knee.rotation.x = lower;
    }

    // Tail: pose curl, idle sway (two sines, wider and slower while purring), walking sway, flick lash.
    const restAmp = TAIL_SWAY[pose];
    const swayAmp = THREE.MathUtils.lerp(restAmp, Math.max(restAmp, 0.35), purr);
    const f1 = THREE.MathUtils.lerp(0.9, 0.5, purr);
    const f2 = THREE.MathUtils.lerp(1.7, 0.95, purr);
    const sway = (Math.sin(t * f1) + Math.sin(t * f2 + 1.3) * 0.5) * swayAmp + Math.sin(cycle) * 0.12 * this.gaitWeight;
    const lash = Math.sin(t * 24) * 0.45 * flick;
    for (let i = 0; i < this.tail.length; i++) {
      const pivot = this.tail[i];
      const weight = (i + 1) / TAIL_SEGMENTS;
      const wave = (sway + lash) * weight * 0.6;
      if (i === 0) {
        pivot.rotation.x = cur.tailBase + 0.25 * flick;
        pivot.rotation.y = cur.tailYaw + wave;
      } else {
        pivot.rotation.x = cur.tailCurl + Math.sin(t * f1 * 1.3 + i) * 0.03 * weight;
        pivot.rotation.y = cur.tailWrap + wave;
      }
    }
  }
}
