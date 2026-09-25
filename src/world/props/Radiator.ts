import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Furniture } from '../Furniture';
import { matte } from './Prop';
import { CHROME } from './bathroomMaterials';
import { fabric } from '@/world/materials/finishes';

export interface RadiatorOptions {
  /**
   * `column`: an old sectional radiator, two tubes per section between headers; `panel`: a flat
   * steel convector with vertical flutes; `towel`: a chrome ladder of bars for a bathroom. Default column.
   */
  style?: 'column' | 'panel' | 'towel';
  /** Length along the wall (local x). Default 0.8 (towel 0.45). */
  width?: number;
  /** Height of the body itself. Default 0.6 (panel 0.5, towel 0.8). */
  height?: number;
  /** Bottom of the body above the floor. Default 0.12 (towel 0.35). */
  lift?: number;
  /** Enamel colour (column and panel; the towel rail is chrome). Default an off-white. */
  color?: number;
  /** Which end carries the thermostatic valve; the other has the lockshield. Default right. */
  valve?: 'left' | 'right';
  /** Gap between the wall and the back of the body, on its brackets. Default 0.04 (0.022 more over tiles is the plan's `offset`). */
  standoff?: number;
  /** A fleece cradle hooked over the top for a cat, sticking out into the room. Default false. */
  catCradle?: boolean;
}

/** Radii of the pipes up from the floor and of the tubes of a section. */
const PIPE_R = 0.0075;
const TUBE_R = 0.011;
/** Pitch of a column radiator's sections. */
const SECTION = 0.05;
/** How far the cradle reaches out from the radiator's face, and its width along it. */
const CRADLE_REACH = 0.34;
const CRADLE_WIDTH = 0.46;
/** A cat's body centre above the cradle's sling. */
const CAT_ON_CRADLE = 0.06;
/** Where the cat lies on the floor in front of a radiator without a cradle, and where it stands before hopping up. */
const FLOOR_SPOT = 0.32;
const APPROACH = 0.5;
/** In front of a cradle's edge, where the cat hops up from. */
const CRADLE_APPROACH = 0.22;

const WHITE_PIPE = matte(0xeeeeea, 0.35);
const VALVE_HEAD = matte(0xf4f4f2, 0.45);
const VALVE_RING = matte(0x3b3d40, 0.5);
const BRASS = new THREE.MeshStandardMaterial({ color: 0xbfa36a, metalness: 0.8, roughness: 0.35 });

/**
 * A radiator under or beside a window: the body on two wall brackets, and at its bottom corners
 * the pipes that come up out of the floor through chrome roses, a thermostatic valve (white head,
 * numbered ring) on one end and a lockshield cap on the other, a bleed key in the top corner. The
 * body's tubes, flutes or bars are merged into one mesh per material, so a radiator costs a handful
 * of draw calls. Wall-hung with `y: 0`: origin on the floor at the wall, +z into the room.
 * Collides over its whole box (the pipes included). No heat, no light: warmth is only the cat's
 * opinion (`restingSpot`: on the cradle when it has one, else the floor in front).
 */
