import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part } from './Prop';
import { CERAMIC, CHROME, CLEAR_GLASS } from './bathroomMaterials';

export interface BathtubOptions {
  /** Outer size. Default a standard 1.7 x 0.75 m tub, 0.55 m high. */
  length?: number;
  width?: number;
  height?: number;
  /** Which end (local x) the tap, the riser and the shower head are at. Default left. */
  tapEnd?: 'left' | 'right';
  /** A fixed glass screen on the rim at the tap end. Default true. */
  screen?: boolean;
}

/** Thickness of the shell's walls and height of the basin floor above the room floor (the skirt hides the feet). */
const SHELL = 0.06;
const BASIN_FLOOR = 0.12;
/** Where the wall-mounted mixer sits and how high the shower head hangs. */
const TAP_Y = 0.72;
const HEAD_Y = 2.0;
const HEAD_REACH = 0.36;
/** The glass screen: long enough to catch the shower, tall enough not to soak the room. */
const SCREEN_LENGTH = 0.8;
const SCREEN_HEIGHT = 1.4;

/**
 * A built-in bathtub: a white ceramic shell (skirt, back and end panels round a sunken basin),
 * a chrome mixer on the wall above one end with a riser up to a rain shower head, and a fixed
 * glass screen standing on the rim at that end. Wall-hung with `y: 0`: origin on the floor at
 * the wall, the tub's length along local x, +z into the room. Collides over its whole slab.
 */
export class Bathtub extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: BathtubOptions = {}) {
    super();
    this.name = 'Bathtub';
    const length = options.length ?? 1.7;
    const width = options.width ?? 0.75;
    const height = options.height ?? 0.55;
    const end = options.tapEnd === 'right' ? 1 : -1;

    this.buildShell(length, width, height, end);
    this.buildTap(end * (length / 2 - 0.3));
    if (options.screen ?? true) this.buildScreen(end, length, width, height);

    this.footprint = new THREE.Box3(new THREE.Vector3(-length / 2, 0, 0), new THREE.Vector3(length / 2, height, width));
  }

  /** Four panels round a basin floor; the inner faces are what one sees looking down into it. */
  private buildShell(length: number, width: number, height: number, end: number): void {
    const inner = length - 2 * SHELL;
    part(this, length, height, SHELL, CERAMIC, { y: height / 2, z: width - SHELL / 2 });
    part(this, length, height, SHELL, CERAMIC, { y: height / 2, z: SHELL / 2 });
    for (const side of [-1, 1]) part(this, SHELL, height, width - 2 * SHELL, CERAMIC, { x: side * (length / 2 - SHELL / 2), y: height / 2, z: width / 2 });
    part(this, inner, BASIN_FLOOR, width - 2 * SHELL, CERAMIC, { y: BASIN_FLOOR / 2, z: width / 2 });
    // The drain at the tap end and the overflow above it on the end panel.
    this.add(cylinderMesh(0.035, 0.004, CHROME, { x: end * (inner / 2 - 0.12), y: BASIN_FLOOR + 0.002, z: width / 2 }, { segments: 16 }));
    const overflow = cylinderMesh(0.028, 0.004, CHROME, { x: end * (inner / 2 - 0.002), y: height - 0.12, z: width / 2 }, { segments: 16 });
    overflow.rotation.z = Math.PI / 2;
    this.add(overflow);
  }

  /** Wall-mounted mixer with two cross handles and a spout, the riser to the shower arm and its head. */
  private buildTap(x: number): void {
    part(this, 0.18, 0.1, 0.012, CHROME, { x, y: TAP_Y, z: 0.006 });
    const spout = cylinderMesh(0.014, 0.16, CHROME, { x, y: TAP_Y - 0.02, z: 0.09 }, { segments: 12 });
    spout.rotation.x = Math.PI / 2;
    this.add(spout);
    for (const dx of [-0.065, 0.065]) {
      const handle = cylinderMesh(0.022, 0.03, CHROME, { x: x + dx, y: TAP_Y, z: 0.027 }, { segments: 12 });
      handle.rotation.x = Math.PI / 2;
      this.add(handle);
    }
    const riserH = HEAD_Y - TAP_Y;
    this.add(cylinderMesh(0.011, riserH, CHROME, { x, y: TAP_Y + riserH / 2, z: 0.03 }, { segments: 10 }));
    const arm = cylinderMesh(0.01, HEAD_REACH, CHROME, { x, y: HEAD_Y, z: HEAD_REACH / 2 }, { segments: 10 });
    arm.rotation.x = Math.PI / 2;
    this.add(arm);
    this.add(cylinderMesh(0.1, 0.018, CHROME, { x, y: HEAD_Y - 0.02, z: HEAD_REACH }, { segments: 24 }));
    // Keep the hand shower's cradle too: a small hook on the riser, the handset in it.
    part(this, 0.03, 0.02, 0.05, CHROME, { x, y: 1.25, z: 0.045 });
    this.add(cylinderMesh(0.018, 0.22, CHROME, { x, y: 1.14, z: 0.07 }, { radiusBottom: 0.012, segments: 10 }));
  }

  /** A clear pane standing on the rim, hinged to a chrome profile against the wall. */
  private buildScreen(end: number, length: number, width: number, height: number): void {
    const z = width - SHELL / 2;
    const x = end * (length / 2 - SCREEN_LENGTH / 2);
    const glass = part(this, SCREEN_LENGTH, SCREEN_HEIGHT, 0.006, CLEAR_GLASS, { x, y: height + SCREEN_HEIGHT / 2, z });
    glass.castShadow = false;
    part(this, 0.02, SCREEN_HEIGHT, 0.03, CHROME, { x: end * (length / 2 - 0.01), y: height + SCREEN_HEIGHT / 2, z });
    part(this, SCREEN_LENGTH, 0.012, 0.02, CHROME, { x, y: height + 0.006, z });
  }
}
