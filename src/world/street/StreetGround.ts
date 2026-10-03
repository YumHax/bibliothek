import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { seasonalLawn } from '../props/outdoors/paint';
import { QuadBuilder } from './QuadBuilder';
import { asphaltTile, kerbTile, lawnTile, pavingTile, settsTile, tactileTile, type Tile } from './groundTextures';
import { CORNER_BAY, FACADES, FRONT, KERB_HEIGHT, LAWN_REACH, PARK_PARKING, PARK_STREET, ROAD_WEAR, SHOP_ZONE_OF, SIDE_STREET, STREET_ENDS, STREET_PLAN, shopDoors, type FacadeSpec } from './streetPlan';
import { STREET_SNOW, STREET_WET } from './snowCover';
import { KERB_CORNERS, KERB_RADIUS } from './relief/ground';
import { GROUND, onSurface } from '../surface/layers';
import { VALUE_NOISE, afterChunk, patchShader } from '../materials/shaderPatch';
import { envBoost } from '../materials/envBoost';

/** The side street runs south to the building across its end. */
const SIDE_END = STREET_ENDS.side;
/** Where the lawn stops (the plan's: other builders read it from here too). */
export { LAWN_REACH };
/** The lawn's height: a little under the pavement. */
export const LAWN_Y = -0.02;
const SNOW = new THREE.Color(0xf2f4f8);
/** The traffic lanes' middles (|z|), where the wheels polish their tracks either side. */
const LANE_CENTRE = 1.6;
/** The granite kerbstones' tops on the pavement's edge, the gutter along the road's (metres wide). */
const KERBSTONE = 0.3;
const GUTTER = 0.14;
/** A rounded kerb's arc: this many straight pieces a quarter turn. */
const ARC_PIECES = 8;
/** The blister paving behind each dropped kerb (metres deep), the stone sill before each door (deep, wider than the door). */
const TACTILE_DEPTH = 0.8;
const SILL = { depth: 0.34, width: 1.5 } as const;

/** The uniforms the ground's shaders read: the snow lying (shared with `snowCovered`), the wet, how much of the snow is slush. */
const SLUSH = { value: 0 };

const f = (n: number): string => n.toFixed(2);

/*
 * What breaks up the tiling (the asphalt repeats every 4 m, the paving every 2.4 m): low-frequency
 * patches in zone-local metres over both, and on the asphalt oil stains in the parking lanes where
 * the cars stand and the wheels' polished tracks down the traffic lanes (a touch darker and
 * smoother). Zone-local: the ground's meshes sit at the zone's origin, so object space is the plan's.
 */
const MACRO_VERTEX = 'vGroundXZ = transformed.xz;';
const GROUND_PARS = /* glsl */ `
varying vec2 vGroundXZ;
uniform float streetSnow;
uniform float streetSlush;
uniform float streetWet;
`;
const MACRO_PAVING = /* glsl */ `
  float groundMacro = patchNoise(vGroundXZ * 0.09) * 0.6 + patchNoise(vGroundXZ * 0.31 + 17.0) * 0.4;
  diffuseColor.rgb *= 0.9 + 0.2 * groundMacro;
`;

/** Each pothole's patch: the hole a darker, broken dish (water stands in it when wet), its edge crumbled lighter. */
const POTHOLES = ROAD_WEAR.potholes
  .map(([x, z, r]) => /* glsl */ `
  {
    vec2 d = vGroundXZ - vec2(${f(x)}, ${f(z)});
    float l = length(d);
    float rr = ${f(r)} * (0.78 + 0.44 * patchNoise(d * 9.0 + vec2(${f(x)}, ${f(z)})));
    potHole = max(potHole, 1.0 - smoothstep(rr * 0.82, rr, l));
    potRim = max(potRim, smoothstep(rr * 0.85, rr, l) * (1.0 - smoothstep(rr, rr * 1.3, l)));
  }`)
  .join('');

