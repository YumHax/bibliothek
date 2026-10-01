import * as THREE from 'three';
import { afterChunk, patchShader } from '../../materials/shaderPatch';

/*
 * The trunk is one sculpted surface, so the spine cannot be rigid pieces: it bends in the vertex
 * shader. Each vertex follows the pelvis, the lower back or the chest by its height at rest (a
 * smooth blend over the waist and over the ribs, linear blend skinning with three bones), so a lean
 * curves the back, a twist wrings the waist and a breath fills the chest, and the seat stays with
 * the legs. The matrices are uniforms (per person, a few floats, no texture unit); the shadow
 * passes get depth materials patched the same way, so the shadow bends with the body.
 */

/** Heights at rest (reference metres) over which a vertex passes from the pelvis to the lower back, and from the lower back to the chest. */
const LUMBAR_BLEND = [0.93, 1.07] as const;
const CHEST_BLEND = [1.12, 1.3] as const;

const HEADER = /* glsl */ `
uniform mat4 spineLumbar;
uniform mat4 spineChest;
uniform float spineRestY;
mat4 spineBlend(float y) {
  float at = y + spineRestY;
  float l = smoothstep(${LUMBAR_BLEND[0].toFixed(3)}, ${LUMBAR_BLEND[1].toFixed(3)}, at);
  float c = smoothstep(${CHEST_BLEND[0].toFixed(3)}, ${CHEST_BLEND[1].toFixed(3)}, at);
  return mat4(1.0) * (1.0 - l) + spineLumbar * (l * (1.0 - c)) + spineChest * (l * c);
}
`;

export class SpineSkin {
  /** The lower back's and the chest's transforms, in the trunk mesh's own frame, from their rest. */
  private readonly lumbar = { value: new THREE.Matrix4() };
  private readonly chest = { value: new THREE.Matrix4() };
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
      shader.uniforms.spineRestY = this.restY;
      shader.vertexShader = afterChunk(shader.vertexShader, 'common', HEADER);
      if (shader.vertexShader.includes('#include <beginnormal_vertex>')) {
        shader.vertexShader = afterChunk(shader.vertexShader, 'beginnormal_vertex', 'objectNormal = mat3(spineBlend(position.y)) * objectNormal;');
      }
      shader.vertexShader = afterChunk(shader.vertexShader, 'begin_vertex', 'transformed = (spineBlend(position.y) * vec4(transformed, 1.0)).xyz;');
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
    m.multiply(this.offset);
  }
}
