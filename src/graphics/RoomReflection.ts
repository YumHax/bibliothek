import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ReflectionSource } from './Environment';

/** Side of the capture's cube faces (texels): reflections are blurred by roughness anyway. */
const CUBE_SIZE = 128;
/** Every this many texels along a face's side, one is read to measure the capture's brightness. */
const MEASURE_STRIDE = 8;
/** How far the capture's energy is brought towards the studio's (`Environment`'s strengths were tuned on it): clamped share. */
const GAIN_MIN = 0.25;
const GAIN_MAX = 4;
/** Seconds after the room was asked to recapture (a lamp switched, the zone just in) before it does: the light settles first. */
const DEFAULT_DELAY = 0.6;

/** The studio room's mean luminance, measured once (the yardstick every room's capture is scaled to). */
let studioMean: number | null = null;

/**
 * What a room really reflects (medium, high): the room itself, captured once from its middle at eye
 * height into a small cube and prefiltered (PMREM), as the scene's environment in place of the
 * studio box while the player is in it (`Environment`, through `setReflectionSource`). The parquet,
 * the glossy boxes and the glass then show the room's windows, lamps and walls.
 *
 * Its brightness is measured (an async read of the cube) and brought to the studio map's, so the
 * strengths tuned on the studio (`Environment`, `Look.reflections`) still hold and only the picture
 * changes: `gain()`. Captured again on `invalidate` (a lamp switched, the curtains drawn, the day
 * moving on), a short while later; two maps alternate so the one shown stays valid until
 * `Environment` swaps the new one in under its dip. Free of cost while nothing changes.
 */
export class RoomReflection implements ReflectionSource {
  private readonly cube = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, { type: THREE.HalfFloatType, generateMipmaps: false });
  private readonly camera = new THREE.CubeCamera(0.05, 40, this.cube);
  private generator: THREE.PMREMGenerator | null = null;
  /** The two prefiltered maps, alternating; `shown` indexes the one handed out. */
  private readonly maps: [THREE.WebGLRenderTarget | null, THREE.WebGLRenderTarget | null] = [null, null];
  private shown = -1;
  private gainValue = 1;
  private wait = DEFAULT_DELAY;
  private dirty = true;
  private busy = false;
  private disposed = false;
  private readonly at = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    /** World point the room is seen from (its middle, at eye height). */
    private readonly eye: (out: THREE.Vector3) => THREE.Vector3,
  ) {}

  /** The room changed (a lamp, the curtains, the light outside): captured again `delay` seconds from now. */
  invalidate(delay = DEFAULT_DELAY): void {
    if (this.dirty) return;
    this.dirty = true;
    this.wait = delay;
  }

  /** The factor that brings this capture's brightness to the studio map's. */
  gain(): number {
    return this.gainValue;
  }

  update(renderer: THREE.WebGLRenderer, dt: number): THREE.Texture | null {
    if (this.dirty && !this.busy) {
      this.wait -= dt;
      if (this.wait <= 0) this.capture(renderer);
    }
    return this.shown >= 0 ? (this.maps[this.shown]?.texture ?? null) : null;
  }

  dispose(): void {
    this.disposed = true;
    // `Environment` may still show the last map for a moment (it swaps the look's back under a dip): freed after.
    const [a, b, generator] = [this.maps[0], this.maps[1], this.generator];
    this.maps[0] = this.maps[1] = null;
    this.shown = -1;
    setTimeout(() => { // convention-ok: frees after the environment's swap dip; nothing ticks a disposed room
      a?.dispose();
      b?.dispose();
      generator?.dispose();
      this.cube.dispose();
    }, 3000);
  }

  private capture(renderer: THREE.WebGLRenderer): void {
    this.dirty = false;
    this.busy = true;
    // The yardstick first (it uses the same cube), then the room.
    studioMean ??= measureStudio(renderer, this.camera);
    this.camera.position.copy(this.eye(this.at));
    this.camera.updateMatrixWorld(true);
    const autoUpdate = renderer.shadowMap.autoUpdate;
    // The shadow maps stay as they are: six renders from the middle of the room need none of their own.
    renderer.shadowMap.autoUpdate = false;
    // A `Reflector` (mirror, glossy floor) renders from its `onBeforeRender` and then sets the cube back as the
    // target without its face: the rest of that face would land on face 0. Hidden for the capture.
    const mirrors: THREE.Object3D[] = [];
    this.scene.traverseVisible((o) => {
      if ((o as { isReflector?: boolean }).isReflector) mirrors.push(o);
    });
    for (const mirror of mirrors) mirror.visible = false;
    try {
      this.camera.update(renderer, this.scene);
    } finally {
      renderer.shadowMap.autoUpdate = autoUpdate;
      for (const mirror of mirrors) mirror.visible = true;
    }
    void meanLuminance(renderer, this.cube).then((mean) => {
      this.busy = false;
      if (this.disposed) return;
      this.gainValue = mean > 1e-5 && studioMean ? THREE.MathUtils.clamp(studioMean / mean, GAIN_MIN, GAIN_MAX) : 1;
      this.generator ??= new THREE.PMREMGenerator(renderer);
      const next = this.shown === 0 ? 1 : 0;
      this.maps[next] = this.generator.fromCubemap(this.cube.texture, this.maps[next]);
      this.maps[next]!.texture.name = 'RoomReflection';
      this.shown = next;
    });
  }
}

