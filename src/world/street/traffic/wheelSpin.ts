import * as THREE from 'three';
import { afterChunk, patchShader } from '../../materials/shaderPatch';
import { STEERED } from '../carModel';

/**
 * Wheels that turn: the tyres' and rims' vertices (`wheelHub`: their axle's x and y in the vehicle's
 * frame, z 1 for what turns, 0 for the underbody and trim merged with them, `STEERED` plus where it stands across for
 * a front wheel) are turned about their axle by the wheels' angle, and the front ones about their upright by the
 * steering's, in the vertex shader: per instance (the `wheelSpin` instanced attribute: x the roll, y the steer) or one
 * pair for a single vehicle. The shadow pass is left alone: a tyre's shadow is the same whichever way it has turned.
 */
export class WheelMaterial extends THREE.MeshStandardMaterial {
  private readonly spinUniform = { value: new THREE.Vector2() };

  constructor(instanced: boolean, parameters: THREE.MeshStandardMaterialParameters = {}) {
    super({ vertexColors: true, color: 0xffffff, roughness: 0.85, ...parameters });
    patchShader(this, instanced ? 'vehicleWheelsInstanced' : 'vehicleWheels', (shader) => {
      if (!instanced) shader.uniforms.wheelSpinU = this.spinUniform;
      const angle = instanced ? 'attribute vec2 wheelSpin;' : 'uniform vec2 wheelSpinU;\n#define wheelSpin wheelSpinU';
      let vertex = afterChunk(shader.vertexShader, 'common', `attribute vec3 wheelHub;\n${angle}`);
      vertex = afterChunk(vertex, 'beginnormal_vertex', turn('objectNormal', 'vec2(0.0)', 'vec2(0.0)'));
      shader.vertexShader = afterChunk(vertex, 'begin_vertex', turn('transformed', 'wheelHub.xy', `vec2(wheelHub.x, wheelHub.z - ${STEERED.toFixed(1)})`));
    });
  }

  /** A single vehicle's wheels' angle (radians, about the axle: negative rolls forwards). */
  set angle(radians: number) {
    this.spinUniform.value.x = radians;
  }

  /** A single vehicle's front wheels' angle about their uprights (radians, left positive). */
  set steer(radians: number) {
    this.spinUniform.value.y = radians;
  }
}

/** Turns `v`'s x and y about `centre` by the wheels' roll, then a steered wheel's x and z about `upright` by the steer. */
function turn(v: string, centre: string, upright: string): string {
  return /* glsl */ `
    if (wheelHub.z > 0.5) {
      float wc = cos(wheelSpin.x);
      float ws = sin(wheelSpin.x);
      vec2 wd = ${v}.xy - ${centre};
      ${v}.xy = ${centre} + vec2(wc * wd.x - ws * wd.y, ws * wd.x + wc * wd.y);
      if (wheelHub.z > ${(STEERED - 5).toFixed(1)}) {
        float sc = cos(wheelSpin.y);
        float ss = sin(wheelSpin.y);
        vec2 sd = ${v}.xz - ${upright};
        ${v}.xz = ${upright} + vec2(sc * sd.x + ss * sd.y, -ss * sd.x + sc * sd.y);
      }
    }`;
}

/** The per-instance roll and steer an instanced `WheelMaterial` reads, added to the wheels' geometry. */
export function wheelAngles(geometry: THREE.BufferGeometry, count: number): THREE.InstancedBufferAttribute {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('wheelSpin', attribute);
  return attribute;
}

/** How far a vehicle's front wheels turn to follow a bend of `curvature` (radians a metre) with `wheelBase` metres between its axles. */
export function steerAngle(curvature: number, wheelBase: number): number {
  return THREE.MathUtils.clamp(Math.atan(curvature * wheelBase), -0.6, 0.6);
}

/** The angle a wheel of `radius` has turned through over `distance` metres forwards (wrapped). */
export function rollAngle(distance: number, radius: number): number {
  return -((distance / radius) % (Math.PI * 2));
}
