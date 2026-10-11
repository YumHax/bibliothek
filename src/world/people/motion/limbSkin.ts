import * as THREE from 'three';
import { afterChunk, patchShader } from '../../materials/shaderPatch';

/*
 * A limb is one surface from its root joint to its end (shoulder to wrist, hip to ankle, the neck
 * from the collar into the skull), bent in the vertex shader like the trunk (`SpineSkin`): each
 * vertex follows up to three bones by weights baked as an attribute at build (`skinLimb`), the rest
 * staying with the limb's parent. The surface is modelled at rest in the frame of its first joint
 * (origin at the joint, hanging along -y), so the bones' matrices are their turns from rest:
 *
 * - a twist about the limb's own axis spreads along the bone instead of wringing the joint (the
 *   upper arm takes the elbow's turn, the forearm the wrist's, the neck the head's turn);
 * - at a bend the skin keeps its volume: pushed out a little all round, the point of the elbow or
 *   the knee more, the deltoid bunching on the side the arm moves towards;
 * - on the inside of a bend the cloth (and, faintly, the skin) creases: fold normals across the limb
 *   in the fragment shader, deeper as the joint bends, darker in their troughs. No texture.
 *
 * The matrices are uniforms (per limb, no texture unit); the shadow passes get depth materials
 * patched the same way, so the shadow bends with the limb.
 */

/** Where a bend's volume and creases reach along the limb either side of its joint (m). */
const BEND_REACH = 0.045;
const FOLD_REACH = 0.06;
/** The creases' wavelength along the limb (m). */
const FOLD_WAVE = 0.022;
/** Depth of a crease's slope at a full bend (normal tilt), and the shade in its trough. */
const FOLD_SLOPE = 0.55;
const FOLD_SHADE = 0.2;
/** How far along the limb the redder skin over the elbow's point or the kneecap reaches (m), and its tint at full strength. */
const POINT_REACH = 0.04;
const POINT_TINT = 'vec3(1.0, 0.82, 0.8)';

const COMMON = /* glsl */ `
attribute vec3 limbWeight;
attribute vec2 limbAlong;
uniform mat4 limbBone1;
uniform mat4 limbBone2;
uniform mat4 limbBone3;
uniform vec3 limbTwist;
uniform vec2 limbJointY;
uniform vec4 limbBendA;
uniform vec4 limbBendB;
uniform vec4 limbVolume;
mat4 limbTurnY(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat4(c, 0.0, -s, 0.0, 0.0, 1.0, 0.0, 0.0, s, 0.0, c, 0.0, 0.0, 0.0, 0.0, 1.0);
}
mat4 limbMatrix() {
  float rest = 1.0 - limbWeight.x - limbWeight.y - limbWeight.z;
  mat4 m = mat4(1.0) * rest
    + (limbBone1 * limbTurnY(limbTwist.x * limbAlong.x)) * limbWeight.x
    + (limbBone2 * limbTurnY(limbTwist.y * limbAlong.y)) * limbWeight.y
    + limbBone3 * limbWeight.z;
  return limbTurnY(limbTwist.z * limbAlong.x) * m;
}
vec3 limbFill(vec3 p) {
  float len = length(p.xz);
  if (len < 1e-5) return p;
  vec2 dir = p.xz / len;
  float a = p.y / ${BEND_REACH.toFixed(3)};
  float inA = dot(dir, limbBendA.xy);
  float pushA = limbBendA.z * exp(-a * a) * (limbVolume.x * max(inA, 0.0) + limbVolume.y * max(-inA, 0.0));
  float b = (p.y - limbJointY.x) / ${BEND_REACH.toFixed(3)};
  float inB = dot(dir, limbBendB.xy);
  float pushB = limbBendB.z * exp(-b * b) * (0.05 + limbVolume.z * max(inB, 0.0) + limbVolume.w * max(-inB, 0.0));
  return p + vec3(dir.x, 0.0, dir.y) * len * (pushA + pushB);
}
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform vec4 limbBendA;
uniform vec4 limbBendB;
uniform vec2 limbJointY;
uniform float limbFold;
uniform vec2 limbPoint;
uniform float limbRedden;
varying vec3 vLimbRest;
varying vec3 vLimbAxis;
float limbCrease(vec2 dir, float dy, vec4 bend, out float trough) {
  float inner = smoothstep(0.05, 0.75, dot(dir, bend.xy));
  float f = dy / ${FOLD_REACH.toFixed(3)};
  // Uneven creases: their spacing and depth wander round the limb.
  float around = atan(dir.y, dir.x);
  float k = ${((2 * Math.PI) / FOLD_WAVE).toFixed(1)} * (1.0 + 0.18 * sin(around * 3.0 + 1.3));
  float env = exp(-f * f) * inner * min(bend.z, 1.6) / 1.6 * (0.7 + 0.3 * sin(around * 5.0));
  float phase = dy * k + 1.7 * sin(around * 2.0);
  trough = env * (0.5 - 0.5 * sin(phase));
  return env * cos(phase);
}
`;

