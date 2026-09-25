import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { ModalLike } from '@/game/SessionParts';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { invisibleHitbox } from '../meshUtils';
import type { Furniture } from '../Furniture';
import type { WeeklyIssue } from './gamingWeekly';

export interface NewsstandOptions {
  /** The paper's panel: printed with today's issue, then opened by the Session. */
  panel: ModalLike & { print(issue: WeeklyIssue): void };
  /** Today's issue of the paper. */
  issue: () => WeeklyIssue;
}

const SIZE = { width: 2.2, height: 2.35, depth: 1.5 };
const GREEN = 0x2f5a44;

/**
 * A green newspaper kiosk on the pavement: a box with a shallow overhanging roof, the hatch on
 * its front with a counter, the day's papers and magazines pegged round it (one painted panel),
 * PRESSE on the fascia. Clicking it holds up THE GAMING WEEKLY (`NewsPanel`), whose tips come
 * from the flea market's stock. Origin on the pavement at its centre, +z is the hatch's side.
 */
export class Newsstand extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];

  constructor(private readonly options: NewsstandOptions) {
    super();
    this.name = 'Newsstand';
    const { width, height, depth } = SIZE;
    const body = mergeGeometries([
      new THREE.BoxGeometry(width, 0.9, depth).translate(0, 0.45, 0),
      new THREE.BoxGeometry(width, height - 1.9, depth).translate(0, 1.9 + (height - 1.9) / 2, 0),
      new THREE.BoxGeometry(width, 1.0, depth - 0.4).translate(0, 1.4, -0.2),
      new THREE.BoxGeometry(0.2, 1.0, 0.4).translate(-width / 2 + 0.1, 1.4, depth / 2 - 0.2),
      new THREE.BoxGeometry(0.2, 1.0, 0.4).translate(width / 2 - 0.1, 1.4, depth / 2 - 0.2),
    ])!;
    const green = new THREE.MeshStandardMaterial({ color: GREEN, roughness: 0.55, metalness: 0.2 });
    const shell = new THREE.Mesh(body, green);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 0.12, depth + 0.6).translate(0, height + 0.06, 0.1), new THREE.MeshStandardMaterial({ color: 0x1f2a26, roughness: 0.6 }));
    const counter = new THREE.Mesh(new THREE.BoxGeometry(width - 0.3, 0.05, 0.45).translate(0, 0.92, depth / 2 + 0.1), new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 0.7 }));
    for (const mesh of [shell, roof, counter]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    }
    // The papers pegged round the hatch and the fascia's PRESSE: one painted board on the front.
    const board = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: paintFront(width, height), transparent: true, alphaTest: 0.5, roughness: 0.8 }));
    board.position.set(0, height / 2, depth / 2 + 0.005);
    this.add(board);

    const hitbox = invisibleHitbox(width + 0.2, height, depth + 0.4, { y: height / 2, z: 0.1 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    const { width, depth } = SIZE;
    return new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, SIZE.height, depth / 2));
  }

  setHovered(): void {
    // The caption says it all.
  }

  label(): string {
    return 'Click to read THE GAMING WEEKLY';
  }

  activate(session: SessionActions): void {
    this.options.panel.print(this.options.issue());
    session.openPanel(this.options.panel);
  }
}

/** The kiosk's front: PRESSE on the fascia, the hatch left open (transparent), papers and magazines pegged either side and under it. */
function paintFront(width: number, height: number): THREE.CanvasTexture {
  const k = 200;
  const [canvas, ctx] = createCanvas(Math.round(width * k), Math.round(height * k));
  const random = seededRandom(1212);
  const y = (m: number) => (height - m) * k;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Fascia.
  ctx.fillStyle = '#244a38';
  ctx.fillRect(0, y(height), canvas.width, 0.45 * k);
  ctx.fillStyle = '#f0e6c8';
  ctx.font = `bold ${Math.round(0.3 * k)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PRESSE · JOURNAUX', canvas.width / 2, y(height - 0.22));
  // Papers and magazines on the panels either side of the hatch and on the lower front.
  const covers = ['#d9383a', '#3b6fb3', '#f0c94a', '#e8e6e0', '#6fa35e', '#8c4f9e', '#f09a3a', '#222222'];
  const peg = (x0: number, y0: number, x1: number, y1: number): void => {
    for (let x = x0; x < x1 - 0.18; x += 0.24) {
      for (let yy = y0; yy < y1 - 0.26; yy += 0.32) {
        ctx.fillStyle = covers[Math.floor(random() * covers.length)]!;
        ctx.fillRect(x * k, y(yy + 0.28), 0.2 * k, 0.28 * k);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(x * k + 4, y(yy + 0.25), 0.2 * k - 8, 0.05 * k);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        for (let l = 0; l < 3; l++) ctx.fillRect(x * k + 6, y(yy + 0.16 - l * 0.04), (0.2 * k - 12) * (0.5 + random() * 0.5), 2);
      }
    }
  };
  peg(0.02, 0.08, width - 0.02, 0.9);
  peg(0.02, 1.9, width - 0.02, height - 0.47);
  // The hatch itself (1.0 to 1.9 m, between the side posts) stays open: fully transparent.
  ctx.clearRect(0.2 * k, y(1.9), (width - 0.4) * k, 0.9 * k);
  return toTexture(canvas, 4);
}
