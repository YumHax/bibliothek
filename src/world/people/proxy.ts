import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BALL_Z, CHEST_Y, HEEL_Z, LUMBAR_Y, PELVIS_Y, trunkSection } from './body';
import type { PersonLook } from './looks';
import type { Rig } from './rig';

/*
 * The person seen from across the street: one skinned mesh in one draw, bent by the rig's own
 * bones (the same pose as the full body, so nothing jumps when it swaps in), each part rigidly on
 * its bone. Tapered tubes for the limbs, the trunk's own rings at a few heights, a head with its
 * hair or hat, shoes, a skirt or a coat's skirts, a backpack; coloured per vertex from the look.
 * No map, no morphs, no details: past `PersonModel`'s proxy distance a face is a few pixels.
 */

/** Rings and sides of the trunk, and sides of a limb's tube. */
const TRUNK_RINGS = [0.8, 0.86, 0.94, 1.02, 1.12, 1.22, 1.32, 1.4, 1.46] as const;
const TRUNK_SIDES = 12;
const TUBE_SIDES = 8;
/** The head's radius (reference metres, before the look's head scale) and a hair or hat's lift off it. */
const HEAD_R = 0.104;
const HAIR_LIFT = 1.07;

interface Part {
  geometry: THREE.BufferGeometry;
  color: number;
  bone: number;
}

/** The bones a proxy is bound to, in order (their indices are the parts' `bone`). */
function bonesOf(rig: Rig): THREE.Object3D[] {
  const [legL, legR] = rig.legs;
  const [armL, armR] = rig.arms;
  return [rig.pelvis, rig.lumbar, rig.chest, rig.head, rig.skull, legL.hip, legL.knee, legL.ankle, legR.hip, legR.knee, legR.ankle, armL.shoulder, armL.elbow, armL.wrist, armR.shoulder, armR.elbow, armR.wrist];
}
const B = { pelvis: 0, lumbar: 1, chest: 2, head: 3, skull: 4, leg: [5, 8], arm: [11, 14] } as const;

/**
 * The proxy for `rig` dressed as `look`, as a child of the rig's root, bound to its bones as they stand now (the
 * rest the body was built in). Its material is its own (it fades with the person).
 */
