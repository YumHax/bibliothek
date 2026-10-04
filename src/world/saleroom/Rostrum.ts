import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { invisibleHitbox } from '../meshUtils';
import { paint, timber } from '../materials/palette';
import { part } from '../props/Prop';
import { HoverGlint } from '../props/hoverGlint';

interface RostrumOptions {
  /** The caption while looked at (what a click does now: bid N, you lead...). */
  label: () => string | null;
  /** A click: a bid, when the sale is on. */
  onActivate: (session: SessionActions) => void;
}

const WIDTH = 0.9;
const DEPTH = 0.55;
const HEIGHT = 1.12;
const MAHOGANY = timber(0x5a2a1a, 0.5);
const DARK = timber(0x3a1a10, 0.55);
const BRASS = paint(0xb08a3a, 0.35);
const BLOCK = timber(0x2a1810, 0.45);

/**
 * The auctioneer's rostrum: a panelled mahogany desk with a sloped top, a brass rail along its front, the gavel and
 * its sounding block on the top. Clicking it bids on the lot being called (the caption says how much). Origin on the
 * floor at its middle, +z its front (the room's side); the auctioneer stands behind it. `strike()` swings the gavel.
 */
export class Rostrum extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly gavel = new THREE.Group();
  private readonly glint: HoverGlint;
  private swing = 0;

  constructor(private readonly options: RostrumOptions) {
    super();
    this.name = 'Rostrum';
    part(this, WIDTH, HEIGHT - 0.06, DEPTH, MAHOGANY, { y: (HEIGHT - 0.06) / 2 });
    // The plinth and the top, a little proud of the body; two sunk panels on the front.
    part(this, WIDTH + 0.04, 0.08, DEPTH + 0.04, DARK, { y: 0.04 });
    part(this, WIDTH + 0.06, 0.04, DEPTH + 0.08, DARK, { y: HEIGHT - 0.02 });
    for (const x of [-WIDTH / 4, WIDTH / 4]) part(this, WIDTH / 2 - 0.1, HEIGHT * 0.55, 0.012, DARK, { x, y: HEIGHT * 0.5, z: DEPTH / 2 + 0.006 });
    const rail = part(this, WIDTH - 0.1, 0.02, 0.02, BRASS, { y: HEIGHT * 0.86, z: DEPTH / 2 + 0.03 });
    rail.castShadow = false;
    // The sounding block and the gavel lying by it (it pivots at its handle's end).
    part(this, 0.11, 0.025, 0.11, BLOCK, { x: 0.22, y: HEIGHT + 0.0125, z: 0.05 });
    const head = part(this.gavel, 0.11, 0.045, 0.045, BLOCK, { x: 0.13, y: 0.0225 });
    const handle = part(this.gavel, 0.17, 0.016, 0.016, DARK, { x: 0.04, y: 0.0225 });
    head.castShadow = false;
    handle.castShadow = false;
    this.gavel.position.set(0.05, HEIGHT, -0.1);
    this.add(this.gavel);
    this.glint = HoverGlint.of(rail);
    const hitbox = invisibleHitbox(WIDTH + 0.1, HEIGHT + 0.1, DEPTH + 0.1, { y: (HEIGHT + 0.1) / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2 - 0.03, 0, -DEPTH / 2 - 0.04), new THREE.Vector3(WIDTH / 2 + 0.03, HEIGHT, DEPTH / 2 + 0.04));
  }

  /** The gavel comes down on the block. */
  strike(): void {
    this.swing = 1;
  }

  /** Steps the gavel's swing (the hall's update calls it). */
  tick(dt: number): void {
    if (this.swing <= 0) return;
    this.swing = Math.max(0, this.swing - dt * 3);
    // Up, then down hard on the block, then back to rest.
    const t = 1 - this.swing;
    this.gavel.rotation.z = t < 0.4 ? (t / 0.4) * 0.9 : t < 0.5 ? 0.9 * (1 - (t - 0.4) / 0.1) : 0;
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string | null {
    return this.options.label();
  }

  activate(session: SessionActions): void {
    this.options.onActivate(session);
  }
}
