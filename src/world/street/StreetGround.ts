import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { seasonalLawn } from '../props/outdoors/season';
import { QuadBuilder } from './QuadBuilder';
import { asphaltTile, kerbTile, lawnTile, pavingTile, type Tile } from './groundTextures';
import { FRONT, KERB_HEIGHT, PARK_STREET, SIDE_STREET, STREET_ENDS, STREET_PLAN } from './streetPlan';
import { STREET_SNOW } from './snowCover';

/** The side street runs south to the building across its end. */
const SIDE_END = -60;
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
    const { south, east } = STREET_ENDS;
    const road = new QuadBuilder(1);
    const r = -KERB_HEIGHT;
    // Front Street from Park Street's far kerb to the building across its end; Park Street and the side street running south.
    road.floor(PARK_STREET.farKerb, FRONT.nearKerb, east, FRONT.farKerb, r);
    road.floor(PARK_STREET.farKerb, south, PARK_STREET.nearKerb, FRONT.nearKerb, r);
    road.floor(SIDE_STREET.nearKerb, SIDE_END, SIDE_STREET.farKerb, FRONT.nearKerb, r);

    const paving = new QuadBuilder(1);
    paving.floor(PARK_STREET.nearKerb, FRONT.ourLine, SIDE_STREET.nearKerb, FRONT.nearKerb, 0);
    paving.floor(SIDE_STREET.farKerb, FRONT.ourLine, east, FRONT.nearKerb, 0);
    paving.floor(PARK_STREET.hedge - 1, FRONT.farKerb, east, FRONT.farLine, 0);
    paving.floor(PARK_STREET.nearKerb, south, PARK_STREET.line, FRONT.ourLine, 0);
    paving.floor(PARK_STREET.hedge - 1, south, PARK_STREET.farKerb, FRONT.farKerb, 0);
    paving.floor(SIDE_STREET.line, SIDE_END, SIDE_STREET.nearKerb, FRONT.ourLine, 0);
    paving.floor(SIDE_STREET.farKerb, SIDE_END, SIDE_STREET.farLine, FRONT.ourLine, 0);

    // Kerb faces, each facing the road.
    const kerbs = new QuadBuilder(1);
    kerbs.wall(PARK_STREET.nearKerb, FRONT.nearKerb, SIDE_STREET.nearKerb, FRONT.nearKerb, r, 0);
    kerbs.wall(SIDE_STREET.farKerb, FRONT.nearKerb, east, FRONT.nearKerb, r, 0);
    kerbs.wall(east, FRONT.farKerb, PARK_STREET.farKerb, FRONT.farKerb, r, 0);
    kerbs.wall(PARK_STREET.nearKerb, south, PARK_STREET.nearKerb, FRONT.nearKerb, r, 0);
    kerbs.wall(PARK_STREET.farKerb, FRONT.farKerb, PARK_STREET.farKerb, south, r, 0);
    kerbs.wall(SIDE_STREET.nearKerb, FRONT.nearKerb, SIDE_STREET.nearKerb, SIDE_END, r, 0);
    kerbs.wall(SIDE_STREET.farKerb, SIDE_END, SIDE_STREET.farKerb, FRONT.nearKerb, r, 0);

    const lawn = new QuadBuilder(1).floor(LAWN_REACH.x, south, PARK_STREET.hedge - 1, LAWN_REACH.z, -0.02);

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
    STREET_SNOW.value = snowCover;
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

  /**
   * Paint on the road, a hair above it: the crossings' zebras, the stop lines before the one with
   * lights, the lane dashes, the parking lines and the double centre line of Front Street and Park
   * Street; the bus stop's yellow box. White and yellow, one mesh each.
   */
  private addMarkings(): void {
    const white = new QuadBuilder(1);
    const yellow = new QuadBuilder(1);
    const y = -KERB_HEIGHT + 0.004;
    const { crossings, laneDash, parkingLine, stopLine, bus } = STREET_PLAN;
    // Zebras: bars along the traffic, across the whole road.
    for (const c of crossings) {
      for (let z = FRONT.nearKerb + 0.6; z < FRONT.farKerb - 0.4; z += 1) white.floor(c.from, z, c.to, z + 0.5, y);
      if (!c.signals) continue;
      // Stop lines: eastbound (z > 0) before the crossing's west side, westbound before its east side.
      white.floor(c.from - stopLine - 0.3, 0.2, c.from - stopLine, parkingLine, y);
      white.floor(c.to + stopLine, -parkingLine, c.to + stopLine + 0.3, -0.2, y);
    }
    // Front Street's lines, from Park Street's junction to the side street's, broken at the crossings.
    const cuts = [...crossings].sort((a, b) => a.from - b.from);
    const spans: [number, number][] = [];
    let a = PARK_STREET.nearKerb - 0.5;
    for (const c of cuts) {
      if (c.from - stopLine - 0.5 > a) spans.push([a, c.from - stopLine - 0.5]);
      a = Math.max(a, c.to + stopLine + 0.5);
    }
    spans.push([a, SIDE_STREET.nearKerb - 0.5], [SIDE_STREET.farKerb + 0.5, STREET_ENDS.east - 1]);
    for (const [x0, x1] of spans) {
      for (const side of [-1, 1]) {
        white.floor(x0, side * parkingLine - 0.06, x1, side * parkingLine + 0.06, y);
        white.floor(x0, side * 0.12 - 0.05, x1, side * 0.12 + 0.05, y);
        for (let x = x0 + 1; x + 3 <= x1; x += 9) white.floor(x, side * laneDash - 0.06, x + 3, side * laneDash + 0.06, y);
      }
    }
    // Park Street: the double centre line and dashes, down from the junction.
    const mid = (PARK_STREET.nearKerb + PARK_STREET.farKerb) / 2;
    for (const side of [-1, 1]) white.floor(mid + side * 0.12 - 0.05, STREET_ENDS.south, mid + side * 0.12 + 0.05, FRONT.nearKerb - 1, y);
    // The bus stop: a yellow box in the far parking lane, BUS in it (as bars).
    const [bx] = bus.stop.at;
    const [z0, z1] = [parkingLine + 0.1, FRONT.farKerb - 0.15];
    yellow.floor(bx - 6, z0, bx + 6, z0 + 0.12, y);
    yellow.floor(bx - 6, z1 - 0.12, bx + 6, z1, y);
    yellow.floor(bx - 6, z0, bx - 5.88, z1, y);
    yellow.floor(bx + 5.88, z0, bx + 6, z1, y);
    for (let x = bx - 5.2; x < bx + 5.2; x += 0.8) yellow.floor(x, (z0 + z1) / 2 - 0.05, x + 0.4, (z0 + z1) / 2 + 0.05, y);
    for (const [q, color] of [[white, 0xe8e6de], [yellow, 0xe8c030]] as const) {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(q.build(), material);
      mesh.receiveShadow = true;
      this.add(mesh);
      this.surfaces.push({ material, dry: material.color.clone(), roughness: 0.7, soaks: 0.5 });
    }
  }
}
