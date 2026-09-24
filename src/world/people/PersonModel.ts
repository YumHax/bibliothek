import * as THREE from 'three';
import { invisibleHitbox } from '../meshUtils';
import {
  FOREARM_L,
  handGeometries,
  HEAD_Y,
  HIP_Y,
  limb,
  NECK_PIVOT,
  REFERENCE_HEIGHT,
  SHIN_L,
  SHOULDER_X,
  SHOULDER_Y,
  THIGH_L,
  TORSO_PIVOT_Y,
  TORSO_BOTTOM,
  TORSO_TOP,
  trunkGeometry,
  trunkSection,
  UPPER_ARM_L,
  WAIST_Y,
} from './body';
import { paintCloth, paintTorso } from './clothTexture';
import { BLINK_ANGLE, buildEyes, type Eye } from './eyes';
import { paintFace } from './faceTexture';
import { at, capsuleBetween, limbGeometry, Parts, roundedBox } from './geometry';
import { addHair, hairMaterial } from './hair';
import { addEars, addGlasses, addHat, headGeometry, type FaceShape } from './head';
import type { PersonLook } from './looks';
import { POSES, type ArmAngles, type Pose } from './poses';
import { addShoe } from './shoes';

/*
 * A person at real scale, modelled rather than assembled from primitives:
 *
 *   PersonModel (floor origin, faces +z)
 *   ├ hitbox
 *   └ root                     scaled to `look.height`; bobs and sways
 *     ├ hip pivots (2)         thigh, knee pivot (shin, ankle pivot: shoe)
 *     └ torso                  pivot at the waist; twists and leans
 *       ├ trunk                one sculpted surface (seat, waist, chest, shoulders) wearing the
 *       │                      painted texture (trousers, belt, top, apron); breathes
 *       ├ neck, collar, hood, bag
 *       ├ shoulder pivots (2)  upper arm, elbow pivot (forearm, hand with fingers and thumb)
 *       └ neck pivot           nods and turns to `gaze()`
 *         └ head               sculpted skull and face wearing the painted skin; hair, beard,
 *                              ears, hat, glasses; eyes that follow the gaze and blink
 *
 * Every bone's pieces are merged into one mesh per material (`Parts`). `update(dt)` animates: a
 * gait with bending knees and swinging arms when `setSpeed()` is above zero; breathing, a slow
 * shift of weight and idle glances when standing; the arms easing into whatever `setPose()` asked
 * for; the eyes leading the head onto the gaze target and darting about when idle; blinking.
 */

/** One step every this many metres walked. */
const STRIDE = 0.68;
const MAX_YAW = 1.15;
const MAX_PITCH = 0.55;
/** How far the eyes turn in their sockets beyond the head. */
const EYE_YAW = 0.38;
const EYE_PITCH = 0.25;
/** How fast the head settles on a new target, the eyes on theirs, the arms on a new pose, per second. */
const GAZE_RATE = 5;
const EYE_RATE = 22;
const POSE_RATE = 4;
/** The eyes above the neck pivot, in the head's frame: gaze angles are measured from there. */
const EYES_ABOVE_PIVOT = HEAD_Y + 0.014 - NECK_PIVOT.y;

interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  current: ArmAngles;
}

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
}

export class PersonModel extends THREE.Group {
  readonly hitbox: THREE.Object3D;
  /** Eye height in world metres once scaled, for whoever wants to be looked at. */
  readonly eyeHeight: number;

  private readonly root = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly trunk: THREE.Mesh;
  private readonly head = new THREE.Group();
  private readonly eyes: [Eye, Eye];
  private readonly legs: [Leg, Leg];
  private readonly arms: [Arm, Arm];
  private pose: Pose = 'stand';
  private speed = 0;
  private phase = 0;
  private time = Math.random() * 100;
  private blinkIn = 2 + Math.random() * 4;
  private blink = 0;
  private target: THREE.Vector3 | null = null;
  private yaw = 0;
  private pitch = 0;
  private eyeYaw = 0;
  private eyePitch = 0;
  private saccadeIn = 0;
  private readonly saccade = new THREE.Vector2();
  private readonly scratch = new THREE.Vector3();

