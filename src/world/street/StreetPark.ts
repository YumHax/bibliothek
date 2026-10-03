import * as THREE from 'three';
import { seededRandom } from '@/covers/generated/canvasUtils';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import { currentSeason } from '@/time/season';
import { FLOWER_BEDS, PARK_PATHS, PATH_WIDTH } from '../city/park';
import { gravelTile } from './groundTextures';
import { snowCovered } from './snowCover';
import { FLAT_IN_STREET, PARK_STREET, STREET_ENDS, type Vec2 } from './streetPlan';
import { GROUND, onSurface } from '../surface/layers';
import { buildParkFeatures, type ParkFeatures } from './StreetParkFeatures';

export interface StreetParkOptions {
  anisotropy: number;
  /** The lawn's height (a little under the pavement) and how far out it runs (x). */
  lawnY: number;
  reach: number;
  /** The walkable street's own park: its walked gardens' fence, trees and playground collide (`StreetParkFeatures`). */
  walkable?: boolean;
}

/** Flowers per square metre of bed, their colours; how high they stand. */
const FLOWERS_PER_M2 = 7;
const BLOOMS = [0xd8324a, 0xf2c83a, 0xf4f0e8, 0x8a4ab8, 0xe8702a, 0xf28ab0];
const STEM = 0.28;

/** A point of the park (`city/park`, the flat's frame) in the street's. */
function inStreet([x, z]: readonly [number, number]): Vec2 {
  return [x + FLAT_IN_STREET.x, z + FLAT_IN_STREET.z];
}

/**
 * The near stretch of the park behind the hedge as the window view paints it (`city/park`): the
 * gravel paths (`PARK_PATHS`, `PATH_WIDTH` wide) laid on the lawn from the gate and the corner,
 * as far as the lawn runs; the round flower beds (`FLOWER_BEDS`), dug soil with flowers in season
 * (spring and summer; a few in early autumn; bare in winter). Flat things on the lawn (`GROUND.marking`),
 * one mesh each plus the flowers instanced; and the park's things in 3D (`buildParkFeatures`: the pond and its
 * fountain, the bandstand, the playground, the willows, the far shrubbery). Seen from elsewhere (the views of the
 * street, the roof) nothing collides; the walkable street's (`walkable`) has the gardens behind the gate fenced in.
 */
export class StreetPark extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[];
  private readonly features: ParkFeatures;

  constructor(options: StreetParkOptions) {
    super();
    this.name = 'StreetPark';
    const y = options.lawnY + GROUND.marking.lift;
    const inside = (x: number, z: number): boolean => x > options.reach && x < PARK_STREET.hedge - 0.6 && z > STREET_ENDS.south;

    // The paths: a quad per straight stretch, clipped to the lawn. The uvs are the ground's own (metres in x and z,
    // the gravel has no grain): where two stretches overlap at a bend they show the same gravel, nothing to flicker.
    const positions: number[] = [];
    const uvs: number[] = [];
    const tile = gravelTile(options.anisotropy);
    for (const path of PARK_PATHS) {
      for (let i = 1; i < path.length; i++) {
        const a = inStreet(path[i - 1]!);
        const b = inStreet(path[i]!);
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        // Clip the stretch to the lawn (in steps: the lawn is a rectangle, the stretch straight).
        const steps = Math.max(1, Math.ceil(length / 2));
        for (let k = 0; k < steps; k++) {
          const t0 = k / steps;
          const t1 = (k + 1) / steps;
          const p0: Vec2 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
          const p1: Vec2 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
          if (!inside(...p0) || !inside(...p1)) continue;
          const nx = (-(b[1] - a[1]) / length) * (PATH_WIDTH / 2);
          const nz = ((b[0] - a[0]) / length) * (PATH_WIDTH / 2);
          const corners: Vec2[] = [[p0[0] - nx, p0[1] - nz], [p1[0] - nx, p1[1] - nz], [p1[0] + nx, p1[1] + nz], [p0[0] - nx, p0[1] - nz], [p1[0] + nx, p1[1] + nz], [p0[0] + nx, p0[1] + nz]];
          for (const [x, z] of corners) {
            positions.push(x, y, z);
            uvs.push(x / tile.metres, z / tile.metres);
          }
        }
      }
    }
    if (positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.computeVertexNormals();
      // Two faces meet at every step: the quads were wound either way round, so draw both sides.
      const material = onSurface(snowCovered(new THREE.MeshStandardMaterial({ map: tile.texture, roughness: 0.95, side: THREE.DoubleSide })), GROUND.marking);
      const paths = new THREE.Mesh(geometry, material);
      paths.receiveShadow = true;
      this.add(paths);
    } else tile.texture.dispose();

    // The flower beds near enough to see: dug soil, and flowers while the season has them.
    const beds = FLOWER_BEDS.map(([x, z, r]) => ({ at: inStreet([x, z]), r })).filter(({ at: [x, z], r }) => inside(x - r, z) && inside(x + r, z));
    const season = currentSeason();
    const bloom = season.name === 'spring' ? 0.8 : season.name === 'summer' ? 1 : season.name === 'autumn' ? 0.4 * (1 - season.depth) : 0;
    // Over the paths where a bed rounds a crossing of them.
    const soil = onSurface(new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.98 }), GROUND.patch);
    const random = seededRandom(707);
    const flowers: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    for (const { at, r } of beds) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2), soil);
      disc.position.set(at[0], y, at[1]);
      disc.receiveShadow = true;
      this.add(disc);
      const count = Math.round(Math.PI * r * r * FLOWERS_PER_M2 * bloom);
      for (let i = 0; i < count; i++) {
        const a = random() * Math.PI * 2;
        const d = Math.sqrt(random()) * (r - 0.15);
        const h = STEM * (0.7 + random() * 0.6);
        flowers.push(new THREE.Matrix4().makeScale(1, h / STEM, 1).setPosition(at[0] + Math.cos(a) * d, y, at[1] + Math.sin(a) * d));
        colors.push(new THREE.Color(BLOOMS[Math.floor(random() * BLOOMS.length)]!));
      }
    }
    if (flowers.length) {
      // A flower: a thin stem and its bloom on top, in one merged shape (the bloom's colour per instance).
      const bloomGeometry = new THREE.IcosahedronGeometry(0.06, 0).translate(0, STEM, 0);
      const mesh = new THREE.InstancedMesh(bloomGeometry, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }), flowers.length);
      const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.01, STEM, 4).translate(0, STEM / 2, 0), new THREE.MeshStandardMaterial({ color: 0x3f6a2a, roughness: 0.9 }), flowers.length);
      flowers.forEach((m, i) => {
        mesh.setMatrixAt(i, m);
        stems.setMatrixAt(i, m);
        mesh.setColorAt(i, colors[i]!);
      });
      for (const m of [mesh, stems]) {
        m.castShadow = false;
        m.receiveShadow = true;
        m.computeBoundingSphere();
        this.add(m);
      }
    }

    this.features = buildParkFeatures(this, options.lawnY, options.walkable ?? false);
    this.colliders = this.features.colliders;
  }

  update(dt: number): void {
    this.features.update(dt);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }
}