const MACRO_ROAD = MACRO_PAVING + /* glsl */ `
  float frontRoad = step(${f(PARK_STREET.farKerb)}, vGroundXZ.x) * step(abs(vGroundXZ.y), ${f(FRONT.farKerb)});
  float parkRoad = (1.0 - frontRoad) * step(vGroundXZ.x, ${f(PARK_STREET.nearKerb)}) * step(vGroundXZ.y, ${f(FRONT.nearKerb)});
  float parkingLane = frontRoad * step(${f(STREET_PLAN.parkingLine)}, abs(vGroundXZ.y));
  float oil = parkingLane * smoothstep(0.58, 0.8, patchNoise(vec2(vGroundXZ.x * 0.55, vGroundXZ.y * 1.4)));
  diffuseColor.rgb *= 1.0 - 0.38 * oil;
  float laneSide = abs(abs(vGroundXZ.y) - ${f(LANE_CENTRE)});
  float tracks = frontRoad * step(abs(vGroundXZ.y), ${f(STREET_PLAN.parkingLine - 0.4)}) * (1.0 - smoothstep(0.12, 0.4, abs(laneSide - 0.78)));
  // Park Street's two lanes, their tracks running along z.
  float parkSide = abs(abs(vGroundXZ.x - ${f((PARK_STREET.nearKerb + PARK_STREET.farKerb) / 2)}) - ${f(LANE_CENTRE + 0.55)});
  float parkTracks = parkRoad * (1.0 - smoothstep(0.12, 0.4, abs(parkSide - 0.78)));
  diffuseColor.rgb *= 1.0 - 0.09 * max(tracks, parkTracks);

  // Cracks where the surface is tired (only some stretches), and the sealed ones: tar run along them.
  float crackField = smoothstep(0.52, 0.76, patchNoise(vGroundXZ * 0.12 + 31.0));
  float crackN = patchNoise(vGroundXZ * 1.7 + 3.0) * 0.65 + patchNoise(vGroundXZ * 4.1) * 0.35;
  float crackAa = fwidth(crackN);
  float crack = (1.0 - smoothstep(0.01, 0.01 + crackAa * 1.5, abs(crackN - 0.5))) * crackField * (1.0 - smoothstep(0.03, 0.09, crackAa));
  diffuseColor.rgb *= 1.0 - 0.5 * crack;
  float sealN = patchNoise(vGroundXZ * 0.9 + 77.0) * 0.7 + patchNoise(vGroundXZ * 2.6 + 9.0) * 0.3;
  float sealAa = fwidth(sealN);
  float sealed = (1.0 - smoothstep(0.018, 0.018 + sealAa * 1.5, abs(sealN - 0.5))) * smoothstep(0.62, 0.8, patchNoise(vGroundXZ * 0.08 + 5.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.045, 0.05), sealed * 0.85);
  float potHole = 0.0;
  float potRim = 0.0;
  ${POTHOLES}
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.5 + 0.015, potHole);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.29, 0.28), potRim * 0.45);

  // Snow: the wheels clear their tracks (to slush as it thaws), the ploughed snow lies banked along the kerbs, the parked lanes stay white.
  float kerbBank = frontRoad * (1.0 - smoothstep(0.1, 0.7, ${f(FRONT.farKerb)} - abs(vGroundXZ.y)));
  float cleared = max(tracks, parkTracks) * 0.85 + frontRoad * (1.0 - parkingLane) * 0.25;
  float roadSnow = streetSnow * clamp(1.0 - cleared + 0.6 * kerbBank, 0.0, 1.0) * (0.85 + 0.15 * groundMacro);
  vec3 snowColour = mix(vec3(0.92, 0.94, 0.97), vec3(0.46, 0.45, 0.43), streetSlush * (0.35 + 0.65 * cleared));
  diffuseColor.rgb = mix(diffuseColor.rgb, snowColour, roadSnow * 0.92);
  float groundSnow = roadSnow;
`;
const MACRO_ROAD_ROUGHNESS = /* glsl */ `
  roughnessFactor *= (1.0 - 0.3 * max(tracks, parkTracks)) * (0.9 + 0.2 * groundMacro);
  roughnessFactor = mix(roughnessFactor, 0.55, sealed * 0.7);
  roughnessFactor = mix(roughnessFactor, 0.06, potHole * streetWet);
  roughnessFactor = mix(roughnessFactor, mix(0.82, 0.25, streetSlush), groundSnow);
`;

