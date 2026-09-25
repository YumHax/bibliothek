import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface BuyBackDeskOptions {
  /** Distance from the origin back to the wall the sign hangs on (room for the clerk in between). */
  wallBehind?: number;
}

const WIDTH = 1.3;
const DEPTH = 0.62;
const HEIGHT = 1.02;

const PINE = woodMaterial(0x9a7650, 0.6);
const PANEL = matte(0x3a4a5a, 0.7);
const TIN = new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 0.45, metalness: 0.6 });
const BRASS = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.35, metalness: 0.8 });

/**
 * The WE BUY desk: where the market buys games off the player. A plain desk with a cash tin and a
 * brass bell on it, a hand-painted sign on the wall behind. Clicking it opens the sell panel
 * (`SessionActions.openSellDesk`); a sold game goes on its platform's stall the next day. Local +z
 * faces the aisle. Collides.
 */
export class BuyBackDesk extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly lid: THREE.MeshStandardMaterial;

  constructor(options: BuyBackDeskOptions = {}) {
    super();
    this.name = 'BuyBackDesk';
    const wallBehind = options.wallBehind ?? DEPTH / 2 + 0.03;
    this.add(boxMesh(WIDTH, HEIGHT - 0.04, DEPTH * 0.8, PANEL, { y: (HEIGHT - 0.04) / 2, z: -DEPTH * 0.1 }));
    this.add(boxMesh(WIDTH + 0.06, 0.04, DEPTH, PINE, { y: HEIGHT - 0.02 }));
    // Tongue-and-groove boards down the front.
    for (let x = -WIDTH / 2 + 0.06; x < WIDTH / 2; x += 0.12) this.add(boxMesh(0.1, HEIGHT - 0.12, 0.01, PINE, { x, y: (HEIGHT - 0.04) / 2, z: DEPTH * 0.3 + 0.005 }));

    // The cash tin, its lid a little open, and the bell.
    this.lid = TIN.clone();
    this.add(boxMesh(0.26, 0.08, 0.18, this.lid, { x: 0.3, y: HEIGHT + 0.04, z: -0.05 }));
    const lid = boxMesh(0.26, 0.012, 0.18, this.lid, { x: 0.3, y: HEIGHT + 0.085, z: -0.14 });
    lid.rotation.x = -0.5;
    lid.position.y += 0.04;
    this.add(lid);
    this.add(cylinderMesh(0.035, 0.01, BRASS, { x: -0.35, y: HEIGHT + 0.005, z: 0.08 }, { segments: 16 }));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), BRASS);
    dome.position.set(-0.35, HEIGHT + 0.01, 0.08);
    this.add(dome);
    // A stack of boxes bought today, waiting to be priced.
    this.add(boxMesh(0.14, 0.09, 0.2, matte(0x7a3a2a, 0.8), { x: -0.05, y: HEIGHT + 0.045, z: -0.12 }));

    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.42), new THREE.MeshStandardMaterial({ map: paintSign(), roughness: 0.85 }));
    sign.position.set(0, 1.8, -wallBehind + 0.01);
    this.add(sign);

    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    const hitbox = invisibleHitbox(WIDTH + 0.08, HEIGHT + 0.14, DEPTH + 0.06, { y: (HEIGHT + 0.14) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2 - 0.03, 0, -DEPTH / 2), new THREE.Vector3(WIDTH / 2 + 0.03, HEIGHT, DEPTH / 2));
  }

  setHovered(hovered: boolean): void {
    this.lid.emissive.setHex(hovered ? 0x1a2a1a : 0x000000);
  }

  label(): string {
    return 'We buy games — click to sell some of your collection';
  }

  activate(session: SessionActions): void {
    session.openSellDesk();
  }
}

function paintSign(): THREE.Texture {
  const [canvas, ctx] = createCanvas(1200, 420);
  ctx.fillStyle = '#f1e8d6';
  ctx.fillRect(0, 0, 1200, 420);
  ctx.fillStyle = '#c8443a';
  ctx.fillRect(0, 0, 1200, 30);
  ctx.fillRect(0, 390, 1200, 30);
  ctx.fillStyle = '#2a1a10';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 150px Georgia, serif';
  ctx.fillText('WE BUY', 600, 160);
  ctx.font = 'italic 56px Georgia, serif';
  ctx.fillText('your old games · cash paid on the spot', 600, 300);
  return toTexture(canvas, 4);
}
