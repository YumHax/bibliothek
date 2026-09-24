import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';
import { CERAMIC, CHROME, CLEAR_GLASS } from './bathroomMaterials';
import { wood as woodMaterial } from '@/world/materials/finishes';
import { mirrorGlass } from './MirrorGlass';

export interface WashbasinOptions {
  /** Length of the cabinet along the wall. Default 0.6. */
  width?: number;
  /** Which side of the mirror (local x) the shelf with the bottles hangs on; `none` for no shelf. Default right. */
  shelfSide?: 'left' | 'right' | 'none';
}

const DEPTH = 0.42;
const CABINET_H = 0.78;
/** Top of the countertop: the collider's height. */
const TOP_Y = CABINET_H + 0.03;
const PLINTH = 0.08;
const MIRROR_W = 0.5;
const MIRROR_H = 0.7;
/** Centre of the mirror: its bottom edge clears a 1.2 m wainscot and its cap rail. */
const MIRROR_Y = 1.6;
const SHELF_W = 0.3;
const SHELF_Y = 1.35;

const OAK = woodMaterial(0xc9ad86, 0.55);
const DARK = matte(0x2e2c2a, 0.7);
const MIRROR = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, roughness: 0.08, metalness: 0.2 });

/**
 * A washbasin on a two-drawer oak cabinet: a white countertop with a round bowl and a tall
 * chrome mixer, a soap pump and a cup of toothbrushes, a framed mirror above, and to one side a
 * glass shelf with a few bottles. Wall-hung with `y: 0`: origin on the floor at the wall,
 * +z into the room. Collides at the cabinet up to the countertop.
 */
export class Washbasin extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: WashbasinOptions = {}) {
    super();
    this.name = 'Washbasin';
    const width = options.width ?? 0.6;
    const shelfSide = options.shelfSide ?? 'right';

