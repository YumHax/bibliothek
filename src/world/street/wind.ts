import * as THREE from 'three';
import type { SkyState } from '../props/DayNight';
import { afterChunk, patchShader } from '../materials/shaderPatch';
import { damp } from '@/math/damp';
import { oneDriver } from './oneDriver';

/**
 * The street's wind, one for everything out here that moves with it: the trees' crowns and bare branches, the
 * willows' strands, the shrubs, the grass, the awnings' valances, the bunting and the fairy lights. `streetWind` is
 * xy the direction it blows to (world xz, the way the rain slants: `Precipitation`), z how hard (`SkyState.wind`,
 * eased), w the time its gusts run on. Gusts are fronts travelling down the wind, so a row of trees bends one after
 * the other, not all at once. Written by whichever street rig ticks it (`advanceWind`, one driver a frame).
 */
export const STREET_WIND = { value: new THREE.Vector4(0.96, 0.28, 0.3, 0) };

const DIRECTION = new THREE.Vector2(0.96, 0.28).normalize();
const driver = oneDriver();

/** Moves the wind on by `dt` (only for the rig driving it this frame: the street's, a window's, the roof's). */
export function advanceWind(owner: object, dt: number, sky: SkyState): void {
  if (!driver.drives(owner)) return;
  const w = STREET_WIND.value;
  w.x = DIRECTION.x;
  w.y = DIRECTION.y;
  w.z = damp(w.z, sky.wind, 1.5, dt);
  w.w = (w.w + dt) % 2000;
}

/**
 * GLSL: `windGust(xz)` 0..1, the gust at a world point now (fronts running down the wind); `windSway(world, phase)`
 * the bend of something standing at `world` (metres a metre of height: multiply by how far above its pivot), down
 * the wind and swaying across it; `windFlutter(p, phase)` a small quick shiver for leaves and cloth.
 */
export const WIND_GLSL = /* glsl */ `
#ifndef STREET_WIND_GLSL
#define STREET_WIND_GLSL
uniform vec4 streetWind;
float windGust(vec2 xz) {
  float run = dot(xz, streetWind.xy) - streetWind.w * (2.5 + 7.0 * streetWind.z);
  float g = 0.5 + 0.5 * sin(run * 0.11) * sin(run * 0.043 + 1.7);
  return g * g;
}
vec3 windSway(vec3 world, float phase) {
  float s = streetWind.z;
  float gust = windGust(world.xz);
  float lean = s * (0.25 + 0.75 * gust) * (0.05 + 0.06 * s);
  float t = streetWind.w;
  float wobble = (0.012 + 0.03 * s) * (sin(t * (1.1 + 0.6 * s) + phase) + 0.4 * sin(t * 2.3 + phase * 1.7));
  float across = (0.008 + 0.02 * s) * sin(t * 0.9 + phase * 1.3);
  vec2 down = streetWind.xy;
  vec2 side = vec2(-down.y, down.x);
  return vec3(down * (lean + wobble) + side * across, 0.0);
}
vec3 windFlutter(vec3 p, float phase) {
  float s = streetWind.z;
  float t = streetWind.w;
  float k = dot(p, vec3(13.1, 7.7, 11.3)) + phase;
  return vec3(sin(t * 9.0 + k), sin(t * 7.3 + k * 1.3) * 0.6, cos(t * 8.1 + k * 0.7)) * (0.004 + 0.02 * s * (0.4 + 0.6 * windGust(p.xz)));
}
#endif
`;

/** How a swaying thing bends: its pivot's height (object space, nothing moves below it), how far it gives, how much it shivers. */
interface WindBend {
  pivotY: number;
  /** Multiplies the sway (1: a tree's crown; 0.4 a stiff branch; 2 a willow's strand). */
  give?: number;
  /** Metres of the quick shiver at full give (0: none). */
  flutter?: number;
  /** Hanging things (a willow's strands): they swing more the further below `pivotY` they hang, not above it. */
  hanging?: boolean;
  /**
   * A float attribute of the geometry holding each vertex's own reach (metres from what it hangs from or stands on)
   * instead of its height over `pivotY`: strands of different lengths hung at different heights in one mesh.
   */
  reachAttribute?: string;
  /**
   * A GLSL expression of `transformed` (object space) for each vertex's reach instead: a line slung between two
   * fixed ends swings most at its middle (`4.0 * t * (1.0 - t)` of where along it the vertex is).
   */
  reachExpression?: string;
}

/**
 * Patches `material` (vertex only) so what it draws sways with `STREET_WIND`: each vertex is moved by how far above
 * (or, `hanging`, below) `pivotY` it is, in world space (turned back into the object's frame, instancing included),
 * each instance on its own phase. `key` names the variant (one program per key and bend).
 */
export function windSwayed<M extends THREE.Material>(material: M, key: string, bend: WindBend): M {
  const give = (bend.give ?? 1).toFixed(3);
  const flutter = (bend.flutter ?? 0).toFixed(4);
  const pivot = bend.pivotY.toFixed(3);
  const reach = bend.reachAttribute ?? bend.reachExpression ?? (bend.hanging ? `max(${pivot} - transformed.y, 0.0)` : `max(transformed.y - ${pivot}, 0.0)`);
  return patchShader(material, `streetWind:${key}`, (shader) => {
    shader.uniforms.streetWind = STREET_WIND;
    const declare = bend.reachAttribute ? `attribute float ${bend.reachAttribute};\n` : '';
    shader.vertexShader = declare + WIND_GLSL + afterChunk(shader.vertexShader, 'begin_vertex', /* glsl */ `
      {
        #ifdef USE_INSTANCING
          mat4 windModel = modelMatrix * instanceMatrix;
        #else
          mat4 windModel = modelMatrix;
        #endif
        vec3 windRoot = windModel[3].xyz;
        float windPhase = windRoot.x * 0.37 + windRoot.z * 0.23;
        float windReach = ${reach};
        mat3 windFrame = mat3(windModel);
        float windScale = max(dot(windFrame[0], windFrame[0]), 1e-6);
        vec3 windWorld = (windModel * vec4(transformed, 1.0)).xyz;
        vec3 windMove = windSway(windRoot, windPhase) * windReach * ${give};
        windMove += windFlutter(windWorld, windPhase) * ${flutter} * min(windReach, 1.0) * 30.0;
        // Bowed: the higher, the more it also drops a little (no stretching as it leans).
        windMove.y -= dot(windMove.xz, windMove.xz) * 0.35 / max(windReach, 0.5);
        transformed += transpose(windFrame) * windMove / windScale;
      }
    `);
  });
}
