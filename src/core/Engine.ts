import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { AdaptiveResolution } from './AdaptiveResolution';

/** Anything that needs a per-frame tick registers itself with the engine. */
export interface Updatable {
  update(dt: number): void;
}

export function isUpdatable(obj: object): obj is Updatable {
  return typeof (obj as Partial<Updatable>).update === 'function';
}

/**
 * Draws the frame in place of a plain `renderer.render` (the HDR post-processing chain,
 * `graphics/PostFx`); `setSize` follows the canvas's drawing-buffer size.
 */
export interface FramePipeline {
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  /**
   * Compiles every material of `scene` for the target the scene is rendered into (not the canvas),
   * with the lights of `lightsFrom` when given (else `scene`'s own); resolves once the driver has
   * linked the programs (`renderer.compileAsync`: at once without `KHR_parallel_shader_compile`).
   */
  compile(scene: THREE.Scene, camera: THREE.Camera, lightsFrom?: THREE.Scene): Promise<void>;
  setSize(): void;
  /**
   * Renders at `scale` (0..1] of the drawing buffer without resizing anything (the adaptive
   * resolution); a pipeline without it has the canvas itself resized instead.
   */
  setRenderScale?(scale: number): void;
}

/** Extra renderer drawn after the WebGL frame with the same camera (e.g. a CSS3D layer). */
export interface LayerRenderer {
  render(camera: THREE.Camera): void;
  setSize(width: number, height: number): void;
}

/**
 * Retina screens are rendered at 1.5x at most, not 2x: the frame's cost is per pixel (every fragment
 * samples every shadow map), and 2x is 78% more pixels than 1.5x for a difference the eye barely sees.
 * The graphics quality lowers it further (`QUALITY.maxPixelRatio`), and `AdaptiveResolution` goes
 * down to `QUALITY.minPixelRatio` while the GPU cannot keep up.
 */
function maxPixelRatio(): number {
  return Math.min(window.devicePixelRatio, QUALITY.maxPixelRatio);
}
/** Seconds a frame lasts at least (`QUALITY.maxFps`); 0 for every display refresh. */
const MIN_FRAME = QUALITY.maxFps > 0 ? 1 / QUALITY.maxFps : 0;
/** The camera's near plane (metres). */
const NEAR = 0.1;
/**
 * The far plane (metres): Front Street's facades stand up to 136 m down the street from where the
 * player can walk (x -39.5), so 100 m clipped its far end. Depth precision is set by the near plane
 * (it goes as 1 / near - 1 / far): 220 m instead of 100 changes it by 0.05 %.
 */
const FAR = 220;
/**
 * A fence still pending after this long is not a slow frame, it is a browser that does not report
 * sync status (a hidden tab, an odd driver): the frame is rendered anyway, and after a few of those
 * in a row the pacing switches itself off rather than hold the loop at four frames a second.
 */
const FENCE_TIMEOUT_MS = 250;
const FENCE_TIMEOUTS_TO_GIVE_UP = 3;

