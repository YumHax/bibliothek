import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { afterChunk, patchShader } from '../materials/shaderPatch';
import { plasterBumpMap } from '../materials/surfaces';
import { STAIRWELL_PLAN as plan, STOREY, landingY } from './stairwellPlan';

/*
 * The stairwell's painted walls and worn floors, as shader patches on its merged meshes: light
 * baked in by position (the creases where wall meets floor, ceiling and the next wall, the floor
 * darkened along the walls and under the flights), the two-tone paint (a dark dado to 1.1 m over
 * the stair's slope, a thin line, plaster above) and the stone worn pale where feet go. No light, no
 * extra map but the plaster's bump: what a real stairwell's ambient light would do, for nothing.
 */

/** The vertex attribute of the stairwell's walls: (offset of the floor lines under them, how many storeys of lines). */
export const STAIR_ATTRIBUTE = 'aStair';

/** The walls' paint, as the co-owners voted it (`building/coproPlan` "paint"): plaster above, the dado, the line between. */
export const STAIR_PAINTS: Record<string, { upper: number; dado: number; line: number }> = {
  cream: { upper: 0xe6dcc6, dado: 0x6e4c34, line: 0x3a2a1e },
  sage: { upper: 0xd3d9c4, dado: 0x4f6352, line: 0x2c3a2e },
  ochre: { upper: 0xead2a0, dado: 0x7c4f2c, line: 0x43291a },
};

/** The dado's top over the floor (or the stair's slope) under it, metres. */
const DADO_TOP = 1.1;
/** Where the shaft's roof is (a wall reaching it has no floor line above). */
const TOP = landingY(0) + 2.8;

export interface StairWalls {
  material: THREE.MeshStandardMaterial;
  /** Repaints the walls (a key of `STAIR_PAINTS`). */
  setPaint(id: string): void;
}

/**
 * The shaft's, the strip's and the hall's walls. Each wall vertex carries `aStair` = (p, n): the floor lines under the
 * wall are p + i·STOREY for i in 0..n (the floor at 0 below the first), linear along the wall between the stair's
 * breaks, so the height over the floor, and with it the dado and the creases, is exact on every storey, sloping with
 * the flights.
 */
export function stairWalls(paint: string): StairWalls {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, dithering: !QUALITY.postFx });
  if (QUALITY.detailedMaterials) {
    material.bumpMap = plasterBumpMap();
    material.bumpScale = 0.3;
  }
  const colours = STAIR_PAINTS[paint] ?? STAIR_PAINTS.cream!;
  const { shaft, hall, strip } = plan;
  const corners = [
    [shaft.x0, shaft.z0],
    [shaft.x1, shaft.z0],
    [shaft.x0, shaft.z1],
    [shaft.x1, shaft.z1],
    [hall.x0, hall.z1],
    [hall.x1, hall.z1],
    [strip.x0, strip.z0],
    [strip.x0, strip.z1],
  ].map(([x, z]) => new THREE.Vector2(x, z));
  const uniforms = {
    stairUpper: { value: new THREE.Color(colours.upper) },
    stairDado: { value: new THREE.Color(colours.dado) },
    stairLine: { value: new THREE.Color(colours.line) },
    stairCorners: { value: corners },
  };
  patchShader(material, 'stairWalls', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      `attribute vec2 ${STAIR_ATTRIBUTE};\nvarying vec2 vStair;\nvarying vec3 vStairPos;\n` +
      afterChunk(shader.vertexShader, 'begin_vertex', `vStair = ${STAIR_ATTRIBUTE};\nvStairPos = position;`);
    shader.fragmentShader =
      'varying vec2 vStair;\nvarying vec3 vStairPos;\nuniform vec3 stairUpper;\nuniform vec3 stairDado;\nuniform vec3 stairLine;\nuniform vec2 stairCorners[8];\n' +
      afterChunk(
        shader.fragmentShader,
        'map_fragment',
        `{
          float storey = ${STOREY.toFixed(4)};
          float n = clamp(floor((vStairPos.y - vStair.x) / storey), 0.0, vStair.y);
          float floorY = max(vStair.x + n * storey, 0.0);
          float fromFloor = vStairPos.y - floorY;
          // The hall's ceiling, the soffit of the floor above, or the roof.
          float ceilY = vStair.y < 0.5 ? ${hall.height.toFixed(3)} : (n < vStair.y - 0.5 ? vStair.x + (n + 1.0) * storey - 0.3 : ${TOP.toFixed(3)});
          float fromCeil = max(ceilY - vStairPos.y, 0.0);
          float aa = max(fwidth(fromFloor), 1e-4);
          float dado = 1.0 - smoothstep(${DADO_TOP.toFixed(3)} - aa, ${DADO_TOP.toFixed(3)} + aa, fromFloor);
          float band = smoothstep(${(DADO_TOP - 0.03).toFixed(3)} - aa, ${(DADO_TOP - 0.03).toFixed(3)} + aa, fromFloor) * dado;
          vec3 stairPaint = mix(mix(stairUpper, stairDado, dado), stairLine, band);
          diffuseColor.rgb *= stairPaint;
          ${
            QUALITY.detailedMaterials
              ? `float crease = 1.0 - 0.32 * exp(-fromFloor / 0.12) - 0.16 * exp(-fromCeil / 0.25);
          for (int i = 0; i < 8; i++) crease -= 0.2 * exp(-length(vStairPos.xz - stairCorners[i]) / 0.2);
          float grime = 0.1 * (1.0 - smoothstep(0.05, 0.35, fromFloor));
          // Down the shaft the roof's light reaches less: the lower storeys a shade darker.
          float shaftDepth = vStair.y > 0.5 ? 0.84 + 0.16 * smoothstep(0.0, ${TOP.toFixed(3)}, vStairPos.y) : 1.0;
          diffuseColor.rgb *= max(crease, 0.45) * (1.0 - grime) * shaftDepth;`
              : ''
          }
        }`,
      );
  });
  return {
    material,
    setPaint(id) {
      const c = STAIR_PAINTS[id] ?? STAIR_PAINTS.cream!;
      uniforms.stairUpper.value.setHex(c.upper);
      uniforms.stairDado.value.setHex(c.dado);
      uniforms.stairLine.value.setHex(c.line);
    },
  };
}

