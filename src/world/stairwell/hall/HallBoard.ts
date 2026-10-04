import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Today } from '@/time/Today';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { notesOn, onBoardChange, type BoardNote } from '@/building/boardNotes';
import { Prop, part } from '../../props/Prop';
import { timber } from '../../materials/palette';
import { invisibleHitbox } from '../../meshUtils';
import { dayLcg } from '@/time/daily';

const PX_PER_M = 900;
const FRAME = 0.03;
/** At most this many notes fit on the cork; the rest wait under them (the card still reads them all). */
const MAX_SHOWN = 6;
const PINS = ['#c83a3a', '#2f6b8f', '#e6a83a', '#3a9a5a', '#7a3a8a'];

/**
 * The building's notice board in the entrance hall: a cork board in an oak frame, with what every feature pinned for
 * today (`building/boardNotes`: the co-owners' meeting's agenda and minutes, the estate sale, a flat for sale, the
 * neighbours' party, a power cut, a clue...), repainted on a new game day and whenever a note changes. Clicked, the
 * notes are read on a card. Wall-hung: origin at its middle, +z into the hall.
 */
export class HallBoard extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly frameMaterial = timber(0x6a4a2a, 0.55);
  private readonly unsubscribe: Array<() => void> = [];

  constructor(
    private readonly today: Today,
    width: number,
    height: number,
  ) {
    super();
    this.name = 'HallBoard';
    const w = width - 2 * FRAME;
    const h = height - 2 * FRAME;
    part(this, width, FRAME, 0.025, this.frameMaterial, { y: height / 2 - FRAME / 2, z: 0.0125 });
    part(this, width, FRAME, 0.025, this.frameMaterial, { y: -height / 2 + FRAME / 2, z: 0.0125 });
    for (const sx of [-1, 1]) part(this, FRAME, height - 2 * FRAME, 0.025, this.frameMaterial, { x: (sx * (width - FRAME)) / 2, z: 0.0125 });
    [this.canvas, this.ctx] = createCanvas(Math.round(w * PX_PER_M), Math.round(h * PX_PER_M));
    this.texture = toTexture(this.canvas);
    const cork = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.95 }));
    cork.position.z = 0.014;
    this.add(cork);
    const hit = invisibleHitbox(width, height, 0.06, { z: 0.03 });
    this.add(hit);
    this.hitboxes = [hit];
    this.traverse((o) => (o.castShadow = false));
    this.paint();
    this.unsubscribe.push(onBoardChange(() => this.paint()), today.onNewGameDay(() => this.paint()));
  }

  setHovered(): void {}

  label(): string {
    return 'Notice board · read';
  }

  activate(session: SessionActions): void {
    const notes = notesOn(this.today.gameDay);
    if (!notes.length) {
      session.react('Old drawing pins, and the ghost of a notice.');
      return;
    }
    const text = notes.map((n) => [n.title.toUpperCase(), ...n.lines, n.signed ? `— ${n.signed}` : ''].filter(Boolean).join('\n')).join('\n\n');
    session.read({ title: 'The notice board', text, look: 'note' });
    for (const note of notes) note.onRead?.();
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
  }

  /** The cork, then today's notes on it, each a little askew with a pin. */
  private paint(): void {
    const { canvas, ctx } = this;
    const W = canvas.width;
    const H = canvas.height;
    const random = dayLcg(this.today.gameDay * 7919 + 13);
    ctx.fillStyle = '#b48a5a';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = random() < 0.5 ? 'rgba(90,60,30,0.25)' : 'rgba(220,190,140,0.25)';
      ctx.fillRect(random() * W, random() * H, 1 + random() * 2, 1 + random() * 2);
    }
    const notes = notesOn(this.today.gameDay).slice(0, MAX_SHOWN);
    const columns = 3;
    const rows = Math.max(1, Math.ceil(notes.length / columns));
    const cellW = W / columns;
    const cellH = H / Math.max(rows, 2);
    notes.forEach((note, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      this.note(note, col * cellW + cellW / 2, row * cellH + cellH / 2, cellW * 0.86, cellH * 0.86, random);
    });
    this.texture.needsUpdate = true;
  }

  private note(note: BoardNote, cx: number, cy: number, w: number, h: number, random: () => number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((random() - 0.5) * 0.08);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-w / 2 + 4, -h / 2 + 5, w, h);
    ctx.fillStyle = `#${(note.paper ?? 0xfbf8f0).toString(16).padStart(6, '0')}`;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#1e1c1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const titleSize = Math.round(h * 0.085);
    ctx.font = `bold ${titleSize}px Georgia, serif`;
    let y = -h / 2 + h * 0.08;
    for (const line of wrap(ctx, note.title.toUpperCase(), w * 0.88)) {
      ctx.fillText(line, 0, y, w * 0.9);
      y += titleSize * 1.15;
    }
    y += titleSize * 0.4;
    const size = Math.round(h * 0.062);
    ctx.font = `${size}px Georgia, serif`;
    for (const text of note.lines) {
      for (const line of wrap(ctx, text, w * 0.88)) {
        if (y > h / 2 - size * 2.2) break;
        ctx.fillText(line, 0, y, w * 0.9);
        y += size * 1.2;
      }
    }
    if (note.signed) {
      ctx.font = `italic ${size}px Georgia, serif`;
      ctx.fillText(note.signed, 0, h / 2 - size * 1.6, w * 0.9);
    }
    ctx.fillStyle = PINS[Math.floor(random() * PINS.length)]!;
    ctx.beginPath();
    ctx.arc(0, -h / 2 + 10, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** `text` cut into lines no wider than `width` at the context's font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
