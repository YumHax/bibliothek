import * as THREE from 'three';
import { Prop, part, matte } from './Prop';

export interface PhoneOptions {
  /** Colour of the case. */
  color?: number;
  /** How far the charging cable runs back from the phone's bottom edge (-z) to the edge of what it lies on, then drops. */
  cableRun?: number;
}

const W = 0.072;
const L = 0.15;
const T = 0.008;
/** The charge LED after dark (a faint green dot), and the lock screen's faint glow. */
const LED_NIGHT = 2.2;
const SCREEN_NIGHT = 0.08;

const GLASS = new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.15, metalness: 0.2 });
const CABLE = matte(0xeeeeea, 0.5);

/**
 * A phone lying face up on charge: a slim case, the dark glass, a white cable out of its bottom
 * edge running back over the top and down its far edge. After dark (`setNight`, the builder wires
 * the clock) a tiny green LED glows at its top and the lock screen gives off the faintest light:
 * emissive only, no light of its own. Origin under its middle, the bottom edge (cable) towards -z.
 */
export class Phone extends Prop {
  private readonly led: THREE.MeshStandardMaterial;
  private readonly screen: THREE.MeshStandardMaterial;

  constructor(options: PhoneOptions = {}) {
    super();
    this.name = 'Phone';
    const run = options.cableRun ?? 0.1;
    part(this, W, T, L, matte(options.color ?? 0x2c3440, 0.45), { y: T / 2 });
    // Own materials: the glow is per phone.
    this.screen = new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.15, metalness: 0.2, emissive: 0x9fb4ff, emissiveIntensity: 0 });
    part(this, W - 0.006, 0.001, L - 0.012, this.screen, { y: T + 0.0005 });
    part(this, 0.012, 0.0012, 0.002, GLASS, { y: T + 0.001, z: L / 2 - 0.006 }); // the earpiece slot
    this.led = new THREE.MeshStandardMaterial({ color: 0x1a3a1a, emissive: 0x5cff7a, emissiveIntensity: 0 });
    part(this, 0.003, 0.0014, 0.003, this.led, { x: W / 2 - 0.012, y: T + 0.001, z: L / 2 - 0.006 });

    // The cable: out of the bottom edge, along the top to the far edge, then down it.
    part(this, 0.008, 0.005, 0.012, CABLE, { y: T / 2, z: -L / 2 - 0.006 });
    part(this, 0.004, 0.004, run, CABLE, { y: 0.002, z: -L / 2 - 0.012 - run / 2 });
    part(this, 0.004, 0.12, 0.004, CABLE, { y: -0.058, z: -L / 2 - 0.012 - run - 0.002 });

    this.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = false;
    });
  }

  setNight(night: boolean): void {
    this.led.emissiveIntensity = night ? LED_NIGHT : 0;
    this.screen.emissiveIntensity = night ? SCREEN_NIGHT : 0;
  }
}
