import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { QUALITY } from '@/graphics/quality';
import { flag } from '@/settings/flags';
import { disposeTree } from '../props/Prop';
import { markShared } from '../materials/sharedResources';
import { patchShader } from '../materials/shaderPatch';
import { WALL, onSurface } from '../surface/layers';
import { registerZfightRoot } from '../surface/zfight';
import { markGlass, unmarkGlass } from '@/graphics/glassMask';

/** What is out there: its own scene (lit by its own sun and sky, never the room's lamps), what moves in it, how to free it. */
export interface OutlookContents {
  scene: THREE.Scene;
  /** Ticked while a pane has been drawn lately (the sun, the lamps, the cars, the clouds). */
  updatables: readonly Updatable[];
  /** Before the scene is compiled, and now and then after (the sky's reflection): may render with `renderer`. */
  prepare?(renderer: THREE.WebGLRenderer, dt: number): void;
  /** The scene's children compiled one by one over idle moments (default: the whole scene at once). */
  parts?: readonly THREE.Object3D[];
  dispose(): void;
}

/** World (the room's scene) to the outlook's own frame (e.g. the street's zone-local metres), for one of its panes. */
export type ToOutlook = (pane: THREE.Mesh) => THREE.Matrix4;

interface OutlookViewOptions {
  /** The main camera: only its view is rendered (a mirror's pass through the room reuses the last picture). */
  viewer: THREE.Camera;
  /** World to the outlook's frame for the panes made without their own (`pane`). */
  toOutlook?: () => THREE.Matrix4;
  /**
   * Builds what is out there, handed the camera it is seen from (the sky dome and the sun follow it) and `between`, the
   * browser's next idle moment, to await between steps (a whole street built in one go is a freeze).
   */
  build: (camera: THREE.Camera, between: () => Promise<void>) => Promise<OutlookContents>;
  /** The glass's colour until the view is built and compiled (a pale sky). */
  waiting: () => THREE.Color;
  /** Its name for the z-fight check once built: `bibliothek.zfight('outlook:<name>')` (default `view<n>`). */
  name?: string;
  /**
   * Kept while out of sight, never freed by `FREE_AFTER_UNDRAWN` (the home view: a window of the flat is always a
   * doorway away, and building it again when one comes into view froze the corridor); it goes with `dispose`.
   */
  keep?: boolean;
}

/** The view's picture: this share of the drawing buffer (it only covers the panes: see the scissor), its long side capped. */
const SIZE_SHARE = { high: 0.75, medium: 0.6, low: 0.5 } as const;
const MAX_SIDE_PX = 1920;
/** MSAA samples of the picture: its roofs and wires against the sky step without them (the room's own MSAA never reaches it). */
const SAMPLES = { high: 4, medium: 0, low: 0 } as const;
/**
 * Seconds a pane's picture is kept while the eye is still (same camera, same pane, nothing rendered over its
 * rectangle since): what is out there then moves at this rate (20 Hz), not the screen's, for a fraction of the cost.
 */
const REUSE_FOR = 1 / 20;
/** How many of the last renders are remembered, to tell whether one of them painted over a pane's kept picture. */
const RECENT = 8;
/** Seconds after the last pane was drawn that what is out there keeps moving (a glance away and back finds it going). */
const LIVE_AFTER_DRAWN = 1.5;
/**
 * Seconds without a pane drawn after which what is out there is freed (its scene, its picture), to be built again
 * next time (`prefetch` on walking in), unless the view is kept (`keep`: the home view).
 */
const FREE_AFTER_UNDRAWN = 90;
/** Milliseconds of compiling (`compileInSlices`) before waiting for the browser's next idle moment. */
const COMPILE_SLICE_MS = 8;
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
/** Seconds the view takes to come through the waiting colour once ready (a fade, not a pop; again after a free). */
const REVEAL_S = 0.4;
/** How far the z-fight check judges an outlook's scene from (m): a street is seen down its length. */
const ZFIGHT_DISTANCE = 140;
/** Views made without a name, counted for theirs. */
let views = 0;

/** What three keeps of a material's linked program (`renderer.properties`): enough to wait for the link. */
interface CompiledProgram {
  isReady(): boolean;
  getUniforms(): unknown;
}