    this.buildCabinet(width);
    this.buildBasin();
    this.buildMirror();
    if (shelfSide !== 'none') this.buildShelf((shelfSide === 'right' ? 1 : -1) * (width / 2 + 0.05 + SHELF_W / 2));

    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2 - 0.01, 0, 0), new THREE.Vector3(width / 2 + 0.01, TOP_Y, DEPTH + 0.01));
  }

  /** Recessed plinth, carcass, two drawer fronts with bar handles, the countertop. */
  private buildCabinet(width: number): void {
    const z = DEPTH / 2;
    part(this, width - 0.08, PLINTH, DEPTH - 0.06, DARK, { y: PLINTH / 2, z: z - 0.03 });
    const bodyH = CABINET_H - PLINTH;
    part(this, width, bodyH, DEPTH, OAK, { y: PLINTH + bodyH / 2, z });
    const drawerH = (bodyH - 0.03) / 2;
    for (let i = 0; i < 2; i++) {
      const y = PLINTH + 0.01 + drawerH / 2 + i * (drawerH + 0.01);
      part(this, width - 0.02, drawerH, 0.008, matte(0xd3b993, 0.5), { y, z: DEPTH + 0.004 });
      part(this, 0.16, 0.012, 0.012, CHROME, { y: y + drawerH / 2 - 0.05, z: DEPTH + 0.016 });
    }
    part(this, width + 0.02, 0.03, DEPTH + 0.02, CERAMIC, { y: CABINET_H + 0.015, z: z + 0.01 });
  }

  /** Round countertop bowl with its drain, the mixer behind it, the soap and the toothbrushes beside it. */
  private buildBasin(): void {
    const bowlR = 0.18;
    const bowlH = 0.11;
    const bowlZ = 0.24;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(bowlR, bowlR * 0.78, bowlH, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.25, side: THREE.DoubleSide }));
    bowl.position.set(0, TOP_Y + bowlH / 2, bowlZ);
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(bowlR * 0.78, 28), CERAMIC);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(0, TOP_Y + 0.002, bowlZ);
    bottom.receiveShadow = true;
    this.add(bowl, bottom, cylinderMesh(0.02, 0.003, CHROME, { y: TOP_Y + 0.004, z: bowlZ }, { segments: 14 }));

    // Tall mixer behind the bowl, its spout reaching over the rim.
    const mixerH = 0.3;
    this.add(cylinderMesh(0.015, mixerH, CHROME, { y: TOP_Y + mixerH / 2, z: 0.05 }, { segments: 14 }));
    const spout = cylinderMesh(0.011, 0.14, CHROME, { y: TOP_Y + mixerH - 0.02, z: 0.11 }, { segments: 12 });
    spout.rotation.x = Math.PI / 2;
    this.add(spout);
    part(this, 0.012, 0.012, 0.06, CHROME, { y: TOP_Y + mixerH + 0.006, z: 0.07 });

    // A soap pump and a cup with two toothbrushes.
    this.add(cylinderMesh(0.026, 0.13, matte(0x3a3f44, 0.5), { x: 0.23, y: TOP_Y + 0.065, z: 0.15 }, { segments: 14 }));
    this.add(cylinderMesh(0.008, 0.04, CHROME, { x: 0.23, y: TOP_Y + 0.15, z: 0.15 }, { segments: 8 }));
    part(this, 0.03, 0.008, 0.02, CHROME, { x: 0.23, y: TOP_Y + 0.168, z: 0.16 });
    this.add(cylinderMesh(0.034, 0.09, CERAMIC, { x: -0.23, y: TOP_Y + 0.045, z: 0.14 }, { radiusBottom: 0.03, segments: 14 }));
    for (const [dx, colour, tilt] of [
      [-0.012, 0x4f86b8, 0.12],
      [0.012, 0xe2705a, -0.1],
    ] as const) {
      const brush = part(this, 0.012, 0.19, 0.008, matte(colour, 0.5), { x: -0.23 + dx, y: TOP_Y + 0.13, z: 0.14 });
      brush.rotation.z = tilt;
    }
  }

  /** A white-framed mirror over the basin. */
  private buildMirror(): void {
    part(this, MIRROR_W, MIRROR_H, 0.02, CERAMIC, { y: MIRROR_Y, z: 0.01 });
    const glass = part(this, MIRROR_W - 0.05, MIRROR_H - 0.05, 0.006, MIRROR, { y: MIRROR_Y, z: 0.022 });
    glass.castShadow = false;
    const silver = mirrorGlass(MIRROR_W - 0.05, MIRROR_H - 0.05);
    silver.position.set(0, MIRROR_Y, 0.0255);
    this.add(silver);
  }

  /** A glass shelf on two chrome brackets, with a jar and three bottles on it. */
  private buildShelf(x: number): void {
    const depth = 0.13;
    const shelf = part(this, SHELF_W, 0.008, depth, CLEAR_GLASS, { x, y: SHELF_Y, z: depth / 2 });
    shelf.castShadow = false;
    for (const dx of [-SHELF_W / 2 + 0.04, SHELF_W / 2 - 0.04]) {
      part(this, 0.03, 0.03, 0.012, CHROME, { x: x + dx, y: SHELF_Y - 0.02, z: 0.006 });
      part(this, 0.02, 0.012, depth - 0.02, CHROME, { x: x + dx, y: SHELF_Y - 0.01, z: depth / 2 - 0.01 });
    }
    const y = SHELF_Y + 0.004;
    const bottles: [dx: number, r: number, h: number, colour: number][] = [
      [-0.1, 0.025, 0.16, 0xb8742a],
      [-0.04, 0.02, 0.2, 0xf0efe8],
      [0.03, 0.028, 0.12, 0x5f86a8],
      [0.1, 0.03, 0.07, 0xe8dcc4],
    ];
    for (const [dx, r, h, colour] of bottles) {
      this.add(cylinderMesh(r, h, matte(colour, 0.35), { x: x + dx, y: y + h / 2, z: depth / 2 }, { segments: 14 }));
      this.add(cylinderMesh(r * 0.55, 0.02, matte(0x2a2a2a, 0.5), { x: x + dx, y: y + h + 0.01, z: depth / 2 }, { segments: 10 }));
    }
  }
}
