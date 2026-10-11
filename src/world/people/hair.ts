import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { ramp } from '@/math/scalar';
import { filterTriangles, Parts, radialSurface, spline, type Keys } from './geometry';
import { headRadius, type FaceShape } from './head';
import type { HairStyle, PersonLook } from './looks';
import { cachedTexture } from './textureCache';
import { lcg } from '@/random';
import { gaussian } from '@/math/scalar';
import { QUALITY } from '@/graphics/quality';
import { afterChunk, patchShader } from '../materials/shaderPatch';
import { seedOfLook } from './motion/temperament';

/*
 * Hair and beard, in the head's frame. Both are a shell over the skin: the head's own surface
 * pushed out by a thickness wherever the style covers and sunk just under the skin elsewhere, so
 * the hairline feathers into the forehead instead of ending on a hard edge (triangles entirely
 * under the skin are dropped). On top of the shell a style adds what does not hug the skull: long
 * hair falling to the shoulders, a bun, a ponytail. Everything wears one strand texture whose
 * streaks run from the crown down (along v), and catches the light along its strands
 * (`hairMaterial`: two highlights across them, Kajiya-Kay, the second tinted by the hair). A short
 * cut is the person's own: more or less volume, a parting on one side or none, now and then a quiff.
 * Long hair's falling sheet is a mesh of its own (`hairCurtain`): its lower rows stay with the
 * shoulders when the head turns (`HairFollow`), instead of sweeping through them.
 */

/** Where the hair starts, as the elevation (radians) of the hairline by azimuth from the front (0) to the back (pi). */
const HAIRLINE: Keys = [
  [0, 0.62],
  [0.5, 0.56],
  [0.9, 0.4],
  [1.2, 0.3],
  [1.25, 0.18],
  [1.33, 0.02],
  [1.42, -0.05],
  [1.53, -0.05], // sideburn
  [1.63, 0.18],
  [1.76, 0.4], // over the ear
  [1.95, 0.2],
  [2.4, -0.25],
  [Math.PI, -0.42], // nape
];
/** A fringe brings the front down over the forehead. */
const FRINGE: Keys = [
  [0, 0.36],
  [0.5, 0.35],
  [0.9, 0.32],
  [1.2, 0.26],
  [1.25, 0.18],
  [1.33, 0.02],
  [1.42, -0.05],
  [1.53, -0.05],
  [1.63, 0.18],
  [1.76, 0.4],
  [1.95, 0.2],
  [2.4, -0.25],
  [Math.PI, -0.42],
];
/** Long hair: the shell covers the crown down to the ears, the falling sheet (`curtainGeometry`) the rest. */
const LONG: Keys = [
  [0, 0.6],
  [0.5, 0.53],
  [0.9, 0.36],
  [1.15, 0.22],
  [1.5, 0.1],
  [2.0, 0.0],
  [Math.PI, -0.1],
];
const LONG_FRINGE: Keys = [[0, 0.34], [0.5, 0.33], [0.9, 0.28], [1.15, 0.2], [1.5, 0.1], [2.0, 0.0], [Math.PI, -0.1]];
/** Radius of a ponytail along its length, as a fraction of its nominal radius: pinched at the tie, full, then the tip. */
const TAIL: Keys = [
  [0, 0.7],
  [0.08, 0.55],
  [0.14, 0.85],
  [0.35, 1.1],
  [0.7, 0.9],
  [1, 0.22],
];
/** A full beard's upper edge on the cheeks, by azimuth: from the corners of the mouth to the sideburns. */
const BEARD_LINE: Keys = [
  [0.4, -0.45],
  [0.7, -0.3],
  [1.0, -0.2],
  [1.4, -0.02],
];
/** Under the skin, where there is no hair. */
const SUNK = -0.003;

/** The strand texture the hair's mass wears (shared by every look with this colour and curl). */
export function hairStrandMap(look: PersonLook): THREE.CanvasTexture {
  const curly = look.hairStyle === 'curly';
  return cachedTexture(`hair|${look.hair}|${curly}`, () => strandTexture(look.hair, curly, look.hair * 7 + 3));
}

