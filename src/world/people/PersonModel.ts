import * as THREE from 'three';
import { invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { paintTorso } from './clothTexture';
import type { PersonLook } from './looks';
import { POSES, type ArmAngles, type Pose } from './poses';

/*
 * A person built from primitives at real scale, in the stylised-but-proportioned register of a
 * good avatar system rather than a stick figure:
 *
 *   PersonModel (floor origin, faces +z)
 *   ├ hitbox
 *   └ root                     scaled to `look.height`; bobs and sways
 *     ├ hip pivots (2)         thigh, hip cap, knee pivot (knee cap, shin, ankle pivot, shoe)
 *     └ torso                  pivot at the waist; twists and leans
 *       ├ body                 a lathe with shoulders, chest, waist and hips, wearing the one
 *       │                      painted texture (trousers, belt, top, apron); breathes
 *       ├ neck, collar, hood, bag
 *       ├ shoulder pivots (2)  deltoid, upper arm, elbow pivot (elbow, forearm, hand)
 *       └ head                 skull (egg-shaped sphere) with hair, hat, beard; eyes that blink,
 *                              brows, nose, mouth, ears, glasses; turns to `gaze()`
 *
 * `update(dt)` animates: a gait with bending knees and swinging arms when `setSpeed()` is above
 * zero; breathing, a slow shift of weight and idle glances when standing; the arms easing into
 * whatever `setPose()` asked for; blinking; the head settling on the gaze target.
 */

const REFERENCE_HEIGHT = 1.72;
const HIP_Y = 0.9;
const THIGH_L = 0.42;
const SHIN_L = 0.4;
/** Torso pivot (the waist) and the span of the body lathe. */
const TORSO_PIVOT_Y = 0.95;
const TORSO_BOTTOM = 0.79;
const TORSO_TOP = 1.445;
const WAIST_Y = 0.97;
const SHOULDER_Y = 1.4;
/** Shoulder pivot from the centre line, times the build. */
const SHOULDER_X = 0.19;
const UPPER_ARM_L = 0.3;
const FOREARM_L = 0.27;
const HEAD_Y = 1.61;
/** Half-sizes of the head: a 0.1 sphere scaled to an egg. */
const HEAD_R = 0.1;
const SKULL_SCALE = new THREE.Vector3(0.86, 1.08, 0.94);
const HEAD_W = HEAD_R * SKULL_SCALE.x;
const HEAD_H = HEAD_R * SKULL_SCALE.y;
/** Elliptical section of the body lathe: wider than deep. */
const BODY_SX = 1.1;
const BODY_SZ = 0.78;
/** Radius of the body along its height (world y), before the elliptical scale. */
const BODY_PROFILE: Array<[y: number, r: number]> = [
  [TORSO_BOTTOM, 0.001],
  [0.8, 0.1],
  [0.85, 0.14],
  [0.9, 0.145],
  [0.97, 0.132],
  [1.05, 0.13],
  [1.15, 0.142],
  [1.27, 0.152],
  [1.36, 0.152],
  [1.4, 0.14],
  [1.425, 0.1],
  [1.44, 0.05],
  [TORSO_TOP, 0.001],
];
/** One step every this many metres walked. */
const STRIDE = 0.68;
const MAX_YAW = 1.15;
const MAX_PITCH = 0.55;
/** How fast the head settles on a new target and the arms on a new pose, per second. */
const GAZE_RATE = 5;
const POSE_RATE = 4;

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
  private readonly body: THREE.Mesh;
  private readonly bodyScale = new THREE.Vector3();
  private readonly head = new THREE.Group();
  private readonly eyes = new THREE.Group();
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
  private readonly scratch = new THREE.Vector3();

  constructor(look: PersonLook) {
    super();
    this.name = 'PersonModel';
    const build = look.build;
    // Limb girth follows the build a little, never as much as the trunk.
    const girth = 0.7 + 0.3 * build;
    const skin = matte(look.skin, 0.55);
    const hair = matte(look.hair, 0.85);
    const sleeve = matte(look.topColor, 0.9);
    const trousers = matte(look.trousers, 0.9);

    this.legs = [this.leg(-1, look, girth, skin, trousers), this.leg(1, look, girth, skin, trousers)];
    this.root.add(this.legs[0].hip, this.legs[1].hip);

    this.torso.position.y = TORSO_PIVOT_Y;
    this.body = bodyLathe(look, build);
    this.bodyScale.copy(this.body.scale);
    this.torso.add(this.body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.13, 14), skin);
    neck.position.y = HEAD_Y - 0.1 - TORSO_PIVOT_Y;
    neck.castShadow = true;
    this.torso.add(neck);
    this.torso.add(...neckwear(look, build));
    const bag = bagOf(look, build);
    if (bag) this.torso.add(bag);

    this.arms = [this.arm(-1, look, build, girth, skin, sleeve), this.arm(1, look, build, girth, skin, sleeve)];
    this.torso.add(this.arms[0].shoulder, this.arms[1].shoulder);

    this.head.position.y = HEAD_Y - TORSO_PIVOT_Y;
    this.head.rotation.order = 'YXZ';
    this.buildHead(look, skin, hair);
    this.torso.add(this.head);
    this.root.add(this.torso);
    this.add(this.root);

    const scale = look.height / REFERENCE_HEIGHT;
    this.root.scale.setScalar(scale);
    this.eyeHeight = (HEAD_Y + 0.012) * scale;
    const top = HEAD_Y + HEAD_H + 0.03;
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
        leg.ankle.rotation.x += (0 - leg.ankle.rotation.x) * ease;
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
    const breath = Math.sin(t * 1.6) * 0.012;
    this.body.scale.set(this.bodyScale.x * (1 + breath * 0.5), 1 + breath, this.bodyScale.z * (1 + breath * 0.8));

    // Blink: every few seconds the lids drop for a tenth of a second.
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkIn = 2 + Math.random() * 4;
      this.blink = 0.22;
    }
    if (this.blink > 0) {
      this.blink -= dt;
      const closed = Math.sin((Math.max(0, this.blink) / 0.22) * Math.PI);
      this.eyes.scale.y = 1 - closed * 0.92;
    } else this.eyes.scale.y = 1;

    // Head: towards the target, or ahead with a wandering glance.
    let yaw = Math.sin(t * 0.31) * 0.25;
    let pitch = Math.sin(t * 0.47) * 0.06;
    if (this.target) {
      const local = this.head.worldToLocal(this.scratch.copy(this.target));
      // `worldToLocal` includes the head's current turn: undo it to get the target in the neck's frame.
      local.applyEuler(this.head.rotation);
      yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -MAX_YAW, MAX_YAW);
      pitch = THREE.MathUtils.clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -MAX_PITCH, MAX_PITCH);
    }
    const gazeEase = Math.min(1, dt * GAZE_RATE);
    this.yaw += (yaw - this.yaw) * gazeEase;
    this.pitch += (pitch - this.pitch) * gazeEase;
    this.head.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private leg(side: -1 | 1, look: PersonLook, girth: number, skin: THREE.Material, trousers: THREE.Material): Leg {
    const hip = new THREE.Group();
    hip.position.set(side * 0.09 * look.build, HIP_Y, 0);
    const legCloth = look.shorts ? skin : trousers;
    hip.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.075 * girth, 14, 10), trousers)));
    const thigh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.074 * girth, 0.062 * girth, THIGH_L, 16), legCloth));
    thigh.position.y = -THIGH_L / 2;
    hip.add(thigh);
    if (look.shorts) {
      const shorts = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.082 * girth, 0.078 * girth, 0.22, 16), trousers));
      shorts.position.y = -0.1;
      hip.add(shorts);
    }

    const knee = new THREE.Group();
    knee.position.y = -THIGH_L;
    knee.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.062 * girth, 12, 8), legCloth)));
    const shin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.06 * girth, 0.046 * girth, SHIN_L, 16), legCloth));
    shin.position.y = -SHIN_L / 2;
    knee.add(shin);
    if (look.shorts) {
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * girth, 0.048 * girth, 0.07, 14), matte(0xf0ede6, 0.95));
      sock.position.y = -SHIN_L + 0.035;
      knee.add(sock);
    }

    const ankle = new THREE.Group();
    ankle.position.y = -SHIN_L;
    ankle.add(shoe(look, girth));
    knee.add(ankle);
    hip.add(knee);
    return { hip, knee, ankle };
  }

  private arm(side: -1 | 1, look: PersonLook, build: number, girth: number, skin: THREE.Material, sleeve: THREE.Material): Arm {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * SHOULDER_X * build, SHOULDER_Y - TORSO_PIVOT_Y, 0);
    const deltoid = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.058 * girth, 14, 10), sleeve));
    deltoid.position.y = -0.005;
    shoulder.add(deltoid);
    if (look.longSleeves) {
      const upper = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.048 * girth, 0.041 * girth, UPPER_ARM_L, 14), sleeve));
      upper.position.y = -UPPER_ARM_L / 2;
      shoulder.add(upper);
    } else {
      // A short sleeve, then bare arm to the elbow.
      const cuff = 0.42 * UPPER_ARM_L;
      const sleeveMesh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.052 * girth, 0.05 * girth, cuff, 14), sleeve));
      sleeveMesh.position.y = -cuff / 2;
      const bare = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.044 * girth, 0.039 * girth, UPPER_ARM_L, 14), skin));
      bare.position.y = -UPPER_ARM_L / 2;
      shoulder.add(sleeveMesh, bare);
    }

    const elbow = new THREE.Group();
    elbow.position.y = -UPPER_ARM_L;
    const lower = look.longSleeves ? sleeve : skin;
    elbow.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.04 * girth, 12, 8), lower)));
    const forearm = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.039 * girth, 0.032 * girth, FOREARM_L, 14), lower));
    forearm.position.y = -FOREARM_L / 2;
    elbow.add(forearm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), skin);
    hand.scale.set(0.5, 1.15, 0.8);
    hand.position.y = -FOREARM_L - 0.03;
    hand.castShadow = true;
    elbow.add(hand);
    shoulder.add(elbow);
    const rest = side < 0 ? POSES.stand.left : POSES.stand.right;
    return { shoulder, elbow, current: { ...rest } };
  }

  private buildHead(look: PersonLook, skin: THREE.Material, hair: THREE.Material): void {
    const head = this.head;
    // Everything hugging the skull shares its egg scale.
    const skull = new THREE.Group();
    skull.scale.copy(SKULL_SCALE);
    const face = shadowed(new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 28, 20), skin));
    skull.add(face);
    skull.add(hairOf(look, hair));
    if (look.hat) skull.add(hatOf(look));
    if (look.beard) skull.add(beardOf(look));
    head.add(skull);

    // Ears, nose, brows, mouth: on the unscaled head, placed on the egg's surface.
    for (const side of [-1, 1] as const) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), skin);
      ear.scale.set(0.45, 1.1, 0.8);
      ear.position.set(side * (HEAD_W - 0.002), 0.005, -0.008);
      head.add(ear);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.0055 * look.brows, 0.006), hair);
      brow.position.set(side * 0.034, 0.038, 0.083);
      brow.rotation.z = side * 0.12;
      head.add(brow);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), skin);
    nose.scale.set(0.8, 1.3, 1);
    nose.position.set(0, -0.012, 0.09);
    head.add(nose);
    const lips = matte(new THREE.Color(look.skin).lerp(new THREE.Color(0x5a2a2a), 0.55), 0.6);
    if (look.smile) {
      const arc = 1.9;
      const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0022, 6, 14, arc), lips);
      mouth.position.set(0, -0.04, 0.085);
      mouth.rotation.set(0.3, 0, Math.PI * 1.5 - arc / 2, 'XYZ');
      head.add(mouth);
    } else {
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.0028, 0.003), lips);
      mouth.position.set(0, -0.05, 0.084);
      head.add(mouth);
    }
    if (look.beard === 'full') {
      const moustache = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 6), hair);
      moustache.scale.set(3.2, 0.7, 0.7);
      moustache.position.set(0, -0.03, 0.089);
      head.add(moustache);
    }

    // Eyes: white, iris, pupil; the group's y scale is the blink.
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f1ec, roughness: 0.25 });
    const iris = new THREE.MeshStandardMaterial({ color: look.eyes, roughness: 0.3 });
    const pupil = new THREE.MeshStandardMaterial({ color: 0x0b0a0a, roughness: 0.3 });
    for (const side of [-1, 1] as const) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.033, 0.012, 0.081);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 14, 10), white);
      ball.scale.set(1, 0.85, 0.5);
      const irisMesh = new THREE.Mesh(new THREE.SphereGeometry(0.0068, 12, 8), iris);
      irisMesh.scale.z = 0.5;
      irisMesh.position.z = 0.0055;
      const pupilMesh = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 10, 6), pupil);
      pupilMesh.scale.z = 0.5;
      pupilMesh.position.z = 0.0085;
      eye.add(ball, irisMesh, pupilMesh);
      this.eyes.add(eye);
    }
    // The blink squashes the eyes about their own centre line.
    this.eyes.position.y = 0.012;
    for (const eye of this.eyes.children) eye.position.y = 0;
    head.add(this.eyes);

    if (look.glasses !== undefined) head.add(glasses(look.glasses));
  }
}

