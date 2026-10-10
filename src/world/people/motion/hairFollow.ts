import * as THREE from 'three';
import { afterChunk, patchShader } from '../../materials/shaderPatch';

/*
 * Long hair rests on the shoulders: when the head turns or nods, its ends stay where the shoulders
 * are instead of sweeping through them. The sheet (`hair.hairCurtain`) lives in the skull's frame;
 * each vertex takes back its `hairFollow` share of the head's turn about the neck (0 where it leaves
 * the head .. 1 at the ends), a blend in the vertex shader with the head's turn undone as a uniform
 * (per person, no texture unit). Its shadow bends the same way.
 */

const HEADER = /* glsl */ `
attribute float hairFollow;
uniform mat4 hairUndoTurn;
mat4 hairBlend() {
  return mat4(1.0) * (1.0 - hairFollow) + hairUndoTurn * hairFollow;
}
`;

export class HairFollow {
  private readonly undoTurn = { value: new THREE.Matrix4() };
  private readonly to = new THREE.Matrix4();
  private readonly back = new THREE.Matrix4();
  private readonly turn = new THREE.Matrix4();

  /** Makes `material` keep its ends on the shoulders (patched once; its program is shared). */
  patch<M extends THREE.Material>(material: M): M {
    return patchShader(material, 'hairFollow', (shader) => {
      shader.uniforms.hairUndoTurn = this.undoTurn;
      shader.vertexShader = afterChunk(shader.vertexShader, 'common', HEADER);
      if (shader.vertexShader.includes('#include <beginnormal_vertex>')) {
        shader.vertexShader = afterChunk(shader.vertexShader, 'beginnormal_vertex', 'objectNormal = mat3(hairBlend()) * objectNormal;');
      }
      shader.vertexShader = afterChunk(shader.vertexShader, 'begin_vertex', 'transformed = (hairBlend() * vec4(transformed, 1.0)).xyz;');
    });
  }

  /** The shadow passes' materials for the sheet. */
  shadowMaterials(): { depth: THREE.MeshDepthMaterial; distance: THREE.MeshDistanceMaterial } {
    return {
      depth: this.patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })),
      distance: this.patch(new THREE.MeshDistanceMaterial()),
    };
  }

  /**
   * The head's turn this frame: `head` the neck pivot (its rotation the turn), `skull` its child
   * the sheet hangs in. In the skull's frame: out to the pivot, the turn undone, back.
   */
  update(head: THREE.Object3D, skull: THREE.Object3D): void {
    const s = skull.position;
    this.to.makeTranslation(s.x, s.y, s.z);
    this.back.makeTranslation(-s.x, -s.y, -s.z);
    this.turn.makeRotationFromQuaternion(head.quaternion).invert();
    this.undoTurn.value.copy(this.back).multiply(this.turn).multiply(this.to);
  }
}
