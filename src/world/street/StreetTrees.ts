import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { currentSeason } from '@/time/season';
import { patchShader, afterChunk } from '../materials/shaderPatch';
import { snowCovered } from './snowCover';
import { PARK_STREET, type Vec2 } from './streetPlan';
import { isRoad } from './relief/ground';
import { GROUND, onSurface } from '../surface/layers';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { TREE_FORM, type PlantedTree } from '../city/trees';

/** A tree to plant: where, and how big (1 = a street tree about 7 m tall; `city/trees`). */
export type TreeSpot = PlantedTree;

const CROWN_Y = TREE_FORM.trunk;
const CROWN_RADIUS = TREE_FORM.crown;
const SUMMER = ['#4f7a34', '#5a8a3a', '#46703a', '#628f42'];
const SPRING = ['#7fb04a', '#8cc05a', '#72a444', '#e7b8c8'];
const AUTUMN = ['#c9862f', '#d9a33a', '#b8562a', '#8a7a32', '#6a8a3a'];
/** How many crown shapes and branch frames the trees share (a draw call each per stretch). */
const CROWN_SHAPES = 3;
const WOOD_SHAPES = 2;
/** A crown is this many clumps of leaves round its middle. */
const CLUMPS = [5, 7] as const;
/** A pavement tree's pit, square (metres). */
const PIT = 1.2;
/** The trees are drawn in stretches along x (the park's, the corner's, along Front Street), each culled when out of view. */
const STRETCH_EDGES = [PARK_STREET.hedge, 0, 50] as const;

/**
 * The trees: along the pavements and scattered over the park behind the hedge. A trunk branching
 * into limbs, branches and twigs (the frame bare in winter, inside the leaves the rest of the year)
 * and a crown of leafy clumps (lumpy blobs, darker underneath and inside), both instanced per shape
 * and per stretch of street (`STRETCH_EDGES`: a stretch out of view is not drawn), each tree turned,
 * sized and tinted on its own; the crowns sway with the wind (a vertex patch fed from
 * `SkyState.wind`). The season is the painted view's (`currentSeason`): fresh greens and blossom in
 * spring, turning in autumn and thinning as it deepens, bare in winter. Snow settles on the crowns'
 * tops and along the limbs, and rain wets the bark (`snowCovered`).
 */
