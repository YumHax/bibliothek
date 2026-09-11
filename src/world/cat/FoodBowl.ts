import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '@/world/Furniture';
import { boxMesh, invisibleHitbox } from '@/world/meshUtils';
import { seededRandom } from '@/covers/generated/canvasUtils';
import type { FoodBowlLike } from './types';

/**
 * The cat's food bowl: a shallow glazed ceramic dish on a rubber mat with a heap of kibble in it.
 * The heap is one InstancedMesh; `level` decides how many pieces show, and since the pieces are
 * sorted bottom-first the heap visibly sinks as the cat eats. Clicking the bowl refills it, the
 * kibble dropping in over ~0.6 s. Local origin: centre of the bowl's foot on the floor, +y up,
 * +z is the front where the cat stands. Decoration for the collider (empty footprint), so the
 * cat can walk right up to it.
 *
 * `bowlMesh()` and `bowlMat()` are shared with `WaterBowl` so the two dishes match.
 */

export interface FoodBowlOptions {
  /** Glaze colour of the ceramic. */
  glaze?: number;
  /** Draw the rubber mat under the bowl (true by default). */
  mat?: boolean;
  /** Kibble colour. */
  kibble?: number;
  /** Seed for the heap arrangement. */
  seed?: number;
}

/** Outer radius at the rim. */
export const BOWL_RADIUS = 0.07;
/** Height of the rim above the floor. */
export const BOWL_HEIGHT = 0.04;
/** Radius of the opening inside the rim. */
export const BOWL_INNER_RADIUS = 0.06;
/** Height of the inside floor of the dish. */
export const BOWL_FLOOR = 0.012;
/** The rubber mat both bowls sit on: 0.30 x 0.20 x 0.005 m. */
export const MAT_SIZE = { width: 0.3, height: 0.005, depth: 0.2 };

const KIBBLE_COUNT = 40;
const KIBBLE_RADIUS = 0.006;
/** Height of the heap at its centre when full. */
const HEAP_HEIGHT = 0.017;
/** How long the kibble takes to rain in on refill. */
const POUR_DURATION = 0.6;
/** Each piece falls this long; the pieces start one after another to fill `POUR_DURATION`. */
const FALL_TIME = 0.28;
const DROP_HEIGHT = 0.09;
/** Where the cat's body centre goes: in front of the bowl on the floor. */
const FEEDING_DISTANCE = 0.16;

const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const HIDDEN_SCALE = new THREE.Vector3(0, 0, 0);
const FULL_SCALE = new THREE.Vector3(1, 1, 1);

/** The ceramic dish, lathed from a profile: a small foot, a flaring wall and a rolled rim. Origin at the foot. */
export function bowlMesh(material: THREE.Material): THREE.Mesh {
  const profile = [
    new THREE.Vector2(0, BOWL_FLOOR - 0.008),
    new THREE.Vector2(0.046, BOWL_FLOOR - 0.008),
    new THREE.Vector2(0.05, 0),
    new THREE.Vector2(0.056, 0.004),
    new THREE.Vector2(0.064, 0.02),
    new THREE.Vector2(BOWL_RADIUS, BOWL_HEIGHT - 0.004),
    new THREE.Vector2(BOWL_RADIUS - 0.003, BOWL_HEIGHT),
    new THREE.Vector2(BOWL_INNER_RADIUS + 0.002, BOWL_HEIGHT),
    new THREE.Vector2(BOWL_INNER_RADIUS, BOWL_HEIGHT - 0.006),
    new THREE.Vector2(0.05, 0.022),
    new THREE.Vector2(0.03, BOWL_FLOOR + 0.001),
    new THREE.Vector2(0, BOWL_FLOOR),
  ];
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** The rubber mat: a thin dark slab centred under the bowl. */
export function bowlMat(): THREE.Mesh {
  const rubber = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.95 });
  const mat = boxMesh(MAT_SIZE.width, MAT_SIZE.height, MAT_SIZE.depth, rubber, { y: MAT_SIZE.height / 2 });
  mat.castShadow = false;
  return mat;
}

/** Glazed ceramic that can glow a little when hovered. */
export function ceramicMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide });
}

export class FoodBowl extends THREE.Group implements Furniture, Interactable, Updatable, FoodBowlLike {
  readonly hitboxes: THREE.Object3D[];
  readonly options: Required<FoodBowlOptions>;

