import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { FramePipeline, Updatable } from '@/core/Engine';
import type { QualitySettings } from './quality';
import { NEUTRAL_LOOK, type Look } from './grade';
import { AO_FRAGMENT, AO_BLUR_FRAGMENT, DOF_FRAGMENT, LUMINANCE_FRAGMENT, OUTPUT_FRAGMENT, QUAD_VERTEX } from './postFxShaders';

export interface PostFxOptions {
  /** Distance (metres) of what the player is reading up close, or null: the background blurs beyond it. */
  focus?: () => number | null;
}

/** Photo mode's lens: the distance in focus (m; beyond it blurs), the blur's radius in pixels (0 = sharp), extra exposure (stops). */
export interface PhotoLens {
  focus: number;
  blur: number;
  exposure: number;
}

/** Bloom: only what is brighter than this (linear, before tone mapping) glows: lamps, neon, screens, the sun on white. */
const BLOOM_THRESHOLD = 0.85;
const BLOOM_RADIUS = 0.45;
/** Ambient occlusion: how far a crease darkens (metres) and how dark it gets. */
const AO_RADIUS = 0.32;
const AO_INTENSITY = 1.15;
const AO_SAMPLES = 12;
/** Depth of field: blur radius in pixels at full strength, and how fast it comes and goes. */
const DOF_MAX_RADIUS = 5;
const DOF_RATE = 3;
/**
 * The eye: average (log) luminance it aims for, how much of the difference it corrects (0 none,
 * 1 all: a lamp-lit room must still look darker than a sunny one), the range it may move in,
 * and how fast (seconds; opening up in the dark is slower than squinting in the light).
 */
const EXPOSURE_KEY = 0.14;
const EXPOSURE_STRENGTH = 0.32;
const EXPOSURE_MIN = 0.8;
const EXPOSURE_MAX = 1.35;
const ADAPT_BRIGHTER_S = 1.8;
const ADAPT_DARKER_S = 0.6;
const METER_SIZE = 16;
const METER_INTERVAL_S = 0.25;
/** How fast a zone's look replaces the previous one (per second). */
const LOOK_RATE = 1.5;

interface LookUniforms {
  contrast: THREE.IUniform<number>;
  saturation: THREE.IUniform<number>;
  temperature: THREE.IUniform<number>;
  shadows: THREE.IUniform<THREE.Color>;
  highlights: THREE.IUniform<THREE.Color>;
  vignette: THREE.IUniform<number>;
  grain: THREE.IUniform<number>;
}

/**
 * The HDR frame: the scene renders into a multisampled half-float target (linear light, with its
 * depth), then full-screen passes: ambient occlusion from the depth (no second scene render),
 * depth of field while a box is held up, bloom, a light meter the exposure adapts to, and one
 * output pass that tone-maps (ACES, like the plain renderer), grades, vignettes and adds grain.
 *
 * The canvas is transparent where a video plays (a cut-out onto the CSS layer behind it), so
 * every pass keeps the alpha: bloom adds light without making the cut-out opaque (a glow over the
 * picture), the vignette darkens it like the rest of the view.
 */
export class PostFx implements FramePipeline, Updatable {
  /** Current adapted exposure (the tone mapper's multiplier), for `?stats`. */
  exposure = 1;

  private readonly sceneTarget: THREE.WebGLRenderTarget;
  private readonly colorTarget: THREE.WebGLRenderTarget;
  private readonly aoTarget: THREE.WebGLRenderTarget | null = null;
  private readonly aoBlurTarget: THREE.WebGLRenderTarget | null = null;
  private readonly meterTarget: THREE.WebGLRenderTarget | null = null;
  private readonly meterPixels = new Uint8Array(METER_SIZE * METER_SIZE * 4);
  private metering = false;
  private meterTimer = 0;
  private targetExposure = 1;

  private readonly quad = new FullScreenQuad();
  private readonly prepMaterial: THREE.ShaderMaterial;
  private readonly aoMaterial: THREE.ShaderMaterial | null = null;
  private readonly aoBlurMaterial: THREE.ShaderMaterial | null = null;
  private readonly meterMaterial: THREE.ShaderMaterial | null = null;
  private readonly outputMaterial: THREE.ShaderMaterial;
  private readonly bloom: UnrealBloomPass | null = null;

