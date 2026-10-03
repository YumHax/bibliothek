import * as THREE from 'three';
import { afterChunk, patchShader } from '../../materials/shaderPatch';

/**
 * Wheels that turn: the tyres' and rims' vertices (`wheelHub`: their axle's x and y in the vehicle's
 * frame, z 1 for what turns, 0 for the underbody and trim merged with them) are turned about their
 * axle by the wheels' angle in the vertex shader: per instance (the `wheelSpin` instanced attribute)
 * or one angle for a single vehicle. The shadow pass is left alone: a tyre's shadow is the same
 * whichever way it has turned.
 */
export class WheelMaterial extends THREE.MeshStandardMaterial {
  private readonly spinUniform = { value: 0 };

  constructor(instanced: boolean, parameters: THREE.MeshStandardMaterialParameters = {}) {
    super({ vertexColors: true, color: 0xffffff, roughness: 0.85, ...parameters });
    patchShader(this, instanced ? 'vehicleWheelsInstanced' : 'vehicleWheels', (shader) => {
      if (!instanced) shader.uniforms.wheelSpinU = this.spinUniform;
      const angle = instanced ? 'attribute float wheelSpin;' : 'uniform float wheelSpinU;\n#define wheelSpin wheelSpinU';
      let vertex = afterChunk(shader.vertexShader, 'common', `attribute vec3 wheelHub;\n${angle}`);
      vertex = afterChunk(vertex, 'beginnormal_vertex', turn('objectNormal', 'vec2(0.0)'));
      shader.vertexShader = afterChunk(vertex, 'begin_vertex', turn('transformed', 'wheelHub.xy'));
    });
  }

  /** A single vehicle's wheels' angle (radians, about the axle: negative rolls forwards). */
  set angle(radians: number) {
    this.spinUniform.value = radians;
  }
}

/** Turns `v`'s x and y about `centre` by the wheels' angle, for what turns. */
function turn(v: string, centre: string): string {
  return /* glsl */ `
    if (wheelHub.z > 0.5) {
      float wc = cos(wheelSpin);
      float ws = sin(wheelSpin);
      vec2 wd = ${v}.xy - ${centre};
      ${v}.xy = ${centre} + vec2(wc * wd.x - ws * wd.y, ws * wd.x + wc * wd.y);
    }`;
}

/** The per-instance angle an instanced `WheelMaterial` reads, added to the wheels' geometry. */
export function wheelAngles(geometry: THREE.BufferGeometry, count: number): THREE.InstancedBufferAttribute {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('wheelSpin', attribute);
  return attribute;
}

/** The angle a wheel of `radius` has turned through over `distance` metres forwards (wrapped). */
export function rollAngle(distance: number, radius: number): number {
  return -((distance / radius) % (Math.PI * 2));
}
