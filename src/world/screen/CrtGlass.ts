import * as THREE from 'three';
import { createCanvas, seededRandom } from '@/covers/generated/canvasUtils';

/** Visible scan lines over the picture (a 480-line set seen up close). */
const SCAN_LINES = 240;

let smudgeTexture: THREE.CanvasTexture | null = null;

/** Faint, blurred fingerprint smudges on the glass, greyscale (painted once, shared). */
function smudges(): THREE.CanvasTexture {
  if (smudgeTexture) return smudgeTexture;
  const [canvas, ctx] = createCanvas(256, 192);
  const random = seededRandom(0xc47);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 192);
  // A few soft oval smears near the bottom corners, where hands go: no hard edges, nothing that reads as a shape.
  for (let i = 0; i < 6; i++) {
    const x = random() < 0.5 ? 16 + random() * 50 : 190 + random() * 50;
    const y = 130 + random() * 50;
    const r = 6 + random() * 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(random() * Math.PI);
    ctx.scale(1, 1.3);
    const smear = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    smear.addColorStop(0, `rgba(255,255,255,${(0.08 + random() * 0.05).toFixed(3)})`);
    smear.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = smear;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  smudgeTexture = new THREE.CanvasTexture(canvas);
  smudgeTexture.colorSpace = THREE.NoColorSpace;
  return smudgeTexture;
}

/**
 * The glass of a CRT, laid just in front of its picture (a `VideoSurface`): scan lines and a
 * slight darkening towards the curved corners while a video plays, and at all times the bulge's
 * soft highlight, a glint of the room lamp and faint smudges on the glass. Drawn over the
 * video cut-out with plain alpha blending, so it tints the picture showing through the canvas.
 */
export class CrtGlass extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  private readonly playing: THREE.IUniform<number>;

  constructor(width: number, height: number) {
    const playing = { value: 0 };
    super(
      new THREE.PlaneGeometry(width, height),
      new THREE.ShaderMaterial({
        uniforms: { playing, smudges: { value: smudges() }, scanLines: { value: SCAN_LINES } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float playing;
          uniform sampler2D smudges;
          uniform float scanLines;
          varying vec2 vUv;
          void main() {
            vec2 c = vUv - 0.5;
            // The tube's corners curve away from the eye and dim.
            float corner = smoothstep(0.18, 0.5, length(c * vec2(1.0, 1.25)));
            float scan = 0.5 + 0.5 * cos(vUv.y * scanLines * 6.2831853);
            float dark = playing * (0.22 * scan + 0.55 * corner * corner);
            // The bulge's broad sheen from above and a small glint of the ceiling lamp, upper left.
            float sheen = 0.05 * (1.0 - smoothstep(0.0, 0.55, length(c - vec2(-0.12, 0.28)) * 1.4));
            float glint = 0.1 * (1.0 - smoothstep(0.0, 0.06, length((c - vec2(-0.3, 0.33)) * vec2(1.0, 1.6))));
            float prints = texture2D(smudges, vUv).r;
            float light = sheen + glint + prints * 0.3;
            // Premultiplied mix of a black veil (the scan lines) and a white one (the reflections).
            float alpha = clamp(dark + light, 0.0, 0.9);
            vec3 color = alpha > 0.0 ? vec3(light / alpha) : vec3(0.0);
            gl_FragColor = vec4(color, alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.name = 'CrtGlass';
    this.playing = playing;
    this.castShadow = false;
    this.receiveShadow = false;
    this.renderOrder = 1;
  }

  /** Scan lines and corner shading only show over a picture. */
  setPlaying(playing: boolean): void {
    this.playing.value = playing ? 1 : 0;
  }
}
