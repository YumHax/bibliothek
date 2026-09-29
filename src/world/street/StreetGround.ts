import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { seasonalLawn } from '../props/outdoors/paint';
import { QuadBuilder } from './QuadBuilder';
import { asphaltTile, kerbTile, lawnTile, pavingTile, type Tile } from './groundTextures';
import { CORNER_BAY, FRONT, KERB_HEIGHT, PARK_STREET, SIDE_STREET, STREET_ENDS, STREET_PLAN } from './streetPlan';
import { STREET_SNOW } from './snowCover';
import { GROUND, onSurface } from '../surface/layers';
import { VALUE_NOISE, afterChunk, patchShader } from '../materials/shaderPatch';
import { envBoost } from '../materials/envBoost';

/** The side street runs south to the building across its end. */
const SIDE_END = -60;
export const LAWN_REACH = { x: -115, z: 100 };
/** The lawn's height: a little under the pavement. */
export const LAWN_Y = -0.02;
const SNOW = new THREE.Color(0xf2f4f8);
/** The traffic lanes' middles (|z|), where the wheels polish their tracks either side. */
const LANE_CENTRE = 1.6;
/** The granite kerbstones' tops on the pavement's edge, the gutter along the road's (metres wide). */
const KERBSTONE = 0.3;
const GUTTER = 0.14;

/*
 * What breaks up the tiling (the asphalt repeats every 4 m, the paving every 2.4 m): low-frequency
 * patches in zone-local metres over both, and on the asphalt oil stains in the parking lanes where
 * the cars stand and the wheels' polished tracks down the traffic lanes (a touch darker and
 * smoother). Zone-local: the ground's meshes sit at the zone's origin, so object space is the plan's.
 */
const MACRO_VERTEX = 'vGroundXZ = transformed.xz;';
const MACRO_PAVING = /* glsl */ `
  float groundMacro = patchNoise(vGroundXZ * 0.09) * 0.6 + patchNoise(vGroundXZ * 0.31 + 17.0) * 0.4;
  diffuseColor.rgb *= 0.9 + 0.2 * groundMacro;
`;
const MACRO_ROAD = MACRO_PAVING + /* glsl */ `
  float frontRoad = step(${PARK_STREET.farKerb.toFixed(1)}, vGroundXZ.x) * step(abs(vGroundXZ.y), ${FRONT.farKerb.toFixed(1)});
  float parkingLane = frontRoad * step(${STREET_PLAN.parkingLine.toFixed(1)}, abs(vGroundXZ.y));
  float oil = parkingLane * smoothstep(0.58, 0.8, patchNoise(vec2(vGroundXZ.x * 0.55, vGroundXZ.y * 1.4)));
  diffuseColor.rgb *= 1.0 - 0.38 * oil;
  float laneSide = abs(abs(vGroundXZ.y) - ${LANE_CENTRE.toFixed(2)});
  float tracks = frontRoad * step(abs(vGroundXZ.y), ${(STREET_PLAN.parkingLine - 0.4).toFixed(1)}) * (1.0 - smoothstep(0.12, 0.4, abs(laneSide - 0.78)));
  diffuseColor.rgb *= 1.0 - 0.09 * tracks;
`;
const MACRO_ROUGHNESS = 'roughnessFactor *= (1.0 - 0.3 * tracks) * (0.9 + 0.2 * groundMacro);';
const MACRO_PAVING_ROUGHNESS = 'roughnessFactor *= 0.9 + 0.2 * groundMacro;';
/** How far the maps' height reads (three's bump scale), road and pavement. */
const BUMP = { asphalt: 0.35, paving: 0.7 };

/*
 * The paint on the road worn away: in patches (low-frequency noise in zone-local metres), in grains
 * (the aggregate showing through), and most where the wheels run (the traffic lanes' tracks). Worn
 * paint shows the asphalt's grey and is as rough as it.
 */
