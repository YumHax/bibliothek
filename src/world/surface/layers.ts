import * as THREE from 'three';
import { isShared, markShared } from '../materials/sharedResources';

/**
 * Everything flat that lies on, or hangs against, another surface: one table, so two things never
 * pick the same height by chance and z-fight. A new rug, decal, sticker, puddle or glow takes its
 * layer from here (`FLOOR`, `GROUND`, `WALL`, `FACADE`) and `onSurface()` sets its material; never a
 * hand-picked "2 mm proud" of its own (`scripts/check-conventions.mjs` counts those).
 *
 * Two mechanisms, both driven by the table:
 * - `rank`: the layer's place in its stack, turned into a `polygonOffset` of `-UNITS_PER_RANK * rank`
 *   units (and a slope factor of -1). Units are steps of the depth buffer itself, so they grow with
 *   distance exactly as its precision falls: two layers one rank apart stay `UNITS_PER_RANK` depth
 *   steps apart at 2 m and at 140 m alike. This is what keeps layers off each other; ranks are
 *   integers, one stack's ranks follow its lifts.
 * - `lift`: the real gap in metres between the surface and the layer's face, so the layer stands
 *   clear of the surface's own bumps and is seen over it from the side. A lift alone holds only where a
 *   depth step is far smaller than it (`depthStep`: 0.24 mm at 20 m, 2 mm at 60 m, 13 mm at 150 m).
 *
 * Inside one mesh (a merged builder: `TriBuilder`, `QuadBuilder`, `TexQuads`) there is no polygon
 * offset between faces: two faces a sliver apart need a real gap of at least `gapAt(distance)` for the
 * farthest the player sees them from.
 */
export interface SurfaceLayer {
  /** Metres between the surface under it and the layer's visible face. */
  readonly lift: number;
  /** Its order in the stack (an integer): 1 lies straight on the surface, higher ranks lie over lower ones. */
  readonly rank: number;
}

/** Polygon-offset units per rank: depth steps between two neighbouring layers, at any distance. */
export const UNITS_PER_RANK = 4;

/** The main camera's near plane (`core/Engine`): depth precision is set by it. */
const NEAR = 0.1;
/** Steps a gap must span to hold (rounding in the rasteriser and the depth interpolation take the rest). */
const STEPS_TO_HOLD = 4;

/** One step of the 24-bit depth buffer at `distance` metres from the eye, in metres. */
export function depthStep(distance: number): number {
  return (distance * distance) / (NEAR * 2 ** 24);
}

/**
 * The smallest real gap (metres) between two parallel faces of one mesh seen from as far as
 * `distance`: a sill in front of its wall, a dormer's glass in its frame, a mosaic over its border.
 * 1 mm at 20 m, 9 mm at 60 m, 4.7 cm at 140 m (the far end of Front Street).
 */
export function gapAt(distance: number): number {
  return Math.max(0.001, STEPS_TO_HOLD * depthStep(distance));
}

/** The floor of a room (world y 0 at the floorboards' top). */
export const FLOOR = {
  /** The glossy floor's reflection plane. */
  gloss: { lift: 0.0015, rank: 1 },
  /** A rug's fringe, the loose warp ends lying past its edge. */
  fringe: { lift: 0.002, rank: 2 },
  /** Scuffs, heel marks and grime worn into a shop's floor (see-through, no depth write). */
  scuff: { lift: 0.003, rank: 3 },
  /** A painted border band round a carpet. */
  border: { lift: 0.004, rank: 4 },
  /** A blanket spread on the floor (a car-boot pitch at the market). */
  blanket: { lift: 0.004, rank: 5 },
  /** A lit pool on the floor under a cabinet or a lamp (additive, no depth write). */
  glowPool: { lift: 0.004, rank: 6 },
  /** A flat-woven rug (a kilim): its top. */
  kilim: { lift: 0.008, rank: 7 },
  /** The thin mat a door has just inside (under the corridor's runner where they meet). */
  threshold: { lift: 0.01, rank: 8 },
  /** A pile rug: its top. */
  rug: { lift: 0.012, rank: 9 },
  /** The soft blobs under furniture: clear of a rug, under anything's feet. */
  contactShadow: { lift: 0.015, rank: 10 },
  /** A doormat: its top (a thick coir mat). */
  mat: { lift: 0.018, rank: 11 },
  /** The placement grid and footprint shown while a piece of furniture is carried (over every rug and mat). */
  placement: { lift: 0.021, rank: 12 },
} as const satisfies Record<string, SurfaceLayer>;

/**
 * The street's ground (lifts over the asphalt or the pavement right under it). Seen out to 140 m:
 * what keeps these apart far off is their ranks, not their millimetres.
 */