function idle(run: () => void): void {
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 200);
}

/** The browser's next idle moment: a view's build and compile are spread over several, not one freeze. */
function idleMoment(): Promise<void> {
  return new Promise((resolve) => idle(resolve));
}

/**
 * The view through a window onto a place built elsewhere (`outlook/`): its own `THREE.Scene`, lit by its own sun,
 * rendered each frame one of its panes is drawn from the main camera carried into its frame (`toOutlook`), clipped
 * at the pane's plane, into a picture the pane then samples where it lies on screen: a portal. Every pane of one
 * view shares the picture, each rendering only its own rectangle of it (a scissor) as it is drawn. The render
 * happens in the pane's `onBeforeRender`, like three's `Reflector`: the room's scene and its lights are never
 * touched, so neither its shadow texture units nor its light count change. The contents are built lazily (`build`,
 * the street's classes in their own chunk) when the room is walked into (`prefetch`) or a pane is first drawn, then
 * compiled out of sight, both spread over idle moments; until then the glass shows `waiting`. An `Updatable`: its
 * owner in the zone ticks it.
 */
export class OutlookView extends THREE.Group implements Updatable {
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly target: THREE.WebGLRenderTarget;
  private readonly material: THREE.MeshBasicMaterial;
  /** The same picture on the inside of a sphere round an open-air spot (`surround`), made on first use. */
  private surroundMaterial: THREE.MeshBasicMaterial | null = null;
  private readonly clipPlanes = [new THREE.Plane()];
  private contents: OutlookContents | null = null;
  /** Its scene in the z-fight check while built (`registerZfightRoot`). */
  private readonly zfightName: string;
  private unregisterZfight: () => void = () => {};
  private state: 'idle' | 'building' | 'compiling' | 'ready' | 'failed' = 'idle';
  private renderer: THREE.WebGLRenderer | null = null;
  private sinceDrawn = Infinity;
  private disposed = false;
  /** Every pane made (`pane`): the ones sharing a frame's render are picked among them. */
  private readonly panes: THREE.Mesh[] = [];
  /** Each pane's way into the outlook's frame and what its last render was (see `reusable`). */
  private readonly records = new Map<THREE.Mesh, PaneRecord>();
  /** The last renders (their sequence number and rectangle), newest last. */
  private readonly recent: { seq: number; rect: THREE.Vector4 }[] = [];
  private seq = 0;
  /** The renderer's frame count at the last tick: every owner of a shared view ticks it, it moves on once a frame. */
  private tickedFrame = -1;
  /** The panes the picture already covers this frame, and the renderer's frame count once it was rendered. */
  private readonly covered = new Set<THREE.Mesh>();
  private coveredFrame = -1;
  private coveredBy: THREE.Camera | null = null;
  /** 0 as the view becomes ready .. 1 once it shows through the waiting colour entirely (`REVEAL_S`). */
  private reveal = 0;

