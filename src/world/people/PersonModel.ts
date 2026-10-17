import * as THREE from 'three';
import { ANKLE_Y, HEAD_Y, NECK_PIVOT, PELVIS_Y, TORSO_PIVOT_Y, trunkSection, UPPER_ARM_L } from './body';
import { ACROSS_CHEST, POSE_SPOTS, POSES, type ArmAngles, type Pose } from './poses';
import { BOOK_GRIPS, CANE_ARM, heldMesh, heldOn, hoodMesh, PRAM_GRIPS, SUITCASE_ARM, UMBRELLA_ARM, type Held } from './held';
import { buildProxy } from './proxy';
import { QUALITY } from '@/graphics/quality';
import type { PersonLook } from './looks';
import type { Performer, Reaction } from './performer';
import { rigFrame, rigSteps, TOE_FLEX, type ArmBones, type LegBones, type Rig } from './rig';
import { compileBody, deferBodies, queueBody, type BodyJob } from './bodyQueue';
import { blobShadow } from '../zone/ContactShadows';
import { Face } from './motion/face';
import { faceSpecularOcclusion, PersonOcclusion } from './occlusion';
import { Footing } from './motion/footing';
import { Gait } from './motion/gait';
import { blankFace, FACE_CHANNELS, GesturePlayer, type FaceKey, type GestureName } from './motion/gestures';
import { ankleOver, orientFoot, solveArm, solveLeg, type ArmSolution } from './motion/ik';
import { idleFidget, listenFidget, respond, type Context } from './motion/repertoire';
import { Breath } from './motion/breath';
import { touchPoint, TOUCH_SPOTS } from './motion/touch';
import { smooth } from '@/math/scalar';
import { Spring, spring } from '@/math/springs';
import { seedOfLook, temperamentOf, type Temperament } from './motion/temperament';
import { lcg, random as liveRandom } from '@/random';
import { damp, dampFactor } from '@/math/damp';

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
 * the ears, the mouth), lets the face and what swings rest, and animates the arms and the head at
 * `FAR_RATE` with the time they skipped; the stance, the back and the legs still move every frame,
 * so planted feet never skate.
 *
 * Seated, the feet go flat on the floor (the legs solved to them, the knees as high as the seat
 * leaves them) or hang when the seat is too high for them; each person sits their own way: feet
 * apart, ankles crossed, or one knee over the other. Pushing off, the toes bend at the ball of the
 * foot and stay on the floor. Their contact shadow (`groundShadow`) follows the hips and the feet.
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
const EYE_RATE = 27;
/** Looking at nothing in particular, the eyes turn in for something this far off (the head's metres). */
const REST_FOCUS = 2.5;
/** The viewer's eyes either side of the camera, and their mouth below it (metres): where someone's eyes go in a conversation. */
const FACE_EYE = 0.032;
const FACE_MOUTH = 0.075;
/** How far (radians) the eyes drift between saccades. */
const EYE_DRIFT = 0.004;
/** The arms' springs (rad/s): shoulders, elbows (a little behind), wrists and fingers (quick); hands on moving controls follow stiffly. */
const ARM_OMEGA = 9;
const ELBOW_OMEGA = 8;
const HAND_OMEGA = 13;
const REACH_OMEGA = 22;
/** A box carried in both arms (`carry`): its middle's height (reference metres), the forearms about level. */
const CARRY_Y = 1.02;
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
/** Listening: a small nod (this share of a full one) every so often (s, bounds), and a fidget sooner than idle. */
const LISTEN_NOD = 0.45;
const LISTEN_NOD_EVERY: readonly [number, number] = [2.2, 6];
const LISTEN_FIDGET_EVERY: readonly [number, number] = [4, 9];
/** Standing, the body sways over the planted feet by about this much (metres), as people never stand quite still. */
const POSTURAL_SWAY = 0.006;
/** Standing, the weight rests on one leg or the other, the hips over it by this much (metres), changing every few seconds. */
const WEIGHT_SHIFT = 0.028;
const WEIGHT_EVERY: readonly [number, number] = [4, 11];
/** A deep crouch lowers the hips this far (reference metres); up on the toes raises them this far. */
const CROUCH_DROP = 0.3;
const RISE_LIFT = 0.05;
/** The leg is never quite straight (a standing knee is soft): the hips come down to within this share of its reach. */
const LEG_REACH = 0.992;
const WALK_REACH = 0.978;
/** Running (`Gait.run`): the body leans into it (radians), the knees bend more under the weight (a share of the leg's reach), the elbows bend (radians). */
const RUN_LEAN = 0.16;
const RUN_KNEE = 0.035;
const RUN_ELBOW = 1.15;
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
/**
 * Beyond the first of these (metres, by quality) someone who may (`useProxy`) is drawn as one skinned mesh on the same
 * bones (`proxy.ts`); back within the second, the whole body again.
 */
const PROXY_AT: Record<typeof QUALITY.level, readonly [number, number]> = { high: [22, 20], medium: [17, 15], low: [12, 10] };
/** How far off (metres, on this quality) someone who may is drawn as the one-draw proxy: what the street's people budget counts cheap. */
export function proxyDistance(): number {
  return PROXY_AT[QUALITY.level][0];
}
/** Those distances hold at the default field of view (70 degrees); a narrower one (photo mode's zoom) brings the far level of detail further out. */
const REFERENCE_TAN = Math.tan(THREE.MathUtils.degToRad(70) / 2);

/** What one frame's gesture player hands back. */
type GestureFrame = ReturnType<GesturePlayer['update']>;

/** How someone sits: feet apart on the floor, ankles crossed, or one knee crossed over the other. */
type SitStyle = 'apart' | 'ankles' | 'knee';
/** The contact shadow: the blob under the hips (width and depth for a person of the reference height) and one under each foot. */
const SHADOW_BODY = { width: 0.46, depth: 0.38 } as const;
const SHADOW_FOOT = { width: 0.11, depth: 0.24, opacity: 0.55 } as const;
/** The shoe's middle ahead of the ankle (`shoes.ts`). */
const FOOT_CENTRE = 0.07;

/** This frame's stances, shared by the steps of `animate`: the gait's share `w` (0 standing .. 1 walking), what the body is at. */
interface Frame {
  tempo: number;
  moving: boolean;
  w: number;
  walking: boolean;
  seated: boolean;
  standing: boolean;
  /** How much they are talking, 0..1 (fades in over 0.3 s). */
  talk: number;
  reaching: boolean;
}

/** The carriage's springs this frame: the bend of the back, the crouch, the rise on the toes, the hips' sway, and the person's slouch. */
interface Carriage {
  spine: number;
  crouch: number;
  rise: number;
  hips: number;
  slouch: number;
}

/** The pelvis's turn and roll this frame, which the back turns against. */
interface PelvisPose {
  yaw: number;
  roll: number;
}

export class PersonModel extends THREE.Group implements Performer {
  readonly hitbox: THREE.Object3D;
  /** Eye height in world metres once scaled, for whoever wants to be looked at. */
  readonly eyeHeight: number;

  /** The body (`rigSteps`): built in the constructor, or over idle moments when deferred (`bodyQueue`) and then attached (`built`). */
  private rig!: Rig;
  private occlusion: PersonOcclusion | null = null;
  private face!: Face;
  /** Whether the body is built and attached; until then the owner's asks are kept and applied to it then. */
  private built = false;
  /** The body and its contact shadow: hidden until the body is built and its programs linked. */
  private readonly holder = new THREE.Group();
  /** The deferred body's place in the queue (its priority kept up to date while waiting), null once built. */
  private job: BodyJob | null = null;
  private readonly seed: number;
  /** What was asked of a body not built yet: the height stood on, the hood, a box carried, things worn on the head, fading. */
  private standHeight = 0;
  private hoodUp = false;
  private pendingCarry: { box: THREE.Object3D; size: { w: number; d: number } } | null = null;
  private readonly pendingHead: THREE.Object3D[] = [];
  private fadeWanted = false;
  /** What the face is asked for this frame: the gesture's, plus the look of concentration (reused). */
  private readonly faceGoal = blankFace();
  private readonly gait = new Gait();
  private readonly footing = new Footing();
  private readonly gestures = new GesturePlayer();
  private readonly temper: Temperament;
  private readonly random: () => number;
  private readonly look: PersonLook;

