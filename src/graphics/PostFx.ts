import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { FramePipeline, Updatable } from '@/core/Engine';
import type { QualitySettings } from './quality';
import { NEUTRAL_LOOK, displayColor, type Look } from './grade';
import { whiteBalance } from './whiteBalance';
import { GlassMask } from './glassMask';
import { AO_FRAGMENT, AO_BLUR_FRAGMENT, DOF_FRAGMENT, LUMINANCE_FRAGMENT, METER_DOWNSAMPLE_FRAGMENT, OUTPUT_FRAGMENT, QUAD_VERTEX } from './postFxShaders';
import { damp, dampFactor } from '@/math/damp';

interface PostFxOptions {
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
/** The output's sharpen (CAS, 0..1): a touch against the FXAA's softening, more per unit the frame is stretched to the screen. */
const SHARPEN_AFTER_FXAA = 0.25;
const SHARPEN_PER_STRETCH = 0.8;
/**
 * The bloom's first level is half the frame (it was a quarter: small lamps and neon letters
 * shimmered as they crossed its texels), so its narrowest glow is half as wide as before; a larger
 * radius leans on the wider levels to keep the halo's reach.
 */
const BLOOM_RADIUS = 0.55;
/** Width of the threshold's soft knee (three's default 0.01 is a hard cut: glows popped in and out as a lamp's brightness crossed it). */
const BLOOM_KNEE = 0.15;
/** Ambient occlusion: how far a crease darkens (metres) and how dark it gets. */
const AO_RADIUS = 0.32;
const AO_INTENSITY = 1.15;
const AO_SAMPLES = 12;
/** Depth of field: blur radius in pixels at full strength, and how fast it comes and goes. */
const DOF_MAX_RADIUS = 5;
const DOF_RATE = 3;
/** Taps of the blur's spiral, and the count past `DOF_WIDE_RADIUS` pixels (photo mode's wide blur). */
const DOF_TAPS = 16;
const DOF_MAX_TAPS = 32;
const DOF_WIDE_RADIUS = 6;
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
  whiteBalance: THREE.IUniform<THREE.Matrix3>;
  shadows: THREE.IUniform<THREE.Color>;
  highlights: THREE.IUniform<THREE.Color>;
  vignette: THREE.IUniform<number>;
  grain: THREE.IUniform<number>;
}

