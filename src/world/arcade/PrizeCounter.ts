import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { drawText } from './games/ArcadeGame';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface PrizeCounterOptions {
  /** Tickets one coin is worth, written on the sign. */
  ticketsPerCoin: number;
  /** Gap between the counter's back and the wall the sign hangs on (room for an attendant behind). Default 0.02. */
  wallBehind?: number;
}

const WIDTH = 1.5;
const DEPTH = 0.6;
const HEIGHT = 1.02;
const SIGN_Y = 1.75;

const WOOD = woodMaterial(0x4a3524, 0.6);
const TOP = matte(0x8b6a44, 0.5);
const GLASS = new THREE.MeshStandardMaterial({ color: 0xbfd8e6, roughness: 0.1, transparent: true, opacity: 0.35 });

/**
 * The arcade's prize counter: a glass-fronted desk with a lit sign giving the rate. Clicking it
 * turns the player's tickets into coins (`SessionActions.redeemTickets`). Local +z faces the room.
 */
export class PrizeCounter extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly sign: THREE.MeshBasicMaterial;
  private readonly rate: number;

  constructor({ ticketsPerCoin, wallBehind = 0.02 }: PrizeCounterOptions) {
    super();
    this.name = 'PrizeCounter';
    this.rate = ticketsPerCoin;

    // Desk: a wooden carcass, a glass display in the front, a thicker top.
    this.add(boxMesh(WIDTH, HEIGHT - 0.04, DEPTH * 0.55, WOOD, { y: (HEIGHT - 0.04) / 2, z: -DEPTH * 0.22 }));
    const glass = boxMesh(WIDTH - 0.08, HEIGHT - 0.3, DEPTH * 0.42, GLASS, { y: 0.16 + (HEIGHT - 0.3) / 2, z: DEPTH * 0.28 });
    glass.castShadow = false;
    this.add(glass);
    this.add(boxMesh(WIDTH, 0.12, DEPTH * 0.45, WOOD, { y: 0.06, z: DEPTH * 0.28 }));
    this.add(boxMesh(WIDTH + 0.04, 0.04, DEPTH + 0.04, TOP, { y: HEIGHT - 0.02 }));
    // A few prizes in the case: plush-like blobs and a stack of small boxes.
    const plush = [0xff8a80, 0x7ee787, 0x63b3ff, 0xffd23a];
    plush.forEach((color, i) => {
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), matte(color, 0.9));
      blob.position.set(-0.5 + i * 0.33, 0.12 + 0.07, DEPTH * 0.28);
      blob.castShadow = true;
      this.add(blob);
    });
    this.add(boxMesh(0.16, 0.12, 0.1, matte(0xf1ede6, 0.7), { x: 0.45, y: 0.12 + 0.06 + 0.2, z: DEPTH * 0.28 }));
    // A bowl of coins on the top.
    const bowl = cylinderMesh(0.09, 0.04, matte(0x2a2a30, 0.4), { x: 0.5, y: HEIGHT + 0.02, z: 0.05 }, { radiusBottom: 0.06, segments: 20 });
    const coins = cylinderMesh(0.08, 0.01, new THREE.MeshStandardMaterial({ color: 0xd4a52a, metalness: 0.8, roughness: 0.3 }), { x: 0.5, y: HEIGHT + 0.04, z: 0.05 }, { segments: 20 });
    this.add(bowl, coins);

    // Lit sign on the wall behind (a hair off it, whatever the gap to the counter), hung from two rods.
    const signZ = -DEPTH / 2 - wallBehind + 0.04;
    this.sign = new THREE.MeshBasicMaterial({ map: this.paintSign(), toneMapped: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), this.sign);
    sign.position.set(0, SIGN_Y, signZ);
    this.add(sign);
    for (const x of [-0.5, 0.5]) this.add(cylinderMesh(0.006, 0.4, matte(0x2a2a30, 0.5), { x, y: SIGN_Y + 0.35, z: signZ }, { segments: 8 }));

    const hitbox = invisibleHitbox(WIDTH + 0.06, HEIGHT + 0.1, DEPTH + 0.06, { y: (HEIGHT + 0.1) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, -DEPTH / 2), new THREE.Vector3(WIDTH / 2, HEIGHT, DEPTH / 2));
  }

  setHovered(hovered: boolean): void {
    this.sign.color.setHex(hovered ? 0xffffff : 0xdddddd);
  }

  label(): string {
    return `Prize counter — click to exchange your tickets (${this.rate} tickets = 1 coin)`;
  }

  activate(session: SessionActions): void {
    session.redeemTickets();
  }

  private paintSign(): THREE.CanvasTexture {
    const [canvas, ctx] = createCanvas(1024, 256);
    ctx.fillStyle = '#1a0f2a';
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = '#ff8a80';
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, 1000, 232);
    drawText(ctx, 'PRIZES', 512, 95, 90, '#ffd23a');
    drawText(ctx, `${this.rate} TICKETS = 1 COIN`, 512, 190, 40, '#c9c4ff');
    return toTexture(canvas, 4);
  }
}