  private readonly look: Look = { ...NEUTRAL_LOOK };
  private targetLook: Look = NEUTRAL_LOOK;
  private readonly lookColors = { shadows: new THREE.Color(), highlights: new THREE.Color(), targetShadows: new THREE.Color(), targetHighlights: new THREE.Color() };
  private dofAmount = 0;
  /** Photo mode's lens (`setLens`), or null: the focus and the blur are the held box's, the exposure the eye's. */
  private lens: PhotoLens | null = null;
  private time = 0;
  private camera: THREE.PerspectiveCamera | null = null;
  private readonly size = new THREE.Vector2();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly quality: QualitySettings,
    private readonly options: PostFxOptions = {},
  ) {
    renderer.getDrawingBufferSize(this.size);
    const { x: w, y: h } = this.size;
    const hdr = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };

    this.sceneTarget = new THREE.WebGLRenderTarget(w, h, { ...hdr, depthBuffer: true, samples: quality.msaa, depthTexture: new THREE.DepthTexture(w, h) });
    this.sceneTarget.texture.name = 'PostFx.scene';
    this.colorTarget = new THREE.WebGLRenderTarget(w, h, hdr);
    this.colorTarget.texture.name = 'PostFx.color';

    const common = { vertexShader: QUAD_VERTEX, depthTest: false, depthWrite: false };
    const depthUniforms = () => ({
      tDepth: { value: this.sceneTarget.depthTexture },
      cameraNear: { value: 0.05 },
      cameraFar: { value: 100 },
    });

    this.prepMaterial = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: DOF_FRAGMENT,
      defines: { DOF_TAPS: 16 },
      uniforms: {
        ...depthUniforms(),
        tColor: { value: this.sceneTarget.texture },
        texel: { value: new THREE.Vector2(1 / w, 1 / h) },
        focus: { value: 0.45 },
        amount: { value: 0 },
        maxRadius: { value: DOF_MAX_RADIUS },
      },
    });

    if (quality.ssao) {
      const aoSize = { w: Math.max(1, Math.round(w / 2)), h: Math.max(1, Math.round(h / 2)) };
      const aoOptions = { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
      this.aoTarget = new THREE.WebGLRenderTarget(aoSize.w, aoSize.h, aoOptions);
      this.aoBlurTarget = new THREE.WebGLRenderTarget(aoSize.w, aoSize.h, aoOptions);
      this.aoMaterial = new THREE.ShaderMaterial({
        ...common,
        fragmentShader: AO_FRAGMENT,
        defines: { SAMPLES: AO_SAMPLES },
        uniforms: {
          ...depthUniforms(),
          projection: { value: new THREE.Matrix4() },
          projectionInverse: { value: new THREE.Matrix4() },
          depthTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
          aspect: { value: w / h },
          radius: { value: AO_RADIUS },
          intensity: { value: AO_INTENSITY },
        },
      });
      this.aoBlurMaterial = new THREE.ShaderMaterial({
        ...common,
        fragmentShader: AO_BLUR_FRAGMENT,
        uniforms: { ...depthUniforms(), tAO: { value: this.aoTarget.texture }, aoTexel: { value: new THREE.Vector2(1 / aoSize.w, 1 / aoSize.h) } },
      });
    }

    if (quality.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), NEUTRAL_LOOK.bloom, BLOOM_RADIUS, BLOOM_THRESHOLD);
      // Add the glow's colour but leave the alpha alone: over a cut-out (a video playing) the glow
      // lies over the picture instead of turning the hole opaque.
      const blend = this.bloom.blendMaterial;
      blend.blending = THREE.CustomBlending;
      blend.blendEquation = THREE.AddEquation;
      blend.blendSrc = THREE.OneFactor;
      blend.blendDst = THREE.OneFactor;
      blend.blendSrcAlpha = THREE.ZeroFactor;
      blend.blendDstAlpha = THREE.OneFactor;
    }

    if (quality.autoExposure) {
      this.meterTarget = new THREE.WebGLRenderTarget(METER_SIZE, METER_SIZE, { type: THREE.UnsignedByteType, depthBuffer: false });
      this.meterMaterial = new THREE.ShaderMaterial({
        ...common,
        fragmentShader: LUMINANCE_FRAGMENT,
        uniforms: { tColor: { value: this.colorTarget.texture }, cell: { value: 1 / METER_SIZE } },
      });
    }

    this.outputMaterial = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: OUTPUT_FRAGMENT,
      defines: { USE_AO: this.aoBlurTarget ? 1 : 0 },
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tAO: { value: this.aoBlurTarget?.texture ?? null },
        exposure: { value: 1 },
        aspect: { value: w / h },
        time: { value: 0 },
        contrast: { value: 1 },
        saturation: { value: 1 },
        temperature: { value: 0 },
        shadows: { value: this.lookColors.shadows },
        highlights: { value: this.lookColors.highlights.set(0xffffff) },
        vignette: { value: 0 },
        grain: { value: 0 },
      } satisfies Record<string, THREE.IUniform> & LookUniforms,
    });
    // Tone mapping and sRGB are done by the output shader itself, after the HDR passes.
    this.outputMaterial.toneMapped = false;
    this.setLook(NEUTRAL_LOOK, true);
  }

  /** Photo mode's lens over the frame (focus, blur, extra exposure), or null to hand them back. */
  setLens(lens: PhotoLens | null): void {
    this.lens = lens;
  }

  /** Eases to a zone's grade (instantly with `snap`, e.g. behind a travel fade). */
  setLook(look: Look, snap = false): void {
    this.targetLook = look;
    this.lookColors.targetShadows.set(look.shadows);
    this.lookColors.targetHighlights.set(look.highlights);
    if (snap) this.stepLook(1);
  }

  update(dt: number): void {
    this.time += dt;
    this.stepLook(1 - Math.exp(-LOOK_RATE * dt));

    const lens = this.lens;
    const focus = lens ? lens.focus : this.quality.depthOfField ? (this.options.focus?.() ?? null) : null;
    const wanted = lens ? (lens.blur > 0 ? 1 : 0) : focus === null ? 0 : 1;
    // A photographer's lens follows its ring at once; the reading eye eases in and out.
    this.dofAmount = lens ? wanted : this.dofAmount + (wanted - this.dofAmount) * (1 - Math.exp(-DOF_RATE * dt));
    if (focus !== null) this.prepMaterial.uniforms.focus.value = focus;
    this.prepMaterial.uniforms.maxRadius.value = lens && lens.blur > 0 ? lens.blur : DOF_MAX_RADIUS;

    // The eye adapts slowly, faster to glare than to the dark.
    const tau = this.targetExposure < this.exposure ? ADAPT_DARKER_S : ADAPT_BRIGHTER_S;
    this.exposure += (this.targetExposure - this.exposure) * (1 - Math.exp(-dt / tau));
    this.meterTimer += dt;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const renderer = this.renderer;
    this.camera = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? (camera as THREE.PerspectiveCamera) : null;
    this.syncCamera();

    renderer.setRenderTarget(this.sceneTarget);
    renderer.render(scene, camera);

    if (this.aoMaterial && this.aoBlurMaterial && this.aoTarget && this.aoBlurTarget) {
      this.pass(this.aoMaterial, this.aoTarget);
      this.pass(this.aoBlurMaterial, this.aoBlurTarget);
    }

    // The scene's MSAA buffer is resolved and gone: everything after works on this copy.
    const prep = this.prepMaterial.uniforms;
    prep.amount.value = this.dofAmount < 0.01 ? 0 : this.dofAmount;
    this.pass(this.prepMaterial, this.colorTarget);

    if (this.bloom) {
      this.bloom.strength = this.look.bloom;
      this.bloom.render(renderer, this.colorTarget, this.colorTarget, 0, false);
    }

    this.meter();

    const out = this.outputMaterial.uniforms;
    out.exposure.value = this.exposure * Math.pow(2, this.look.exposure + (this.lens?.exposure ?? 0));
    out.time.value = this.time;
    renderer.setRenderTarget(null);
    this.quad.material = this.outputMaterial;
    this.quad.render(renderer);
  }

  compile(scene: THREE.Scene, camera: THREE.Camera): void {
    // Program variants depend on the bound target (tone mapping, colour space): bind the scene's.
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.compile(scene, camera);
    this.renderer.setRenderTarget(previous);
  }

  setSize(): void {
    this.renderer.getDrawingBufferSize(this.size);
    const { x: w, y: h } = this.size;
    this.sceneTarget.setSize(w, h);
    this.colorTarget.setSize(w, h);
    this.prepMaterial.uniforms.texel.value.set(1 / w, 1 / h);
    this.outputMaterial.uniforms.aspect.value = w / h;
    if (this.aoTarget && this.aoBlurTarget && this.aoMaterial && this.aoBlurMaterial) {
      const aw = Math.max(1, Math.round(w / 2));
      const ah = Math.max(1, Math.round(h / 2));
      this.aoTarget.setSize(aw, ah);
      this.aoBlurTarget.setSize(aw, ah);
      this.aoMaterial.uniforms.depthTexel.value.set(1 / w, 1 / h);
      this.aoMaterial.uniforms.aspect.value = w / h;
      this.aoBlurMaterial.uniforms.aoTexel.value.set(1 / aw, 1 / ah);
    }
    this.bloom?.setSize(w / 2, h / 2);
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
    this.renderer.setRenderTarget(target);
    this.quad.material = material;
    this.quad.render(this.renderer);
  }

  private syncCamera(): void {
    const camera = this.camera;
    if (!camera) return;
    for (const material of [this.prepMaterial, this.aoMaterial, this.aoBlurMaterial]) {
      if (!material) continue;
      material.uniforms.cameraNear.value = camera.near;
      material.uniforms.cameraFar.value = camera.far;
    }
    if (this.aoMaterial) {
      this.aoMaterial.uniforms.projection.value.copy(camera.projectionMatrix);
      this.aoMaterial.uniforms.projectionInverse.value.copy(camera.projectionMatrixInverse);
    }
  }

  /** Every `METER_INTERVAL_S`, a 16 x 16 log-luminance map of the frame is read back without stalling; the exposure follows it. */
  private meter(): void {
    if (!this.meterMaterial || !this.meterTarget || this.metering || this.meterTimer < METER_INTERVAL_S) return;
    this.meterTimer = 0;
    this.pass(this.meterMaterial, this.meterTarget);
    this.metering = true;
    this.renderer
      .readRenderTargetPixelsAsync(this.meterTarget, 0, 0, METER_SIZE, METER_SIZE, this.meterPixels)
      .then(() => this.readMeter())
      .catch(() => undefined)
      .finally(() => (this.metering = false));
  }

  private readMeter(): void {
    const px = this.meterPixels;
    let sum = 0;
    let weight = 0;
    for (let y = 0; y < METER_SIZE; y++) {
      for (let x = 0; x < METER_SIZE; x++) {
        const i = (y * METER_SIZE + x) * 4;
        // Centre-weighted, like a camera's meter; cut-out pixels (a video playing) carry no weight.
        const dx = (x + 0.5) / METER_SIZE - 0.5;
        const dy = (y + 0.5) / METER_SIZE - 0.5;
        const w = (px[i + 1] / 255) * (1 - 1.2 * Math.hypot(dx, dy));
        if (w <= 0) continue;
        sum += ((px[i] / 255) * 18 - 14) * w;
        weight += w;
      }
    }
    if (weight <= 0) return;
    const average = Math.pow(2, sum / weight);
    this.targetExposure = THREE.MathUtils.clamp(Math.pow(EXPOSURE_KEY / average, EXPOSURE_STRENGTH), EXPOSURE_MIN, EXPOSURE_MAX);
  }

  private stepLook(t: number): void {
    const look = this.look;
    const target = this.targetLook;
    const lerp = THREE.MathUtils.lerp;
    look.exposure = lerp(look.exposure, target.exposure, t);
    look.contrast = lerp(look.contrast, target.contrast, t);
    look.saturation = lerp(look.saturation, target.saturation, t);
    look.temperature = lerp(look.temperature, target.temperature, t);
    look.vignette = lerp(look.vignette, target.vignette, t);
    look.grain = lerp(look.grain, target.grain, t);
    look.bloom = lerp(look.bloom, target.bloom, t);
    this.lookColors.shadows.lerp(this.lookColors.targetShadows, t);
    this.lookColors.highlights.lerp(this.lookColors.targetHighlights, t);

    const grade = this.quality.grade;
    const u = this.outputMaterial.uniforms;
    u.contrast.value = grade ? look.contrast : 1;
    u.saturation.value = grade ? look.saturation : 1;
    u.temperature.value = grade ? look.temperature : 0;
    u.vignette.value = grade ? look.vignette : 0;
    u.grain.value = grade ? look.grain : 0;
    if (!grade) {
      this.lookColors.shadows.set(0x000000);
      this.lookColors.highlights.set(0xffffff);
    }
  }
}