  constructor(look: PersonLook) {
    super();
    this.name = 'PersonModel';
    const build = look.build;
    // Limb girth follows the build a little, never as much as the trunk.
    const girth = 0.7 + 0.3 * build;
    const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.6 });
    const pattern = look.top === 'stripes' ? 'stripes' : look.top === 'flannel' ? 'check' : 'plain';
    const sleeve = new THREE.MeshStandardMaterial({ map: paintCloth(look.topColor, look.topAccent, pattern), roughness: 0.9 });
    const trousers = new THREE.MeshStandardMaterial({ map: paintCloth(look.trousers, look.trousers, 'plain'), roughness: 0.92 });

    this.legs = [this.leg(-1, look, girth, skin, trousers), this.leg(1, look, girth, skin, trousers)];
    this.root.add(this.legs[0].hip, this.legs[1].hip);

    this.torso.position.y = TORSO_PIVOT_Y;
    const waistV = (WAIST_Y - TORSO_BOTTOM) / (TORSO_TOP - TORSO_BOTTOM);
    this.trunk = new THREE.Mesh(trunkGeometry(look), new THREE.MeshStandardMaterial({ map: paintTorso(look, waistV), roughness: 0.9 }));
    this.trunk.castShadow = true;
    this.trunk.receiveShadow = true;
    this.torso.add(this.trunk);
    const torsoParts = new Parts();
    // The neck, from inside the shoulders up into the skull.
    torsoParts.add(
      limbGeometry(0.15, [[0, 0.052], [0.5, 0.053], [1, 0.06]], { top: 1, bottom: 0 }),
      skin,
      at(NECK_PIVOT.x, NECK_PIVOT.y + 0.05 - TORSO_PIVOT_Y, NECK_PIVOT.z, [0, 0, 0], [1, 1, 0.88]),
    );
    neckwear(torsoParts, look, build, sleeve);
    bag(torsoParts, look);
    this.torso.add(...torsoParts.meshes());

    this.arms = [this.arm(-1, look, build, girth, skin, sleeve), this.arm(1, look, build, girth, skin, sleeve)];
    this.torso.add(this.arms[0].shoulder, this.arms[1].shoulder);

    this.head.position.set(NECK_PIVOT.x, NECK_PIVOT.y - TORSO_PIVOT_Y, NECK_PIVOT.z);
    this.head.rotation.order = 'YXZ';
    this.eyes = this.buildHead(look, skin);
    this.torso.add(this.head);
    this.root.add(this.torso);
    this.add(this.root);

    const scale = look.height / REFERENCE_HEIGHT;
    this.root.scale.setScalar(scale);
    this.eyeHeight = (HEAD_Y + 0.014) * scale;
    const top = HEAD_Y + 0.14;
    this.hitbox = invisibleHitbox(0.6, top, 0.45, { y: top / 2 });
    this.hitbox.scale.setScalar(scale);
    this.add(this.hitbox);
  }

  /** Walking speed in m/s; 0 stands still. Drives the gait only, moving the model is the owner's job. */
  setSpeed(speed: number): void {
    this.speed = Math.max(0, speed);
  }

  /** What the arms do while standing; walking always swings them. */
  setPose(pose: Pose): void {
    this.pose = pose;
  }

  /** World point the head turns towards, or null to look ahead (with idle glances). */
  gaze(target: THREE.Vector3 | null): void {
    if (!target) {
      this.target = null;
      return;
    }
    (this.target ??= new THREE.Vector3()).copy(target);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    const walking = this.speed > 0;
    const ease = Math.min(1, dt * 6);
    if (walking) this.phase += (dt * this.speed * Math.PI) / STRIDE;

    // Legs: the gait is written straight to the joints (easing would damp it); at rest they ease back.
    for (const [i, leg] of this.legs.entries()) {
      const p = this.phase + i * Math.PI;
      if (walking) {
        const thigh = -Math.sin(p) * 0.5;
        const knee = 0.1 + Math.max(0, Math.cos(p)) * 0.85;
        leg.hip.rotation.x = thigh;
        leg.knee.rotation.x = knee;
        leg.ankle.rotation.x = -(thigh + knee) * 0.6;
      } else {
        leg.hip.rotation.x += (0 - leg.hip.rotation.x) * ease;
        leg.knee.rotation.x += (0.04 - leg.knee.rotation.x) * ease;
        leg.ankle.rotation.x += (-0.04 - leg.ankle.rotation.x) * ease;
      }
    }

    // Arms: ease into the pose, then add the gait's swing (or a faint idle sway) on top.
    const pose = POSES[walking ? 'stand' : this.pose];
    for (const [i, arm] of this.arms.entries()) {
      const target = i ? pose.right : pose.left;
      const p = this.phase + i * Math.PI;
      const swing = walking ? Math.sin(p) * 0.38 : Math.sin(t * 0.7 + i) * 0.02;
      const bend = walking ? Math.max(0, -Math.sin(p)) * 0.35 : 0;
      const k = Math.min(1, dt * POSE_RATE);
      const c = arm.current;
      c.ux += (target.ux - c.ux) * k;
      c.uz += (target.uz - c.uz) * k;
      c.lx += (target.lx - c.lx) * k;
      c.ly += (target.ly - c.ly) * k;
      c.lz += (target.lz - c.lz) * k;
      arm.shoulder.rotation.set(c.ux + swing, 0, c.uz, 'YXZ');
      arm.elbow.rotation.set(c.lx - bend, c.ly, c.lz, 'YXZ');
    }

    // Body: bob and counter-twist when walking, weight shift and breathing when not.
    if (walking) {
      const p = this.phase;
      this.root.position.y = -Math.cos(2 * p) * 0.014;
      this.root.position.x += (0 - this.root.position.x) * ease;
      this.root.rotation.z = Math.sin(p) * 0.02;
      this.torso.rotation.y = Math.sin(p) * 0.07;
      this.torso.rotation.x += (0.04 - this.torso.rotation.x) * ease;
    } else {
      this.root.position.y += (0 - this.root.position.y) * ease;
      this.root.position.x += (Math.sin(t * 0.35) * 0.012 - this.root.position.x) * ease;
      this.root.rotation.z += (Math.sin(t * 0.35) * 0.018 - this.root.rotation.z) * ease;
      this.torso.rotation.y += (Math.sin(t * 0.23) * 0.04 - this.torso.rotation.y) * ease;
      this.torso.rotation.x += (0 - this.torso.rotation.x) * ease;
    }
    // Breathing lifts and fills the chest a little.
    const breath = Math.sin(t * 1.6) * 0.012;
    this.trunk.scale.set(1 + breath * 0.4, 1 + breath * 0.5, 1 + breath * 0.9);

    // Head: towards the target, or ahead with a wandering glance.
    let yaw = Math.sin(t * 0.31) * 0.25;
    let pitch = Math.sin(t * 0.47) * 0.06;
    let eyeYaw = 0;
    let eyePitch = 0;
    if (this.target) {
      const local = this.head.worldToLocal(this.scratch.copy(this.target));
      // `worldToLocal` includes the head's current turn: undo it to get the target in the neck's frame.
      local.applyEuler(this.head.rotation);
      local.y -= EYES_ABOVE_PIVOT;
      const rawYaw = Math.atan2(local.x, local.z);
      const rawPitch = -Math.atan2(local.y, Math.hypot(local.x, local.z));
      yaw = THREE.MathUtils.clamp(rawYaw, -MAX_YAW, MAX_YAW);
      pitch = THREE.MathUtils.clamp(rawPitch, -MAX_PITCH, MAX_PITCH);
      // The eyes get there first and make up what the neck cannot.
      eyeYaw = THREE.MathUtils.clamp(rawYaw - this.yaw, -EYE_YAW, EYE_YAW);
      eyePitch = THREE.MathUtils.clamp(rawPitch - this.pitch, -EYE_PITCH, EYE_PITCH);
    } else {
      this.saccadeIn -= dt;
      if (this.saccadeIn <= 0) {
        this.saccadeIn = 0.6 + Math.random() * 2.2;
        this.saccade.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.16);
      }
      eyeYaw = this.saccade.x;
      eyePitch = this.saccade.y;
    }
    const gazeEase = Math.min(1, dt * GAZE_RATE);
    this.yaw += (yaw - this.yaw) * gazeEase;
    this.pitch += (pitch - this.pitch) * gazeEase;
    this.head.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    const eyeEase = Math.min(1, dt * EYE_RATE);
    this.eyeYaw += (eyeYaw - this.eyeYaw) * eyeEase;
    this.eyePitch += (eyePitch - this.eyePitch) * eyeEase;

    // Blink every few seconds, the upper lids dropping for a fifth of a second; they also follow the eyes down.
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkIn = 2 + Math.random() * 4;
      this.blink = 0.2;
    }
    let closed = 0;
    if (this.blink > 0) {
      this.blink -= dt;
      closed = Math.sin((Math.max(0, this.blink) / 0.2) * Math.PI);
    }
    for (const eye of this.eyes) {
      eye.ball.rotation.set(this.eyePitch, this.eyeYaw, 0, 'YXZ');
      eye.upperLid.rotation.x = Math.max(0, this.eyePitch) * 0.5 + closed * BLINK_ANGLE;
    }
  }

  private leg(side: -1 | 1, look: PersonLook, girth: number, skin: THREE.Material, trousers: THREE.Material): Leg {
    const hip = new THREE.Group();
    hip.position.set(side * 0.09 * look.build, HIP_Y, 0);
    const thigh = new Parts();
    if (look.shorts) {
      thigh.add(limb('thigh', THIGH_L, girth), skin);
      thigh.add(limbGeometry(0.24, [[0, 0.08 * girth], [0.6, 0.083 * girth], [1, 0.082 * girth]], { top: 1, bottom: 0.1 }), trousers);
    } else {
      thigh.add(limb('thigh', THIGH_L, girth, 0.006), trousers);
    }
    hip.add(...thigh.meshes());

    const knee = new THREE.Group();
    knee.position.y = -THIGH_L;
    const shin = new Parts();
    if (look.shorts) {
      shin.add(limb('shin', SHIN_L, girth), skin);
      shin.add(limbGeometry(0.08, [[0, 0.041 * girth], [1, 0.043 * girth]], { top: 0.3, bottom: 0.3 }), new THREE.MeshStandardMaterial({ color: 0xf0ede6, roughness: 0.95 }), at(0, -SHIN_L + 0.085, 0));
    } else {
      shin.add(limb('trouserShin', SHIN_L, girth, -0.002, { top: 1, bottom: 0.25 }), trousers);
    }
    knee.add(...shin.meshes());

    const ankle = new THREE.Group();
    ankle.position.y = -SHIN_L;
    const shoe = new Parts();
    addShoe(shoe, look, girth);
    ankle.add(...shoe.meshes());
    knee.add(ankle);
    hip.add(knee);
    return { hip, knee, ankle };
  }

  private arm(side: -1 | 1, look: PersonLook, build: number, girth: number, skin: THREE.Material, sleeve: THREE.Material): Arm {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * SHOULDER_X * build, SHOULDER_Y - TORSO_PIVOT_Y, 0);
    const upper = new Parts();
    if (look.longSleeves) {
      upper.add(limb('upperArm', UPPER_ARM_L, girth, 0.008), sleeve);
    } else {
      // A short sleeve flaring a little to its hem, bare arm below.
      upper.add(limbGeometry(0.14, [[0, 0.056 * girth], [1, 0.057 * girth + 0.004]], { top: 1, bottom: 0.08, radial: 18 }), sleeve);
      upper.add(limb('upperArm', UPPER_ARM_L, girth), skin);
    }
    shoulder.add(...upper.meshes());

    const elbow = new THREE.Group();
    elbow.position.y = -UPPER_ARM_L;
    const lower = new Parts();
    if (look.longSleeves) lower.add(limb('forearm', FOREARM_L - 0.01, girth, 0.007, { top: 1, bottom: 0.15 }), sleeve);
    else lower.add(limb('forearm', FOREARM_L, girth), skin);
    // The wrist showing below a long sleeve's cuff.
    if (look.longSleeves) lower.add(limbGeometry(0.04, [[0, 0.028 * girth], [1, 0.026 * girth]], { top: 0, bottom: 0.8 }), skin, at(0, -FOREARM_L + 0.04, 0));
    for (const g of handGeometries(side, 0.95 + 0.1 * build)) lower.add(g, skin, at(0, -FOREARM_L + 0.004, 0));
    elbow.add(...lower.meshes());
    shoulder.add(elbow);
    const rest = side < 0 ? POSES.stand.left : POSES.stand.right;
    return { shoulder, elbow, current: { ...rest } };
  }

  /** The head in the neck pivot's frame, raised to the skull's centre; returns the eyes. */
  private buildHead(look: PersonLook, skin: THREE.Material): [Eye, Eye] {
    const shape: FaceShape = { jaw: look.jaw, nose: look.nose };
    const skull = new THREE.Group();
    skull.position.set(-NECK_PIVOT.x, HEAD_Y - NECK_PIVOT.y, -NECK_PIVOT.z);
    const face = new THREE.Mesh(headGeometry(shape), new THREE.MeshStandardMaterial({ map: paintFace(look), roughness: 0.58 }));
    face.castShadow = true;
    face.receiveShadow = true;
    skull.add(face);

    const parts = new Parts();
    const earInner = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.skin).multiplyScalar(0.72), roughness: 0.7 });
    addEars(parts, look, shape, skin, earInner);
    addHair(parts, look, shape, hairMaterial(look));
    addHat(parts, look);
    if (look.glasses !== undefined) addGlasses(parts, look.glasses, shape);
    skull.add(...parts.meshes());

    const eyes = buildEyes(look, shape);
    for (const eye of eyes) skull.add(eye.group);
    this.head.add(skull);
    return eyes;
  }
}

