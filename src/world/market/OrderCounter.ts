import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

const WIDTH = 1.6;
const DEPTH = 0.7;
const HEIGHT = 1.05;

/** Default distance from the counter's origin to the wall behind it: the desk backs onto the wall. */
const WALL_BEHIND = DEPTH / 2 + 0.03;

export interface OrderCounterOptions {
  /** Distance from the origin back to the wall the sign hangs on; more than the desk's half depth leaves room for a clerk. */
  wallBehind?: number;
}

const OAK = woodMaterial(0x8b6a44, 0.55);
const DARK = matte(0x4a3524, 0.6);

/**
 * The market's mail-order counter: a desk with a thick catalogue on it and a sign on the wall behind
 * (`wallBehind` away, room for the clerk in between). Clicking
 * it opens the catalogue (`SessionActions.openCatalogue`), where any game can be bought new at the
 * shop price. Local +z faces the aisle. Collides.
 */
export class OrderCounter extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly book: THREE.MeshStandardMaterial;

  constructor(options: OrderCounterOptions = {}) {
    super();
    this.name = 'OrderCounter';
    const wallBehind = options.wallBehind ?? WALL_BEHIND;
    this.add(boxMesh(WIDTH, HEIGHT - 0.04, DEPTH * 0.8, DARK, { y: (HEIGHT - 0.04) / 2, z: -DEPTH * 0.1 }));
    this.add(boxMesh(WIDTH + 0.06, 0.04, DEPTH, OAK, { y: HEIGHT - 0.02 }));
    // Panelling on the front.
    for (let x = -WIDTH / 2 + 0.2; x < WIDTH / 2 - 0.1; x += 0.4) this.add(boxMesh(0.3, HEIGHT - 0.3, 0.01, OAK, { x, y: HEIGHT / 2 - 0.02, z: DEPTH * 0.3 + 0.005 }));
    // The catalogue: a fat book, open, and a pen.
    this.book = new THREE.MeshStandardMaterial({ map: this.paintCatalogue(), roughness: 0.8 });
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.3), [DARK, DARK, this.book, DARK, DARK, DARK]);
    book.position.set(-0.1, HEIGHT + 0.025, 0.05);
    book.rotation.y = 0.12;
    book.castShadow = true;
    book.receiveShadow = true;
    this.add(book);
    this.add(boxMesh(0.14, 0.01, 0.01, matte(0x1b1b1b, 0.4), { x: 0.35, y: HEIGHT + 0.005, z: 0.1 }));
    // Sign on the wall behind the counter.
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshStandardMaterial({ map: this.paintSign(), roughness: 0.8 }));
    sign.position.set(0, 1.75, -wallBehind + 0.01);
    sign.castShadow = true;
    this.add(sign);
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
    });

    const hitbox = invisibleHitbox(WIDTH + 0.08, HEIGHT + 0.12, DEPTH + 0.06, { y: (HEIGHT + 0.12) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2 - 0.03, 0, -DEPTH / 2), new THREE.Vector3(WIDTH / 2 + 0.03, HEIGHT, DEPTH / 2));
  }

  setHovered(hovered: boolean): void {
    this.book.emissive.setHex(hovered ? 0x222218 : 0x000000);
  }

  label(): string {
    return 'Mail order — click to leaf through the catalogue (any game, new, at the shop price)';
  }

  activate(session: SessionActions): void {
    session.openCatalogue();
  }

  private paintCatalogue(): THREE.Texture {
    const [canvas, ctx] = createCanvas(420, 300);
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(0, 0, 420, 300);
    ctx.fillStyle = '#d9c9a8';
    ctx.fillRect(208, 0, 4, 300);
    ctx.fillStyle = '#5a4a3a';
    for (let y = 40; y < 280; y += 22) {
      ctx.fillRect(24, y, 150 + ((y * 7) % 30), 3);
      ctx.fillRect(236, y, 130 + ((y * 11) % 40), 3);
    }
    ctx.fillStyle = '#9c6a5a';
    ctx.fillRect(24, 20, 60, 10);
    ctx.fillRect(236, 20, 80, 10);
    return toTexture(canvas, 2);
  }

  private paintSign(): THREE.Texture {
    const [canvas, ctx] = createCanvas(1100, 280);
    ctx.fillStyle = '#2a3a2a';
    ctx.fillRect(0, 0, 1100, 280);
    ctx.strokeStyle = '#d4a52a';
    ctx.lineWidth = 8;
    ctx.strokeRect(14, 14, 1072, 252);
    ctx.fillStyle = '#f4ecd8';
    ctx.font = 'bold 110px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MAIL ORDER', 550, 120);
    ctx.font = '44px Georgia, serif';
    ctx.fillText('any title · new · catalogue price', 550, 215);
    return toTexture(canvas, 4);
  }
}