export function buildProxy(rig: Rig, look: PersonLook): THREE.SkinnedMesh {
  const root = rig.root;
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const at = (bone: THREE.Object3D, local = new THREE.Vector3()): THREE.Vector3 => bone.localToWorld(local.clone()).applyMatrix4(toRoot);
  const parts: Part[] = [];
  const skin = look.skin;
  const top = look.topColor;
  const legsBare = look.shorts || (look.skirt !== undefined && look.tights === undefined);
  const legColour = look.skirt ? (look.tights ?? skin) : look.trousers;
  const girth = 0.7 + 0.3 * look.build;
  const lift = at(rig.pelvis).y - PELVIS_Y;

  // The trunk: the body's own rings, the top's colour above the belt, the trousers' below.
  parts.push(...trunkParts(look, lift));

  // The legs: thigh, shin, shoe.
  for (const [i, leg] of rig.legs.entries()) {
    const base = B.leg[i]!;
    const hip = at(leg.hip);
    const knee = at(leg.knee);
    const ankle = at(leg.ankle);
    parts.push({ geometry: tube(hip, knee, 0.078 * girth, 0.055 * girth), color: look.shorts ? look.trousers : legColour, bone: base });
    parts.push({ geometry: tube(knee, ankle, 0.053 * girth, 0.04 * girth), color: legsBare ? skin : legColour, bone: base + 1 });
    const shoe = new THREE.BoxGeometry(0.095, 0.085, BALL_Z + 0.07 - HEEL_Z);
    shoe.translate(0, -0.045, (BALL_Z + 0.07 + HEEL_Z) / 2);
    shoe.applyMatrix4(new THREE.Matrix4().makeTranslation(ankle.x, ankle.y, ankle.z));
    parts.push({ geometry: shoe, color: look.shoeColor, bone: base + 2 });
  }

  // The arms: upper arm, forearm, hand.
  for (const [i, arm] of rig.arms.entries()) {
    const base = B.arm[i]!;
    const shoulder = at(arm.shoulder);
    const elbow = at(arm.elbow);
    const wrist = at(arm.wrist);
    parts.push({ geometry: tube(shoulder, elbow, 0.05 * girth, 0.042 * girth), color: top, bone: base });
    parts.push({ geometry: tube(elbow, wrist, 0.04 * girth, 0.032 * girth), color: look.longSleeves ? top : skin, bone: base + 1 });
    const hand = new THREE.SphereGeometry(0.042, 6, 4);
    hand.scale(0.75, 1.25, 1);
    const centre = wrist.clone().add(wrist.clone().sub(elbow).setLength(0.075));
    hand.translate(centre.x, centre.y, centre.z);
    parts.push({ geometry: hand, color: skin, bone: base + 2 });
  }

  // The neck, the head and what is on it.
  const skull = at(rig.skull);
  const neckBase = at(rig.chest, new THREE.Vector3(0, 1.43 - CHEST_Y, 0));
  const headScale = look.headScale ?? 1;
  const r = HEAD_R * headScale;
  parts.push({ geometry: tube(neckBase, skull.clone().setY(skull.y - r * 0.6), 0.045, 0.042), color: look.scarf ?? skin, bone: B.head });
  const head = new THREE.SphereGeometry(r, 10, 8);
  head.scale(0.86, 1.08, 0.98);
  head.translate(skull.x, skull.y, skull.z);
  parts.push({ geometry: head, color: skin, bone: B.skull });
  if (look.hat || look.hairStyle !== 'bald') {
    // A cap of hair (or the hat) over the crown and the back of the head.
    const cap = new THREE.SphereGeometry(r * HAIR_LIFT, 10, 6, 0, Math.PI * 2, 0, look.hat === 'beanie' ? Math.PI * 0.42 : Math.PI * 0.5);
    cap.scale(0.88, 1.08, 1);
    cap.rotateX(-0.35);
    cap.translate(skull.x, skull.y + r * 0.05, skull.z - r * 0.06);
    parts.push({ geometry: cap, color: look.hat ? (look.hatColor ?? look.hair) : look.hair, bone: B.skull });
  }
  if (!look.hat && (look.hairStyle === 'long' || look.hairStyle === 'ponytail')) {
    const fall = new THREE.BoxGeometry(r * 1.6, r * (look.hairStyle === 'long' ? 2.3 : 1.6), r * 0.5);
    fall.translate(skull.x, skull.y - r * (look.hairStyle === 'long' ? 0.9 : 0.6), skull.z - r * 0.82);
    parts.push({ geometry: fall, color: look.hair, bone: B.skull });
  }

  // A skirt, a dress or a coat's skirts hang from the waist.
  if (look.skirt || look.coat) {
    const waist = 0.98 + lift;
    const hem = (look.skirt ? 0.5 : 0.62) + lift;
    const section = trunkSection(0.98, look);
    const flare = new THREE.CylinderGeometry(section.halfWidth + 0.012, section.halfWidth + 0.07, waist - hem, TRUNK_SIDES, 1, true);
    flare.scale(1, 1, (section.front + section.back) / (2 * section.halfWidth));
    flare.translate(0, (waist + hem) / 2, (section.front - section.back) / 2);
    parts.push({ geometry: flare, color: look.skirt ? (look.skirtColor ?? top) : top, bone: B.pelvis });
  }
  if (look.bag === 'backpack') {
    const pack = new THREE.BoxGeometry(0.28, 0.36, 0.13);
    const section = trunkSection(1.22, look);
    pack.translate(0, 1.2 + lift, -section.back - 0.07);
    parts.push({ geometry: pack, color: look.bagColor ?? 0x2a2a2a, bone: B.chest });
  }

  const geometry = mergeParts(parts);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'PersonProxy';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  // Culled by a sphere round the standing body (the root's frame), not one recomputed from the pose.
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.35);
  root.add(mesh);
  mesh.updateMatrixWorld(true);
  // Bound as the bones stand now: the inverses are taken from their world matrices.
  mesh.bind(new THREE.Skeleton(bonesOf(rig) as THREE.Bone[]));
  return mesh;
}

