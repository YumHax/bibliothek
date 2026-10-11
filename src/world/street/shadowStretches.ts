import * as THREE from 'three';
import { isShared } from '../materials/sharedResources';

/** How long a stretch is along the street (x, metres): the sun's square (56 m) holds a handful, its near square two. */
const STRETCH = 12;
/** A caster with fewer triangles than this is drawn whole (sorting it would save nothing). */
const WORTH_IT = 2000;
/** Metres each stretch's box is grown by: what a vertex shader moves (an awning folding, a shutter swinging, the wind). */
const SLACK = 1;

/** One run of the index (a geometry group's, or the whole): where each stretch's triangles start and end, and its box. */
interface Run {
  start: number;
  starts: number[];
  ends: number[];
  boxes: THREE.Box3[];
}

const frustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();
const box = new THREE.Box3();

/**
 * The street's big shadow casters (the facades, their relief, windows, shutters, shopfronts, the park) are each one mesh
 * the length of the street, so the sun's map redraws every triangle of them at every refresh, and twice with its near
 * square. Each such mesh under `root` (castShadow, not instanced, skinned or shared, `WORTH_IT` triangles or more) gets
 * its triangles sorted along x into stretches of `STRETCH` metres (the index reordered; nothing moves), and in the
 * shadow pass only the run of stretches inside the shadow camera's frustum is drawn (`drawRange` set before, put back
 * after): the far square draws the stretches round the player, the near square one or two. The camera's pass is untouched.
 */
export function castByStretch(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.castShadow || (mesh as Partial<THREE.InstancedMesh>).isInstancedMesh || (mesh as Partial<THREE.SkinnedMesh>).isSkinnedMesh) return;
    const geometry = mesh.geometry;
    if (!geometry || isShared(geometry) || geometry.userData.stretches || geometry.morphAttributes.position) return;
    const runs = sortIntoStretches(geometry);
    if (!runs) return;
    geometry.userData.stretches = true;
    hookShadow(mesh, runs);
  });
}

/** Sorts `geometry`'s triangles into stretches along x (an index made for a geometry without one); null when not worth it. */
function sortIntoStretches(geometry: THREE.BufferGeometry): Run[] | null {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!position) return null;
  let index = geometry.getIndex();
  const total = index ? index.count : position.count;
  if (total / 3 < WORTH_IT) return null;
  if (!index) {
    const array = position.count > 65535 ? new Uint32Array(position.count) : new Uint16Array(position.count);
    for (let i = 0; i < array.length; i++) array[i] = i;
    geometry.setIndex(new THREE.BufferAttribute(array, 1));
    index = geometry.getIndex()!;
  }
  const array = index.array as Uint16Array | Uint32Array;
  const spans = geometry.groups.length ? geometry.groups.map((g) => ({ start: g.start, count: Math.min(g.count, total - g.start) })) : [{ start: 0, count: total }];
  const runs = spans.map(({ start, count }) => sortRun(array, position, start - (start % 3), count - (count % 3)));
  index.needsUpdate = true;
  return runs;
}

/** Sorts the triangles of `array[start .. start + count)` by stretch, in place; their stretches' ranges and boxes. */
function sortRun(array: Uint16Array | Uint32Array, position: THREE.BufferAttribute, start: number, count: number): Run {
  const triangles = count / 3;
  const keys = new Int32Array(triangles);
  for (let t = 0; t < triangles; t++) {
    const i = start + t * 3;
    const x = (position.getX(array[i]!) + position.getX(array[i + 1]!) + position.getX(array[i + 2]!)) / 3;
    keys[t] = Math.floor(x / STRETCH);
  }
  const order = Array.from({ length: triangles }, (_, t) => t).sort((a, b) => keys[a]! - keys[b]! || a - b);
  const copy = array.slice(start, start + count);
  const run: Run = { start, starts: [], ends: [], boxes: [] };
  const v = new THREE.Vector3();
  let key = Number.NaN;
  order.forEach((t, n) => {
    const to = start + n * 3;
    for (let k = 0; k < 3; k++) array[to + k] = copy[t * 3 + k]!;
    if (keys[t] !== key) {
      key = keys[t]!;
      run.starts.push(to);
      run.ends.push(to);
      run.boxes.push(new THREE.Box3());
    }
    const last = run.boxes.length - 1;
    run.ends[last] = to + 3;
    for (let k = 0; k < 3; k++) run.boxes[last]!.expandByPoint(v.fromBufferAttribute(position, array[to + k]!));
  });
  for (const b of run.boxes) b.expandByScalar(SLACK);
  return run;
}

/** In the shadow pass, `mesh` draws only the run of its stretches the shadow camera sees; its range is put back after. */
function hookShadow(mesh: THREE.Mesh, runs: readonly Run[]): void {
  const before = mesh.onBeforeShadow;
  const after = mesh.onAfterShadow;
  const kept = { start: 0, count: Infinity };
  mesh.onBeforeShadow = function (renderer, object, camera, shadowCamera, geometry, depthMaterial, group) {
    before.call(this, renderer, object, camera, shadowCamera, geometry, depthMaterial, group);
    kept.start = geometry.drawRange.start;
    kept.count = geometry.drawRange.count;
    // three hands the geometry group drawn (typed as an Object3D group); none for a single material, which draws every
    // group at once: then only a geometry of one run may be narrowed, or the other groups' shadows would go.
    if (!group && runs.length > 1) return;
    const run = runs[group ? Math.max(0, geometry.groups.indexOf(group as unknown as THREE.GeometryGroup)) : 0];
    if (!run) return;
    viewProjection.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection);
    let first = -1;
    let last = -1;
    run.boxes.forEach((b, i) => {
      if (!frustum.intersectsBox(box.copy(b).applyMatrix4(mesh.matrixWorld))) return;
      if (first < 0) first = i;
      last = i;
    });
    if (first < 0) geometry.setDrawRange(run.start, 0);
    else geometry.setDrawRange(run.starts[first]!, run.ends[last]! - run.starts[first]!);
  };
  mesh.onAfterShadow = function (renderer, object, camera, shadowCamera, geometry, depthMaterial, group) {
    geometry.setDrawRange(kept.start, kept.count);
    after.call(this, renderer, object, camera, shadowCamera, geometry, depthMaterial, group);
  };
}