export class Radiator extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  /** Local point in the middle of the body: where its ticking comes from. */
  readonly middle: THREE.Vector3;
  private readonly catSpot: THREE.Vector3;
  private readonly catApproach: THREE.Vector3;
  private readonly hasCradle: boolean;

  constructor(options: RadiatorOptions = {}) {
    super();
    this.name = 'Radiator';
    const style = options.style ?? 'column';
    const towel = style === 'towel';
    const width = options.width ?? (towel ? 0.45 : 0.8);
    const height = options.height ?? (style === 'panel' ? 0.5 : towel ? 0.8 : 0.6);
    const lift = options.lift ?? (towel ? 0.35 : 0.12);
    const standoff = options.standoff ?? 0.04;
    const depth = style === 'column' ? 0.075 : style === 'panel' ? 0.07 : 0.035;
    const body = towel ? CHROME : new THREE.MeshStandardMaterial({ color: options.color ?? 0xf1efe8, roughness: 0.4, metalness: 0.05 });
    const midZ = standoff + depth / 2;
    const bodyParts: THREE.BufferGeometry[] = [];
    if (style === 'column') this.columns(bodyParts, width, height, lift, midZ);
    else if (style === 'panel') this.panel(bodyParts, width, height, lift, midZ, depth);
    else this.ladder(bodyParts, width, height, lift, midZ);
    // Two brackets behind, a third of the way in from each end.
    for (const sx of [-1, 1]) bodyParts.push(box(0.03, 0.04, standoff, sx * width * 0.3, lift + height * 0.8, standoff / 2));
    this.mesh(bodyParts, body);

    // The pipes: from each bottom corner out a little, down into the floor (a rose where they go in).
    const pipes: THREE.BufferGeometry[] = [];
    const chrome: THREE.BufferGeometry[] = [];
    const valveEnd = options.valve === 'left' ? -1 : 1;
    const endX = towel ? width / 2 - 0.015 : width / 2 + 0.035;
    const connectY = lift + (towel ? 0.02 : 0.04);
    for (const sx of [-1, 1]) {
      const x = sx * endX;
      if (!towel) pipes.push(cylinder(PIPE_R, 0.05, sx * (width / 2 + 0.012), connectY, midZ, 'x'));
      pipes.push(cylinder(PIPE_R, connectY, x, connectY / 2, midZ));
      chrome.push(cylinder(0.018, 0.006, x, 0.003, midZ));
      if (sx === valveEnd) {
        // The valve body on the pipe, its head standing up (a TRV) or out (a towel rail's).
        pipes.push(cylinder(0.012, 0.045, x, connectY - 0.035, midZ));
      } else {
        chrome.push(cylinder(0.011, 0.03, x, connectY - 0.03, midZ));
      }
    }
    this.mesh(pipes, towel ? CHROME : WHITE_PIPE);
    this.mesh(chrome, CHROME);
    const headX = valveEnd * endX;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.055, 16), VALVE_HEAD);
    head.position.set(headX, connectY + 0.02, midZ);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0225, 0.0225, 0.008, 16), VALVE_RING);
    ring.position.set(headX, connectY - 0.004, midZ);
    // The bleed key in the top corner at the lockshield end.
    const bleed = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.02, 8).rotateX(Math.PI / 2), BRASS);
    bleed.position.set(-valveEnd * (width / 2 - 0.02), lift + height - 0.03, standoff + depth + 0.008);
    head.castShadow = true;
    this.add(head, ring, bleed);

    const top = lift + height;
    this.middle = new THREE.Vector3(0, lift + height / 2, midZ);
    let reach = standoff + depth + 0.02;
    this.hasCradle = options.catCradle ?? false;
    if (this.hasCradle) {
      this.cradle(top, standoff + depth);
      reach = standoff + depth + CRADLE_REACH;
      this.catSpot = new THREE.Vector3(0, top - 0.04 + CAT_ON_CRADLE, standoff + depth + CRADLE_REACH / 2);
    } else {
      this.catSpot = new THREE.Vector3(0, 0, standoff + depth + FLOOR_SPOT);
    }
    // Clear of the collider (the cradle's reaches the floor), so the cat's grid has it free.
    this.catApproach = new THREE.Vector3(0, 0, this.hasCradle ? reach + CRADLE_APPROACH : standoff + depth + APPROACH);
    const half = Math.max(width / 2, endX) + 0.03;
    this.footprint = new THREE.Box3(new THREE.Vector3(-half, 0, 0), new THREE.Vector3(half, top + 0.02, reach));
  }

  /** World point where a cat lies: on the cradle, or on the warm floor in front. */
  restingSpot(out: THREE.Vector3): THREE.Vector3 {
    return this.localToWorld(out.copy(this.catSpot));
  }

  /** World floor point in front, where the cat stands before hopping up (or lies down). */
  approachPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.localToWorld(out.copy(this.catApproach));
  }

  /** A warm cradle is a favourite, day and night; the floor in front only now and then. */
  catWeight(night: boolean): number {
    if (this.hasCradle) return night ? 2.5 : 1.8;
    return night ? 0.8 : 0.5;
  }

  /** Sections of two tubes each, joined by a header top and bottom. */
  private columns(out: THREE.BufferGeometry[], width: number, height: number, lift: number, z: number): void {
    const sections = Math.max(2, Math.round(width / SECTION));
    const pitch = width / sections;
    for (let i = 0; i < sections; i++) {
      const x = -width / 2 + pitch * (i + 0.5);
      for (const dz of [-0.018, 0.018]) out.push(cylinder(TUBE_R, height - 0.05, x, lift + height / 2, z + dz));
      // The section's cast feet top and bottom, a touch wider than its tubes.
      for (const y of [lift + 0.02, lift + height - 0.02]) out.push(box(pitch - 0.006, 0.04, 0.06, x, y, z));
    }
  }

  /** A flat panel with vertical flutes on its face and a slotted grille along the top. */
  private panel(out: THREE.BufferGeometry[], width: number, height: number, lift: number, z: number, depth: number): void {
    out.push(box(width, height, depth - 0.012, 0, lift + height / 2, z));
    const flutes = Math.round(width / 0.033);
    for (let i = 0; i < flutes; i++) {
      const x = -width / 2 + (width / flutes) * (i + 0.5);
      out.push(box(0.014, height - 0.02, 0.008, x, lift + height / 2, z + depth / 2 - 0.004));
    }
    out.push(box(width - 0.01, 0.01, depth - 0.02, 0, lift + height + 0.003, z));
  }

  /** Two uprights and bars in three groups (the gaps are where towels go). */
  private ladder(out: THREE.BufferGeometry[], width: number, height: number, lift: number, z: number): void {
    for (const sx of [-1, 1]) out.push(cylinder(0.015, height, sx * (width / 2 - 0.015), lift + height / 2, z));
    const groups = [5, 4, 3];
    const barPitch = 0.045;
    const gap = (height - 0.04 - barPitch * (groups.reduce((n, g) => n + g, 0) - groups.length)) / (groups.length - 1);
    let y = lift + 0.02;
    for (const bars of groups) {
      for (let b = 0; b < bars; b++) {
        out.push(cylinder(0.009, width - 0.03, 0, y, z, 'x'));
        if (b < bars - 1) y += barPitch;
      }
      y += gap;
    }
  }

  /** A fleece sling in a wire frame, hooked over the top edge and hanging out in front. */
  private cradle(top: number, face: number): void {
    const wire: THREE.BufferGeometry[] = [];
    const y = top - 0.04;
    const zOut = face + CRADLE_REACH;
    for (const sx of [-1, 1]) {
      const x = (sx * CRADLE_WIDTH) / 2;
      wire.push(cylinder(0.004, CRADLE_REACH, x, y + 0.03, face + CRADLE_REACH / 2, 'z'));
      // Hooks over the top and down the back.
      wire.push(cylinder(0.004, 0.06, x * 0.6, top + 0.01, face - 0.03, 'z'));
      wire.push(cylinder(0.004, 0.05, x * 0.6, top - 0.015, face - 0.06));
    }
    wire.push(cylinder(0.004, CRADLE_WIDTH, 0, y + 0.03, zOut, 'x'));
    this.mesh(wire, CHROME);
    const fleece = fabric({ color: 0xcfc3b1, roughness: 1 });
    const sling = new THREE.Mesh(new THREE.BoxGeometry(CRADLE_WIDTH - 0.01, 0.03, CRADLE_REACH - 0.01), fleece);
    sling.position.set(0, y, face + CRADLE_REACH / 2);
    sling.castShadow = true;
    sling.receiveShadow = true;
    // A rolled rim of fleece at the front so it reads as a bed.
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, CRADLE_WIDTH - 0.01, 12).rotateZ(Math.PI / 2), fleece);
    rim.position.set(0, y + 0.015, zOut - 0.02);
    rim.castShadow = true;
    this.add(sling, rim);
  }

  private mesh(parts: THREE.BufferGeometry[], material: THREE.Material): void {
    if (!parts.length) return;
    const merged = mergeGeometries(parts);
    for (const g of parts) g.dispose();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.add(mesh);
  }
}

/** A non-indexed box at a point (non-indexed so it merges with the cylinders). */
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(x, y, z);
}

/** A cylinder along y (or turned onto x / z) centred on a point, non-indexed for merging. */
function cylinder(r: number, length: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'y'): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, length, 10).toNonIndexed();
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return g.translate(x, y, z);
}