/** How far a point of pavement is from the foot of the nearest wall (our row, the bay's walls, the far row, Park Street's, the side street's). */
const WALL_FOOT = /* glsl */ `
  vec2 gp = vGroundXZ;
  float footD = abs(gp.y - ${f(FRONT.farLine)});
  if ((gp.x > ${f(CORNER_BAY.x1)} && gp.x < ${f(SIDE_STREET.line)}) || gp.x > ${f(SIDE_STREET.farLine)}) footD = min(footD, abs(gp.y - ${f(FRONT.ourLine)}));
  if (gp.x > ${f(CORNER_BAY.x0 - 0.5)} && gp.x < ${f(CORNER_BAY.x1 + 0.5)} && gp.y < ${f(FRONT.ourLine)}) {
    if (gp.y > ${f(CORNER_BAY.z0)}) footD = min(footD, abs(gp.x - ${f(CORNER_BAY.x1)}));
    footD = min(footD, abs(gp.y - ${f(CORNER_BAY.z0)}));
  }
  if (gp.y < ${f(CORNER_BAY.z0)} && gp.x > ${f(PARK_STREET.nearKerb)}) footD = min(footD, abs(gp.x - ${f(PARK_STREET.line)}));
  if (gp.y < ${f(FRONT.ourLine)} && gp.x > ${f(SIDE_STREET.line - 2.0)}) footD = min(footD, min(abs(gp.x - ${f(SIDE_STREET.line)}), abs(gp.x - ${f(SIDE_STREET.farLine)})));
  float wallFoot = 1.0 - smoothstep(0.0, 0.55, footD);
`;
const PAVING_SNOW = /* glsl */ `
  // Trodden down the middle of the pavements where the passers-by walk, banked at the walls' feet.
  float trodden = (1.0 - smoothstep(0.25, 0.9, abs(abs(gp.y) - 10.35))) * step(${f(FRONT.farKerb)}, abs(gp.y));
  float paveSnow = streetSnow * clamp(1.0 - 0.4 * trodden + 0.25 * wallFoot, 0.0, 1.0) * (0.85 + 0.15 * groundMacro);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.92, 0.94, 0.97), vec3(0.6, 0.59, 0.57), streetSlush * trodden), paveSnow * 0.9);
  float groundSnow = paveSnow;
  diffuseColor.rgb *= 1.0 - 0.22 * wallFoot * (1.0 - paveSnow * 0.7);
`;
const MACRO_PAVING_ROUGHNESS = /* glsl */ `
  roughnessFactor *= 0.9 + 0.2 * groundMacro;
  roughnessFactor = mix(roughnessFactor, mix(0.82, 0.3, streetSlush), groundSnow);
`;
/** How far the maps' height reads (three's bump scale): road, pavement, setts, kerbs, blister paving. */
const BUMP = { asphalt: 0.35, paving: 0.7, setts: 1.1, kerb: 0.4, tactile: 0.9 };

/*
 * The paint on the road worn away: in patches (low-frequency noise in zone-local metres), in grains
 * (the aggregate showing through), and most where the wheels run (the traffic lanes' tracks). Worn
 * paint shows the asphalt's grey and is as rough as it.
 */
