import * as THREE from 'three';
import { invisibleHitbox } from '../meshUtils';
import {
  ANKLE_Y,
  BALL_Z,
  CHEST_Y,
  CLAVICLE,
  FOREARM_L,
  handGeometry,
  HEAD_Y,
  limbChain,
  LUMBAR_Y,
  NECK_PIVOT,
  PELVIS_Y,
  proportionsOf,
  REFERENCE_HEIGHT,
  SHOULDER_Y,
  TORSO_BOTTOM,
  TORSO_PIVOT_Y,
  TORSO_TOP,
  trunkGeometry,
  trunkSection,
  UPPER_ARM_L,
  WAIST_Y,
  type Proportions,
} from './body';
import { isDenim, paintCloth, paintTorso, untuckedHemV } from './clothTexture';
import { collarGeometry, collarPoint, hasLooseHem, hemBand, thickSphereShell } from './garmentEdges';
import { handSkin } from './handSkin';
import { HemFlare } from './motion/hemFlare';
import { buildEyes, type Eye } from './eyes';
import { paintFace } from './faceTexture';
import { at, capsuleBetween, limbGeometry, Parts, roundedBox, splitStill, weldNormals } from './geometry';
import { addHair, hairCurtain, hairMaterial, ponytailAnchor } from './hair';
import { curtainStrands, hairCardMaterial, hairFuzz, hairStrands } from './hairStrands';
import { addEars, addFaceMorphs, addGlasses, addHat, addMouth, faceShapeOf, headGeometry, mouthPatch, type FaceMorphs, type MouthOpen } from './head';
import type { PersonLook } from './looks';
import { POSES, type ArmAngles } from './poses';
import { addShoe } from './shoes';
import { fabric } from '../materials/finishes';
import { faceSkin, skinAgeOf, skinMaterial } from './skinShader';
import { SpineSkin } from './motion/spineSkin';
import { LimbSkin, skinLimb, type LimbWeights } from './motion/limbSkin';
import { clamp, gaussian, ramp } from '@/math/scalar';
import { SkirtSkin } from './motion/skirtSkin';
import { HairFollow } from './motion/hairFollow';
import { lowerGarments } from './skirt';

/*
 * The person's skeleton and what hangs on each bone, at the reference height (the root is scaled
 * to `look.height`):
 *
 *   root                       scaled; the floor under the person, facing +z
 *   └ pelvis                   at the hip joints (higher on longer legs): sways, drops, tilts and turns
 *     ├ hip (2)                knee, ankle (shoe, its toes flexing: a morph), aimed by the legs' IK
 *     ├ leg (2)                one surface hip to ankle at the hip joint, bent by hip, knee and ankle (`LimbSkin`)
 *     ├ skirt, coat            hanging from the waist, following the thighs in their shader (`SkirtSkin`)
 *     ├ trunk                  one sculpted surface (seat, waist, chest, shoulders) wearing the painted
 *     │                        torso; bends with the lower back and the chest in its shader (`SpineSkin`)
 *     └ lumbar                 the lower back
 *       └ chest                the ribs
 *         └ torso              the frame everything above the waist was modelled in (origin at the waist)
 *           ├ neck             one surface into the skull, turning and bending with the head (`LimbSkin`)
 *           ├ collar, hood, bag (the tote and the pack on bones of their own, to swing)
 *           ├ clavicle (2)     shrugs and reaches (the tops of the shoulders follow, `SpineSkin.attach`):
 *           │                  the arm, one surface shoulder to wrist bent by shoulder, elbow and wrist
 *           │                  (`LimbSkin`); shoulder > elbow > wrist (the hand, curling to a fist or opening
 *           │                  flat: morph targets)
 *           └ neck pivot       head: skull and face (its expressions: morph targets; the mouth cut open
 *                              when the jaw drops, teeth and the dark behind), hair (a ponytail on a bone
 *                              of its own, long hair's ends kept on the shoulders: `HairFollow`), ears,
 *                              hat, glasses, eyes and lids
 *
 * Every bone's pieces are merged into one mesh per material (`Parts`). The proportions are the
 * person's own (`body.proportionsOf`: legs, neck, shoulders), the whole scaled back to their height.
 */

export interface LegBones {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
  /** The shoe's meshes: their one morph target bends the toes up about the ball of the foot (`TOE_FLEX` at 1). */
  toes: THREE.Mesh[];
  /** The leg's surface from the hip to the ankle, bent by the three joints in its shader (`update` it with them), and its meshes (on the pelvis). */
  skin: LimbSkin;
  meshes: THREE.Mesh[];
}