export function hairMaterial(look: PersonLook): THREE.MeshStandardMaterial {
  const curly = look.hairStyle === 'curly';
  const map = hairStrandMap(look);
  // Where a shell tapers to the skin (hairline, fringe, beard edge) it lies within a hair of it: the offset keeps it in front instead of z-fighting.
  const material = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 1.5, roughness: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }); // convention-ok: a shell over the skin, not a surface layer
  return QUALITY.detailedMaterials ? strandSheen(material, curly ? 0.4 : 1, 0.15) : material;
}

/**
 * Light along the strands (Kajiya-Kay): the strand's direction is where the texture's v runs on the
 * surface (from the screen-space derivatives, no tangents needed), and each direct light adds a
 * sharp white band across it and a broader one tinted by the hair, shifted either way along the
 * normal. Curly hair (`strength` lower) only glints. `glow` is the light coming through from behind
 * (strands against a lamp light up at the edge, whichever way they face): faint on the shell's mass,
 * strong on the loose strands (`hairStrands`). No texture unit.
 */
export function strandSheen(material: THREE.MeshStandardMaterial, strength: number, glow: number): THREE.MeshStandardMaterial {
  return patchShader(material, `strandSheen${strength}|${glow}`, (shader) => {
    shader.fragmentShader = afterChunk(
      afterChunk(
        shader.fragmentShader,
        'lights_physical_pars_fragment',
        /* glsl */ `vec3 hairStrand = vec3(0.0, 1.0, 0.0);
        void RE_Direct_Hair(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
          RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
          vec3 h = normalize(directLight.direction + geometryViewDir);
          float lit = saturate(dot(geometryNormal, directLight.direction) * 0.7 + 0.3);
          float a = dot(normalize(hairStrand + geometryNormal * 0.12), h);
          float b = dot(normalize(hairStrand - geometryNormal * 0.1), h);
          float primary = pow(sqrt(max(0.0, 1.0 - a * a)), 90.0);
          float secondary = pow(sqrt(max(0.0, 1.0 - b * b)), 22.0);
          reflectedLight.directSpecular += directLight.color * lit * ${strength.toFixed(2)} * (primary * 0.14 + secondary * 0.5 * material.diffuseColor);
          float behind = pow(saturate(dot(-directLight.direction, geometryViewDir)), 5.0);
          reflectedLight.directDiffuse += directLight.color * ${glow.toFixed(2)} * behind * (0.35 + material.diffuseColor);
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Hair`,
      ),
      'normal_fragment_maps',
      /* glsl */ `{
        vec3 dp1 = dFdx(-vViewPosition);
        vec3 dp2 = dFdy(-vViewPosition);
        vec2 duv1 = dFdx(vMapUv);
        vec2 duv2 = dFdy(vMapUv);
        vec3 along = cross(dp2, normal) * duv1.y + cross(normal, dp1) * duv2.y;
        if (dot(along, along) > 1e-12) hairStrand = normalize(along);
      }`,
    );
  });
}

/** The hair and beard for `look`, added to the head's parts (long hair's falling sheet is `hairCurtain`, a mesh of its own). */
export function addHair(parts: Parts, look: PersonLook, shape: FaceShape, material: THREE.Material, tail?: Parts): void {
  const style = look.hairStyle;
  const cut = cutOf(look);
  const thickness = (d: THREE.Vector3): number => hairThickness(d, style, !!look.hat, cut);
  const shell = shellGeometry(shape, 112, 84, (d) => hairCover(d, look), thickness);
  if (shell) parts.add(shell, material);
  if (look.beard === 'full') {
    const beard = shellGeometry(shape, 112, 84, beardCover, beardThickness);
    if (beard) parts.add(beard, material);
  }
  if (style === 'bun' && !look.hat) parts.add(bunGeometry(shape), material);
  if (style === 'ponytail') {
    // On its own parts (a bone of its own, so it can swing) about where it is tied, or with the rest.
    const geometry = ponytailGeometry(shape);
    if (tail) {
      const anchor = ponytailAnchor(shape);
      geometry.translate(-anchor.x, -anchor.y, -anchor.z);
      tail.add(geometry, material);
    } else parts.add(geometry, material);
  }
}