/** The trunk: a lathe of `BODY_PROFILE`, seam at the back, squeezed to an ellipse, wearing the painted texture. */
function bodyLathe(look: PersonLook, build: number): THREE.Mesh {
  const rows = 40;
  const points: THREE.Vector2[] = [];
  for (let j = 0; j <= rows; j++) {
    const y = THREE.MathUtils.lerp(TORSO_BOTTOM, TORSO_TOP, j / rows);
    points.push(new THREE.Vector2(profileRadius(y), y - TORSO_PIVOT_Y));
  }
  const geometry = new THREE.LatheGeometry(points, 32, Math.PI, Math.PI * 2);
  const waistV = (WAIST_Y - TORSO_BOTTOM) / (TORSO_TOP - TORSO_BOTTOM);
  const material = new THREE.MeshStandardMaterial({ map: paintTorso(look, waistV), roughness: 0.9 });
  const mesh = shadowed(new THREE.Mesh(geometry, material));
  mesh.scale.set(BODY_SX * build, 1, BODY_SZ * build);
  return mesh;
}

function profileRadius(y: number): number {
  for (let i = 1; i < BODY_PROFILE.length; i++) {
    const [y0, r0] = BODY_PROFILE[i - 1]!;
    const [y1, r1] = BODY_PROFILE[i]!;
    if (y <= y1) return THREE.MathUtils.lerp(r0, r1, (y - y0) / (y1 - y0));
  }
  return BODY_PROFILE[BODY_PROFILE.length - 1]![1];
}

