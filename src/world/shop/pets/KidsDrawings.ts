import * as THREE from 'three';
import { Prop } from '../../props/Prop';
import { WALL, onSurface } from '../../surface/layers';
import { createCanvas, seededRandom, toTexture } from '@/graphics/canvas';
import { HAND } from '../common/lettering';

export interface KidsDrawingsOptions {
  /** Metres between two sheets' centres. Default 0.26. */
  gap?: number;
  seed?: number;
}

type Subject = 'cat' | 'fish' | 'dog' | 'bird';
/** The drawings, left to right: what is drawn, the name written under it. */
const SHEETS: readonly { subject: Subject; name: string; paper: string }[] = [
  { subject: 'cat', name: 'MY CAT MIMI - Lily 6', paper: '#fdfbf4' },
  { subject: 'fish', name: 'the fishes!!', paper: '#fff6d8' },
  { subject: 'dog', name: 'Rex by Tom', paper: '#fdfbf4' },
  { subject: 'bird', name: 'I LOVE PAWS & CLAWS', paper: '#e8f4ff' },
];
const SHEET = { w: 0.21, h: 0.16 };
const PX = { w: 420, h: 320 };
const CRAYONS = ['#e8402e', '#2e6ab8', '#3a9a4a', '#f0b020', '#8a3aa8', '#e86a2a', '#2a2622'];

/**
 * Children's crayon drawings taped up in a row (a cat, the fish, a dog in the sun, a bird, each signed in a child's
 * hand): what the pet shop's young customers bring back. One canvas for the row, each sheet a patch of it; strips of
 * tape at the corners, each a little askew. Static: its parts merge. Wall-hung: origin at the row's middle on the
 * wall, +z into the room. Decoration: never collides.
 */
export class KidsDrawings extends Prop {
  constructor(options: KidsDrawingsOptions = {}) {
    super();
    this.name = 'KidsDrawings';
    const random = seededRandom(options.seed ?? 83);
    const gap = options.gap ?? 0.26;
    const material = onSurface(new THREE.MeshStandardMaterial({ map: paintSheets(random), roughness: 0.9 }), WALL.paper);
    SHEETS.forEach((_, i) => {
      const g = new THREE.PlaneGeometry(SHEET.w, SHEET.h);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / SHEETS.length);
      const sheet = new THREE.Mesh(g, material);
      sheet.position.set((i - (SHEETS.length - 1) / 2) * gap, (random() - 0.5) * 0.05, WALL.paper.lift);
      sheet.rotation.z = (random() - 0.5) * 0.12;
      sheet.receiveShadow = true;
      this.add(sheet);
    });
  }
}

