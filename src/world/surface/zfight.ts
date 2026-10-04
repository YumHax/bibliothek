import * as THREE from 'three';
import { centroid, clipTriangle, planeAxes, polygonArea, pressed, sampleAt, visibleTo, type P2 } from './coplanar';
import { depthStep, UNITS_PER_RANK } from './layers';

/**
 * Dev-time z-fighting finder (`?debug` / `?stats`: `bibliothek.zfight()` in the console, and a
 * `[zfight]` line each time a zone is built). Walks a subtree's drawn meshes, puts every triangle
 * in world space, and reports pairs that face the same way in (nearly) the same plane and overlap:
 * what flickers in play. Pairs from different meshes or materials, and pairs inside one mesh and
 * material whose vertex colours or uvs differ where they overlap (the street's merged builders).
 *
 * A pair is settled when the two faces stay at least `MIN_STEPS` depth steps apart at `viewDistance`,
 * counting both what parts them: the real gap (in steps of the 24-bit depth buffer there, `depthStep`)
 * and the difference of their polygon offsets' units (steps at any distance: `surface/layers` ranks),
 * signed, so an offset pulling the farther face forward counts against the gap. Each pair says how far
 * it holds (`holdsToM`: 0 when it never does).
 *
 * A pair is judged no farther than its overlap still shows `MIN_PIXELS` wide (on a 1440-pixel frame): a 2 cm
 * trim fights past 60 m only as a sub-pixel shimmer (`coplanar.visibleTo`).
 *
 * Not reported: two plain materials that look alike (same colour, no texture: whichever wins, the
 * pixel is the same), two that both skip the depth write (they blend), a mesh flagged
 * `userData.zfightIgnore` (shells the shader pushes out), and the back of a double-sided material
 * flagged `userData.zfightFrontOnly` (a room's walls: nobody stands behind them).
 */
interface ZFightPair {
  a: string;
  b: string;
  /** Distance between the two planes (mm). */
  gapMm: number;
  /** Overlapping area (cm²). */
  areaCm2: number;
  /** Out to how many metres the pair still holds (0: fights even up close). */
  holdsToM: number;
  /** Where the overlap is, in world space. */
  at: string;
}

export interface ZFightOptions {
  /** Distance the pairs are judged at (m): the farther, the wider the gap that still fights. Default 10. */
  viewDistance?: number;
  /** Smallest overlap worth reporting (m²). Default 1 cm². */
  minArea?: number;
  /** Stop after this many triangles (a whole street is millions). Default 3 million. */
  maxTriangles?: number;
}

interface Owner {
  object: THREE.Object3D;
  color: THREE.BufferAttribute | null;
  uv: THREE.BufferAttribute | null;
}