/**
 * Long hair's falling sheet (the head's frame), or null for any other style: with a `hairFollow`
 * attribute, 0 where it leaves the head .. 1 at the ends, how much it stays with the shoulders.
 */
export function hairCurtain(look: PersonLook, shape: FaceShape): THREE.BufferGeometry | null {
  if (look.hairStyle !== 'long') return null;
  const cut = cutOf(look);
  return curtainGeometry(shape, (d) => hairThickness(d, 'long', !!look.hat, cut));
}

/** A short cut's own shape: volume on top, a parting (-1 on the -x side, 1 on +x, 0 none), a quiff (0 none). */
interface Cut {
  volume: number;
  part: number;
  quiff: number;
}

/** The cut for `look`, from its own stream (the look's draws stay as they were). */
export function cutOf(look: PersonLook): Cut {
  const random = lcg(seedOfLook(look) * 7919 + 5);
  const volume = 0.75 + random() * 0.6;
  const roll = random();
  const part = roll < 0.3 ? 0 : roll < 0.65 ? -1 : 1;
  const quiff = random() < 0.3 ? 0.5 + random() * 0.6 : 0;
  return { volume, part, quiff };
}

/** Where a ponytail is tied, in the head's frame: it swings about there. */
export function ponytailAnchor(shape: FaceShape): THREE.Vector3 {
  const d = new THREE.Vector3(0, 0.12, -1).normalize();
  return d.multiplyScalar(headRadius(d, shape) - 0.004);
}

/** How much of the direction `d` the hair covers, 0 to 1. */
export function hairCover(d: THREE.Vector3, look: PersonLook): number {
  const a = Math.abs(Math.atan2(d.x, d.z));
  const e = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
  const fringe = look.brows > 1;
  switch (look.hairStyle) {
    case 'bald':
      // A horseshoe round the back and over the ears.
      return ramp(a, 1.35, 1.6) * ramp(e, 0.3, 0.18) * ramp(e, -0.45, -0.33);
    case 'long':
      return edge(e, spline(fringe ? LONG_FRINGE : LONG, a));
    case 'short':
    case 'curly':
      return edge(e, spline(fringe ? FRINGE : HAIRLINE, a));
    default:
      return edge(e, spline(HAIRLINE, a));
  }
}

function edge(e: number, line: number): number {
  return ramp(e, line - 0.08, line + 0.08);
}

/** The hairline's elevation (radians) at azimuth `a` from the front (0) to the back (pi), where `hairCover` is a half. */
export function hairlineAt(look: PersonLook, a: number): number {
  const fringe = look.brows > 1;
  switch (look.hairStyle) {
    case 'long':
      return spline(fringe ? LONG_FRINGE : LONG, a);
    case 'short':
    case 'curly':
      return spline(fringe ? FRINGE : HAIRLINE, a);
    default:
      return spline(HAIRLINE, a);
  }
}

/** The hair shell's outer surface (distance from the head's centre) in direction `d`, as `addHair` builds it; at least on the skin. */
export function hairRadius(d: THREE.Vector3, look: PersonLook, shape: FaceShape, cut: Cut): number {
  return shellRadius(d, shape, hairCover(d, look), (v) => hairThickness(v, look.hairStyle, !!look.hat, cut));
}

/** A full beard's thickness in direction `d` (thicker under the chin). */
export function beardThickness(d: THREE.Vector3): number {
  return 0.0028 + 0.0035 * ramp(d.y, -0.6, -0.9);
}

/** A shell's radius where its cover is `c`: pushed out by the thickness, tapering to just under the skin at its edge. */
export function shellRadius(d: THREE.Vector3, shape: FaceShape, c: number, thickness: (d: THREE.Vector3) => number): number {
  // Thinning towards the edge (c^1.5) so a hairline or a fringe tapers instead of ending in a ledge.
  return headRadius(d, shape) + (c > 0 ? THREE.MathUtils.lerp(SUNK, thickness(d), c ** 1.5) : SUNK);
}