/** A shirt collar, the shirt's collar under a jacket, or a hood bunched at the back of the neck. */
function neckwear(look: PersonLook, build: number): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const neckBase = TORSO_TOP - TORSO_PIVOT_Y;
  if (look.top === 'shirt' || look.top === 'jacket') {
    const color = look.top === 'jacket' ? look.topAccent : look.topColor;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.078, 0.035, 20, 1, true), matte(color, 0.9));
    (collar.material as THREE.Material).side = THREE.DoubleSide;
    collar.position.y = neckBase + 0.005;
    out.push(collar);
  }
  if (look.top === 'hoodie') {
    const hood = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 12, Math.PI, Math.PI, Math.PI * 0.3, Math.PI * 0.5), matte(look.topColor, 0.95)));
    (hood.material as THREE.Material).side = THREE.DoubleSide;
    hood.scale.set(1.15 * build, 0.75, 1);
    hood.position.set(0, neckBase - 0.02, -0.04);
    out.push(hood);
  }
  return out;
}

/** A tote on the left shoulder or a backpack, in the bag colour. */
function bagOf(look: PersonLook, build: number): THREE.Object3D | null {
  if (!look.bag) return null;
  const cloth = matte(look.bagColor ?? 0x6b4a2a, 0.95);
  const g = new THREE.Group();
  const shoulderX = SHOULDER_X * build;
  if (look.bag === 'tote') {
    const x = -(shoulderX + 0.09);
    const bag = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.3), cloth));
    bag.position.set(x, WAIST_Y - TORSO_PIVOT_Y + 0.02, 0.02);
    bag.rotation.y = 0.08;
    g.add(bag);
    for (const z of [-0.1, 0.1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.34, 0.022), cloth);
      strap.position.set((x - shoulderX) / 2 - 0.01, SHOULDER_Y - TORSO_PIVOT_Y + 0.05 - 0.12, z);
      strap.rotation.z = -0.3;
      g.add(strap);
    }
    return g;
  }
  const depth = 0.152 * BODY_SZ * build;
  const pack = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.26 * build, 0.34, 0.12), cloth));
  pack.position.set(0, 0.25, -(depth + 0.06));
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.22 * build, 0.15, 0.02), matte(look.bagColor ?? 0x6b4a2a, 0.9));
  flap.position.set(0, 0.34, -(depth + 0.125));
  g.add(pack, flap);
  for (const side of [-1, 1] as const) {
    const over = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.007, 0.26), cloth);
    over.position.set(side * 0.08 * build, SHOULDER_Y - TORSO_PIVOT_Y + 0.062, -0.03);
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.007), cloth);
    front.position.set(side * 0.08 * build, 0.32, depth - 0.006);
    g.add(over, front);
  }
  return g;
}

