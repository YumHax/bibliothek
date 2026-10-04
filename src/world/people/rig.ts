import * as THREE from 'three';
import { invisibleHitbox } from '../meshUtils';
import {
  CHEST_Y,
  CLAVICLE,
  FOREARM_L,
  handGeometry,
  HEAD_Y,
  limb,
  LUMBAR_Y,
  NECK_PIVOT,
  PELVIS_Y,
  REFERENCE_HEIGHT,
  SHIN_L,
  SHOULDER_X,
  SHOULDER_Y,
  THIGH_L,
  TORSO_BOTTOM,
  TORSO_PIVOT_Y,
  TORSO_TOP,
  trunkGeometry,
  trunkSection,
  UPPER_ARM_L,
  WAIST_Y,
} from './body';
import { paintCloth, paintTorso } from './clothTexture';
import { buildEyes, type Eye } from './eyes';
import { paintFace } from './faceTexture';
import { at, capsuleBetween, limbGeometry, Parts, roundedBox } from './geometry';
import { addHair, hairMaterial, ponytailAnchor } from './hair';
import { addEars, addFaceMorphs, addGlasses, addHat, headGeometry, type FaceMorphs, type FaceShape } from './head';
import type { PersonLook } from './looks';
import { POSES, type ArmAngles } from './poses';
import { addShoe } from './shoes';
import { fabric, skin as skinMaterial } from '../materials/finishes';
import { SpineSkin } from './motion/spineSkin';

/*
 * The person's skeleton and what hangs on each bone, at the reference height (the root is scaled
 * to `look.height`):
 *
 *   root                       scaled; the floor under the person, facing +z
 *   └ pelvis                   at the hip joints: sways, drops, tilts and turns
 *     ├ hip (2)                thigh, knee (shin, ankle: shoe), aimed by the legs' IK
 *     ├ trunk                  one sculpted surface (seat, waist, chest, shoulders) wearing the painted
 *     │                        torso; bends with the lower back and the chest in its shader (`SpineSkin`)
 *     └ lumbar                 the lower back
 *       └ chest                the ribs
 *         └ torso              the frame everything above the waist was modelled in (origin at the waist)
 *           ├ neck, collar, hood, bag (the tote and the pack on bones of their own, to swing)
 *           ├ clavicle (2)     shrugs and reaches: shoulder (upper arm), elbow (forearm), wrist (the hand,
 *           │                  curling to a fist or opening flat: morph targets)
 *           └ neck pivot       head: skull and face (its expressions: morph targets), hair (a ponytail
 *                              on a bone of its own), ears, hat, glasses, eyes and lids
 *
 * Every bone's pieces are merged into one mesh per material (`Parts`).
 */

export interface LegBones {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
}

export interface ArmBones {
  clavicle: THREE.Group;
  shoulder: THREE.Group;
  elbow: THREE.Group;
  wrist: THREE.Group;
  hand: THREE.Mesh;
  /** The angles the arm is at now (eased on springs by `PersonModel`). */
  current: Required<ArmAngles>;
}

export interface Rig {
  root: THREE.Group;
  pelvis: THREE.Group;
  lumbar: THREE.Group;
  chest: THREE.Group;
  /** Inside the chest, the frame the upper body was modelled in (origin at the waist). */
  torso: THREE.Group;
  trunk: THREE.Mesh;
  spine: SpineSkin;
  /** The neck pivot (the head turns and nods about it). */
  head: THREE.Group;
  face: THREE.Mesh;
  morphs: FaceMorphs;
  eyes: [Eye, Eye];
  legs: [LegBones, LegBones];
  arms: [ArmBones, ArmBones];
  /** A ponytail's bone (at its tie), a bag's (where it hangs from), or null. */
  tail: THREE.Group | null;
  bag: THREE.Group | null;
  /** What the far level of detail hides, and those details' own materials with their full opacity. */
  details: THREE.Object3D[];
  detailMaterials: Map<THREE.Material, number>;
  hitbox: THREE.Object3D;
  /** Eye height in world metres. */
  eyeHeight: number;
  /** World metres per reference metre. */
  scale: number;
  /** Half the width between the hip joints (reference metres). */
  hipHalf: number;
  /** From the wrist to the palm's middle (reference metres). */
  palm: number;
}

