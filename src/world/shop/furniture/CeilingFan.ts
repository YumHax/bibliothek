import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint, timber, METAL } from '../../materials/palette';
import { hangFromCeiling } from '../common/ceilingDrop';

export interface CeilingFanOptions {
  /** The down-rod's length. Default 0.35. */
  drop?: number;
  /** Blade tip radius, metres. Default 0.6. */
  radius?: number;
  blades?: number;
  /** Turns a second. Default 0.35: a lazy summer turn. */
  speed?: number;
}

/**
 * An old ceiling fan turning slowly over the showroom: a brass down-rod and motor housing, cane-and-wood blades.
 * Always on, like the shop's radio. Ceiling-hung: origin on the ceiling. Decoration: never collides; its blades
 * turn (an `Updatable`, so they stay a few draws of their own).
 */
export class CeilingFan extends Prop implements Updatable {
  private readonly rotor = new THREE.Group();
  private readonly speed: number;

  constructor(options: CeilingFanOptions = {}) {
    super();
    this.name = 'CeilingFan';
    const radius = options.radius ?? 0.6;
    const blades = options.blades ?? 5;
    this.speed = (options.speed ?? 0.35) * Math.PI * 2;
    const brass = METAL.brass();
    const y = hangFromCeiling(this, options.drop ?? 0.35, 'rod');
    this.add(cylinderMesh(0.09, 0.12, brass, { y: y - 0.06 }, { radiusBottom: 0.11, segments: 20 }));
    this.add(cylinderMesh(0.05, 0.05, paint(0xf2ecdc, 0.6), { y: y - 0.145 }, { radiusBottom: 0.035, segments: 16 }));
    this.rotor.position.y = y - 0.1;
    const wood = timber(0x6a4a30, 0.5);
    const cane = paint(0xc9a86a, 0.9);
    for (let i = 0; i < blades; i++) {
      const arm = new THREE.Group();
      arm.rotation.y = (i / blades) * Math.PI * 2;
      const length = radius - 0.1;
      part(arm, 0.14, 0.012, 0.05, brass, { x: 0.1 + 0.03, y: 0 });
      // Pitched a little, as a blade is.
      const blade = part(arm, length, 0.01, 0.13, wood, { x: 0.12 + length / 2, y: -0.005 });
      blade.rotation.x = 0.12;
      const panel = part(arm, length - 0.08, 0.004, 0.09, cane, { x: 0.12 + length / 2, y: 0.003 });
      panel.rotation.x = 0.12;
      this.rotor.add(arm);
    }
    this.add(this.rotor);
    this.traverse((o) => (o.castShadow = false));
  }

  update(dt: number): void {
    this.rotor.rotation.y = (this.rotor.rotation.y + this.speed * dt) % (Math.PI * 2);
  }
}
