import * as THREE from 'three';
import { additiveOne } from '../materials/blend';
import { markShared } from '../materials/sharedResources';
import vertexShader from './lampHalo.vert.glsl?raw';
import fragmentShader from './lampHalo.frag.glsl?raw';

/** Across (m) a lamp's halo, and how bright its centre is at full level (times the light's colour). */
const HALO_SIZE = 0.55;
const HALO_STRENGTH = 0.35;

const quad = markShared(new THREE.PlaneGeometry(1, 1));

/**
 * A soft glow round a lit bulb where there is no bloom to give one (`low`): a camera-facing quad at
 * the lamp's light, in its colour, added with the canvas alpha kept (docs/graphics.md), like the
 * street lamps' halos. `SwitchableLamp` makes one per light of the lamp and sets it with its level.
 * Not clickable, not a z-fighting surface, never culled by its 1 m plane's bounds.
 */
export class LampHalo extends THREE.Mesh {
  private readonly base: THREE.Color;
  private readonly glow: THREE.IUniform<THREE.Color>;

  constructor(color: THREE.Color, size = HALO_SIZE) {
    const glow = { value: new THREE.Color() };
    super(
      quad,
      additiveOne(
        new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms: { size: { value: size }, glow },
          depthWrite: false,
        }),
      ),
    );
    this.name = 'LampHalo';
    this.base = color.clone();
    this.glow = glow;
    this.frustumCulled = false;
    this.castShadow = false;
    this.receiveShadow = false;
    this.userData.zfightIgnore = true;
    this.visible = false;
  }

  /** The lamp's level, 0 dark .. 1 lit. */
  set(level: number): void {
    this.glow.value.copy(this.base).multiplyScalar(level * HALO_STRENGTH);
    this.visible = level > 0.01;
  }

  override raycast(): void {
    // A glow, not a thing: the crosshair goes through it.
  }
}
