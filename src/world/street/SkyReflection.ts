import * as THREE from 'three';
import type { ReflectionSource } from '@/graphics/Environment';

/**
 * Real seconds between two prefilters of the sky: a game hour is about 25 real seconds, so not more often than the
 * sky moves. A strike's flash is not caught.
 */
const REFRESH_EVERY = 20;
/** How long after the zone unloads its maps are freed (well past `Environment`'s swap dip). */
const FREE_AFTER_MS = 3000;
/** The prefilter's far plane (m): the rows down the street, past the dome (the dome is drawn on the far plane anyway). */
const FAR = 220;

/** The street's rows in the reflection: their facades lit flat by the sky and sun, their lit windows added at night. */
interface MirroredRows {
  source: THREE.Mesh;
  group: THREE.Group;
  meshes: THREE.Mesh[];
  base: THREE.MeshBasicMaterial;
  night: THREE.MeshBasicMaterial;
  /** Prefiltered again once the eye has walked this far (m) from where the last one was taken. */
  moveEvery: number;
}

/**
 * What the street reflects: its own sky dome (the same material, so the same sky, clouds, far city
 * and sun), prefiltered into a PMREM every `REFRESH_EVERY` seconds while the player is out here, in
 * place of the flat's studio room (`Environment`, through `setReflectionSource`). The dome's shader
 * reads its direction from the vertex position, so a copy at the origin of a scene of its own
 * renders the sky as the player sees it. With `withRows` (the walkable street, not on low) the
 * street's own facades stand in it too, round the eye (their atlas, lit flat as the sky and the
 * sun light them, their lit windows added at night: `light`): the row across the street shows in
 * the shop glass and the windows, the cars' paint and the wet setts, and the map is taken again
 * once the eye has walked `moveEvery` metres. Each new map replaces the last (same size: no recompile).
 */
export class SkyReflection implements ReflectionSource {
  private readonly scene = new THREE.Scene();
  private generator: THREE.PMREMGenerator | null = null;
  private target: THREE.WebGLRenderTarget | null = null;
  /** The map before `target`: still the scene's environment until `Environment` swaps under its dip. */
  private previous: THREE.WebGLRenderTarget | null = null;
  /** The map before `previous`, done with: the next prefilter is written into it (no new target per refresh). */
  private spare: THREE.WebGLRenderTarget | null = null;
  private clock = REFRESH_EVERY;
  private rows: MirroredRows | null = null;
  /** Where the eye is (world) and where the last map was taken from. */
  private readonly eye = new THREE.Vector3();
  private readonly takenAt = new THREE.Vector3(Infinity, 0, 0);

  constructor(dome: THREE.Mesh) {
    const copy = new THREE.Mesh(dome.geometry, dome.material);
    copy.frustumCulled = false;
    this.scene.add(copy);
  }

  /** The street's facades (`Buildings`: one mesh, its atlas and night atlas) stand in the reflection too. */
  withRows(buildings: THREE.Mesh, moveEvery: number): void {
    const material = buildings.material as THREE.MeshStandardMaterial;
    const base = new THREE.MeshBasicMaterial({ map: material.map, color: 0x000000 });
    const night = new THREE.MeshBasicMaterial({ map: material.emissiveMap, color: 0x000000, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const group = new THREE.Group();
    const meshes = [base, night].map((m, i) => {
      const mesh = new THREE.Mesh(buildings.geometry, m);
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = i;
      group.add(mesh);
      return mesh;
    });
    this.scene.add(group);
    this.rows = { source: buildings, group, meshes, base, night, moveEvery };
  }

  /**
   * Where the eye is (world) and how the rows are lit now: `facade` the light on a wall (the sky's and the sun's,
   * over pi: what a white wall gives back), `windows` how bright the lit windows are (the facades' own emissive).
   */
  light(eye: THREE.Vector3, facade: THREE.Color, windows: number): void {
    this.eye.copy(eye);
    if (!this.rows) return;
    this.rows.base.color.copy(facade);
    this.rows.night.color.setScalar(windows);
  }

  update(renderer: THREE.WebGLRenderer, dt: number): THREE.Texture | null {
    this.clock += dt;
    const walked = this.rows !== null && this.eye.distanceToSquared(this.takenAt) > this.rows.moveEvery * this.rows.moveEvery;
    if (this.target && this.clock < REFRESH_EVERY && !walked) return this.target.texture;
    this.clock = 0;
    if (this.rows) {
      // The cube is taken at the scene's origin: the rows are moved so the eye stands there.
      this.takenAt.copy(this.eye);
      this.rows.group.position.copy(this.eye).negate();
      this.rows.source.updateWorldMatrix(true, false);
      for (const mesh of this.rows.meshes) mesh.matrix.copy(this.rows.source.matrixWorld);
      this.rows.group.updateMatrixWorld(true);
    }
    this.generator ??= this.recycling(new THREE.PMREMGenerator(renderer));
    const next = this.generator.fromScene(this.scene, 0, 0.1, FAR);
    // The last map stays the scene's environment until `Environment` swaps the new one in under a
    // short dip: kept for one more refresh; the one before it is written into next time (`spare`).
    if (this.spare !== next) this.spare?.dispose();
    this.spare = this.previous;
    this.previous = this.target;
    this.target = next;
    return next.texture;
  }

  /**
   * `generator` writing each prefilter into `spare` (three 0.169's `fromScene` takes no target of ours: its own
   * allocation, `_allocateTargets`, is wrapped, and the fresh target it makes, never drawn into, is dropped for the
   * spare of the same size): three targets in turn, none allocated after the first refreshes.
   */
  private recycling(generator: THREE.PMREMGenerator): THREE.PMREMGenerator {
    const inner = generator as unknown as { _allocateTargets: () => THREE.WebGLRenderTarget };
    const allocate = inner._allocateTargets.bind(generator);
    inner._allocateTargets = () => {
      const fresh = allocate();
      const spare = this.spare;
      if (!spare || spare.width !== fresh.width || spare.height !== fresh.height) return fresh;
      fresh.dispose();
      this.spare = null;
      return spare;
    };
    return generator;
  }

  /** Next time out here, prefiltered afresh. */
  reset(): void {
    this.clock = REFRESH_EVERY;
    this.takenAt.set(Infinity, 0, 0);
  }

  dispose(): void {
    // `Environment` swaps the look's map back in under a dip, not at once: the last map may still be
    // the scene's environment for a few frames after the zone unloads (a freed one reads black).
    const [target, previous, spare, generator] = [this.target, this.previous, this.spare, this.generator];
    this.target = this.previous = this.spare = this.generator = null;
    this.rows?.base.dispose();
    this.rows?.night.dispose();
    this.rows = null;
    setTimeout(() => { // convention-ok: frees after the renderer's dip; nothing ticks a disposed zone
      target?.dispose();
      previous?.dispose();
      spare?.dispose();
      generator?.dispose();
    }, FREE_AFTER_MS);
  }
}