export function buildRig(look: PersonLook): Rig {
  const build = look.build;
  // Limb girth follows the build a little, never as much as the trunk.
  const girth = 0.7 + 0.3 * build;
  const skin = skinMaterial({ color: look.skin, roughness: 0.68 });
  const pattern = look.top === 'stripes' ? 'stripes' : look.top === 'flannel' ? 'check' : 'plain';
  const sleeve = fabric({ map: paintCloth(look.topColor, look.topAccent, pattern), roughness: 0.9, sheenTint: new THREE.Color(look.topColor).lerp(new THREE.Color(0xffffff), 0.35) });
  const trousers = fabric({ map: paintCloth(look.trousers, look.trousers, 'plain'), roughness: 0.92, sheenTint: new THREE.Color(look.trousers).lerp(new THREE.Color(0xffffff), 0.35) });

  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  pelvis.position.y = PELVIS_Y;
  root.add(pelvis);
  const hipHalf = 0.09 * build;
  const legs: [LegBones, LegBones] = [leg(-1, look, girth, hipHalf, skin, trousers), leg(1, look, girth, hipHalf, skin, trousers)];
  pelvis.add(legs[0].hip, legs[1].hip);

  // The trunk, bent in its shader by the lower back and the chest; its shadow bends with it.
  const spine = new SpineSkin(TORSO_PIVOT_Y);
  const waistV = (WAIST_Y - TORSO_BOTTOM) / (TORSO_TOP - TORSO_BOTTOM);
  const trunk = new THREE.Mesh(
    trunkGeometry(look),
    spine.patch(fabric({ map: paintTorso(look, waistV), vertexColors: true, roughness: 0.9, sheenTint: new THREE.Color(look.topColor).lerp(new THREE.Color(0xffffff), 0.35) })),
  );
  trunk.position.y = TORSO_PIVOT_Y - PELVIS_Y;
  const shadows = spine.shadowMaterials();
  trunk.customDepthMaterial = shadows.depth;
  trunk.customDistanceMaterial = shadows.distance;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  pelvis.add(trunk);

  const lumbar = new THREE.Group();
  lumbar.position.y = LUMBAR_Y - PELVIS_Y;
  pelvis.add(lumbar);
  const chest = new THREE.Group();
  chest.position.y = CHEST_Y - LUMBAR_Y;
  lumbar.add(chest);
  const torso = new THREE.Group();
  torso.position.y = TORSO_PIVOT_Y - CHEST_Y;
  chest.add(torso);

  const torsoParts = new Parts();
  // The neck, from inside the shoulders up into the skull.
  torsoParts.add(
    limbGeometry(0.15, [[0, 0.052], [0.5, 0.053], [1, 0.06]], { top: 1, bottom: 0 }),
    skin,
    at(NECK_PIVOT.x, NECK_PIVOT.y + 0.05 - TORSO_PIVOT_Y, NECK_PIVOT.z, [0, 0, 0], [1, 1, 0.88]),
  );
  neckwear(torsoParts, look, build, sleeve);
  const bag = addBag(torsoParts, look);
  if (bag) torso.add(bag);
  torso.add(...torsoParts.meshes());

  const hands = skinMaterial({ color: look.skin, roughness: 0.66 });
  const arms: [ArmBones, ArmBones] = [arm(-1, look, build, girth, skin, hands, sleeve), arm(1, look, build, girth, skin, hands, sleeve)];
  torso.add(arms[0].clavicle, arms[1].clavicle);

  const head = new THREE.Group();
  head.position.set(NECK_PIVOT.x, NECK_PIVOT.y - TORSO_PIVOT_Y, NECK_PIVOT.z);
  head.rotation.order = 'YXZ';
  const built = buildHead(head, look, skin);
  // A child's head is big for its body (the whole person is then scaled to their height).
  if (look.headScale) head.scale.setScalar(look.headScale);
  torso.add(head);

  const scale = look.height / REFERENCE_HEIGHT;
  root.scale.setScalar(scale);
  const top = HEAD_Y + 0.14;
  const hitbox = invisibleHitbox(0.6, top, 0.45, { y: top / 2 });
  hitbox.scale.setScalar(scale);
  return {
    root,
    pelvis,
    lumbar,
    chest,
    torso,
    trunk,
    spine,
    head,
    ...built,
    legs,
    arms,
    bag,
    hitbox,
    eyeHeight: (HEAD_Y + 0.014) * scale,
    scale,
    hipHalf,
    palm: 0.05 * (0.95 + 0.1 * build),
  };
}