/** How far the toes bend up at the ball of the foot at the morph's full influence (radians). */
export const TOE_FLEX = 0.6;

export interface ArmBones {
  clavicle: THREE.Group;
  shoulder: THREE.Group;
  elbow: THREE.Group;
  wrist: THREE.Group;
  hand: THREE.Mesh;
  /** The arm's surface from the shoulder to the wrist, bent by the three joints in its shader (on the collarbone). */
  skin: LimbSkin;
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
  /** The neck's surface, from inside the collar up into the skull, turning and bending with the head. */
  neck: LimbSkin;
  /** The person's own proportions (bone lengths, the shoulders, how high the hips and the head sit). */
  proportions: Proportions;
  /** The skull, the neck pivot's child (the head's frame). */
  skull: THREE.Group;
  face: THREE.Mesh;
  morphs: FaceMorphs;
  /** The mouth's cut and the jaw's bone (kept at the jaw morph's influence, `setMouthOpen`), or null (no cut: under a full beard). */
  mouthOpen: MouthOpen | null;
  /** Where the face's expressions fold its skin (brows up, smile, squint, frown; `skinShader.faceSkin`). */
  wrinkles: THREE.Vector4;
  /** Long hair's ends on the shoulders (updated with the head's turn), or null. */
  hairFollow: HairFollow | null;
  /** A skirt or a coat's skirts following the thighs (updated with the hips), or null. */
  skirt: SkirtSkin | null;
  /** The meshes whose shadows bend in their own depth materials (trunk, skirts, long hair): they stop casting as the person fades. */
  casters: THREE.Mesh[];
  eyes: [Eye, Eye];
  legs: [LegBones, LegBones];
  arms: [ArmBones, ArmBones];
  /** A ponytail's bone (at its tie), a bag's (where it hangs from), or null. */
  tail: THREE.Group | null;
  bag: THREE.Group | null;
  /** A hoodie's hood down on the back, on a bone at its top (to swing), or null. */
  hood: THREE.Group | null;
  /** An untucked top's hem lifting off the body with the thighs (updated with the hips), or null. */
  hem: HemFlare | null;
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

/**
 * Where the rig puts the person, from the look alone (no mesh built): the scale from reference metres to their height,
 * their eye height (world metres) and the hitbox, so an owner can stand them and click them before the body is built.
 */
export function rigFrame(look: PersonLook): { scale: number; eyeHeight: number; hitbox: THREE.Object3D } {
  const prop = proportionsOf(look);
  // The legs and the neck add their rises; the person is scaled to their height all the same.
  const rise = prop.legRise + prop.neckRise;
  const scale = look.height / (REFERENCE_HEIGHT + rise);
  const top = HEAD_Y + rise + 0.14;
  const hitbox = invisibleHitbox(0.6, top, 0.45, { y: top / 2 });
  hitbox.scale.setScalar(scale);
  return { scale, eyeHeight: (HEAD_Y + rise + 0.014) * scale, hitbox };
}

/**
 * The rig built a part at a time: each `yield` is a pause between pieces of a few milliseconds each (the legs, the
 * trunk, the arms, the head's surface, its expressions, the painted face, the hair, the eyes), so a crowd's bodies
 * are built over idle moments (`bodyQueue`) instead of a person's sixty-odd milliseconds in one go.
 */
export function* rigSteps(look: PersonLook): Generator<void, Rig, void> {
  const build = look.build;
  // Limb girth follows the build a little, never as much as the trunk.
  const girth = 0.7 + 0.3 * build;
  const prop = proportionsOf(look);
  // Each limb bends in its own shader (its bones are its uniforms), so each wears its own copy of a material.
  const materials = limbMaterials(look);
  const sleeve = materials.sleeve();

  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  // Longer legs for the height lift everything above the hips (the whole person is scaled back to their height).
  pelvis.position.y = PELVIS_Y + prop.legRise;
  root.add(pelvis);
  const hipHalf = 0.09 * build;
  const limbCasters: THREE.Mesh[] = [];
  const legs: [LegBones, LegBones] = [leg(-1, look, girth, hipHalf, prop, materials, limbCasters), leg(1, look, girth, hipHalf, prop, materials, limbCasters)];
  pelvis.add(legs[0].hip, legs[1].hip, ...legs[0].meshes, ...legs[1].meshes);
  yield;
  const skirtSkin = look.skirt || look.coat ? new SkirtSkin() : null;
  const garments = skirtSkin ? lowerGarments(look, skirtSkin) : [];
  if (garments.length) pelvis.add(...garments);

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
  // An untucked top's hem: a turned band standing off the hips, its lip pushed out by the thighs.
  const hem = hasLooseHem(look) ? new HemFlare() : null;
  if (hem) {
    const hemY = TORSO_BOTTOM + untuckedHemV(waistV) * (TORSO_TOP - TORSO_BOTTOM);
    const band = new THREE.Mesh(hemBand(look, hemY), hem.patch(fabric({ map: paintTorso(look, waistV), roughness: 0.9, sheenTint: new THREE.Color(look.topColor).lerp(new THREE.Color(0xffffff), 0.35) })));
    band.castShadow = true;
    band.receiveShadow = true;
    pelvis.add(band);
  }

  yield;
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
  // The neck, from inside the shoulders up into the skull, turning and bending with the head.
  const neck = neckSkin(look, prop, materials);
  torso.add(neck.mesh);
  limbCasters.push(neck.mesh);
  const hood = neckwear(torsoParts, look, build, sleeve);
  if (hood) torso.add(hood);
  const bag = addBag(torsoParts, look);
  if (bag) torso.add(bag);
  const torsoMeshes = torsoParts.meshes();
  if (torsoMeshes.length) torso.add(...torsoMeshes);

  const hands = handSkin(skinMaterial({ color: look.skin, roughness: 0.66 }, 'hands', skinAgeOf(look.age)));
  const arms: [ArmBones, ArmBones] = [arm(-1, look, build, girth, prop, materials, hands, limbCasters), arm(1, look, build, girth, prop, materials, hands, limbCasters)];
  torso.add(arms[0].clavicle, arms[1].clavicle);
  // The tops of the shoulders go with the collarbones.
  spine.attach(torso, [arms[0].clavicle, arms[1].clavicle], [arms[0].shoulder, arms[1].shoulder]);
  yield;

  const head = new THREE.Group();
  head.position.set(NECK_PIVOT.x, NECK_PIVOT.y + prop.neckRise - TORSO_PIVOT_Y, NECK_PIVOT.z);
  head.rotation.order = 'YXZ';
  const built = yield* headSteps(head, look);
  const casters: THREE.Mesh[] = [trunk, ...garments, ...limbCasters];
  built.skull.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.customDepthMaterial) casters.push(mesh);
  });
  // A child's head is big for its body (the whole person is then scaled to their height).
  if (look.headScale) head.scale.setScalar(look.headScale);
  torso.add(head);

  const { scale, eyeHeight, hitbox } = rigFrame(look);
  root.scale.setScalar(scale);
  return {
    root,
    pelvis,
    lumbar,
    chest,
    torso,
    trunk,
    spine,
    head,
    neck: neck.skin,
    proportions: prop,
    ...built,
    skirt: skirtSkin,
    casters,
    legs,
    arms,
    bag,
    hood,
    hem,
    hitbox,
    eyeHeight,
    scale,
    hipHalf,
    palm: 0.05 * (0.95 + 0.1 * build),
  };
}

