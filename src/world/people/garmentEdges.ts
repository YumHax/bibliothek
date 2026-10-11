import * as THREE from 'three';
import { PELVIS_Y, RING, TORSO_BOTTOM, TORSO_TOP, trunkSection } from './body';
import { weldNormals } from './geometry';
import type { PersonLook } from './looks';

/*
 * Cloth has edges with a thickness: a turned hem, a collar folded over its stand, a hood's rolled
 * rim. A painted line on a body reads as paint; a lip that stands a few millimetres off it and
 * catches the light reads as cloth. Here: the band round the hips where an untucked top ends (its
 * lip pushed by `HemFlare`), a shirt's collar, and a shell of sphere with a thickness (the hood
 * down on the back, the hood up).
 */

/**
 * The hem band's profile from its top (hugging the body) down round the turned lip and back under
 * it: height from the hem line, distance off the body, and how much of the lip it is (what
 * `HemFlare` pushes). A hoodie's ribbed waistband is taller and tighter.
 */
const HEM: ReadonlyArray<readonly [dy: number, off: number, lip: number]> = [
  [0.03, 0.0008, 0],
  [0.018, 0.002, 0.3],
  [0.006, 0.0045, 0.8],
  [0, 0.0058, 1],
  [-0.003, 0.0048, 1], // convention-ok: the cloth's own profile, not a layer on a surface
  [-0.0036, 0.0022, 1], // convention-ok: the cloth's own profile, not a layer on a surface
];
const RIB: ReadonlyArray<readonly [dy: number, off: number, lip: number]> = [
  [0.048, 0.0008, 0],
  [0.04, 0.0042, 0.2],
  [0.006, 0.005, 0.5],
  [0, 0.0052, 0.6],
  [-0.003, 0.0038, 0.6], // convention-ok: the cloth's own profile, not a layer on a surface
  [-0.0036, 0.0015, 0.6], // convention-ok: the cloth's own profile, not a layer on a surface
];

/** Whether `look` wears its top out over the trousers with a hem of its own (not a shirt, a jacket, a dress, a skirt's waistband or an apron over it). */
export function hasLooseHem(look: PersonLook): boolean {
  return look.top !== 'shirt' && look.top !== 'jacket' && look.skirt === undefined && look.apron === undefined && !look.coat;
}

/**
 * The band of an untucked top's hem round the trunk at `hemY` (reference metres over the floor), in
 * the pelvis's frame. Its UVs are the trunk's (`paintTorso`), so it wears the top's own colour and
 * pattern; `hemOut` tells `HemFlare` which way is out and how much is lip.
 */
