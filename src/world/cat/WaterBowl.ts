import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '@/world/Furniture';
import { BOWL_HEIGHT, BOWL_INNER_RADIUS, MAT_SIZE, bowlMat, bowlMesh, ceramicMaterial } from './FoodBowl';
import type { WaterBowlLike } from './types';

/**
 * The cat's water bowl: the same lathed dish as the food bowl (brushed steel or glazed ceramic)
 * holding a flat glossy disc of water a few millimetres under the rim. `sip()` sends a short
 * ripple through it: the disc breathes and bobs for about a second. Not clickable. Local
 * origin: centre of the foot on the floor, +y up, +z is the front where the cat stands.
 * Empty footprint so the cat can reach it and the player never trips on it.
 */

export interface WaterBowlOptions {
  finish?: 'steel' | 'ceramic';
  /** Glaze colour when `finish` is ceramic. */
  glaze?: number;
  /** Draw the rubber mat under the bowl (false by default: it is usually the food bowl's mat). */
  mat?: boolean;
}

const WATER_RADIUS = BOWL_INNER_RADIUS - 0.003;
/** Water surface below the rim. */
const WATER_LEVEL = BOWL_HEIGHT - 0.006;
const RIPPLE_DURATION = 1.1;
const RIPPLE_FREQUENCY = 26;
const RIPPLE_DECAY = 3.5;
const DRINKING_DISTANCE = 0.16;

export class WaterBowl extends THREE.Group implements Furniture, Updatable, WaterBowlLike {
  readonly options: Required<WaterBowlOptions>;

  private readonly water: THREE.Mesh;
  private readonly waterY: number;
  /** Time since the last sip while rippling; -1 when still. */
  private ripple = -1;

  constructor(options: WaterBowlOptions = {}) {
    super();
    this.name = 'WaterBowl';
    this.options = { finish: 'steel', glaze: 0x4f7fa8, mat: false, ...options };

    if (this.options.mat) this.add(bowlMat());
    const base = this.options.mat ? MAT_SIZE.height : 0;
    const material =
      this.options.finish === 'steel'
        ? new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide })
        : ceramicMaterial(this.options.glaze);
    const dish = bowlMesh(material);
    dish.position.y = base;
    this.add(dish);

    const surface = new THREE.MeshStandardMaterial({
      color: 0x7fb4d6,
      transparent: true,
      opacity: 0.7,
      roughness: 0.1,
      metalness: 0.3,
      depthWrite: false,
    });
    this.water = new THREE.Mesh(new THREE.CircleGeometry(WATER_RADIUS, 40), surface);
    this.water.rotation.x = -Math.PI / 2;
    this.waterY = base + WATER_LEVEL;
    this.water.position.y = this.waterY;
    this.water.receiveShadow = true;
    this.add(this.water);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  drinkingSpot(out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 0, DRINKING_DISTANCE);
    return this.localToWorld(out);
  }

  sip(): void {
    this.ripple = 0;
  }

  update(dt: number): void {
    if (this.ripple < 0) return;
    this.ripple += dt;
    if (this.ripple >= RIPPLE_DURATION) {
      this.ripple = -1;
      this.water.scale.set(1, 1, 1);
      this.water.position.y = this.waterY;
      return;
    }
    const wave = Math.sin(this.ripple * RIPPLE_FREQUENCY) * Math.exp(-this.ripple * RIPPLE_DECAY);
    // The disc lies in its local x/y plane: breathe the radius a touch and bob the surface.
    const s = 1 + 0.035 * wave;
    this.water.scale.set(s, s, 1);
    this.water.position.y = this.waterY + 0.0015 * wave;
  }
}
