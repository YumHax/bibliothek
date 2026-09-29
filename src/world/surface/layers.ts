import * as THREE from 'three';
import { isShared, markShared } from '../materials/sharedResources';

/**
 * Everything flat that lies on, or hangs against, another surface: one table, so two things never
 * pick the same height by chance and z-fight. A new rug, decal, sticker, puddle or glow takes its
 * layer from here (`FLOOR`, `GROUND`, `WALL`) and `onSurface()` sets its material; never a
 * hand-picked "2 mm proud" of its own.
 *
 * Two mechanisms, both driven by the table:
 * - `lift`: the real gap in metres between the surface and the layer's face. Holds everywhere a
 *   depth step is smaller than it: a step is about `z² / (near · 2²⁴)` metres at distance `z`, so
 *   with near 0.1 m, 0.1 mm at 12 m, 0.5 mm at 30 m, 2 mm at 60 m (see `core/Engine`).
 * - `rank`: the layer's place in its stack, turned into a `polygonOffset` of `-rank` units (and a
 *   small slope factor), which pulls it towards the camera in depth space, so it keeps winning
 *   where the lift alone is below a depth step (far away, at a grazing angle).
 *
 * Ranks only order layers of one stack; the lift is what separates them from the surface. Keep
 * the lifts increasing with the rank, and at least 1 mm apart where the layers overlap.
 */
export interface SurfaceLayer {
  /** Metres between the surface under it and the layer's visible face. */
  readonly lift: number;
  /** Its order in the stack: 1 lies straight on the surface, higher ranks lie over lower ones. */
  readonly rank: number;
}

/** The floor of a room (world y 0 at the floorboards' top). */
export const FLOOR = {
  /** The glossy floor's reflection plane. */
  gloss: { lift: 0.0015, rank: 1 },
  /** A rug's fringe, the loose warp ends lying past its edge. */
  fringe: { lift: 0.002, rank: 1.5 },
  /** A painted border band round a carpet. */
  border: { lift: 0.004, rank: 2 },
  /** A blanket spread on the floor (a car-boot pitch at the market). */
  blanket: { lift: 0.004, rank: 2.5 },
  /** A lit pool on the floor under a cabinet or a lamp (additive, no depth write). */
  glowPool: { lift: 0.004, rank: 3 },
  /** A flat-woven rug (a kilim): its top. */
  kilim: { lift: 0.008, rank: 4 },
  /** The thin mat a door has just inside (under the corridor's runner where they meet). */
  threshold: { lift: 0.01, rank: 4.5 },
  /** A pile rug: its top. */
  rug: { lift: 0.012, rank: 5 },
  /** The soft blobs under furniture: clear of a rug, under anything's feet. */
  contactShadow: { lift: 0.015, rank: 6 },
  /** A doormat: its top (a thick coir mat). */
  mat: { lift: 0.018, rank: 7 },
} as const satisfies Record<string, SurfaceLayer>;

/** The street's ground (lifts over the asphalt or the pavement right under it). */
export const GROUND = {
  /** Painted road markings. */
  marking: { lift: 0.004, rank: 1 },
  /** Manhole covers and drain grates. */
  grate: { lift: 0.005, rank: 2 },
  /** Standing water. */
  puddle: { lift: 0.006, rank: 3 },
  /** Fallen leaves, lowest (each leaf lies between this and `leafTop`). */
  leaf: { lift: 0.007, rank: 4 },
  /** Wet streaks of light reflected down the road. */
  streak: { lift: 0.008, rank: 5 },
  /** The wet road's reflection plane. */
  mirror: { lift: 0.009, rank: 6 },
  /** Fallen leaves, highest. */
  leafTop: { lift: 0.011, rank: 7 },
  /** The pool of light under a street lamp. */
  lampPool: { lift: 0.012, rank: 8 },
  /** The glow a lit shop window throws on the pavement. */
  shopGlow: { lift: 0.014, rank: 9 },
} as const satisfies Record<string, SurfaceLayer>;