  private pose: Pose = 'stand';
  /** The last gesture frame (the far level of detail plays gestures at its own rate). */
  private lastGesture: GestureFrame;
  /** How far forward an arm across the chest has to come for this body (radians at the shoulder: a fuller chest or belly, a coat). */
  private readonly chestRoom: number;
  /** The same in metres: how far this trunk's front (and a coat) stands out past an average one's (`POSE_SPOTS` on the torso). */
  private readonly chestOut: number;
  private readonly sitStyle: SitStyle;
  /** The leg crossed over the other (or whose ankle is on top). */
  private readonly topLeg: 0 | 1;
  private readonly seatHip = new THREE.Object3D();
  private readonly seatKnee = new THREE.Object3D();
  private shadow: { body: THREE.Mesh; feet: THREE.Mesh[] } | null = null;
  private speed = 0;
  /** How much of the gait shows, 0 standing .. 1 walking, eased over `GAIT_S`. */
  private gaitIn = 0;
  private wasMoving = false;
  /** Seconds left of talking (`talk`). */
  private talking = 0;
  private time = liveRandom() * 100;

  // The director's asks (`lean`, `crouch`, ...) and the springs that ease the body onto them.
  private leanAngle = 0;
  private crouchAmount = 0;
  private riseAmount = 0;
  private readonly spineSpring = new Spring(0, 6, 0.9);
  private readonly crouchSpring = new Spring(0, 7, 0.75);
  private readonly riseSpring = new Spring(0, 12, 0.8);
  private readonly hipsSpring = new Spring(0, 12, 0.8);
  private readonly shrugSprings = [new Spring(0, 10, 0.8), new Spring(0, 10, 0.8)];
  private armSprings!: Record<'ux' | 'uz' | 'lx' | 'ly' | 'lz' | 'wf' | 'tw' | 'curl', Spring>[];
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
  /** The eyes' slow drift between saccades (its phase). */
  private readonly eyeDriftPhase = liveRandom() * 6.3;
  /** How far each eye turns in, and how much wider the pupils open, eased (`Face.setFocus`). */
  private eyeVergence = 0.012;
  private pupilWiden = 0;
  /** On the viewer's face: where the eyes rest (0, 1 their eyes, 2 their mouth), for how long yet, as an offset from the camera. */
  private fixation = 0;
  private fixationIn = 0;
  private readonly fixationOffset = new THREE.Vector3();
  private readonly viewerEye = new THREE.Vector3();
  private nodding = 0;
  /** How deep the nod under way is (a full one, or a listener's small one). */
  private nodDepth = NOD_DEPTH;
  /** Seconds left of listening to someone (`listen`), and until the next small nod while they do. */
  private listening = 0;
  private listenNodIn = 1;
  /** The breath: how full the chest is, a sigh now and then (`Breath`). */
  private readonly breath: Breath;
  /** Standing, where the weight is (-1 on the -x leg .. 1 on the +x leg), as a spring towards `weightGoal`, changed every so often. */
  private weight = 0;
  private weightVelocity = 0;
  private weightGoal = 0;
  private weightIn = 2 + liveRandom() * 6;
  /** Per arm, how far a hand is raised in a gesture while talking (eased to the goal), and when the goals change. */
  private readonly beat = [0, 0];
  private readonly beatGoal = [0, 0];
  private beatIn = 0;
  /** Seconds until the next idle fidget. */
  private fidgetIn: number;
  /** This person's own slow drifts (frequencies, rad/s, and phases): no two sway alike. */
  private readonly drifts = Array.from({ length: 6 }, () => [0.17 + liveRandom() * 0.2, 0.47 + liveRandom() * 0.4, liveRandom() * 6.3, liveRandom() * 6.3] as const);

  /** World points the palms are on (a joystick, a flipper button, a ball), per arm; null: the pose decides. */
  private readonly reachTargets: [THREE.Vector3 | null, THREE.Vector3 | null] = [null, null];
  /** World points each hand holds on to even while walking (a child's hand, a pram's handle): `grip`. */
  private readonly grips: [THREE.Vector3 | null, THREE.Vector3 | null] = [null, null];
  private readonly gripAt = [new THREE.Vector3(), new THREE.Vector3()];
  /** The one-draw body for across the street (`useProxy`), made when first needed; whether it is what shows; the full body's meshes it stands in for. */
  private proxyAllowed = false;
  private proxy: THREE.SkinnedMesh | null = null;
  private proxied = false;
  private bodyMeshes: THREE.Mesh[] | null = null;
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
  private readonly heldMeshes = new Map<Held | 'hood' | 'carried', THREE.Object3D>();
  /** Half the width of what is carried in both arms (`carry`): the palms go on its sides. */
  private carriedHalf = 0;

  // What hangs and swings: angles and speeds of the ponytail and the bag, and where they were.
  private readonly swing = { tail: [0, 0, 0, 0], bag: [0, 0, 0, 0], hood: [0, 0, 0, 0] };
  private readonly lastAnchor = { tail: new THREE.Vector3(), bag: new THREE.Vector3(), hood: new THREE.Vector3() };
  private readonly lastVelocity = { tail: new THREE.Vector3(), bag: new THREE.Vector3(), hood: new THREE.Vector3() };
  private swingPrimed = false;

  private readonly scratch = new THREE.Vector3();
  private readonly touchAt = new THREE.Vector3();
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

  /**
   * `viewer` (the camera), when given, sets the level of detail by distance; `seed` the way they move (default: from
   * the look). `deferred`: the body is built over idle moments (`bodyQueue`, the nearest first) instead of now; until
   * it is, the person is not drawn but stands, is clicked and is asked things as usual (kept for the body).
   */
  constructor(look: PersonLook, viewer?: THREE.Object3D, seed?: number, options: { deferred?: boolean } = {}) {
    super();
    this.name = 'PersonModel';
    this.viewer = viewer ?? null;
    this.look = look;
    const s = seed ?? seedOfLook(look);
    this.seed = s;
    this.temper = temperamentOf(s, look);
    this.breath = new Breath(this.temper.breath);
    this.random = lcg(s * 2654435761 + 7);
    this.fidgetIn = this.temper.fidgetEvery * (0.4 + liveRandom());
    const frame = rigFrame(look);
    this.hitbox = frame.hitbox;
    this.add(this.hitbox);
    this.eyeHeight = frame.eyeHeight;
    this.holder.name = 'PersonBody';
    this.add(this.holder);
    this.lastGesture = this.gestures.update(0);
    // The arms' room in front of the chest: what this trunk has over a straight, average one there.
    const average = trunkSection(1.15, { ...look, build: 1, figure: 'straight' }).front;
    const extra = Math.max(0, trunkSection(1.15, look).front - average) + (look.top === 'jacket' || look.coat ? 0.008 : 0);
    this.chestOut = extra;
    this.chestRoom = (extra / UPPER_ARM_L) * 1.3;
    const sitting = lcg(s * 40503 + 17);
    const roll = sitting();
    this.sitStyle = roll < 0.5 ? 'apart' : roll < 0.75 ? 'ankles' : 'knee';
    this.topLeg = sitting() < 0.5 ? 0 : 1;
    const steps = rigSteps(look);
    if (options.deferred && deferBodies()) {
      this.holder.visible = false;
      const job: BodyJob = {
        priority: Infinity,
        step: () => {
          const next = steps.next();
          if (!next.done) return false;
          this.wearBody(next.value);
          // Shown once its programs are linked (a first draw linking them was the hitch this avoids).
          void compileBody(this.rig.root).then(() => (this.holder.visible = true));
          return true;
        },
      };
      this.job = job;
      queueBody(job);
    } else {
      let next = steps.next();
      while (!next.done) next = steps.next();
      this.wearBody(next.value);
    }
  }