const WORN_MARKINGS = /* glsl */ `
  float wornPatch = smoothstep(0.45, 0.85, patchNoise(vGroundXZ * 0.7) * 0.7 + patchNoise(vGroundXZ * 2.3 + 5.0) * 0.3);
  float wornGrain = step(0.62, patchNoise(vGroundXZ * 38.0));
  float wornTrack = 1.0 - smoothstep(0.15, 0.45, abs(abs(abs(vGroundXZ.y) - ${LANE_CENTRE.toFixed(2)}) - 0.78));
  float worn = clamp(wornPatch * 0.55 + wornGrain * 0.35 + wornTrack * 0.35, 0.0, 0.9);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.076, 0.08), worn);
`;

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
    const kerbs = new QuadBuilder(1);
    // Front Street's two pavements, their edge dropped at the crossings (`droppedKerb`: a ramp down to a low lip).
    const { run } = STREET_PLAN.droppedKerb;
    paving.floor(PARK_STREET.nearKerb, FRONT.ourLine, SIDE_STREET.nearKerb, FRONT.nearKerb - run, 0);
    frontEdge(paving, kerbs, PARK_STREET.nearKerb, SIDE_STREET.nearKerb, -1);
    paving.floor(SIDE_STREET.farKerb, FRONT.ourLine, east, FRONT.nearKerb, 0);
    paving.floor(PARK_STREET.hedge - 1, FRONT.farKerb + run, east, FRONT.farLine, 0);
    paving.floor(PARK_STREET.hedge - 1, FRONT.farKerb, PARK_STREET.farKerb, FRONT.farKerb + run, 0);
    frontEdge(paving, kerbs, PARK_STREET.farKerb, east, 1);
    paving.floor(PARK_STREET.nearKerb, south, PARK_STREET.line, FRONT.ourLine, 0);
    // The bay at our building's corner, paved up to the collection room's wall and the kitchen wing.
    paving.floor(CORNER_BAY.x0, CORNER_BAY.z0, CORNER_BAY.x1, CORNER_BAY.z1, 0);
    paving.floor(PARK_STREET.hedge - 1, south, PARK_STREET.farKerb, FRONT.farKerb, 0);
    paving.floor(SIDE_STREET.line, SIDE_END, SIDE_STREET.nearKerb, FRONT.ourLine, 0);
    paving.floor(SIDE_STREET.farKerb, SIDE_END, SIDE_STREET.farLine, FRONT.ourLine, 0);

    // Kerb faces, each facing the road (Front Street's two with their dropped stretches, above); along every kerb line
    // the granite kerbstones' tops on the pavement's edge and the gutter's darker concrete in the road below them.
    const lines: [number, number, number, number][] = [
      [PARK_STREET.nearKerb, FRONT.nearKerb, SIDE_STREET.nearKerb, FRONT.nearKerb],
      [SIDE_STREET.farKerb, FRONT.nearKerb, east, FRONT.nearKerb],
      [east, FRONT.farKerb, PARK_STREET.farKerb, FRONT.farKerb],
      [PARK_STREET.nearKerb, south, PARK_STREET.nearKerb, FRONT.nearKerb],
      [PARK_STREET.farKerb, FRONT.farKerb, PARK_STREET.farKerb, south],
      [SIDE_STREET.nearKerb, FRONT.nearKerb, SIDE_STREET.nearKerb, SIDE_END],
      [SIDE_STREET.farKerb, SIDE_END, SIDE_STREET.farKerb, FRONT.nearKerb],
    ];
    const tops = new QuadBuilder(1);
    const gutters = new QuadBuilder(1);
    lines.forEach(([ax, az, bx, bz], i) => {
      if (i !== 0 && i !== 2) kerbs.wall(ax, az, bx, bz, r, 0);
      // The road's side of the line (the face's normal), and the pavement's.
      const length = Math.hypot(bx - ax, bz - az);
      const [nx, nz] = [-(bz - az) / length, (bx - ax) / length];
      const rect = (d0: number, d1: number): [number, number, number, number] => {
        const xs = [ax + nx * d0, bx + nx * d0, ax + nx * d1, bx + nx * d1];
        const zs = [az + nz * d0, bz + nz * d0, az + nz * d1, bz + nz * d1];
        return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
      };
      const [gx0, gz0, gx1, gz1] = rect(0, GUTTER);
      gutters.floor(gx0, gz0, gx1, gz1, r + GROUND.marking.lift);
      const [tx0, tz0, tx1, tz1] = rect(-KERBSTONE, 0);
      // Front Street's kerbstones break at the crossings, where the pavement ramps down instead.
      const along = Math.abs(nz) > 0.5 && i < 3;
      for (const [x0, x1] of along ? outsideCrossings(tx0, tx1) : [[tx0, tx1] as [number, number]]) tops.floor(x0, tz0, x1, tz1, GROUND.marking.lift);
    });

    const lawn = new QuadBuilder(1).floor(LAWN_REACH.x, south, PARK_STREET.hedge - 1, LAWN_REACH.z, LAWN_Y);

    const asphalt = asphaltTile(anisotropy);
    macro(this.addSurface(road.build(), asphalt, 0.92, 1, 0xffffff, BUMP.asphalt).material as THREE.MeshStandardMaterial, true);
    macro(this.addSurface(paving.build(), pavingTile(anisotropy), 0.88, 0.7, 0xffffff, BUMP.paving).material as THREE.MeshStandardMaterial, false);
    this.addRepairs(asphalt);
    const kerb = kerbTile(anisotropy);
    this.addSurface(kerbs.build(), kerb, 0.8, 0.6);
    onSurface(this.addSurface(tops.build(), kerb, 0.75, 0.6, 0xd8d6d0).material as THREE.MeshStandardMaterial, GROUND.marking);
    onSurface(this.addSurface(gutters.build(), kerb, 0.9, 1, 0x86868a).material as THREE.MeshStandardMaterial, GROUND.marking);
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

  private addSurface(geometry: THREE.BufferGeometry, tile: Tile, roughness: number, soaks: number, color = 0xffffff, bumpScale = 0): THREE.Mesh {
    // uvs are in metres: one texture repeat per tile (the height and roughness maps with it).
    for (const t of [tile.texture, tile.bump, tile.roughness]) t?.repeat.set(1 / tile.metres, 1 / tile.metres);
    // Reflects the sky a little under a lit room's share (`envBoost`: three ignores `envMapIntensity` here).
    const material = envBoost(new THREE.MeshStandardMaterial({ map: tile.texture, color, roughness }), 0.6);
    if (tile.bump && bumpScale > 0) {
      material.bumpMap = tile.bump;
      material.bumpScale = bumpScale;
    }
    if (tile.roughness) material.roughnessMap = tile.roughness;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.add(mesh);
    this.surfaces.push({ material, dry: material.color.clone(), roughness, soaks });
    return mesh;
  }

  /** The road's patched repairs (`STREET_PLAN.roadPatches`): newer, darker asphalt over whatever lines were there (`GROUND.grate`). */
  private addRepairs(asphalt: Tile): void {
    const q = new QuadBuilder(1);
    const y = -KERB_HEIGHT + GROUND.grate.lift;
    for (const [x0, z0, x1, z1] of STREET_PLAN.roadPatches) q.floor(x0, z0, x1, z1, y);
    if (q.isEmpty) return;
    // The road's own maps (clones share the image: one upload), newer and so a touch rougher.
    const map = asphalt.texture.clone();
    map.anisotropy = 1;
    const material = onSurface(new THREE.MeshStandardMaterial({ map, color: 0x8c8c90, roughness: 0.9 }), GROUND.grate);
    if (asphalt.bump) {
      material.bumpMap = asphalt.bump;
      material.bumpScale = BUMP.asphalt;
    }
    const mesh = new THREE.Mesh(q.build(), material);
    mesh.receiveShadow = true;
    this.add(mesh);
    this.surfaces.push({ material, dry: material.color.clone(), roughness: 0.9, soaks: 1 });
  }

  /**
   * Paint on the road (`GROUND.marking`): the crossings' zebras, the stop lines before the one with
   * lights, the lane dashes, the parking lines and the double centre line of Front Street and Park
   * Street; the bus stop's yellow box. White and yellow, one mesh each.
   */
  private addMarkings(): void {
    const white = new QuadBuilder(1);
    const yellow = new QuadBuilder(1);
    const y = -KERB_HEIGHT + GROUND.marking.lift;
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
      const material = wornPaint(onSurface(new THREE.MeshStandardMaterial({ color, roughness: 0.7 }), GROUND.marking));
      const mesh = new THREE.Mesh(q.build(), material);
      mesh.receiveShadow = true;
      this.add(mesh);
      this.surfaces.push({ material, dry: material.color.clone(), roughness: 0.7, soaks: 0.5 });
    }
  }
}