function shoe(look: PersonLook, girth: number): THREE.Group {
  const g = new THREE.Group();
  const upper = matte(look.shoeColor, look.shoes === 'boot' ? 0.45 : 0.65);
  const soleColor = look.shoes === 'sneaker' ? 0xe8e4dc : 0x24201c;
  const sole = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.09 * girth, 0.025, 0.24), matte(soleColor, 0.8)));
  sole.position.set(0, -0.08 + 0.0125, 0.035);
  g.add(sole);
  const toe = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.04 * girth, 0.13, 4, 12), upper));
  toe.rotation.x = Math.PI / 2;
  toe.scale.y = look.shoes === 'loafer' ? 0.55 : 0.72;
  toe.position.set(0, -0.08 + 0.025 + 0.026, 0.035);
  g.add(toe);
  if (look.shoes === 'boot') {
    const shaft = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05 * girth, 0.052 * girth, 0.13, 14), upper));
    shaft.position.set(0, -0.015, -0.005);
    g.add(shaft);
  } else if (look.shoes === 'sneaker') {
    // Laces: a lighter patch on the instep.
    const laces = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.06), matte(0xf2efe8, 0.9));
    laces.position.set(0, -0.005, 0.06);
    laces.rotation.x = 0.5;
    g.add(laces);
  }
  return g;
}

