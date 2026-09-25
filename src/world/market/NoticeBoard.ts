import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, fitFontSize, seededRandom, toTexture, wrapLines, FONT } from '@/covers/generated/canvasUtils';
import { boxMesh, invisibleHitbox } from '../meshUtils';
import { Prop } from '../props/Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

/** One card pinned on the board. */
export interface NoticeCard {
  title: string;
  lines: string[];
  /** Card colour, a CSS colour (an index card's cream, a post-it's yellow). */
  color: string;
  /** Rotation in radians; a small seeded one when absent. */
  tilt?: number;
}

export interface NoticeBoardOptions {
  /** Hover caption. */
  label: () => string;
  /** Click. */
  onActivate: (session: SessionActions) => void;
}

const WIDTH = 1.1;
const HEIGHT = 0.8;
const FRAME = 0.04;
const DEPTH = 0.025;
/** The cork (header strip included) is painted at this scale. */
const PX_PER_M = 900;
const HEADER_M = 0.1;
/** Cards sit in a grid of `COLS` x `ROWS` under the header. */
const COLS = 4;
const ROWS = 2;
export const NOTICE_BOARD_MAX_CARDS = COLS * ROWS;
const HAND = `"Comic Sans MS", "Chalkboard SE", "Segoe Print", ${FONT}`;
const INK = '#2a2420';
const PIN = '#c8342a';

/**
 * A cork notice board in a wooden frame, a painted header strip reading NOTICES: wanted ads,
 * swaps, club meetings. The cards (index cards and post-its with a red pin, each a little askew,
 * written in a felt-tip hand) are painted onto the cork's one canvas texture; `setCards()`
 * repaints it (up to `NOTICE_BOARD_MAX_CARDS`). Clicking it calls `onActivate`. Wall-hung like a
 * `Flyer`: origin at the centre, on the wall, +z into the room. Decoration: never collides.
 */
export class NoticeBoard extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;

  constructor(private readonly options: NoticeBoardOptions) {
    super();
    this.name = 'NoticeBoard';
    const frame = woodMaterial(0x6a4a2a, 0.6);
    // The frame: four bars round the cork, standing a little proud of it.
    this.add(boxMesh(WIDTH, FRAME, DEPTH, frame, { y: HEIGHT / 2 - FRAME / 2, z: DEPTH / 2 }));
    this.add(boxMesh(WIDTH, FRAME, DEPTH, frame, { y: -HEIGHT / 2 + FRAME / 2, z: DEPTH / 2 }));
    this.add(boxMesh(FRAME, HEIGHT - 2 * FRAME, DEPTH, frame, { x: -WIDTH / 2 + FRAME / 2, z: DEPTH / 2 }));
    this.add(boxMesh(FRAME, HEIGHT - 2 * FRAME, DEPTH, frame, { x: WIDTH / 2 - FRAME / 2, z: DEPTH / 2 }));
    // The cork itself: a backing slab and the painted face over it.
    const inner = { w: WIDTH - 2 * FRAME, h: HEIGHT - 2 * FRAME };
    this.add(boxMesh(inner.w, inner.h, 0.012, frame, { z: 0.006 }));
    [this.canvas, this.ctx] = createCanvas(Math.round(inner.w * PX_PER_M), Math.round(inner.h * PX_PER_M));
    this.texture = toTexture(this.canvas, 4);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(inner.w, inner.h), new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.95 }));
    face.position.z = 0.0125;
    face.castShadow = false;
    face.receiveShadow = true;
    this.add(face);
    this.setCards([]);

    const hitbox = invisibleHitbox(WIDTH, HEIGHT, DEPTH + 0.02, { z: DEPTH / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  /** Repaints the cork with these cards (the first `NOTICE_BOARD_MAX_CARDS`), left to right, top row first. */
  setCards(cards: readonly NoticeCard[]): void {
    const { canvas, ctx } = this;
    const W = canvas.width;
    const H = canvas.height;
    paintCork(ctx, W, H);
    const headerH = HEADER_M * PX_PER_M;
    const random = seededRandom(4099);
    const cellW = W / COLS;
    const cellH = (H - headerH) / ROWS;
    cards.slice(0, NOTICE_BOARD_MAX_CARDS).forEach((card, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const jitter = { x: (random() - 0.5) * cellW * 0.08, y: (random() - 0.5) * cellH * 0.06 };
      const cx = (col + 0.5) * cellW + jitter.x;
      const cy = headerH + (row + 0.5) * cellH + jitter.y;
      paintCard(ctx, card, cx, cy, cellW * 0.86, cellH * 0.84, card.tilt ?? (random() - 0.5) * 0.12);
    });
    this.texture.needsUpdate = true;
  }

  setHovered(_hovered: boolean): void {}

  label(): string {
    return this.options.label();
  }

  activate(session: SessionActions): void {
    this.options.onActivate(session);
  }
}

/** Cork: a warm tan, speckled darker and lighter, old pin holes; the header strip of painted wood with NOTICES stencilled on it. */
function paintCork(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const random = seededRandom(1301);
  ctx.fillStyle = '#b98a58';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(90,55,25,0.25)' : 'rgba(235,200,150,0.22)';
    ctx.fillRect(random() * W, random() * H, 1 + random() * 3, 1 + random() * 3);
  }
  ctx.fillStyle = 'rgba(40,25,10,0.45)';
  for (let i = 0; i < 40; i++) ctx.fillRect(random() * W, random() * H, 2, 2);
  const headerH = HEADER_M * PX_PER_M;
  ctx.fillStyle = '#4a3220';
  ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 4; y < headerH; y += 7) ctx.fillRect(0, y, W, 2);
  ctx.fillStyle = '#f1e2b8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(headerH * 0.62)}px Impact, "Arial Narrow", ${FONT}`;
  ctx.fillText('NOTICES', W / 2, headerH / 2 + 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, headerH, W, 4);
}

/** One card: a drop shadow, the paper, a ruled title in felt-tip, the lines wrapped under it, a red pin at the top. */
function paintCard(ctx: CanvasRenderingContext2D, card: NoticeCard, cx: number, cy: number, w: number, h: number, tilt: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);
  ctx.fillStyle = card.color;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const titleY = -h / 2 + h * 0.18;
  fitFontSize(ctx, card.title, w * 0.86, Math.round(h * 0.14), 12, HAND, 'bold');
  ctx.fillText(card.title, 0, titleY);
  ctx.fillStyle = 'rgba(42,36,32,0.55)';
  ctx.fillRect(-w * 0.4, titleY + h * 0.09, w * 0.8, 2);
  ctx.fillStyle = INK;
  const size = Math.round(h * 0.085);
  ctx.font = `${size}px ${HAND}`;
  const maxLines = Math.floor((h * 0.66) / (size * 1.25));
  const wrapped = card.lines.flatMap((line) => wrapLines(ctx, line, w * 0.86)).slice(0, maxLines);
  wrapped.forEach((line, i) => ctx.fillText(line, 0, titleY + h * 0.2 + i * size * 1.25));
  // The pin: a red head with a highlight and its shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(4, -h / 2 + 14, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PIN;
  ctx.beginPath();
  ctx.arc(0, -h / 2 + 10, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(-3, -h / 2 + 7, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
