import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { Interactable } from '@/interaction/Interactable';
import { CanarySong } from '@/audio/grandmaSounds';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { paint } from '../materials/palette';
import { SEAM } from '../props/joinery';
import { HoverGlint } from '../props/hoverGlint';
import { random } from '@/random';

/** The stand and the cage hung from it (m). */
const STAND = { h: 1.55, foot: 0.22 };
const CAGE = { r: 0.15, h: 0.26, bars: 16, base: 0.03 };
/** The perches' heights over the cage's floor, and their sides. */
const PERCHES: readonly [y: number, x: number][] = [
  [0.07, -0.06],
  [0.13, 0.06],
];
/** Seconds between two hops, and how long a hop takes. */
const HOP_EVERY = [1.5, 6] as const;
const HOP_SECONDS = 0.25;
/** Where the cage hangs off the stand's crook (x), and a perch's radius (the bird stands on it). */
const HANG_X = 0.28;
const PERCH_R = 0.004;

/**
 * Mémé's canary in its cage on a stand by the window (`furnishGrandmaDecor`): a brass-coloured stand, the domed cage
 * of wire hung from its crook, two perches, the bird hopping from one to the other and singing by day (`song`, on a
 * `PointSound` by the builder). Clicked, it is whistled to, and sings back. Origin on the floor under the stand.
 * Collides (the stand's foot).
 */
export class BirdCage extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly footprint = new THREE.Box3(new THREE.Vector3(-STAND.foot, 0, -STAND.foot), new THREE.Vector3(STAND.foot, STAND.h, STAND.foot));
  readonly hitboxes: THREE.Object3D[];
  readonly song: CanarySong;
  /** The cage's middle, in the stand's frame (where the song comes from). */
  readonly cageAt: THREE.Vector3;
  private readonly bird = new THREE.Group();
  private readonly glint: HoverGlint;
  private perch = 0;
  private hopIn = 2;
  private hop = -1;
  private time = 0;
  private readonly floor: number;

  constructor(awake: () => boolean) {
    super();
    this.name = 'BirdCage';
    this.song = new CanarySong(awake);
    const brass = paint(0xb89a5a, 0.35);
    const wire = paint(0xe8e2d0, 0.4);
    // The stand: a weighted foot, the pole, the crook over to where the cage hangs.
    this.add(cylinderMesh(STAND.foot, 0.025, brass, { y: 0.0125 }, { radiusBottom: STAND.foot * 1.05, segments: 24 }));
    this.add(cylinderMesh(0.012, STAND.h, brass, { y: STAND.h / 2 }, { segments: 10 }));
    const arm = cylinderMesh(0.008, 0.3, brass, { x: 0.15, y: STAND.h - 0.02 }, { segments: 8 });
    arm.rotation.z = Math.PI / 2;
    this.add(arm);
    const hangX = HANG_X;
    this.add(cylinderMesh(0.004, 0.12, brass, { x: hangX, y: STAND.h - 0.08 }, { segments: 6 }));
    // The cage: its base tray, the bars round, the dome's ring and cap.
    const cageBottom = STAND.h - 0.14 - CAGE.r - CAGE.h - CAGE.base;
    this.floor = cageBottom + CAGE.base + SEAM;
    this.add(cylinderMesh(CAGE.r + 0.01, CAGE.base, paint(0xd8c8a0, 0.4), { x: hangX, y: cageBottom + CAGE.base / 2 }, { segments: 28 }));
    for (let i = 0; i < CAGE.bars; i++) {
      const a = (i / CAGE.bars) * Math.PI * 2;
      const bar = cylinderMesh(0.0025, CAGE.h, wire, { x: hangX + Math.cos(a) * CAGE.r, y: this.floor + CAGE.h / 2, z: Math.sin(a) * CAGE.r }, { segments: 4 });
      bar.castShadow = false;
      this.add(bar);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(CAGE.r, 0.004, 6, 32), wire);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(hangX, this.floor + CAGE.h, 0);
    this.add(ring);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(CAGE.r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.4, wireframe: true }));
    dome.position.set(hangX, this.floor + CAGE.h, 0);
    this.add(dome);
    for (const [y, x] of PERCHES) {
      const perch = cylinderMesh(PERCH_R, CAGE.r * 1.2, paint(0x8a6a4a, 0.7), { x: hangX + x, y: this.floor + y, z: 0 }, { segments: 6 });
      perch.rotation.x = Math.PI / 2;
      perch.castShadow = false;
      this.add(perch);
    }
    // The canary: a yellow body, a head, a tail, an orange beak.
    const yellow = paint(0xf2d02a, 0.6);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), yellow);
    body.scale.set(1.3, 1, 1);
    body.position.y = 0.022;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), yellow);
    head.position.set(0.018, 0.038, 0);
    const beak = cylinderMesh(0.0001, 0.008, paint(0xe8902a, 0.5), { x: 0.032, y: 0.037 }, { radiusBottom: 0.004, segments: 6 });
    beak.rotation.z = -Math.PI / 2;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.014), yellow);
    tail.position.set(-0.032, 0.016, 0);
    tail.rotation.z = 0.4;
    this.bird.add(body, head, beak, tail);
    this.add(this.bird);
    this.cageAt = new THREE.Vector3(hangX, this.floor + CAGE.h / 2, 0);
    this.glint = HoverGlint.of(ring);
    this.place(0);
    const hitbox = invisibleHitbox(CAGE.r * 2 + 0.04, CAGE.h + 0.12, CAGE.r * 2 + 0.04, { x: hangX, y: this.floor + CAGE.h / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.hop >= 0) {
      this.hop += dt / HOP_SECONDS;
      if (this.hop >= 1) {
        this.hop = -1;
        this.place(this.perch);
      } else this.between(this.hop);
      return;
    }
    // A bob of the head on its perch.
    this.bird.rotation.z = Math.sin(this.time * 3.1) * 0.08 * (Math.sin(this.time * 0.7) > 0.6 ? 1 : 0);
    this.hopIn -= dt;
    if (this.hopIn <= 0) {
      this.hopIn = HOP_EVERY[0] + random() * (HOP_EVERY[1] - HOP_EVERY[0]);
      this.perch = 1 - this.perch;
      this.hop = 0;
    }
  }

  private place(perch: number): void {
    const [y, x] = PERCHES[perch]!;
    this.bird.position.set(HANG_X + x, this.floor + y + PERCH_R, 0);
    this.bird.rotation.y = perch ? Math.PI : 0;
  }

  /** In the air between the perches, `u` of the way, on a little arc. */
  private between(u: number): void {
    const [y0, x0] = PERCHES[1 - this.perch]!;
    const [y1, x1] = PERCHES[this.perch]!;
    this.bird.position.set(HANG_X + x0 + (x1 - x0) * u, this.floor + PERCH_R + y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * 0.05, 0);
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return 'The canary · whistle to it';
  }

  activate(): void {
    this.song.sing();
  }
}
