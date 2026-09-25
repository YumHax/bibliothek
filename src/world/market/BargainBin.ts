import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { matte } from '../props/Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface BargainBinOptions {
  /** The flat price painted on the card. */
  price: number;
}

/** Where one box stands in the bin (bin-local): a `ForSaleBox` origin, leaning back by `angle`. */
export interface BinSlot {
  position: THREE.Vector3;
  angle: number;
}

const WIDTH = 0.62;
const DEPTH = 0.5;
/** Height of the bin's floor: a crate on a low trestle, at a comfortable digging height. */
const FLOOR_Y = 0.55;
const WALL = 0.018;
/** The side walls hold the boxes up; the front board is low so the front copy's cover shows. */
const SIDE_H = 0.16;
const FRONT_H = 0.06;
const COLUMNS = [-0.145, 0.145];
const PER_COLUMN = 6;
/** Each box leans on the one behind it. */
const STEP = 0.06;
const BOX_LEAN = THREE.MathUtils.degToRad(11);

const PINE = woodMaterial(0xa8804f, 0.7);
const LEGS = woodMaterial(0x6a4a2a, 0.6);
const IRON = matte(0x2a2623, 0.6);

/**
 * A crate of worn copies to dig through at a flat price: an open slatted crate on a low trestle,
 * the boxes standing in two files one behind the other like records, and a card on a stick with
 * the price. `slots()` says where each box goes (bin-local, +z towards the buyer: the front copy
 * shows its cover over the low front board, the ones behind their top edges). Collides.
 */
export class BargainBin extends THREE.Group implements Furniture {
  static readonly capacity = COLUMNS.length * PER_COLUMN;

  constructor(options: BargainBinOptions) {
    super();
    this.name = 'BargainBin';
    // Trestle legs and rails.
    for (const x of [-WIDTH / 2 + 0.05, WIDTH / 2 - 0.05]) {
      for (const z of [-DEPTH / 2 + 0.05, DEPTH / 2 - 0.05]) this.add(boxMesh(0.04, FLOOR_Y - 0.02, 0.04, LEGS, { x, y: (FLOOR_Y - 0.02) / 2, z }));
      // Ends buried in the legs, not flush with their faces (coplanar faces z-fight).
      this.add(boxMesh(0.03, 0.03, DEPTH - 0.08, LEGS, { x, y: 0.12 }));
    }
    // The crate: floor, slatted sides and back, a low front board; back and front fit between the sides.
    this.add(boxMesh(WIDTH, 0.02, DEPTH, PINE, { y: FLOOR_Y - 0.01 }));
    for (const sx of [-1, 1]) {
      for (let s = 0; s < 2; s++) this.add(boxMesh(WALL, 0.06, DEPTH, PINE, { x: sx * (WIDTH / 2 - WALL / 2), y: FLOOR_Y + 0.035 + s * 0.09 }));
    }
    for (let s = 0; s < 2; s++) this.add(boxMesh(WIDTH - 2 * WALL, 0.06, WALL, PINE, { y: FLOOR_Y + 0.035 + s * 0.09, z: -DEPTH / 2 + WALL / 2 }));
    this.add(boxMesh(WIDTH - 2 * WALL, FRONT_H, WALL, PINE, { y: FLOOR_Y + FRONT_H / 2, z: DEPTH / 2 - WALL / 2 }));
    // A divider between the two files.
    this.add(boxMesh(0.01, SIDE_H * 0.7, DEPTH - 0.04, PINE, { y: FLOOR_Y + SIDE_H * 0.35 }));

    // The price card on a stick at the back corner.
    const stickH = 0.5;
    this.add(cylinderMesh(0.008, stickH, IRON, { x: WIDTH / 2 - 0.06, y: FLOOR_Y + stickH / 2, z: -DEPTH / 2 + 0.03 }, { segments: 6 }));
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), new THREE.MeshStandardMaterial({ map: paintCard(options.price), roughness: 0.85 }));
    card.position.set(WIDTH / 2 - 0.06, FLOOR_Y + stickH - 0.02, -DEPTH / 2 + 0.04);
    card.rotation.y = -0.25;
    card.castShadow = true;
    this.add(card);

    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, -DEPTH / 2), new THREE.Vector3(WIDTH / 2, FLOOR_Y + SIDE_H, DEPTH / 2));
  }

  /** Slots for `count` boxes (at most `capacity`), filling the files front to back, alternating. */
  slots(count: number): BinSlot[] {
    const slots: BinSlot[] = [];
    const front = DEPTH / 2 - WALL - 0.06;
    for (let i = 0; i < Math.min(count, BargainBin.capacity); i++) {
      const column = COLUMNS[i % COLUMNS.length]!;
      const row = Math.floor(i / COLUMNS.length);
      slots.push({ position: new THREE.Vector3(column, FLOOR_Y + 0.001, front - (row + 1) * STEP), angle: BOX_LEAN });
    }
    return slots;
  }
}

function paintCard(price: number): THREE.Texture {
  const [canvas, ctx] = createCanvas(340, 220);
  ctx.fillStyle = '#f7e36a';
  ctx.fillRect(0, 0, 340, 220);
  ctx.strokeStyle = '#2a1a10';
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, 324, 204);
  ctx.fillStyle = '#2a1a10';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 44px "Comic Sans MS", "Marker Felt", system-ui, sans-serif';
  ctx.fillText('BARGAIN BIN', 170, 52);
  ctx.font = 'bold 76px "Comic Sans MS", "Marker Felt", system-ui, sans-serif';
  ctx.fillStyle = '#c8342a';
  ctx.fillText(`${price} each`, 170, 125);
  ctx.fillStyle = '#2a1a10';
  ctx.font = '26px "Comic Sans MS", "Marker Felt", system-ui, sans-serif';
  ctx.fillText('as seen · no haggling', 170, 185);
  return toTexture(canvas, 4);
}
