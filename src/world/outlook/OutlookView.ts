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

  /** Only the pane's rectangle of the picture is rendered (the whole of it when a corner is behind the eye). */
  private scissorTo(pane: THREE.Mesh, camera: THREE.Camera): void {
    const geometry = pane.geometry as THREE.PlaneGeometry;
    const { width, height } = geometry.parameters;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let behind = false;
    for (const [sx, sy] of CORNERS) {
      CORNER.set((sx * width) / 2, (sy * height) / 2, 0).applyMatrix4(pane.matrixWorld);
      CLIP.set(CORNER.x, CORNER.y, CORNER.z, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
      if (CLIP.w <= 0.01) {
        behind = true;
        break;
      }
      x0 = Math.min(x0, CLIP.x / CLIP.w);
      x1 = Math.max(x1, CLIP.x / CLIP.w);
      y0 = Math.min(y0, CLIP.y / CLIP.w);
      y1 = Math.max(y1, CLIP.y / CLIP.w);
    }
    const { width: tw, height: th } = this.target;
    const target = this.target;
    target.scissorTest = true;
    if (behind) {
      target.scissor.set(0, 0, tw, th);
      return;
    }
    const px0 = THREE.MathUtils.clamp(Math.floor(((x0 + 1) / 2) * tw) - SCISSOR_PAD, 0, tw);
    const px1 = THREE.MathUtils.clamp(Math.ceil(((x1 + 1) / 2) * tw) + SCISSOR_PAD, 0, tw);
    const py0 = THREE.MathUtils.clamp(Math.floor(((y0 + 1) / 2) * th) - SCISSOR_PAD, 0, th);
    const py1 = THREE.MathUtils.clamp(Math.ceil(((y1 + 1) / 2) * th) + SCISSOR_PAD, 0, th);
    target.scissor.set(px0, py0, Math.max(0, px1 - px0), Math.max(0, py1 - py0));
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

const DRAWING_BUFFER = new THREE.Vector2();
const CLEAR = new THREE.Color();
const CORNERS: readonly [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
const CORNER = new THREE.Vector3();
const CLIP = new THREE.Vector4();
const NORMAL = new THREE.Vector3();

/** Frees an outlook's scene: every mesh's own geometry and materials (the shared caches are left alone). */
export function disposeOutlookScene(scene: THREE.Scene): void {
  disposeTree(scene);
}