function leg(side: -1 | 1, look: PersonLook, girth: number, hipHalf: number, prop: Proportions, materials: LimbMaterials, casters: THREE.Mesh[]): LegBones {
  const hip = new THREE.Group();
  // The hip joints sit on the pelvis's own pivot line (`PELVIS_Y`): no drop from it.
  hip.position.set(side * hipHalf, 0, 0);
  const { thigh, shin } = prop;
  // One surface from the hip to the ankle (`LimbSkin`), hung from the pelvis where the hip joint is.
  const skin = new LimbSkin({ joints: [-thigh, -thigh - shin], volume: [0.04, 0, 0.05, 0.07], point: [0, 1] });
  const pieces = new Parts();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, matrix?: THREE.Matrix4): void => void pieces.add(geometry, material, matrix);
  const bare = materials.legs ? materials.legs() : null;
  if (bare) {
    add(limbChain([['thigh', thigh, 0.001], ['shin', shin, 0.001]], girth), bare);
  } else if (look.shorts) {
    add(limbChain([['thigh', thigh], ['shin', shin]], girth), materials.skin());
    add(limbGeometry(0.24, [[0, 0.08 * girth], [0.6, 0.083 * girth], [1, 0.082 * girth]], { top: 1, hem: 0.0025, radial: 18 }), materials.trousers());
    add(limbGeometry(0.08, [[0, 0.041 * girth], [1, 0.043 * girth]], { top: 0.3, bottom: 0.3, rows: 4 }), new THREE.MeshStandardMaterial({ color: 0xf0ede6, roughness: 0.95 }), at(0, -thigh - shin + 0.085, 0));
  } else {
    add(limbChain([['thigh', thigh, 0.006], ['trouserShin', shin, -0.002]], girth, { hem: 0.002 }), materials.trousers());
  }
  // Bare legs and tights reach into the shoe with the ankle; a trouser leg hangs from the shin over it.
  const weights = legWeights(thigh, shin, look.shorts || bare ? 0.6 : 0);
  const meshes = pieces.meshes();
  for (const mesh of meshes) {
    hangLimb(mesh, skin, weights, thigh + shin + 0.1, materials);
    mesh.position.copy(hip.position);
  }
  casters.push(...meshes);

  const knee = new THREE.Group();
  knee.position.y = -thigh;
  const ankle = new THREE.Group();
  ankle.position.y = -shin;
  const shoe = new Parts();
  addShoe(shoe, look, girth);
  const toes = shoe.meshes();
  for (const mesh of toes) {
    addToeFlex(mesh.geometry);
    mesh.updateMorphTargets();
  }
  ankle.add(...toes);
  knee.add(ankle);
  hip.add(knee);
  return { hip, knee, ankle, toes, skin, meshes };
}