/**
 * Owns the renderer, scene, camera and the main loop.
 * Everything else (player, world, UI) plugs into it instead of touching three.js globals.
 * The loop never lets the GPU fall behind: a frame is only rendered once the previous one has
 * finished on the GPU (a fence is polled). Chrome throttles requestAnimationFrame that way on its
 * own, Firefox does not: it keeps taking frames at the display rate, its GPU process drowns in queued
 * work, drops most of them and the whole browser stutters. A display callback that renders nothing
 * (the GPU still busy, or sooner than `QUALITY.maxFps` allows on a 120 Hz screen) ticks nothing
 * either: the updatables are handed the whole time since the last frame on the next one.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private readonly clock = new THREE.Clock();
  private readonly updatables = new Set<Updatable>();
  private readonly lateUpdatables = new Set<Updatable>();
  private readonly earlyUpdatables = new Set<Updatable>();
  private readonly layers: LayerRenderer[] = [];
  private pipeline: FramePipeline | null = null;
  /** Signals when the GPU has finished the last frame rendered; null when nothing is pending. */
  private fence: WebGLSync | null = null;
  private fenceSince = 0;
  private fenceTimeouts = 0;
  private pacing = true;
  /** Seconds since the last rendered frame (the updatables' next `dt`). */
  private owed = 0;
  /** Whether the frame now due has waited for the GPU (tells `AdaptiveResolution` the pixels are late). */
  private waitedForGpu = false;
  private readonly resolution: AdaptiveResolution;
  /** `?stats` only: milliseconds each updatable spent in `update` since the readout last cleared it. */
  profile: Map<Updatable, number> | null = null;
  /** Frames actually rendered (a tick waiting on the GPU renders none). */
  renderedFrames = 0;
  /** Display callbacks, rendered or not. */
  ticks = 0;

  constructor(container: HTMLElement) {
    // alpha:true lets cut-out materials expose DOM layers sitting behind the canvas. With the
    // post-processing chain the frame is antialiased in its own multisampled target instead.
    this.renderer = new THREE.WebGLRenderer({ antialias: !QUALITY.postFx, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x0b0b10, 1);
    this.renderer.setPixelRatio(maxPixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // The scene never moves: left automatic, its matrix would be recomposed every frame and push a
    // world-matrix update down through every object under it, still or not.
    this.scene.matrixAutoUpdate = false;

    // Near at 0.1 m: nothing is ever drawn closer (walls stop the body 0.3 m away, a held box
    // rides 0.42 m out), and depth precision scales with it, so every mm-offset layer holds
    // twice as far as it did at 0.05 (see `world/surface/layers.ts`).
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, NEAR, FAR);

    const max = maxPixelRatio();
    this.resolution = new AdaptiveResolution(Math.min(QUALITY.minPixelRatio, max), max, MIN_FRAME || 1 / 60, (ratio) => this.applyResolution(ratio));

    window.addEventListener('resize', this.onResize);
    this.watchDevicePixelRatio();
  }

  /**
   * The window moved to a screen of another density (or the page was zoomed): `resize` does not
   * always fire, a `resolution` media query does. Watched afresh after each change (the query is
   * for the ratio at the time).
   */
  private watchDevicePixelRatio(): void {
    const query = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
    query?.addEventListener(
      'change',
      () => {
        this.updatePixelRatioRange();
        this.watchDevicePixelRatio();
      },
      { once: true },
    );
  }

  /**
   * The adaptive resolution's new ratio. With a pipeline that can scale its frame, the canvas stays
   * at the ceiling ratio and the pipeline renders a share of it (no target reallocated, no hitch);
   * otherwise the canvas itself is resized.
   */
  private applyResolution(ratio: number): void {
    const pipeline = this.pipeline;
    if (pipeline?.setRenderScale) {
      const max = maxPixelRatio();
      if (this.renderer.getPixelRatio() !== max) {
        this.renderer.setPixelRatio(max);
        pipeline.setSize();
      }
      pipeline.setRenderScale(ratio / max);
      return;
    }
    this.renderer.setPixelRatio(ratio);
    pipeline?.setSize();
  }

  /** Re-reads the device's pixel ratio (capped by the quality level) as `AdaptiveResolution`'s range. */
  private updatePixelRatioRange(): void {
    const max = maxPixelRatio();
    this.resolution.setRange(Math.min(QUALITY.minPixelRatio, max), max);
    // A lowered ratio that stays within the new range is not re-applied by `setRange`, but the canvas
    // must follow the new ceiling and the pipeline's share be taken of it.
    if (this.pipeline?.setRenderScale) this.applyResolution(this.resolution.pixelRatio);
  }

  /** The pixel ratio the frame is rendered at now (`AdaptiveResolution`). */
  get pixelRatio(): number {
    return this.resolution.pixelRatio;
  }

  addUpdatable(u: Updatable): void {
    this.updatables.add(u);
  }

  /**
   * Ticked after every `addUpdatable` one, whenever it was added: for what reads what the others
   * set this frame (the `LightCuller` fades the intensities the lamps' owners have just written).
   */
  addLateUpdatable(u: Updatable): void {
    this.lateUpdatables.add(u);
  }

  /**
   * Ticked before every `addUpdatable` one: for what must undo last frame's late work before the
   * others read it (the `LightCuller` hands the owners back their own intensities, unfaded, so an
   * owner easing from `light.intensity` never eases from the culler's fade of it).
   */
  addEarlyUpdatable(u: Updatable): void {
    this.earlyUpdatables.add(u);
  }

  removeUpdatable(u: Updatable): void {
    this.updatables.delete(u);
    this.lateUpdatables.delete(u);
    this.earlyUpdatables.delete(u);
  }

  addLayer(layer: LayerRenderer): void {
    this.layers.push(layer);
  }

  /** Renders every frame through `pipeline` instead of straight to the canvas. */
  setPipeline(pipeline: FramePipeline): void {
    this.pipeline = pipeline;
    pipeline.setSize();
    this.applyResolution(this.resolution.pixelRatio);
  }

  /** Renders one frame now, through the pipeline when there is one (priming the shaders the loop will use). */
  renderFrame(): void {
    if (this.pipeline) this.pipeline.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  /**
   * Compiles the shader program of every material in the scene, in view or not, hidden or not,
   * with the scene's current lights: the variants the loop will ask for (off-screen ones with a pipeline).
   * `scene`: a stand-in holding content that is not in the scene yet, compiled with its own lights (`World.prepareZone`),
   * or with `lightsFrom`'s (`World.prime`'s throwaway copies of what only a box in hand draws). The programs are
   * handed to the driver at once; the promise resolves once it has linked them (no deadline: callers race it).
   */
  compileScene(scene: THREE.Scene = this.scene, lightsFrom?: THREE.Scene): Promise<void> {
    if (this.pipeline) return this.pipeline.compile(scene, this.camera, lightsFrom);
    return this.renderer.compileAsync(scene, this.camera, lightsFrom ?? null).then(() => undefined);
  }

  start(): void {
    this.clock.start();
    this.renderer.setAnimationLoop(this.tick);
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
  }

  private tick = (): void => {
    this.ticks++;
    const interval = this.clock.getDelta();
    this.owed += interval;
    // Rendering now undershoots the cap by less than waiting one more callback would overshoot it.
    if (this.owed < MIN_FRAME - interval / 2) return;
    if (!this.gpuIdle()) {
      this.waitedForGpu = true;
      return;
    }
    // Clamp dt so a backgrounded tab does not teleport the player when it comes back.
    const dt = Math.min(this.owed, 0.1);
    this.owed = 0;
    if (this.pacing) this.resolution.frame(dt, this.waitedForGpu);
    this.waitedForGpu = false;
    this.tickAll(this.earlyUpdatables, dt);
    this.tickAll(this.updatables, dt);
    this.tickAll(this.lateUpdatables, dt);
    this.renderedFrames++;
    this.renderFrame();
    for (const layer of this.layers) layer.render(this.camera);
    if (!this.pacing) return;
    const gl = this.gl;
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    this.fenceSince = performance.now();
    gl.flush();
  };

  private tickAll(updatables: ReadonlySet<Updatable>, dt: number): void {
    const profile = this.profile;
    if (profile) {
      for (const u of updatables) {
        const t0 = performance.now();
        u.update(dt);
        profile.set(u, (profile.get(u) ?? 0) + performance.now() - t0);
      }
    } else for (const u of updatables) u.update(dt);
  }

  /** three.js renders through WebGL 2 only, which is where fences live. */
  private get gl(): WebGL2RenderingContext {
    return this.renderer.getContext() as WebGL2RenderingContext;
  }

  /** True once the GPU has finished the previous frame (or nothing is pending); the fence is consumed. */
  private gpuIdle(): boolean {
    if (!this.fence) return true;
    const gl = this.gl;
    const pending = gl.getSyncParameter(this.fence, gl.SYNC_STATUS) === gl.UNSIGNALED;
    if (pending && performance.now() - this.fenceSince < FENCE_TIMEOUT_MS) return false;
    if (pending && ++this.fenceTimeouts >= FENCE_TIMEOUTS_TO_GIVE_UP) {
      this.pacing = false;
      console.warn('[engine] GPU fences do not report here; frame pacing switched off');
    } else if (!pending) this.fenceTimeouts = 0;
    gl.deleteSync(this.fence);
    this.fence = null;
    return true;
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.updatePixelRatioRange();
    this.pipeline?.setSize();
    for (const layer of this.layers) layer.setSize(window.innerWidth, window.innerHeight);
  };
}
