import * as THREE from 'three';
import { afterChunk, patchShader } from './shaderPatch';

/** Radiance of fabric lit from behind by a full-day sky, per unit of its albedo, and what the night sky still gives. */
const DAY_GLOW = 0.55;
const NIGHT_GLOW = 0.03;
/** How much of the glow the back of the fabric shows (the side facing the glass sees the sky direct). */
const BACK_FACE_SHARE = 0.35;

/**
 * Light through thin fabric hung in front of a window (curtains, a blind): where the cloth covers the
 * glass it glows with the sky behind it, tinted by its own colour (a cheap emissive, no light). The
 * opening is a rectangle in the material's object space (the panel geometry's frame, origin at the
 * middle of the glass): only fabric in front of it glows, so gathered curtains beside the window
 * stay dull and drawn ones light up. One per material (the uniforms are its own).
 */
export class Backlight {
  private readonly glow = { value: new THREE.Color(0, 0, 0) };

  constructor(material: THREE.MeshStandardMaterial, halfWidth: number, halfHeight: number) {
    const uniforms = { backGlow: this.glow, backOpening: { value: new THREE.Vector2(halfWidth, halfHeight) } };
    patchShader(material, 'backlight', (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'varying vec2 vBackPos;\n' + afterChunk(shader.vertexShader, 'begin_vertex', 'vBackPos = transformed.xy;');
      shader.fragmentShader =
        'varying vec2 vBackPos;\nuniform vec3 backGlow;\nuniform vec2 backOpening;\n' +
        afterChunk(
          shader.fragmentShader,
          'emissivemap_fragment',
          `{
            vec2 outside = abs(vBackPos) - backOpening;
            float over = (1.0 - smoothstep(-0.03, 0.03, outside.x)) * (1.0 - smoothstep(-0.03, 0.03, outside.y));
            totalEmissiveRadiance += backGlow * diffuseColor.rgb * over * (gl_FrontFacing ? 1.0 : ${BACK_FACE_SHARE.toFixed(2)});
          }`,
        );
    });
  }

  /** The sky behind the glass: its colour and the daylight (0 night .. 1 day). */
  set(sky: THREE.Color, daylight: number): void {
    this.glow.value.copy(sky).multiplyScalar(THREE.MathUtils.lerp(NIGHT_GLOW, DAY_GLOW, THREE.MathUtils.clamp(daylight, 0, 1)));
  }
}