  constructor(private readonly options: OutlookViewOptions) {
    super();
    this.name = 'OutlookView';
    this.zfightName = `outlook:${options.name ?? `view${++views}`}`;
    this.target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: true, samples: SAMPLES[QUALITY.level] });
    this.target.texture.generateMipmaps = false;
    this.camera.matrixAutoUpdate = false;
    this.material = screenSampled(new THREE.MeshBasicMaterial({ map: this.target.texture, color: new THREE.Color(TRANSMISSION, TRANSMISSION, TRANSMISSION), fog: false }), GLASS_GREY);
  }

  /**
   * A pane of this view, `width` x `height`, facing local +z (the room), for the caller to place in its window (on its
   * wall: `WALL.paper`'s lift). `toOutlook`: how the world maps into the outlook for this pane (several rooms, or
   * several flats of one building, share one view: `sharedOutlook`); default the view's own.
   */
  pane(width: number, height: number, toOutlook?: ToOutlook): THREE.Mesh {
    onSurface(this.material, WALL.pane);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    mesh.name = 'OutlookPane';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.onBeforeRender = (renderer, _scene, camera) => this.draw(mesh, renderer, camera);
    const own = this.options.toOutlook;
    const map = toOutlook ?? (own ? () => own() : null);
    if (!map) throw new Error('[outlook] a pane needs a way into the outlook (`toOutlook`)');
    this.panes.push(mesh);
    this.records.set(mesh, { toOutlook: map, surround: false, seq: -1, renderedAt: -Infinity, rect: new THREE.Vector4(), viewer: new THREE.Matrix4(), projection: new THREE.Matrix4(), outlook: new THREE.Matrix4() });
    markGlass(mesh);
    return mesh;
  }

  /**
   * The open air round a spot outside (the balcony): `geometry` (a sphere round it, seen from inside) shows the whole
   * view, unclipped and without glass, drawn after everything opaque and writing no depth (`OpenAir`).
   */
  surround(geometry: THREE.BufferGeometry, toOutlook?: ToOutlook): THREE.Mesh {
    this.surroundMaterial ??= screenSampled(new THREE.MeshBasicMaterial({ map: this.target.texture, fog: false, side: THREE.BackSide, depthWrite: false }), 0);
    const mesh = this.pane(1, 1, toOutlook);
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    mesh.material = this.surroundMaterial;
    mesh.name = 'OutlookSurround';
    mesh.frustumCulled = false;
    this.records.get(mesh)!.surround = true;
    unmarkGlass(mesh);
    return mesh;
  }

  /** The pane's room is gone (its zone unloaded): it is no longer drawn nor counted. */
  release(pane: THREE.Mesh): void {
    const i = this.panes.indexOf(pane);
    if (i >= 0) this.panes.splice(i, 1);
    this.records.delete(pane);
    this.covered.delete(pane);
    unmarkGlass(pane);
    pane.geometry.dispose();
  }

  /**
   * Builds what is out there at the browser's next idle moment, before any pane is drawn (the player walked into the
   * room: turning to the window then finds it ready, not a freeze while the street is built). Safe to call again.
   */
  prefetch(): void {
    if (this.state !== 'idle') return;
    this.state = 'building';
    idle(() => this.startBuilding());
  }

  update(dt: number): void {
    // A view shared by several rooms is ticked by each of their windows: once a frame.
    if (this.renderer) {
      const frame = this.renderer.info.render.frame;
      if (frame === this.tickedFrame) return;
      this.tickedFrame = frame;
    }
    this.sinceDrawn += dt;
    if (this.state === 'ready' && this.reveal < 1) this.reveal = Math.min(1, this.reveal + dt / REVEAL_S);
    if (this.state === 'ready' && this.contents && !this.options.keep && this.sinceDrawn > FREE_AFTER_UNDRAWN) this.free();
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
    this.unregisterZfight();
    this.contents?.dispose();
    this.contents = null;
    this.target.dispose();
    this.material.dispose();
    this.surroundMaterial?.dispose();
    for (const pane of this.panes) unmarkGlass(pane);
  }

  /** Long out of sight: the scene and its picture go (the GPU memory with them), back to `idle` to be built again when needed. */
  private free(): void {
    this.unregisterZfight();
    this.contents?.dispose();
    this.contents = null;
    this.state = 'idle';
    this.covered.clear();
    this.coveredFrame = -1;
    this.recent.length = 0;
    this.target.setSize(16, 16);
  }

  private startBuilding(): void {
    if (this.disposed) return;
    this.options
      .build(this.camera, idleMoment)
      .then((contents) => {
        if (this.disposed) {
          contents.dispose();
          return;
        }
        this.contents = contents;
        this.unregisterZfight = registerZfightRoot(this.zfightName, contents.scene, ZFIGHT_DISTANCE);
      })
      .catch((error: unknown) => {
        this.state = 'failed';
        console.error('[outlook] the view failed to build', error);
      });
  }

  /** The waiting colour over the fresh picture, less of it as the view is revealed (in the pane's scissor, unclipped). */
  private veil(renderer: THREE.WebGLRenderer): void {
    VEIL_MATERIAL.color.copy(this.options.waiting());
    VEIL_MATERIAL.opacity = 1 - this.reveal;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clippingPlanes = NO_PLANES;
    renderer.shadowMap.autoUpdate = false;
    renderer.render(VEIL_SCENE, VEIL_CAMERA);
    renderer.autoClear = autoClear;
  }

  /** The programs linked out of sight (as the picture's target binds them: no tone mapping, a clip plane), then shown. */
  private compile(renderer: THREE.WebGLRenderer, contents: OutlookContents): void {
    this.state = 'compiling';
    contents.prepare?.(renderer, 0);
    const compiled = contents.parts ? this.compileInSlices(renderer, contents) : this.compileSome(renderer, contents.scene, null);
    compiled
      .then(() => {
        if (!this.disposed && this.contents === contents) {
          this.state = 'ready';
          this.reveal = 0;
        }
      })
      .catch((error: unknown) => {
        this.state = 'failed';
        console.error('[outlook] the view failed to compile', error);
      });
  }

  /**
   * `contents.parts` compiled a few at a time, an idle moment between (`COMPILE_SLICE_MS`): a street's hundred-odd
   * programs linked in one go froze the room for a second or more where the driver cannot link in parallel (Firefox).
   * Each part is taken out of the scene while it compiles, so its own lights count once and the others' come from the
   * scene. A last pass over the whole scene links anything the parts missed (cached programs cost nothing).
   */
  private async compileInSlices(renderer: THREE.WebGLRenderer, contents: OutlookContents): Promise<void> {
    const { scene } = contents;
    let sliceStarted = performance.now();
    const linked: Promise<void>[] = [];
    for (const part of contents.parts ?? []) {
      if (performance.now() - sliceStarted > COMPILE_SLICE_MS) {
        await idleMoment();
        sliceStarted = performance.now();
      }
      if (this.disposed || this.contents !== contents) return;
      if (part.parent !== scene) continue;
      const at = scene.children.indexOf(part);
      scene.remove(part);
      try {
        linked.push(this.compileSome(renderer, part, scene));
      } finally {
        // Back where it was among the scene's children.
        scene.add(part);
        scene.children.pop();
        scene.children.splice(at, 0, part);
      }
    }
    await Promise.all(linked);
    if (this.disposed || this.contents !== contents) return;
    await idleMoment();
    await this.compileSome(renderer, scene, null);
  }

  /**
   * `root`'s programs compiled as the picture's target binds them (no tone mapping, a clip plane), with the lights of
   * `lightsFrom` as well when given; resolves once linked. Without the driver's parallel compile three only links a
   * program on its first draw (`isReady` is true at once): its uniforms are read here instead, so the wait is now.
   */
  private compileSome(renderer: THREE.WebGLRenderer, root: THREE.Object3D, lightsFrom: THREE.Scene | null): Promise<void> {
    const previous = renderer.getRenderTarget();
    const clipping = renderer.clippingPlanes;
    renderer.setRenderTarget(this.target);
    renderer.clippingPlanes = this.clipPlanes;
    let materials: Set<THREE.Material>;
    try {
      materials = renderer.compile(root, this.camera, lightsFrom);
    } finally {
      renderer.clippingPlanes = clipping;
      renderer.setRenderTarget(previous);
    }
    const programOf = (material: THREE.Material): CompiledProgram | undefined =>
      (renderer.properties.get(material) as { currentProgram?: CompiledProgram } | undefined)?.currentProgram;
    if (!renderer.extensions.has('KHR_parallel_shader_compile')) {
      for (const material of materials) programOf(material)?.getUniforms();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const check = (): void => {
        for (const material of materials) if (programOf(material)?.isReady() !== false) materials.delete(material);
        if (materials.size === 0) resolve();
        else setTimeout(check, 10);
      };
      check();
    });
  }

  /** As a pane is drawn by the main camera: its rectangle of the picture rendered afresh (or the glass's colour while waiting). */
  private draw(pane: THREE.Mesh, renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const record = this.records.get(pane);
    // Not the main camera (a mirror's pass), or the pane's owner shows something else on it now (frosted glass).
    if (!record || camera !== this.options.viewer || pane.material !== (record.surround ? this.surroundMaterial : this.material)) return;
    this.renderer = renderer;
    this.sinceDrawn = 0;
    // Another pane's render this frame already covered this one (the renderer's frame count has not moved since).
    if (camera === this.coveredBy && renderer.info.render.frame === this.coveredFrame && this.covered.has(pane)) return;
    this.fitTarget(renderer);
    const ready = this.state === 'ready' && this.contents;
    const toOutlook = record.toOutlook(pane);
    if (ready && this.reveal >= 1 && this.reusable(record, camera, toOutlook)) {
      STATS.reused++;
      return;
    }
    const started = STATS.on ? performance.now() : 0;
    const previous = renderer.getRenderTarget();
    this.placeCamera(camera as THREE.PerspectiveCamera, toOutlook);
    this.scissorTo(pane, camera, record);
    if (ready) this.clipAt(pane, toOutlook, record.surround);
    const clipping = renderer.clippingPlanes;
    const autoUpdate = renderer.shadowMap.autoUpdate;
    const clearColor = renderer.getClearColor(CLEAR);
    const clearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    if (ready) {
      renderer.clippingPlanes = this.clipPlanes;
      // The outlook's sun refreshes its own map (`ShadowRefresh`, a few times a second); the room's were drawn at the start of its frame.
      renderer.shadowMap.autoUpdate = true;
      renderer.render(this.contents!.scene, this.camera);
      STATS.calls += renderer.info.render.calls;
      if (this.reveal < 1) this.veil(renderer);
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
    if (ready) this.remember(camera, toOutlook);
    if (STATS.on && ready) {
      STATS.renders++;
      STATS.ms += performance.now() - started;
    }
  }

  /**
   * Whether the pane's picture from its last render still stands: rendered for this very camera (not moved, same lens)
   * and this mapping into the outlook, less than `REUSE_FOR` ago, at this size, and nothing rendered over its rectangle
   * since (another pane of the view, in another plane, shares the picture).
   */
  private reusable(record: PaneRecord, camera: THREE.Camera, toOutlook: THREE.Matrix4): boolean {
    if (record.seq < 0 || performance.now() - record.renderedAt > REUSE_FOR * 1000) return false;
    if (!record.viewer.equals(camera.matrixWorld) || !record.projection.equals(camera.projectionMatrix) || !record.outlook.equals(toOutlook)) return false;
    const oldest = this.recent[0];
    if (!oldest || record.seq < oldest.seq) return false;
    for (const render of this.recent) if (render.seq > record.seq && overlaps(render.rect, record.rect)) return false;
    return true;
  }

  /** The render just made: every pane it covered keeps it (see `reusable`). */
  private remember(camera: THREE.Camera, toOutlook: THREE.Matrix4): void {
    const seq = ++this.seq;
    const rect = this.target.scissor.clone();
    this.recent.push({ seq, rect });
    if (this.recent.length > RECENT) this.recent.shift();
    const now = performance.now();
    for (const pane of this.covered) {
      const record = this.records.get(pane);
      if (!record) continue;
      record.seq = seq;
      record.renderedAt = now;
      record.rect.copy(rect);
      record.viewer.copy(camera.matrixWorld);
      record.projection.copy(camera.projectionMatrix);
      record.outlook.copy(toOutlook);
    }
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
    if (this.target.width === width && this.target.height === height) return;
    this.target.setSize(width, height);
    // A new size: nothing kept is the right size any more.
    this.recent.length = 0;
  }

  /** The main camera, carried into the outlook's frame: same lens, same place relative to the window. */
  private placeCamera(camera: THREE.PerspectiveCamera, toOutlook: THREE.Matrix4): void {
    const c = this.camera;
    c.matrixWorld.multiplyMatrices(toOutlook, camera.matrixWorld);
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
  private scissorTo(pane: THREE.Mesh, camera: THREE.Camera, record: PaneRecord): void {
    const target = this.target;
    target.scissorTest = true;
    this.covered.clear();
    this.covered.add(pane);
    // Only panes seeing the outlook through the same mapping can share a render (one camera placed for all of them).
    const sameWay = (other: THREE.Mesh): boolean => this.records.get(other)?.toOutlook === record.toOutlook;
    if (record.surround) {
      target.scissor.set(0, 0, target.width, target.height);
      return;
    }
    if (!this.rectOf(pane, camera, RECT)) {
      target.scissor.set(0, 0, target.width, target.height);
      for (const other of this.panes) if (other !== pane && sameWay(other) && this.sharesPlane(other, pane)) this.covered.add(other);
      return;
    }
    UNION.copy(RECT);
    let own = area(RECT);
    for (const other of this.panes) {
      if (other === pane || !sameWay(other) || !this.sharesPlane(other, pane) || !this.rectOf(other, camera, OTHER)) continue;
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
  private clipAt(pane: THREE.Mesh, toOutlook: THREE.Matrix4, open: boolean): void {
    const plane = this.clipPlanes[0]!;
    // Out in the open: nothing to clip (a plane far behind the eye, so the programs stay the ones with a clip plane).
    if (open) {
      plane.set(NORMAL.set(0, 1, 0), 1e6);
      return;
    }
    // The pane faces the room (+z local): the outside is along its -z.
    NORMAL.set(0, 0, -1).transformDirection(pane.matrixWorld);
    pane.getWorldPosition(CORNER);
    plane.setFromNormalAndCoplanarPoint(NORMAL, CORNER).applyMatrix4(toOutlook);
  }
}

/**
 * `material` looks its map up where the fragment lies on screen: its own clip position (the portal's camera is the
 * main one carried into the outlook, so a point of the pane lands on the picture where it lands on screen), plus
 * `grey` (the glass's dust and own reflection).
 */
function screenSampled(material: THREE.MeshBasicMaterial, grey: number): THREE.MeshBasicMaterial {
  patchShader(material, grey > 0 ? 'outlookPane' : 'outlookOpen', (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvOutlookClip = gl_Position;');
    shader.vertexShader = 'varying vec4 vOutlookClip;\n' + shader.vertexShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `vec4 sampledDiffuseColor = texture2D(map, vOutlookClip.xy / vOutlookClip.w * 0.5 + 0.5);\ndiffuseColor.rgb *= sampledDiffuseColor.rgb;\ndiffuseColor.rgb += ${grey.toFixed(3)};`,
    );
    shader.fragmentShader = 'varying vec4 vOutlookClip;\n' + shader.fragmentShader;
  });
  return material;
}

/** The veil over a view coming through (`veil`): one quad over the whole target, seen by a camera of its own. */
const VEIL_MATERIAL = markShared(new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
const VEIL_SCENE = new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), VEIL_MATERIAL));
const VEIL_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
const NO_PLANES: THREE.Plane[] = [];

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

