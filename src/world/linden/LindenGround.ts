import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { QuadBuilder } from '../street/QuadBuilder';
import { asphaltTile, kerbTile, pavingTile, settsTile, type Tile } from '../street/groundTextures';
import { GROUND, onSurface } from '../surface/layers';
import { envBoost } from '../materials/envBoost';
import { LINDEN_PLAN } from './lindenPlan';

/** The maps' relief (the street's, `StreetGround`). */
const BUMP = { asphalt: 0.35, paving: 0.7, kerb: 0.4, setts: 1.1 };

/**
 * Linden Avenue's ground (`LINDEN_PLAN`): the asphalt between the kerbs, the stone slabs of both pavements up to the
 * facades, the granite kerbstones flush on their edge and the gutter's setts in the road below them, all level (the
 * avenue's "plateau"); and the paint: the zebra from her door across, the dashed middle line, the parking lanes'
 * edges. One mesh per material, uvs in metres; it never collides (the zone's floor is the player's ground).
 */
export class LindenGround extends THREE.Group implements Furniture {
  readonly contactShadow = false;

  constructor(anisotropy: number) {
    super();
    this.name = 'LindenGround';
    const { ground, lines, kerb, zebra, lanes } = LINDEN_PLAN;
    const { x0, x1 } = ground;
    const inner = lines.kerb - kerb.gutter;
    const road = new QuadBuilder(1).floor(x0, -inner, x1, inner, 0);
    const gutters = new QuadBuilder(1).floor(x0, -lines.kerb, x1, -inner, 0).floor(x0, inner, x1, lines.kerb, 0);
    const stones = new QuadBuilder(1).floor(x0, -lines.kerb - kerb.stone, x1, -lines.kerb, 0).floor(x0, lines.kerb, x1, lines.kerb + kerb.stone, 0);
    const paving = new QuadBuilder(1).floor(x0, lines.hers, x1, -lines.kerb - kerb.stone, 0).floor(x0, lines.kerb + kerb.stone, x1, lines.far, 0);

    this.surface(road.build(), asphaltTile(anisotropy), 0.92, BUMP.asphalt);
    this.surface(gutters.build(), settsTile(anisotropy), 0.85, BUMP.setts, 0xb8b4ac);
    this.surface(stones.build(), kerbTile(anisotropy), 0.8, BUMP.kerb);
    this.surface(paving.build(), pavingTile(anisotropy), 0.88, BUMP.paving);

    // The paint: the zebra's bars (half a metre, half a metre apart) across the road, the middle line's dashes, and the
    // parking lanes' edges, a rank over the asphalt.
    const paint = new QuadBuilder(1);
    for (let z = -inner + 0.25; z + 0.5 <= inner - 0.1; z += 1) paint.floor(zebra.x0, z, zebra.x1, z + 0.5, GROUND.marking.lift);
    for (let x = x0; x < x1; x += lanes.dash + lanes.gap) {
      if (x + lanes.dash > zebra.x0 - 0.5 && x < zebra.x1 + 0.5) continue;
      paint.floor(x, -0.06, x + lanes.dash, 0.06, GROUND.marking.lift);
    }
    const edge = lines.kerb - lanes.parking;
    for (const z of [-edge, edge]) {
      for (const [a, b] of [[x0, zebra.x0 - 1], [zebra.x1 + 1, x1]] as const) paint.floor(a, z - 0.05, b, z + 0.05, GROUND.marking.lift);
    }
    const marks = new THREE.Mesh(paint.build(), onSurface(new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 0.75 }), GROUND.marking));
    marks.receiveShadow = true;
    this.add(marks);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  private surface(geometry: THREE.BufferGeometry, tile: Tile, roughness: number, bumpScale: number, color = 0xffffff): void {
    // uvs are in metres: one repeat a tile (the height and roughness maps with it).
    for (const t of [tile.texture, tile.bump, tile.roughness]) t?.repeat.set(1 / tile.metres, 1 / tile.metres);
    const material = envBoost(new THREE.MeshStandardMaterial({ map: tile.texture, color, roughness }), 0.6);
    if (tile.bump) {
      material.bumpMap = tile.bump;
      material.bumpScale = bumpScale;
    }
    if (tile.roughness) material.roughnessMap = tile.roughness;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    this.add(mesh);
  }
}