export function hairThickness(d: THREE.Vector3, style: HairStyle, hat: boolean, cut: Cut): number {
  const top = Math.max(0, d.y);
  let t: number;
  switch (style) {
    case 'buzz':
      t = 0.0025;
      break;
    case 'bald':
      t = 0.003;
      break;
    case 'curly':
      t = 0.022 + 0.014 * top + 0.007 * lumps(d, 21);
      break;
    case 'bun':
    case 'ponytail':
      t = 0.005 + 0.003 * top;
      break;
    case 'long':
      t = 0.01 + 0.01 * top + 0.0015 * lumps(d, 9);
      break;
    default: {
      t = 0.008 + 0.012 * top * cut.volume + 0.0015 * lumps(d, 11 + 4 * cut.volume);
      if (cut.part) {
        // The parting: a groove from the hairline back to the crown, the hair swept up and over from it.
        const along = ramp(d.z, -0.35, 0.1) * ramp(d.y, 0.25, 0.55);
        t -= 0.006 * gaussian(d.x - cut.part * 0.3, 0, 0.035) * along;
        t += 0.004 * ramp(-cut.part * d.x, -0.1, 0.45) * top * along;
      }
    }
  }
  // Thin over the forehead, where a fringe lies flat rather than standing off the skin.
  const forehead = ramp(Math.abs(Math.atan2(d.x, d.z)), 1.0, 0.2) * ramp(d.y, 0.7, 0.3);
  t *= 1 - 0.65 * forehead;
  // A quiff stands up off the front of the crown.
  if (style === 'short' && cut.quiff) t += cut.quiff * 0.013 * gaussian(d.z, 0.5, 0.22) * ramp(d.y, 0.45, 0.8);
  t = Math.max(0.002, t);
  return hat ? Math.min(t, 0.007) : t;
}

/** Smooth bumps over the sphere in [-1, 1], `k` setting their size. */
function lumps(d: THREE.Vector3, k: number): number {
  return Math.sin(d.x * k + 1.3) * Math.sin(d.y * k * 0.9 + 0.7) * Math.sin(d.z * k * 1.1 + 2.1) * 0.6 + Math.sin(d.x * k * 2.1 + d.z * k * 1.7) * 0.4;
}

/** Where a full beard grows (and stubble shadows): jaw, chin, cheeks up to the sideburns, the moustache; not the lips. */
export function beardCover(d: THREE.Vector3): number {
  if (d.z < -0.35) return 0;
  const a = Math.abs(Math.atan2(d.x, d.z));
  const e = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
  const jaw = ramp(e, -0.3, -0.5) * ramp(a, 1.55, 1.32) * ramp(e, -1.4, -1.22);
  // Up the cheeks the beard line rises from the corners of the mouth to the sideburns.
  const line = spline(BEARD_LINE, a);
  const cheek = ramp(a, 0.4, 0.6) * ramp(a, 1.58, 1.4) * ramp(e, line + 0.06, line - 0.06) * ramp(e, -1.4, -1.22);
  const moustache = ramp(a, 0.42, 0.3) * ramp(e, -0.4, -0.44) * ramp(e, -0.53, -0.49);
  const lips = ramp(a, 0.3, 0.22) * ramp(e, -0.47, -0.5) * ramp(e, -0.69, -0.66);
  return Math.max(jaw, cheek, moustache) * (1 - lips);
}

/** The head's surface pushed out by `thickness` where `cover` is 1, just under the skin where it is 0. */
function shellGeometry(shape: FaceShape, widthSegments: number, heightSegments: number, cover: (d: THREE.Vector3) => number, thickness: (d: THREE.Vector3) => number): THREE.BufferGeometry | null {
  const covered: number[] = [];
  const geometry = radialSurface(
    (d) => {
      const c = cover(d);
      covered.push(c);
      return shellRadius(d, shape, c, thickness);
    },
    widthSegments,
    heightSegments,
  );
  filterTriangles(geometry, (a, b, c) => covered[a]! > 0.02 || covered[b]! > 0.02 || covered[c]! > 0.02);
  if (!geometry.getIndex()?.count) {
    geometry.dispose();
    return null;
  }
  return geometry;
}

