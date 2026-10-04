import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { paint, standard, timber } from '../materials/palette';
import { part } from './Prop';
import { nowPlaying } from '../screen/nowPlaying';
import { random } from '@/random';
import { damp } from '@/math/damp';

export interface SpeakerOptions {
  /** Height of the cabinet. Default 0.85 (a slim floor-stander). */
  height?: number;
  /** Cabinet veneer colour. Default walnut. */
  wood?: number;
}

const WIDTH = 0.2;
const DEPTH = 0.26;
const PLINTH = 0.03;
const BAFFLE = paint(0x1c1b1a, 0.85);
const CONE = paint(0x2a2826, 0.95);
const DUST_CAP = standard({ color: 0x3a3836, roughness: 0.3, metalness: 0 });
const DOME = standard({ color: 0xc9c4b8, roughness: 0.3, metalness: 1 });
/** The power LED's glow: dim while nothing plays, bright with a longplay on. */
const LED_IDLE = 0.25;
const LED_PLAYING = 1.6;
/** How far the woofer's cone moves at full loudness (m), and how fast it pumps (Hz, a slow beat and a quicker flutter). */
const PUMP = 0.0015;
const BEAT_HZ = 2.1;
const FLUTTER_HZ = 7.3;

/**
 * A slim floor-standing hi-fi speaker: a walnut cabinet on a black plinth, a black baffle with a
 * woofer, a mid driver and a tweeter, a tiny green power LED. Local origin is the centre of the
 * foot on the floor; the baffle faces +z. Collides at its cabinet. It follows the flat's screens
 * (`screen/nowPlaying`): the LED dim while nothing plays, the woofer pumping with the loudness.
 */
export class Speaker extends THREE.Group implements Furniture, Updatable {
  readonly footprint: THREE.Box3;
  private readonly led = new THREE.MeshStandardMaterial({ color: 0x6fd08a, emissive: 0x4fd070, emissiveIntensity: LED_IDLE, roughness: 0.4 });
  /** The woofer's cone and dust cap, moved together along z. */
  private readonly woofer = new THREE.Group();
  private time = random() * 10;

  constructor(options: SpeakerOptions = {}) {
    super();
    this.name = 'Speaker';
    const height = options.height ?? 0.85;
    const wood = timber(options.wood ?? 0x5a3f2a, 0.5);
    const bodyH = height - PLINTH;

    part(this, WIDTH + 0.02, PLINTH, DEPTH + 0.02, BAFFLE, { y: PLINTH / 2 });
    part(this, WIDTH, bodyH, DEPTH, wood, { y: PLINTH + bodyH / 2 });
    part(this, WIDTH - 0.016, bodyH - 0.016, 0.006, BAFFLE, { y: PLINTH + bodyH / 2, z: DEPTH / 2 + 0.003 }).castShadow = false;

    // Drivers, top to bottom: tweeter dome, mid, woofer. Each a shallow cylinder with its axis along z.
    const driver = (y: number, r: number, cone: THREE.Material, cap: THREE.Material, capR: number, into: THREE.Object3D = this): void => {
      for (const [radius, material, depth] of [
        [r, cone, 0.012],
        [capR, cap, 0.02],
      ] as const) {
        const disc = cylinderMesh(radius, depth, material, { y, z: DEPTH / 2 + 0.006 + depth / 2 }, { segments: 24 });
        disc.rotation.x = Math.PI / 2;
        disc.castShadow = false;
        into.add(disc);
      }
    };
    driver(PLINTH + bodyH * 0.82, 0.03, DOME, DOME, 0.012);
    driver(PLINTH + bodyH * 0.64, 0.055, CONE, DUST_CAP, 0.018);
    driver(PLINTH + bodyH * 0.36, 0.075, CONE, DUST_CAP, 0.024, this.woofer);
    this.add(this.woofer);
    const led = part(this, 0.008, 0.004, 0.003, this.led, { x: WIDTH / 2 - 0.03, y: PLINTH + 0.03, z: DEPTH / 2 + 0.008 });
    led.castShadow = false;

    this.footprint = new THREE.Box3(new THREE.Vector3(-WIDTH / 2 - 0.01, 0, -DEPTH / 2 - 0.01), new THREE.Vector3(WIDTH / 2 + 0.01, height, DEPTH / 2 + 0.01));
  }

  update(dt: number): void {
    this.time += dt;
    const loudness = nowPlaying.loudness();
    const target = loudness > 0 ? LED_PLAYING : LED_IDLE;
    this.led.emissiveIntensity = damp(this.led.emissiveIntensity, target, 4, dt);
    // No access to the video's sound (a cross-origin iframe): a beat and a flutter, as deep as it is loud.
    const t = this.time;
    const pump = Math.max(0, Math.sin(t * BEAT_HZ * Math.PI * 2)) ** 3 * 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * FLUTTER_HZ * Math.PI * 2));
    this.woofer.position.z = PUMP * Math.min(1, loudness * 1.5) * pump;
  }
}
