import * as THREE from 'three';
import { createCanvas, seededRandom } from '@/covers/generated/canvasUtils';
import { RENDER_ORDER } from '../surface/layers';

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

/** The tube coming on: a bright line opening to the full picture (s). */
const POWER_ON_SECONDS = 0.25;
/** Switching off: the picture collapses to a line, then the line to a dot (s). */
const POWER_OFF_SECONDS = 0.4;
/** The phosphor's last glow at the centre after power-off (s to fade out). */
const AFTERGLOW_SECONDS = 4;

/**
 * The glass of a CRT, laid just in front of its picture (a `VideoSurface`) and bulging slightly
 * towards the eye: scan lines and a slight darkening towards the curved corners while the tube is
 * lit, and at all times the bulge's soft highlight, a glint of the room lamp and faint smudges on
 * the glass. Switching on opens the picture from a bright horizontal line, switching off collapses
 * it to a dot that glows on a few seconds (`powerOn` / `powerOff`, animated by `update`). Drawn over
 * the video cut-out with plain alpha blending, so it tints (or blacks out) the picture showing through the canvas.
 */
export class CrtGlass extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  private readonly playing: THREE.IUniform<number>;
  /** 0..1 of the power-on opening (1 = the full picture). */
  private readonly opening: THREE.IUniform<number>;
  /** 0..1 of the power-off collapse (0 = not collapsing). */
  private readonly collapse: THREE.IUniform<number>;
  private readonly afterglow: THREE.IUniform<number>;
  private phase: 'steady' | 'on' | 'off' = 'steady';

  /** `bulge`: how far the centre of the glass stands in front of its edges (m). */
  constructor(width: number, height: number, bulge = 0) {
    const playing = { value: 0 };
    const opening = { value: 1 };
    const collapse = { value: 0 };
    const afterglow = { value: 0 };
    super(
      curvedPlane(width, height, bulge),
      new THREE.ShaderMaterial({
        uniforms: { playing, opening, collapse, afterglow, smudges: { value: smudges() }, scanLines: { value: SCAN_LINES } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float playing;
          uniform float opening;
          uniform float collapse;
          uniform float afterglow;
          uniform sampler2D smudges;
          uniform float scanLines;
          varying vec2 vUv;
          void main() {
            vec2 c = vUv - 0.5;
            // The tube's corners curve away from the eye and dim.
            float corner = smoothstep(0.18, 0.5, length(c * vec2(1.0, 1.25)));
            float scan = 0.5 + 0.5 * cos(vUv.y * scanLines * 6.2831853);
            float dark = playing * (0.22 * scan + 0.55 * corner * corner);
            // Power on: the picture opens from a bright line; off: squashed to a line, then to a dot.
            float squash = clamp(collapse / 0.6, 0.0, 1.0);
            float shrink = clamp((collapse - 0.6) / 0.4, 0.0, 1.0);
            float halfH = collapse > 0.0 ? mix(0.5, 0.004, squash) : 0.5 * opening;
            float halfW = collapse > 0.0 ? mix(0.5, 0.006, shrink) : 0.5;
            float outside = max(smoothstep(halfH, halfH + 0.006, abs(c.y)), smoothstep(halfW, halfW + 0.006, abs(c.x)));
            float beam = collapse > 0.0 ? collapse : 1.0 - opening;
            float line = beam * (1.0 - outside) * (1.0 - smoothstep(0.0, max(halfH, 0.004) + 0.01, abs(c.y)));
            float spot = afterglow * (1.0 - smoothstep(0.0, 0.035, length(c * vec2(1.0, 1.33))));
            // The bulge's broad sheen from above and a small glint of the ceiling lamp, upper left.
            float sheen = 0.05 * (1.0 - smoothstep(0.0, 0.55, length(c - vec2(-0.12, 0.28)) * 1.4));
            float glint = 0.1 * (1.0 - smoothstep(0.0, 0.06, length((c - vec2(-0.3, 0.33)) * vec2(1.0, 1.6))));
            float prints = texture2D(smudges, vUv).r;
            float light = sheen + glint + prints * 0.3 + 0.9 * line + 0.35 * spot;
            // Premultiplied mix of a black veil (scan lines, the dark around a collapsing picture) and a white one (reflections, the beam).
            float black = max(min(dark, 0.9), outside * beam > 0.0 ? outside : 0.0);
            float alpha = clamp(black + light, 0.0, 1.0);
            vec3 color = alpha > 0.0 ? vec3(min(light, 1.0) / alpha) : vec3(0.0);
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
    this.opening = opening;
    this.collapse = collapse;
    this.afterglow = afterglow;
    this.castShadow = false;
    this.receiveShadow = false;
    this.renderOrder = RENDER_ORDER.glass;
  }

  /** Scan lines and corner shading only show while the tube is lit (static or a picture). */
  setPlaying(playing: boolean): void {
    this.playing.value = playing ? 1 : 0;
  }

  /** The tube comes on: a bright line opens to the full picture. */
  powerOn(): void {
    this.phase = 'on';
    this.opening.value = 0;
    this.collapse.value = 0;
    this.afterglow.value = 0;
  }

  /** The tube goes off: the picture collapses to a dot that glows on a moment. */
  powerOff(): void {
    this.phase = 'off';
    this.opening.value = 1;
    this.collapse.value = 0.0001;
  }

  update(dt: number): void {
    if (this.phase === 'on') {
      this.opening.value = Math.min(1, this.opening.value + dt / POWER_ON_SECONDS);
      if (this.opening.value >= 1) this.phase = 'steady';
    } else if (this.phase === 'off') {
      this.collapse.value = Math.min(1, this.collapse.value + dt / POWER_OFF_SECONDS);
      if (this.collapse.value >= 1) {
        this.phase = 'steady';
        this.collapse.value = 0;
        this.afterglow.value = 1;
      }
    } else if (this.afterglow.value > 0) {
      this.afterglow.value = Math.max(0, this.afterglow.value - dt / AFTERGLOW_SECONDS);
    }
  }
}

/** A plane whose centre stands `bulge` in front of its edges, like a tube's face. */
function curvedPlane(width: number, height: number, bulge: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, bulge > 0 ? 12 : 1, bulge > 0 ? 9 : 1);
  if (bulge <= 0) return geometry;
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const u = position.getX(i) / (width / 2);
    const v = position.getY(i) / (height / 2);
    position.setZ(i, bulge * (1 - u * u) * (1 - v * v));
  }
  geometry.computeVertexNormals();
  return geometry;
}
