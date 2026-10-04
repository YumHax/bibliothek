import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { seededRandom } from '@/graphics/canvas';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { isShopOpen } from '../shops/shopHours';
import { snowCovered } from '../snowCover';
import type { ShopKind, Vec2 } from '../streetPlan';
import { TriBuilder } from '../relief/TriBuilder';
import { TexQuads } from './TexQuads';
import { paintSpillAtlas } from './spillCanvas';
import { buildSpill, type SpillPiece } from './spillPieces';

/** One thing a shop puts out on the pavement: what, whose (it is out in their hours), where, which way its front faces (yaw 0 = +z). */
export interface SpillSpot {
  piece: SpillPiece;
  shop: ShopKind;
  at: Vec2;
  yaw: number;
}

interface ShopSpillOptions {
  spots: readonly SpillSpot[];
  /** The chalk board's two lines. */
  board: readonly [string, string];
  /** The zone's collision set (world boxes): what is out collides, what is taken in does not. */
  collisions?: { add(box: THREE.Box3): void; remove(box: THREE.Box3): void };
}

const CHECK_EVERY = 1;

interface Shop {
  kind: ShopKind;
  group: THREE.Group;
  /** Zone-local boxes, and the world ones once placed. */
  boxes: THREE.Box3[];
  world: THREE.Box3[];
  out: boolean;
}

/**
 * What the walk-in shops put out on the pavement while they are open (`STREET_PLAN.shopSpill`): the florist's
 * buckets, the stand of pots and the chalk board, the furniture shop's bench for sale, the pet shop's water for dogs
 * and a sack of kibble, TV REPAIR's dead set left out for anyone. Taken in at closing, put out at opening (a check a
 * second), colliding only while out. Each shop's pieces are one mesh of vertex colours and one of the painted faces.
 */
export class ShopSpill extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly shops: Shop[] = [];
  private clock = CHECK_EVERY;

  constructor(private readonly dayNight: DayNight, private readonly options: ShopSpillOptions) {
    super();
    this.name = 'ShopSpill';
    const atlas = paintSpillAtlas(options.board);
    const solidMaterial = snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
    const paintMaterial = new THREE.MeshStandardMaterial({ map: atlas.texture, alphaTest: 0.5, roughness: 0.8 });
    const kinds = [...new Set(options.spots.map((s) => s.shop))];
    for (const kind of kinds) {
      const solid = new TriBuilder();
      const quads = new TexQuads();
      const boxes: THREE.Box3[] = [];
      options.spots.forEach((spot, i) => {
        if (spot.shop !== kind) return;
        const [x, z] = spot.at;
        const m = new THREE.Matrix4().makeRotationY(spot.yaw).setPosition(x, 0, z);
        const { width, depth } = buildSpill(spot.piece, solid, quads, atlas, m, seededRandom(811 + i * 97));
        const half = new THREE.Vector3(width / 2, 0, depth / 2);
        const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.Vector3(sx * half.x, 0, sz * half.z).applyMatrix4(m)));
        const box = new THREE.Box3().setFromPoints(corners);
        box.max.y = 1;
        boxes.push(box);
      });
      const group = new THREE.Group();
      group.name = `ShopSpill:${kind}`;
      const body = new THREE.Mesh(solid.build(), solidMaterial);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
      if (!quads.isEmpty) {
        const faces = new THREE.Mesh(quads.build(), paintMaterial);
        faces.receiveShadow = true;
        group.add(faces);
      }
      group.visible = false;
      this.add(group);
      this.shops.push({ kind, group, boxes, world: [], out: false });
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock < CHECK_EVERY) return;
    this.clock = 0;
    const hours = this.dayNight.state.hours;
    for (const shop of this.shops) {
      const out = isShopOpen(shop.kind, hours);
      if (out === shop.out) continue;
      shop.out = out;
      shop.group.visible = out;
      if (!shop.world.length) {
        this.updateMatrixWorld(true);
        shop.world = shop.boxes.map((box) => box.clone().applyMatrix4(this.matrixWorld));
      }
      for (const box of shop.world) {
        if (out) this.options.collisions?.add(box);
        else this.options.collisions?.remove(box);
      }
    }
  }

  dispose(): void {
    for (const shop of this.shops) if (shop.out) for (const box of shop.world) this.options.collisions?.remove(box);
  }
}
