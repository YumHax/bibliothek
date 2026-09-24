import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Look } from './grade';

/** Per second: walking into the arcade thickens the air over a second or so. */
const RATE = 1.2;
/** The haze is lit by the room: at `level` 0 only this share of its colour remains. */
const DARK_SHARE = 0.12;

/**
 * The air of the big halls: an exponential fog whose density and colour follow the zone's look
 * (none in the flat). The fog stays in the scene at density 0 rather than coming and going, so
 * no material recompiles at a doorway. Its colour is scaled by how lit the room is (`level`),
 * so the haze of a hall at night is dark, not a grey glow.
 */
export class Haze implements Updatable {
  private readonly fog = new THREE.FogExp2(0x000000, 0);
  private readonly targetColor = new THREE.Color(0x000000);
  private readonly baseColor = new THREE.Color(0x000000);
  private targetDensity = 0;

  constructor(
    scene: THREE.Scene,
    private readonly level: () => number,
  ) {
    scene.fog = this.fog;
  }

  setLook(look: Look, snap = false): void {
    this.targetColor.set(look.haze.color);
    this.targetDensity = look.haze.density;
    if (snap) {
      this.baseColor.copy(this.targetColor);
      this.fog.density = this.targetDensity;
    }
  }

  update(dt: number): void {
    const t = 1 - Math.exp(-RATE * dt);
    this.fog.density += (this.targetDensity - this.fog.density) * t;
    this.baseColor.lerp(this.targetColor, t);
    const lit = THREE.MathUtils.lerp(DARK_SHARE, 1, THREE.MathUtils.clamp(this.level(), 0, 1));
    this.fog.color.copy(this.baseColor).multiplyScalar(lit);
  }
}
