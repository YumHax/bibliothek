import * as THREE from 'three';
import { paint } from '../../materials/palette';
import { cylinderMesh } from '../../meshUtils';

/** A candle's sizes (m): the saucer, the wax, the flame over the wick. */
const SAUCER = { radius: 0.06, height: 0.012 };
const WAX = { radius: 0.017, height: 0.11 };
const FLAME = { radius: 0.007, height: 0.026 };
/** The flame's tip over the candle's foot: where its light stands (`StairLights.setCandles`). */
export const FLAME_Y = SAUCER.height + WAX.height + FLAME.height * 0.6;

const FLAME_COLOUR = new THREE.Color(0xffc070);

/**
 * A household candle on a saucer, lit: wax, a wick and its flame, which wavers (`flicker`) and casts no light of its
 * own (the stairwell's two real lights stand over the nearest flames). Origin at the saucer's foot. The flame's
 * material is its own (its colour wavers), the rest come from the palette.
 */
export class Candle extends THREE.Group {
  private readonly flame: THREE.Mesh;
  /** Its own (not the palette's shared one): its colour wavers. */
  private readonly flameMaterial = new THREE.MeshBasicMaterial({ color: FLAME_COLOUR });
  private readonly phase: number;

  constructor(seed: number) {
    super();
    this.name = 'Candle';
    this.phase = seed * 1.7;
    const saucer = cylinderMesh(SAUCER.radius, SAUCER.height, paint(0xe8e2d6, 0.4), { y: SAUCER.height / 2 }, { segments: 16 });
    const wax = cylinderMesh(WAX.radius, WAX.height, paint(0xf2ead8, 0.7), { y: SAUCER.height + WAX.height / 2 }, { segments: 12 });
    // The flame is its own mesh (cylinderMesh geometries are shared: never scaled in place, only the mesh is).
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(FLAME.radius, FLAME.height, 8), this.flameMaterial);
    this.flame.position.y = SAUCER.height + WAX.height + FLAME.height / 2 + 0.004;
    for (const mesh of [saucer, wax, this.flame]) {
      mesh.castShadow = false;
      mesh.receiveShadow = mesh !== this.flame;
      this.add(mesh);
    }
  }

  /** The flame's dance at time `t` (s). */
  flicker(t: number): void {
    const a = Math.sin(t * 13 + this.phase) * 0.5 + Math.sin(t * 29 + this.phase * 2) * 0.3;
    this.flame.scale.set(1 + 0.08 * a, 1 + 0.22 * a, 1 + 0.08 * a);
    this.flame.rotation.z = 0.08 * Math.sin(t * 7 + this.phase);
    this.flameMaterial.color.copy(FLAME_COLOUR).multiplyScalar(0.92 + 0.08 * a);
  }
}