/** Things pinned to a wall, a door or a board (lift out of that surface along its normal). */
export const WALL = {
  /** Paper pasted flat: a poster's print, a label. */
  paper: { lift: 0.0005, rank: 1 },
  /** A frame's picture, a tag stuck on a box. */
  print: { lift: 0.0006, rank: 2 },
  /** A poster in a frame of its own, a small screen set in a face (between `print` and `overlay`). */
  framed: { lift: 0.001, rank: 2.5 },
  /** A poster's lamination or a second sheet over the first. */
  overlay: { lift: 0.0015, rank: 3 },
  /** A pinned notice, a board's card: read from across a room. */
  notice: { lift: 0.002, rank: 4 },
  /** A signboard or plaque screwed on. */
  sign: { lift: 0.003, rank: 5 },
  /** A flyer taped on, a lens in its housing. */
  flyer: { lift: 0.004, rank: 6 },
  /** A roof light's frosted pane, under the ceiling it is set in (lifts down, out of the ceiling). */
  rooflight: { lift: 0.01, rank: 7 },
} as const satisfies Record<string, SurfaceLayer>;

/** A street building's painted facade (lifts out of the painted wall along its normal). */
export const FACADE = {
  /** A shopfront's glass, the room behind it drawn in it (`street/relief/ShopInteriors`). */
  shopInterior: { lift: 0.015, rank: 2 },
} as const satisfies Record<string, SurfaceLayer>;

/**
 * Makes `material` draw as `layer` over its surface: a polygon offset of `-rank` units (with a
 * slope factor of -1, so a grazing view keeps it on top too) and, for a see-through layer (a glow,
 * a puddle, a shadow), no depth write. Returns `material`, or a copy of it when it is a shared
 * palette material (which must not change for every other prop using it).
 */
export function onSurface<M extends THREE.Material>(given: M, layer: SurfaceLayer, { depthWrite = given.depthWrite }: { depthWrite?: boolean } = {}): M {
  const material = isShared(given) ? (sharedCopy(given, layer, depthWrite) as M) : given;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -layer.rank;
  material.depthWrite = depthWrite;
  return material;
}

/** The layered copies of shared materials, one per (material, layer, depth write): shared in turn. */
const copies = new WeakMap<THREE.Material, Map<string, THREE.Material>>();

/**
 * The copy of a shared `given` that draws as `layer`: made once and shared like its source (it
 * holds the source's textures, which no zone may free). `clone()` drops a shader patch
 * (`patchShader`), so the copy takes the source's.
 */
function sharedCopy(given: THREE.Material, layer: SurfaceLayer, depthWrite: boolean): THREE.Material {
  let byLayer = copies.get(given);
  if (!byLayer) copies.set(given, (byLayer = new Map()));
  const key = `${layer.rank}|${depthWrite}`;
  let copy = byLayer.get(key);
  if (!copy) {
    copy = given.clone();
    copy.onBeforeCompile = given.onBeforeCompile;
    copy.customProgramCacheKey = given.customProgramCacheKey;
    byLayer.set(key, markShared(copy));
  }
  return copy;
}

/**
 * A flat `width` x `height` quad for `layer`, lying on a floor (`facing: 'up'`, its height along
 * -z) or standing against a wall and facing +z (`'out'`), already lifted off the surface at the
 * local origin. The material is set up by `onSurface`.
 */
export function decal(width: number, height: number, material: THREE.Material, layer: SurfaceLayer, facing: 'up' | 'out' = 'out'): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), onSurface(material, layer));
  if (facing === 'up') {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = layer.lift;
  } else {
    mesh.position.z = layer.lift;
  }
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Draw order bands (three sorts transparent objects by these first, then by distance). Opaque
 * geometry is `opaque`; everything transparent picks a band here, never a bare number.
 */
export const RENDER_ORDER = {
  /** Contact shadows: under whatever stands in them. */
  contactShadow: -1,
  opaque: 0,
  /** Flat transparent layers on the ground, and glass panes. */
  groundGlow: 1,
  glass: 1,
  /** Transparent layers over those: wet streaks, reflections, light shafts, steam, street glass. */
  sheen: 2,
  /** Particles: rain, snow, spray, falling leaves, sparks. */
  particles: 3,
  /** Labels floating over a surface (a price scan label). */
  label: 9,
  /** Drawn last: speech bubbles, the projector's cone, the balcony's surround, the street's sky dome (opaque, depth-tested on the far plane). */
  overlay: 10,
} as const;