/** The x spans of [x0, x1] off Front Street's crossings. */
function outsideCrossings(x0: number, x1: number): [number, number][] {
  const out: [number, number][] = [];
  let a = x0;
  for (const c of [...STREET_PLAN.crossings].sort((p, q) => p.from - q.from)) {
    if (c.to <= a || c.from >= x1) continue;
    if (c.from > a) out.push([a, c.from]);
    a = Math.max(a, c.to);
  }
  if (a < x1) out.push([a, x1]);
  return out;
}

/**
 * One of Front Street's pavements' edge strip (`side` -1 the near one, at z = nearKerb; 1 the far
 * one) from x0 to x1 and its kerb face: level paving and a full kerb off the crossings; across one
 * the pavement ramps down to a lip `droppedKerb.rise` over the road (with a cheek at each end),
 * the kerb face that low. `relief/ground.groundHeight` is the same shape.
 */
function frontEdge(paving: QuadBuilder, kerbs: QuadBuilder, x0: number, x1: number, side: -1 | 1): void {
  const { rise, run } = STREET_PLAN.droppedKerb;
  const r = -KERB_HEIGHT;
  const kerb = side < 0 ? FRONT.nearKerb : FRONT.farKerb;
  const inner = kerb + side * run;
  const [z0, z1] = side < 0 ? [inner, kerb] : [kerb, inner];
  // The kerb face runs a -> b so it faces the road (+z for the near kerb, -z for the far one).
  const face = (xa: number, xb: number, top: number): void => {
    if (side < 0) kerbs.wall(xa, kerb, xb, kerb, r, top);
    else kerbs.wall(xb, kerb, xa, kerb, r, top);
  };
  for (const [a, b] of outsideCrossings(x0, x1)) {
    paving.floor(a, z0, b, z1, 0);
    face(a, b, 0);
  }
  const lip = r + rise;
  const up = new THREE.Vector3(0, 1, 0);
  for (const c of STREET_PLAN.crossings) {
    if (c.to <= x0 || c.from >= x1) continue;
    paving.surface([c.from, lip, kerb, c.to, lip, kerb, c.to, 0, inner, c.from, 0, inner], false, up);
    face(c.from, c.to, lip);
    // The cheeks: the level pavement's end down to the ramp, facing into the crossing.
    kerbs.surface([c.from, 0, kerb, c.from, lip, kerb, c.from, 0, inner, c.from, 0, inner], true, new THREE.Vector3(1, 0, 0));
    kerbs.surface([c.to, 0, kerb, c.to, lip, kerb, c.to, 0, inner, c.to, 0, inner], true, new THREE.Vector3(-1, 0, 0));
  }
}

