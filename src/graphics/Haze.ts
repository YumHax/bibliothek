import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Look } from './grade';
import { dampFactor } from '@/math/damp';

/** Per second: walking into the arcade thickens the air over a second or so. */
const RATE = 1.2;
/** The haze is lit by the room: at `level` 0 only this share of its colour remains. */
const DARK_SHARE = 0.12;

/** Each scene's haze, for the zone content that drives the air itself (`Haze.of`). */
const HAZES = new WeakMap<THREE.Scene, Haze>();

/**
 * The air of the big halls: an exponential fog whose density and colour follow the zone's look
 * (none in the flat). The fog stays in the scene at density 0 rather than coming and going, so
 * no material recompiles at a doorway. Its colour is scaled by how lit the room is (`level`),
 * so the haze of a hall at night is dark, not a grey glow.
 *
 * The one writer of `scene.fog`: an outdoor zone whose air follows the weather (the street) hands
 * its density and colour over with `setAir` every frame it is occupied, and `setAir(null)` when the
 * player leaves; the fog eases to either at the same rate, so walking out of the sas thickens the
 * air instead of popping it.
 */
export class Haze implements Updatable {
  private readonly fog = new THREE.FogExp2(0x000000, 0);
  private readonly targetColor = new THREE.Color(0x000000);
  private targetDensity = 0;
  /** The outdoor air (`setAir`), or null: the look's haze, lit by the room. */
  private air: { density: number; color: THREE.Color } | null = null;
  private readonly airColor = new THREE.Color();
  private readonly wanted = new THREE.Color();

  /** The haze of `scene`, if it has one (for content that drives the air: `StreetLighting`). */
  static of(scene: THREE.Scene): Haze | null {
    return HAZES.get(scene) ?? null;
  }

  constructor(
    scene: THREE.Scene,
    private readonly level: () => number,
  ) {
    scene.fog = this.fog;
    HAZES.set(scene, this);
  }

  setLook(look: Look, snap = false): void {
    this.targetColor.set(look.haze.color);
    this.targetDensity = look.haze.density;
    if (snap) this.settle();
  }

  /** The outdoor air to ease to instead of the look's haze (colour as is, not scaled by the room's light), or null to give it back. */
  setAir(density: number, color: THREE.Color): void;
  setAir(air: null): void;
  setAir(density: number | null, color?: THREE.Color): void {
    if (density === null || !color) {
      this.air = null;
      return;
    }
    this.air = { density, color: this.airColor.copy(color) };
  }

  /** At once where the easing is heading (behind a travel's curtain). */
  settle(): void {
    this.fog.density = this.wantedDensity();
    this.fog.color.copy(this.wantedColor());
  }

  update(dt: number): void {
    const t = dampFactor(RATE, dt);
    this.fog.density += (this.wantedDensity() - this.fog.density) * t;
    this.fog.color.lerp(this.wantedColor(), t);
  }

  private wantedDensity(): number {
    return this.air ? this.air.density : this.targetDensity;
  }

  private wantedColor(): THREE.Color {
    if (this.air) return this.wanted.copy(this.air.color);
    const lit = THREE.MathUtils.lerp(DARK_SHARE, 1, THREE.MathUtils.clamp(this.level(), 0, 1));
    return this.wanted.copy(this.targetColor).multiplyScalar(lit);
  }
}
