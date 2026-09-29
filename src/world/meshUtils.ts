import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { QUALITY } from '@/graphics/quality';
import { invisible } from './materials/palette';
import { markShared } from './materials/sharedResources';

export interface MeshPosition {
  x?: number;
  y?: number;
  z?: number;
}

/** Edge radius of a bevelled box: a few millimetres, never more than this share of its thinnest side. */
const BEVEL_RADIUS = 0.005;
const BEVEL_SHARE = 0.18;
/** Thinner than this, or longer than that, a box stays sharp (a sheet, a wire, a wall-sized slab). */
const BEVEL_MIN_SIDE = 0.012;
const BEVEL_MAX_SIDE = 3;
/**
 * Corner segments of a bevelled box: two make a round (300 triangles a box, drawn again in every
 * shadow pass), one a chamfer (108): the round on high only, where the GPU has the headroom.
 */
const BEVEL_SEGMENTS = QUALITY.level === 'high' ? 2 : 1;
/**
 * A cylinder's rim fillet (m), the steps round it, and the thinnest cylinder (radius or half height)
 * that gets one. On high only: the lathe has three and a half times a plain cylinder's triangles
 * (Firefox, which gets medium, is where the frame is tightest).
 */
const FILLETS = QUALITY.level === 'high';
const FILLET_RADIUS = 0.0025;
const FILLET_STEPS = 3;
const FILLET_MIN_SIDE = 0.006;

/**
 * The geometries `boxMesh`, `cylinderMesh` and `invisibleHitbox` hand out, one per size for the
 * page: two boards cut alike share one buffer. They are marked shared (no zone's unload frees
 * them), so **never transform or edit a mesh's geometry in place** (`translate`, `rotateX`,
 * attributes): move the mesh, or `clone()` the geometry first.
 */
const geometries = new Map<string, THREE.BufferGeometry>();

function cachedGeometry(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = markShared(make());
    geometries.set(key, geometry);
  }
  return geometry;
}

/**
 * A shadow-casting (unless smaller than `QUALITY.minShadowCaster`), shadow-receiving box at `position` (its centre). With `QUALITY.bevels` its
 * edges are rounded by a few millimetres so they catch a highlight, as real joinery does; the
 * face groups (one material per face) survive the rounding. Its geometry is shared (see above).
 */
export function boxMesh(width: number, height: number, depth: number, material: THREE.Material, position: MeshPosition = {}): THREE.Mesh {
  return shadowed(new THREE.Mesh(boxGeometry(width, height, depth, material), material), position, Math.max(width, height, depth));
}

function boxGeometry(width: number, height: number, depth: number, material: THREE.Material): THREE.BufferGeometry {
  const thinnest = Math.min(width, height, depth);
  const drawn = material.visible && material.colorWrite;
  if (!QUALITY.bevels || !drawn || thinnest < BEVEL_MIN_SIDE || Math.max(width, height, depth) > BEVEL_MAX_SIDE) {
    return cachedGeometry(`box|${width}|${height}|${depth}`, () => new THREE.BoxGeometry(width, height, depth));
  }
  const radius = Math.min(BEVEL_RADIUS, thinnest * BEVEL_SHARE);
  return cachedGeometry(`rounded|${width}|${height}|${depth}|${radius}|${BEVEL_SEGMENTS}`, () => new RoundedBoxGeometry(width, height, depth, BEVEL_SEGMENTS, radius));
}

/** A shadow-casting (unless smaller than `QUALITY.minShadowCaster`), shadow-receiving upright cylinder at `position` (its centre). `radiusBottom` defaults to `radiusTop`. */
export function cylinderMesh(
  radiusTop: number,
  height: number,
  material: THREE.Material,
  position: MeshPosition = {},
  { radiusBottom = radiusTop, segments = 20 }: { radiusBottom?: number; segments?: number } = {},
): THREE.Mesh {
  return shadowed(new THREE.Mesh(cylinderGeometry(radiusTop, radiusBottom, height, segments, material), material), position, Math.max(height, 2 * radiusTop, 2 * radiusBottom));
}