/** One joint's bend for the shader: the inner side's direction across the limb (rest frame), how far it bends (radians). */
function setBend(out: THREE.Vector4, q: THREE.Quaternion, preTwist: number): void {
  const v = BEND_DIR.set(0, -1, 0).applyQuaternion(q);
  const angle = Math.acos(THREE.MathUtils.clamp(-v.y, -1, 1));
  const h = Math.hypot(v.x, v.z);
  if (h < 1e-5) {
    out.set(0, 0, 0, 0);
    return;
  }
  // The direction in the rest frame before the bone's own twist about its axis.
  const c = Math.cos(-preTwist);
  const s = Math.sin(-preTwist);
  const x = v.x / h;
  const z = v.z / h;
  out.set(c * x + s * z, -s * x + c * z, angle, 0);
}
const BEND_DIR = new THREE.Vector3();

interface LimbShape {
  /** Rest heights (mesh frame) of the second and third joints (the elbow and the wrist, the knee and the ankle). */
  joints: readonly [number, number];
  /** How much fuller the skin gets at a bend, per radian: at the first joint on the inside and outside of it, at the second likewise. */
  volume: readonly [number, number, number, number];
  /** Where the second joint's point faces across the limb at rest (x, z: the elbow's back, the kneecap's front); none for the neck. */
  point?: readonly [number, number];
}

export class LimbSkin {
  private readonly bone1 = { value: new THREE.Matrix4() };
  private readonly bone2 = { value: new THREE.Matrix4() };
  private readonly bone3 = { value: new THREE.Matrix4() };
  private readonly twist = { value: new THREE.Vector3() };
  private readonly jointY: { value: THREE.Vector2 };
  private readonly bendA = { value: new THREE.Vector4() };
  private readonly bendB = { value: new THREE.Vector4() };
  private readonly volume: { value: THREE.Vector4 };
  private readonly point: { value: THREE.Vector2 };
  private readonly m = new THREE.Matrix4();
  private readonly t = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly zero = new THREE.Vector3();
  private shadows: { depth: THREE.MeshDepthMaterial; distance: THREE.MeshDistanceMaterial } | null = null;

  constructor(shape: LimbShape) {
    this.jointY = { value: new THREE.Vector2(shape.joints[0], shape.joints[1]) };
    this.volume = { value: new THREE.Vector4(...shape.volume) };
    this.point = { value: new THREE.Vector2(...(shape.point ?? [0, 0])) };
  }

  /**
   * Makes `material` bend with the limb, its creases `fold` deep (1 cloth, less on skin), the skin
   * over the joint's point `redden` redder (bare skin only). Patched once; one program for every limb.
   */
  patch<M extends THREE.Material>(material: M, fold: number, redden = 0): M {
    const strength = { value: fold };
    const red = { value: redden };
    return patchShader(material, 'limb', (shader) => {
      this.bind(shader.uniforms);
      shader.uniforms.limbFold = strength;
      shader.uniforms.limbRedden = red;
      shader.uniforms.limbPoint = this.point;
      shader.vertexShader = afterChunk(shader.vertexShader, 'common', `${COMMON}\nvarying vec3 vLimbRest;\nvarying vec3 vLimbAxis;`);
      shader.vertexShader = afterChunk(shader.vertexShader, 'beginnormal_vertex', 'objectNormal = mat3(limbMatrix()) * objectNormal;');
      shader.vertexShader = afterChunk(
        shader.vertexShader,
        'begin_vertex',
        `{
          mat4 limbM = limbMatrix();
          vLimbRest = transformed;
          vLimbAxis = normalize(normalMatrix * (mat3(limbM) * vec3(0.0, 1.0, 0.0)));
          transformed = (limbM * vec4(limbFill(transformed), 1.0)).xyz;
        }`,
      );
      shader.fragmentShader = afterChunk(shader.fragmentShader, 'common', FRAGMENT_HEAD);
      shader.fragmentShader = afterChunk(
        shader.fragmentShader,
        'normal_fragment_maps',
        `{
          float len = length(vLimbRest.xz);
          vec2 dir = len > 1e-5 ? vLimbRest.xz / len : vec2(0.0);
          float troughA;
          float troughB;
          float slope = limbCrease(dir, vLimbRest.y + 0.03, limbBendA, troughA) * 0.6 + limbCrease(dir, vLimbRest.y - limbJointY.x, limbBendB, troughB);
          normal = normalize(normal - vLimbAxis * slope * ${FOLD_SLOPE.toFixed(2)} * limbFold);
          diffuseColor.rgb *= 1.0 - ${FOLD_SHADE.toFixed(2)} * limbFold * max(troughA * 0.6, troughB);
          // Bare skin reddens a little over the point of the second joint (the elbow, the kneecap).
          float jp = (vLimbRest.y - limbJointY.x) / ${POINT_REACH.toFixed(3)};
          float point = exp(-jp * jp) * smoothstep(0.35, 0.95, dot(dir, limbPoint)) * limbRedden;
          diffuseColor.rgb *= mix(vec3(1.0), ${POINT_TINT}, point);
        }`,
      );
    });
  }

