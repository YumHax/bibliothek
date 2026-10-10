import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { paint, standard, timber } from '../materials/palette';
import { part } from './Prop';
import { nowPlaying } from '../screen/nowPlaying';
import { random } from '@/random';
import { damp } from '@/math/damp';
import { markShared } from '../materials/sharedResources';

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
const FRAME = standard({ color: 0x232221, roughness: 0.45, metalness: 0 });
const SCREW = standard({ color: 0x8a8a88, roughness: 0.4, metalness: 1 });
/** The baffle's thickness over the cabinet's front, and a driver's screw heads' height (m). */
const BAFFLE_T = 0.006;
const SCREW_H = 0.003;
/** How far a driver's frame ring stands proud of the baffle (m). */
const FRAME_Z = 0.004;
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

    // Drivers, top to bottom: tweeter dome, mid, woofer. Each turned on a lathe (axis along z): a frame ring proud of
    // the baffle with four screws, a rubber surround rolling over, the cone dishing in to the dust cap's dome.
    const front = DEPTH / 2 + BAFFLE_T;
    const driver = (y: number, r: number, capR: number, into: THREE.Object3D = this, tweeter = false): void => {
      const parts: [THREE.BufferGeometry, THREE.Material][] = [
        [driverGeometry('frame', r, capR), FRAME],
        [driverGeometry('cone', r, capR), tweeter ? DOME : CONE],
        [driverGeometry('cap', r, capR), tweeter ? DOME : DUST_CAP],
      ];
      for (const [geometry, material] of parts) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(0, y, front);
        mesh.receiveShadow = true;
        into.add(mesh);
      }
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        const screw = cylinderMesh(0.0035, SCREW_H, SCREW, { x: Math.cos(a) * r * 1.06, y: y + Math.sin(a) * r * 1.06, z: front + FRAME_Z + SCREW_H / 2 }, { segments: 8 });
        screw.rotation.x = Math.PI / 2;
        screw.castShadow = false;
        into.add(screw);
      }
    };
    driver(PLINTH + bodyH * 0.82, 0.03, 0.014, this, true);
    driver(PLINTH + bodyH * 0.64, 0.055, 0.018);
    driver(PLINTH + bodyH * 0.36, 0.075, 0.024, this.woofer);
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

const driverGeometries = new Map<string, THREE.LatheGeometry>();

/**
 * One turned part of a driver of radius `r` with a dust cap (or a tweeter's dome) of `capR`, its axis the lathe's y (the
 * mesh turns it onto z): `frame`, the ring proud of the baffle; `cone`, the surround's roll and the cone dishing in;
 * `cap`, the dome in the middle. Profiles run from the rim inwards, so the faces look out (+y). Shared per size.
 */
function driverGeometry(kind: 'frame' | 'cone' | 'cap', r: number, capR: number): THREE.LatheGeometry {
  const key = `${kind}|${r}|${capR}`;
  let geometry = driverGeometries.get(key);
  if (geometry) return geometry;
  const p = (x: number, y: number): THREE.Vector2 => new THREE.Vector2(x, y);
  const points: THREE.Vector2[] = [];
  if (kind === 'frame') points.push(p(r * 1.14, 0), p(r * 1.14, FRAME_Z * 0.7), p(r * 1.1, FRAME_Z), p(r * 1.01, FRAME_Z), p(r * 1.0, FRAME_Z * 0.5));
  else if (kind === 'cone') {
    // The surround: a half roll from the frame's inner edge, then the cone down to the cap's rim.
    const roll = r * 0.07;
    const centre = r - roll;
    for (let i = 0; i <= 6; i++) {
      const t = (i / 6) * Math.PI;
      points.push(p(centre + roll * Math.cos(t), FRAME_Z * 0.6 + roll * 0.8 * Math.sin(t)));
    }
    points.push(p(capR * 1.02, 0.0015));
  } else {
    for (let i = 0; i <= 6; i++) {
      const t = (i / 6) * (Math.PI / 2);
      points.push(p(capR * Math.cos(t), 0.0015 + capR * 0.55 * Math.sin(t)));
    }
  }
  geometry = markShared(new THREE.LatheGeometry(points, 28));
  driverGeometries.set(key, geometry);
  return geometry;
}