/**
 * With `QUALITY.bevels` on high, a cylinder's rims are filleted by a couple of millimetres (a lathe of the
 * rounded profile), so a can, a knob or a lamp base catches a highlight on its edge instead of
 * ending razor sharp. Left sharp: a hidden or textured one (the lathe's uvs differ from the
 * cylinder's), a point or a wire, anything wall-sized.
 */
function cylinderGeometry(radiusTop: number, radiusBottom: number, height: number, segments: number, material: THREE.Material): THREE.BufferGeometry {
  const drawn = material.visible && material.colorWrite;
  const mapped = !!(material as Partial<THREE.MeshStandardMaterial>).map;
  const thinnest = Math.min(radiusTop, radiusBottom, height / 2);
  if (!QUALITY.bevels || !FILLETS || !drawn || mapped || thinnest < FILLET_MIN_SIDE || Math.max(height, 2 * radiusTop, 2 * radiusBottom) > BEVEL_MAX_SIDE) {
    return cachedGeometry(`cylinder|${radiusTop}|${radiusBottom}|${height}|${segments}`, () => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments));
  }
  const fillet = Math.min(FILLET_RADIUS, thinnest * BEVEL_SHARE);
  return cachedGeometry(`filleted|${radiusTop}|${radiusBottom}|${height}|${segments}|${fillet}`, () => filletedCylinder(radiusTop, radiusBottom, height, segments, fillet));
}

/** The lathe: from the bottom's centre out to the rim, round the fillet, up the side, round and in to the top's centre. */
function filletedCylinder(radiusTop: number, radiusBottom: number, height: number, segments: number, fillet: number): THREE.BufferGeometry {
  const half = height / 2;
  const points: THREE.Vector2[] = [new THREE.Vector2(0, -half)];
  const arc = (cx: number, cy: number, from: number, to: number): void => {
    for (let i = 0; i <= FILLET_STEPS; i++) {
      const a = from + ((to - from) * i) / FILLET_STEPS;
      points.push(new THREE.Vector2(cx + fillet * Math.cos(a), cy + fillet * Math.sin(a)));
    }
  };
  arc(radiusBottom - fillet, -half + fillet, -Math.PI / 2, 0);
  arc(radiusTop - fillet, half - fillet, 0, Math.PI / 2);
  points.push(new THREE.Vector2(0, half));
  return new THREE.LatheGeometry(points, segments);
}

/**
 * An invisible box the crosshair ray can hit: the click target of an `Interactable` when its
 * visible parts are too thin or too many to test one by one. Draws nothing, casts no shadow.
 */
export function invisibleHitbox(width: number, height: number, depth: number, position: MeshPosition = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(
    cachedGeometry(`box|${width}|${height}|${depth}`, () => new THREE.BoxGeometry(width, height, depth)),
    invisible(),
  );
  mesh.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  mesh.castShadow = false;
  return mesh;
}

const INTO = new THREE.Vector3(0, 0, -1);
/** The `facing` of a seat: whoever sits looks out along its local +z. */
export const FACING_OUT: Readonly<THREE.Vector3> = new THREE.Vector3(0, 0, 1);

/**
 * Where the camera goes for someone at `object`'s local `eye`, looking along its local `facing`
 * (default -z: into a machine from its front; a seat looks out, `FACING_OUT`): the world eye
 * position and the yaw. A camera looks down -z, so yaw θ faces (-sin θ, 0, -cos θ).
 */
export function eyePoseAt(object: THREE.Object3D, eye: Readonly<THREE.Vector3>, facing: Readonly<THREE.Vector3> = INTO): { position: THREE.Vector3; yaw: number } {
  const position = object.localToWorld(eye.clone());
  const forward = facing.clone().applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));
  return { position, yaw: Math.atan2(-forward.x, -forward.z) };
}

/**
 * Every caster is a draw call in every shadow pass (six for a lamp): a knob, a cup, a hinge would
 * cost that for a shadow smaller than a texel of the map. A class that wants one anyway sets
 * `castShadow` itself afterwards.
 */
function shadowed(mesh: THREE.Mesh, position: MeshPosition, largestSide: number): THREE.Mesh {
  mesh.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  mesh.castShadow = largestSide >= QUALITY.minShadowCaster;
  mesh.receiveShadow = true;
  return mesh;
}