function paintSheets(random: () => number): THREE.Texture {
  const [canvas, ctx] = createCanvas(PX.w * SHEETS.length, PX.h);
  SHEETS.forEach((sheet, i) => {
    const x0 = i * PX.w;
    ctx.fillStyle = sheet.paper;
    ctx.fillRect(x0, 0, PX.w, PX.h);
    ctx.save();
    ctx.translate(x0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    draw(ctx, sheet.subject, random);
    ctx.fillStyle = CRAYONS[Math.floor(random() * CRAYONS.length)]!;
    ctx.font = `600 28px ${HAND}`;
    ctx.textAlign = 'center';
    ctx.fillText(sheet.name, PX.w / 2, PX.h - 22);
    // The tape at the top corners.
    ctx.fillStyle = 'rgba(240,232,200,0.8)';
    for (const cx of [26, PX.w - 26]) {
      ctx.save();
      ctx.translate(cx, 14);
      ctx.rotate((random() - 0.5) * 0.6);
      ctx.fillRect(-24, -9, 48, 18);
      ctx.restore();
    }
    ctx.restore();
  });
  return toTexture(canvas);
}

/** A child's crayon picture of `subject`, in the sheet's own pixels. */
function draw(ctx: CanvasRenderingContext2D, subject: Subject, random: () => number): void {
  const crayon = (c: string): void => {
    ctx.strokeStyle = c;
    ctx.fillStyle = c;
  };
  const wobblyCircle = (cx: number, cy: number, r: number): void => {
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.3) {
      const rr = r * (0.94 + random() * 0.12);
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.stroke();
  };
  // A sun in the corner of most of them, and green scribble for the ground.
  crayon('#f0b020');
  wobblyCircle(PX.w - 60, 60, 28);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(PX.w - 60 + Math.cos(a) * 36, 60 + Math.sin(a) * 36);
    ctx.lineTo(PX.w - 60 + Math.cos(a) * 50, 60 + Math.sin(a) * 50);
    ctx.stroke();
  }
  if (subject !== 'fish') {
    crayon('#3a9a4a');
    ctx.beginPath();
    for (let x = 10; x < PX.w - 10; x += 14) {
      ctx.moveTo(x, 250);
      ctx.lineTo(x + 6, 232 + random() * 8);
    }
    ctx.stroke();
  }
  if (subject === 'cat') {
    crayon('#e86a2a');
    wobblyCircle(190, 170, 60);
    wobblyCircle(190, 90, 38);
    ctx.beginPath();
    ctx.moveTo(162, 70);
    ctx.lineTo(166, 38);
    ctx.lineTo(184, 58);
    ctx.moveTo(200, 56);
    ctx.lineTo(218, 38);
    ctx.lineTo(220, 70);
    ctx.moveTo(250, 190);
    ctx.quadraticCurveTo(310, 180, 300, 110);
    ctx.stroke();
    crayon('#2a2622');
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(190 + s * 14, 88);
      ctx.arc(190 + s * 14, 88, 4, 0, Math.PI * 2);
      ctx.moveTo(190 + s * 10, 104);
      ctx.lineTo(190 + s * 50, 98);
      ctx.moveTo(190 + s * 10, 108);
      ctx.lineTo(190 + s * 48, 114);
    }
    ctx.stroke();
  } else if (subject === 'fish') {
    crayon('#2e6ab8');
    ctx.lineWidth = 5;
    for (let y = 40; y < 260; y += 28) {
      ctx.beginPath();
      for (let x = 10; x < PX.w - 10; x += 20) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 5);
      ctx.stroke();
    }
    ctx.lineWidth = 7;
    for (const [fx, fy, c] of [[130, 120, '#e8402e'], [280, 190, '#f0b020'], [200, 230, '#8a3aa8']] as const) {
      crayon(c);
      ctx.beginPath();
      ctx.ellipse(fx, fy, 42, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(fx - 40, fy);
      ctx.lineTo(fx - 70, fy - 22);
      ctx.lineTo(fx - 70, fy + 22);
      ctx.closePath();
      ctx.fill();
      crayon('#2a2622');
      ctx.beginPath();
      ctx.arc(fx + 22, fy - 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (subject === 'dog') {
    crayon('#8a5a2a');
    ctx.beginPath();
    ctx.ellipse(190, 180, 80, 40, 0, 0, Math.PI * 2);
    ctx.stroke();
    wobblyCircle(290, 130, 36);
    ctx.beginPath();
    for (const lx of [135, 165, 215, 245]) {
      ctx.moveTo(lx, 212);
      ctx.lineTo(lx, 244);
    }
    ctx.moveTo(110, 170);
    ctx.lineTo(80, 140);
    ctx.moveTo(270, 104);
    ctx.lineTo(262, 150);
    ctx.stroke();
    crayon('#2a2622');
    ctx.beginPath();
    ctx.arc(300, 124, 4, 0, Math.PI * 2);
    ctx.arc(322, 136, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    crayon('#3a9ad8');
    ctx.beginPath();
    ctx.ellipse(180, 160, 60, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    wobblyCircle(245, 118, 26);
    crayon('#f0b020');
    ctx.beginPath();
    ctx.moveTo(268, 116);
    ctx.lineTo(292, 124);
    ctx.lineTo(268, 130);
    ctx.fill();
    crayon('#e8402e');
    ctx.font = `700 60px ${HAND}`;
    ctx.fillText('♥', 90, 90);
  }
}
