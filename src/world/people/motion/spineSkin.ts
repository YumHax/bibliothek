import * as THREE from 'three';
import { afterChunk, patchShader } from '../../materials/shaderPatch';

/*
 * The trunk is one sculpted surface, so the spine cannot be rigid pieces: it bends in the vertex
 * shader. Each vertex follows the pelvis, the lower back or the chest by its height at rest (a
 * smooth blend over the waist and over the ribs, linear blend skinning with three bones), so a lean
 * curves the back, a twist wrings the waist and a breath fills the chest, and the seat stays with
 * the legs. The tops of the shoulders, out from the neck, follow the collarbones instead (`attach`):
 * a shrug lifts the shoulder line, a reach brings it forward, and an arm raised high hollows the
 * armpit under it. The matrices are uniforms (per person, a few floats, no texture unit); the
 * shadow passes get depth materials patched the same way, so the shadow bends with the body.
 */

/** Heights at rest (reference metres) over which a vertex passes from the pelvis to the lower back, and from the lower back to the chest. */
const LUMBAR_BLEND = [0.93, 1.07] as const;
const CHEST_BLEND = [1.12, 1.3] as const;
/** Heights at rest over which the top of the shoulders passes to the collarbones, and from how far out of the middle (x, reference metres). */
const SHOULDER_BLEND = [1.33, 1.43] as const;
const SHOULDER_FROM = [0.06, 0.13] as const;

const HEADER = /* glsl */ `
uniform mat4 spineLumbar;
uniform mat4 spineChest;
uniform mat4 spineClavicleL;
uniform mat4 spineClavicleR;
uniform vec2 spineArmpit;
uniform float spineRestY;
mat4 spineBlend(vec3 p) {
  float at = p.y + spineRestY;
  float l = smoothstep(${LUMBAR_BLEND[0].toFixed(3)}, ${LUMBAR_BLEND[1].toFixed(3)}, at);
  float c = smoothstep(${CHEST_BLEND[0].toFixed(3)}, ${CHEST_BLEND[1].toFixed(3)}, at);
  float s = smoothstep(${SHOULDER_BLEND[0].toFixed(3)}, ${SHOULDER_BLEND[1].toFixed(3)}, at) * smoothstep(${SHOULDER_FROM[0].toFixed(3)}, ${SHOULDER_FROM[1].toFixed(3)}, abs(p.x));
  mat4 top = spineChest * (1.0 - s) + (p.x < 0.0 ? spineClavicleL : spineClavicleR) * s;
  return mat4(1.0) * (1.0 - l) + spineLumbar * (l * (1.0 - c)) + top * (l * c);
}
vec3 spineHollow(vec3 p) {
  float at = (p.y + spineRestY - 1.29) / 0.05;
  float depth = p.z / 0.06;
  float g = exp(-at * at - depth * depth) * smoothstep(0.1, 0.15, abs(p.x)) * (p.x < 0.0 ? spineArmpit.x : spineArmpit.y);
  return p + vec3(-sign(p.x) * 0.007 * g, 0.004 * g, 0.0);
}
`;

export class SpineSkin {
  /** The lower back's and the chest's transforms, in the trunk mesh's own frame, from their rest. */
  private readonly lumbar = { value: new THREE.Matrix4() };
  private readonly chest = { value: new THREE.Matrix4() };
  private readonly clavicles = [{ value: new THREE.Matrix4() }, { value: new THREE.Matrix4() }] as const;
  /** How high each arm is raised (0 down .. 1 up past the shoulder), for the armpit's hollow. */
  private readonly armpit = { value: new THREE.Vector2() };
  /** The torso frame, the collarbones (left, right) and the shoulders under them, once attached. */
  private bones: { torso: THREE.Object3D; clavicles: readonly THREE.Object3D[]; shoulders: readonly THREE.Object3D[] } | null = null;
  private readonly rest = new THREE.Vector3();
  private readonly hang = new THREE.Vector3();
  private readonly turn = new THREE.Matrix4();
  private readonly fromChest = new THREE.Matrix4();
  private readonly chestRest = new THREE.Vector3();
  /** What the mesh's local y is at rest, in reference metres over the floor, minus its local y. */
  private readonly restY: { value: number };
  private readonly scratch = new THREE.Matrix4();
  private readonly offset = new THREE.Matrix4();
  private readonly back = new THREE.Matrix4();

  /** `restY`: the height over the floor of the trunk mesh's origin (its vertices' y are relative to it). */
  constructor(restY: number) {
    this.restY = { value: restY };
  }

