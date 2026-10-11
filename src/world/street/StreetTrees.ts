import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { currentSeason } from '@/time/season';
import { patchShader, afterChunk } from '../materials/shaderPatch';
import { windSwayed } from './wind';
import { snowCovered } from './snowCover';
import type { Vec2 } from './streetPlan';
import { PARK_STREET } from '@/world/measures/street';
import { isRoad } from './relief/ground';
import { GROUND, onSurface } from '../surface/layers';
import { overKeepingAlpha } from '../materials/blend';
import { radialGlow } from '../materials/glowTextures';
import { canvasTexture, createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { TREE_FORM, type PlantedTree, type TreeSpecies } from '../city/trees';
import { lcg } from '@/random';

/** Past the sun's shadow map (`StreetLighting`'s square round the player), each tree's shadow lies on the ground as a soft
 * decal instead: faded in between these distances from the eye (m), this dark at most (in leaf; bare: a third of it). */
const FAR_SHADE = { from: 22, to: 30, dark: 0.42 } as const;

/** A tree to plant: where, and how big (1 = a street tree about 7 m tall; `city/trees`). */
export type TreeSpot = PlantedTree;

const CROWN_Y = TREE_FORM.trunk;
const CROWN_RADIUS = TREE_FORM.crown;
/**
 * Each kind of tree (`TreeSpecies`): its leaves by season (summer, spring, autumn), its crown's clumps and how the
 * crown is drawn out (wider, flatter or taller about its middle), how wide its limbs spread, and its bark.
 */
interface SpeciesLook {
  summer: readonly string[];
  spring: readonly string[];
  autumn: readonly string[];
  clumps: readonly [number, number];
  crown: { wide: number; tall: number };
  spread: number;
  bark: 'furrowed' | 'mottled';
}
const SPECIES: Record<TreeSpecies, SpeciesLook> = {
  lime: {
    summer: ['#4f7a34', '#5a8a3a', '#46703a', '#628f42'],
    spring: ['#7fb04a', '#8cc05a', '#72a444', '#e7b8c8'],
    autumn: ['#c9862f', '#d9a33a', '#b8562a', '#8a7a32', '#6a8a3a'],
    clumps: [5, 7],
    crown: { wide: 1, tall: 1 },
    spread: 0.62,
    bark: 'furrowed',
  },
  plane: {
    summer: ['#6b8f3e', '#7a9a46', '#5f8538', '#86a24c'],
    spring: ['#9cc25a', '#a8c868', '#8fb850'],
    autumn: ['#b89a4a', '#a87e3a', '#8a6a32', '#c4a456', '#9a8a3e'],
    clumps: [7, 9],
    crown: { wide: 1.16, tall: 0.84 },
    spread: 0.85,
    bark: 'mottled',
  },
  chestnut: {
    summer: ['#3f6a2e', '#46733a', '#38602a', '#4c7a36'],
    spring: ['#5f9a3a', '#6aa444', '#f0ead8', '#5a9036'],
    autumn: ['#b8642a', '#c8823a', '#9a4a22', '#7a6a2a'],
    clumps: [6, 8],
    crown: { wide: 0.96, tall: 1.12 },
    spread: 0.5,
    bark: 'furrowed',
  },
};
const SPECIES_ORDER: readonly TreeSpecies[] = ['lime', 'plane', 'chestnut'];
/** How many crown shapes and branch frames each kind shares (a draw call each per stretch where it grows). */
const CROWN_SHAPES = 2;
const WOOD_SHAPES = 2;
/** Where the crown's sway starts (scale-1 tree, object space): the trunk under it stands still, limbs and crown move together. */
const SWAY_PIVOT = CROWN_Y - 1.5;
/** Cards of leaves scattered over a crown's clumps (its ragged outline against the sky), and their size (m, scale 1). */
const LEAF_CARDS = 70;
const CARD_SIZE = 0.75;
/** How far a crown's normals lean from each clump's own towards the crown's middle (soft, one rounded mass of leaves). */
const SOFT_NORMALS = 0.6;
/** A pavement tree's pit, square (metres). */
const PIT = 1.2;
/** The trees are drawn in stretches along x (the park's, the corner's, along Front Street), each culled when out of view. */
const STRETCH_EDGES = [PARK_STREET.hedge, 0, 50] as const;

/**
 * The trees: along the pavements and scattered over the park behind the hedge, of three kinds (`SPECIES`: the
 * pavements' London planes, the park's limes and horse chestnuts). A trunk branching into limbs, branches and twigs
 * (the frame bare in winter, inside the leaves the rest of the year; its bark the kind's: furrowed, or the plane's
 * peeling patches) and a crown of leafy clumps (lumpy blobs, darker underneath and inside, smooth-shaded as one mass,
 * under a scatter of alpha-tested leaf cards that break its outline; the sun wraps round it and shines through its rim
 * when it is behind), both instanced per kind, per shape and per stretch of street (`STRETCH_EDGES`: a stretch out of
 * view is not drawn), each tree turned, sized and tinted on its own. Crowns, limbs and bare branches sway together
 * with the street's wind (`wind.ts`: gusts running down the street, one tree after the next), the leaf cards shivering
 * on top. The season is the painted view's (`currentSeason`): fresh greens and blossom (the chestnuts' candles) in
 * spring, turning in autumn and thinning as it deepens, bare in winter. Snow settles on the crowns' tops and along
 * the limbs, and rain wets the bark (`snowCovered`).
 */
export class StreetTrees extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  /** How strong the far shadows are now (the sun's light through the weather). */
  private readonly shade = { value: 0 };
  private readonly bare: boolean;

  /** `farSun`: the street's sun direction (zone-local, towards it: `StreetLighting.far`), for the shadows past its map; none, none. */
  constructor(private readonly dayNight: DayNight, spots: readonly TreeSpot[], farSun?: { value: THREE.Vector3 }) {
    super();
    this.name = 'StreetTrees';
    const random = lcg(3301);
    const season = currentSeason();
    const bare = season.name === 'winter';
    this.bare = bare;

    // Each kind its frames, crowns, cards and bark, only for the kinds planted here.
    const kinds = SPECIES_ORDER.filter((k) => spots.some((t) => (t.species ?? 'lime') === k));
    const crownMaterial = this.leafy(windSwayed(snowCovered(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true })), 'treeCrown', { pivotY: SWAY_PIVOT }));
    const cardMaterial = this.leafy(windSwayed(snowCovered(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true, map: leafClusterTexture(), alphaTest: 0.5, side: THREE.DoubleSide })), 'treeCards', { pivotY: SWAY_PIVOT, flutter: 0.02 }));
    const forms = new Map(kinds.map((kind) => {
      const look = SPECIES[kind];
      const crowns = Array.from({ length: CROWN_SHAPES }, () => crownClumps(random, look));
      return [kind, {
        woods: Array.from({ length: WOOD_SHAPES }, (_, k) => branchFrame(lcg(4401 + k * 17 + SPECIES_ORDER.indexOf(kind) * 101), look.spread)),
        crowns,
        cards: crowns.map((g) => leafCards(random, g)),
        bark: windSwayed(snowCovered(new THREE.MeshStandardMaterial({ map: barkTexture(look.bark), color: 0xffffff, roughness: 0.95 })), `treeBark:${look.bark}`, { pivotY: SWAY_PIVOT }),
      }] as const;
    }));
    // The pavements' trees stand in square pits with a cast-iron grate (the park's in the lawn).
    const pitted = spots.filter(({ at }) => at[0] > PARK_STREET.hedge && !isRoad(at[0], at[1]));
    const pits = pitted.length > 0 ? new THREE.InstancedMesh(new THREE.PlaneGeometry(PIT, PIT).rotateX(-Math.PI / 2), onSurface(new THREE.MeshStandardMaterial({ map: grateTexture(), color: 0xffffff, roughness: 0.75 }), GROUND.grate), pitted.length) : null;

    const matrix = new THREE.Matrix4();
    const crownMatrix = new THREE.Matrix4();
    const scale = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    const at = new THREE.Vector3();
    const size = new THREE.Vector3();
    // Each tree: its kind, stretch, turn and size, its crown's stretch and tint.
    const trees = spots.map(({ at: [x, z], scale: s, species }, i) => {
      const kind = species ?? 'lime';
      const look = SPECIES[kind];
      q.setFromAxisAngle(yAxis, random() * Math.PI * 2);
      matrix.compose(at.set(x, 0, z), q, size.set(s, s, s));
      // Late autumn thins the crowns.
      const leaf = season.name === 'autumn' ? 1 - 0.55 * season.depth * random() : 1;
      // Wider or taller, about the crown's middle.
      const [sx, sy, sz] = [leaf * (0.88 + random() * 0.24), leaf * (0.85 + random() * 0.3), leaf * (0.88 + random() * 0.24)];
      crownMatrix.copy(matrix).multiply(scale.makeScale(sx, sy, sz).setPosition(0, (1 - sy) * (CROWN_Y + 0.6), 0));
      const palette = season.name === 'spring' ? look.spring : season.name === 'autumn' ? look.autumn : look.summer;
      color.set(palette[Math.floor(random() * palette.length)]!).multiplyScalar(0.85 + random() * 0.3);
      return { kind, stretch: STRETCH_EDGES.filter((edge) => x >= edge).length, wood: matrix.clone(), crown: crownMatrix.clone(), tint: color.clone(), shape: i % CROWN_SHAPES, frame: i % WOOD_SHAPES };
    });

    const stretches = new Set(trees.map((t) => t.stretch));
    for (const stretch of stretches) {
      for (const kind of kinds) {
        const form = forms.get(kind)!;
        const here = trees.filter((t) => t.stretch === stretch && t.kind === kind);
        if (here.length === 0) continue;
        for (let k = 0; k < WOOD_SHAPES; k++) {
          const own = here.filter((t) => t.frame === k);
          if (own.length === 0) continue;
          const mesh = new THREE.InstancedMesh(form.woods[k]!, form.bark, own.length);
          own.forEach((t, n) => mesh.setMatrixAt(n, t.wood));
          this.finish(mesh);
        }
        if (bare) continue;
        for (let k = 0; k < CROWN_SHAPES; k++) {
          const own = here.filter((t) => t.shape === k);
          if (own.length === 0) continue;
          for (const [geometry, material] of [[form.crowns[k]!, crownMaterial], [form.cards[k]!, cardMaterial]] as const) {
            const mesh = new THREE.InstancedMesh(geometry, material, own.length);
            own.forEach((t, n) => {
              mesh.setMatrixAt(n, t.crown);
              mesh.setColorAt(n, t.tint);
            });
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            this.finish(mesh);
          }
        }
      }
    }
    if (farSun) this.add(farShadows(spots, farSun, this.shade));
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

  update(): void {
    const s = this.dayNight.state;
    this.shade.value = FAR_SHADE.dark * s.daylight * s.sunThrough * (this.bare ? 0.35 : 1);
  }

  /**
   * A leaf material, lit as leaves are: the light wraps a little round the crown's shoulders, and a sun low behind
   * the crown shines through its thin outer leaves (the first directional light: the street's sun or moon).
   */
  private leafy<M extends THREE.MeshStandardMaterial>(material: M): M {
    return patchShader(material, 'streetTreeLeaves', (shader) => {
      shader.fragmentShader = afterChunk(shader.fragmentShader, 'lights_fragment_end', /* glsl */ `
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 leafSun = directionalLights[ 0 ].direction;
          float leafFacing = dot( normal, leafSun );
          // Wrapped: the shoulders turned a little away from the sun still catch some of it.
          float leafWrap = max( ( leafFacing + 0.45 ) / 1.45, 0.0 ) - max( leafFacing, 0.0 );
          // Through the leaves: the sun behind the crown, its rim (thin against the sky) glowing most.
          float leafThrough = pow( max( dot( geometryViewDir, - leafSun ), 0.0 ), 4.0 );
          float leafOuter = 0.35 + 0.65 * ( 1.0 - abs( dot( normal, geometryViewDir ) ) );
          reflectedLight.directDiffuse += directionalLights[ 0 ].color * diffuseColor.rgb * ( 0.3 * leafWrap + 0.55 * leafThrough * leafOuter );
        }
        #endif
      `);
    });
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
 * The trees' shadows past the sun's map: one soft dark ellipse on the ground per tree, laid away from the sun (`farSun`)
 * as far as its crown stands high and stretched as the sun gets low, faded in only where the real shadow map has given
 * out (`FAR_SHADE`, from the eye) and with the sun's strength (`shade`). Its quad is shaped in the vertex shader.
 */
function farShadows(spots: readonly TreeSpot[], farSun: { value: THREE.Vector3 }, shade: { value: number }): THREE.InstancedMesh {
  const material = onSurface(
    overKeepingAlpha(new THREE.MeshBasicMaterial({ color: 0x0a0c10, alphaMap: radialGlow({ width: 64, height: 64, stops: [[0, 1], [0.55, 0.8], [1, 0]] }), depthWrite: false, fog: false })),
    GROUND.carShade,
  );
  patchShader(material, 'treeFarShadow', (shader) => {
    shader.uniforms.farSun = farSun;
    shader.uniforms.farShade = shade;
    shader.vertexShader =
      'uniform vec3 farSun;\nvarying vec3 vShadeWorld;\n' +
      afterChunk(shader.vertexShader, 'begin_vertex', /* glsl */ `
        vec3 shadeSun = normalize(farSun + vec3(0.0, 1e-4, 0.0));
        float shadeRun = clamp(length(shadeSun.xz) / max(shadeSun.y, 0.2), 0.0, 4.0);
        vec2 shadeAway = -normalize(shadeSun.xz + vec2(1e-5));
        vec2 shadeSide = vec2(-shadeAway.y, shadeAway.x);
        float shadeLen = ${(2 * CROWN_RADIUS).toFixed(2)} * (1.0 + 0.5 * shadeRun);
        vec2 shadeAt = shadeAway * shadeRun * ${(CROWN_Y + 0.6).toFixed(2)} + shadeAway * transformed.x * shadeLen + shadeSide * transformed.z * ${(2 * CROWN_RADIUS).toFixed(2)};
        transformed = vec3(shadeAt.x, transformed.y, shadeAt.y);
      `);
    shader.vertexShader = afterChunk(shader.vertexShader, 'project_vertex', 'vShadeWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader =
      'uniform float farShade;\nvarying vec3 vShadeWorld;\n' +
      afterChunk(shader.fragmentShader, 'alphamap_fragment', `diffuseColor.a *= farShade * smoothstep(${FAR_SHADE.from.toFixed(1)}, ${FAR_SHADE.to.toFixed(1)}, distance(vShadeWorld.xz, cameraPosition.xz));`);
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material, Math.max(spots.length, 1));
  mesh.name = 'TreeFarShadows';
  const m = new THREE.Matrix4();
  spots.forEach(({ at: [x, z], scale }, i) => mesh.setMatrixAt(i, m.makeScale(scale, 1, scale).setPosition(x, GROUND.carShade.lift, z)));
  mesh.count = spots.length;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * A tree's wooden frame (scale 1): the trunk, four or five limbs out of its head, each forking into
 * branches and those into twigs, thinner and shorter at each fork, turned up towards the light.
 * Open-ended tapered cylinders, merged.
 */
function branchFrame(random: () => number, spread: number): THREE.BufferGeometry {
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
    const dir = new THREE.Vector3(Math.cos(a) * spread, 1, Math.sin(a) * spread).normalize();
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
function crownClumps(random: () => number, look: SpeciesLook): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const centre = new THREE.Vector3(0, CROWN_Y + 0.6, 0);
  const [fewest, most] = look.clumps;
  const n = fewest + Math.floor(random() * (most - fewest + 1));
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
  // Soft: each normal leans towards the crown's own outward direction, so the clumps light as one rounded mass.
  const pos = merged.getAttribute('position') as THREE.BufferAttribute;
  const nor = merged.getAttribute('normal') as THREE.BufferAttribute;
  const outward = new THREE.Vector3();
  const own = new THREE.Vector3();
  for (let k = 0; k < pos.count; k++) {
    outward.fromBufferAttribute(pos, k).sub(centre).normalize();
    own.fromBufferAttribute(nor, k).lerp(outward, SOFT_NORMALS).normalize();
    nor.setXYZ(k, own.x, own.y, own.z);
  }
  // The kind's outline: drawn wider and flatter (the plane) or taller (the chestnut) about the crown's middle.
  const { wide, tall } = look.crown;
  if (wide !== 1 || tall !== 1) merged.translate(0, -centre.y, 0).scale(wide, tall, wide).translate(0, centre.y, 0);
  return merged;
}

/**
 * The crown's leaf cards (scale 1, the crown's frame): `LEAF_CARDS` quads of the leaf-cluster texture laid over the
 * surface of `crown`'s clumps, each turned about its outward direction and tilted a little out of it, so the edge of the
 * crown against the sky is leaves, not a smooth blob. Their normals are the crown's outward direction (lit as the
 * crown), their vertex colour the clump's under them, a little brighter.
 */
function leafCards(random: () => number, crown: THREE.BufferGeometry): THREE.BufferGeometry {
  const centre = new THREE.Vector3(0, CROWN_Y + 0.6, 0);
  const pos = crown.getAttribute('position') as THREE.BufferAttribute;
  const col = crown.getAttribute('color') as THREE.BufferAttribute;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colours: number[] = [];
  const at = new THREE.Vector3();
  const out = new THREE.Vector3();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const tilt = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const half = (CARD_SIZE * CROWN_RADIUS) / 2 / 2.6;
  for (let i = 0; i < LEAF_CARDS; i++) {
    const k = Math.floor(random() * pos.count);
    at.fromBufferAttribute(pos, k);
    out.copy(at).sub(centre).normalize();
    // Mostly the sides and the top: the underside of a crown is seen from below, in its own shade.
    if (out.y < -0.55 && random() < 0.7) continue;
    at.addScaledVector(out, (random() - 0.3) * 0.12 * CROWN_RADIUS);
    tilt.set(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(0.9).add(out).normalize();
    u.set(0, 1, 0).cross(tilt);
    if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
    u.normalize();
    v.copy(tilt).cross(u).normalize();
    const roll = random() * Math.PI * 2;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const size = half * (0.75 + random() * 0.6);
    const shade = Math.min(1, col.getX(k) * 1.08);
    const quad: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (const [a, b] of quad) {
      const x = (a * cr - b * sr) * size;
      const y = (a * sr + b * cr) * size;
      corner.copy(at).addScaledVector(u, x).addScaledVector(v, y);
      positions.push(corner.x, corner.y, corner.z);
      normals.push(out.x, out.y, out.z);
      uvs.push((a + 1) / 2, (b + 1) / 2);
      colours.push(shade, shade, shade * 0.97);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return geometry;
}

/** A cluster of leaves on a transparent ground: white (the tree's tint comes from its instance colour), cut by `alphaTest`. */
function leafClusterTexture(): THREE.CanvasTexture {
  const size = 128;
  const [canvas, ctx] = createCanvas(size, size);
  const random = lcg(5501);
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 46; i++) {
    // Denser in the middle of the card, a few strays at its edge.
    const r = Math.sqrt(random()) * size * 0.42;
    const a = random() * Math.PI * 2;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    const g = Math.round(170 + random() * 85);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(random() * Math.PI * 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, 4 + random() * 4, 9 + random() * 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return toTexture(canvas, 'facing');
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

/**
 * Bark, wrapped round the trunk and limbs (u round, v along each piece): `furrowed`, dark grey-brown ridges running up
 * with darker cracks between (the lime, the chestnut); `mottled`, the plane's: olive-grey bark flaking off in patches
 * of cream, khaki and pale green.
 */
function barkTexture(kind: 'furrowed' | 'mottled'): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const [canvas, ctx] = createCanvas(w, h);
  const random = lcg(kind === 'mottled' ? 7717 : 7711);
  if (kind === 'mottled') {
    ctx.fillStyle = '#7a7660';
    ctx.fillRect(0, 0, w, h);
    const patches = ['#cfc6a0', '#b9b38a', '#9aa07a', '#d8d2b4', '#8a8a6a', '#a8a47e'];
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = patches[Math.floor(random() * patches.length)]!;
      ctx.beginPath();
      const x = random() * w;
      const y = random() * h;
      const rx = 4 + random() * 14;
      const ry = 6 + random() * 22;
      ctx.ellipse(x, y, rx, ry, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      // Wrapped round: the patch carries on across the seam.
      ctx.beginPath();
      ctx.ellipse(x > w / 2 ? x - w : x + w, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#4a3e32';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3 + random() * 5) {
      ctx.fillStyle = random() < 0.5 ? 'rgba(30, 24, 18, 0.55)' : 'rgba(110, 96, 80, 0.35)';
      let y = 0;
      while (y < h) {
        const run = 10 + random() * 40;
        ctx.fillRect(x + (random() - 0.5) * 2, y, 1 + random() * 2, run);
        y += run + random() * 8;
      }
    }
  }
  const texture = canvasTexture(canvas, { anisotropy: 'facing', repeat: true });
  texture.repeat.set(1, 2);
  return texture;
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
  return toTexture(canvas, 'facing');
}