/** Breaks up the tiling of a ground material (see `MACRO_PAVING`); `road` adds the oil stains and the tyre tracks. */
function macro(material: THREE.MeshStandardMaterial, road: boolean): void {
  patchShader(material, road ? 'streetGroundRoad' : 'streetGroundPaving', (shader) => {
    shader.vertexShader = 'varying vec2 vGroundXZ;\n' + afterChunk(shader.vertexShader, 'begin_vertex', MACRO_VERTEX);
    let fragment = 'varying vec2 vGroundXZ;\n' + VALUE_NOISE + afterChunk(shader.fragmentShader, 'map_fragment', road ? MACRO_ROAD : MACRO_PAVING);
    fragment = afterChunk(fragment, 'roughnessmap_fragment', road ? MACRO_ROUGHNESS : MACRO_PAVING_ROUGHNESS);
    shader.fragmentShader = fragment;
  });
}

/** The markings' paint worn away (see `WORN_MARKINGS`), rougher where it is. Returns the material. */
function wornPaint(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  return patchShader(material, 'streetWornMarkings', (shader) => {
    shader.vertexShader = 'varying vec2 vGroundXZ;\n' + afterChunk(shader.vertexShader, 'begin_vertex', MACRO_VERTEX);
    let fragment = 'varying vec2 vGroundXZ;\n' + VALUE_NOISE + afterChunk(shader.fragmentShader, 'map_fragment', WORN_MARKINGS);
    fragment = afterChunk(fragment, 'roughnessmap_fragment', 'roughnessFactor = mix(roughnessFactor, 0.92, worn);');
    shader.fragmentShader = fragment;
  });
}
