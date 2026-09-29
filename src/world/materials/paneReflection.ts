import * as THREE from 'three';
import { afterChunk, patchShader, VALUE_NOISE } from './shaderPatch';

/** How strong the glass's reflection is in full day (the bright outside drowns it) and at night (the room shows in the dark pane). */
const REFLECT_DAY = 0.6;
const REFLECT_NIGHT = 5;

/**
 * The reflection a window pane throws back over the view outside: a black dielectric that only
 * reflects (the environment map, `scene.environment`, which already follows the room's light level,
 * and the lamps' highlights), Fresnel weighted by three's specular, added over the pane without
 * touching the canvas's alpha (the video cut-out). Faint smudges roughen and dim it here and there.
 * `set(daylight)` scales it: barely there by day, the lit room mirrored in the dark glass at night.
 * One material per window (its strength is its own).
 */
export class PaneReflection {
  readonly material: THREE.MeshStandardMaterial;
  private readonly strength = { value: REFLECT_DAY };

  constructor() {
    this.material = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.05, metalness: 0, transparent: true, depthWrite: false, fog: false });
    const m = this.material;
    m.blending = THREE.CustomBlending;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneFactor;
    m.blendSrcAlpha = THREE.ZeroFactor;
    m.blendDstAlpha = THREE.OneFactor;
    const uniforms = { paneStrength: this.strength };
    patchShader(m, 'paneReflection', (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'varying vec2 vPanePos;\n' + afterChunk(shader.vertexShader, 'begin_vertex', 'vPanePos = position.xy;');
      shader.fragmentShader =
        `varying vec2 vPanePos;\nuniform float paneStrength;\n${VALUE_NOISE}\nfloat paneSmudge() {
          float wipe = patchNoise(vPanePos * vec2(3.0, 5.0)) * patchNoise(vPanePos * 11.0 + 4.0);
          return smoothstep(0.18, 0.5, wipe);
        }\n` +
        afterChunk(
          afterChunk(shader.fragmentShader, 'roughnessmap_fragment', 'float smudge = paneSmudge();\nroughnessFactor = mix(roughnessFactor, 0.3, smudge);'),
          'opaque_fragment',
          'gl_FragColor.rgb *= paneStrength * (1.0 - 0.35 * smudge);\ngl_FragColor.a = 0.0;',
        );
    });
  }

  /** 0 night .. 1 full day. */
  set(daylight: number): void {
    this.strength.value = THREE.MathUtils.lerp(REFLECT_NIGHT, REFLECT_DAY, THREE.MathUtils.clamp(daylight, 0, 1));
  }
}