export interface StairFloors {
  /** Whether a runner covers the flights' middle (the wear shows only on bare stone). */
  setRunner(on: boolean): void;
}

/**
 * The floors' baked light and wear on `material` (the treads and landings, the hall's tiles, the shaft's stone): darker
 * along the walls and on the stone under the lowest flight, polished pale and a little glossier down the middle of
 * the flights (on bare stone: a runner covers it), across the landings on the residents' line, and on the hall's tiles
 * from the street door to the stairs.
 */
export function stairFloors(material: THREE.MeshStandardMaterial, key: string): StairFloors {
  const { shaft, strip, hall, flightA, flightB, floorLanding, halfLanding, walk, streetDoor } = plan;
  const rect = (r: { x0: number; x1: number; z0: number; z1: number }): THREE.Vector4 => new THREE.Vector4(r.x0, r.z0, r.x1, r.z1);
  const uniforms = {
    floorShaft: { value: rect(shaft) },
    floorStrip: { value: rect(strip) },
    floorHall: { value: rect(hall) },
    floorRunner: { value: 1 },
  };
  if (!QUALITY.detailedMaterials) return { setRunner: () => {} };
  const f = (v: number): string => v.toFixed(3);
  patchShader(material, `stairFloors|${key}`, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      'varying vec3 vFloorPos;\nvarying vec3 vFloorNormal;\n' + afterChunk(shader.vertexShader, 'begin_vertex', 'vFloorPos = position;\nvFloorNormal = normal;');
    shader.fragmentShader =
      `varying vec3 vFloorPos;\nvarying vec3 vFloorNormal;\nuniform vec4 floorShaft;\nuniform vec4 floorStrip;\nuniform vec4 floorHall;\nuniform float floorRunner;
      float floorEdge(vec4 r, vec2 p) { vec2 a = p - r.xy; vec2 b = r.zw - p; return min(min(a.x, a.y), min(b.x, b.y)); }\n` +
      afterChunk(
        shader.fragmentShader,
        'map_fragment',
        `vec2 sfP = vFloorPos.xz;
        float sfUp = step(0.5, vFloorNormal.y);
        float sfShaft = floorEdge(floorShaft, sfP);
        float sfStrip = floorEdge(floorStrip, sfP);
        float sfHall = floorEdge(floorHall, sfP);
        float sfEdge = sfShaft >= -0.001 ? sfShaft : (sfStrip >= -0.001 ? sfStrip : (sfHall >= -0.001 ? sfHall : 10.0));
        float floorAo = 1.0 - sfUp * 0.3 * exp(-max(sfEdge, 0.0) / 0.12);
        // The shaft's stone floor under the last flight: the stairs over it keep the light off.
        floorAo *= 1.0 - sfUp * 0.3 * step(vFloorPos.y, 0.05) * step(0.0, sfShaft) * step(sfP.y, ${f(floorLanding.z0)});
        float sfFlight = step(${f(halfLanding.z1)}, sfP.y) * step(sfP.y, ${f(floorLanding.z0)}) * step(0.0, sfShaft);
        float sfLane = min(abs(sfP.x - ${f((flightA.x0 + flightA.x1) / 2)}), abs(sfP.x - ${f((flightB.x0 + flightB.x1) / 2)}));
        float floorWear = sfUp * sfFlight * exp(-pow(sfLane / 0.28, 2.0)) * (1.0 - floorRunner);
        floorWear += sfUp * (1.0 - sfFlight) * step(0.0, sfShaft) * step(${f(floorLanding.z0)}, sfP.y) * 0.6 * exp(-pow((sfP.y - ${f(walk.landingZ)}) / 0.35, 2.0));
        floorWear += sfUp * step(0.0, sfHall) * 0.5 * exp(-pow((sfP.x - ${f(streetDoor.at[0])}) / 0.45, 2.0));
        diffuseColor.rgb *= floorAo * (1.0 + 0.07 * floorWear);`,
      );
    shader.fragmentShader = afterChunk(shader.fragmentShader, 'roughnessmap_fragment', 'roughnessFactor *= 1.0 - 0.3 * floorWear;');
  });
  return {
    setRunner(on) {
      uniforms.floorRunner.value = on ? 1 : 0;
    },
  };
}
