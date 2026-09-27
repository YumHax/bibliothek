import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** How a shot looks at its model: turned `yaw` to the right of straight on, `pitch` down from level, `fill` of the frame. */
export interface ShotView {
  yaw?: number;
  pitch?: number;
  fill?: number;
}

/** Pixels on a side: a shop tile shows it at about 150 CSS px, twice that on a retina screen. */
const SIZE = 320;
const FOV = 26;
/** The studio packs up when nothing has been asked of it for this long (its GL context and everything uploaded to it go). */
const IDLE_MS = 12_000;
const DEFAULT_VIEW: Required<ShotView> = { yaw: 0.5, pitch: 0.32, fill: 0.9 };

interface Job {
  build: () => THREE.Object3D;
  view: Required<ShotView>;
  resolve: (url: string) => void;
  reject: (err: unknown) => void;
}

/**
 * A product photographer for the shop panels: builds a thing's real model (a prize, a piece of furniture), stands it
 * alone in a small lit studio of its own and returns a transparent PNG of it, framed to fit. Its own renderer, scene
 * and lights, never the world's: the room's light count and shaders stay untouched. Shots are taken one per idle
 * slot so a panel opening with twenty items does not stall a frame, and cached by key for the page's life (the
 * data URLs outlive the studio, which packs up after a while with nothing to do).
 */
class ThumbnailStudio {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 50);
  /** What a mirror is in a photo: silvered glass catching the studio's environment (a `Reflector` would show only the empty studio). */
  private silver: THREE.MeshStandardMaterial | null = null;
  private readonly shots = new Map<string, Promise<string>>();
  private readonly queue: Job[] = [];
  private scheduled = false;
  private idleTimer = 0;
  private broken = false;

  /** A photo of what `build` makes, as an image URL; the same key is shot once. Rejects where WebGL is not to be had. */
  shoot(key: string, build: () => THREE.Object3D, view: ShotView = {}): Promise<string> {
    const cached = this.shots.get(key);
    if (cached) return cached;
    const shot = new Promise<string>((resolve, reject) => {
      this.queue.push({ build, view: { ...DEFAULT_VIEW, ...view }, resolve, reject });
    });
    // A failed shot is not kept: the next panel opening tries again.
    shot.catch(() => this.shots.delete(key));
    this.shots.set(key, shot);
    this.schedule();
    return shot;
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    const run = (): void => {
      this.scheduled = false;
      this.next();
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 120 });
    else window.setTimeout(run, 16);
  }

  private next(): void {
    const job = this.queue.shift();
    if (!job) return;
    window.clearTimeout(this.idleTimer);
    try {
      job.resolve(this.take(job));
    } catch (err) {
      job.reject(err);
    }
    if (this.queue.length) this.schedule();
    else this.idleTimer = window.setTimeout(() => this.packUp(), IDLE_MS);
  }

  private take(job: Job): string {
    const { renderer, scene } = this.setUp();
    const model = job.build();
    const stage = new THREE.Group();
    stage.add(model);
    this.silverMirrors(stage);
    scene.add(stage);
    try {
      stage.updateMatrixWorld(true);
      const box = visibleBounds(stage);
      if (box.isEmpty()) throw new Error('nothing to photograph');
      const centre = box.getCenter(new THREE.Vector3());
      const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
      const { yaw, pitch, fill } = job.view;
      const distance = radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2)) / fill;
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      this.camera.position.copy(centre).addScaledVector(dir, distance);
      this.camera.near = Math.max(0.005, distance - radius * 2);
      this.camera.far = distance + radius * 2;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(centre);
      renderer.render(scene, this.camera);
      return renderer.domElement.toDataURL('image/png');
    } finally {
      scene.remove(stage);
      // Subscriptions, sounds, timers: what a zone's unload would stop. Geometry and materials are the shared caches'.
      stage.traverse((o) => (o as { dispose?: () => void }).dispose?.());
    }
  }

  /** Swaps every `Reflector` under `root` for a plain mesh of the same glass in `silver`. */
  private silverMirrors(root: THREE.Object3D): void {
    const mirrors: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as { isReflector?: boolean }).isReflector) mirrors.push(o as THREE.Mesh);
    });
    if (!mirrors.length) return;
    this.silver ??= new THREE.MeshStandardMaterial({ color: 0xc9d0d6, metalness: 1, roughness: 0.04 });
    for (const mirror of mirrors) {
      const glass = new THREE.Mesh(mirror.geometry, this.silver);
      glass.position.copy(mirror.position);
      glass.quaternion.copy(mirror.quaternion);
      glass.scale.copy(mirror.scale);
      mirror.parent?.add(glass);
      mirror.visible = false;
    }
  }

  private setUp(): { renderer: THREE.WebGLRenderer; scene: THREE.Scene } {
    if (this.broken) throw new Error('no WebGL for thumbnails');
    if (this.renderer && this.scene) return { renderer: this.renderer, scene: this.scene };
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    } catch (err) {
      this.broken = true;
      throw err;
    }
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.envTarget = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    scene.environment = this.envTarget.texture;
    scene.environmentIntensity = 0.55;
    // A key from the front left, a fill from the right, a rim from behind: a catalogue's lighting.
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
    key.position.set(-2, 3, 2.5);
    const fill = new THREE.DirectionalLight(0xdce8ff, 0.8);
    fill.position.set(3, 1, 1.5);
    const rim = new THREE.DirectionalLight(0xffffff, 1.4);
    rim.position.set(0.5, 2.5, -3);
    scene.add(key, fill, rim, new THREE.HemisphereLight(0xffffff, 0x3a3228, 0.6));
    this.renderer = renderer;
    this.scene = scene;
    return { renderer, scene };
  }

  private packUp(): void {
    if (this.queue.length || !this.renderer) return;
    this.envTarget?.dispose();
    this.envTarget = null;
    this.silver?.dispose();
    this.silver = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer = null;
    this.scene = null;
  }
}

/** The box round what a camera would see: invisible hitboxes and hidden parts left out. */
function visibleBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  const visit = (o: THREE.Object3D): void => {
    if (!o.visible) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (materials.some((m) => m.visible)) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        part.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
        box.union(part);
      }
    }
    for (const child of o.children) visit(child);
  };
  visit(root);
  return box;
}

/** The one studio for the page. */
export const studio = new ThumbnailStudio();
