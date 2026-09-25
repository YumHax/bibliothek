import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { ModalLike } from '@/game/SessionParts';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { invisibleHitbox } from '../meshUtils';
import { Prop, part, matte } from '../props/Prop';

export interface CollectorsBookOptions {
  /** The collector's book panel the binder opens. */
  panel: ModalLike;
  /** Rewards reached and not yet claimed, for the caption. */
  unclaimed?: () => number;
}

/** A ring binder lying flat: width along local x, depth along z, the spine on the -x edge. */
const WIDTH = 0.26;
const DEPTH = 0.31;
const BOARD = 0.004;
const THICK = 0.042;
const SPINE = 0.022;

const LEATHER = new THREE.MeshStandardMaterial({ color: 0x1f3b2d, roughness: 0.72 });
const PAGES = matte(0xeee6d2, 0.9);
const BRASS = new THREE.MeshStandardMaterial({ color: 0xb8892a, roughness: 0.35, metalness: 0.9 });

/**
 * The collector's book: a green leather ring binder with a gilt label, lying on the living room's
 * sideboard, its pages' edges showing between the boards and two brass corner guards. Clicking it
 * opens the book's panel (`SessionActions.openPanel`). Origin at the middle of its underside.
 * Decoration: never collides.
 */
export class CollectorsBook extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly cover: THREE.MeshStandardMaterial;

  constructor(private readonly options: CollectorsBookOptions) {
    super();
    this.name = 'CollectorsBook';
    this.cover = LEATHER.clone();
    this.cover.map = paintLabel();
    // The boards, the block of pages between them (set back from the fore edge), the spine.
    part(this, WIDTH, BOARD, DEPTH, LEATHER, { y: BOARD / 2 });
    // BoxGeometry's faces: +x, -x, +y (the label), -y, +z, -z.
    part(this, WIDTH, BOARD, DEPTH, LEATHER, { y: THICK - BOARD / 2 }).material = [LEATHER, LEATHER, this.cover, LEATHER, LEATHER, LEATHER];
    part(this, WIDTH - SPINE - 0.006, THICK - 2 * BOARD, DEPTH - 0.012, PAGES, { x: SPINE / 2 - 0.003, y: THICK / 2 }).castShadow = false;
    part(this, SPINE, THICK, DEPTH, LEATHER, { x: -WIDTH / 2 + SPINE / 2, y: THICK / 2 });
    // Brass guards on the two fore-edge corners of the top board.
    for (const sz of [-1, 1]) part(this, 0.03, 0.003, 0.03, BRASS, { x: WIDTH / 2 - 0.015, y: THICK + 0.0015, z: sz * (DEPTH / 2 - 0.015) }).castShadow = false;
    const hitbox = invisibleHitbox(WIDTH + 0.04, THICK + 0.04, DEPTH + 0.04, { y: THICK / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  setHovered(hovered: boolean): void {
    this.cover.emissive.setHex(hovered ? 0x2a2210 : 0x000000);
  }

  label(): string | null {
    const waiting = this.options.unclaimed?.() ?? 0;
    return `Collector’s book${waiting ? ` · ${waiting} reward${waiting === 1 ? '' : 's'} to claim` : ''}. Click to open it`;
  }

  activate(session: SessionActions): void {
    session.openPanel(this.options.panel);
  }

  dispose(): void {
    this.cover.map?.dispose();
    this.cover.dispose();
  }
}

/** The top board's face: leather-dark with a gilt-edged label reading COLLECTION. */
function paintLabel(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 304);
  ctx.fillStyle = '#1f3b2d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // A blind-tooled border.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 4;
  ctx.strokeRect(26, 14, canvas.width - 40, canvas.height - 28);
  // The label, gilt on cream.
  const w = 150;
  const h = 70;
  const x = (canvas.width - w) / 2 + 8;
  const y = 70;
  ctx.fillStyle = '#e9dfc4';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#b8892a';
  ctx.lineWidth = 5;
  ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
  ctx.fillStyle = '#3a2a12';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 20px Georgia, serif';
  ctx.fillText('COLLECTION', x + w / 2, y + h / 2 - 9);
  ctx.font = 'italic 15px Georgia, serif';
  ctx.fillText('the book', x + w / 2, y + h / 2 + 14);
  return toTexture(canvas);
}