function leg(side: -1 | 1, look: PersonLook, girth: number, hipHalf: number, skin: THREE.Material, trousers: THREE.Material): LegBones {
  const hip = new THREE.Group();
  // The hip joints sit on the pelvis's own pivot line (`PELVIS_Y`): no drop from it.
  hip.position.set(side * hipHalf, 0, 0);
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

function arm(side: -1 | 1, look: PersonLook, build: number, girth: number, skin: THREE.Material, handSkin: THREE.Material, sleeve: THREE.Material): ArmBones {
  // The collarbone from the top of the breastbone; the shoulder joint at its outer end, where it always was.
  const clavicle = new THREE.Group();
  clavicle.position.set(side * CLAVICLE.x, CLAVICLE.y - TORSO_PIVOT_Y, CLAVICLE.z);
  clavicle.rotation.order = 'YXZ';
  const shoulder = new THREE.Group();
  shoulder.position.set(side * (SHOULDER_X * build - CLAVICLE.x), SHOULDER_Y - CLAVICLE.y, -CLAVICLE.z);
  clavicle.add(shoulder);
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
  elbow.add(...lower.meshes());
  shoulder.add(elbow);

  const wrist = new THREE.Group();
  wrist.position.y = -FOREARM_L;
  wrist.rotation.order = 'YXZ';
  const hand = new THREE.Mesh(handGeometry(side, 0.95 + 0.1 * build), handSkin);
  hand.position.y = 0.004;
  hand.castShadow = true;
  hand.receiveShadow = true;
  wrist.add(hand);
  elbow.add(wrist);
  const rest = side < 0 ? POSES.stand.left : POSES.stand.right;
  return { clavicle, shoulder, elbow, wrist, hand, current: { wf: 0, tw: 0, curl: 0, ...rest } };
}

/** The head in the neck pivot's frame, raised to the skull's centre. */
function buildHead(head: THREE.Group, look: PersonLook, skin: THREE.Material): Pick<Rig, 'face' | 'morphs' | 'eyes' | 'tail' | 'details' | 'detailMaterials'> {
  const shape: FaceShape = { jaw: look.jaw, nose: look.nose };
  const skull = new THREE.Group();
  skull.position.set(-NECK_PIVOT.x, HEAD_Y - NECK_PIVOT.y, -NECK_PIVOT.z);
  const geometry = headGeometry(shape);
  const morphs = addFaceMorphs(geometry, look);
  const face = new THREE.Mesh(geometry, skinMaterial({ map: paintFace(look), roughness: 0.64 }));
  face.castShadow = true;
  face.receiveShadow = true;
  skull.add(face);

  const parts = new Parts();
  const earInner = skinMaterial({ color: new THREE.Color(look.skin).multiplyScalar(0.72), roughness: 0.7 });
  addEars(parts, look, shape, skin, earInner);
  const hair = hairMaterial(look);
  const tailParts = new Parts();
  addHair(parts, look, shape, hair, tailParts);
  addHat(parts, look);
  if (look.glasses !== undefined) addGlasses(parts, look.glasses, shape);
  const headParts = parts.meshes();
  skull.add(...headParts);
  let tail: THREE.Group | null = null;
  const tailMeshes = tailParts.meshes();
  if (tailMeshes.length) {
    tail = new THREE.Group();
    tail.position.copy(ponytailAnchor(shape));
    tail.add(...tailMeshes);
    skull.add(tail);
  }

  const eyes = buildEyes(look, shape);
  for (const eye of eyes) skull.add(eye.group);
  const details: THREE.Object3D[] = [...eyes.map((eye) => eye.group), ...headParts.filter((mesh) => mesh.material === earInner)];
  // Their materials are theirs alone: they dither by opacity as the person walks away.
  const detailMaterials = new Map<THREE.Material, number>();
  for (const detail of details) {
    detail.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (detailMaterials.has(material) || material.transparent) continue;
        material.alphaHash = true;
        detailMaterials.set(material, material.opacity);
      }
    });
  }
  head.add(skull);
  return { face, morphs, eyes, tail, details, detailMaterials };
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
  if (look.scarf !== undefined) {
    // Wound round the neck, one end hanging down the chest.
    const wool = new THREE.MeshStandardMaterial({ color: look.scarf, roughness: 0.95 });
    parts.add(new THREE.TorusGeometry(0.068, 0.026, 8, 20), wool, at(NECK_PIVOT.x, neckBase + 0.02, NECK_PIVOT.z + 0.004, [Math.PI / 2, 0, 0], [1.05 * build, 1.15, 1]));
    parts.add(new THREE.BoxGeometry(0.075, 0.26, 0.022), wool, at(NECK_PIVOT.x + 0.035, neckBase - 0.11, NECK_PIVOT.z + 0.1 + 0.02 * build, [-0.22, 0, 0.06]));
  }
}