interface PaneRecord {
  toOutlook: ToOutlook;
  /** An open-air surround (`surround`): the whole picture, unclipped. */
  surround: boolean;
  /** The render its picture comes from (-1: none yet), when, over what rectangle, from where and through what mapping. */
  seq: number;
  renderedAt: number;
  rect: THREE.Vector4;
  viewer: THREE.Matrix4;
  projection: THREE.Matrix4;
  outlook: THREE.Matrix4;
}

/** Whether two pixel rectangles (x, y, width, height) share any pixel. */
function overlaps(a: THREE.Vector4, b: THREE.Vector4): boolean {
  return a.x < b.x + b.z && b.x < a.x + a.z && a.y < b.y + b.w && b.y < a.y + a.w;
}

/**
 * `?stats`: what the views through the windows cost, every 2 s on the console next to the frame's own line: the
 * renders a second, their draw calls and CPU time each, and how many pane draws reused a kept picture.
 */
const STATS = { on: flag('stats'), renders: 0, calls: 0, ms: 0, reused: 0 };
if (STATS.on) {
  setInterval(() => {
    if (STATS.renders + STATS.reused === 0) return;
    const per = Math.max(1, STATS.renders);
    console.log(`[stats] outlook ${(STATS.renders / 2).toFixed(0)} renders/s | ${(STATS.calls / per).toFixed(0)} draw calls and ${(STATS.ms / per).toFixed(2)} ms CPU each | ${(STATS.reused / 2).toFixed(0)} reused/s`);
    STATS.renders = STATS.calls = STATS.ms = STATS.reused = 0;
  }, 2000);
}

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
