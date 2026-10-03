import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../../Furniture';
import { invisibleHitbox } from '../../meshUtils';
import { snowCovered } from '../snowCover';
import { whatsOn, type WhatsOnItem, type WhatsOnSources } from './whatsOnItems';

export interface WhatsOnOptions extends WhatsOnSources {
  /** The Morris column it is pasted on: radius, and the drum's height (`STREET_PLAN.details.column`). */
  radius: number;
  height: number;
  anisotropy: number;
}

/** The bill on the column: how far round it wraps (radians), facing the road (-z), and from which height to which. */
const BILL = { wrap: 1.7, bottom: 0.75, top: 2.15 };
const BILL_CANVAS = { w: 640, h: 512 };
/** The shelter's poster (the size of `StreetFurniture`'s panel). */
const AD_CANVAS = { w: 256, h: 372 };

/**
 * The street's "what's on": a fresh bill pasted on the Morris column facing the road (the next
 * Grand Flea Fair, today's arcade challenge, the Saturday tournament: `whatsOn`), and the bus
 * shelter's lit poster for the Fair (`ad`, handed to `StreetFurniture`). Both are repainted when
 * the market day turns. Clicked, the column reads the bill out.
 */
export class WhatsOnBills extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  /** The shelter's poster: give it to `StreetFurniture` (`ad`). */
  readonly ad: THREE.CanvasTexture;
  private readonly bill: THREE.CanvasTexture;
  private readonly billCanvas: HTMLCanvasElement;
  private readonly adCanvas: HTMLCanvasElement;
  private day = NaN;

  constructor(private readonly options: WhatsOnOptions) {
    super();
    this.name = 'WhatsOnBills';
    const [billCanvas] = createCanvas(BILL_CANVAS.w, BILL_CANVAS.h);
    const [adCanvas] = createCanvas(AD_CANVAS.w, AD_CANVAS.h);
    this.billCanvas = billCanvas;
    this.adCanvas = adCanvas;
    this.bill = toTexture(billCanvas, options.anisotropy);
    this.ad = toTexture(adCanvas, 2);
    // The bill: a strip of the drum a hair out from it, centred on the side facing the road.
    const strip = new THREE.CylinderGeometry(options.radius + 0.004, options.radius + 0.004, BILL.top - BILL.bottom, 24, 1, true, Math.PI - BILL.wrap / 2, BILL.wrap).translate(0, (BILL.top + BILL.bottom) / 2, 0);
    const mesh = new THREE.Mesh(strip, snowCovered(new THREE.MeshStandardMaterial({ map: this.bill, roughness: 0.8 })));
    mesh.receiveShadow = true;
    this.add(mesh);
    const hitbox = invisibleHitbox(options.radius * 2 + 0.2, options.height, options.radius * 2 + 0.2, { y: options.height / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.repaint();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(): void {
    if (this.options.day() !== this.day) this.repaint();
  }

  setHovered(): void {
    // The caption says it.
  }

  label(): string {
    return "What's on · read the bills";
  }

  activate(session: SessionActions): void {
    const items = whatsOn(this.options);
    session.read({ title: "What's on", text: items.map((i) => `${i.today ? 'TODAY · ' : ''}${i.title}: ${i.line}`).join('\n'), look: 'note' });
  }

  private repaint(): void {
    this.day = this.options.day();
    const items = whatsOn(this.options);
    paintBill(this.billCanvas, items);
    paintAd(this.adCanvas, items[0]?.title === 'GRAND FLEA FAIR' ? items[0] : items.find((i) => i.title === 'GRAND FLEA FAIR') ?? null);
    this.bill.needsUpdate = true;
    this.ad.needsUpdate = true;
  }
}

/** The column's bill: WHAT'S ON over each item, TODAY ones on red. */
function paintBill(canvas: HTMLCanvasElement, items: readonly WhatsOnItem[]): void {
  const ctx = canvas.getContext('2d')!;
  const { w, h } = BILL_CANVAS;
  ctx.fillStyle = '#f2ead2';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1a2a4a';
  ctx.fillRect(0, 0, w, 86);
  ctx.fillStyle = '#f0c94a';
  ctx.font = 'bold 56px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText("WHAT'S ON", w / 2, 46);
  const rowH = (h - 100) / Math.max(1, items.length);
  items.forEach((item, i) => {
    const y = 100 + i * rowH;
    ctx.fillStyle = item.today ? '#c8281e' : '#2a3a52';
    ctx.fillRect(24, y + 6, w - 48, 52);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(item.today ? `TODAY · ${item.title}` : item.title, w / 2, y + 33, w - 70);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '22px sans-serif';
    wrap(ctx, item.line, w / 2, y + 84, w - 80, 26);
  });
}

/** The shelter's lit poster: the Grand Flea Fair and when. */
function paintAd(canvas: HTMLCanvasElement, fair: WhatsOnItem | null): void {
  const ctx = canvas.getContext('2d')!;
  const { w, h } = AD_CANVAS;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2a1f4a');
  g.addColorStop(1, '#ff2fa0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23a';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.fillText('GRAND', w / 2, 70);
  ctx.fillText('FLEA FAIR', w / 2, 116, w - 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('RETRO · CARTS · CONSOLES', w / 2, 170);
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillStyle = fair?.today ? '#5fe6ff' : '#ffffff';
  wrap(ctx, fair?.line ?? 'The Old Market Hall', w / 2, 220, w - 30, 28);
  ctx.fillStyle = '#5fe6ff';
  for (let i = 0; i < 6; i++) ctx.fillRect(40 + i * 30, 320, 20, 34);
}

/** Text wrapped to `width`, centred on x, from y down. */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number): void {
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else line = next;
  }
  if (line) ctx.fillText(line, x, y);
}