export const GROUND = {
  /** Painted road markings; kerb tops, gutters, tactile paving and park paths laid into the ground. */
  marking: { lift: 0.004, rank: 1 },
  /** A patched repair in the road: newer asphalt over whatever lines were there; a flower bed's soil, the playground's rubber over the park's paths; a door's stone sill over the kerb. */
  patch: { lift: 0.0045, rank: 2 },
  /** Manhole covers and drain grates (over a gutter, a patch, the bus stop's box). */
  grate: { lift: 0.005, rank: 3 },
  /** Standing water. */
  puddle: { lift: 0.006, rank: 4 },
  /** The soft dark under a car, parked or driving (no sky reaches under it). */
  carShade: { lift: 0.0065, rank: 5 },
  /** Wet streaks of light reflected down the road. */
  streak: { lift: 0.007, rank: 6 },
  /** The wet road's reflection plane. */
  mirror: { lift: 0.008, rank: 7 },
  /** Fallen leaves, over the wet road (each leaf lies between this and `leafTop`, all drawn at this rank). */
  leaf: { lift: 0.009, rank: 8 },
  /** Fallen leaves, highest: where the leaves' band ends. */
  leafTop: { lift: 0.011, rank: 9 },
  /** The pool of light under a street lamp. */
  lampPool: { lift: 0.012, rank: 10 },
  /** The glow a lit shop window throws on the pavement. */
  shopGlow: { lift: 0.014, rank: 11 },
} as const satisfies Record<string, SurfaceLayer>;

/** Things pinned to a wall, a door or a board (lift out of that surface along its normal). */
export const WALL = {
  /** Paper pasted flat: a poster's print, a label. */
  paper: { lift: 0.0005, rank: 1 },
  /** A frame's picture, a tag stuck on a box. */
  print: { lift: 0.0006, rank: 2 },
  /** A poster in a frame of its own, a small screen set in a face (between `print` and `overlay`). */
  framed: { lift: 0.001, rank: 3 },
  /** A poster's lamination or a second sheet over the first. */
  overlay: { lift: 0.0015, rank: 4 },
  /** A pinned notice, a board's card, a marquee or a screen on a cabinet: read from across a room. */
  notice: { lift: 0.002, rank: 5 },
  /** A signboard or plaque screwed on. */
  sign: { lift: 0.003, rank: 6 },
  /** A flyer taped on, a lens in its housing. */
  flyer: { lift: 0.004, rank: 7 },
  /** A window's pane over the wall it is set in (the outside seen through it: `props/Window`, the stairwell's, the outlooks'). Never on a flyer. */
  pane: { lift: 0.004, rank: 7 },
  /** Frost fading over a pane as its view comes or goes (the stairwell's, `StairWindows`), under the reflection. */
  paneFrost: { lift: 0.005, rank: 7.5 },
  /** The room given back by a window's glass (`materials/paneReflection`), over its pane. */
  paneReflection: { lift: 0.006, rank: 8 },
  /** A roof light's frosted pane, under the ceiling it is set in (lifts down, out of the ceiling). */
  rooflight: { lift: 0.01, rank: 9 },
  /** The placement grid and footprint shown on a wall (or the ceiling) while a picture or a hung plant is carried. */
  placement: { lift: 0.012, rank: 10 },
} as const satisfies Record<string, SurfaceLayer>;

/**
 * A street building's facade, and the glass in it (lifts out of the painted wall, or out of a pane,
 * along its normal). Seen from across the street and down it: separate meshes only, the ranks do the
 * work (in one merged mesh use `gapAt`).
 */
export const FACADE = {
  /** A shopfront's glass, the room behind it drawn in it (`street/relief/ShopInteriors`). */
  shopInterior: { lift: 0.015, rank: 1 },
  /** A pane of glass laid over the painted wall, or over the room drawn behind a shop window. */
  pane: { lift: 0.02, rank: 2 },
  /** Lettering on a pane: gilt or vinyl on a shop window, a door's number (over its `pane`). */
  lettering: { lift: 0.022, rank: 3 },
  /** A card, a sticker or a notice taped to a pane or a door (the OPEN card, opening hours, a lost cat). */
  card: { lift: 0.025, rank: 4 },
  /** Flat trim laid over a pane or the wall as a mesh of its own: glazing bars, a frame's face, a door's kick plate. */
  trim: { lift: 0.03, rank: 5 },
} as const satisfies Record<string, SurfaceLayer>;

/**
 * Makes `material` draw as `layer` over its surface: a polygon offset of `-UNITS_PER_RANK * rank` units (with a
 * slope factor of -1, so a grazing view keeps it on top too) and, for a see-through layer (a glow,
 * a puddle, a shadow), no depth write. Returns `material`, or a copy of it when it is a shared
 * palette material (which must not change for every other prop using it).
 */
export function onSurface<M extends THREE.Material>(given: M, layer: SurfaceLayer, { depthWrite = given.depthWrite }: { depthWrite?: boolean } = {}): M {
  const material = isShared(given) ? (sharedCopy(given, layer, depthWrite) as M) : given;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -UNITS_PER_RANK * layer.rank;
  material.depthWrite = depthWrite;
  return material;
}

/**
 * Makes an already built `mesh` (a printed panel, a screen, a card placed `layer.lift` off a face) draw
 * as `layer`: its material, or each of its materials, through `onSurface`. Returns `mesh`.
 */
export function layMesh<T extends THREE.Mesh>(mesh: T, layer: SurfaceLayer, options?: { depthWrite?: boolean }): T {
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => onSurface(m, layer, options)) : onSurface(mesh.material, layer, options);
  return mesh;
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