/**
 * The shoe's one morph target: the toe box bent up about the ball of the foot by `TOE_FLEX` (a
 * band behind the ball blending in, as a sole flexes), so pushing off on the ball the toes can stay
 * flat on the floor instead of sinking into it (`PersonModel` sets the influence from the foot's pitch).
 */
function addToeFlex(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const moved = new Float32Array(position.count * 3);
  const turned = new Float32Array(position.count * 3);
  const pivotY = -ANKLE_Y;
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i);
    const w = THREE.MathUtils.smoothstep(z, BALL_Z - 0.02, BALL_Z + 0.025);
    const a = -TOE_FLEX * w;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const y = position.getY(i) - pivotY;
    const dz = z - BALL_Z;
    moved[i * 3] = position.getX(i);
    moved[i * 3 + 1] = pivotY + y * cos - dz * sin;
    moved[i * 3 + 2] = BALL_Z + y * sin + dz * cos;
    const ny = normal.getY(i);
    const nz = normal.getZ(i);
    turned[i * 3] = normal.getX(i);
    turned[i * 3 + 1] = ny * cos - nz * sin;
    turned[i * 3 + 2] = ny * sin + nz * cos;
  }
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(moved, 3)];
  geometry.morphAttributes.normal = [new THREE.Float32BufferAttribute(turned, 3)];
}

/**
 * The materials a limb wears, each call a copy of its own (a limb's bones are its material's
 * uniforms, `LimbSkin`): the skin, the top's sleeves, the trousers, and under a skirt the tights or
 * bare skin (null otherwise). Creases run deep in cloth and faint in skin (`fold`).
 */
interface LimbMaterials {
  skin: () => THREE.Material;
  sleeve: () => THREE.Material;
  trousers: () => THREE.Material;
  legs: (() => THREE.Material) | null;
  fold: (material: THREE.Material) => number;
  /** How much redder bare skin is over the elbow's point and the kneecap (0 on cloth). */
  redden: (material: THREE.Material) => number;
}

function limbMaterials(look: PersonLook): LimbMaterials {
  const skins = new WeakSet<THREE.Material>();
  const skin = (): THREE.Material => {
    const material = skinMaterial({ color: look.skin, roughness: 0.68 }, 'body', skinAgeOf(look.age));
    skins.add(material);
    return material;
  };
  const sheen = (color: number, k = 0.35): THREE.Color => new THREE.Color(color).lerp(new THREE.Color(0xffffff), k);
  const pattern = look.top === 'stripes' ? 'stripes' : look.top === 'flannel' ? 'check' : 'plain';
  const tights = look.tights;
  return {
    skin,
    sleeve: () => fabric({ map: paintCloth(look.topColor, look.topAccent, pattern), roughness: 0.9, sheenTint: sheen(look.topColor) }),
    trousers: () => fabric({ map: paintCloth(look.trousers, look.trousers, isDenim(look.trousers) ? 'denim' : 'plain'), roughness: 0.92, sheenTint: sheen(look.trousers) }),
    // Under a skirt the legs are in tights, or bare.
    legs: look.skirt ? (tights !== undefined ? () => fabric({ color: tights, roughness: 0.55, sheenTint: sheen(tights, 0.5) }) : skin) : null,
    fold: (material) => (skins.has(material) ? 0.25 : 1),
    redden: (material) => (skins.has(material) ? 1 : 0),
  };
}