  /** Makes `material` bend (patched once; its program is shared by every trunk). */
  patch<M extends THREE.Material>(material: M): M {
    return patchShader(material, 'spine', (shader) => {
      shader.uniforms.spineLumbar = this.lumbar;
      shader.uniforms.spineChest = this.chest;
      shader.uniforms.spineClavicleL = this.clavicles[0];
      shader.uniforms.spineClavicleR = this.clavicles[1];
      shader.uniforms.spineArmpit = this.armpit;
      shader.uniforms.spineRestY = this.restY;
      shader.vertexShader = afterChunk(shader.vertexShader, 'common', HEADER);
      if (shader.vertexShader.includes('#include <beginnormal_vertex>')) {
        shader.vertexShader = afterChunk(shader.vertexShader, 'beginnormal_vertex', 'objectNormal = mat3(spineBlend(position)) * objectNormal;');
      }
      shader.vertexShader = afterChunk(shader.vertexShader, 'begin_vertex', 'transformed = (spineBlend(position) * vec4(spineHollow(transformed), 1.0)).xyz;');
    });
  }

  /** The shadow passes' materials for the bent trunk (depth for spot and directional lights, distance for point lights). */
  shadowMaterials(): { depth: THREE.MeshDepthMaterial; distance: THREE.MeshDistanceMaterial } {
    return {
      depth: this.patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })),
      distance: this.patch(new THREE.MeshDistanceMaterial()),
    };
  }

  /**
   * The collarbones the tops of the shoulders follow (left, right: children of `torso`, the chest's
   * child, unturned at rest) and the shoulders under them (an arm raised hollows its armpit).
   */
  attach(torso: THREE.Object3D, clavicles: readonly THREE.Object3D[], shoulders: readonly THREE.Object3D[]): void {
    this.bones = { torso, clavicles, shoulders };
  }

  /**
   * The bones' pose this frame: `lumbar` and `chest` (the chest a child of the lower back) as their
   * matrices relative to the trunk mesh's parent, `meshOffset` the mesh's position in that parent,
   * and `breath` how much fuller the chest is (about `chestCentre`, the parent's frame).
   */
  update(lumbar: THREE.Object3D, chest: THREE.Object3D, meshOffset: THREE.Vector3, breath: number, chestCentre: THREE.Vector3): void {
    this.offset.makeTranslation(meshOffset.x, meshOffset.y, meshOffset.z);
    this.back.makeTranslation(-meshOffset.x, -meshOffset.y, -meshOffset.z);
    lumbar.updateMatrix();
    chest.updateMatrix();
    // Lower back: its transform from rest (its own position, unrotated).
    const lp = lumbar.position;
    this.scratch.makeTranslation(-lp.x, -lp.y, -lp.z);
    this.lumbar.value.copy(this.back).multiply(lumbar.matrix).multiply(this.scratch).multiply(this.offset);
    // Chest: through the lower back, from its rest (the two positions added), breathing about its middle.
    const cx = lp.x + chest.position.x;
    const cy = lp.y + chest.position.y;
    const cz = lp.z + chest.position.z;
    this.scratch.makeTranslation(-cx, -cy, -cz);
    const m = this.chest.value.copy(this.back).multiply(lumbar.matrix).multiply(chest.matrix).multiply(this.scratch);
    if (breath !== 0) {
      const c = chestCentre;
      m.multiply(this.scratch.makeTranslation(c.x, c.y, c.z));
      m.multiply(this.scratch.makeScale(1 + breath * 0.4, 1 + breath * 0.3, 1 + breath * 0.9));
      m.multiply(this.scratch.makeTranslation(-c.x, -c.y, -c.z));
    }
    this.fromChest.copy(m);
    this.chestRest.set(cx, cy, cz);
    m.multiply(this.offset);
    this.shoulders();
  }

  /**
   * The tops of the shoulders onto the collarbones as they are now (after `update`, and again once
   * the arms have moved this frame): each from its rest (the chest's rest, the torso's and its own
   * positions added), turned, then carried with the chest.
   */
  shoulders(): void {
    if (!this.bones) {
      for (const clavicle of this.clavicles) clavicle.value.copy(this.chest.value);
      return;
    }
    const { torso, clavicles, shoulders } = this.bones;
    for (const [i, clavicle] of clavicles.entries()) {
      const r = this.rest.copy(this.chestRest).add(torso.position).add(clavicle.position);
      this.turn.makeRotationFromQuaternion(clavicle.quaternion);
      const m = this.clavicles[i]!.value.copy(this.fromChest).multiply(this.scratch.makeTranslation(r.x, r.y, r.z)).multiply(this.turn);
      m.multiply(this.scratch.makeTranslation(-r.x, -r.y, -r.z)).multiply(this.offset);
      // The arm's angle from hanging: the armpit hollows from about level with the shoulder up.
      const hang = this.hang.set(0, -1, 0).applyQuaternion(shoulders[i]!.quaternion);
      const raised = Math.acos(THREE.MathUtils.clamp(-hang.y, -1, 1));
      this.armpit.value.setComponent(i, THREE.MathUtils.smoothstep(raised, 0.9, 2.2));
    }
  }
}
