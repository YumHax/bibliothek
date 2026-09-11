import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '@/world/Furniture';
import { boxMesh, cylinderMesh } from '@/world/meshUtils';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { ScratcherLike } from './types';

/**
 * A sisal scratching post: square wooden base, rope-wrapped post (a canvas texture of stacked
 * rope turns), a small carpeted platform on top and a pom-pom dangling from its edge on a string.
 * `scratched()` sets the pom-pom swinging and gives the post a ~1° wobble, both dying out over a
 * couple of seconds. Local origin: centre of the base on the floor, +y up, +z the side the cat
 * scratches from. 0.38 x 0.68 x 0.38 m overall; a real collider (the player walks around it).
 */

export interface ScratcherOptions {
  /** Wood colour of the base. */
  wood?: number;
  /** Carpet colour of the top platform. */
  carpet?: number;
  /** Pom-pom colour. */
  pompom?: number;
}

const BASE = { width: 0.38, height: 0.03 };
const POST = { radius: 0.045, height: 0.62 };
const PLATFORM = { width: 0.28, height: 0.03 };
const STRING_LENGTH = 0.17;
const POMPOM_RADIUS = 0.024;
const WOBBLE_DURATION = 2.2;
/** Post wobble amplitude: about one degree. */
const WOBBLE_ANGLE = 0.0175;
/** Pom-pom swing amplitude at the start. */
const SWING_ANGLE = 0.55;
const SCRATCHING_DISTANCE = 0.22;
const FACING_HEIGHT = 0.4;

export class Scratcher extends THREE.Group implements Furniture, Updatable, ScratcherLike {
  readonly options: Required<ScratcherOptions>;

  /** Post + platform + toy, pivoting at the top of the base for the wobble. */
  private readonly upper = new THREE.Group();
  /** String + pom-pom, pivoting at the platform edge. */
  private readonly pendulum = new THREE.Group();
  /** Time since `scratched()` while things still move; -1 at rest. */
  private motion = -1;
  private readonly sisal: THREE.CanvasTexture;

  constructor(options: ScratcherOptions = {}) {
    super();
    this.name = 'Scratcher';
    this.options = { wood: 0x8a6a48, carpet: 0x6f6a63, pompom: 0xc94f6a, ...options };

    const wood = new THREE.MeshStandardMaterial({ color: this.options.wood, roughness: 0.65 });
    this.add(boxMesh(BASE.width, BASE.height, BASE.width, wood, { y: BASE.height / 2 }));

    this.upper.position.y = BASE.height;
    this.add(this.upper);

    this.sisal = sisalTexture();
    const rope = new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.sisal, roughness: 0.95 });
    this.upper.add(cylinderMesh(POST.radius, POST.height, rope, { y: POST.height / 2 }, { segments: 24 }));

    const carpet = new THREE.MeshStandardMaterial({ color: this.options.carpet, roughness: 1 });
    this.upper.add(boxMesh(PLATFORM.width, PLATFORM.height, PLATFORM.width, carpet, { y: POST.height + PLATFORM.height / 2 }));

    // The toy hangs from the front-right corner region of the platform.
    this.pendulum.position.set(PLATFORM.width / 2 - 0.02, POST.height, PLATFORM.width / 2 - 0.05);
    const cord = new THREE.MeshStandardMaterial({ color: 0xd9cbb0, roughness: 0.95 });
    const string = cylinderMesh(0.0015, STRING_LENGTH, cord, { y: -STRING_LENGTH / 2 }, { segments: 6 });
    string.castShadow = false;
    const fluff = new THREE.MeshStandardMaterial({ color: this.options.pompom, roughness: 1 });
    const pompom = new THREE.Mesh(new THREE.IcosahedronGeometry(POMPOM_RADIUS, 1), fluff);
    pompom.position.y = -STRING_LENGTH - POMPOM_RADIUS * 0.8;
    pompom.castShadow = true;
    this.pendulum.add(string, pompom);
    this.upper.add(this.pendulum);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.19, 0, -0.19), new THREE.Vector3(0.19, 0.7, 0.19));
  }

  scratchingSpot(out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 0, SCRATCHING_DISTANCE);
    return this.localToWorld(out);
  }

  facingPoint(out: THREE.Vector3): THREE.Vector3 {
    out.set(0, FACING_HEIGHT, 0);
    return this.localToWorld(out);
  }

  scratched(): void {
    // Restarting mid-swing keeps the toy lively while the cat is at it.
    this.motion = 0;
  }

  update(dt: number): void {
    if (this.motion < 0) return;
    this.motion += dt;
    if (this.motion >= WOBBLE_DURATION) {
      this.motion = -1;
      this.upper.rotation.set(0, 0, 0);
      this.pendulum.rotation.set(0, 0, 0);
      return;
    }
    const t = this.motion;
    const decay = Math.exp(-t * 1.6);
    // Post: quick shiver dying out fast.
    const shiver = Math.exp(-t * 4);
    this.upper.rotation.x = WOBBLE_ANGLE * Math.sin(t * 22) * shiver;
    this.upper.rotation.z = WOBBLE_ANGLE * 0.6 * Math.sin(t * 17 + 1) * shiver;
    // Pom-pom: a pendulum of ~0.19 m swings at about 7 rad/s, with a little lateral drift.
    this.pendulum.rotation.x = SWING_ANGLE * Math.sin(t * 7.2) * decay;
    this.pendulum.rotation.z = SWING_ANGLE * 0.35 * Math.sin(t * 6.1 + 0.8) * decay;
  }
}

/** Beige rope turns stacked up the post: bands of slightly varying tone with a dark seam between them. */
function sisalTexture(): THREE.CanvasTexture {
  const width = 256;
  const height = 512;
  const [canvas, ctx] = createCanvas(width, height);
  ctx.fillStyle = '#c9b48a';
  ctx.fillRect(0, 0, width, height);
  const turns = 32;
  const band = height / turns;
  for (let i = 0; i < turns; i++) {
    const y = i * band;
    const tone = 0.92 + 0.12 * ((i * 7919) % 13) / 13;
    ctx.fillStyle = `rgb(${Math.round(201 * tone)}, ${Math.round(180 * tone)}, ${Math.round(138 * tone)})`;
    ctx.fillRect(0, y, width, band);
    // Highlight along the crown of the turn, shadow in the seam below it.
    ctx.fillStyle = 'rgba(255, 245, 220, 0.35)';
    ctx.fillRect(0, y + band * 0.25, width, band * 0.2);
    ctx.fillStyle = 'rgba(70, 50, 25, 0.55)';
    ctx.fillRect(0, y + band - 2, width, 2);
    // Fibre flecks.
    ctx.fillStyle = 'rgba(90, 70, 40, 0.25)';
    for (let k = 0; k < 14; k++) {
      const x = ((i * 53 + k * 97) % width) + ((k * 31) % 5);
      ctx.fillRect(x, y + 1 + ((k * 17 + i * 5) % (band - 3)), 3, 1);
    }
  }
  const texture = toTexture(canvas, 4);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // 32 turns per 512 px; the post's 0.62 m wants ~70 turns of ~9 mm rope.
  texture.repeat.set(1, 2.2);
  return texture;
}