/** The falling sheet's grid: columns round the head, rows down (vertex (i, j) is at j * (cols + 1) + i). */
export const CURTAIN_GRID = { cols: 44, rows: 14 } as const;

/**
 * Long hair falling from behind the ears to the shoulders: a sheet that leaves the shell high on
 * the back of the head, drapes over the widest part of the skull and falls from there, flaring a
 * little, in loose clumps, the ends uneven.
 */
function curtainGeometry(shape: FaceShape, thickness: (d: THREE.Vector3) => number): THREE.BufferGeometry {
  const { cols, rows } = CURTAIN_GRID;
  const positions: number[] = [];
  const uvs: number[] = [];
  const follow: number[] = [];
  const d = new THREE.Vector3();
  const start = 0.32;
  for (let j = 0; j <= rows; j++) {
    const s = j / rows;
    for (let i = 0; i <= cols; i++) {
      // phi = 0 is straight behind; the edges come round past the ears to frame the face.
      const phi = -1.95 + (i / cols) * 3.9;
      d.set(Math.sin(phi) * Math.cos(start), Math.sin(start), -Math.cos(phi) * Math.cos(start));
      const top = d.clone().multiplyScalar(headRadius(d, shape) + thickness(d) - 0.002);
      d.set(Math.sin(phi), 0, -Math.cos(phi));
      const widest = headRadius(d, shape) + thickness(d) + 0.004;
      const clumps = 1 + 0.035 * Math.sin(phi * 13 + 0.6) * ramp(s, 0.1, 0.5);
      const reach = THREE.MathUtils.lerp(Math.hypot(top.x, top.z), widest, ramp(s, 0, 0.3)) * (1 + 0.14 * s - 0.06 * ramp(s, 0.85, 1)) * clumps;
      // Longest down the back, shorter towards the sides, the ends a little uneven.
      const length = 0.16 + 0.12 * Math.cos(phi * 0.95) + 0.012 * Math.sin(phi * 9);
      positions.push(d.x * reach, top.y - s * (length + top.y), d.z * reach);
      uvs.push(i / cols, 1 - s);
      follow.push(ramp(s, 0.2, 0.85));
    }
  }
  const index: number[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 1;
      const e = c + 1;
      index.push(a, b, c, b, e, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('hairFollow', new THREE.Float32BufferAttribute(follow, 1));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function bunGeometry(shape: FaceShape): THREE.BufferGeometry {
  const d = new THREE.Vector3(0, 0.55, -0.83).normalize();
  const centre = d.clone().multiplyScalar(headRadius(d, shape) + 0.024);
  const geometry = new THREE.SphereGeometry(0.036, 18, 14);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    // A twisted coil: lumpy, squat.
    const k = 1 + 0.08 * Math.sin(Math.atan2(p.x, p.z) * 3 + p.y * 90);
    position.setXYZ(i, p.x * k + centre.x, p.y * 0.8 + centre.y, p.z * k * 0.9 + centre.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A ponytail's nominal radius (`TAIL` shapes it along its length). */
const PONYTAIL_RADIUS = 0.017;

/** The ponytail's centre line (the head's frame), from the tie down to the tip. */
export function ponytailCurve(shape: FaceShape): THREE.CatmullRomCurve3 {
  const base = ponytailAnchor(shape);
  return new THREE.CatmullRomCurve3([
    base,
    base.clone().add(new THREE.Vector3(0, -0.02, -0.04)),
    base.clone().add(new THREE.Vector3(0, -0.1, -0.07)),
    base.clone().add(new THREE.Vector3(0, -0.2, -0.055)),
  ]);
}

/** The ponytail's radius `t` along it (0 at the tie, 1 at the tip). */
export function ponytailRadius(t: number): number {
  return PONYTAIL_RADIUS * spline(TAIL, t);
}

/** Gathered at the back of the head, bushing out below the tie and tapering to the tip. */
function ponytailGeometry(shape: FaceShape): THREE.BufferGeometry {
  const curve = ponytailCurve(shape);
  const tubular = 20;
  const radial = 10;
  const geometry = new THREE.TubeGeometry(curve, tubular, PONYTAIL_RADIUS, radial, false);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    const centre = curve.getPointAt(t);
    const taper = spline(TAIL, t);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.fromBufferAttribute(position, k).sub(centre).multiplyScalar(taper).add(centre);
      position.setXYZ(k, p.x, p.y, p.z);
      // Strands run along the tail: swap the texture's axes.
      uv.setXY(k, j / radial, 1 - t);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Streaks of lighter and darker strands running down the texture (along v); tight coils for curly
 * hair. Under them, locks: broad soft bands each a little warmer or cooler, lighter or darker than
 * the rest, so the colour is never one flat dye. v = 1 is where the hair grows from (the crown on the
 * shell, the root of the falling sheet and of a ponytail): darker there, the ends lighter.
 */
function strandTexture(color: number, curly: boolean, seed: number): THREE.CanvasTexture {
  const S = 512;
  const [canvas, ctx] = createCanvas(S, S);
  const random = lcg(seed);
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const shade = (k: number, alpha: number): string => `rgba(${Math.min(255, Math.round(r * k + 8 * (k - 1)))},${Math.min(255, Math.round(g * k + 8 * (k - 1)))},${Math.min(255, Math.round(b * k + 8 * (k - 1)))},${alpha})`;
  ctx.fillStyle = shade(1, 1);
  ctx.fillRect(0, 0, S, S);
  // Locks, wrapping round the seam (the texture repeats across).
  for (let i = 0; i < 28; i++) {
    const x = random() * S;
    const w = 12 + random() * 36;
    const k = 0.84 + random() * 0.3;
    const warm = random() < 0.5;
    const tint = `${Math.min(255, Math.round((warm ? r * 1.08 + 8 : r * 0.94) * k))},${Math.min(255, Math.round((warm ? g * 1.02 + 3 : g * 0.98) * k))},${Math.min(255, Math.round((warm ? b * 0.9 : b * 1.06 + 4) * k))}`;
    for (const offset of [-S, 0, S]) {
      const band = ctx.createLinearGradient(x + offset - w, 0, x + offset + w, 0);
      band.addColorStop(0, `rgba(${tint},0)`);
      band.addColorStop(0.5, `rgba(${tint},0.32)`);
      band.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = band;
      ctx.fillRect(x + offset - w, 0, 2 * w, S);
    }
  }
  if (curly) {
    for (let i = 0; i < 2600; i++) {
      ctx.strokeStyle = shade(random() < 0.5 ? 0.6 : 1.35, 0.45);
      ctx.lineWidth = 1 + random() * 1.4;
      ctx.beginPath();
      ctx.arc(random() * S, random() * S, 2.5 + random() * 4, random() * 6, random() * 6 + 3);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 1800; i++) {
      const x = random() * S;
      ctx.strokeStyle = shade(random() < 0.5 ? 0.62 + random() * 0.2 : 1.2 + random() * 0.35, 0.3 + random() * 0.3);
      ctx.lineWidth = 0.6 + random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (random() - 0.5) * 10, S / 3, x + (random() - 0.5) * 10, (2 * S) / 3, x + (random() - 0.5) * 4, S);
      ctx.stroke();
    }
  }
  // Darker at the roots (the top rows, v = 1), lighter towards the ends.
  const roots = ctx.createLinearGradient(0, 0, 0, S * 0.3);
  roots.addColorStop(0, 'rgba(12,8,6,0.16)');
  roots.addColorStop(1, 'rgba(12,8,6,0)');
  ctx.fillStyle = roots;
  ctx.fillRect(0, 0, S, S * 0.3);
  const ends = ctx.createLinearGradient(0, S * 0.55, 0, S);
  ends.addColorStop(0, 'rgba(255,236,205,0)');
  ends.addColorStop(1, 'rgba(255,236,205,0.12)');
  ctx.fillStyle = ends;
  ctx.fillRect(0, S * 0.55, S, S * 0.45);
  const texture = toTexture(canvas, 'facing');
  texture.wrapS = THREE.RepeatWrapping; // convention-ok: wraps one way only
  texture.repeat.set(2, 1);
  return texture;
}