/**
 * Hair, in the skull's frame: a dome over the top and back tilted so the hairline sits on the
 * forehead and the nape goes lower, plus what the style adds (fringe, long back, bun, ponytail).
 */
function hairOf(look: PersonLook, hair: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const style = look.hairStyle;
  if (style === 'bald') {
    // Hair at the sides and back only.
    const ring = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R + 0.003, 24, 10, Math.PI, Math.PI, Math.PI * 0.3, Math.PI * 0.28), matte(look.hair, 1));
    g.add(ring);
    return g;
  }
  const tilted = new THREE.Group();
  let margin = 0.008;
  let theta = 0.442;
  let tilt = -0.487;
  if (style === 'buzz') {
    margin = 0.003;
    theta = 0.46;
    tilt = -0.45;
  } else if (style === 'curly') {
    margin = 0.026;
    theta = 0.46;
    tilt = -0.3;
  }
  const dome = shadowed(new THREE.Mesh(new THREE.SphereGeometry(HEAD_R + margin, 24, 14, 0, Math.PI * 2, 0, Math.PI * theta), style === 'buzz' || style === 'curly' ? matte(look.hair, 1) : hair));
  tilted.add(dome);
  tilted.rotation.x = tilt;
  g.add(tilted);

  if ((style === 'short' && look.brows > 1) || style === 'long') {
    // A fringe down to just above the brows.
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R + 0.01, 20, 6, Math.PI * 0.22, Math.PI * 0.56, Math.PI * 0.2, Math.PI * 0.18), hair);
    g.add(fringe);
  }
  if (style === 'long') {
    // The back falls to the shoulders; the skull frame's scale is undone so the curtain stays round.
    const curtain = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.1, 0.17, 20, 1, true, Math.PI / 2, Math.PI), hair));
    (curtain.material as THREE.Material).side = THREE.DoubleSide;
    curtain.scale.set(0.92 / SKULL_SCALE.x, 1 / SKULL_SCALE.y, 1 / SKULL_SCALE.z);
    curtain.position.set(0, -0.085 / SKULL_SCALE.y, -0.01);
    g.add(curtain);
  }
  if (style === 'bun' && !look.hat) {
    const bun = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 10), hair));
    bun.position.set(0, 0.07, -0.075);
    bun.scale.set(1 / SKULL_SCALE.x, 1 / SKULL_SCALE.y, 1 / SKULL_SCALE.z);
    g.add(bun);
  }
  if (style === 'ponytail') {
    const tail = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.13, 4, 10), hair));
    tail.scale.set(1 / SKULL_SCALE.x, 1 / SKULL_SCALE.y, 1 / SKULL_SCALE.z);
    tail.position.set(0, -0.03, -0.11);
    tail.rotation.x = 0.35;
    g.add(tail);
  }
  return g;
}