  /** The shadow passes' materials for the limb (depth for spot and directional lights, distance for point lights), one pair for all its meshes. */
  shadowMaterials(): { depth: THREE.MeshDepthMaterial; distance: THREE.MeshDistanceMaterial } {
    const shadow = <M extends THREE.Material>(material: M): M =>
      patchShader(material, 'limbShadow', (shader) => {
        this.bind(shader.uniforms);
        shader.vertexShader = afterChunk(shader.vertexShader, 'common', COMMON);
        shader.vertexShader = afterChunk(shader.vertexShader, 'begin_vertex', 'transformed = (limbMatrix() * vec4(limbFill(transformed), 1.0)).xyz;');
      });
    this.shadows ??= { depth: shadow(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })), distance: shadow(new THREE.MeshDistanceMaterial()) };
    return this.shadows;
  }

  /**
   * The arm this frame, from its bones' turns (YXZ Euler angles, as `PersonModel` sets them): the
   * shoulder, the elbow (its turn about the upper arm, `y`, spread down the upper arm) and the
   * wrist (its twist, `y`, spread down the forearm). `elbowY` and `wristY` are where those joints
   * sit in their parent's frame (the elbow's y below the shoulder, the wrist's below the elbow).
   */
  arm(shoulder: THREE.Euler, elbow: THREE.Euler, wrist: THREE.Euler, elbowY: number, wristY: number): void {
    this.q.setFromEuler(shoulder);
    this.bone1.value.makeRotationFromQuaternion(this.q);
    setBend(this.bendA.value, this.q, 0);
    this.chain(this.bone2.value, this.bone1.value, elbowY, this.q.setFromEuler(elbow));
    this.chain(this.bone3.value, this.bone2.value, elbowY + wristY, this.q.setFromEuler(wrist));
    // The elbow's bend without its turn about the upper arm (that turn is the upper arm's twist).
    this.q.setFromEuler(this.e.set(elbow.x, 0, elbow.z, 'YXZ'));
    setBend(this.bendB.value, this.q, elbow.y);
    this.twist.value.set(elbow.y, wrist.y, 0);
  }

  /** The leg this frame: the hip's, the knee's and the ankle's turns (quaternions), the knee and the ankle where they sit in their parents' frames. */
  leg(hip: THREE.Quaternion, knee: THREE.Quaternion, ankle: THREE.Quaternion, kneeY: number, ankleY: number): void {
    this.bone1.value.makeRotationFromQuaternion(hip);
    setBend(this.bendA.value, hip, 0);
    this.chain(this.bone2.value, this.bone1.value, kneeY, knee);
    this.chain(this.bone3.value, this.bone2.value, kneeY + ankleY, ankle);
    setBend(this.bendB.value, knee, 0);
    this.twist.value.set(0, 0, 0);
  }

  /** The neck this frame: the head's turn (a YXZ Euler: the turn, `y`, spreads up the neck; the nod and the tilt bend it) and its scale. */
  neck(head: THREE.Euler, scale: THREE.Vector3): void {
    this.q.setFromEuler(this.e.set(head.x, 0, head.z, 'YXZ'));
    this.bone1.value.compose(this.zero, this.q, scale);
    this.twist.value.set(0, 0, head.y);
  }

  /** `out` = `parent` then a turn `q` about the joint at height `y` (the mesh frame at rest). */
  private chain(out: THREE.Matrix4, parent: THREE.Matrix4, y: number, q: THREE.Quaternion): void {
    this.m.makeTranslation(0, y, 0);
    this.t.compose(this.zero, q, this.one);
    out.copy(parent).multiply(this.m).multiply(this.t);
    out.multiply(this.m.makeTranslation(0, -y, 0));
  }

  private bind(uniforms: Record<string, THREE.IUniform>): void {
    uniforms.limbBone1 = this.bone1;
    uniforms.limbBone2 = this.bone2;
    uniforms.limbBone3 = this.bone3;
    uniforms.limbTwist = this.twist;
    uniforms.limbJointY = this.jointY;
    uniforms.limbBendA = this.bendA;
    uniforms.limbBendB = this.bendB;
    uniforms.limbVolume = this.volume;
  }
}

/** How a vertex at rest height `y` (the mesh frame) follows the limb's bones: its weights for bones 1, 2, 3 and how far along bones 1 and 2 it is. */
export type LimbWeights = (y: number) => readonly [w1: number, w2: number, w3: number, along1: number, along2: number];

/**
 * Bakes `weights` into `geometry` (its rest frame: origin at the first joint) and bounds it by
 * `reach` (the limb can swing anywhere about its root joint without being culled).
 */
export function skinLimb(geometry: THREE.BufferGeometry, weights: LimbWeights, reach: number): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const weight = new Float32Array(position.count * 3);
  const along = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const [w1, w2, w3, a1, a2] = weights(position.getY(i));
    weight.set([w1, w2, w3], i * 3);
    along.set([a1, a2], i * 2);
  }
  geometry.setAttribute('limbWeight', new THREE.Float32BufferAttribute(weight, 3));
  geometry.setAttribute('limbAlong', new THREE.Float32BufferAttribute(along, 2));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), reach);
  return geometry;
}