/** Makes `mesh` (at rest in its first joint's frame) one of `skin`'s surfaces: weighted to its bones, its material and shadows bent with them. */
function hangLimb(mesh: THREE.Mesh, skin: LimbSkin, weights: LimbWeights, reach: number, materials: LimbMaterials): void {
  skinLimb(mesh.geometry, weights, reach);
  const material = mesh.material as THREE.Material;
  skin.patch(material, materials.fold(material), materials.redden(material));
  const shadows = skin.shadowMaterials();
  mesh.customDepthMaterial = shadows.depth;
  mesh.customDistanceMaterial = shadows.distance;
}

/** How far below the wrist joint (m) the forearm's end is wholly the hand's. */
const WRIST_DEPTH = 0.006;

/**
 * An arm's weights by height below the shoulder joint: the top of the shoulder stays partly with
 * the collarbone (it rounds into the trunk), the upper arm turns with the elbow's turn spread down
 * it, the forearm bends in at the elbow over a few centimetres either side and carries the wrist's
 * twist, and the last of it, round the wrist, goes with the hand.
 */
function armWeights(upper: number, fore: number): LimbWeights {
  return (y) => {
    const root = 0.3 * ramp(y, -0.02, 0.05);
    const elbow = ramp(y, -upper + 0.035, -upper - 0.035);
    const wrist = ramp(y, -upper - fore + 0.03, -upper - fore - WRIST_DEPTH);
    return [(1 - elbow) * (1 - root), elbow * (1 - wrist), elbow * wrist, clamp(-y / upper, 0, 1), clamp((-y - upper) / fore, 0, 1)];
  };
}

/** A leg's weights by height below the hip joint: the top of the thigh partly with the pelvis, the knee's bend over a few centimetres, the ankle's share at the bottom (`ankle`, none under a trouser leg, which hangs). */
function legWeights(thigh: number, shin: number, ankle: number): LimbWeights {
  return (y) => {
    const root = 0.2 * ramp(y, 0, 0.07);
    const knee = ramp(y, -thigh + 0.04, -thigh - 0.04);
    const foot = ankle * ramp(y, -thigh - shin + 0.05, -thigh - shin);
    return [(1 - knee) * (1 - root), knee * (1 - foot), knee * foot, 0, 0];
  };
}

/**
 * The neck, from inside the collar up into the skull, at rest in the neck pivot's frame: a little
 * flattened front to back, the two long muscles from behind the ears to the top of the breastbone
 * just showing, and an Adam's apple on a man (the straight figure, grown). Its top turns and
 * bends with the head, the turn spread up it (`LimbSkin.neck`).
 */
function neckSkin(look: PersonLook, prop: Proportions, materials: LimbMaterials): { mesh: THREE.Mesh; skin: LimbSkin } {
  const rise = prop.neckRise;
  const length = 0.15 + rise;
  const geometry = limbGeometry(length, [[0, 0.052], [0.5, 0.053], [1, 0.06]], { top: 1, bottom: 0, radial: 24, rows: 14 });
  geometry.translate(0, 0.05, 0);
  const position = geometry.getAttribute('position');
  const adam = look.figure === 'straight' && look.age !== 'child' ? 0.0045 : 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const around = Math.abs(Math.atan2(x, z));
    // Up the visible neck (0 at the collar, 1 under the ear) the muscle runs from the breastbone round to behind the ear.
    const up = (y + 0.085 + rise) / (0.08 + rise);
    const muscle = 0.0028 * gaussian(around, 0.35 + 1.5 * clamp(up, 0, 1), 0.2) * ramp(up, -0.1, 0.25) * ramp(up, 1.1, 0.8);
    const apple = adam * gaussian(around, 0, 0.22) * gaussian(y, -0.045 - rise * 0.5, 0.009);
    const k = (r + muscle + apple) / r;
    position.setXYZ(i, x * k, y, z * k * 0.88);
  }
  geometry.computeVertexNormals();
  weldNormals(geometry);
  const skin = new LimbSkin({ joints: [-1, -1], volume: [0, 0, 0, 0] });
  // The head's share climbs over the visible neck; its turn with it.
  skinLimb(geometry, (y) => {
    const w = ramp(y, -0.07 - rise * 0.5, 0.015);
    return [w, 0, 0, w, 0];
  }, 0.3);
  const material = materials.skin();
  skin.patch(material, 0);
  const mesh = new THREE.Mesh(geometry, material);
  const shadows = skin.shadowMaterials();
  mesh.customDepthMaterial = shadows.depth;
  mesh.customDistanceMaterial = shadows.distance;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(NECK_PIVOT.x, NECK_PIVOT.y + rise - TORSO_PIVOT_Y, NECK_PIVOT.z);
  return { mesh, skin };
}