/** A shirt collar, the shirt's collar under a jacket, or a hood bunched at the back of the neck. */
function neckwear(parts: Parts, look: PersonLook, build: number, sleeve: THREE.Material): void {
  const neckBase = TORSO_TOP - TORSO_PIVOT_Y;
  if (look.top === 'shirt' || look.top === 'jacket') {
    const color = look.top === 'jacket' ? look.topAccent : look.topColor;
    const collar = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
    parts.add(new THREE.CylinderGeometry(0.058, 0.074, 0.04, 24, 1, true), collar, at(NECK_PIVOT.x, neckBase + 0.004, NECK_PIVOT.z + 0.004));
  }
  if (look.top === 'hoodie') {
    const hood = new THREE.SphereGeometry(0.1, 22, 12, Math.PI, Math.PI, Math.PI * 0.3, Math.PI * 0.5);
    parts.add(hood, sleeve, at(0, neckBase - 0.02, -0.045, [0, 0, 0], [1.15 * build, 0.75, 1]));
  }
}

/** A tote hanging from the left shoulder or a backpack, in the bag colour. */
function bag(parts: Parts, look: PersonLook): void {
  if (!look.bag) return;
  const cloth = new THREE.MeshStandardMaterial({ color: look.bagColor ?? 0x6b4a2a, roughness: 0.95 });
  const shoulderX = SHOULDER_X * look.build;
  if (look.bag === 'tote') {
    const hip = trunkSection(WAIST_Y, look);
    const x = -(Math.max(shoulderX + 0.06, hip.halfWidth + 0.05));
    const y = WAIST_Y - TORSO_PIVOT_Y + 0.02;
    parts.add(roundedBox(0.05, 0.34, 0.3, 4, 4), cloth, at(x, y, 0.02, [0, 0.08, 0.04]));
    // The straps, from the bag's top corners over the shoulder.
    const shoulder = new THREE.Vector3(-shoulderX * 0.75, SHOULDER_Y - TORSO_PIVOT_Y + 0.045, 0);
    for (const z of [-0.09, 0.11]) {
      parts.add(capsuleBetween(new THREE.Vector3(x + 0.01, y + 0.16, z), shoulder.clone().setZ(z * 0.3), 0.007, 5), cloth);
    }
    return;
  }
  const depth = trunkSection(1.2, look).back;
  parts.add(roundedBox(0.26 * look.build, 0.38, 0.12, 4, 4), cloth, at(0, 0.27, -(depth + 0.06)));
  parts.add(roundedBox(0.22 * look.build, 0.15, 0.025, 4, 3), new THREE.MeshStandardMaterial({ color: look.bagColor ?? 0x6b4a2a, roughness: 0.85 }), at(0, 0.37, -(depth + 0.125)));
  // Each strap follows the trunk: up the back, over the shoulder, down the chest to the armpit.
  for (const side of [-1, 1] as const) {
    const points = strapPath(look, side * 0.085 * look.build);
    for (let i = 1; i < points.length; i++) parts.add(capsuleBetween(points[i - 1]!, points[i]!, 0.008, 5), cloth);
  }
}

