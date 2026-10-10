import * as THREE from 'three';
import { afterChunk, patchShader } from '../../materials/shaderPatch';

/*
 * A skirt, a dress's skirt or a coat's hem hangs from the pelvis but has to go where the thighs go:
 * walking it swings with each leg, seated it lies over the lap. Each vertex follows the thigh on its
 * side (a smooth blend across the middle, so the front between the legs takes half of each) by its
 * own `skirtFollow` (0 at the waistband .. most of the way at the hem: the cloth trails the leg a
 * little). The hips' transforms are uniforms (per person, no texture unit); the shadow passes get
 * depth materials patched the same way, as the trunk's are (`SpineSkin`).
 */

/** Across this band of x (reference metres either side of the middle) a vertex passes from the left thigh to the right. */
const SIDE_BLEND = 0.07;

const HEADER = /* glsl */ `
attribute float skirtFollow;
uniform mat4 skirtHipL;
uniform mat4 skirtHipR;
mat4 skirtBlend(vec3 p) {
  float right = smoothstep(${(-SIDE_BLEND).toFixed(3)}, ${SIDE_BLEND.toFixed(3)}, p.x);
  mat4 legs = skirtHipL * (1.0 - right) + skirtHipR * right;
  return mat4(1.0) * (1.0 - skirtFollow) + legs * skirtFollow;
}
`;

export class SkirtSkin {
  /** Each thigh's transform from rest about its hip joint, in the pelvis's frame. */
  private readonly hips = [{ value: new THREE.Matrix4() }, { value: new THREE.Matrix4() }] as const;
  private readonly to = new THREE.Matrix4();
  private readonly back = new THREE.Matrix4();
  private readonly turn = new THREE.Matrix4();

  /** Makes `material` follow the legs (patched once; its program is shared by every skirt). */
  patch<M extends THREE.Material>(material: M): M {
    return patchShader(material, 'skirt', (shader) => {
      shader.uniforms.skirtHipL = this.hips[0];
      shader.uniforms.skirtHipR = this.hips[1];
      shader.vertexShader = afterChunk(shader.vertexShader, 'common', HEADER);
      if (shader.vertexShader.includes('#include <beginnormal_vertex>')) {
        shader.vertexShader = afterChunk(shader.vertexShader, 'beginnormal_vertex', 'objectNormal = mat3(skirtBlend(position)) * objectNormal;');
      }
      shader.vertexShader = afterChunk(shader.vertexShader, 'begin_vertex', 'transformed = (skirtBlend(position) * vec4(transformed, 1.0)).xyz;');
    });
  }

  /** The shadow passes' materials for the skirt (depth for spot and directional lights, distance for point lights). */
  shadowMaterials(): { depth: THREE.MeshDepthMaterial; distance: THREE.MeshDistanceMaterial } {
    return {
      depth: this.patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })),
      distance: this.patch(new THREE.MeshDistanceMaterial()),
    };
  }

  /** The thighs this frame: the hip bones (children of the pelvis, the skirt mesh's parent too). */
  update(left: THREE.Object3D, right: THREE.Object3D): void {
    for (const [i, hip] of [left, right].entries()) {
      const p = hip.position;
      this.to.makeTranslation(p.x, p.y, p.z);
      this.back.makeTranslation(-p.x, -p.y, -p.z);
      this.turn.makeRotationFromQuaternion(hip.quaternion);
      this.hips[i]!.value.copy(this.to).multiply(this.turn).multiply(this.back);
    }
  }
}
