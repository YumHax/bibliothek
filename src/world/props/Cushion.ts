import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Prop } from './Prop';
import { fabric as fabricMaterial } from '@/world/materials/finishes';

export interface CushionOptions {
  width?: number;
  depth?: number;
  /** Puffed thickness at the centre. */
  thickness?: number;
  /** Fabric colour: mustard by default; sage 0x8fa383 and terracotta 0xc8785a also read well. */
  color?: number;
  /** Lean in radians about the local x axis: positive tips the top towards -z (a backrest at the back). */
  tilt?: number;
}

/** Per-axis exponent of the superellipsoid the box is squeezed onto: higher = squarer. */
const ROUNDNESS = 3.2;
/** How much the edges are squashed relative to the puffed centre (0 = flat slab, 1 = pointy edges). */
const PINCH = 0.55;

/**
 * A soft square cushion lying flat. Local origin is the centre of its underside, +y up;
 * a `tilt` pivots the whole cushion about its bottom back edge so it can lean on a backrest.
 * Decoration only, never a collider (see `Prop`).
 */
export class Cushion extends Prop {
  readonly options: Required<CushionOptions>;

  constructor(options: CushionOptions = {}) {
    super();
    this.name = 'Cushion';
    this.options = { width: 0.4, depth: 0.4, thickness: 0.1, color: 0xc9a552, tilt: 0, ...options };
    const { width, depth, thickness, color, tilt } = this.options;

    const fabric = fabricMaterial({ color, roughness: 1 });
    const mesh = new THREE.Mesh(cushionGeometry(width, thickness, depth), fabric);
    mesh.position.y = thickness / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Pivot on the bottom back edge so a leaning cushion keeps that edge on the seat.
    const pivot = new THREE.Group();
    pivot.position.z = -depth / 2;
    pivot.rotation.x = -tilt;
    mesh.position.z = depth / 2;
    pivot.add(mesh);
    this.add(pivot);
  }
}

/**
 * A box with enough segments to bend, welded so normals are shared across edges, then every
 * vertex pulled onto a superellipsoid (rounding corners and edges) and the height pinched
 * towards the rim so the middle looks stuffed.
 */
function cushionGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(width, height, depth, 10, 3, 10);
  box.deleteAttribute('normal');
  box.deleteAttribute('uv');
  const geometry = mergeVertices(box);
  box.dispose();

  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const nx = p.x / (width / 2);
    const ny = p.y / (height / 2);
    const nz = p.z / (depth / 2);
    // Radial squeeze onto |x|^n + |y|^n + |z|^n = 1: face centres stay, corners come in.
    const norm = Math.pow(Math.abs(nx) ** ROUNDNESS + Math.abs(ny) ** ROUNDNESS + Math.abs(nz) ** ROUNDNESS, 1 / ROUNDNESS);
    const scale = norm > 0 ? 1 / norm : 1;
    // Thinner towards the rim, using a smooth bump over the footprint.
    const rim = Math.min(1, Math.hypot(nx, nz) / Math.SQRT2);
    const puff = 1 - PINCH * rim * rim;
    position.setXYZ(i, p.x * scale, p.y * scale * puff, p.z * scale);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