/** Points just off the trunk's surface at `x`, from the back at chest height over the shoulder to the front at the armpit (torso frame). */
function strapPath(look: PersonLook, x: number): THREE.Vector3[] {
  const off = 0.008;
  const surface = (y: number, sx: number, front: boolean): number => {
    const s = trunkSection(y, look);
    const u = Math.min(0.98, Math.abs(sx) / s.halfWidth);
    return (front ? 1 : -1) * ((front ? s.front : s.back) * Math.pow(1 - u ** 2.4, 1 / 2.4) + off);
  };
  // The top of the shoulder over `x`: where the trunk narrows to it.
  let top = TORSO_TOP;
  while (top > SHOULDER_Y && trunkSection(top, look).halfWidth < Math.abs(x) + 0.01) top -= 0.005;
  const out: THREE.Vector3[] = [];
  for (const y of [1.18, 1.28, 1.36, top - 0.02]) out.push(new THREE.Vector3(x, y - TORSO_PIVOT_Y, surface(y, x, false)));
  out.push(new THREE.Vector3(x, top + off - TORSO_PIVOT_Y, 0));
  for (const [y, spread] of [[top - 0.02, 0], [1.36, 0.005], [1.28, 0.015], [1.2, 0.03]] as const) {
    const sx = x + Math.sign(x) * spread;
    out.push(new THREE.Vector3(sx, y - TORSO_PIVOT_Y, surface(y, sx, true)));
  }
  return out;
}