const WORN_MARKINGS = /* glsl */ `
  float wornPatch = smoothstep(0.45, 0.85, patchNoise(vGroundXZ * 0.7) * 0.7 + patchNoise(vGroundXZ * 2.3 + 5.0) * 0.3);
  float wornGrain = step(0.62, patchNoise(vGroundXZ * 38.0));
  float wornTrack = 1.0 - smoothstep(0.15, 0.45, abs(abs(abs(vGroundXZ.y) - ${f(LANE_CENTRE)}) - 0.78));
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
  /** Its snow is laid in its shader (`MACRO_*`: tracks, banks, trodden paths), not by tinting the whole of it. */
  shaderSnow?: boolean;
}

type Rect = [x0: number, z0: number, x1: number, z1: number];

/**
 * The ground of the street: the road (Front Street, Park Street, the cross street; asphalt a kerb
 * below the pavements, cracked and sealed in places, a pothole or two), the pavements (concrete
 * slabs, blister paving behind each dropped kerb, a granite sill before each door, the old setts in
 * the corner bay), the granite kerbs (rounded where two meet at a junction: `relief/ground`
 * `KERB_CORNERS`), the markings (the zebra, lane dashes and arrows, parking lines and Park Street's
 * bays, the double centre line, the give-way at Park Street's mouth) and the park's lawn beyond the
 * hedge. One mesh per material, uvs in metres. Rain darkens and glosses it (`wetness`), snow lies on
 * it with the tyre tracks and the trodden paths cleared and banks along the kerbs, going to slush as
 * it thaws, read from the sky twice a second.
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
    const paving = new QuadBuilder(1);
    const kerbs = new QuadBuilder(1);
    const tops = new QuadBuilder(1);
    const gutters = new QuadBuilder(1);
    const r = -KERB_HEIGHT;
    const pave = (x0: number, z0: number, x1: number, z1: number): void => cutCorners(paving, [x0, z0, x1, z1], 0, true);
    // Front Street from Park Street's far kerb to the building across its end; Park Street and the side street running south.
    cutCorners(road, [PARK_STREET.farKerb, FRONT.nearKerb, east, FRONT.farKerb], r, false);
    cutCorners(road, [PARK_STREET.farKerb, south, PARK_STREET.nearKerb, FRONT.nearKerb], r, false);
    cutCorners(road, [SIDE_STREET.nearKerb, SIDE_END, SIDE_STREET.farKerb, FRONT.nearKerb], r, false);

    // Front Street's two pavements, their edge dropped at the crossings (`droppedKerb`: a ramp down to a low lip).
    const { run } = STREET_PLAN.droppedKerb;
    const R = KERB_RADIUS;
    pave(PARK_STREET.nearKerb, FRONT.ourLine, SIDE_STREET.nearKerb, FRONT.nearKerb - run);
    frontEdge(paving, kerbs, PARK_STREET.nearKerb + R, SIDE_STREET.nearKerb - R, -1);
    pave(SIDE_STREET.farKerb, FRONT.ourLine, east, FRONT.nearKerb);
    pave(PARK_STREET.hedge - 1, FRONT.farKerb + run, east, FRONT.farLine);
    pave(PARK_STREET.hedge - 1, FRONT.farKerb, PARK_STREET.farKerb, FRONT.farKerb + run);
    frontEdge(paving, kerbs, PARK_STREET.farKerb + R, east, 1);
    // Across Park Street's mouth the far kerb is rounded off the road's corner: the strip it leaves is level pavement.
    paving.floor(PARK_STREET.farKerb, FRONT.farKerb, PARK_STREET.farKerb + R, FRONT.farKerb + run, 0);
    pave(PARK_STREET.nearKerb, south, PARK_STREET.line, FRONT.ourLine);
    pave(PARK_STREET.hedge - 1, south, PARK_STREET.farKerb, FRONT.farKerb);
    pave(SIDE_STREET.line, SIDE_END, SIDE_STREET.nearKerb, FRONT.ourLine);
    pave(SIDE_STREET.farKerb, SIDE_END, SIDE_STREET.farLine, FRONT.ourLine);
    // The rounded corners: their quarter of pavement and of road, the kerb round them.
    for (const corner of KERB_CORNERS) roundCorner(corner, road, paving, kerbs, tops, gutters);
    // The bay at our building's corner keeps its old granite setts, up to the collection room's wall and the kitchen wing.
    const setts = new QuadBuilder(1).floor(CORNER_BAY.x0, CORNER_BAY.z0, CORNER_BAY.x1, CORNER_BAY.z1, 0);

    // Kerb faces, each facing the road (Front Street's two with their dropped stretches, above); along every kerb line
    // the granite kerbstones' tops on the pavement's edge and the gutter's darker concrete in the road below them.
    // Each line stops short of a rounded corner at its ends (`trimToCorners`).
    const lines: [number, number, number, number][] = [
      [PARK_STREET.nearKerb, FRONT.nearKerb, SIDE_STREET.nearKerb, FRONT.nearKerb],
      [SIDE_STREET.farKerb, FRONT.nearKerb, east, FRONT.nearKerb],
      [east, FRONT.farKerb, PARK_STREET.farKerb, FRONT.farKerb],
      [PARK_STREET.nearKerb, south, PARK_STREET.nearKerb, FRONT.nearKerb],
      [PARK_STREET.farKerb, FRONT.farKerb, PARK_STREET.farKerb, south],
      [SIDE_STREET.nearKerb, FRONT.nearKerb, SIDE_STREET.nearKerb, SIDE_END],
      [SIDE_STREET.farKerb, SIDE_END, SIDE_STREET.farKerb, FRONT.nearKerb],
    ].map((line) => trimToCorners(line as [number, number, number, number]));
    lines.forEach(([ax, az, bx, bz], i) => {
      if (i !== 0 && i !== 2) kerbs.wall(ax, az, bx, bz, r, 0);
      // The road's side of the line (the face's normal), and the pavement's.
      const length = Math.hypot(bx - ax, bz - az);
      const [nx, nz] = [-(bz - az) / length, (bx - ax) / length];
      const rect = (d0: number, d1: number): Rect => {
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
    macro(this.addSurface(road.build(), asphalt, 0.92, 1, 0xffffff, BUMP.asphalt, true).material as THREE.MeshStandardMaterial, true);
    const pavingSurface = this.addSurface(paving.build(), pavingTile(anisotropy), 0.88, 0.7, 0xffffff, BUMP.paving, true);
    macro(pavingSurface.material as THREE.MeshStandardMaterial, false);
    macro(this.addSurface(setts.build(), settsTile(anisotropy), 0.8, 0.85, 0xffffff, BUMP.setts, true).material as THREE.MeshStandardMaterial, false);
    this.addRepairs(asphalt);
    const kerb = kerbTile(anisotropy);
    this.addSurface(kerbs.build(), kerb, 0.8, 0.6, 0xffffff, BUMP.kerb);
    onSurface(this.addSurface(tops.build(), kerb, 0.75, 0.6, 0xd8d6d0, BUMP.kerb).material as THREE.MeshStandardMaterial, GROUND.marking);
    onSurface(this.addSurface(gutters.build(), kerb, 0.9, 1, 0x86868a).material as THREE.MeshStandardMaterial, GROUND.marking);
    this.addSurface(lawn.build(), lawnTile(seasonalLawn('#5d8a3c'), anisotropy), 0.95, 0.2);
    this.addPavementInlays(anisotropy, kerb);
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
    STREET_WET.value = wetness * (1 - snowCover);
    // Slush: snow lying while the ground is wet (a thaw, rain on snow).
    SLUSH.value = THREE.MathUtils.clamp(wetness * 1.6, 0, 1) * (snowCover > 0.02 ? 1 : 0);
    for (const s of this.surfaces) {
      const wet = wetness * s.soaks;
      s.material.color.copy(s.dry).multiplyScalar(1 - 0.45 * wet);
      if (!s.shaderSnow) s.material.color.lerp(SNOW, snowCover * 0.85);
      s.material.roughness = THREE.MathUtils.lerp(s.roughness, 0.22, wet * (1 - snowCover));
    }
  }

  private addSurface(geometry: THREE.BufferGeometry, tile: Tile, roughness: number, soaks: number, color = 0xffffff, bumpScale = 0, shaderSnow = false): THREE.Mesh {
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
    this.surfaces.push({ material, dry: material.color.clone(), roughness, soaks, shaderSnow });
    return mesh;
  }

  /** The road's patched repairs (`STREET_PLAN.roadPatches`): newer, darker asphalt over whatever lines were there (`GROUND.patch`, a rank over the paint). */
  private addRepairs(asphalt: Tile): void {
    const q = new QuadBuilder(1);
    const y = -KERB_HEIGHT + GROUND.patch.lift;
    for (const [x0, z0, x1, z1] of STREET_PLAN.roadPatches) q.floor(x0, z0, x1, z1, y);
    if (q.isEmpty) return;
    // The road's own maps (clones share the image: one upload), newer and so a touch rougher.
    const map = asphalt.texture.clone();
    const material = onSurface(new THREE.MeshStandardMaterial({ map, color: 0x8c8c90, roughness: 0.9 }), GROUND.patch);
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
   * Laid into the pavement (`GROUND.marking`, where no paint is): the buff blister paving behind each
   * dropped kerb, across the crossing's width, and a granite sill before every street door on the
   * walked pavements (the shops' and the residents'; not the walk-in shops', standing out on their own step).
   */
  private addPavementInlays(anisotropy: number, kerb: Tile): void {
    const y = GROUND.marking.lift;
    const tactile = new QuadBuilder(1);
    const { run } = STREET_PLAN.droppedKerb;
    for (const c of STREET_PLAN.crossings) {
      for (const side of [-1, 1] as const) {
        const inner = (side < 0 ? FRONT.nearKerb : FRONT.farKerb) + side * run;
        const [z0, z1] = side < 0 ? [inner - TACTILE_DEPTH, inner] : [inner, inner + TACTILE_DEPTH];
        tactile.floor(c.from, z0, c.to, z1, y);
      }
    }
    const blister = tactileTile(anisotropy);
    onSurface(this.addSurface(tactile.build(), blister, 0.85, 0.6, 0xffffff, BUMP.tactile).material as THREE.MeshStandardMaterial, GROUND.marking);

    const sills = new QuadBuilder(1);
    const sill = (facade: FacadeSpec, along: number): void => {
      if (facade.openings?.some((o) => Math.abs(o.at - along) < o.width)) return;
      const [ax, az] = facade.from;
      const [bx, bz] = facade.to;
      const length = Math.hypot(bx - ax, bz - az);
      const [ux, uz] = [(bx - ax) / length, (bz - az) / length];
      // Out of the face along its left-hand normal.
      const [nx, nz] = [-uz, ux];
      const cx = ax + ux * along;
      const cz = az + uz * along;
      const a = [cx - (ux * SILL.width) / 2, cz - (uz * SILL.width) / 2];
      const b = [cx + (ux * SILL.width) / 2, cz + (uz * SILL.width) / 2];
      const xs = [a[0]!, b[0]!, a[0]! + nx * SILL.depth, b[0]! + nx * SILL.depth];
      const zs = [a[1]!, b[1]!, a[1]! + nz * SILL.depth, b[1]! + nz * SILL.depth];
      sills.floor(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), y);
    };
    for (const door of shopDoors()) {
      if (SHOP_ZONE_OF[door.shop.kind]) continue;
      const along = door.shop.door ?? (door.shop.from + door.shop.to) / 2;
      sill(door.facade, along);
    }
    for (const facade of FACADES) if (facade.door !== undefined) sill(facade, facade.door);
    // Over the kerb tops where a door stands near the corner (a rank up: in theirs, the two stones would fight).
    if (!sills.isEmpty) onSurface(this.addSurface(sills.build(), kerb, 0.7, 0.6, 0xc9c6bf, BUMP.kerb).material as THREE.MeshStandardMaterial, GROUND.patch);
  }

  /**
   * Paint on the road (`GROUND.marking`): the crossings' zebras, the stop lines before the one with
   * lights, the lane dashes and arrows, the parking lines and the double centre line of Front Street
   * and Park Street, Park Street's parking bays and its give-way into Front Street (the dashes and the
   * triangle); the bus stop's yellow box. White and yellow, one mesh each.
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
    // Lane arrows: straight on in both directions mid-street; westbound, ahead or right into Park Street before the junction.
    const laneZ = (STREET_PLAN.laneDash + parkingLine) / 2;
    for (const x of [16, 60]) {
      arrow(white, x, laneZ, 1, y, false);
      arrow(white, x + 6, -laneZ, -1, y, false);
    }
    arrow(white, -8, -laneZ, -1, y, true);
    // Park Street: the double centre line, down from the junction (short of the give-way), its parking lanes' edges and bays.
    const mid = (PARK_STREET.nearKerb + PARK_STREET.farKerb) / 2;
    const parkTop = FRONT.nearKerb - 2.2;
    for (const side of [-1, 1]) white.floor(mid + side * 0.12 - 0.05, STREET_ENDS.south, mid + side * 0.12 + 0.05, parkTop, y);
    for (const kerb of [PARK_STREET.nearKerb, PARK_STREET.farKerb]) {
      const inward = kerb === PARK_STREET.nearKerb ? -1 : 1;
      const edge = kerb + inward * PARK_PARKING;
      const [e0, e1] = [Math.min(edge, edge + inward * 0.1), Math.max(edge, edge + inward * 0.1)];
      white.floor(e0, STREET_ENDS.south, e1, parkTop - 1, y);
      // A tick across the lane at every bay's end, stopping short of the kerb (its gutter) on either side.
      const [t0, t1] = kerb < edge ? [kerb + 0.2, edge] : [edge, kerb - 0.2];
      for (let z = parkTop - 1; z > STREET_ENDS.south; z -= ROAD_WEAR.parkBay) white.floor(t0, z - 0.05, t1, z + 0.05, y);
    }
    // The give-way where Park Street's northbound lane (west of its middle: right-hand traffic) meets Front Street:
    // two lines of short dashes across the lane at the mouth, the triangle before them.
    const giveWay = FRONT.nearKerb - 0.6;
    for (let x = PARK_STREET.farKerb + PARK_PARKING; x + 0.6 <= mid - 0.2; x += 0.9) {
      white.floor(x, giveWay - 0.15, x + 0.6, giveWay, y);
      white.floor(x, giveWay - 0.5, x + 0.6, giveWay - 0.35, y);
    }
    triangle(white, (PARK_STREET.farKerb + PARK_PARKING + mid) / 2, giveWay - 1.4, y);
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

/** A rounded corner's square (between its corner point and its arc's centre), as a rectangle. */
function cornerSquare(corner: (typeof KERB_CORNERS)[number]): Rect {
  const [x, z] = corner.at;
  const [sx, sz] = corner.into;
  const x1 = x + sx * KERB_RADIUS;
  const z1 = z + sz * KERB_RADIUS;
  return [Math.min(x, x1), Math.min(z, z1), Math.max(x, x1), Math.max(z, z1)];
}

/**
 * A floor rectangle less the squares of the rounded corners it would cover (those of its own kind:
 * `pavement` true cuts the pavement-side corners, false the road-side ones), laid as what is left.
 * `roundCorner` fills the squares.
 */
function cutCorners(q: QuadBuilder, rect: Rect, y: number, pavement: boolean): void {
  let pieces: Rect[] = [rect];
  for (const corner of KERB_CORNERS) {
    if (corner.pavement !== pavement) continue;
    const [sx0, sz0, sx1, sz1] = cornerSquare(corner);
    const next: Rect[] = [];
    for (const p of pieces) {
      const [x0, z0, x1, z1] = p;
      if (x1 <= sx0 || x0 >= sx1 || z1 <= sz0 || z0 >= sz1) {
        next.push(p);
        continue;
      }
      if (x0 < sx0) next.push([x0, z0, sx0, z1]);
      if (x1 > sx1) next.push([sx1, z0, x1, z1]);
      const [mx0, mx1] = [Math.max(x0, sx0), Math.min(x1, sx1)];
      if (z0 < sz0) next.push([mx0, z0, mx1, sz0]);
      if (z1 > sz1) next.push([mx0, sz1, mx1, z1]);
    }
    pieces = next;
  }
  for (const [x0, z0, x1, z1] of pieces) if (x1 - x0 > 1e-4 && z1 - z0 > 1e-4) q.floor(x0, z0, x1, z1, y);
}

/** A kerb line with each end that stands on a rounded corner pulled back along it by the corner's radius. */
function trimToCorners([ax, az, bx, bz]: [number, number, number, number]): [number, number, number, number] {
  const length = Math.hypot(bx - ax, bz - az);
  const [ux, uz] = [(bx - ax) / length, (bz - az) / length];
  const at = (x: number, z: number): boolean => KERB_CORNERS.some((c) => Math.abs(c.at[0] - x) < 1e-3 && Math.abs(c.at[1] - z) < 1e-3);
  const R = KERB_RADIUS;
  if (at(ax, az)) [ax, az] = [ax + ux * R, az + uz * R];
  if (at(bx, bz)) [bx, bz] = [bx - ux * R, bz - uz * R];
  return [ax, az, bx, bz];
}

/**
 * One rounded corner (`KERB_CORNERS`): the quarter disc round the arc's centre in its own kind (the
 * pavement, or the road), the rest of its square up to the corner point in the other, the kerb face
 * round the arc facing the road, its kerbstones' tops and the gutter following it.
 */
function roundCorner(corner: (typeof KERB_CORNERS)[number], road: QuadBuilder, paving: QuadBuilder, kerbs: QuadBuilder, tops: QuadBuilder, gutters: QuadBuilder): void {
  const R = KERB_RADIUS;
  const r = -KERB_HEIGHT;
  const [kx, kz] = corner.at;
  const [sx, sz] = corner.into;
  const cx = kx + sx * R;
  const cz = kz + sz * R;
  // The arc from the tangent point on the line along z (x = kx) round to the one on the line along x (z = kz).
  const a0 = Math.atan2(0, -sx);
  const a1 = Math.atan2(-sz, 0);
  let sweep = a1 - a0;
  if (sweep > Math.PI) sweep -= Math.PI * 2;
  if (sweep < -Math.PI) sweep += Math.PI * 2;
  const arc = (radius: number): [number, number][] =>
    Array.from({ length: ARC_PIECES + 1 }, (_, i) => {
      const a = a0 + (sweep * i) / ARC_PIECES;
      return [cx + Math.cos(a) * radius, cz + Math.sin(a) * radius];
    });
  const up = new THREE.Vector3(0, 1, 0);
  const rim = arc(R);
  const inside = corner.pavement ? paving : road;
  const outside = corner.pavement ? road : paving;
  const yIn = corner.pavement ? 0 : r;
  const yOut = corner.pavement ? r : 0;
  for (let i = 0; i < ARC_PIECES; i++) {
    const [px, pz] = rim[i]!;
    const [qx, qz] = rim[i + 1]!;
    inside.surface([cx, yIn, cz, px, yIn, pz, qx, yIn, qz, qx, yIn, qz], false, up);
    outside.surface([kx, yOut, kz, px, yOut, pz, qx, yOut, qz, qx, yOut, qz], false, up);
  }
  // The kerb face round the arc, facing the road: away from the centre when the pavement is inside, towards it when the road is.
  for (let i = 0; i < ARC_PIECES; i++) {
    const [px, pz] = rim[i]!;
    const [qx, qz] = rim[i + 1]!;
    const [mx, mz] = [(px + qx) / 2 - cx, (pz + qz) / 2 - cz];
    // QuadBuilder.wall faces (-dz, dx) of a -> b.
    const facesOut = -(qz - pz) * mx + (qx - px) * mz > 0;
    if (facesOut === corner.pavement) kerbs.wall(px, pz, qx, qz, r, 0);
    else kerbs.wall(qx, qz, px, pz, r, 0);
  }
  // The kerbstones on the pavement's side of the arc, the gutter on the road's.
  const band = (q: QuadBuilder, r0: number, r1: number, y: number): void => {
    const inner = arc(r0);
    const outer = arc(r1);
    for (let i = 0; i < ARC_PIECES; i++) {
      q.surface([inner[i]![0], y, inner[i]![1], outer[i]![0], y, outer[i]![1], outer[i + 1]![0], y, outer[i + 1]![1], inner[i + 1]![0], y, inner[i + 1]![1]], false, up);
    }
  };
  if (corner.pavement) {
    band(tops, R - KERBSTONE, R, GROUND.marking.lift);
    band(gutters, R, R + GUTTER, r + GROUND.marking.lift);
  } else {
    band(gutters, R - GUTTER, R, r + GROUND.marking.lift);
    band(tops, R, R + KERBSTONE, GROUND.marking.lift);
  }
}

/** A painted bar of width `w` from (x0, z0) to (x1, z1), any direction. */
function bar(q: QuadBuilder, x0: number, z0: number, x1: number, z1: number, w: number, y: number): void {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const [nx, nz] = [(-(z1 - z0) / length) * (w / 2), ((x1 - x0) / length) * (w / 2)];
  q.surface([x0 - nx, y, z0 - nz, x1 - nx, y, z1 - nz, x1 + nx, y, z1 + nz, x0 + nx, y, z0 + nz], false, new THREE.Vector3(0, 1, 0));
}

/** An arrowhead with its point at (x, z) heading along (dx, dz) (a unit axis). */
function head(q: QuadBuilder, x: number, z: number, dx: number, dz: number, y: number, size: number): void {
  const [bx, bz] = [x - dx * size, z - dz * size];
  const [px, pz] = [-dz * size * 0.32, dx * size * 0.32];
  q.surface([bx - px, y, bz - pz, x, y, z, bx + px, y, bz + pz, bx + px, y, bz + pz], false, new THREE.Vector3(0, 1, 0));
}

/**
 * A lane arrow painted on the road at (x, z) pointing along `dir` (+1 east, -1 west); `turn`: a second
 * head branching off to the driver's right (heading east that is +z, heading west -z).
 */
function arrow(q: QuadBuilder, x: number, z: number, dir: 1 | -1, y: number, turn: boolean): void {
  const shaft = 3.2;
  bar(q, x - dir * shaft, z, x, z, 0.18, y);
  head(q, x + dir * 1.4, z, dir, 0, y, 1.4);
  if (!turn) return;
  const bx = x - dir * 1.4;
  bar(q, bx, z, bx, z + dir * 0.7, 0.18, y);
  head(q, bx, z + dir * 1.5, 0, dir, y, 0.8);
}

/** The give-way triangle on Park Street's northbound lane: an outline, its base towards the junction (+z), its point towards the drivers coming up. */
function triangle(q: QuadBuilder, x: number, base: number, y: number): void {
  const [half, length, w] = [0.75, 3.6, 0.15];
  bar(q, x - half, base, x + half, base, w, y);
  bar(q, x - half, base, x, base - length, w, y);
  bar(q, x + half, base, x, base - length, w, y);
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

/** Breaks up the tiling of a ground material (see `MACRO_PAVING`); `road` adds the oil stains, the tyre tracks, cracks and potholes. Both lay their snow. */
function macro(material: THREE.MeshStandardMaterial, road: boolean): void {
  patchShader(material, road ? 'streetGroundRoad' : 'streetGroundPaving', (shader) => {
    shader.uniforms.streetSnow = STREET_SNOW;
    shader.uniforms.streetSlush = SLUSH;
    shader.uniforms.streetWet = STREET_WET;
    shader.vertexShader = 'varying vec2 vGroundXZ;\n' + afterChunk(shader.vertexShader, 'begin_vertex', MACRO_VERTEX);
    let fragment = GROUND_PARS + VALUE_NOISE + afterChunk(shader.fragmentShader, 'map_fragment', road ? MACRO_ROAD : MACRO_PAVING + WALL_FOOT + PAVING_SNOW);
    fragment = afterChunk(fragment, 'roughnessmap_fragment', road ? MACRO_ROAD_ROUGHNESS : MACRO_PAVING_ROUGHNESS);
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