  /** Whether the body is built (a deferred one shows once it is). */
  get hasBody(): boolean {
    return this.built;
  }

  /** The body built: hung on the person, its face and arms set up, and what was asked meanwhile applied to it. */
  private wearBody(rig: Rig): void {
    const look = this.look;
    const s = this.seed;
    this.rig = rig;
    this.holder.add(rig.root);
    // The body's light kept from itself (capsules along the bones), the face's creases, the conversation's portrait light.
    this.occlusion = PersonOcclusion.build(rig, look);
    this.occlusion?.patch(rig.root, this.hitbox);
    faceSpecularOcclusion(rig.face.material as THREE.Material);
    this.face = new Face(rig.face, rig.morphs, rig.eyes, 0.03 + liveRandom() * 0.05 + (look.age === 'elder' ? 0.05 : 0), rig.mouthOpen, rig.wrinkles);
    // Their own smile: a trace of one at rest for a smiley person, one side leading (from the seed, so always the same).
    this.face.setCharacter(look.smile ? 0.15 + (Math.abs(s * 0.618) % 1) * 0.15 : 0, (Math.abs(s * 0.377) % 1) * 2 - 1);
    this.armSprings = rig.arms.map((arm) => {
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
    this.built = true;
    this.job = null;
    // A body built after the person was placed is on the layers the person is on (the zone's shadow layer).
    const mask = this.layers.mask;
    rig.root.traverse((o) => (o.layers.mask |= mask));
    // What was asked meanwhile.
    rig.root.position.y = this.standHeight;
    if (this.held) this.showHeld(this.held);
    if (this.pendingCarry) {
      const { box, size } = this.pendingCarry;
      this.pendingCarry = null;
      this.carry(box, size);
    }
    for (const object of this.pendingHead.splice(0)) this.wearOnHead(object);
    if (this.hoodUp) this.setHood(true);
    if (this.fadeWanted) {
      this.collectFade();
      this.setOpacity(this.opacity);
    }
    this.placeShadow();
  }

  // --- What the owner asks for ----------------------------------------------------------------

  /** Walking speed in m/s; 0 stands still (the feet then stay planted and step when they must). Drives the gait only, moving the model is the owner's job. */
  setSpeed(speed: number): void {
    this.speed = Math.max(0, speed);
  }

  /** Talking for `seconds` (or as long as `text`, when given, takes to say): the mouth on the words (or on syllables), small nods, the hands with them. */
  talk(seconds: number, text?: string): void {
    // With the words, the mouth shapes their sounds (and keeps going as long as they take to say).
    const saying = text && this.built ? this.face.say(text) : 0;
    this.talking = Math.max(this.talking, seconds, saying);
  }

  /** A small nod of acknowledgement (meeting someone's eyes, a greeting). */
  nod(depth = NOD_DEPTH): void {
    if (this.nodding > 0) return;
    this.nodding = NOD_S;
    this.nodDepth = depth;
  }

  /**
   * Listening to someone (the player, in a conversation) for `seconds` from now: while they are not
   * talking themselves, small nods now and then (a blink with them), the weight shifting more often,
   * and the fidgets of someone waiting on what is said (the chin on the hand, the hands joined, the head on one side).
   */
  listen(seconds: number): void {
    if (this.listening <= 0) this.listenNodIn = 0.8 + this.random() * 1.5;
    this.listening = Math.max(this.listening, seconds);
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
    if (this.built) this.face.feel(expression, seconds);
  }

  /** Something happened to them: they show it in their own way (a gesture, a face, a nod). */
  react(reaction: Reaction): void {
    const response = respond(reaction, this.context(), this.random);
    if (response.gesture) this.gesture(response.gesture);
    this.feel(response.face, response.seconds);
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
    this.standHeight = height;
    if (this.built) this.rig.root.position.y = height;
  }

  release(): void {
    this.reachTargets[0] = this.reachTargets[1] = null;
    this.footTargets[0] = this.footTargets[1] = null;
    this.crouchAmount = this.riseAmount = 0;
    this.handCurl = null;
    this.handFlex = [0.15, 0.15];
    this.directedGaze = null;
    this.standHeight = 0;
    if (this.built) this.rig.root.position.y = 0;
  }

  footAt(foot: 0 | 1, point: THREE.Vector3 | null): void {
    if (point) (this.footTargets[foot] ??= new THREE.Vector3()).copy(point);
    else this.footTargets[foot] = null;
  }

  palm(hand: 0 | 1, out: THREE.Vector3): THREE.Vector3 {
    // No body yet: about where a hand hangs.
    if (!this.built) return this.localToWorld(out.set(hand === 1 ? 0.2 : -0.2, this.eyeHeight * 0.5, 0));
    const wrist = this.rig.arms[hand].wrist;
    wrist.updateWorldMatrix(true, false);
    return wrist.localToWorld(out.set(0, -this.rig.palm, 0));
  }

  /**
   * Something in the right hand: a phone (pair it with the `phone` pose; at the ear while walking), an open
   * book in both (`read`: they hold it up walking or not), an umbrella over the head (the arm holds it up even
   * while walking); null: empty-handed.
   */
  hold(item: Held | null): void {
    if (item === this.held) return;
    const was = this.held ? this.heldMeshes.get(this.held) : undefined;
    if (was) was.visible = false;
    this.held = item;
    if (item && this.built) this.showHeld(item);
  }

  /** The held thing's mesh, made on first use, on the body. */
  private showHeld(item: Held): void {
    let mesh = this.heldMeshes.get(item);
    if (!mesh) {
      const seed = Math.round(this.look.height * 1000);
      mesh = heldMesh(item, seed);
      // A book before the chest clears a fuller one.
      if (item === 'book') mesh.position.z += this.chestOut;
      const on = heldOn(item);
      (on === 'torso' ? this.rig.torso : on === 'body' ? this : this.rig.arms[1].wrist).add(mesh);
      this.adoptFade(mesh);
      this.heldMeshes.set(item, mesh);
    }
    mesh.visible = true;
  }

  /**
   * A box carried in front in both arms (a crate, a parcel): `box`, centred on its own origin, `size` metres across and deep,
   * goes against the belly in the torso's frame (at its own size, whatever the person's height) and the palms hold
   * its sides, walking or not; null takes it off the body (detached: the caller keeps it) and frees the hands.
   */
  carry(box: THREE.Object3D | null, size: { w: number; d: number } = { w: 0, d: 0 }): void {
    const old = this.heldMeshes.get('carried');
    if (old === box) return;
    if (old) {
      old.removeFromParent();
      this.heldMeshes.delete('carried');
    }
    if (!box) return;
    if (!this.built) {
      this.pendingCarry = { box, size };
      this.carriedHalf = size.w / 2;
      return;
    }
    const scale = this.rig.scale;
    box.scale.setScalar(1 / scale);
    // Its back a little off the belly.
    box.position.set(0, CARRY_Y - TORSO_PIVOT_Y, trunkSection(CARRY_Y, this.look).front + 0.02 + size.d / 2 / scale);
    this.rig.torso.add(box);
    this.adoptFade(box);
    this.heldMeshes.set('carried', box);
    this.carriedHalf = size.w / 2;
  }

  /**
   * The `hand` (0 the -x hand, 1 the +x) holding on to a world point, walking or not (a child's hand in a grown-up's):
   * the arm is solved to it every frame; null lets go. Copied: call it each frame as the point moves.
   */
  grip(hand: 0 | 1, point: THREE.Vector3 | null): void {
    if (point) (this.grips[hand] ??= new THREE.Vector3()).copy(point);
    else this.grips[hand] = null;
  }

  /**
   * Far enough off, drawn as one skinned mesh on the same bones (`proxy.ts`, one draw instead of dozens): for the
   * crowds (the street's), where the far ones are many. Built when first needed.
   */
  useProxy(): void {
    this.proxyAllowed = true;
  }

  /** Something worn on the head (a witch's hat, a ghost's sheet): in the skull's frame (its centre), fading with the person. */
  wearOnHead(object: THREE.Object3D): void {
    if (!this.built) {
      this.pendingHead.push(object);
      return;
    }
    this.rig.skull.add(object);
    this.adoptFade(object);
  }

  /** Whether the one-draw proxy is what shows now. */
  get isProxy(): boolean {
    return this.proxied;
  }

  /** The hood up over the head (in the snow) or down. */
  setHood(up: boolean): void {
    this.hoodUp = up;
    if (!this.built) return;
    let hood = this.heldMeshes.get('hood');
    if (!up && !hood) return;
    if (!hood) {
      hood = hoodMesh(this.look.top === 'jacket' ? this.look.topAccent : this.look.topColor);
      this.rig.head.add(hood);
      this.adoptFade(hood);
      this.heldMeshes.set('hood', hood);
    }
    hood.visible = up;
    // The hood down on the back is the one now up.
    if (this.rig.hood) this.rig.hood.visible = !up;
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
    this.fadeWanted = true;
    if (this.built) this.collectFade();
  }

  /** `enableFade` on the built body: every material it wears made to dither. */
  private collectFade(): void {
    if (this.fading) return;
    const list: { material: THREE.Material; opacity: number }[] = [];
    const seen = new Set<THREE.Material>();
    this.traverse((o) => {
      const mesh = o as THREE.Mesh;
      // The contact shadow's material is every blob's: the owner hides it instead.
      if (!mesh.isMesh || mesh === this.hitbox || mesh.name === 'ContactShadow') return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!material.visible || seen.has(material)) continue;
        seen.add(material);
        // A cut-out by coverage (the hair's strands) fades by its own alpha: a hash would speckle its soft edges.
        if (!material.transparent && !material.alphaToCoverage) material.alphaHash = true;
        list.push({ material, opacity: material.opacity });
      }
    });
    this.fading = list;
  }

