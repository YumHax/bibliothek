import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';

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
  /** Compiles every material of `scene` for the target the scene is rendered into (not the canvas). */
  compile(scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(): void;
}

/** Extra renderer drawn after the WebGL frame with the same camera (e.g. a CSS3D layer). */
export interface LayerRenderer {
  render(camera: THREE.Camera): void;
  setSize(width: number, height: number): void;
}

/**
 * Retina screens are rendered at 1.5x at most, not 2x: the frame's cost is per pixel (every fragment
 * samples every shadow map), and 2x is 78% more pixels than 1.5x for a difference the eye barely sees.
 * The graphics quality lowers it further (`QUALITY.maxPixelRatio`).
 */
const MAX_PIXEL_RATIO = QUALITY.maxPixelRatio;
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
 * finished on the GPU (a fence is polled; meanwhile the updatables still tick). Chrome throttles
 * requestAnimationFrame that way on its own, Firefox does not: it keeps taking frames at the display
 * rate, its GPU process drowns in queued work, drops most of them and the whole browser stutters.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private readonly clock = new THREE.Clock();
  private readonly updatables = new Set<Updatable>();
  private readonly layers: LayerRenderer[] = [];
  private pipeline: FramePipeline | null = null;
  /** Signals when the GPU has finished the last frame rendered; null when nothing is pending. */
  private fence: WebGLSync | null = null;
  private fenceSince = 0;
  private fenceTimeouts = 0;
  private pacing = true;

  constructor(container: HTMLElement) {
    // alpha:true lets cut-out materials expose DOM layers sitting behind the canvas. With the
    // post-processing chain the frame is antialiased in its own multisampled target instead.
    this.renderer = new THREE.WebGLRenderer({ antialias: !QUALITY.postFx, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x0b0b10, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);

    window.addEventListener('resize', this.onResize);
  }

  addUpdatable(u: Updatable): void {
    this.updatables.add(u);
  }

  removeUpdatable(u: Updatable): void {
    this.updatables.delete(u);
  }

  addLayer(layer: LayerRenderer): void {
    this.layers.push(layer);
  }

  /** Renders every frame through `pipeline` instead of straight to the canvas. */
  setPipeline(pipeline: FramePipeline): void {
    this.pipeline = pipeline;
    pipeline.setSize();
  }

  /** Renders one frame now, through the pipeline when there is one (priming the shaders the loop will use). */
  renderFrame(): void {
    if (this.pipeline) this.pipeline.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  /**
   * Compiles the shader program of every material in the scene, in view or not, hidden or not,
   * with the scene's current lights: the variants the loop will ask for (off-screen ones with a pipeline).
   * `scene`: a stand-in holding content that is not in the scene yet, compiled with its own lights (`World.prepareZone`).
   */
  compileScene(scene: THREE.Scene = this.scene): void {
    if (this.pipeline) this.pipeline.compile(scene, this.camera);
    else this.renderer.compile(scene, this.camera);
  }

  start(): void {
    this.clock.start();
    this.renderer.setAnimationLoop(this.tick);
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
  }

  private tick = (): void => {
    // Clamp dt so a backgrounded tab does not teleport the player when it comes back.
    const dt = Math.min(this.clock.getDelta(), 0.1);
    for (const u of this.updatables) u.update(dt);
    if (!this.gpuIdle()) return;
    this.renderFrame();
    for (const layer of this.layers) layer.render(this.camera);
    if (!this.pacing) return;
    const gl = this.gl;
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    this.fenceSince = performance.now();
    gl.flush();
  };

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
    this.pipeline?.setSize();
    for (const layer of this.layers) layer.setSize(window.innerWidth, window.innerHeight);
  };
}