function arm(side: -1 | 1, look: PersonLook, build: number, girth: number, prop: Proportions, materials: LimbMaterials, handMaterial: THREE.Material, casters: THREE.Mesh[]): ArmBones {
  // The collarbone from the top of the breastbone; the shoulder joint at its outer end, where it always was.
  const clavicle = new THREE.Group();
  clavicle.position.set(side * CLAVICLE.x, CLAVICLE.y - TORSO_PIVOT_Y, CLAVICLE.z);
  clavicle.rotation.order = 'YXZ';
  const shoulder = new THREE.Group();
  shoulder.position.set(side * (prop.shoulderX - CLAVICLE.x), prop.shoulderY - CLAVICLE.y, -CLAVICLE.z);
  clavicle.add(shoulder);
  // One surface from the shoulder to the wrist (`LimbSkin`), hung from the collarbone where the shoulder joint is.
  const skin = new LimbSkin({ joints: [-UPPER_ARM_L, -UPPER_ARM_L - FOREARM_L], volume: [0.1, 0, 0.03, 0.06], point: [0, -1] });
  const pieces = new Parts();
  // A jacket's sleeves (a coat's) stand a little further off the arm than a shirt's.
  const layered = look.top === 'jacket' || look.coat === true;
  if (look.longSleeves) {
    pieces.add(limbChain([['upperArm', UPPER_ARM_L, layered ? 0.014 : 0.008], ['forearm', FOREARM_L - 0.01, layered ? 0.012 : 0.007]], girth, { hem: 0.0025 }), materials.sleeve());
    // The wrist showing below the cuff, reaching into the hand.
    pieces.add(limbGeometry(0.04, [[0, 0.028 * girth], [1, 0.026 * girth]], { top: 0, bottom: 0.8, rows: 4 }), materials.skin(), at(0, -UPPER_ARM_L - FOREARM_L + 0.04, 0));
  } else {
    // A short sleeve flaring a little to its hem, bare arm below.
    pieces.add(limbGeometry(0.14, [[0, 0.056 * girth], [1, 0.057 * girth + 0.004]], { top: 1, hem: 0.002, radial: 18, rows: 7 }), materials.sleeve());
    pieces.add(limbChain([['upperArm', UPPER_ARM_L], ['forearm', FOREARM_L]], girth), materials.skin());
  }
  const meshes = pieces.meshes();
  const weights = armWeights(UPPER_ARM_L, FOREARM_L);
  for (const mesh of meshes) {
    hangLimb(mesh, skin, weights, UPPER_ARM_L + FOREARM_L + 0.12, materials);
    mesh.position.copy(shoulder.position);
  }
  clavicle.add(...meshes);
  casters.push(...meshes);

  const elbow = new THREE.Group();
  elbow.position.y = -UPPER_ARM_L;
  shoulder.add(elbow);

  const wrist = new THREE.Group();
  wrist.position.y = -FOREARM_L;
  wrist.rotation.order = 'YXZ';
  const hand = new THREE.Mesh(handGeometry(side, 0.95 + 0.1 * build), handMaterial);
  hand.position.y = 0.004;
  hand.castShadow = true;
  hand.receiveShadow = true;
  wrist.add(hand);
  elbow.add(wrist);
  const rest = side < 0 ? POSES.stand.left : POSES.stand.right;
  return { clavicle, shoulder, elbow, wrist, hand, skin, current: { wf: 0, tw: 0, curl: 0, ...rest } };
}

