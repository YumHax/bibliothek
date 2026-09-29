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
const WINTER = ['#6a5e52', '#5e564e'];
/** How many crown shapes the trees share (a draw call each). */
const CROWN_SHAPES = 3;
/** A pavement tree's pit, square (metres). */
const PIT = 1.2;

/**
 * The trees: along the pavements and scattered over the park behind the hedge. A trunk with a
 * few limbs and a leafy crown (a lumpy sphere), both instanced (two draw calls for every tree),
 * each tree turned, sized and tinted on its own; the crowns sway with the wind (a vertex patch
 * fed from `SkyState.wind`). The season is the painted view's (`currentSeason`): fresh greens
 * and blossom in spring, turning in autumn and thinning as it deepens, bare in winter. Snow settles
 * on the crowns' tops and along the limbs (`snowCovered`).
 */
export class StreetTrees extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly sway = { time: { value: 0 }, wind: { value: 0.3 } };

  constructor(private readonly dayNight: DayNight, spots: readonly TreeSpot[]) {
    super();
    this.name = 'StreetTrees';
    const random = seededRandom(3301);
    const season = currentSeason();

    const trunk = new THREE.CylinderGeometry(0.11, 0.19, CROWN_Y, 7).translate(0, CROWN_Y / 2, 0);
    const limbs = [0, 2.1, 4.2].map((a) => new THREE.CylinderGeometry(0.04, 0.08, 2.2, 5).translate(0, 1.1, 0).rotateZ(0.7).rotateY(a).translate(0, CROWN_Y - 1.2, 0));
    const wood = mergeGeometries([trunk, ...limbs]);
    for (const g of [trunk, ...limbs]) g.dispose();
    // Snow lies along the limbs' upper sides (the bare trees of winter get their dusting there).
    const trunks = new THREE.InstancedMesh(wood, snowCovered(new THREE.MeshStandardMaterial({ color: 0x4a3c30, roughness: 0.95 })), spots.length);

    // A few crown shapes (each its own lumps), each tree one of them, stretched on its own.
    const crownGeometries = Array.from({ length: CROWN_SHAPES }, () => lumpySphere(random).scale(CROWN_RADIUS, CROWN_RADIUS * 0.85, CROWN_RADIUS).translate(0, CROWN_Y + 0.6, 0));
    const crownMaterial = snowCovered(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }));
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
    const shapeOf = spots.map((_, i) => i % CROWN_SHAPES);
    const crowns = crownGeometries.map((g, k) => new THREE.InstancedMesh(g, crownMaterial, Math.max(1, shapeOf.filter((shape) => shape === k).length)));
    const filled = crowns.map(() => 0);
    // The pavements' trees stand in square pits with a cast-iron grate (the park's in the lawn).
    const pitted = spots.filter(({ at }) => at[0] > PARK_STREET.hedge && !isRoad(at[0], at[1]));
    const pits = pitted.length > 0 ? new THREE.InstancedMesh(new THREE.PlaneGeometry(PIT, PIT).rotateX(-Math.PI / 2), onSurface(new THREE.MeshStandardMaterial({ map: grateTexture(), color: 0xffffff, roughness: 0.75 }), GROUND.grate), pitted.length) : null;

    const palette = season.name === 'spring' ? SPRING : season.name === 'autumn' ? AUTUMN : season.name === 'winter' ? WINTER : SUMMER;
    const matrix = new THREE.Matrix4();
    const crownMatrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const color = new THREE.Color();
    spots.forEach(({ at, scale: s }, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2);
      matrix.compose(new THREE.Vector3(at[0], 0, at[1]), q, new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(i, matrix);
      // Winter strips the crowns; late autumn thins them.
      const leaf = season.name === 'winter' ? 0.001 : season.name === 'autumn' ? 1 - 0.55 * season.depth * random() : 1;
      // Wider or taller, about the crown's middle.
      const [sx, sy, sz] = [leaf * (0.88 + random() * 0.24), leaf * (0.85 + random() * 0.3), leaf * (0.88 + random() * 0.24)];
      crownMatrix.copy(matrix).multiply(new THREE.Matrix4().makeScale(sx, sy, sz).setPosition(0, (1 - sy) * (CROWN_Y + 0.6), 0));
      const shape = shapeOf[i]!;
      const crown = crowns[shape]!;
      crown.setMatrixAt(filled[shape]!, crownMatrix);
      color.set(palette[Math.floor(random() * palette.length)]!).multiplyScalar(0.85 + random() * 0.3);
      crown.setColorAt(filled[shape]!++, color);
    });
    pitted.forEach(({ at }, i) => {
      pits!.setMatrixAt(i, matrix.makeRotationY(random() < 0.5 ? 0 : Math.PI / 2).setPosition(at[0], GROUND.grate.lift, at[1]));
    });
    if (pits) {
      pits.instanceMatrix.needsUpdate = true;
      pits.computeBoundingSphere();
      pits.receiveShadow = true;
      this.add(pits);
    }
    for (const mesh of [trunks, ...crowns]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    crowns.forEach((crown, k) => {
      crown.count = filled[k]!;
      if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
    });
    this.add(trunks, ...crowns);
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
}

/** A unit sphere with its vertices pushed in and out a little: foliage, not a ball. */
function lumpySphere(random: () => number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const bumps = [0, 1, 2, 3, 4].map(() => new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize());
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let r = 1;
    for (const b of bumps) r += 0.12 * Math.max(0, v.dot(b));
    r += (Math.sin(v.x * 9) * Math.sin(v.y * 7) * Math.sin(v.z * 8)) * 0.06;
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
