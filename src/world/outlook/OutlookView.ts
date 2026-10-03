import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { QUALITY } from '@/graphics/quality';
import { disposeTree } from '../props/Prop';
import { patchShader } from '../materials/shaderPatch';
import { WALL, onSurface } from '../surface/layers';

/** What is out there: its own scene (lit by its own sun and sky, never the room's lamps), what moves in it, how to free it. */
export interface OutlookContents {
  scene: THREE.Scene;
  /** Ticked while a pane has been drawn lately (the sun, the lamps, the cars, the clouds). */
  updatables: readonly Updatable[];
  /** Before the scene is compiled, and now and then after (the sky's reflection): may render with `renderer`. */
  prepare?(renderer: THREE.WebGLRenderer, dt: number): void;
  dispose(): void;
}

export interface OutlookViewOptions {
  /** The main camera: only its view is rendered (a mirror's pass through the room reuses the last picture). */
  viewer: THREE.Camera;
  /** World (the room's scene) to the outlook's own frame, e.g. the street's zone-local metres. */
  toOutlook: () => THREE.Matrix4;
  /** Builds what is out there, handed the camera it is seen from (the sky dome and the sun follow it). */
  build: (camera: THREE.Camera) => Promise<OutlookContents>;
  /** The glass's colour until the view is built and compiled (a pale sky). */
  waiting: () => THREE.Color;
}

/** The view's picture: this share of the drawing buffer (it only covers the panes: see the scissor), its long side capped. */
const SIZE_SHARE = { high: 0.85, medium: 0.6, low: 0.5 } as const;
const MAX_SIDE_PX = 1920;
/** Seconds after the last pane was drawn that what is out there keeps moving (a glance away and back finds it going). */
const LIVE_AFTER_DRAWN = 1.5;
/**
 * Seconds without a pane drawn after which what is out there is freed (its scene, its picture), to be built again
 * next time (`prefetch` on walking in): a persistent room's view (the stairwell's) would otherwise hold a whole street.
 */
const FREE_AFTER_UNDRAWN = 90;
/**
 * Panes in one plane drawn in the same frame share one render of the picture over their rectangles' union, unless
 * the union is this many times their own areas (two panes far apart on screen: two small renders cost fewer pixels).
 */
const UNION_MAX_SPREAD = 2.5;
/** Pixels round a pane's projected corners kept in the scissor (its edge filtering, a frame's lag). */
const SCISSOR_PAD = 3;
/** How much of the outlook's light the glass lets through, and how much grey it adds (dust, the pane's own reflection). */
const TRANSMISSION = 0.9;
const GLASS_GREY = 0.012;

/**
 * The view through a window onto a place built elsewhere (`outlook/`): its own `THREE.Scene`, lit by its own sun,
 * rendered each frame one of its panes is drawn from the main camera carried into its frame (`toOutlook`), clipped
 * at the pane's plane, into a picture the pane then samples where it lies on screen: a portal. Every pane of one
 * view shares the picture, each rendering only its own rectangle of it (a scissor) as it is drawn. The render
 * happens in the pane's `onBeforeRender`, like three's `Reflector`: the room's scene and its lights are never
 * touched, so neither its shadow texture units nor its light count change. The contents are built lazily (`build`,
 * the street's classes in their own chunk) when the room is walked into (`prefetch`) or a pane is first drawn, then
 * compiled out of sight; until then the glass shows `waiting`. An `Updatable`: its owner in the zone ticks it.
 */
export class OutlookView extends THREE.Group implements Updatable {
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly target: THREE.WebGLRenderTarget;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly clipPlanes = [new THREE.Plane()];
  private contents: OutlookContents | null = null;
  private state: 'idle' | 'building' | 'compiling' | 'ready' | 'failed' = 'idle';
  private renderer: THREE.WebGLRenderer | null = null;
  private sinceDrawn = Infinity;
  private disposed = false;
  /** Every pane made (`pane`): the ones sharing a frame's render are picked among them. */
  private readonly panes: THREE.Mesh[] = [];
  /** The panes the picture already covers this frame, and the renderer's frame count once it was rendered. */
  private readonly covered = new Set<THREE.Mesh>();
  private coveredFrame = -1;
  private coveredBy: THREE.Camera | null = null;

