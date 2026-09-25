import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { seasonalLawn } from '../props/outdoors/season';
import { QuadBuilder } from './QuadBuilder';
import { asphaltTile, kerbTile, lawnTile, pavingTile, type Tile } from './groundTextures';
import { CROSS_STREET, FRONT, KERB_HEIGHT, PARK_STREET, STREET_PLAN } from './streetPlan';

/** How far the side streets run each way before the fog and the far plane take them. */
const REACH = 64;
const LAWN_REACH = { x: -115, z: 100 };
const SNOW = new THREE.Color(0xf2f4f8);
/** Seconds between two readings of the weather (the ground soaks and dries over game hours). */
const WEATHER_EVERY = 0.5;

interface Surface {
  material: THREE.MeshStandardMaterial;
  dry: THREE.Color;
  roughness: number;
  /** How dark and glossy it gets wet (0 = not at all). */
  soaks: number;
}

/**
 * The ground of the street: the road (Front Street, Park Street, the cross street; asphalt a kerb
 * below the pavements), the pavements (concrete slabs), the granite kerb faces, the markings (the
 * zebra, lane dashes, parking lines, the double centre line) and the park's lawn beyond the hedge.
 * One mesh per material, uvs in metres. Rain darkens and glosses it (`wetness`), snow whitens it
 * (`snowCover`), read from the sky twice a second.
 */
export class StreetGround extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly surfaces: Surface[] = [];
  private clock = WEATHER_EVERY;

  constructor(private readonly dayNight: DayNight, anisotropy: number) {
    super();
    this.name = 'StreetGround';
    const road = new QuadBuilder(1);
    const r = -KERB_HEIGHT;
    road.floor(PARK_STREET.farKerb, FRONT.nearKerb, CROSS_STREET.farKerb, FRONT.farKerb, r);
    road.floor(PARK_STREET.farKerb, -REACH, PARK_STREET.nearKerb, REACH, r);
    road.floor(CROSS_STREET.nearKerb, -REACH, CROSS_STREET.farKerb, REACH, r);

    const paving = new QuadBuilder(1);
    paving.floor(PARK_STREET.nearKerb, FRONT.ourLine, CROSS_STREET.nearKerb, FRONT.nearKerb, 0);
    paving.floor(PARK_STREET.nearKerb, FRONT.farKerb, CROSS_STREET.nearKerb, FRONT.farLine, 0);
    paving.floor(PARK_STREET.nearKerb, -REACH, PARK_STREET.line, FRONT.ourLine, 0);
    paving.floor(PARK_STREET.nearKerb, FRONT.farLine, PARK_STREET.line, REACH, 0);
    paving.floor(PARK_STREET.hedge - 1, -REACH, PARK_STREET.farKerb, REACH, 0);
    paving.floor(CROSS_STREET.line, -REACH, CROSS_STREET.nearKerb, FRONT.ourLine, 0);
    paving.floor(CROSS_STREET.line, FRONT.farLine, CROSS_STREET.nearKerb, REACH, 0);
    paving.floor(CROSS_STREET.farKerb, -REACH, CROSS_STREET.farLine, REACH, 0);

    // Kerb faces, each facing the road.
    const kerbs = new QuadBuilder(1);
    kerbs.wall(PARK_STREET.nearKerb, FRONT.nearKerb, CROSS_STREET.nearKerb, FRONT.nearKerb, r, 0);
    kerbs.wall(CROSS_STREET.nearKerb, FRONT.farKerb, PARK_STREET.nearKerb, FRONT.farKerb, r, 0);
    kerbs.wall(PARK_STREET.nearKerb, -REACH, PARK_STREET.nearKerb, FRONT.nearKerb, r, 0);
    kerbs.wall(PARK_STREET.nearKerb, FRONT.farKerb, PARK_STREET.nearKerb, REACH, r, 0);
    kerbs.wall(PARK_STREET.farKerb, REACH, PARK_STREET.farKerb, -REACH, r, 0);
    kerbs.wall(CROSS_STREET.nearKerb, FRONT.nearKerb, CROSS_STREET.nearKerb, -REACH, r, 0);
    kerbs.wall(CROSS_STREET.nearKerb, REACH, CROSS_STREET.nearKerb, FRONT.farKerb, r, 0);
    kerbs.wall(CROSS_STREET.farKerb, -REACH, CROSS_STREET.farKerb, REACH, r, 0);

    const lawn = new QuadBuilder(1).floor(LAWN_REACH.x, -LAWN_REACH.z, PARK_STREET.hedge - 1, LAWN_REACH.z, -0.02);

    this.addSurface(road.build(), asphaltTile(anisotropy), 0.92, 1);
    this.addSurface(paving.build(), pavingTile(anisotropy), 0.88, 0.7);
    this.addSurface(kerbs.build(), kerbTile(anisotropy), 0.8, 0.6);
    this.addSurface(lawn.build(), lawnTile(seasonalLawn('#5d8a3c'), anisotropy), 0.95, 0.2);
    this.addMarkings();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock < WEATHER_EVERY) return;
    this.clock = 0;
    const { wetness, snowCover } = this.dayNight.state;
    for (const s of this.surfaces) {
      const wet = wetness * s.soaks;
      s.material.color.copy(s.dry).multiplyScalar(1 - 0.45 * wet).lerp(SNOW, snowCover * 0.85);
      s.material.roughness = THREE.MathUtils.lerp(s.roughness, 0.22, wet * (1 - snowCover));
    }
  }

  private addSurface(geometry: THREE.BufferGeometry, tile: Tile, roughness: number, soaks: number, color = 0xffffff): THREE.Mesh {
    // uvs are in metres: one texture repeat per tile.
    tile.texture.repeat.set(1 / tile.metres, 1 / tile.metres);
    const material = new THREE.MeshStandardMaterial({ map: tile.texture, color, roughness, envMapIntensity: 0.6 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.add(mesh);
    this.surfaces.push({ material, dry: material.color.clone(), roughness, soaks });
    return mesh;
  }

  /** White paint on the road, a hair above it: the zebra, the lane dashes, the parking lines and the double centre line. */
  private addMarkings(): void {
    const q = new QuadBuilder(1);
    const y = -KERB_HEIGHT + 0.004;
    const { zebra, laneDash, parkingLine } = STREET_PLAN;
    const from = PARK_STREET.nearKerb - 0.5;
    const to = CROSS_STREET.nearKerb + 0.5;
    // Zebra: bars along the traffic, across the whole road.
    for (let z = FRONT.nearKerb + 0.6; z < FRONT.farKerb - 0.4; z += 1) q.floor(zebra.from, z, zebra.to, z + 0.5, y);
    // Lines stop a little short of the zebra either side.
    const spans: [number, number][] = [[from, zebra.from - 1.5], [zebra.to + 1.5, to]];
    for (const [a, b] of spans) {
      for (const side of [-1, 1]) {
        q.floor(a, side * parkingLine - 0.06, b, side * parkingLine + 0.06, y);
        q.floor(a, side * 0.12 - 0.05, b, side * 0.12 + 0.05, y);
        for (let x = a + 1; x + 3 <= b; x += 9) q.floor(x, side * laneDash - 0.06, x + 3, side * laneDash + 0.06, y);
      }
    }
    const material = new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(q.build(), material);
    mesh.receiveShadow = true;
    this.add(mesh);
    this.surfaces.push({ material, dry: material.color.clone(), roughness: 0.7, soaks: 0.5 });
  }
}