/** The trunk's rings (`trunkSection`) from the crotch to the shoulders, each on the bone of its height. */
function trunkParts(look: PersonLook, lift: number): Part[] {
  const positions: number[] = [];
  const indices: number[] = [];
  const rings: { color: number; bone: number }[] = [];
  const belt = 0.99;
  for (const [i, y] of TRUNK_RINGS.entries()) {
    const s = trunkSection(y, look);
    // The top ring closes in towards the neck.
    const k = i === TRUNK_RINGS.length - 1 ? 0.55 : 1;
    for (let j = 0; j < TRUNK_SIDES; j++) {
      const a = (j / TRUNK_SIDES) * Math.PI * 2;
      const x = Math.sin(a) * s.halfWidth * k;
      const c = Math.cos(a);
      const z = (c > 0 ? s.front : s.back) * c * k;
      positions.push(x, y + lift, z);
    }
    const bottom = y < belt && !look.skirt;
    rings.push({ color: bottom ? look.trousers : look.apron && y < 1.3 ? look.apron : look.topColor, bone: y < LUMBAR_Y ? B.pelvis : y < CHEST_Y ? B.lumbar : B.chest });
  }
  for (let i = 0; i < TRUNK_RINGS.length - 1; i++) {
    for (let j = 0; j < TRUNK_SIDES; j++) {
      const a = i * TRUNK_SIDES + j;
      const b = i * TRUNK_SIDES + ((j + 1) % TRUNK_SIDES);
      const c = a + TRUNK_SIDES;
      const d = b + TRUNK_SIDES;
      indices.push(a, b, c, b, d, c);
    }
  }
  // Caps: the crotch and the shoulders' top.
  const n = TRUNK_RINGS.length;
  positions.push(0, TRUNK_RINGS[0] - 0.03 + lift, 0, 0, TRUNK_RINGS[n - 1]! + 0.02 + lift, 0);
  const low = n * TRUNK_SIDES;
  for (let j = 0; j < TRUNK_SIDES; j++) {
    const a = j;
    const b = (j + 1) % TRUNK_SIDES;
    indices.push(low, b, a);
    const top = (n - 1) * TRUNK_SIDES;
    indices.push(low + 1, top + a, top + b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Per vertex: each ring's colour and bone (the caps take their ring's).
  const colours: number[] = [];
  const bones: number[] = [];
  const colour = new THREE.Color();
  const each = (ring: { color: number; bone: number }): void => {
    colour.set(ring.color);
    colours.push(colour.r, colour.g, colour.b);
    bones.push(ring.bone, 0, 0, 0);
  };
  for (const ring of rings) for (let j = 0; j < TRUNK_SIDES; j++) each(ring);
  each(rings[0]!);
  each(rings[n - 1]!);
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colours), 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(bones), 4));
  const weights = new Float32Array(positions.length / 3 * 4);
  for (let k = 0; k < weights.length; k += 4) weights[k] = 1;
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  return [{ geometry, color: -1, bone: -1 }];
}

/** A tapered tube from `a` (radius `ra`) to `b` (radius `rb`), capped, in the root's frame. */
function tube(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number): THREE.BufferGeometry {
  const axis = b.clone().sub(a);
  const length = Math.max(1e-3, axis.length());
  const geometry = new THREE.CylinderGeometry(rb, ra, length, TUBE_SIDES, 1, false);
  geometry.translate(0, length / 2, 0);
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
  geometry.applyMatrix4(new THREE.Matrix4().compose(a, turn, new THREE.Vector3(1, 1, 1)));
  return geometry;
}

/** The parts as one geometry: position, normal, colour, one bone each at full weight. */
function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const colour = new THREE.Color();
  const ready = parts.map((part) => {
    const g = part.geometry;
    g.deleteAttribute('uv');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (part.bone < 0) return g;
    const count = g.getAttribute('position').count;
    colour.set(part.color);
    const colours = new Float32Array(count * 3);
    const bones = new Uint16Array(count * 4);
    const weights = new Float32Array(count * 4);
    for (let v = 0; v < count; v++) {
      colours.set([colour.r, colour.g, colour.b], v * 3);
      bones[v * 4] = part.bone;
      weights[v * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(bones, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
    return g;
  });
  const merged = mergeGeometries(ready);
  for (const g of ready) g.dispose();
  if (!merged) throw new Error('person proxy: parts did not merge');
  merged.computeBoundingSphere();
  return merged;
}