  constructor(private readonly options: OutlookViewOptions) {
    super();
    this.name = 'OutlookView';
    this.target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 });
    this.target.texture.generateMipmaps = false;
    this.camera.matrixAutoUpdate = false;
    this.material = new THREE.MeshBasicMaterial({ map: this.target.texture, color: new THREE.Color(TRANSMISSION, TRANSMISSION, TRANSMISSION), fog: false });
    // The picture is looked up where the fragment lies on screen: the pane's own clip position (the portal's camera is
    // the main one carried into the outlook, so a point of the pane lands on the picture where it lands on screen).
    patchShader(this.material, 'outlookPane', (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvOutlookClip = gl_Position;');
      shader.vertexShader = 'varying vec4 vOutlookClip;\n' + shader.vertexShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `vec4 sampledDiffuseColor = texture2D(map, vOutlookClip.xy / vOutlookClip.w * 0.5 + 0.5);\ndiffuseColor.rgb *= sampledDiffuseColor.rgb;\ndiffuseColor.rgb += ${GLASS_GREY.toFixed(3)};`,
      );
      shader.fragmentShader = 'varying vec4 vOutlookClip;\n' + shader.fragmentShader;
    });
  }

  /** A pane of this view, `width` x `height`, facing local +z (the room), for the caller to place in its window (on its wall: `WALL.paper`'s lift). */
  pane(width: number, height: number): THREE.Mesh {
    onSurface(this.material, WALL.paper);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    mesh.name = 'OutlookPane';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.onBeforeRender = (renderer, _scene, camera) => this.draw(mesh, renderer, camera);
    this.panes.push(mesh);
    return mesh;
  }

  /**
   * Builds what is out there at the browser's next idle moment, before any pane is drawn (the player walked into the
   * room: turning to the window then finds it ready, not a freeze while the street is built). Safe to call again.
   */
  prefetch(): void {
    if (this.state !== 'idle') return;
    this.state = 'building';
    const run = (): void => this.startBuilding();
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 200);
  }

  update(dt: number): void {
    this.sinceDrawn += dt;
    if (this.state === 'ready' && this.contents && this.sinceDrawn > FREE_AFTER_UNDRAWN) this.free();
    const drawnLately = this.sinceDrawn < LIVE_AFTER_DRAWN;
    if (this.state === 'idle' && drawnLately) {
      this.state = 'building';
      this.startBuilding();
    }
    if (this.state === 'compiling' || !this.contents || !this.renderer) return;
    if (this.state === 'ready' && !drawnLately) return;
    for (const item of this.contents.updatables) item.update(dt);
    if (this.state === 'ready') this.contents.prepare?.(this.renderer, dt);
    else if (this.state === 'building') this.compile(this.renderer, this.contents);
  }

  dispose(): void {
    this.disposed = true;
    this.contents?.dispose();
    this.contents = null;
    this.target.dispose();
    this.material.dispose();
  }

  /** Long out of sight: the scene and its picture go (the GPU memory with them), back to `idle` to be built again when needed. */
  private free(): void {
    this.contents?.dispose();
    this.contents = null;
    this.state = 'idle';
    this.covered.clear();
    this.coveredFrame = -1;
    this.target.setSize(16, 16);
  }

  private startBuilding(): void {
    if (this.disposed) return;
    this.options
      .build(this.camera)
      .then((contents) => {
        if (this.disposed) {
          contents.dispose();
          return;
        }
        this.contents = contents;
      })
      .catch((error: unknown) => {
        this.state = 'failed';
        console.error('[outlook] the view failed to build', error);
      });
  }

  /** The programs linked out of sight (as the picture's target binds them: no tone mapping, a clip plane), then shown. */
  private compile(renderer: THREE.WebGLRenderer, contents: OutlookContents): void {
    this.state = 'compiling';
    contents.prepare?.(renderer, 0);
    const previous = renderer.getRenderTarget();
    const clipping = renderer.clippingPlanes;
    renderer.setRenderTarget(this.target);
    renderer.clippingPlanes = this.clipPlanes;
    let compiled: Promise<unknown>;
    try {
      compiled = renderer.compileAsync(contents.scene, this.camera);
    } finally {
      renderer.clippingPlanes = clipping;
      renderer.setRenderTarget(previous);
    }
    compiled
      .then(() => {
        if (!this.disposed) this.state = 'ready';
      })
      .catch((error: unknown) => {
        this.state = 'failed';
        console.error('[outlook] the view failed to compile', error);
      });
  }

  /** As a pane is drawn by the main camera: its rectangle of the picture rendered afresh (or the glass's colour while waiting). */
  private draw(pane: THREE.Mesh, renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (camera !== this.options.viewer) return;
    this.renderer = renderer;
    this.sinceDrawn = 0;
    // Another pane's render this frame already covered this one (the renderer's frame count has not moved since).
    if (camera === this.coveredBy && renderer.info.render.frame === this.coveredFrame && this.covered.has(pane)) return;
    this.fitTarget(renderer);
    const previous = renderer.getRenderTarget();
    const ready = this.state === 'ready' && this.contents;
    this.placeCamera(camera as THREE.PerspectiveCamera);
    this.scissorTo(pane, camera);
    if (ready) this.clipAt(pane);
    const clipping = renderer.clippingPlanes;
    const autoUpdate = renderer.shadowMap.autoUpdate;
    const clearColor = renderer.getClearColor(CLEAR);
    const clearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    if (ready) {
      renderer.clippingPlanes = this.clipPlanes;
      // The outlook's sun refreshes its own map (`ShadowRefresh`); the room's were drawn at the start of its frame.
      renderer.shadowMap.autoUpdate = true;
      renderer.render(this.contents!.scene, this.camera);
    } else {
      renderer.setClearColor(this.options.waiting(), 1);
      renderer.clear(true, true, false);
    }
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.shadowMap.autoUpdate = autoUpdate;
    renderer.clippingPlanes = clipping;
    renderer.setRenderTarget(previous);
    if (ready) resetClipping(renderer, camera);
    // The panes this render covered skip theirs until the renderer's next render (the frame count moves on).
    this.coveredFrame = renderer.info.render.frame;
    this.coveredBy = camera;
  }

  /** The picture at a share of the drawing buffer, in its proportions (the pane samples it in screen space). */
  private fitTarget(renderer: THREE.WebGLRenderer): void {
    renderer.getDrawingBufferSize(DRAWING_BUFFER);
    let w = DRAWING_BUFFER.x * SIZE_SHARE[QUALITY.level];
    let h = DRAWING_BUFFER.y * SIZE_SHARE[QUALITY.level];
    const long = Math.max(w, h, 1);
    if (long > MAX_SIDE_PX) {
      w *= MAX_SIDE_PX / long;
      h *= MAX_SIDE_PX / long;
    }
    const width = Math.max(16, Math.round(w));
    const height = Math.max(16, Math.round(h));
    if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height);
  }

  /** The main camera, carried into the outlook's frame: same lens, same place relative to the window. */
  private placeCamera(camera: THREE.PerspectiveCamera): void {
    const c = this.camera;
    c.matrixWorld.multiplyMatrices(this.options.toOutlook(), camera.matrixWorld);
    c.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    c.matrix.copy(c.matrixWorld);
    c.matrixWorldInverse.copy(c.matrixWorld).invert();
    c.projectionMatrix.copy(camera.projectionMatrix);
    c.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    c.near = camera.near;
    c.far = camera.far;
    c.layers.mask = camera.layers.mask;
  }

  /**
   * Only the pane's rectangle of the picture is rendered (the whole of it when a corner is behind the eye), stretched
   * over the other panes of this view in its plane that are on screen this frame, when that costs few extra pixels:
   * those are then `covered`, and their own draw skips the render (the stairwell's panes, a storey apart up the well).
   */
  private scissorTo(pane: THREE.Mesh, camera: THREE.Camera): void {
    const target = this.target;
    target.scissorTest = true;
    this.covered.clear();
    this.covered.add(pane);
    if (!this.rectOf(pane, camera, RECT)) {
      target.scissor.set(0, 0, target.width, target.height);
      for (const other of this.panes) if (other !== pane && this.sharesPlane(other, pane)) this.covered.add(other);
      return;
    }
    UNION.copy(RECT);
    let own = area(RECT);
    for (const other of this.panes) {
      if (other === pane || !this.sharesPlane(other, pane) || !this.rectOf(other, camera, OTHER)) continue;
      if (OTHER.z <= 0 || OTHER.w <= 0) continue;
      const x0 = Math.min(UNION.x, OTHER.x);
      const y0 = Math.min(UNION.y, OTHER.y);
      const x1 = Math.max(UNION.x + UNION.z, OTHER.x + OTHER.z);
      const y1 = Math.max(UNION.y + UNION.w, OTHER.y + OTHER.w);
      const both = own + area(OTHER);
      if ((x1 - x0) * (y1 - y0) > UNION_MAX_SPREAD * both) continue;
      UNION.set(x0, y0, x1 - x0, y1 - y0);
      own = both;
      this.covered.add(other);
    }
    target.scissor.copy(UNION);
  }

  /** The pane's rectangle of the picture in pixels (x, y, width, height), clamped to it; false when a corner is behind the eye. */
  private rectOf(pane: THREE.Mesh, camera: THREE.Camera, out: THREE.Vector4): boolean {
    const geometry = pane.geometry as THREE.PlaneGeometry;
    const { width, height } = geometry.parameters;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [sx, sy] of CORNERS) {
      CORNER.set((sx * width) / 2, (sy * height) / 2, 0).applyMatrix4(pane.matrixWorld);
      CLIP.set(CORNER.x, CORNER.y, CORNER.z, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
      if (CLIP.w <= 0.01) return false;
      x0 = Math.min(x0, CLIP.x / CLIP.w);
      x1 = Math.max(x1, CLIP.x / CLIP.w);
      y0 = Math.min(y0, CLIP.y / CLIP.w);
      y1 = Math.max(y1, CLIP.y / CLIP.w);
    }
    const { width: tw, height: th } = this.target;
    const px0 = THREE.MathUtils.clamp(Math.floor(((x0 + 1) / 2) * tw) - SCISSOR_PAD, 0, tw);
    const px1 = THREE.MathUtils.clamp(Math.ceil(((x1 + 1) / 2) * tw) + SCISSOR_PAD, 0, tw);
    const py0 = THREE.MathUtils.clamp(Math.floor(((y0 + 1) / 2) * th) - SCISSOR_PAD, 0, th);
    const py1 = THREE.MathUtils.clamp(Math.ceil(((y1 + 1) / 2) * th) + SCISSOR_PAD, 0, th);
    out.set(px0, py0, Math.max(0, px1 - px0), Math.max(0, py1 - py0));
    return true;
  }

  /** Whether `other` shows this view's picture now (its owner may have swapped its material) and lies in `pane`'s plane (one clip plane serves both). */
  private sharesPlane(other: THREE.Mesh, pane: THREE.Mesh): boolean {
    if (other.material !== this.material || !shown(other)) return false;
    NORMAL.set(0, 0, 1).transformDirection(pane.matrixWorld);
    OTHER_NORMAL.set(0, 0, 1).transformDirection(other.matrixWorld);
    if (NORMAL.dot(OTHER_NORMAL) < 0.999) return false;
    pane.getWorldPosition(CORNER);
    other.getWorldPosition(OTHER_CORNER);
    return Math.abs(OTHER_CORNER.sub(CORNER).dot(NORMAL)) < 0.01;
  }

  /** Nothing on the room's side of the pane is drawn: the plane through it, facing out, in the outlook's frame. */
  private clipAt(pane: THREE.Mesh): void {
    // The pane faces the room (+z local): the outside is along its -z.
    NORMAL.set(0, 0, -1).transformDirection(pane.matrixWorld);
    pane.getWorldPosition(CORNER);
    const plane = this.clipPlanes[0]!;
    plane.setFromNormalAndCoplanarPoint(NORMAL, CORNER).applyMatrix4(this.options.toOutlook());
  }
}

