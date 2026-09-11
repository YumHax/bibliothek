import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { CollisionWorld } from '@/core/Collider';
import type { Furniture } from '@/world/Furniture';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { CatToyLike } from './types';

/**
 * A small two-tone ball the cat bats around: it rolls with friction, bounces off the room walls
 * (`bounds`) and off the furniture colliders, and always sits on the floor (y = radius). The
 * ball is moved in its parent's space, which is the scene, so the parent must not be rotated or
 * offset (place it with `world.place()`). Origin at the ball's centre. Empty footprint: the
 * player kicks through it, the cat walks up to it.
 */

export interface CatToyOptions {
  /** Room floor rectangle the ball stays inside: `x` -> world x, `y` -> world z. */
  bounds: THREE.Box2;
  /** Furniture and walls the ball bounces off. */
  collisions: CollisionWorld;
  radius?: number;
  /** The two stripe colours. */
  colors?: [number, number];
}

const DEFAULT_RADIUS = 0.03;
/** Exponential friction: speed halves every ~0.6 s. */
const FRICTION = 1.2;
const STOP_SPEED = 0.03;
/** Fraction of the speed kept along a bounced axis. */
const BOUNCE = 0.5;
const UP = new THREE.Vector3(0, 1, 0);

const scratchNext = new THREE.Vector3();
const scratchAxis = new THREE.Vector3();
const scratchSpin = new THREE.Quaternion();

export class CatToy extends THREE.Group implements Furniture, Updatable, CatToyLike {
  readonly radius: number;

  private readonly bounds: THREE.Box2;
  private readonly collisions: CollisionWorld;
  private readonly velocity = new THREE.Vector3();
  private readonly ball: THREE.Mesh;

  constructor(options: CatToyOptions) {
    super();
    this.name = 'CatToy';
    this.bounds = options.bounds;
    this.collisions = options.collisions;
    this.radius = options.radius ?? DEFAULT_RADIUS;
    const [a, b] = options.colors ?? [0xd43d3d, 0xf4efe6];

    const skin = new THREE.MeshStandardMaterial({ color: 0xffffff, map: stripesTexture(a, b), roughness: 0.5 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 28, 20), skin);
    this.ball.castShadow = true;
    this.ball.receiveShadow = true;
    // A little bell peeking through the top pole.
    const bell = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius * 0.28, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8b04a, roughness: 0.3, metalness: 0.8 }),
    );
    bell.position.y = this.radius * 0.85;
    bell.castShadow = true;
    this.ball.add(bell);
    this.add(this.ball);
    this.position.y = this.radius;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  get isRolling(): boolean {
    return this.velocity.lengthSq() > 0;
  }

  nudge(direction: THREE.Vector3, speed: number): void {
    this.velocity.set(direction.x, 0, direction.z);
    if (this.velocity.lengthSq() === 0 || speed <= 0) {
      this.velocity.set(0, 0, 0);
      return;
    }
    this.velocity.normalize().multiplyScalar(speed);
  }

  update(dt: number): void {
    this.position.y = this.radius;
    if (!this.isRolling || dt <= 0) return;
    const v = this.velocity;
    const p = this.position;
    const r = this.radius;

    // Room walls: clamp and reflect.
    const { min, max } = this.bounds;
    scratchNext.set(p.x + v.x * dt, r, p.z + v.z * dt);
    if (scratchNext.x < min.x + r || scratchNext.x > max.x - r) {
      v.x *= -BOUNCE;
      scratchNext.x = THREE.MathUtils.clamp(scratchNext.x, min.x + r, max.x - r);
    }
    if (scratchNext.z < min.y + r || scratchNext.z > max.y - r) {
      v.z *= -BOUNCE;
      scratchNext.z = THREE.MathUtils.clamp(scratchNext.z, min.y + r, max.y - r);
    }

    // Furniture: if the full step is blocked, slide along whichever axis is free and bounce the other.
    if (this.collisions.intersectsSphere(scratchNext, r)) {
      scratchNext.set(p.x + v.x * dt, r, p.z);
      if (!this.collisions.intersectsSphere(scratchNext, r)) {
        v.z *= -BOUNCE;
      } else {
        scratchNext.set(p.x, r, p.z + v.z * dt);
        if (!this.collisions.intersectsSphere(scratchNext, r)) {
          v.x *= -BOUNCE;
        } else {
          // Wedged: reverse and stay put this frame.
          v.x *= -BOUNCE;
          v.z *= -BOUNCE;
          scratchNext.set(p.x, r, p.z);
        }
      }
    }

    // Roll: turn about the horizontal axis perpendicular to the travel, by distance / radius.
    scratchAxis.set(scratchNext.x - p.x, 0, scratchNext.z - p.z);
    const distance = scratchAxis.length();
    if (distance > 0) {
      scratchAxis.divideScalar(distance);
      scratchAxis.crossVectors(UP, scratchAxis);
      scratchSpin.setFromAxisAngle(scratchAxis, distance / r);
      this.ball.quaternion.premultiply(scratchSpin);
    }
    p.copy(scratchNext);

    // Friction.
    v.multiplyScalar(Math.exp(-FRICTION * dt));
    if (v.length() < STOP_SPEED) v.set(0, 0, 0);
  }
}

/** Six meridian stripes alternating the two colours, like a beach ball. */
function stripesTexture(a: number, b: number): THREE.CanvasTexture {
  const width = 384;
  const height = 192;
  const [canvas, ctx] = createCanvas(width, height);
  const colors = [`#${a.toString(16).padStart(6, '0')}`, `#${b.toString(16).padStart(6, '0')}`];
  const stripes = 6;
  const stripeW = width / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = colors[i % 2];
    ctx.fillRect(Math.floor(i * stripeW), 0, Math.ceil(stripeW), height);
  }
  // Thin seams between the panels.
  ctx.fillStyle = 'rgba(40, 30, 30, 0.35)';
  for (let i = 0; i < stripes; i++) ctx.fillRect(Math.floor(i * stripeW), 0, 2, height);
  const texture = toTexture(canvas, 4);
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}