/** The mean luminance of `cube`'s six faces, read back sparsely (0 if the read is refused). */
async function meanLuminance(renderer: THREE.WebGLRenderer, cube: THREE.WebGLCubeRenderTarget): Promise<number> {
  const size = cube.width;
  const pixels = new Uint16Array(size * size * 4);
  let sum = 0;
  let count = 0;
  try {
    for (let face = 0; face < 6; face++) {
      await renderer.readRenderTargetPixelsAsync(cube, 0, 0, size, size, pixels, face);
      for (let y = MEASURE_STRIDE / 2; y < size; y += MEASURE_STRIDE) {
        for (let x = MEASURE_STRIDE / 2; x < size; x += MEASURE_STRIDE) {
          const i = (y * size + x) * 4;
          const r = THREE.DataUtils.fromHalfFloat(pixels[i]!);
          const g = THREE.DataUtils.fromHalfFloat(pixels[i + 1]!);
          const b = THREE.DataUtils.fromHalfFloat(pixels[i + 2]!);
          sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
          count++;
        }
      }
    }
  } catch {
    return 0;
  }
  return count ? sum / count : 0;
}

/**
 * The studio's mean luminance (`Environment`'s `RoomEnvironment`, untinted), captured once into the
 * camera's cube and read synchronously (a one-off, before the first room's capture). Null if it cannot be read.
 */
function measureStudio(renderer: THREE.WebGLRenderer, camera: THREE.CubeCamera): number | null {
  const cube = camera.renderTarget;
  const studio = new RoomEnvironment();
  camera.position.set(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.update(renderer, studio);
  const size = cube.width;
  const pixels = new Uint16Array(size * size * 4);
  let sum = 0;
  let count = 0;
  try {
    for (let face = 0; face < 6; face++) {
      renderer.readRenderTargetPixels(cube, 0, 0, size, size, pixels, face);
      for (let y = MEASURE_STRIDE / 2; y < size; y += MEASURE_STRIDE) {
        for (let x = MEASURE_STRIDE / 2; x < size; x += MEASURE_STRIDE) {
          const i = (y * size + x) * 4;
          sum += 0.2126 * THREE.DataUtils.fromHalfFloat(pixels[i]!) + 0.7152 * THREE.DataUtils.fromHalfFloat(pixels[i + 1]!) + 0.0722 * THREE.DataUtils.fromHalfFloat(pixels[i + 2]!);
          count++;
        }
      }
    }
  } catch {
    return null;
  } finally {
    studio.dispose();
  }
  return count ? sum / count : null;
}