/** A peaked cap or a beanie with a folded brim, in the skull's frame, over the hair. */
function hatOf(look: PersonLook): THREE.Group {
  const g = new THREE.Group();
  const cloth = matte(look.hatColor ?? 0x2f2f33, 0.9);
  if (look.hat === 'cap') {
    const r = HEAD_R + 0.018;
    const crown = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.44), cloth));
    const peak = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.006, 20, 1, false, -Math.PI / 2, Math.PI), cloth));
    peak.position.set(0, 0.05, 0.04);
    peak.rotation.x = 0.12;
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), cloth);
    button.position.y = r;
    g.add(crown, peak, button);
    g.rotation.x = -0.26;
    return g;
  }
  const r = HEAD_R + 0.014;
  const theta = Math.PI * 0.45;
  const dome = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, theta), cloth));
  const brim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(r * Math.sin(theta), 0.012, 8, 28), cloth));
  brim.position.y = r * Math.cos(theta);
  brim.rotation.x = Math.PI / 2;
  g.add(dome, brim);
  g.rotation.x = -0.2;
  return g;
}

/** Chin and jaw, and the cheeks: hair-coloured skin of the front half, see-through for stubble. */
function beardOf(look: PersonLook): THREE.Group {
  const g = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 1, transparent: look.beard === 'stubble', opacity: look.beard === 'stubble' ? 0.45 : 1 });
  const r = HEAD_R + (look.beard === 'full' ? 0.006 : 0.002);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 8, 0, Math.PI, Math.PI * 0.68, Math.PI * 0.27), material);
  g.add(chin);
  for (const phiStart of [0, Math.PI * 0.72]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6, phiStart, Math.PI * 0.28, Math.PI * 0.5, Math.PI * 0.19), material);
    g.add(cheek);
  }
  return g;
}

function glasses(color: number): THREE.Group {
  const g = new THREE.Group();
  const frame = matte(color, 0.4);
  for (const side of [-1, 1] as const) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.002, 6, 18), frame);
    rim.position.set(side * 0.033, 0.012, 0.09);
    const temple = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.1), frame);
    temple.position.set(side * 0.067, 0.014, 0.0425);
    temple.rotation.y = side * 2.8;
    g.add(rim, temple);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, 0.003), frame);
  bridge.position.set(0, 0.014, 0.091);
  g.add(bridge);
  return g;
}

function shadowed<T extends THREE.Mesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
