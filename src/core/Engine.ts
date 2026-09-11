import * as THREE from 'three';

/** Anything that needs a per-frame tick registers itself with the engine. */
export interface Updatable {
  update(dt: number): void;
}

export function isUpdatable(obj: object): obj is Updatable {
  return typeof (obj as Partial<Updatable>).update === 'function';
}

/** Extra renderer drawn after the WebGL frame with the same camera (e.g. a CSS3D layer). */
export interface LayerRenderer {
  render(camera: THREE.Camera): void;
  setSize(width: number, height: number): void;
}

/**
 * Owns the renderer, scene, camera and the main loop.
 * Everything else (player, world, UI) plugs into it instead of touching three.js globals.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private readonly clock = new THREE.Clock();
  private readonly updatables = new Set<Updatable>();
  private readonly layers: LayerRenderer[] = [];

  constructor(container: HTMLElement) {
    // alpha:true lets cut-out materials expose DOM layers sitting behind the canvas.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x0b0b10, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    this.renderer.render(this.scene, this.camera);
    for (const layer of this.layers) layer.render(this.camera);
  };

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    for (const layer of this.layers) layer.setSize(window.innerWidth, window.innerHeight);
  };
}