  private readonly ceramic: THREE.MeshStandardMaterial;
  private readonly kibble: THREE.InstancedMesh;
  /** Resting place of every piece, sorted bottom-first so a partial count is a lower heap. */
  private readonly rest: THREE.Vector3[] = [];
  private readonly spin: THREE.Quaternion[] = [];
  private _level = 1;
  /** Time since the last refill while the kibble is still falling; -1 when settled. */
  private pouring = -1;

  constructor(options: FoodBowlOptions = {}) {
    super();
    this.name = 'FoodBowl';
    this.options = { glaze: 0xd9553f, mat: true, kibble: 0x6b4423, seed: 3, ...options };

    if (this.options.mat) this.add(bowlMat());
    this.ceramic = ceramicMaterial(this.options.glaze);
    const dish = bowlMesh(this.ceramic);
    dish.position.y = this.options.mat ? MAT_SIZE.height : 0;
    this.add(dish);

    this.kibble = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(KIBBLE_RADIUS, 0),
      new THREE.MeshStandardMaterial({ color: this.options.kibble, roughness: 0.9 }),
      KIBBLE_COUNT,
    );
    this.kibble.castShadow = true;
    this.kibble.receiveShadow = true;
    this.kibble.position.y = dish.position.y;
    this.add(this.kibble);
    this.buildHeap();
    this.layoutKibble();

    const hitbox = invisibleHitbox(0.2, 0.12, 0.2, { y: 0.06 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  /** Decoration for the collider: an empty box never intersects. */
  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  get level(): number {
    return this._level;
  }

  eat(amount: number): void {
    this._level = Math.max(0, this._level - amount);
    if (this.pouring < 0) this.layoutKibble();
  }

  refill(): void {
    this._level = 1;
    this.pouring = 0;
    this.layoutKibble();
  }

  feedingSpot(out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 0, FEEDING_DISTANCE);
    return this.localToWorld(out);
  }

  label(): string {
    if (this._level < 0.1) return 'Empty bowl — click to fill';
    if (this._level < 0.5) return 'Half-empty bowl — click to top up';
    return 'Bowl of kibble';
  }

  activate(session: SessionActions): void {
    if (this._level >= 0.95) {
      session.hint('The bowl is full');
      return;
    }
    this.refill();
    session.hint('Kibble refilled');
  }

  setHovered(hovered: boolean): void {
    this.ceramic.emissive.setHex(hovered ? 0x2a1c14 : 0x000000);
  }

  update(dt: number): void {
    if (this.pouring < 0) return;
    this.pouring += dt;
    this.layoutKibble();
    if (this.pouring >= POUR_DURATION + FALL_TIME) {
      this.pouring = -1;
      this.layoutKibble();
    }
  }

  /** Resting places under a dome profile (higher at the centre), with a random tumble each. */
  private buildHeap(): void {
    const random = seededRandom(this.options.seed * 4241 + 11);
    const floorY = BOWL_FLOOR + KIBBLE_RADIUS;
    const spread = BOWL_INNER_RADIUS - KIBBLE_RADIUS * 1.5;
    for (let i = 0; i < KIBBLE_COUNT; i++) {
      const r = spread * Math.sqrt(random());
      const angle = random() * Math.PI * 2;
      const dome = HEAP_HEIGHT * (1 - (r / spread) ** 2);
      this.rest.push(new THREE.Vector3(Math.cos(angle) * r, floorY + dome * random(), Math.sin(angle) * r));
      this.spin.push(new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * Math.PI, random() * Math.PI, random() * Math.PI)));
    }
    this.rest.sort((a, b) => a.y - b.y);
  }

  /** Writes the instance matrices for the current level (and the pour progress, if falling). */
  private layoutKibble(): void {
    const visible = Math.round(this._level * KIBBLE_COUNT);
    this.kibble.count = visible;
    for (let i = 0; i < visible; i++) {
      const target = this.rest[i];
      scratchPosition.copy(target);
      scratchScale.copy(FULL_SCALE);
      if (this.pouring >= 0) {
        // Bottom pieces start first; each falls from the drop height, easing in (gravity-like).
        const start = (i / KIBBLE_COUNT) * POUR_DURATION;
        const t = (this.pouring - start) / FALL_TIME;
        if (t <= 0) scratchScale.copy(HIDDEN_SCALE);
        else if (t < 1) scratchPosition.y = target.y + DROP_HEIGHT * (1 - t * t);
      }
      scratchMatrix.compose(scratchPosition, this.spin[i], scratchScale);
      this.kibble.setMatrixAt(i, scratchMatrix);
    }
    this.kibble.instanceMatrix.needsUpdate = true;
  }
}
