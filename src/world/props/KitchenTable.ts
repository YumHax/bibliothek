import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface KitchenTableOptions {
  /** Top size; `width` runs along local x. Default 0.85 x 0.7. */
  width?: number;
  depth?: number;
  /** Height of the top surface. Default 0.75. */
  height?: number;
  /** Wood colour of the top. Default a pale beech. */
  wood?: number;
  /** Colour of the painted legs and apron. Default off-white. */
  paint?: number;
  /** Breakfast left on it: a mug, a plate with crumbs and a folded newspaper. Default true. */
  breakfast?: boolean;
}

const TOP_THICKNESS = 0.03;
const APRON_HEIGHT = 0.08;
const LEG = 0.045;

/**
 * A small painted kitchen table with a solid wooden top: four square legs, an apron between them,
 * and (by default) the remains of breakfast. Local origin is the centre of the floor under it,
 * +y up. Collides as a box up to the top.
 */
export class KitchenTable extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  /** Height of the top surface: where things stand. */
  readonly topHeight: number;

  constructor(options: KitchenTableOptions = {}) {
    super();
    this.name = 'KitchenTable';
    const width = options.width ?? 0.85;
    const depth = options.depth ?? 0.7;
    const height = options.height ?? 0.75;
    this.topHeight = height;
    const wood = woodMaterial(options.wood ?? 0xc9a577, 0.55);
    const paint = matte(options.paint ?? 0xefe9dd, 0.6);

    part(this, width, TOP_THICKNESS, depth, wood, { y: height - TOP_THICKNESS / 2 });
    const apronY = height - TOP_THICKNESS - APRON_HEIGHT / 2;
    const inset = 0.06;
    part(this, width - 2 * inset, APRON_HEIGHT, 0.02, paint, { y: apronY, z: -depth / 2 + inset + 0.01 });
    part(this, width - 2 * inset, APRON_HEIGHT, 0.02, paint, { y: apronY, z: depth / 2 - inset - 0.01 });
    part(this, 0.02, APRON_HEIGHT, depth - 2 * inset, paint, { x: -width / 2 + inset + 0.01, y: apronY });
    part(this, 0.02, APRON_HEIGHT, depth - 2 * inset, paint, { x: width / 2 - inset - 0.01, y: apronY });
    const legH = height - TOP_THICKNESS;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(this, LEG, legH, LEG, paint, { x: sx * (width / 2 - inset - LEG / 2 + 0.01), y: legH / 2, z: sz * (depth / 2 - inset - LEG / 2 + 0.01) });

    if (options.breakfast ?? true) this.buildBreakfast(width, depth);

    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, height, depth / 2));
  }

  /** A mug of coffee gone cold, a plate with a knife across it, and the paper folded by the far edge. */
  private buildBreakfast(width: number, depth: number): void {
    const y = this.topHeight;
    const ceramic = matte(0xf4f1ea, 0.4);
    const plate = cylinderMesh(0.11, 0.012, ceramic, { x: -width * 0.18, y: y + 0.006, z: depth * 0.05 }, { radiusBottom: 0.08, segments: 28 });
    this.add(plate);
    const knife = part(this, 0.16, 0.004, 0.016, new THREE.MeshStandardMaterial({ color: 0xc8cbd0, metalness: 0.8, roughness: 0.3 }), { x: -width * 0.18, y: y + 0.014, z: depth * 0.05 + 0.03 });
    knife.rotation.y = 0.5;
    knife.castShadow = false;
    const mug = cylinderMesh(0.04, 0.09, matte(0x3b5a7c, 0.4), { x: width * 0.15, y: y + 0.045, z: -depth * 0.1 }, { radiusBottom: 0.036, segments: 20 });
    this.add(mug);
    // The mug is a closed cylinder: the coffee's surface stands half a millimetre over its top (level, they z-fight).
    const coffee = cylinderMesh(0.036, 0.004, matte(0x2a1a10, 0.25), { x: width * 0.15, y: y + 0.0885, z: -depth * 0.1 }, { segments: 20 });
    coffee.castShadow = false;
    this.add(coffee);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 16, Math.PI), mug.material);
    handle.position.set(width * 0.15 + 0.038, y + 0.045, -depth * 0.1);
    handle.rotation.z = -Math.PI / 2;
    handle.castShadow = true;
    this.add(handle);
    const paper = part(this, 0.3, 0.012, 0.2, matte(0xdcd6c8, 0.9), { x: width * 0.12, y: y + 0.006, z: depth * 0.24 });
    paper.rotation.y = -0.25;
    paper.castShadow = false;
    part(this, 0.28, 0.002, 0.03, matte(0x35322e, 0.9), { x: width * 0.12, y: y + 0.013, z: depth * 0.24 - 0.06 }).rotation.y = -0.25;
  }
}
