import * as THREE from 'three';
import { afterChunk, patchShader } from '../materials/shaderPatch';
import { isShared, markShared } from '../materials/sharedResources';
import { facadeHeight } from './facadePainter';
import { FACADES, FRONT, PARK_STREET, STREET_ENDS } from './streetPlan';

/** The sun's shadow fades out over this outer share of its map (the square of street round the player): no hard edge. */
const EDGE_FADE = 0.15;

const RETURN = 'return mix( 1.0, shadow, shadowIntensity );';

/*
 * Past the map's square, the sun's shadow is not simply gone: the street's long shadows are its two
 * rows of buildings and Park Street's, and those are boxes standing on known lines. `farShadowAt`
 * follows a point's ray towards the sun to the face of the row it heads for and compares the ray's
 * height there with the roofline (`FAR_ROWS`, a 1D texture of each row's height along it). The map's
 * fade blends into it, so the building's shadow across the road carries on to the end of the street.
 */

/** The rows' texture: how many texels along, the heights' scale (metres at 1.0), what a roof adds over the parapet. */
const ROW_TEXELS = 512;
const ROW_HEIGHT = 40;
const ROOF_RISE = 1.2;
/** Along Front Street (x), both rows; down Park Street (z), our side. */
const ALONG = { x0: PARK_STREET.hedge, x1: STREET_ENDS.east, z0: STREET_ENDS.south, z1: FRONT.ourLine } as const;

/** The uniforms one street's lighting hands its materials: the sun's direction (zone-local, towards it) and the zone's world position. */
export interface FarShadowUniforms {
  farSun: { value: THREE.Vector3 };
  farOrigin: { value: THREE.Vector3 };
}

export function farShadowUniforms(): FarShadowUniforms {
  return { farSun: { value: new THREE.Vector3(0, 1, 0) }, farOrigin: { value: new THREE.Vector3() } };
}

let rows: THREE.DataTexture | null = null;

/**
 * Each row's roofline as a texture (shared by every street built): R our side of Front Street (its
 * face on z = `FRONT.ourLine`), G the far side (z = `FRONT.farLine`), B our side of Park Street
 * (x = `PARK_STREET.line`, along z), from `FACADES` (`facadeHeight`, plus a roof's rise).
 */