  /** 0 gone .. 1 solid, after `enableFade` (a no-op before). */
  setOpacity(opacity: number): void {
    this.opacity = opacity;
    if (!this.fading) return;
    for (const f of this.fading) f.material.opacity = f.opacity * opacity * (this.rig.detailMaterials.has(f.material) ? this.detailLevel : 1);
    // The bent parts' own shadow materials (trunk, skirts, long hair) do not dither: they stop casting a shadow as it fades.
    for (const mesh of this.rig.casters) mesh.castShadow = opacity > 0.5;
  }

  update(dt: number): void {
    if (!this.built) {
      // Waiting in the queue: the nearest are built first.
      if (this.job && this.viewer) this.job.priority = this.getWorldPosition(this.here).distanceTo(this.viewer.getWorldPosition(this.viewerPos));
      return;
    }
    if (this.viewer) this.pickDetail(this.viewer);
    this.occlusion?.updatePortrait(dt, this);
    this.pending += dt;
    if (!this.far) {
      const step = Math.min(0.25, this.pending);
      this.pending = 0;
      this.animate(step, step);
      return;
    }
    // Far: the stance, the back and the legs every frame; the arms, the head and the face at `FAR_RATE`.
    const upper = this.pending >= 1 / FAR_RATE;
    this.animate(Math.min(0.25, dt), upper ? Math.min(0.25, this.pending) : 0);
    if (upper) this.pending = 0;
  }

  /** How far above `point` the eyes are now (world metres; negative: below it): a conversation frames the face, not the words over the head. */
  eyesAbove(point: THREE.Object3D): number {
    if (!this.built) return this.getWorldPosition(this.here).y + this.eyeHeight - point.getWorldPosition(this.viewerPos).y;
    const skull = this.rig.skull;
    skull.updateWorldMatrix(true, false);
    const eyes = skull.localToWorld(this.scratch.set(0, 0.014, 0.085)).y;
    return eyes - point.getWorldPosition(this.viewerPos).y;
  }