/**
 * A tote hanging from the left shoulder (bag and straps on a bone at the shoulder, so it swings) or
 * a backpack (the pack on a bone at its top, the straps on the body), in the bag colour; the bone,
 * or null without a bag. The fixed parts go into `parts` (the torso's frame).
 */
function addBag(parts: Parts, look: PersonLook): THREE.Group | null {
  if (!look.bag) return null;
  const cloth = new THREE.MeshStandardMaterial({ color: look.bagColor ?? 0x6b4a2a, roughness: 0.95 });
  const shoulderX = SHOULDER_X * look.build;
  const bone = new THREE.Group();
  const swing = new Parts();
  if (look.bag === 'tote') {
    const hip = trunkSection(WAIST_Y, look);
    const x = -(Math.max(shoulderX + 0.06, hip.halfWidth + 0.05));
    const y = WAIST_Y - TORSO_PIVOT_Y + 0.02;
    // The straps, from the bag's top corners over the shoulder.
    const shoulder = new THREE.Vector3(-shoulderX * 0.75, SHOULDER_Y - TORSO_PIVOT_Y + 0.045, 0);
    bone.position.copy(shoulder);
    const local = (p: THREE.Vector3): THREE.Vector3 => p.sub(shoulder);
    swing.add(roundedBox(0.05, 0.34, 0.3, 4, 4), cloth, at(x - shoulder.x, y - shoulder.y, 0.02, [0, 0.08, 0.04]));
    for (const z of [-0.09, 0.11]) {
      swing.add(capsuleBetween(local(new THREE.Vector3(x + 0.01, y + 0.16, z)), local(shoulder.clone().setZ(z * 0.3)), 0.007, 5), cloth);
    }
  } else {
    const depth = trunkSection(1.2, look).back;
    const top = new THREE.Vector3(0, 0.27 + 0.19, -(depth + 0.03));
    bone.position.copy(top);
    swing.add(roundedBox(0.26 * look.build, 0.38, 0.12, 4, 4), cloth, at(0, 0.27 - top.y, -(depth + 0.06) - top.z));
    swing.add(roundedBox(0.22 * look.build, 0.15, 0.025, 4, 3), new THREE.MeshStandardMaterial({ color: look.bagColor ?? 0x6b4a2a, roughness: 0.85 }), at(0, 0.37 - top.y, -(depth + 0.125) - top.z));
    // Each strap follows the trunk: up the back, over the shoulder, down the chest to the armpit.
    for (const side of [-1, 1] as const) {
      const points = strapPath(look, side * 0.085 * look.build);
      for (let i = 1; i < points.length; i++) parts.add(capsuleBetween(points[i - 1]!, points[i]!, 0.008, 5), cloth);
    }
  }
  bone.add(...swing.meshes());
  return bone;
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
