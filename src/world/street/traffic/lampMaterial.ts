import * as THREE from 'three';
import { afterChunk, patchShader } from '../../materials/shaderPatch';

/**
 * What each lamp face of a vehicle is (the `lampRole` vertex attribute `carModel`'s `LampSet` writes):
 * headlamps, tail lamps (brighter when braking), the left and right indicators, the reversing lamps,
 * and the unlit things on the same faces (number plates and their letters, the grille), which follow
 * the daylight instead.
 */
export const LAMP_ROLE = { head: 0, tail: 1, left: 2, right: 3, reverse: 4, plate: 5 } as const;

/**
 * A vehicle's lamps at a moment: `lit` (driving: headlamps and tail lamps on), `brake`, `left` and
 * `right` (an indicator's lamp on this instant: the blink is the caller's), `reverse`.
 */
interface LampState {
  lit: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  reverse: boolean;
}

/** Packs a state into the shader's vec4: x 0 off, 1 lit, 2 lit and reversing; y brake; z left; w right. */
function packLamps(state: LampState, out: THREE.Vector4): THREE.Vector4 {
  return out.set(state.lit ? (state.reverse ? 2 : 1) : state.reverse ? 2 : 0, state.brake ? 1 : 0, state.left ? 1 : 0, state.right ? 1 : 0);
}

const GAIN = /* glsl */ `
  float lampDay = 1.0 - lampNight;
  float lampOff = 0.25 * lampDay + 0.02;
  float lampLit = min(lampState.x, 1.0);
  float lampRev = step(1.5, lampState.x);
  if (lampRole < 0.5) vLampGain = mix(lampOff, 0.35 + 2.4 * lampNight, lampLit);
  else if (lampRole < 1.5) vLampGain = mix(lampOff, 0.3 + 1.2 * lampNight, lampLit) + lampState.y * (1.6 + 1.2 * lampNight);
  else if (lampRole < 2.5) vLampGain = mix(lampOff, 2.6, lampState.z);
  else if (lampRole < 3.5) vLampGain = mix(lampOff, 2.6, lampState.w);
  else if (lampRole < 4.5) vLampGain = mix(lampOff, 2.2, lampRev);
  else vLampGain = 0.85 * lampDay + 0.06 + 0.25 * lampNight * lampLit;
`;

/**
 * The lamps of a vehicle: one unlit material for every lamp face (vertex colours), each face's
 * brightness from its role, the hour (`setNight`) and the vehicle's state: per instance (the
 * `lampState` instanced attribute, `instanced`), or one `state` for a single vehicle. No light is
 * added: the bloom does the glow.
 */
export class LampMaterial extends THREE.MeshBasicMaterial {
  private readonly nightUniform = { value: 0 };
  private readonly stateUniform = { value: new THREE.Vector4() };

  constructor(instanced = false) {
    super({ vertexColors: true, color: 0xffffff });
    patchShader(this, instanced ? 'vehicleLampsInstanced' : 'vehicleLamps', (shader) => {
      shader.uniforms.lampNight = this.nightUniform;
      if (!instanced) shader.uniforms.lampStateU = this.stateUniform;
      const state = instanced ? 'attribute vec4 lampState;' : 'uniform vec4 lampStateU;\n#define lampState lampStateU';
      shader.vertexShader = afterChunk(afterChunk(shader.vertexShader, 'common', `attribute float lampRole;\n${state}\nuniform float lampNight;\nvarying float vLampGain;`), 'color_vertex', GAIN);
      shader.fragmentShader = afterChunk(afterChunk(shader.fragmentShader, 'common', 'varying float vLampGain;'), 'color_fragment', 'diffuseColor.rgb *= vLampGain;');
    });
  }

  /** How dark it is (0 day, 1 night): the lamps' glow and the plates' daylight. */
  setNight(night: number): void {
    this.nightUniform.value = night;
  }

  /** A single vehicle's lamps (not instanced). */
  setState(state: LampState): void {
    packLamps(state, this.stateUniform.value);
  }
}

/** The per-instance attribute an instanced `LampMaterial` reads, added to the lamps' geometry. */
export function lampStates(geometry: THREE.BufferGeometry, count: number): THREE.InstancedBufferAttribute {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('lampState', attribute);
  return attribute;
}