export function hemBand(look: PersonLook, hemY: number): THREE.BufferGeometry {
  const profile = look.top === 'hoodie' ? RIB : HEM;
  const cols = 48;
  const positions: number[] = [];
  const uvs: number[] = [];
  const out: number[] = [];
  for (const [dy, off, lip] of profile) {
    const y = hemY + dy;
    const s = trunkSection(y, look);
    const v = (y - TORSO_BOTTOM) / (TORSO_TOP - TORSO_BOTTOM);
    for (let j = 0; j <= cols; j++) {
      const theta = -Math.PI + (j / cols) * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      const depth = cos >= 0 ? s.front : s.back;
      const x = s.halfWidth * Math.sign(sin) * Math.abs(sin) ** (2 / RING);
      const z = depth * Math.sign(cos) * Math.abs(cos) ** (2 / RING);
      // Out of the ring there: the superellipse's gradient.
      const nx = (Math.sign(x) * Math.abs(x / s.halfWidth) ** (RING - 1)) / s.halfWidth;
      const nz = (Math.sign(z) * Math.abs(z / depth) ** (RING - 1)) / depth;
      const n = Math.hypot(nx, nz) || 1;
      positions.push(x + (nx / n) * off, y - PELVIS_Y, z + (nz / n) * off);
      uvs.push(j / cols, Math.min(v + 0.012, 1));
      out.push(nx / n, nz / n, lip);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('hemOut', new THREE.Float32BufferAttribute(out, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  weldNormals(geometry);
  return geometry;
}

/**
 * A shirt's collar round the neck (origin at the neck's base, +y up the neck): the stand up the
 * neck, folded over at its top, the leaf coming down over it to a rounded edge that lies on the
 * shoulders, and the two points turning down onto the chest. Closed in its profile, so it has a
 * thickness wherever it is seen from.
 */
export function collarGeometry(): THREE.BufferGeometry {
  const profile = [
    [0.0585, -0.014],
    [0.0585, 0.016],
    [0.0592, 0.021],
    [0.0612, 0.0235],
    [0.0634, 0.022],
    [0.0668, 0.012],
    [0.0718, -0.004], // convention-ok: the cloth's own profile, not a layer on a surface
    [0.0752, -0.014],
    [0.0762, -0.0172],
    [0.0748, -0.0188],
    [0.0722, -0.0172],
    [0.0628, -0.014],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const collar = new THREE.LatheGeometry(profile, 32);
  collar.scale(1, 1, 0.9);
  return collar;
}

/** The collar's points: a rounded leaf each side of the throat, lying down onto the chest from the collar's front (`side` -1 or 1). */
export function collarPoint(side: -1 | 1): THREE.BufferGeometry {
  const leaf = new THREE.SphereGeometry(1, 12, 8);
  leaf.scale(0.016, 0.003, 0.024);
  leaf.translate(0, 0, 0.012);
  leaf.rotateX(1.15);
  leaf.rotateY(side * 0.5);
  leaf.translate(side * 0.022, -0.012, 0.064);
  return leaf;
}

/**
 * A shell of sphere (as `THREE.SphereGeometry` takes its angles) with a thickness: the outside at
 * `radius`, the inside `thickness` within it, and the rim between them all round the open edge.
 */
export function thickSphereShell(radius: number, thickness: number, phiStart: number, phiLength: number, thetaStart: number, thetaLength: number, widthSegments: number, heightSegments: number): THREE.BufferGeometry {
  const point = (u: number, v: number, r: number): THREE.Vector3 => {
    const phi = phiStart + u * phiLength;
    const theta = thetaStart + v * thetaLength;
    return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
  };
  const positions: number[] = [];
  const index: number[] = [];
  const grid = (r: number, flip: boolean): void => {
    const start = positions.length / 3;
    for (let iy = 0; iy <= heightSegments; iy++) {
      for (let ix = 0; ix <= widthSegments; ix++) positions.push(...point(ix / widthSegments, iy / heightSegments, r).toArray());
    }
    const at = (ix: number, iy: number): number => start + iy * (widthSegments + 1) + ix;
    for (let iy = 0; iy < heightSegments; iy++) {
      for (let ix = 0; ix < widthSegments; ix++) {
        const a = at(ix + 1, iy);
        const b = at(ix, iy);
        const c = at(ix, iy + 1);
        const d = at(ix + 1, iy + 1);
        if (flip) index.push(a, d, b, b, d, c);
        else index.push(a, b, d, b, c, d);
      }
    }
  };
  grid(radius, false);
  grid(radius - thickness, true);
  // The rim, round the edge of the (u, v) square; each quad faces away from the shell's middle.
  const edge: Array<[number, number]> = [];
  for (let ix = 0; ix < widthSegments; ix++) edge.push([ix / widthSegments, 0]);
  for (let iy = 0; iy < heightSegments; iy++) edge.push([1, iy / heightSegments]);
  for (let ix = widthSegments; ix > 0; ix--) edge.push([ix / widthSegments, 1]);
  for (let iy = heightSegments; iy > 0; iy--) edge.push([0, iy / heightSegments]);
  const middle = point(0.5, 0.5, radius);
  const inner = radius - thickness;
  const normal = new THREE.Vector3();
  const towards = new THREE.Vector3();
  for (let k = 0; k < edge.length; k++) {
    const [u0, v0] = edge[k]!;
    const [u1, v1] = edge[(k + 1) % edge.length]!;
    const quad = [point(u0, v0, radius), point(u1, v1, radius), point(u1, v1, inner), point(u0, v0, inner)];
    normal.subVectors(quad[1]!, quad[0]!).cross(towards.subVectors(quad[3]!, quad[0]!));
    towards.copy(quad[0]!).add(quad[1]!).multiplyScalar(0.5).sub(middle);
    const start = positions.length / 3;
    for (const p of quad) positions.push(p.x, p.y, p.z);
    if (normal.dot(towards) >= 0) index.push(start, start + 1, start + 2, start, start + 2, start + 3);
    else index.push(start, start + 2, start + 1, start, start + 3, start + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}