export class StreetTrees extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly sway = { time: { value: 0 }, wind: { value: 0.3 } };

  constructor(private readonly dayNight: DayNight, spots: readonly TreeSpot[]) {
    super();
    this.name = 'StreetTrees';
    const random = seededRandom(3301);
    const season = currentSeason();
    const bare = season.name === 'winter';

    const woods = Array.from({ length: WOOD_SHAPES }, (_, k) => branchFrame(seededRandom(4401 + k * 17)));
    const bark = snowCovered(new THREE.MeshStandardMaterial({ color: 0x4a3c30, roughness: 0.95 }));
    const crownGeometries = Array.from({ length: CROWN_SHAPES }, () => crownClumps(random));
    const crownMaterial = snowCovered(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true, vertexColors: true }));
    patchShader(crownMaterial, 'streetTreeSway', (shader) => {
      shader.uniforms.swayTime = this.sway.time;
      shader.uniforms.swayWind = this.sway.wind;
      shader.vertexShader = 'uniform float swayTime;\nuniform float swayWind;\n' + afterChunk(shader.vertexShader, 'begin_vertex', /* glsl */ `
        #ifdef USE_INSTANCING
          float swayPhase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
        #else
          float swayPhase = 0.0;
        #endif
        float swayHeight = max(transformed.y - ${(CROWN_Y - 1.5).toFixed(2)}, 0.0);
        transformed.x += sin(swayTime * 1.3 + swayPhase) * swayWind * 0.07 * swayHeight;
        transformed.z += cos(swayTime * 1.05 + swayPhase * 1.3) * swayWind * 0.05 * swayHeight;
      `);
    });
    // The pavements' trees stand in square pits with a cast-iron grate (the park's in the lawn).
    const pitted = spots.filter(({ at }) => at[0] > PARK_STREET.hedge && !isRoad(at[0], at[1]));
    const pits = pitted.length > 0 ? new THREE.InstancedMesh(new THREE.PlaneGeometry(PIT, PIT).rotateX(-Math.PI / 2), onSurface(new THREE.MeshStandardMaterial({ map: grateTexture(), color: 0xffffff, roughness: 0.75 }), GROUND.grate), pitted.length) : null;

    const palette = season.name === 'spring' ? SPRING : season.name === 'autumn' ? AUTUMN : SUMMER;
    const matrix = new THREE.Matrix4();
    const crownMatrix = new THREE.Matrix4();
    const scale = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    const at = new THREE.Vector3();
    const size = new THREE.Vector3();
    // Each tree: its stretch, its turn and size, its crown's stretch and tint (drawn in the same order as before: the seeded look stays).
    const trees = spots.map(({ at: [x, z], scale: s }, i) => {
      q.setFromAxisAngle(yAxis, random() * Math.PI * 2);
      matrix.compose(at.set(x, 0, z), q, size.set(s, s, s));
      // Late autumn thins the crowns.
      const leaf = season.name === 'autumn' ? 1 - 0.55 * season.depth * random() : 1;
      // Wider or taller, about the crown's middle.
      const [sx, sy, sz] = [leaf * (0.88 + random() * 0.24), leaf * (0.85 + random() * 0.3), leaf * (0.88 + random() * 0.24)];
      crownMatrix.copy(matrix).multiply(scale.makeScale(sx, sy, sz).setPosition(0, (1 - sy) * (CROWN_Y + 0.6), 0));
      color.set(palette[Math.floor(random() * palette.length)]!).multiplyScalar(0.85 + random() * 0.3);
      return { stretch: STRETCH_EDGES.filter((edge) => x >= edge).length, wood: matrix.clone(), crown: crownMatrix.clone(), tint: color.clone(), shape: i % CROWN_SHAPES, frame: i % WOOD_SHAPES };
    });

    const stretches = new Set(trees.map((t) => t.stretch));
    for (const stretch of stretches) {
      const here = trees.filter((t) => t.stretch === stretch);
      for (let k = 0; k < WOOD_SHAPES; k++) {
        const own = here.filter((t) => t.frame === k);
        if (own.length === 0) continue;
        const mesh = new THREE.InstancedMesh(woods[k]!, bark, own.length);
        own.forEach((t, n) => mesh.setMatrixAt(n, t.wood));
        this.finish(mesh);
      }
      if (bare) continue;
      for (let k = 0; k < CROWN_SHAPES; k++) {
        const own = here.filter((t) => t.shape === k);
        if (own.length === 0) continue;
        const mesh = new THREE.InstancedMesh(crownGeometries[k]!, crownMaterial, own.length);
        own.forEach((t, n) => {
          mesh.setMatrixAt(n, t.crown);
          mesh.setColorAt(n, t.tint);
        });
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        this.finish(mesh);
      }
    }
    pitted.forEach(({ at: [x, z] }, i) => {
      pits!.setMatrixAt(i, matrix.makeRotationY(random() < 0.5 ? 0 : Math.PI / 2).setPosition(x, GROUND.grate.lift, z));
    });
    if (pits) {
      pits.instanceMatrix.needsUpdate = true;
      pits.computeBoundingSphere();
      pits.receiveShadow = true;
      this.add(pits);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The trunks the player walks round (zone-local boxes). */
  static colliders(spots: readonly Vec2[]): THREE.Box3[] {
    return spots.map((at) => new THREE.Box3(new THREE.Vector3(at[0] - 0.4, 0, at[1] - 0.4), new THREE.Vector3(at[0] + 0.4, 1.5, at[1] + 0.4)));
  }

  update(dt: number): void {
    this.sway.time.value = (this.sway.time.value + dt) % 1000;
    this.sway.wind.value += (this.dayNight.state.wind - this.sway.wind.value) * Math.min(1, dt * 2);
  }

  private finish(mesh: THREE.InstancedMesh): void {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.add(mesh);
  }
}

/**
 * A tree's wooden frame (scale 1): the trunk, four or five limbs out of its head, each forking into
 * branches and those into twigs, thinner and shorter at each fork, turned up towards the light.
 * Open-ended tapered cylinders, merged.
 */