/** Nothing, rendered to put the renderer's clipping back (`resetClipping`). */
const NOTHING = new THREE.Scene();

/**
 * The picture is rendered from inside the room's own render (a pane's `onBeforeRender`), and three.js does not hand the
 * clipping back when a nested render ends: the outlook's plane stays the global one, projected into the room's camera,
 * for everything the room draws after the pane (which depends on the view: things vanishing as the player turns). An
 * empty render with the room's planes starts the clipping afresh from them; it draws and clears nothing.
 */
function resetClipping(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
  const autoClear = renderer.autoClear;
  const autoUpdate = renderer.shadowMap.autoUpdate;
  renderer.autoClear = false;
  renderer.shadowMap.autoUpdate = false;
  renderer.render(NOTHING, camera);
  renderer.autoClear = autoClear;
  renderer.shadowMap.autoUpdate = autoUpdate;
}

const DRAWING_BUFFER = new THREE.Vector2();
const CLEAR = new THREE.Color();
const CORNERS: readonly [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
const CORNER = new THREE.Vector3();
const OTHER_CORNER = new THREE.Vector3();
const CLIP = new THREE.Vector4();
const NORMAL = new THREE.Vector3();
const OTHER_NORMAL = new THREE.Vector3();
const RECT = new THREE.Vector4();
const OTHER = new THREE.Vector4();
const UNION = new THREE.Vector4();

/** A pixel rectangle's area (x, y, width, height). */
function area(rect: THREE.Vector4): number {
  return rect.z * rect.w;
}

/** Whether `object` and all its parents are visible (a hidden window's pane is never drawn). */
function shown(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** Frees an outlook's scene: every mesh's own geometry and materials (the shared caches are left alone). */
export function disposeOutlookScene(scene: THREE.Scene): void {
  disposeTree(scene);
}
