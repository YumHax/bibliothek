import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { cylinderMesh } from '../meshUtils';
import { Prop, matte } from './Prop';

export interface SmokeDetectorOptions {
  /** Seconds between two blinks of the standby LED. Default 4. */
  period?: number;
}

const RADIUS = 0.06;
const HEIGHT = 0.03;
const BLINK = 0.1;
const BODY = matte(0xf6f3ee, 0.6);

/**
 * A smoke detector on the ceiling: a white puck with a ring of vents and a standby LED that
 * blinks red once every few seconds, the way the real thing does at night. Origin at the ceiling;
 * hangs down along -y. Decoration only; casts nothing and never collides.
 */
export class SmokeDetector extends Prop implements Updatable {
  private readonly led: THREE.MeshStandardMaterial;
  private readonly period: number;
  private timer: number;

  constructor(options: SmokeDetectorOptions = {}) {
    super();
    this.name = 'SmokeDetector';
    this.period = options.period ?? 4;
    this.timer = Math.random() * this.period;
    const puck = cylinderMesh(RADIUS, HEIGHT, BODY, { y: -HEIGHT / 2 }, { radiusBottom: RADIUS * 0.85, segments: 28 });
    puck.castShadow = false;
    this.add(puck);
    const vents = cylinderMesh(RADIUS * 0.55, 0.004, matte(0xd8d3c8, 0.8), { y: -HEIGHT - 0.002 }, { segments: 20 });
    vents.castShadow = false;
    this.add(vents);
    this.led = new THREE.MeshStandardMaterial({ color: 0x5a1a1a, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.4 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), this.led);
    led.position.set(RADIUS * 0.7, -HEIGHT - 0.003, 0);
    led.castShadow = false;
    this.add(led);
  }

  update(dt: number): void {
    this.timer += dt;
    if (this.timer >= this.period) this.timer -= this.period;
    this.led.emissiveIntensity = this.timer < BLINK ? 2.5 : 0;
  }
}