  /**
   * Its contact shadow, a child of the model: a soft blob under the hips sized to the person and
   * a smaller one under each foot (shrinking as the foot lifts), following them every frame. Null
   * when contact shadows are off. The owner hides it as the person fades.
   */
  groundShadow(): THREE.Object3D | null {
    const body = blobShadow(SHADOW_BODY.width, SHADOW_BODY.depth);
    if (!body) return null;
    const feet = [blobShadow(SHADOW_FOOT.width, SHADOW_FOOT.depth, SHADOW_FOOT.opacity)!, blobShadow(SHADOW_FOOT.width, SHADOW_FOOT.depth, SHADOW_FOOT.opacity)!];
    const group = new THREE.Group();
    group.name = 'PersonShadow';
    group.add(body, ...feet);
    // With the body: hidden until it is built.
    this.holder.add(group);
    this.shadow = { body, feet };
    if (this.built) this.placeShadow();
    return group;
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
      if (!material.alphaToCoverage) material.alphaHash = true;
      this.fading!.push({ material, opacity: material.opacity });
      material.opacity *= current;
    });
  }

  /** Near or far from `viewer`, with some slack both ways so it does not flicker at the edge. */
  private pickDetail(viewer: THREE.Object3D): void {
    viewer.getWorldPosition(this.viewerPos);
    const distance = this.getWorldPosition(this.here).distanceTo(this.viewerPos) / magnification(viewer);
    this.fadeDetails(1 - THREE.MathUtils.smoothstep(distance, DETAIL_FADE[0], DETAIL_FADE[1]));
    this.occlusion?.reach(distance);
    this.far = distance > (this.far ? LOD_NEAR : LOD_FAR);
    if (this.proxyAllowed) {
      const [out, back] = PROXY_AT[QUALITY.level];
      this.setProxied(distance > (this.proxied ? back : out));
    }
  }

  /**
   * The proxy in, the full body's meshes off the camera's layer (held things and the hood stay: they hang on the
   * same bones), or the other way. Back to the full body, the next frame poses the upper body at once.
   */
  private setProxied(on: boolean): void {
    if (on === this.proxied) return;
    if (on && !this.proxy) {
      this.bodyMeshes = [];
      this.rig.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) this.bodyMeshes!.push(o as THREE.Mesh);
      });
      // Held things made before now are not the body's.
      const held = new Set<THREE.Object3D>();
      for (const mesh of this.heldMeshes.values()) mesh.traverse((o) => held.add(o));
      this.bodyMeshes = this.bodyMeshes.filter((m) => !held.has(m));
      this.proxy = buildProxy(this.rig, this.look);
      // On whatever layers the body is (the zone's shadow layer), and fading with it.
      this.proxy.layers.mask = this.rig.trunk.layers.mask;
      this.adoptFade(this.proxy);
    }
    this.proxied = on;
    this.proxy!.visible = on;
    for (const mesh of this.bodyMeshes!) {
      if (on) mesh.layers.disable(0);
      else mesh.layers.enable(0);
    }
    if (!on) this.pending = Math.max(this.pending, 1 / FAR_RATE);
  }

  /** The details at `level` (0..1): dithered by their materials' opacity, hidden (not drawn) at 0. */
  private fadeDetails(level: number): void {
    if (level === this.detailLevel) return;
    this.detailLevel = level;
    for (const detail of this.rig.details) detail.visible = level > 0;
    for (const [material, opacity] of this.rig.detailMaterials) material.opacity = opacity * this.opacity * level;
  }

  // --- A frame of the body --------------------------------------------------------------------

  /**
   * One frame of the body, in layers, each a step below: the gait and the stances it leaves, the idle fidgets, the
   * weight on the legs, the carriage's springs, the pelvis, the back, the legs, the talking hands, the arms, the head,
   * the face. The order is the order the draws and the springs were always run in.
   */
  private animate(dt: number, upperDt: number): void {
    this.time += dt;
    const t = this.time;
    this.updateWorldMatrix(true, false);
    const bodyYaw = worldYaw(this.getWorldQuaternion(this.worldQ));
    // The upper body's layers this frame (always near; at `FAR_RATE` far off, with the time they skipped).
    const upper = upperDt > 0;

    const f = this.stance(dt, bodyYaw);
    if (upper) {
      this.fidget(upperDt, f);
      this.lastGesture = this.gestures.update(upperDt);
    }
    const g = this.lastGesture;
    this.shiftWeight(dt, f);
    const c = this.carriage(dt, f, g);
    this.breath.update(dt, f.w, f.talk, (f.standing || f.seated) && !this.held && !this.heldMeshes.has('carried') && !this.gestures.playing);
    this.listening = Math.max(0, this.listening - dt);
    const p = this.placePelvis(dt, t, f, c);
    this.bendBack(t, f, g, c, p);
    // Legs: seated they fold on the seat; otherwise the feet, planted or walking, and the legs solved to reach them.
    if (f.seated) this.seatLegs(dt);
    else this.standLegs(dt, f.w, bodyYaw, f.tempo);
    // The proxy rides the bones alone: the surfaces bent in their shaders, the face and the hair wait for the return.
    const full = !this.proxied;
    if (full) {
      this.rig.skirt?.update(this.rig.legs[0].hip, this.rig.legs[1].hip);
      this.rig.hem?.update(dt, this.rig.legs[0].hip.quaternion, this.rig.legs[1].hip.quaternion);
      for (const leg of this.rig.legs) leg.skin.leg(leg.hip.quaternion, leg.knee.quaternion, leg.ankle.quaternion, leg.knee.position.y, leg.ankle.position.y);
    }
    this.placeShadow();
    if (upper) {
      this.beatHands(upperDt, f);
      // Arms, hands, collarbones.
      for (const [i, arm] of this.rig.arms.entries()) this.moveArm(i, arm, upperDt, t, f.w, f.moving, f.standing, f.talk, f.tempo);
      this.moveHead(upperDt, t, f.walking, f.seated, f.reaching, f.talk, g.head, g.ownGaze);
      if (full) {
        this.showFace(upperDt, t, f, g);
        this.skinLimbs();
      }
    }
    if (full) this.rig.hairFollow?.update(this.rig.head, this.rig.skull);
  }

  /** The arms', the neck's and the shoulders' surfaces onto their bones as they are now (`LimbSkin`, `SpineSkin.shoulders`). */
  private skinLimbs(): void {
    const rig = this.rig;
    for (const arm of rig.arms) arm.skin.arm(arm.shoulder.rotation, arm.elbow.rotation, arm.wrist.rotation, arm.elbow.position.y, arm.wrist.position.y);
    rig.neck.neck(rig.head.rotation, rig.head.scale);
    rig.spine.shoulders();
  }

  /** The contact shadow under the hips and each foot (the rig's root frame, scaled). */
  private placeShadow(): void {
    const shadow = this.shadow;
    if (!shadow) return;
    const rig = this.rig;
    const scale = rig.scale;
    const root = rig.root.position;
    const pelvis = rig.pelvis.position;
    shadow.body.position.set(root.x + pelvis.x * scale, shadow.body.position.y, root.z + pelvis.z * scale);
    const width = SHADOW_BODY.width * scale * (0.8 + 0.2 * this.look.build);
    shadow.body.scale.set(width, 1, SHADOW_BODY.depth * scale);
    for (const [i, blob] of shadow.feet.entries()) {
      const ankle = this.ankles[i]!;
      const yaw = (rig.legs[i]!.ankle.userData.yaw as number | undefined) ?? 0;
      const lift = Math.max(0, ankle.y - ANKLE_Y);
      const k = scale / (1 + lift * 12);
      blob.position.set(root.x + (ankle.x + Math.sin(yaw) * FOOT_CENTRE) * scale, blob.position.y, root.z + (ankle.z + Math.cos(yaw) * FOOT_CENTRE) * scale);
      blob.rotation.y = yaw;
      blob.scale.set(SHADOW_FOOT.width * k, 1, SHADOW_FOOT.depth * k);
    }
  }

  /** The gait comes in and settles over `GAIT_S` (its feet are left where they are when it stops); from it, the frame's stances. */
  private stance(dt: number, bodyYaw: number): Frame {
    const moving = this.speed > 0.02;
    if (moving && !this.wasMoving && this.gaitIn === 0) this.gait.phase = 0.62;
    if (!moving && this.wasMoving) this.footing.follow(this.gait.feet, this.toWorld, bodyYaw);
    this.wasMoving = moving;
    this.gaitIn = moving ? Math.min(1, this.gaitIn + dt / GAIT_S) : Math.max(0, this.gaitIn - dt / GAIT_S);
    const w = smooth(this.gaitIn);
    const walking = w > 0;
    // The gait lays the feet out in the rig's own (reference) metres: the speed too.
    if (moving) this.gait.update(dt, this.speed / this.rig.scale, this.look.build);
    const seated = !walking && this.seatHeight !== null;
    const standing = !walking && !seated;
    const talk = this.talking > 0 ? Math.min(1, this.talking / 0.3) : 0;
    this.talking = Math.max(0, this.talking - dt);
    const reaching = !moving && (this.reachTargets[0] !== null || this.reachTargets[1] !== null);
    return { tempo: this.temper.tempo, moving, w, walking, seated, standing, talk, reaching };
  }

  /** A fidget now and then when idle (what plays is the gesture player's). */
  private fidget(dt: number, f: Frame): void {
    this.fidgetIn -= dt;
    if (this.fidgetIn > 0) return;
    const listening = this.listening > 0;
    this.fidgetIn = listening ? THREE.MathUtils.lerp(LISTEN_FIDGET_EVERY[0], LISTEN_FIDGET_EVERY[1], this.random()) : this.temper.fidgetEvery * (0.5 + this.random());
    if (!f.walking && !f.talk && !this.gestures.playing) {
      const fidget = listening ? listenFidget(this.context(), this.random) : idleFidget(this.context(), this.random);
      if (fidget) this.gesture(fidget);
    }
  }

  /** Weight on one leg for a while, then the other (or both); while a foot steps it is on the other one. */
  private shiftWeight(dt: number, f: Frame): void {
    // Someone listening shifts their weight more often.
    this.weightIn -= dt * (this.listening > 0 ? 1.7 : 1);
    if (this.weightIn <= 0) {
      this.weightIn = THREE.MathUtils.lerp(WEIGHT_EVERY[0], WEIGHT_EVERY[1], this.random());
      const roll = this.random();
      this.weightGoal = roll < 0.2 ? 0 : (roll < 0.6 ? -1 : 1) * (0.6 + this.random() * 0.4);
    }
    const stepping = this.footing.stepping;
    const weightGoal = !f.standing ? 0 : stepping >= 0 ? (stepping === 0 ? 1 : -1) : f.reaching ? this.weightGoal * 0.4 : this.weightGoal;
    [this.weight, this.weightVelocity] = spring(this.weight, this.weightVelocity, weightGoal, stepping >= 0 ? 7 : 2.6, dt);
  }

  /** The back, the knees, the toes, the hips: the director's asks, the gesture's, the person's own carriage, each on its spring. */
  private carriage(dt: number, f: Frame, g: GestureFrame): Carriage {
    const { w, seated, walking, reaching, tempo } = f;
    const slouch = this.temper.slouch;
    const spine = this.spineSpring.step(
      (seated ? this.leanAngle : this.leanAngle * (1 - w)) + g.spine + slouch * 0.1 + 0.05 * w * this.gait.amount + RUN_LEAN * w * this.gait.run + (reaching ? 0.03 : 0),
      dt,
      6 * tempo,
    );
    const crouch = this.crouchSpring.step(seated ? 0 : this.crouchAmount * (1 - w) + g.crouch, dt, 7 * tempo);
    const rise = this.riseSpring.step(seated || walking ? 0 : this.riseAmount + g.rise, dt, 12 * tempo);
    const hips = this.hipsSpring.step(g.hips, dt);
    return { spine, crouch, rise, hips, slouch };
  }

  /** Pelvis: turned, tilted and swayed by the gait, shifted over the standing leg, lowered by a crouch, back as the body bends. */
  private placePelvis(dt: number, t: number, f: Frame, c: Carriage): PelvisPose {
    const { w, walking, seated } = f;
    const { spine, crouch, rise, hips } = c;
    const rig = this.rig;
    const pelvis = rig.pelvis;
    const pelvisPitch = spine * LEAN_SHARE[0] + (walking ? 0.03 * w : 0);
    const yaw = this.gait.pelvisYaw * w;
    const roll = this.gait.pelvisRoll * w + 0.045 * this.weight * (1 - w);
    const scale = rig.scale;
    // Down onto a seat slower than the legs fold (no thigh through the cushion); up from it with the legs pushing (solved to the planted feet).
    this.seatBlend = damp(this.seatBlend, seated ? 1 : 0, SEAT_RATE, dt);
    const sat = this.seatBlend;
    // Standing still is never still: a slow sway over the planted feet (the legs are solved to them).
    const sway = (1 - w) * (1 - sat) * POSTURAL_SWAY;
    pelvis.position.set(
      (this.gait.sway * w + WEIGHT_SHIFT * this.weight * (1 - w)) * (1 - sat) + sway * this.drift(t, 4),
      THREE.MathUtils.lerp(PELVIS_Y + rig.proportions.legRise + rise * RISE_LIFT - crouch * CROUCH_DROP, (this.lastSeat + 0.07) / scale, sat),
      THREE.MathUtils.lerp(-0.16 * Math.sin(Math.max(0, spine - 0.05)) - 0.1 * crouch + hips + sway * this.drift(t, 5), 0.12 / scale, sat),
    );
    if (seated) pelvis.rotation.set(-0.06 + spine * 0.2, this.drift(t, 0) * 0.02, 0, 'YXZ');
    else pelvis.rotation.set(pelvisPitch * (1 - sat) + (-0.06 + spine * 0.2) * sat, yaw, roll * (1 - sat), 'YXZ');
    this.pelvisQ.copy(pelvis.quaternion);
    return { yaw, roll };
  }

  /** The back: the lean shared down it, the chest turning against the hips as they walk and with a wide turn of the head; the breath. */
  private bendBack(t: number, f: Frame, g: GestureFrame, c: Carriage, p: PelvisPose): void {
    const { walking, standing, talk } = f;
    const { spine, slouch } = c;
    const rig = this.rig;
    const drift0 = this.drift(t, 0);
    const drift1 = this.drift(t, 1);
    rig.lumbar.rotation.set(spine * LEAN_SHARE[1] + slouch * 0.04, this.twist * 0.35 - p.yaw * 0.4, -p.roll * 0.35, 'YXZ');
    rig.chest.rotation.set(
      spine * LEAN_SHARE[2] + slouch * 0.08 + (standing ? drift1 * 0.012 : 0),
      this.twist * 0.65 + g.twist - p.yaw * 0.55 + (walking ? 0 : drift0 * 0.03),
      -p.roll * 0.3 + talk * Math.sin(t * 2.3) * 0.015,
      'YXZ',
    );
    // The chest fills about its emptied rest (a sigh much more), the back straightening a touch with the breath in.
    const breath = (this.breath.fill - 0.45) * 0.024;
    rig.chest.rotation.x -= this.breath.fill * 0.008 - this.breath.sighing * 0.03;
    rig.spine.update(rig.lumbar, rig.chest, rig.trunk.position, breath, CHEST_CENTRE);
  }

  /** Talking with the arms free, the hands come up with the words now and then. */
  private beatHands(dt: number, f: Frame): void {
    const beats = f.talk > 0 && f.standing && !f.reaching && this.pose === 'stand' && !this.held && !this.heldMeshes.has('carried') && !this.gestures.playing;
    this.beatIn -= dt;
    if (this.beatIn <= 0) {
      this.beatIn = 0.5 + this.random() * 1.1;
      const main = this.random() < 0.65 ? 1 : 0;
      this.beatGoal[main] = beats && this.random() < 0.75 ? (0.35 + this.random() * 0.65) * this.temper.energy : 0;
      this.beatGoal[1 - main] = beats && this.random() < 0.3 ? (0.3 + this.random() * 0.5) * this.temper.energy : 0;
    }
    if (!beats) this.beatGoal[0] = this.beatGoal[1] = 0;
  }

  /** The face and the swinging parts, close up only: far off the face rests and the swing stays primed for the return. */
  private showFace(dt: number, t: number, f: Frame, g: GestureFrame): void {
    if (this.far) {
      this.face.rest();
      this.swingPrimed = false;
      return;
    }
    const concentrate = f.reaching && !g.face.smile ? 1 : 0;
    const goal = this.faceGoal;
    for (const name of FACE_CHANNELS) goal[name] = g.face[name];
    goal.frown += concentrate * 0.18;
    goal.squint += concentrate * 0.1;
    goal.press += concentrate * 0.15;
    this.face.update(dt, t, f.talk, goal, this.eyeYaw, this.eyePitch);
    this.swingParts(dt);
  }

  /**
   * Seated: the feet flat on the floor under the knees (a little ahead), the legs solved to them, so
   * the knees ride as high as the seat leaves them; crossed at the ankles, or one knee over the other,
   * as this person sits. A seat too high for the legs (a child's) leaves the thighs level and the
   * shins hanging, the feet off the floor.
   */
  private seatLegs(dt: number): void {
    const rig = this.rig;
    const ease = dampFactor(6, dt);
    const pelvis = rig.pelvis.position;
    const { thigh, shin } = rig.proportions;
    this.invPelvisQ.copy(this.pelvisQ).invert();
    // The thighs level, can the shins reach the floor?
    const reaches = pelvis.y - ANKLE_Y < shin * 0.98;
    for (const [i, leg] of rig.legs.entries()) {
      const side = i ? 1 : -1;
      const top = i === this.topLeg;
      const ankle = this.ankles[i]!;
      if (!reaches || (this.sitStyle === 'knee' && top)) {
        // Hanging (or crossed over the other knee: the thigh up and across, the foot pointed).
        const crossed = reaches;
        this.seatHip.rotation.set(crossed ? -1.84 : -1.5, 0, crossed ? -side * 0.3 : 0);
        this.seatHip.position.copy(leg.hip.position);
        leg.hip.quaternion.slerp(this.seatHip.quaternion, ease);
        leg.knee.rotation.x += ((crossed ? 1.55 : 1.38) - leg.knee.rotation.x) * ease;
        leg.ankle.rotation.set(leg.ankle.rotation.x + ((crossed ? 0.45 : 0.25) - leg.ankle.rotation.x) * ease, 0, 0);
        this.flexToes(leg, 0);
        // Where its foot is, for the shadow: under the knee, off the floor.
        ankle.set(pelvis.x + side * 0.1, ANKLE_Y + 0.3, pelvis.z + thigh);
        continue;
      }
      // The foot on the floor: apart under the knees, or the ankles crossed (the top one resting on the other).
      const crossAnkles = this.sitStyle === 'ankles';
      if (crossAnkles) ankle.set(top ? -side * 0.035 : side * 0.03, ANKLE_Y + (top ? 0.045 : 0), pelvis.z + thigh * 0.92 + (top ? 0.16 : 0.14));
      else ankle.set(side * (rig.hipHalf + 0.035), ANKLE_Y, pelvis.z + thigh * 0.92 + 0.06);
      const local = this.scratch.copy(ankle).sub(pelvis).applyQuaternion(this.invPelvisQ);
      this.seatHip.position.copy(leg.hip.position);
      solveLeg(this.seatHip, this.seatKnee, local, -side * 0.07, thigh, shin);
      leg.hip.quaternion.slerp(this.seatHip.quaternion, ease);
      leg.knee.rotation.x += (this.seatKnee.rotation.x - leg.knee.rotation.x) * ease;
      orientFoot(leg.ankle, this.pelvisQ, leg.hip, leg.knee, crossAnkles && top ? 0.25 : 0, side * 0.1);
      leg.ankle.userData.yaw = side * 0.1;
      this.flexToes(leg, 0);
    }
    this.footing.reset();
  }

  /** The toes bend up at the ball as the foot pitches toes-down (`pitch`, radians): they stay on the floor while the heel rises. */
  private flexToes(leg: LegBones, pitch: number): void {
    const flex = THREE.MathUtils.clamp(pitch / TOE_FLEX, 0, 1);
    for (const mesh of leg.toes) {
      const influences = mesh.morphTargetInfluences;
      if (influences) influences[0] = flex;
    }
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
        const reach = THREE.MathUtils.lerp(LEG_REACH, WALK_REACH - RUN_KNEE * this.gait.run, w) * (rig.proportions.thigh + rig.proportions.shin);
        const across = Math.hypot(hip.x - ankle.x, hip.z - ankle.z);
        needed = Math.max(needed, hip.y - ankle.y - Math.sqrt(Math.max(0, reach * reach - across * across)));
      }
      rig.legs[i]!.ankle.userData.pitch = pitch;
      rig.legs[i]!.ankle.userData.yaw = yaw;
    }
    // Down at once, up eased: no foot ever floats, no hitch when a leg comes under the body.
    needed = Math.max(0, needed);
    this.drop = needed > this.drop ? needed : damp(this.drop, needed, 11, dt);
    rig.pelvis.position.y -= this.drop;
    for (let i = 0; i < 2; i++) {
      const leg = rig.legs[i]!;
      const side = i ? 1 : -1;
      const local = this.scratch.copy(this.ankles[i]!).sub(rig.pelvis.position).applyQuaternion(this.invPelvisQ);
      solveLeg(leg.hip, leg.knee, local, -side * 0.07, rig.proportions.thigh, rig.proportions.shin);
      orientFoot(leg.ankle, this.pelvisQ, leg.hip, leg.knee, leg.ankle.userData.pitch as number, leg.ankle.userData.yaw as number);
      this.flexToes(leg, leg.ankle.userData.pitch as number);
    }
    if (w >= 1) this.footing.follow(walk, this.toWorld, bodyYaw);
  }

  /**
   * Where the `i` hand holds on this frame, walking or not: the sides of a box carried, the pram's handle when
   * pushing one, the edges of an open book, else a `grip`, else nothing.
   */
  private gripOf(i: number): THREE.Vector3 | null {
    const carried = this.heldMeshes.get('carried');
    if (carried) {
      carried.updateWorldMatrix(true, false);
      // The palm's middle a hand's half-thickness off the side (the box's own metres).
      return carried.localToWorld(this.gripAt[i]!.set((i ? 1 : -1) * (this.carriedHalf + 0.016), 0, 0));
    }
    const on = this.held === 'pram' ? PRAM_GRIPS : this.held === 'book' ? BOOK_GRIPS : null;
    if (on) {
      const mesh = this.heldMeshes.get(this.held!)!;
      mesh.updateWorldMatrix(true, false);
      return mesh.localToWorld(this.gripAt[i]!.copy(on[i]!));
    }
    return this.grips[i] ?? null;
  }

  /** One arm: its goal (a gesture's key, something held up, a point to reach, the pose), eased on its springs, then set on its bones. */
  private moveArm(i: number, arm: ArmBones, dt: number, t: number, w: number, moving: boolean, standing: boolean, talk: number, tempo: number): void {
    const side = i ? 1 : -1;
    const g = this.gestures.frame.arms[i];
    const held = this.held;
    // A grip holds walking or standing (a box carried, a pram's handle, a book, a hand held); a reach only standing.
    const reachPoint = this.gripOf(i) ?? (moving ? null : this.reachTargets[i]);
    const holding = i === 1 && !reachPoint && (held === 'umbrella' || held === 'cane' || held === 'suitcase' || (moving && held === 'phone'));
    const pose = POSES[moving ? 'stand' : this.pose];
    const target = this.armTarget;
    let stiff = false;
    if (g) Object.assign(target, g);
    else if (holding) {
      if (held === 'phone') {
        // Walking on the phone: the hand stays at the ear (the pose's spot).
        const spot = TOUCH_SPOTS.ear;
        Object.assign(target, solveArm(arm.shoulder, side, touchPoint(this.rig, 'ear', side, 0, this.touchAt), this.rig.palm, this.solution, spot.pole), { lz: 0, wf: spot.wf, tw: spot.tw, curl: spot.curl });
      } else Object.assign(target, { wf: 0, tw: 0, curl: 0.6 }, held === 'cane' ? CANE_ARM : held === 'suitcase' ? SUITCASE_ARM : UMBRELLA_ARM);
    }
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
      const at = moving ? null : (POSE_SPOTS[this.pose]?.[i] ?? null);
      if (at) {
        // A hand the pose keeps on the body (arms folded, a phone at the ear): solved onto it, so it lies there on any build.
        const spot = TOUCH_SPOTS[at];
        Object.assign(target, solveArm(arm.shoulder, side, touchPoint(this.rig, at, side, 0, this.touchAt, this.chestOut), this.rig.palm, this.solution, spot.pole));
        target.lz = 0;
        target.wf = spot.wf;
        target.tw = spot.tw;
        target.curl = spot.curl;
      }
      if (this.handCurl) target.curl = this.handCurl[i]!;
      // Forearms across the chest clear a fuller one (or a coat): the elbows come forward.
      if (!moving && !at && ACROSS_CHEST.has(this.pose)) target.ux -= this.chestRoom;
    }
    // A hand on the body (a gesture's `touches`): the arm solved onto the spot, as far as the gesture says.
    const touch = this.gestures.frame.touch[i]!;
    if (touch.spot && touch.weight > 0 && !reachPoint && !holding) {
      const spot = TOUCH_SPOTS[touch.spot];
      const s = solveArm(arm.shoulder, side, touchPoint(this.rig, touch.spot, side, touch.rub, this.touchAt), this.rig.palm, this.solution, spot.pole);
      const k = touch.weight;
      target.ux += (s.ux - target.ux) * k;
      target.uz += (s.uz - target.uz) * k;
      target.lx += (s.lx - target.lx) * k;
      target.ly += (s.ly - target.ly) * k;
      target.lz *= 1 - k;
      target.wf += (spot.wf - target.wf) * k;
      target.tw += (spot.tw - target.tw) * k;
      target.curl += (spot.curl - target.curl) * k;
    }
    // The walk's swing (against the other side's leg), a faint sway when standing, the hands with the words.
    if (!holding && !g && !reachPoint) {
      const forward = this.gait.arms[i]! * w;
      const a = this.gait.amount;
      // Running, the arms pump wider, bent at the elbows, the hands loosely closed.
      const run = this.gait.run * w;
      target.ux += -forward * 0.34 * a * (1 + 0.7 * run) + (standing ? this.drift(t, 3 - i) * 0.025 : 0);
      target.lx += -(0.12 + Math.max(0, forward) * 0.3) * a * w - RUN_ELBOW * run;
      target.curl += 0.15 * w + 0.45 * run;
    }
    this.beat[i] = damp(this.beat[i]!, this.beatGoal[i]!, 3.5, dt);
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
    // The shoulders rise a little with each breath in, and drop as a sigh goes out.
    const breathing = this.breath.fill * 0.014 - this.breath.sighing * 0.03;
    const shrug = this.shrugSprings[i]!.step(this.gestures.frame.shrug[i]! + talk * 0.02 * Math.sin(t * 3.1 + i) + breathing, dt, 10 * tempo);
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
    // The eyes turn in for what they look at (for a few metres off when it is nothing in particular); the pupils open a little in a conversation.
    const eyeHalf = Math.abs(this.rig.eyes[1].group.position.x);
    let vergence = Math.atan(eyeHalf / REST_FOCUS);
    let widen = 0;
    let jitter = 0.15;
    if (target) {
      // On the player's face, the eyes go from one of theirs to the other and now and then to the mouth.
      const onFace = this.onViewerFace(target);
      this.scratch.copy(target);
      if (onFace) this.scratch.add(this.faceFixation(dt));
      const local = head.worldToLocal(this.scratch);
      // `worldToLocal` includes the head's current turn: undo it to get the target in the neck's frame.
      local.applyEuler(head.rotation);
      local.y -= EYES_ABOVE_PIVOT;
      const distance = Math.max(0.15, local.length() - 0.09);
      vergence = Math.atan(eyeHalf / distance);
      if (onFace) {
        jitter = 0.04;
        widen = distance < 3 ? 0.05 : 0;
      }
      const rawYaw = Math.atan2(local.x, local.z);
      const rawPitch = -Math.atan2(local.y, Math.hypot(local.x, local.z));
      // The whole turn from the hips' frame: the shoulders take part of a wide one.
      const turn = rawYaw + this.twist;
      if (!walking && !reaching) twist = Math.sign(turn) * Math.min(seated ? TWIST_MAX * 0.5 : TWIST_MAX, Math.max(0, Math.abs(turn) - TWIST_FROM) * TWIST_SHARE);
      // Never locked on: the head floats a little about the target (the eyes, below, stay on it).
      yaw = THREE.MathUtils.clamp(rawYaw, -maxYaw, maxYaw) + this.drift(t, 2) * 0.025;
      pitch = THREE.MathUtils.clamp(rawPitch, -MAX_PITCH, MAX_PITCH) + this.drift(t, 3) * 0.015;
      // The eyes get there first and make up what the neck cannot; tiny shifts about what they rest on.
      // Between saccades they drift, slowly and very little.
      const driftYaw = EYE_DRIFT * Math.sin(t * 0.83 + this.eyeDriftPhase);
      const driftPitch = EYE_DRIFT * 0.7 * Math.sin(t * 0.71 + this.eyeDriftPhase * 1.7);
      eyeYaw = THREE.MathUtils.clamp(rawYaw - this.yaw + this.saccade.x * jitter + driftYaw, -EYE_YAW, EYE_YAW);
      eyePitch = THREE.MathUtils.clamp(rawPitch - this.pitch + this.saccade.y * jitter + driftPitch, -EYE_PITCH, EYE_PITCH);
    } else {
      eyeYaw = this.saccade.x;
      eyePitch = this.saccade.y + (ownGaze ? 0.1 : 0);
    }
    if (!this.far) {
      this.saccadeIn -= dt;
      if (this.saccadeIn <= 0) {
        this.saccadeIn = 0.5 + liveRandom() * 2;
        this.saccade.set((liveRandom() - 0.5) * 0.2, (liveRandom() - 0.5) * 0.08);
      }
    }
    // A wide shift of the goal: the eyes jump and, often, the lids blink with it.
    if (Math.hypot(yaw - this.lastGoalYaw, pitch - this.lastGoalPitch) > SHIFT_BLINK && liveRandom() < SHIFT_BLINK_CHANCE) this.face.blink();
    this.lastGoalYaw = yaw;
    this.lastGoalPitch = pitch;
    [this.twist, this.twistVelocity] = spring(this.twist, this.twistVelocity, twist, GAZE_OMEGA * 0.45, dt);
    // A little under-damped: after a turn the head goes a touch past and settles back (more so in someone brisk).
    [this.yaw, this.yawVelocity] = spring(this.yaw, this.yawVelocity, yaw, GAZE_OMEGA * this.temper.tempo, dt, this.temper.headDamping);
    [this.pitch, this.pitchVelocity] = spring(this.pitch, this.pitchVelocity, pitch, GAZE_OMEGA * this.temper.tempo, dt, this.temper.headDamping);
    // Listening (not talking): a small nod now and then, a blink with most.
    if (this.listening > 0 && !talk) {
      this.listenNodIn -= dt;
      if (this.listenNodIn <= 0) {
        this.listenNodIn = THREE.MathUtils.lerp(LISTEN_NOD_EVERY[0], LISTEN_NOD_EVERY[1], this.random());
        this.nod(NOD_DEPTH * LISTEN_NOD * (0.7 + 0.6 * this.temper.expressive));
        if (this.random() < 0.6) this.face.blink();
      }
    }
    let nod = this.breath.sighing * 0.07;
    if (this.nodding > 0) {
      this.nodding = Math.max(0, this.nodding - dt);
      nod += Math.sin((1 - this.nodding / NOD_S) * Math.PI) * this.nodDepth;
    }
    if (talk) nod += talk * Math.max(0, Math.sin(t * 4.1) * Math.sin(t * 1.3 + 0.7)) * 0.06;
    const tilt = talk ? talk * this.drift(t, 1) * 0.06 : this.drift(t, 0) * 0.02;
    head.rotation.set(this.pitch + nod + extra[0]!, this.yaw + extra[1]!, tilt + extra[2]!, 'YXZ');
    // The eyes stay on what they look at through a nod and a gesture's turn of the head (as eyes do through any move of it), as far as they can turn.
    if (target) {
      eyePitch = THREE.MathUtils.clamp(eyePitch - nod - extra[0]!, -EYE_PITCH, EYE_PITCH);
      eyeYaw = THREE.MathUtils.clamp(eyeYaw - extra[1]!, -EYE_YAW, EYE_YAW);
    }
    const eyeEase = dampFactor(EYE_RATE, dt);
    this.eyeYaw += (eyeYaw - this.eyeYaw) * eyeEase;
    this.eyePitch += (eyePitch - this.eyePitch) * eyeEase;
    this.eyeVergence += (vergence - this.eyeVergence) * eyeEase;
    this.pupilWiden += (widen - this.pupilWiden) * dampFactor(1.5, dt);
    this.face.setFocus(this.eyeVergence, this.pupilWiden);
  }

  /** Whether `target` is the viewer's face (the camera, near enough to be them, not a point past them). */
  private onViewerFace(target: THREE.Vector3): boolean {
    if (!this.viewer) return false;
    return target.distanceToSquared(this.viewerEye.setFromMatrixPosition(this.viewer.matrixWorld)) < 0.03;
  }

  /**
   * Where on the viewer's face the eyes rest now, as a world offset from the camera: one of their
   * eyes, the other, now and then the mouth, a fixation of a fraction of a second to a second each.
   */
  private faceFixation(dt: number): THREE.Vector3 {
    this.fixationIn -= dt;
    if (this.fixationIn <= 0) {
      const r = liveRandom();
      this.fixation = r < 0.42 ? 0 : r < 0.84 ? 1 : 2;
      this.fixationIn = this.fixation === 2 ? 0.3 + liveRandom() * 0.35 : 0.45 + liveRandom() * 1.1;
    }
    // The viewer's right (the camera's x column) and up (its y column).
    const e = this.viewer!.matrixWorld.elements;
    if (this.fixation === 2) return this.fixationOffset.set(e[4]!, e[5]!, e[6]!).normalize().multiplyScalar(-FACE_MOUTH);
    return this.fixationOffset.set(e[0]!, e[1]!, e[2]!).normalize().multiplyScalar(this.fixation === 0 ? -FACE_EYE : FACE_EYE);
  }

  /**
   * The ponytail, the bag and a hood down on the back, each a damped pendulum on its bone: they lag
   * the body's accelerations (a stop swings them forward, the walk's bob sets them bouncing) and hang
   * with gravity whatever the head does. Each turns as far as its swing times its share, the hood
   * only a little into the back.
   */
  private swingParts(dt: number): void {
    const parts = [
      ['tail', this.rig.tail, 5.5, 0.35, 0.9, 1, 1, -0.6] as const,
      ['bag', this.rig.bag, 4.2, 0.3, 0.35, 0.4, 0.5, -0.6] as const,
      ['hood', this.rig.hood, 6.5, 0.4, 0.6, 0.6, 0.3, -0.08] as const,
    ];
    for (const [key, bone, omega, zeta, reach, shareX, shareZ, back] of parts) {
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
      bone.rotation.set(THREE.MathUtils.clamp(s[0]!, back, 0.6) * shareX, 0, THREE.MathUtils.clamp(s[2]!, -0.5, 0.5) * shareZ);
    }
    this.swingPrimed = true;
  }

  /** What the repertoire needs to know to pick a gesture that suits them now. */
  private context(): Context {
    return {
      pose: this.pose,
      seated: this.seatHeight !== null,
      handsBusy: this.reachTargets[0] !== null || this.reachTargets[1] !== null,
      holding: this.held !== null || this.heldMeshes.has('carried'),
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

