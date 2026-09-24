import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { filterTriangles, Parts, radialSurface, ramp, spline, type Keys } from './geometry';
import { headRadius, type FaceShape } from './head';
import type { HairStyle, PersonLook } from './looks';

/*
 * Hair and beard, in the head's frame. Both are a shell over the skin: the head's own surface
 * pushed out by a thickness wherever the style covers and sunk just under the skin elsewhere, so
 * the hairline feathers into the forehead instead of ending on a hard edge (triangles entirely
 * under the skin are dropped). On top of the shell a style adds what does not hug the skull: long
 * hair falling to the shoulders, a bun, a ponytail. Everything wears one strand texture whose
 * streaks run from the crown down.
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

export function hairMaterial(look: PersonLook): THREE.MeshStandardMaterial {
  const map = strandTexture(look.hair, look.hairStyle === 'curly', look.hair * 7 + 3);
  return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 1.5, roughness: 0.55, side: THREE.DoubleSide });
}

/** The hair and beard for `look`, added to the head's parts. */
export function addHair(parts: Parts, look: PersonLook, shape: FaceShape, material: THREE.Material): void {
  const style = look.hairStyle;
  const thickness = (d: THREE.Vector3): number => hairThickness(d, style, !!look.hat);
  const shell = shellGeometry(shape, 112, 84, (d) => hairCover(d, look), thickness);
  if (shell) parts.add(shell, material);
  if (look.beard === 'full') {
    const beard = shellGeometry(shape, 112, 84, beardCover, (d) => 0.0028 + 0.0035 * ramp(d.y, -0.6, -0.9));
    if (beard) parts.add(beard, material);
  }
  if (style === 'long') parts.add(curtainGeometry(shape, thickness), material);
  if (style === 'bun' && !look.hat) parts.add(bunGeometry(shape), material);
  if (style === 'ponytail') parts.add(ponytailGeometry(shape), material);
}

/** How much of the direction `d` the hair covers, 0 to 1. */
function hairCover(d: THREE.Vector3, look: PersonLook): number {
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

function hairThickness(d: THREE.Vector3, style: HairStyle, hat: boolean): number {
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
    default:
      t = 0.008 + 0.012 * top + 0.0015 * lumps(d, 13);
  }
  // Thin over the forehead, where a fringe lies flat rather than standing off the skin.
  const forehead = ramp(Math.abs(Math.atan2(d.x, d.z)), 1.0, 0.2) * ramp(d.y, 0.7, 0.3);
  t *= 1 - 0.65 * forehead;
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
      // Thinning towards the edge (c^1.5) so a hairline or a fringe tapers instead of ending in a ledge.
      return headRadius(d, shape) + (c > 0 ? THREE.MathUtils.lerp(SUNK, thickness(d), c ** 1.5) : SUNK);
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

/**
 * Long hair falling from behind the ears to the shoulders: a sheet that leaves the shell high on
 * the back of the head, drapes over the widest part of the skull and falls from there, flaring a
 * little, in loose clumps, the ends uneven.
 */
function curtainGeometry(shape: FaceShape, thickness: (d: THREE.Vector3) => number): THREE.BufferGeometry {
  const cols = 44;
  const rows = 14;
  const positions: number[] = [];
  const uvs: number[] = [];
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

/** Gathered at the back of the head, bushing out below the tie and tapering to the tip. */
function ponytailGeometry(shape: FaceShape): THREE.BufferGeometry {
  const d = new THREE.Vector3(0, 0.12, -1).normalize();
  const base = d.clone().multiplyScalar(headRadius(d, shape) - 0.004);
  const curve = new THREE.CatmullRomCurve3([
    base,
    base.clone().add(new THREE.Vector3(0, -0.02, -0.04)),
    base.clone().add(new THREE.Vector3(0, -0.1, -0.07)),
    base.clone().add(new THREE.Vector3(0, -0.2, -0.055)),
  ]);
  const tubular = 20;
  const radial = 10;
  const geometry = new THREE.TubeGeometry(curve, tubular, 0.017, radial, false);
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

/** Streaks of lighter and darker strands running down the texture (along v); tight coils for curly hair. */
function strandTexture(color: number, curly: boolean, seed: number): THREE.CanvasTexture {
  const S = 256;
  const [canvas, ctx] = createCanvas(S, S);
  const random = seededRandom(seed);
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const shade = (k: number, alpha: number): string => `rgba(${Math.min(255, Math.round(r * k + 8 * (k - 1)))},${Math.min(255, Math.round(g * k + 8 * (k - 1)))},${Math.min(255, Math.round(b * k + 8 * (k - 1)))},${alpha})`;
  ctx.fillStyle = shade(1, 1);
  ctx.fillRect(0, 0, S, S);
  if (curly) {
    for (let i = 0; i < 900; i++) {
      ctx.strokeStyle = shade(random() < 0.5 ? 0.6 : 1.35, 0.45);
      ctx.lineWidth = 1 + random();
      ctx.beginPath();
      ctx.arc(random() * S, random() * S, 2 + random() * 3, random() * 6, random() * 6 + 3);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 700; i++) {
      const x = random() * S;
      ctx.strokeStyle = shade(random() < 0.5 ? 0.62 + random() * 0.2 : 1.2 + random() * 0.35, 0.3 + random() * 0.3);
      ctx.lineWidth = 0.6 + random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (random() - 0.5) * 6, S / 3, x + (random() - 0.5) * 6, (2 * S) / 3, x, S);
      ctx.stroke();
    }
  }
  const texture = toTexture(canvas, 4);
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(3, 1);
  return texture;
}