/** The head in the neck pivot's frame, raised to the skull's centre. */
/** The head's pieces (`rigSteps`), a pause after each heavy one: the surface, its expressions, the painted face, the hair, its fuzz. */
function* headSteps(head: THREE.Group, look: PersonLook): Generator<void, Pick<Rig, 'skull' | 'face' | 'morphs' | 'mouthOpen' | 'wrinkles' | 'hairFollow' | 'eyes' | 'tail' | 'details' | 'detailMaterials'>, void> {
  const shape = faceShapeOf(look);
  const skull = new THREE.Group();
  skull.position.set(-NECK_PIVOT.x, HEAD_Y - NECK_PIVOT.y, -NECK_PIVOT.z);
  const geometry = headGeometry(shape);
  yield;
  const morphs = addFaceMorphs(geometry, look);
  yield;
  const age = skinAgeOf(look.age);
  const { material: faceMaterial, wrinkles } = faceSkin({ map: paintFace(look), roughness: 0.64 }, age);
  yield;
  // The mouth opens through the skin (not under a full beard: no jaw there).
  const mouthCut = morphs.jaw >= 0 ? mouthPatch(faceMaterial) : null;
  // The expressions move the face only: the rest of the head (crown, back, sides) is a mesh without them, so the morph
  // data covers the face's vertices alone (`splitStill`, about half the memory). Same material, a seam nothing moves.
  const { moving, still } = splitStill(geometry);
  const face = new THREE.Mesh(moving, faceMaterial);
  face.castShadow = true;
  face.receiveShadow = true;
  skull.add(face);
  if (still) {
    const scalp = new THREE.Mesh(still, faceMaterial);
    scalp.castShadow = true;
    scalp.receiveShadow = true;
    skull.add(scalp);
  }

  const parts = new Parts();
  // The ears their own skin: thin, the light shows red through them from behind.
  const earSkin = skinMaterial({ color: look.skin, roughness: 0.66 }, 'ears', age);
  const earInner = skinMaterial({ color: new THREE.Color(look.skin).multiplyScalar(0.72), roughness: 0.7 }, 'ears', age);
  addEars(parts, look, shape, earSkin, earInner);
  const mouthInside = new THREE.MeshStandardMaterial({ color: 0x3a1618, roughness: 0.7 });
  const teeth = new THREE.MeshStandardMaterial({ color: 0xe6dfd2, roughness: 0.4 });
  const tongue = new THREE.MeshStandardMaterial({ color: 0x9a4a4c, roughness: 0.45 });
  const jaw = mouthCut ? addMouth(parts, shape, mouthInside, teeth, tongue) : null;
  if (jaw) skull.add(jaw);
  const mouthOpen: MouthOpen | null = mouthCut ? { cut: mouthCut, jaw, inside: [mouthInside, teeth, tongue] } : null;
  const hair = hairMaterial(look);
  const tailParts = new Parts();
  addHair(parts, look, shape, hair, tailParts);
  yield;
  // Loose strands and fuzz over the hair's mass (none without MSAA): they cast no shadow and fade with the details.
  const cards = hairCardMaterial(look);
  if (cards) {
    const strands = hairStrands(look, shape);
    if (strands.head) parts.add(strands.head, cards);
    if (strands.tail) tailParts.add(strands.tail, cards);
  }
  const fuzz = hairFuzz(look, shape);
  yield;
  addHat(parts, look);
  if (look.glasses !== undefined) addGlasses(parts, look.glasses, shape);
  const headParts = parts.meshes();
  const mouth = headParts.filter((mesh) => mesh.material === mouthInside || mesh.material === teeth);
  const strandMeshes = headParts.filter((mesh) => cards && mesh.material === cards);
  for (const mesh of [...mouth, ...strandMeshes]) mesh.castShadow = false;
  skull.add(...headParts, ...fuzz);
  // Long hair's falling sheet, its ends on the shoulders whatever the head does.
  const curtainGeometry = hairCurtain(look, shape);
  let hairFollow: HairFollow | null = null;
  if (curtainGeometry) {
    hairFollow = new HairFollow();
    const curtain = new THREE.Mesh(curtainGeometry, hairFollow.patch(hairMaterial(look)));
    const shadows = hairFollow.shadowMaterials();
    curtain.customDepthMaterial = shadows.depth;
    curtain.customDistanceMaterial = shadows.distance;
    curtain.castShadow = true;
    curtain.receiveShadow = true;
    skull.add(curtain);
    // Its ends and loose strands, staying with the shoulders as it does.
    const ends = cards ? curtainStrands(look, curtainGeometry) : null;
    const endCards = ends ? hairCardMaterial(look) : null;
    if (ends && endCards) {
      const strands = new THREE.Mesh(ends, hairFollow.patch(endCards));
      strands.receiveShadow = true;
      skull.add(strands);
      strandMeshes.push(strands);
    }
  }
  let tail: THREE.Group | null = null;
  const tailMeshes = tailParts.meshes();
  if (tailMeshes.length) {
    for (const mesh of tailMeshes) {
      if (!cards || mesh.material !== cards) continue;
      mesh.castShadow = false;
      strandMeshes.push(mesh);
    }
    tail = new THREE.Group();
    tail.position.copy(ponytailAnchor(shape));
    tail.add(...tailMeshes);
    skull.add(tail);
  }

  const eyes = buildEyes(look, shape);
  for (const eye of eyes) skull.add(eye.group);
  const details: THREE.Object3D[] = [...eyes.map((eye) => eye.group), ...headParts.filter((mesh) => mesh.material === earInner), ...mouth, ...(jaw ? [jaw] : []), ...strandMeshes, ...fuzz];
  // Their materials are theirs alone: they dither by opacity as the person walks away (the hair's strands and fuzz thin out by coverage instead).
  const detailMaterials = new Map<THREE.Material, number>();
  for (const detail of details) {
    detail.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (detailMaterials.has(material) || material.transparent) continue;
        if (!material.alphaToCoverage) material.alphaHash = true;
        detailMaterials.set(material, material.opacity);
      }
    });
  }
  head.add(skull);
  return { skull, face, morphs, mouthOpen, wrinkles, hairFollow, eyes, tail, details, detailMaterials };
}