/**
 * The HDR frame: the scene renders into a multisampled half-float target (linear light, with its
 * depth), then full-screen passes: ambient occlusion from the depth (no second scene render),
 * applied in the prep copy with depth of field while a box is held up, bloom, a light meter the
 * exposure adapts to, and one output pass that antialiases (FXAA), tone-maps (ACES, like the
 * plain renderer), grades, vignettes and adds grain.
 *
 * Adaptive resolution (`setRenderScale`) never reallocates: every target keeps the drawing
 * buffer's size, the scene and the passes before the bloom draw into its lower-left share (the
 * viewport), each pass reads at `vUv * uvScale`, and the output pass stretches that share over the
 * canvas. A step of the resolution is a uniform change, not a hitch.
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
  /** Where the window panes show (the occlusion spares them), at the occlusion's size. */
  private readonly glass: GlassMask | null = null;
  private readonly meterTarget: THREE.WebGLRenderTarget | null = null;
  /** The meter's area average: the frame at a quarter, then a sixteenth of its size (log luminance, weight). */
  private readonly meterQuarter: THREE.WebGLRenderTarget | null = null;
  private readonly meterSixteenth: THREE.WebGLRenderTarget | null = null;
  private readonly meterLogMaterial: THREE.ShaderMaterial | null = null;
  private readonly meterAverageMaterial: THREE.ShaderMaterial | null = null;
  private readonly meterPixels = new Uint8Array(METER_SIZE * METER_SIZE * 4);
  private metering = false;
  private meterTimer = 0;
  private targetExposure = 1;
  /** `settle()` asked for the eye to take the next reading at once (a trip: no adapting behind the fade). */
  private settleEye = false;

  private readonly quad = new FullScreenQuad();
  private readonly prepMaterial: THREE.ShaderMaterial;
  private readonly aoMaterial: THREE.ShaderMaterial | null = null;
  private readonly aoBlurMaterial: THREE.ShaderMaterial | null = null;
  private readonly meterMaterial: THREE.ShaderMaterial | null = null;
  private readonly outputMaterial: THREE.ShaderMaterial;
  private readonly bloom: UnrealBloomPass | null = null;
  /** The bloom's high-pass threshold, set each frame from the exposure. */
  private bloomThreshold: THREE.IUniform<number> = { value: BLOOM_THRESHOLD };

  private readonly look: Look = { ...NEUTRAL_LOOK };
  private targetLook: Look = NEUTRAL_LOOK;
  private readonly lookColors = { shadows: new THREE.Color(), highlights: new THREE.Color(), targetShadows: new THREE.Color(), targetHighlights: new THREE.Color() };
  private dofAmount = 0;
  /** Photo mode's lens (`setLens`), or null: the focus and the blur are the held box's, the exposure the eye's. */
  private lens: PhotoLens | null = null;
  private time = 0;
  private camera: THREE.PerspectiveCamera | null = null;
  private readonly size = new THREE.Vector2();
  /** Share of the drawing buffer the frame is rendered at (`setRenderScale`), and the frame's size in texels at that share. */
  private renderScale = 1;
  private readonly frame = new THREE.Vector2();
  /** The frame's share of the full-size textures (uv), and the last texel coordinate inside it. */
  private readonly uvScale = new THREE.Vector2(1, 1);
  private readonly uvLimit = new THREE.Vector2(1, 1);
  private readonly aoScale = new THREE.Vector2(1, 1);
  private lastTemperature = NaN;

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
      defines: { DOF_TAPS, DOF_MAX_TAPS, DOF_WIDE_RADIUS: DOF_WIDE_RADIUS.toFixed(1), USE_AO: quality.ssao ? 1 : 0 },
      uniforms: {
        ...depthUniforms(),
        tColor: { value: this.sceneTarget.texture },
        texel: { value: new THREE.Vector2(1 / w, 1 / h) },
        focus: { value: 0.45 },
        amount: { value: 0 },
        maxRadius: { value: DOF_MAX_RADIUS },
        tAO: { value: null },
        tGlass: { value: null },
        aoTexel: { value: new THREE.Vector2() },
        fogDensity: { value: 0 },
        uvScale: { value: this.uvScale },
        uvLimit: { value: this.uvLimit },
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
          uvScale: { value: this.aoScale },
          uvLimit: { value: this.uvLimit },
        },
      });
      this.aoBlurMaterial = new THREE.ShaderMaterial({
        ...common,
        fragmentShader: AO_BLUR_FRAGMENT,
        uniforms: {
          ...depthUniforms(),
          tAO: { value: this.aoTarget.texture },
          aoTexel: { value: new THREE.Vector2(1 / aoSize.w, 1 / aoSize.h) },
          uvScale: { value: this.aoScale },
          uvLimit: { value: this.uvLimit },
        },
      });
      // The occlusion darkens the working copy (the prep pass), before the bloom.
      // Every uniform named below is declared by the material's own table in this file: `!` says so.
      this.prepMaterial.uniforms.tAO!.value = this.aoBlurTarget.texture;
      this.glass = new GlassMask(this.sceneTarget.depthTexture!, aoSize.w, aoSize.h);
      this.prepMaterial.uniforms.tGlass!.value = this.glass.texture;
      this.prepMaterial.uniforms.aoTexel!.value.set(1 / aoSize.w, 1 / aoSize.h);
    }

    if (quality.bloom) {
      // The pass halves the size it is given for its first level.
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), NEUTRAL_LOOK.bloom, BLOOM_RADIUS, BLOOM_THRESHOLD);
      const highPass = this.bloom.highPassUniforms as Record<string, THREE.IUniform<number>>;
      highPass.smoothWidth!.value = BLOOM_KNEE;
      this.bloomThreshold = highPass.luminosityThreshold!;
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
      this.meterQuarter = new THREE.WebGLRenderTarget(Math.max(1, Math.ceil(w / 4)), Math.max(1, Math.ceil(h / 4)), hdr);
      this.meterSixteenth = new THREE.WebGLRenderTarget(Math.max(1, Math.ceil(w / 16)), Math.max(1, Math.ceil(h / 16)), hdr);
      // The first step reads the frame's share of the colour target; the second a whole quarter-size map.
      const downsample = (source: THREE.Texture, texel: THREE.Vector2, log: boolean) =>
        new THREE.ShaderMaterial({
          ...common,
          fragmentShader: METER_DOWNSAMPLE_FRAGMENT,
          defines: { LOG_INPUT: log ? 1 : 0 },
          uniforms: { tSource: { value: source }, sourceTexel: { value: texel }, uvScale: { value: log ? this.uvScale : new THREE.Vector2(1, 1) } },
        });
      this.meterLogMaterial = downsample(this.colorTarget.texture, new THREE.Vector2(1 / w, 1 / h), true);
      this.meterAverageMaterial = downsample(this.meterQuarter.texture, new THREE.Vector2(1 / this.meterQuarter.width, 1 / this.meterQuarter.height), false);
      this.meterMaterial = new THREE.ShaderMaterial({
        ...common,
        fragmentShader: LUMINANCE_FRAGMENT,
        uniforms: { tColor: { value: this.meterSixteenth.texture }, cell: { value: 1 / METER_SIZE } },
      });
    }

    this.outputMaterial = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: OUTPUT_FRAGMENT,
      defines: { USE_FXAA: quality.fxaa ? 1 : 0 },
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        texel: { value: new THREE.Vector2(1 / w, 1 / h) },
        exposure: { value: 1 },
        aspect: { value: w / h },
        time: { value: 0 },
        contrast: { value: 1 },
        saturation: { value: 1 },
        whiteBalance: { value: new THREE.Matrix3() },
        uvScale: { value: this.uvScale },
        uvLimit: { value: this.uvLimit },
        shadows: { value: this.lookColors.shadows },
        highlights: { value: this.lookColors.highlights.setRGB(1, 1, 1) },
        vignette: { value: 0 },
        grain: { value: 0 },
        sharpen: { value: 0 },
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
    // Display values, read as is: the grade runs after sRGB (see `Look.shadows`).
    displayColor(this.lookColors.targetShadows, look.shadows);
    displayColor(this.lookColors.targetHighlights, look.highlights);
    if (snap) this.stepLook(1);
  }

  /**
   * Behind a travel's curtain: the look where it is going now, the eye where the last reading puts
   * it, and a reading taken on the next frame whose result the eye jumps to (it would otherwise
   * adapt for a second or two after the fade-in).
   */
  settle(): void {
    this.stepLook(1);
    this.exposure = this.targetExposure;
    this.meterTimer = METER_INTERVAL_S;
    this.settleEye = true;
  }

  /**
   * The frame's exposure, grade and blur as a CSS filter for the video layer behind the canvas
   * (the cut-out shows it untouched by the passes), rounded so it changes only when it shows:
   * brightness follows the exposure (a square root: the video is already display values),
   * contrast and saturation the look's, blur the depth of field (the screen is always behind
   * the box held up to read).
   */
  videoFilter(pixelRatio: number): string {
    const exposure = this.exposure * Math.pow(2, this.look.exposure + (this.lens?.exposure ?? 0));
    const round = (v: number, step: number) => Math.round(v / step) * step;
    const parts = [`brightness(${round(Math.sqrt(exposure), 0.02).toFixed(2)})`];
    if (this.quality.grade) parts.push(`contrast(${round(this.look.contrast, 0.01).toFixed(2)})`, `saturate(${round(this.look.saturation, 0.01).toFixed(2)})`);
    const radius = this.dofAmount < 0.01 ? 0 : this.dofAmount * (this.prepMaterial.uniforms.maxRadius!.value as number);
    // A disc of radius r reads like a Gaussian of about r / 2; the canvas's pixels are CSS pixels x the ratio.
    const blur = round(radius / 2 / Math.max(pixelRatio, 0.1), 0.25);
    if (blur > 0) parts.push(`blur(${blur.toFixed(2)}px)`);
    return parts.join(' ');
  }

  update(dt: number): void {
    this.time += dt;
    this.stepLook(dampFactor(LOOK_RATE, dt));

    const lens = this.lens;
    const focus = lens ? lens.focus : this.quality.depthOfField ? (this.options.focus?.() ?? null) : null;
    const wanted = lens ? (lens.blur > 0 ? 1 : 0) : focus === null ? 0 : 1;
    // A photographer's lens follows its ring at once; the reading eye eases in and out.
    this.dofAmount = lens ? wanted : damp(this.dofAmount, wanted, DOF_RATE, dt);
    if (focus !== null) this.prepMaterial.uniforms.focus!.value = focus;
    this.prepMaterial.uniforms.maxRadius!.value = lens && lens.blur > 0 ? lens.blur : DOF_MAX_RADIUS;

    // The eye adapts slowly, faster to glare than to the dark.
    const tau = this.targetExposure < this.exposure ? ADAPT_DARKER_S : ADAPT_BRIGHTER_S;
    this.exposure = damp(this.exposure, this.targetExposure, 1 / tau, dt);
    this.meterTimer += dt;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const renderer = this.renderer;
    this.camera = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? (camera as THREE.PerspectiveCamera) : null;
    this.syncCamera();

    renderer.setRenderTarget(this.sceneTarget);
    renderer.render(scene, camera);
    const fog = scene.fog as THREE.FogExp2 | null;
    this.prepMaterial.uniforms.fogDensity!.value = fog && (fog as THREE.FogExp2).isFogExp2 ? fog.density : 0;

    if (this.aoMaterial && this.aoBlurMaterial && this.aoTarget && this.aoBlurTarget) {
      this.pass(this.aoMaterial, this.aoTarget);
      this.pass(this.aoBlurMaterial, this.aoBlurTarget);
      if (this.glass && this.camera) this.glass.render(renderer, scene, this.camera, this.aoTarget.viewport);
    }

    // The scene's MSAA buffer is resolved and gone: everything after works on this copy (occluded, maybe blurred).
    const prep = this.prepMaterial.uniforms;
    prep.amount!.value = this.dofAmount < 0.01 ? 0 : this.dofAmount;
    const colorViewport = this.colorTarget.viewport;
    if (this.renderScale < 1) {
      // The bloom works on the whole target: what lies beyond the frame's share must be black, not last frame's glow.
      this.renderer.setRenderTarget(this.colorTarget);
      this.renderer.clear(true, false, false);
      colorViewport.set(0, 0, this.frame.x, this.frame.y);
    }
    this.pass(this.prepMaterial, this.colorTarget);
    // The bloom reads and blends over the whole target.
    colorViewport.set(0, 0, this.size.x, this.size.y);

    const exposure = this.exposure * Math.pow(2, this.look.exposure + (this.lens?.exposure ?? 0));
    if (this.bloom) {
      this.bloom.strength = this.look.bloom;
      // The threshold is on what the eye sees, after its exposure: a lamp shown brighter in a dark
      // room the eye has adapted to glows more, not less (the scene's linear values do not change).
      this.bloomThreshold.value = THREE.MathUtils.clamp(BLOOM_THRESHOLD / exposure, BLOOM_THRESHOLD * 0.5, BLOOM_THRESHOLD * 1.6);
      this.bloom.render(renderer, this.colorTarget, this.colorTarget, 0, false);
    }

    this.meter();

    const out = this.outputMaterial.uniforms;
    out.exposure!.value = exposure;
    // How much the frame is stretched to the screen: the pixel ratio's cap (a Retina screen at 1.5) and the adaptive scale.
    const stretch = window.devicePixelRatio / Math.max(0.1, renderer.getPixelRatio() * this.renderScale);
    out.sharpen!.value = THREE.MathUtils.clamp((this.quality.fxaa ? SHARPEN_AFTER_FXAA : 0) + Math.max(0, stretch - 1) * SHARPEN_PER_STRETCH, 0, 1);
    out.time!.value = this.time;
    renderer.setRenderTarget(null);
    this.quad.material = this.outputMaterial;
    this.quad.render(renderer);
  }

  compile(scene: THREE.Scene, camera: THREE.Camera, lightsFrom?: THREE.Scene): Promise<void> {
    // Program variants depend on the bound target (tone mapping, colour space): bind the scene's.
    // `compileAsync` hands the programs over at once (synchronously, while the target is bound) and resolves once the driver has linked them.
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.sceneTarget);
    try {
      return this.renderer.compileAsync(scene, camera, lightsFrom ?? null).then(() => undefined);
    } finally {
      this.renderer.setRenderTarget(previous);
    }
  }

  /**
   * Renders the frame at `scale` of the drawing buffer (0 < scale <= 1, the adaptive resolution's
   * ratio over the canvas's): only viewports and uniforms change, no target is reallocated.
   */
  setRenderScale(scale: number): void {
    const next = THREE.MathUtils.clamp(scale, 0.1, 1);
    if (next === this.renderScale) return;
    this.renderScale = next;
    this.applyRenderScale();
  }

  private applyRenderScale(): void {
    const { x: w, y: h } = this.size;
    const s = this.renderScale;
    this.frame.set(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
    this.uvScale.set(this.frame.x / w, this.frame.y / h);
    this.uvLimit.set(this.uvScale.x - 0.5 / w, this.uvScale.y - 0.5 / h);
    this.sceneTarget.viewport.set(0, 0, this.frame.x, this.frame.y);
    this.sceneTarget.scissor.set(0, 0, this.frame.x, this.frame.y);
    if (this.aoTarget && this.aoBlurTarget) {
      const aw = this.aoTarget.width;
      const ah = this.aoTarget.height;
      const fw = Math.min(aw, Math.ceil(aw * this.uvScale.x));
      const fh = Math.min(ah, Math.ceil(ah * this.uvScale.y));
      this.aoScale.set(fw / aw, fh / ah);
      this.aoTarget.viewport.set(0, 0, fw, fh);
      this.aoBlurTarget.viewport.set(0, 0, fw, fh);
    }
  }

  setSize(): void {
    this.renderer.getDrawingBufferSize(this.size);
    const { x: w, y: h } = this.size;
    this.sceneTarget.setSize(w, h);
    this.colorTarget.setSize(w, h);
    this.prepMaterial.uniforms.texel!.value.set(1 / w, 1 / h);
    this.outputMaterial.uniforms.aspect!.value = w / h;
    this.outputMaterial.uniforms.texel!.value.set(1 / w, 1 / h);
    if (this.meterQuarter && this.meterSixteenth && this.meterLogMaterial && this.meterAverageMaterial) {
      this.meterQuarter.setSize(Math.max(1, Math.ceil(w / 4)), Math.max(1, Math.ceil(h / 4)));
      this.meterSixteenth.setSize(Math.max(1, Math.ceil(w / 16)), Math.max(1, Math.ceil(h / 16)));
      this.meterLogMaterial.uniforms.sourceTexel!.value.set(1 / w, 1 / h);
      this.meterAverageMaterial.uniforms.sourceTexel!.value.set(1 / this.meterQuarter.width, 1 / this.meterQuarter.height);
    }
    if (this.aoTarget && this.aoBlurTarget && this.aoMaterial && this.aoBlurMaterial) {
      const aw = Math.max(1, Math.round(w / 2));
      const ah = Math.max(1, Math.round(h / 2));
      this.aoTarget.setSize(aw, ah);
      this.aoBlurTarget.setSize(aw, ah);
      this.glass?.setSize(aw, ah);
      this.aoMaterial.uniforms.depthTexel!.value.set(1 / w, 1 / h);
      this.aoMaterial.uniforms.aspect!.value = w / h;
      this.aoBlurMaterial.uniforms.aoTexel!.value.set(1 / aw, 1 / ah);
      this.prepMaterial.uniforms.aoTexel!.value.set(1 / aw, 1 / ah);
    }
    this.bloom?.setSize(w, h);
    // `setSize` resets each target's viewport to the whole of it.
    this.applyRenderScale();
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
      material.uniforms.cameraNear!.value = camera.near;
      material.uniforms.cameraFar!.value = camera.far;
    }
    if (this.aoMaterial) {
      this.aoMaterial.uniforms.projection!.value.copy(camera.projectionMatrix);
      this.aoMaterial.uniforms.projectionInverse!.value.copy(camera.projectionMatrixInverse);
    }
  }

  /**
   * Every `METER_INTERVAL_S`, the frame is averaged down (a quarter, a sixteenth) into a 16 x 16
   * log-luminance map read back without stalling; the exposure follows it.
   */
  private meter(): void {
    if (!this.meterMaterial || !this.meterTarget || !this.meterQuarter || !this.meterSixteenth || !this.meterLogMaterial || !this.meterAverageMaterial) return;
    if (this.metering || this.meterTimer < METER_INTERVAL_S) return;
    this.meterTimer = 0;
    this.pass(this.meterLogMaterial, this.meterQuarter);
    this.pass(this.meterAverageMaterial, this.meterSixteenth);
    this.pass(this.meterMaterial, this.meterTarget);
    this.metering = true;
    // Only a reading of a frame drawn after `settle()` may move the eye at once.
    const snap = this.settleEye;
    this.settleEye = false;
    this.renderer
      .readRenderTargetPixelsAsync(this.meterTarget, 0, 0, METER_SIZE, METER_SIZE, this.meterPixels)
      .then(() => this.readMeter(snap))
      .catch(() => undefined)
      .finally(() => (this.metering = false));
  }

  private readMeter(snap: boolean): void {
    const px = this.meterPixels;
    let sum = 0;
    let weight = 0;
    for (let y = 0; y < METER_SIZE; y++) {
      for (let x = 0; x < METER_SIZE; x++) {
        const i = (y * METER_SIZE + x) * 4;
        // Centre-weighted, like a camera's meter; cut-out pixels (a video playing) carry no weight.
        const dx = (x + 0.5) / METER_SIZE - 0.5;
        const dy = (y + 0.5) / METER_SIZE - 0.5;
        // 16 x 16 RGBA pixels: `i` stays inside the buffer.
        const w = (px[i + 1]! / 255) * (1 - 1.2 * Math.hypot(dx, dy));
        if (w <= 0) continue;
        sum += ((px[i]! / 255) * 18 - 14) * w;
        weight += w;
      }
    }
    if (weight <= 0) return;
    const average = Math.pow(2, sum / weight);
    this.targetExposure = THREE.MathUtils.clamp(Math.pow(EXPOSURE_KEY / average, EXPOSURE_STRENGTH), EXPOSURE_MIN, EXPOSURE_MAX);
    if (snap) this.exposure = this.targetExposure;
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
    u.contrast!.value = grade ? look.contrast : 1;
    u.saturation!.value = grade ? look.saturation : 1;
    const temperature = grade ? look.temperature : 0;
    if (temperature !== this.lastTemperature) {
      this.lastTemperature = temperature;
      whiteBalance(temperature, u.whiteBalance!.value);
    }
    u.vignette!.value = grade ? look.vignette : 0;
    u.grain!.value = grade ? look.grain : 0;
    if (!grade) {
      this.lookColors.shadows.setRGB(0, 0, 0);
      this.lookColors.highlights.setRGB(1, 1, 1);
    }
  }
}