interface Tri {
  /** Index of the mesh in `owners`, and the material this triangle is drawn with. */
  owner: number;
  material: THREE.Material;
  /** Its corners' indices in the geometry's attributes. */
  corners: [number, number, number];
  /** World centre. */
  centre: THREE.Vector3;
  /** The bucket's normal and the plane's axes `p` is laid on. */
  axis: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  /** Plane distance along the bucket's normal. */
  d: number;
  /** 2D projection on the plane (u, v per vertex) and its bounds. */
  p: [P2, P2, P2];
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

/** Depth steps two overlapping faces must stay apart (rounding in the rasteriser and the interpolation take the rest). */
const MIN_STEPS = 2;
/** A face this close in front of another solid's, facing it, is in contact: the gap cannot be seen into (a chiller's back on the wall). */
const CONTACT = 0.003;
/** Two values of a vertex colour or uv closer than this show the same. */
const SAME = 0.02;
/** The camera's near plane (as `depthStep` takes it). */
const NEAR = 0.1;

/**
 * Subtrees that are not under any zone's group (a window's own street scene, `world/outlook`), checked
 * with the zones: `registerZfightRoot` adds one under a name, the returned function removes it.
 */
const extraRoots = new Map<string, { root: THREE.Object3D; viewDistance: number }>();

export function registerZfightRoot(name: string, root: THREE.Object3D, viewDistance: number): () => void {
  extraRoots.set(name, { root, viewDistance });
  return () => {
    if (extraRoots.get(name)?.root === root) extraRoots.delete(name);
  };
}

/** The registered subtrees, by name (`registerZfightRoot`). */
export function zfightRoots(): ReadonlyMap<string, { root: THREE.Object3D; viewDistance: number }> {
  return extraRoots;
}

export function findZFighting(root: THREE.Object3D, options: ZFightOptions = {}): ZFightPair[] {
  const { viewDistance = 10, minArea = 1e-4, maxTriangles = 3_000_000 } = options;
  root.updateWorldMatrix(true, true);
  const faces = new FaceCollector(viewDistance, maxTriangles).collect(root);
  const found = new PairJudge(faces, root, viewDistance, minArea).judge();
  const pairs = [...found.values()].sort((x, y) => y.areaCm2 - x.areaCm2);
  for (const pair of pairs) {
    pair.gapMm = Number(pair.gapMm.toFixed(3));
    pair.areaCm2 = Number(pair.areaCm2.toFixed(1));
  }
  if (faces.triangles > maxTriangles) console.warn(`[zfight] stopped after ${maxTriangles} triangles`);
  return pairs;
}

/** Every drawn face of a tree, filed under its plane (rounded normal and depth bin), and the meshes they came from. */
interface Faces {
  owners: Owner[];
  buckets: Map<string, Tri[]>;
  triangles: number;
  /**
   * Candidates: planes closer than this (buckets this wide and their neighbours). Past it the gap holds unless an
   * offset more than two ranks deep pulls the farther face through the nearer one, which is not looked for.
   */
  tolerance: number;
  /** One depth step at the view distance. */
  step: number;
}

/**
 * Walks a tree and files each drawn triangle under the plane it lies in: what the camera draws (meshes on layer 0,
 * not skinned, not ignored), every instance of an instanced mesh, each material group's triangles under its own material.
 */
class FaceCollector {
  private readonly faces: Faces;
  private readonly va = new THREE.Vector3();
  private readonly vb = new THREE.Vector3();
  private readonly vc = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly e1 = new THREE.Vector3();
  private readonly e2 = new THREE.Vector3();
  private readonly instance = new THREE.Matrix4();
  private readonly world = new THREE.Matrix4();

  constructor(
    viewDistance: number,
    private readonly maxTriangles: number,
  ) {
    const step = depthStep(viewDistance);
    this.faces = { owners: [], buckets: new Map(), triangles: 0, tolerance: Math.max(2e-5, (MIN_STEPS + 2 * UNITS_PER_RANK) * step), step };
  }

  collect(root: THREE.Object3D): Faces {
    root.traverseVisible((obj) => {
      if (this.faces.triangles > this.maxTriangles) return;
      const mesh = obj as THREE.Mesh;
      // Not what the camera never draws (a shadow-only proxy, off layer 0).
      if (!mesh.isMesh || (obj as THREE.SkinnedMesh).isSkinnedMesh || obj.userData.zfightIgnore || !obj.layers.isEnabled(0)) return;
      this.collectMesh(mesh);
    });
    return this.faces;
  }

  /** The mesh's triangles, every instance of it, each material group judged by its own material. */
  private collectMesh(mesh: THREE.Mesh): void {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!position) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const owner =
      this.faces.owners.push({
        object: mesh,
        color: (geometry.getAttribute('color') as THREE.BufferAttribute | undefined) ?? null,
        uv: (geometry.getAttribute('uv') as THREE.BufferAttribute | undefined) ?? null,
      }) - 1;
    const index = geometry.index;
    const count = index ? index.count : position.count;
    const groups = geometry.groups.length > 0 && Array.isArray(mesh.material) ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
    const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    const copies = instanced ? instanced.count : 1;
    for (let k = 0; k < copies; k++) {
      if (instanced) {
        instanced.getMatrixAt(k, this.instance);
        this.world.multiplyMatrices(mesh.matrixWorld, this.instance);
      } else {
        this.world.copy(mesh.matrixWorld);
      }
      for (const group of groups) {
        const material = materials[group.materialIndex ?? 0];
        if (!material || !material.visible || !material.colorWrite || !material.depthTest) continue;
        // The inner side of a closed solid (a double-sided glass box) is only seen from inside it: judged outside only.
        const doubleSided = material.side === THREE.DoubleSide && !material.userData.zfightFrontOnly && !closedSolid(geometry);
        this.collectGroup(owner, material, position, index, group.start, Math.min(count, group.start + group.count), doubleSided);
      }
    }
  }