function farRows(): THREE.DataTexture {
  if (rows) return rows;
  const data = new Uint8Array(ROW_TEXELS * 4);
  const put = (channel: number, a: number, b: number, from: number, to: number, height: number): void => {
    const lo = Math.max(0, Math.floor(((Math.min(a, b) - from) / (to - from)) * ROW_TEXELS));
    const hi = Math.min(ROW_TEXELS - 1, Math.ceil(((Math.max(a, b) - from) / (to - from)) * ROW_TEXELS));
    const v = Math.round(THREE.MathUtils.clamp(height / ROW_HEIGHT, 0, 1) * 255);
    for (let i = lo; i <= hi; i++) data[i * 4 + channel] = Math.max(data[i * 4 + channel]!, v);
  };
  for (const spec of FACADES) {
    const height = facadeHeight(spec.storeys) + (spec.storeys > 1 ? ROOF_RISE : 0);
    const [ax, az] = spec.from;
    const [bx, bz] = spec.to;
    if (az === FRONT.ourLine && bz === FRONT.ourLine) put(0, ax, bx, ALONG.x0, ALONG.x1, height);
    else if (az === FRONT.farLine && bz === FRONT.farLine) put(1, ax, bx, ALONG.x0, ALONG.x1, height);
    else if (ax === PARK_STREET.line && bx === PARK_STREET.line) put(2, az, bz, ALONG.z0, ALONG.z1, height);
  }
  const texture = new THREE.DataTexture(data, ROW_TEXELS, 1, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  rows = markShared(texture);
  return rows;
}

const f = (n: number): string => n.toFixed(2);

/** The far shadow (see above): 1 lit, 0 in a row's shadow; soft over half a metre of roofline. */
const FAR_SHADOW = /* glsl */ `
uniform vec3 farSun;
uniform vec3 farOrigin;
uniform sampler2D farRows;
varying vec3 vFarWorld;
float farRowLit(float along, float y, float from, float to, int channel) {
  float u = (along - from) / (to - from);
  if (u <= 0.0 || u >= 1.0) return 1.0;
  vec4 h = texture2D(farRows, vec2(u, 0.5)) * ${f(ROW_HEIGHT)};
  float roof = channel == 0 ? h.r : channel == 1 ? h.g : h.b;
  return roof <= 0.0 ? 1.0 : smoothstep(roof - 0.5, roof + 0.5, y);
}
float farShadowAt(vec3 w) {
  vec3 p = w - farOrigin;
  vec3 l = farSun;
  if (l.y <= 0.02) return 1.0;
  float lit = 1.0;
  if (l.z < -0.01 && p.z > ${f(FRONT.ourLine)}) {
    float t = (${f(FRONT.ourLine)} - p.z) / l.z;
    lit = min(lit, farRowLit(p.x + t * l.x, p.y + t * l.y, ${f(ALONG.x0)}, ${f(ALONG.x1)}, 0));
  }
  if (l.z > 0.01 && p.z < ${f(FRONT.farLine)}) {
    float t = (${f(FRONT.farLine)} - p.z) / l.z;
    lit = min(lit, farRowLit(p.x + t * l.x, p.y + t * l.y, ${f(ALONG.x0)}, ${f(ALONG.x1)}, 1));
  }
  if (l.x > 0.01 && p.x < ${f(PARK_STREET.line)} && p.z < ${f(FRONT.ourLine)}) {
    float t = (${f(PARK_STREET.line)} - p.x) / l.x;
    lit = min(lit, farRowLit(p.z + t * l.z, p.y + t * l.y, ${f(ALONG.z0)}, ${f(ALONG.z1)}, 2));
  }
  return lit;
}
`;

/**
 * The shadow chunk with `getShadow` (directional and spot maps; the point lights' is another
 * function) fading its shadow towards the map's border into the far shadow of the rows. Out here
 * the only shadow-casting light is the sun (`StreetLighting`), whose map is a square round the
 * player: without this its shadows stop dead along that square's edge.
 */
function fadingShadowChunk(): string {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const at = chunk.indexOf(RETURN);
  if (at < 0) throw new Error('[shadowFade] getShadow has changed');
  const fade = /* glsl */ `
		float shadowEdge = max( abs( shadowCoord.x - 0.5 ), abs( shadowCoord.y - 0.5 ) ) * 2.0;
		if ( shadowEdge > ${(1 - EDGE_FADE).toFixed(3)} ) shadow = mix( shadow, farShadowAt( vFarWorld ), smoothstep( ${(1 - EDGE_FADE).toFixed(3)}, 1.0, shadowEdge ) );
		`;
  return FAR_SHADOW + chunk.slice(0, at) + fade + chunk.slice(at);
}

const FAR_VERTEX = /* glsl */ `
#ifdef USE_SHADOWMAP
  vFarWorld = worldPosition.xyz;
#else
  vFarWorld = vec3(0.0);
#endif
`;

function isLit(material: THREE.Material): material is THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial {
  return material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshPhongMaterial;
}

/**
 * A street-only copy of a shared (palette) material: the same look and patches (its program is
 * shared, the cache key being the same), its textures marked shared so the zone unloading the copy
 * leaves them to the flat. The shared material itself is never patched (the flat's window suns keep their edges).
 */
function streetCopy(shared: THREE.Material): THREE.Material {
  const copy = shared.clone();
  copy.onBeforeCompile = shared.onBeforeCompile;
  copy.customProgramCacheKey = shared.customProgramCacheKey;
  for (const value of Object.values(shared)) if (value instanceof THREE.Texture) markShared(value);
  return copy;
}

/**
 * Patches every lit, shadow-receiving material under `root` so the sun's shadow fades out at its
 * map's border into the rows' far shadow (`far`: the uniforms of the lighting that casts it). The
 * street's own materials are patched in place; shared (palette) ones are swapped for a street copy.
 * Call once, when the street (or a window's view of it) is built, before anything has compiled.
 */
export function fadeSunShadowEdges(root: THREE.Object3D, far: FarShadowUniforms): void {
  const chunk = fadingShadowChunk();
  const done = new Set<THREE.Material>();
  const copies = new Map<THREE.Material, THREE.Material>();
  const texture = farRows();
  const patch = (material: THREE.Material): void => {
    if (done.has(material)) return;
    done.add(material);
    patchShader(material, 'streetShadowFade', (shader) => {
      shader.uniforms.farSun = far.farSun;
      shader.uniforms.farOrigin = far.farOrigin;
      shader.uniforms.farRows = { value: texture };
      shader.vertexShader = 'varying vec3 vFarWorld;\n' + afterChunk(shader.vertexShader, 'worldpos_vertex', FAR_VERTEX);
      shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', chunk);
    });
  };
  const own = (material: THREE.Material): THREE.Material => {
    if (!isLit(material)) return material;
    if (!isShared(material)) {
      patch(material);
      return material;
    }
    let copy = copies.get(material);
    if (!copy) {
      copy = streetCopy(material);
      copies.set(material, copy);
      patch(copy);
    }
    return copy;
  };
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.receiveShadow) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
  });
}
