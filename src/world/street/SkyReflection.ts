import * as THREE from 'three';
import type { ReflectionSource } from '@/graphics/Environment';

/**
 * Real seconds between two prefilters of the sky: a game hour is about 25 real seconds, and each prefilter
 * allocates a fresh target (three 0.169's `fromScene` cannot reuse one), so not more often than the sky moves.
 * A strike's flash is not caught.
 */
const REFRESH_EVERY = 20;
/** How long after the zone unloads its maps are freed (well past `Environment`'s swap dip). */
const FREE_AFTER_MS = 3000;

/**
 * What the street reflects: its own sky dome (the same material, so the same sky, clouds, far city
 * and sun), prefiltered into a PMREM every `REFRESH_EVERY` seconds while the player is out here, in
 * place of the flat's studio room (`Environment`, through `setReflectionSource`). The dome's shader
 * reads its direction from the vertex position, so a copy at the origin of a scene of its own
 * renders the sky as the player sees it. Each new map replaces the last (same size: no recompile).
 */
export class SkyReflection implements ReflectionSource {
  private readonly scene = new THREE.Scene();
  private generator: THREE.PMREMGenerator | null = null;
  private target: THREE.WebGLRenderTarget | null = null;
  /** The map before `target`: still the scene's environment until `Environment` swaps under its dip. */
  private previous: THREE.WebGLRenderTarget | null = null;
  private clock = REFRESH_EVERY;

  constructor(dome: THREE.Mesh) {
    const copy = new THREE.Mesh(dome.geometry, dome.material);
    copy.frustumCulled = false;
    this.scene.add(copy);
  }

  update(renderer: THREE.WebGLRenderer, dt: number): THREE.Texture | null {
    this.clock += dt;
    if (this.target && this.clock < REFRESH_EVERY) return this.target.texture;
    this.clock = 0;
    this.generator ??= new THREE.PMREMGenerator(renderer);
    const next = this.generator.fromScene(this.scene, 0, 0.1, 100);
    // The last map stays the scene's environment until `Environment` swaps the new one in under a
    // short dip: kept alive for one more refresh, the one before it freed.
    this.previous?.dispose();
    this.previous = this.target;
    this.target = next;
    return next.texture;
  }

  /** Next time out here, prefiltered afresh. */
  reset(): void {
    this.clock = REFRESH_EVERY;
  }

  dispose(): void {
    // `Environment` swaps the look's map back in under a dip, not at once: the last map may still be
    // the scene's environment for a few frames after the zone unloads (a freed one reads black).
    const [target, previous, generator] = [this.target, this.previous, this.generator];
    this.target = this.previous = this.generator = null;
    setTimeout(() => {
      target?.dispose();
      previous?.dispose();
      generator?.dispose();
    }, FREE_AFTER_MS);
  }
}
