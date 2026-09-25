import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { part, matte } from './Prop';
import { CERAMIC, CHROME, CLEAR_GLASS } from './bathroomMaterials';
import { wood as woodMaterial } from '@/world/materials/finishes';
import { mirrorGlass } from './MirrorGlass';
import { WaterStream } from './WaterStream';

export interface WashbasinOptions {
  /** Length of the cabinet along the wall. Default 0.6. */
  width?: number;
  /** Which side of the mirror (local x) the shelf with the bottles hangs on; `none` for no shelf. Default right. */
  shelfSide?: 'left' | 'right' | 'none';
  /** A framed mirror on the wall above (default true); false when a `MirrorCabinet` hangs there instead. */
  mirror?: boolean;
  /** Called when a click turns the tap on or off (the builder runs the sound from it). */
  onTap?: (running: boolean) => void;
}

/** The mixer: its height above the countertop and where its spout ends (the stream falls from there). */
const MIXER_H = 0.3;
const SPOUT_TIP_Z = 0.175;
const BOWL_Z = 0.24;

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
const BRISTLES = matte(0xf2f4f5, 0.9);
const TOOTHPASTE = matte(0xe9eef2, 0.45);

/**
 * A washbasin on a two-drawer oak cabinet: a white countertop with a round bowl and a tall
 * chrome mixer, a soap pump and a cup of toothbrushes, a framed mirror above, and to one side a
 * glass shelf with a few bottles. Clicking the mixer runs the tap: a stream falls into the bowl
 * until clicked again. Wall-hung with `y: 0`: origin on the floor at the wall,
 * +z into the room. Collides at the cabinet up to the countertop.
 */
export class Washbasin extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly footprint: THREE.Box3;
  readonly hitboxes: THREE.Object3D[];
  private readonly stream = new WaterStream(0.0055);
  private running = false;

  constructor(private readonly options: WashbasinOptions = {}) {
    super();
    this.name = 'Washbasin';
    const width = options.width ?? 0.6;
    const shelfSide = options.shelfSide ?? 'right';

    this.buildCabinet(width);
    this.buildBasin();
    if (options.mirror ?? true) this.buildMirror();
    if (shelfSide !== 'none') this.buildShelf((shelfSide === 'right' ? 1 : -1) * (width / 2 + 0.05 + SHELF_W / 2));

    // The stream hangs from the spout's mouth down to the bowl's floor.
    const top = TOP_Y + MIXER_H - 0.03;
    this.stream.position.set(0, top, SPOUT_TIP_Z);
    this.stream.setLength(top - TOP_Y - 0.002);
    this.add(this.stream);
    const hitbox = invisibleHitbox(0.1, MIXER_H + 0.04, 0.2, { y: TOP_Y + (MIXER_H + 0.04) / 2, z: 0.1 });
    this.add(hitbox);
    this.hitboxes = [hitbox];

    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2 - 0.01, 0, 0), new THREE.Vector3(width / 2 + 0.01, TOP_Y, DEPTH + 0.01));
  }

  update(dt: number): void {
    this.stream.update(dt);
  }

  /** Whether the tap is running (a cat keeps out of the bowl then). */
  get isRunning(): boolean {
    return this.running;
  }

  /** World point in the bowl where a cat curls up; `approachPoint` is the floor in front it hops up from. */
  restingSpot(out: THREE.Vector3): THREE.Vector3 {
    return this.localToWorld(out.set(0, TOP_Y + 0.01, BOWL_Z));
  }

  approachPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.localToWorld(out.set(0, 0, DEPTH + 0.3));
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(_hovered: boolean): void {}

  label(): string {
    return this.running ? 'Click to turn the tap off' : 'Click to run the tap';
  }

  activate(_session: SessionActions): void {
    this.running = !this.running;
    this.stream.visible = this.running;
    this.options.onTap?.(this.running);
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
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(bowlR, bowlR * 0.78, bowlH, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.25, side: THREE.DoubleSide }));
    bowl.position.set(0, TOP_Y + bowlH / 2, BOWL_Z);
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(bowlR * 0.78, 28), CERAMIC);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(0, TOP_Y + 0.002, BOWL_Z);
    bottom.receiveShadow = true;
    this.add(bowl, bottom, cylinderMesh(0.02, 0.003, CHROME, { y: TOP_Y + 0.004, z: BOWL_Z }, { segments: 14 }));

    // Tall mixer behind the bowl, its spout reaching over the rim.
    this.add(cylinderMesh(0.015, MIXER_H, CHROME, { y: TOP_Y + MIXER_H / 2, z: 0.05 }, { segments: 14 }));
    const spout = cylinderMesh(0.011, 0.14, CHROME, { y: TOP_Y + MIXER_H - 0.02, z: 0.11 }, { segments: 12 });
    spout.rotation.x = Math.PI / 2;
    this.add(spout);
    part(this, 0.012, 0.012, 0.06, CHROME, { y: TOP_Y + MIXER_H + 0.006, z: 0.07 });

    // A soap pump and a cup with two toothbrushes (white bristle heads at the top), a tube of toothpaste lying beside it.
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
      const bristles = part(brush, 0.011, 0.024, 0.012, BRISTLES, { y: 0.075, z: 0.009 });
      bristles.castShadow = false;
    }
    const tube = cylinderMesh(0.014, 0.13, TOOTHPASTE, { x: -0.24, y: TOP_Y + 0.01, z: 0.33 }, { radiusBottom: 0.016, segments: 12 });
    tube.rotation.set(0, 0.5, Math.PI / 2);
    tube.scale.z = 0.6;
    this.add(tube);
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
