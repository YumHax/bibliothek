import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { part } from '../props/Prop';
import type { Furniture } from '../Furniture';
import { paint, timber, METAL } from '../materials/palette';

export interface ShopCounterOptions {
  /** Length along local x. Default 1.6. */
  width?: number;
  /** Paint of the front panel (the shop's colour). */
  front: number;
  /** Hover caption. */
  label: string;
  /** A click: the shop's catalogue (every piece it sells, as a list). */
  open: (session: SessionActions) => void;
}

const HEIGHT = 0.95;
const DEPTH = 0.55;
const TOP = 0.035;
const TOP_WOOD = timber(0x8a6038, 0.5);
const TILL = paint(0x3c4046, 0.45);
const KEYS = paint(0xe6e0d0, 0.5);
const DISPLAY = paint(0x2a4a3a, 0.3);
const RECEIPT = paint(0xf4f2ea, 0.9);

/**
 * A shop's counter: a panelled front in the shop's colour, a wooden top, the till on it (a cash register with its
 * keys, its little display and a receipt curling out) and a brass bell. The clerk stands behind it (-z); a click opens
 * the shop's catalogue, the list of everything it sells. Origin on the floor under its middle, the customer's side +z.
 * Collides as its box.
 */
export class ShopCounter extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  readonly footprint: THREE.Box3;

  constructor(private readonly options: ShopCounterOptions) {
    super();
    this.name = 'ShopCounter';
    const W = options.width ?? 1.6;
    const front = paint(options.front, 0.55);
    const body = HEIGHT - TOP;
    part(this, W - 0.04, body, DEPTH - 0.04, front, { y: body / 2 });
    // Raised panels on the customer's face, a plinth under them.
    const panels = Math.max(2, Math.round(W / 0.5));
    const pw = (W - 0.12) / panels;
    for (let i = 0; i < panels; i++) part(this, pw - 0.05, body - 0.26, 0.012, front, { x: -W / 2 + 0.06 + pw * (i + 0.5), y: 0.12 + (body - 0.26) / 2 + 0.03, z: DEPTH / 2 - 0.02 + 0.006 });
    part(this, W - 0.02, 0.08, DEPTH - 0.02, paint(0x2a2622, 0.7), { y: 0.04 });
    part(this, W, TOP, DEPTH, TOP_WOOD, { y: HEIGHT - TOP / 2 });

    // The till, turned to the clerk, at one end.
    const till = new THREE.Group();
    till.position.set(-W / 2 + 0.3, HEIGHT, -0.05);
    till.rotation.y = Math.PI;
    part(till, 0.34, 0.09, 0.32, TILL, { y: 0.045 });
    const deck = part(till, 0.3, 0.05, 0.16, TILL, { y: 0.1, z: 0.05 });
    deck.rotation.x = -0.35;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) part(till, 0.035, 0.012, 0.03, KEYS, { x: -0.1 + c * 0.05, y: 0.125 + r * 0.013, z: 0.1 - r * 0.04 });
    part(till, 0.14, 0.07, 0.03, TILL, { y: 0.19, z: -0.1 });
    part(till, 0.11, 0.035, 0.004, DISPLAY, { y: 0.195, z: -0.083 });
    part(till, 0.07, 0.002, 0.08, RECEIPT, { x: 0.12, y: 0.14, z: -0.14 });
    this.add(till);
    // The bell for when nobody is behind it.
    this.add(cylinderMesh(0.035, 0.012, paint(0x1e1c1a, 0.5), { x: W / 2 - 0.25, y: HEIGHT + 0.006, z: 0.1 }, { segments: 16 }));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), METAL.brass());
    dome.position.set(W / 2 - 0.25, HEIGHT + 0.012, 0.1);
    dome.castShadow = true;
    this.add(dome);

    const hitbox = invisibleHitbox(W, HEIGHT + 0.25, DEPTH, { y: (HEIGHT + 0.25) / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, -DEPTH / 2), new THREE.Vector3(W / 2, HEIGHT, DEPTH / 2));
  }

  setHovered(): void {
    // The caption says it all.
  }

  label(): string {
    return this.options.label;
  }

  activate(session: SessionActions): void {
    this.options.open(session);
  }
}