/**
 * A shirt's collar (the shirt's under a jacket), folded over its stand with its points on the chest,
 * or a hood bunched at the back of the neck (returned: on a bone of its own at its top, to swing).
 */
function neckwear(parts: Parts, look: PersonLook, build: number, sleeve: THREE.Material): THREE.Group | null {
  const neckBase = TORSO_TOP - TORSO_PIVOT_Y;
  let hood: THREE.Group | null = null;
  if (look.top === 'shirt' || look.top === 'jacket') {
    const color = look.top === 'jacket' ? look.topAccent : look.topColor;
    const collar = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
    const place = at(NECK_PIVOT.x, neckBase + 0.004, NECK_PIVOT.z + 0.004);
    parts.add(collarGeometry(), collar, place);
    for (const side of [-1, 1] as const) parts.add(collarPoint(side), collar, place);
  }
  if (look.top === 'hoodie') {
    hood = new THREE.Group();
    hood.position.set(0, neckBase + 0.02, -0.045);
    const shell = thickSphereShell(0.1, 0.007, Math.PI, Math.PI, Math.PI * 0.3, Math.PI * 0.5, 22, 12).applyMatrix4(at(0, -0.04, 0, [0, 0, 0], [1.15 * build, 0.75, 1]));
    const mesh = new THREE.Mesh(shell, sleeve);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    hood.add(mesh);
  }
  if (look.scarf !== undefined) {
    // Wound round the neck, one end hanging down the chest.
    const wool = new THREE.MeshStandardMaterial({ color: look.scarf, roughness: 0.95 });
    parts.add(new THREE.TorusGeometry(0.068, 0.026, 8, 20), wool, at(NECK_PIVOT.x, neckBase + 0.02, NECK_PIVOT.z + 0.004, [Math.PI / 2, 0, 0], [1.05 * build, 1.15, 1]));
    // The end: a knitted band, flat, a little wider at the bottom, and its fringe.
    const end = at(NECK_PIVOT.x + 0.035, neckBase - 0.11, NECK_PIVOT.z + 0.1 + 0.02 * build, [-0.22, 0, 0.06]);
    parts.add(new THREE.CylinderGeometry(0.034, 0.039, 0.26, 12, 4).scale(1, 1, 0.3), wool, end);
    for (let k = 0; k < 7; k++) {
      const x = -0.032 + (k / 6) * 0.064;
      parts.add(new THREE.CylinderGeometry(0.0022, 0.0018, 0.03, 4), wool, end.clone().multiply(at(x, -0.142, 0, [0, 0, (k - 3) * 0.03])));
    }
  }
  return hood;
}

/**
 * A tote hanging from the left shoulder (bag and straps on a bone at the shoulder, so it swings) or
 * a backpack (the pack on a bone at its top, the straps on the body), in the bag colour; the bone,
 * or null without a bag. The fixed parts go into `parts` (the torso's frame).
 */
function addBag(parts: Parts, look: PersonLook): THREE.Group | null {
  if (!look.bag) return null;
  const cloth = new THREE.MeshStandardMaterial({ color: look.bagColor ?? 0x6b4a2a, roughness: 0.95 });
  const { shoulderX, shoulderY } = proportionsOf(look);
  const bone = new THREE.Group();
  const swing = new Parts();
  if (look.bag === 'tote') {
    const hip = trunkSection(WAIST_Y, look);
    const x = -(Math.max(shoulderX + 0.06, hip.halfWidth + 0.05));
    const y = WAIST_Y - TORSO_PIVOT_Y + 0.02;
    // The straps, from the bag's top corners over the shoulder.
    const shoulder = new THREE.Vector3(-shoulderX * 0.75, shoulderY - TORSO_PIVOT_Y + 0.045, 0);
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
  // Clear of a jacket's ease over the trunk (`trunkGeometry`).
  const off = look.top === 'jacket' || look.coat ? 0.017 : 0.008;
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