function branchFrame(random: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const piece = (from: THREE.Vector3, dir: THREE.Vector3, length: number, r0: number, r1: number, sides: number): void => {
    const g = new THREE.CylinderGeometry(r1, r0, length, sides, 1, true).translate(0, length / 2, 0);
    q.setFromUnitVectors(up, dir);
    g.applyQuaternion(q).translate(from.x, from.y, from.z);
    parts.push(g.toNonIndexed());
    g.dispose();
  };
  const trunkTop = CROWN_Y - 0.9;
  piece(new THREE.Vector3(0, 0, 0), up, trunkTop + 0.3, 0.19, 0.12, 8);
  const grow = (from: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, depth: number): void => {
    piece(from, dir, length, radius, radius * 0.62, depth === 0 ? 6 : 4);
    if (depth >= 2) return;
    const end = from.clone().addScaledVector(dir, length);
    const forks = depth === 0 ? 3 : 2;
    for (let i = 0; i < forks; i++) {
      const a = random() * Math.PI * 2;
      const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const next = dir.clone().multiplyScalar(0.7).addScaledVector(side, 0.55 + random() * 0.3).add(new THREE.Vector3(0, 0.25, 0)).normalize();
      const start = from.clone().addScaledVector(dir, length * (0.55 + random() * 0.45));
      grow(i === 0 ? end : start, next, length * (0.52 + random() * 0.12), radius * 0.6, depth + 1);
    }
  };
  const limbs = 4 + Math.floor(random() * 2);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + random() * 0.6;
    const dir = new THREE.Vector3(Math.cos(a) * 0.62, 1, Math.sin(a) * 0.62).normalize();
    grow(new THREE.Vector3(0, trunkTop - random() * 0.9, 0), dir, 1.7 + random() * 0.6, 0.075, 0);
  }
  const out = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return out;
}

/**
 * A crown (scale 1): `CLUMPS` lumpy blobs of leaves gathered round its middle into the crown's
 * envelope, a vertex colour per corner, darker underneath and deep inside (the light gets in less),
 * brighter on the outside top. Unit-radius `TREE_FORM.crown`, the middle `TREE_FORM.trunk + 0.6` up.
 */
function crownClumps(random: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const centre = new THREE.Vector3(0, CROWN_Y + 0.6, 0);
  const n = CLUMPS[0] + Math.floor(random() * (CLUMPS[1] - CLUMPS[0] + 1));
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    // The first one is the crown's core; the others sit round it, the upper ones bigger.
    const a = random() * Math.PI * 2;
    const y = i === 0 ? 0 : -0.35 + random() * 0.9;
    const out = i === 0 ? 0 : 0.42 + random() * 0.18;
    const r = (i === 0 ? 0.62 : 0.4 + random() * 0.18 + 0.08 * y) * CROWN_RADIUS;
    const at = new THREE.Vector3(Math.cos(a) * out * CROWN_RADIUS, y * CROWN_RADIUS * 0.85, Math.sin(a) * out * CROWN_RADIUS).add(centre);
    const blob = lumpySphere(random).scale(r, r * 0.88, r).translate(at.x, at.y, at.z);
    const pos = blob.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).sub(centre);
      const reach = Math.min(1, v.length() / CROWN_RADIUS);
      const height = THREE.MathUtils.clamp(v.y / (CROWN_RADIUS * 0.85) * 0.5 + 0.5, 0, 1);
      const shade = 0.55 + 0.3 * reach + 0.2 * height;
      colors.set([shade, shade, shade * 0.97], k * 3);
    }
    blob.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(blob);
  }
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return merged;
}

/** A unit sphere with its vertices pushed in and out a little: foliage, not a ball (non-indexed, as three builds it). */
function lumpySphere(random: () => number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const bumps = [0, 1, 2, 3].map(() => new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize());
  const seed = random() * 10;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let r = 1;
    for (const b of bumps) r += 0.14 * Math.max(0, v.dot(b));
    r += Math.sin(v.x * 9 + seed) * Math.sin(v.y * 7) * Math.sin(v.z * 8 + seed) * 0.08;
    v.multiplyScalar(r);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A tree pit's cast-iron grate: a frame, rings of slots round the trunk's hole, the soil dark through them. */
function grateTexture(): THREE.CanvasTexture {
  const size = 128;
  const [canvas, ctx] = createCanvas(size, size);
  const c = size / 2;
  ctx.fillStyle = '#2b2622';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#4a4744';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);
  ctx.lineWidth = 2.5;
  for (const r of [18, 30, 42, 54]) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(t) * 14, c + Math.sin(t) * 14);
    ctx.lineTo(c + Math.cos(t) * 62, c + Math.sin(t) * 62);
    ctx.stroke();
  }
  // The trunk's hole: soil.
  ctx.fillStyle = '#1e1a16';
  ctx.beginPath();
  ctx.arc(c, c, 13, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(canvas, 4);
}