  /** One material group's triangles, `start` up to `end`, brought into world space through the instance under way. */
  private collectGroup(owner: number, material: THREE.Material, position: THREE.BufferAttribute, index: THREE.BufferAttribute | null, start: number, end: number, doubleSided: boolean): void {
    for (let i = start; i + 2 < end; i += 3) {
      const i0 = index ? index.getX(i) : i;
      const i1 = index ? index.getX(i + 1) : i + 1;
      const i2 = index ? index.getX(i + 2) : i + 2;
      this.va.fromBufferAttribute(position, i0).applyMatrix4(this.world);
      this.vb.fromBufferAttribute(position, i1).applyMatrix4(this.world);
      this.vc.fromBufferAttribute(position, i2).applyMatrix4(this.world);
      this.addTriangle(owner, material, [i0, i1, i2], doubleSided);
      this.faces.triangles++;
    }
  }

  /** The triangle in `va`, `vb`, `vc` filed under its plane (under both planes when double-sided); a sliver of no area is dropped. */
  private addTriangle(owner: number, material: THREE.Material, corners: [number, number, number], doubleSided: boolean): void {
    const { va: a, vb: b, vc: c, e1, e2, normal } = this;
    const { tolerance, buckets } = this.faces;
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    normal.crossVectors(e1, e2);
    const area = normal.length() / 2;
    if (area < 1e-7) return;
    normal.normalize();
    for (const sign of doubleSided ? [1, -1] : [1]) {
      const nx = round(normal.x * sign);
      const ny = round(normal.y * sign);
      const nz = round(normal.z * sign);
      const n = new THREE.Vector3(nx, ny, nz).normalize();
      const d = n.dot(a);
      const bin = Math.floor(d / tolerance);
      const [u, v] = planeAxes(n);
      const p = [a, b, c].map((q): P2 => [u.dot(q), v.dot(q)]) as [P2, P2, P2];
      const tri: Tri = {
        owner,
        material,
        corners,
        centre: a.clone().add(b).add(c).divideScalar(3),
        axis: n,
        u,
        v,
        d,
        p,
        minU: Math.min(p[0][0], p[1][0], p[2][0]),
        maxU: Math.max(p[0][0], p[1][0], p[2][0]),
        minV: Math.min(p[0][1], p[1][1], p[2][1]),
        maxV: Math.max(p[0][1], p[1][1], p[2][1]),
      };
      const key = `${nx},${ny},${nz}|${bin}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(tri);
    }
  }
}

/**
 * Judges the collected faces pair by pair, within a bucket and against the next bucket along: two faces that overlap
 * within two depth steps of one plane, as far as the overlap is still seen, and show as two, are a fighting pair.
 */
class PairJudge {
  private readonly found = new Map<string, ZFightPair>();
  private readonly middle = new THREE.Vector3();

  constructor(
    private readonly faces: Faces,
    private readonly root: THREE.Object3D,
    private readonly viewDistance: number,
    private readonly minArea: number,
  ) {}

  judge(): Map<string, ZFightPair> {
    const { buckets } = this.faces;
    for (const [key, list] of buckets) {
      this.sweep(list, null);
      const [n, bin] = key.split('|') as [string, string];
      const next = buckets.get(`${n}|${Number(bin) + 1}`);
      if (next) this.sweep(list, next);
    }
    return this.found;
  }

  /** Sweep and prune along u: only triangles whose u ranges overlap are tested (a merged facade has thousands in one plane). */
  private sweep(list: Tri[], other: Tri[] | null): void {
    const items = other ? [...list.map((t) => ({ t, side: 0 })), ...other.map((t) => ({ t, side: 1 }))] : list.map((t) => ({ t, side: 0 }));
    items.sort((x, y) => x.t.minU - y.t.minU);
    let active: typeof items = [];
    for (const item of items) {
      active = active.filter((a) => a.t.maxU > item.t.minU);
      for (const a of active) if (!other || a.side !== item.side) this.test(a.t, item.t);
      active.push(item);
    }
  }

  /** Whether `s` and `t` fight; a pair is recorded once per two meshes and materials, its overlap summed. */
  private test(s: Tri, t: Tri): void {
    const { owners, buckets, tolerance, step } = this.faces;
    if (s.maxV <= t.minV || t.maxV <= s.minV) return;
    // How far `s` stands in front of `t`, in depth steps at `viewDistance`: its gap along the shared normal, plus
    // how much more its polygon offset pulls it forward (more negative units: nearer).
    const lead = (s.d - t.d) / step + (units(t.material) - units(s.material));
    if (Math.abs(lead) >= MIN_STEPS) return;
    const polygon = clipTriangle(s.p, t.p);
    const overlap = polygonArea(polygon);
    if (overlap < this.minArea) return;
    // Judged only as far as the overlap still shows `MIN_PIXELS` across (a trim's sliver past 60 m is under a pixel).
    const seen = Math.min(this.viewDistance, visibleTo(polygon, overlap));
    if (Math.abs((s.d - t.d) / depthStep(seen) + (units(t.material) - units(s.material))) >= MIN_STEPS) return;
    if (bothBlend(s.material, t.material)) return;
    const one = s.owner === t.owner && s.material === t.material;
    if (one && !this.differ(s, t, centroid(polygon))) return;
    if (!one && lookAlike(s.material, t.material) && !owners[s.owner]!.color && !owners[t.owner]!.color) return;
    // Both pressed on another solid's face (a box's bottom on the shelf, a frame's back on the wall): neither is seen.
    const [qu, qv] = centroid(polygon);
    if (pressed(buckets, tolerance, this.middle.copy(s.axis).multiplyScalar(s.d).addScaledVector(s.u, qu).addScaledVector(s.v, qv), s.axis, [s, t], CONTACT)) return;
    const key = `${Math.min(s.owner, t.owner)}|${Math.max(s.owner, t.owner)}|${s.material.id}|${t.material.id}`;
    const previous = this.found.get(key);
    const areaCm2 = overlap * 1e4;
    if (previous) {
      previous.areaCm2 += areaCm2;
      return;
    }
    const gap = s.d - t.d;
    const c = s.centre;
    this.found.set(key, {
      a: pathOf(owners[s.owner]!.object, this.root),
      b: pathOf(owners[t.owner]!.object, this.root),
      gapMm: Math.abs(gap) * 1000,
      areaCm2,
      holdsToM: holdsTo(gap, units(t.material) - units(s.material)),
      at: `${c.x.toFixed(2)}, ${c.y.toFixed(3)}, ${c.z.toFixed(2)}`,
    });
  }

  /** Inside one mesh and material: only where the two show something different (a colour, a bit of texture). */
  private differ(s: Tri, t: Tri, q: P2): boolean {
    const { color, uv } = this.faces.owners[s.owner]!;
    // Only what the material reads: vertex colours it is told to use, uvs it samples a map with.
    for (const attribute of [readsColors(s.material) ? color : null, readsUvs(s.material) ? uv : null]) {
      if (!attribute) continue;
      for (let k = 0; k < attribute.itemSize; k++) {
        if (Math.abs(sampleAt(attribute, s.corners, s.p, q, k) - sampleAt(attribute, t.corners, t.p, q, k)) > SAME) return true;
      }
    }
    return false;
  }
}

/** Whether `m` takes its vertex colours (a shader of its own may: assumed so). */
function readsColors(m: THREE.Material): boolean {
  return m.vertexColors || (m as THREE.ShaderMaterial).isShaderMaterial === true;
}

/** Whether `m` samples anything with its uvs (a shader of its own may: assumed so). */
function readsUvs(m: THREE.Material): boolean {
  if ((m as THREE.ShaderMaterial).isShaderMaterial) return true;
  const maps = m as THREE.MeshStandardMaterial & Partial<THREE.MeshPhysicalMaterial>;
  return !!(maps.map || maps.alphaMap || maps.bumpMap || maps.normalMap || maps.roughnessMap || maps.metalnessMap || maps.aoMap || maps.emissiveMap || maps.lightMap || maps.displacementMap);
}

/** A geometry that encloses its volume (three's boxes, spheres, capsules, closed cylinders): its faces' backs are inside it. */
function closedSolid(geometry: THREE.BufferGeometry): boolean {
  switch (geometry.type) {
    case 'BoxGeometry':
    case 'SphereGeometry':
    case 'CapsuleGeometry':
    case 'DodecahedronGeometry':
    case 'IcosahedronGeometry':
    case 'OctahedronGeometry':
      return true;
    case 'CylinderGeometry':
      return !(geometry as THREE.CylinderGeometry).parameters.openEnded;
    case 'LatheGeometry': {
      // A full turn of a profile that starts and ends on the axis (a dish, a vase).
      const { points, phiLength } = (geometry as THREE.LatheGeometry).parameters;
      const first = points[0];
      const last = points[points.length - 1];
      return phiLength >= Math.PI * 2 - 1e-6 && !!first && !!last && first.x === 0 && last.x === 0;
    }
    default:
      return false;
  }
}

/** Neither writes depth: they blend in draw order, nothing to fight over. */
function bothBlend(a: THREE.Material, b: THREE.Material): boolean {
  return !a.depthWrite && !b.depthWrite;
}

/** Plain materials of one colour, untextured and opaque: whichever wins, the pixel is the same. */
function lookAlike(a: THREE.Material, b: THREE.Material): boolean {
  if (a.type !== b.type || a.transparent || b.transparent) return false;
  const ma = a as THREE.MeshStandardMaterial;
  const mb = b as THREE.MeshStandardMaterial;
  if (ma.map || mb.map || ma.alphaMap || mb.alphaMap || !ma.color || !mb.color) return false;
  if (!ma.color.equals(mb.color) || ma.roughness !== mb.roughness || ma.metalness !== mb.metalness) return false;
  return !ma.emissive || !mb.emissive || ma.emissive.equals(mb.emissive);
}

/** A material's polygon offset in units (depth steps; the slope factor is the same -1 for every layer, it cancels). */
function units(m: THREE.Material): number {
  return m.polygonOffset ? m.polygonOffsetUnits : 0;
}

/**
 * Out to where a pair `gap` metres apart (signed: + when the first is in front) and `leadUnits` apart in
 * offsets (+ when they pull the first forward) stays `MIN_STEPS` apart: 0 when never, Infinity when always.
 */
function holdsTo(gap: number, leadUnits: number): number {
  // Lead = gap / step(z) + leadUnits, either sign: |lead| >= MIN_STEPS.
  const sign = gap === 0 ? Math.sign(leadUnits) || 1 : Math.sign(gap);
  const offset = sign * leadUnits;
  if (offset >= MIN_STEPS) return Infinity;
  const need = MIN_STEPS - offset;
  if (Math.abs(gap) === 0) return 0;
  // |gap| / step(z) >= need, step(z) = z² / (near · 2²⁴).
  return Number(Math.sqrt((Math.abs(gap) * NEAR * 2 ** 24) / need).toFixed(1));
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}

/** A readable path from `root` down to `obj`: names where set, class names otherwise. */
function pathOf(obj: THREE.Object3D, root: THREE.Object3D): string {
  const parts: string[] = [];
  for (let o: THREE.Object3D | null = obj; o && o !== root; o = o.parent) {
    if (o.name) parts.push(o.name);
    else if (o.constructor.name !== 'Mesh' && o.constructor.name !== 'Group' && o.constructor.name !== 'Object3D') parts.push(o.constructor.name);
  }
  const mesh = obj as THREE.Mesh;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const colour = (material as THREE.MeshStandardMaterial | undefined)?.color?.getHexString();
  return `${parts.reverse().join(' > ') || 'Mesh'}${colour ? ` #${colour}` : ''} (${mesh.geometry?.type ?? '?'})`;
}
