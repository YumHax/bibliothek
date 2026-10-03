import type { Game } from '@/catalog/types';
import type { BoxArtUrls, CoverArtProvider } from '@/covers/CoverArtProvider';
import { createCanvas, seededRandom } from '@/graphics/canvas';
import { COMPOSER, PROTOTYPE_ID, STUDIO } from './prototype';

/*
 * The prototype's look, painted here since no scan of it exists anywhere: a plain white mailer box
 * written on in marker, an INTERNAL stamp, a typed note taped on the back, the spine labelled by hand,
 * and the cart itself, a grey shell with a sticker label in biro. Data URLs, first in both art chains
 * (`createBoxArtLoader`), so nothing is asked of the network for it.
 */

const MARKER = `'Permanent Marker', 'Comic Sans MS', cursive`;
const HAND = `'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive`;
const TYPED = `'Courier New', ui-monospace, monospace`;

/** Answers for the prototype only; every other game is left to the next providers. */
export class PrototypeArtProvider implements CoverArtProvider {
  readonly id = 'prototype';
  private urls: Promise<BoxArtUrls> | null = null;

  getBoxArt(game: Game): Promise<BoxArtUrls> | null {
    if (game.id !== PROTOTYPE_ID) return null;
    this.urls ??= paint();
    return this.urls;
  }
}

/** Whether `game` is the one this provider paints (the libretro and LaunchBox lookups skip it). */
export const isPrototype = (game: Pick<Game, 'id'>): boolean => game.id === PROTOTYPE_ID;

/** Wraps a provider so it never looks the prototype up (no 404s, no LaunchBox search for an invented game). */
export function skippingPrototype(provider: CoverArtProvider): CoverArtProvider {
  return { id: provider.id, getBoxArt: (game) => (isPrototype(game) ? null : provider.getBoxArt(game)) };
}

async function paint(): Promise<BoxArtUrls> {
  try {
    await Promise.race([Promise.all([document.fonts.load(`40px ${MARKER}`)]), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    // The fallback faces will do.
  }
  return { front: front(), back: back(), spine: spine(), cart: cart() };
}

/** Cardboard white with a little grain and scuffing, the same on every face. */
function board(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  ctx.fillStyle = '#ece8df';
  ctx.fillRect(0, 0, w, h);
  const random = seededRandom(seed);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(90, 80, 60, ${0.02 + random() * 0.05})`;
    ctx.fillRect(random() * w, random() * h, 1 + random() * 3, 1);
  }
  ctx.strokeStyle = 'rgba(120, 105, 80, 0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    const x = random() * w;
    const y = random() * h;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 60, y + (random() - 0.5) * 20);
    ctx.stroke();
  }
}

function front(): string {
  const [canvas, ctx] = createCanvas(512, 720);
  board(ctx, 512, 720, 7);
  ctx.save();
  ctx.translate(256, 250);
  ctx.rotate(-0.06);
  ctx.fillStyle = '#1d2a6b';
  ctx.font = `92px ${MARKER}`;
  ctx.textAlign = 'center';
  ctx.fillText('MOONPOST', 0, 0);
  ctx.font = `44px ${MARKER}`;
  ctx.fillText('v0.9 — NES', 0, 70);
  ctx.restore();
  // A crescent moon with an envelope, doodled.
  ctx.strokeStyle = '#1d2a6b';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(256, 450, 70, 0.6 * Math.PI, 1.9 * Math.PI);
  ctx.arc(286, 440, 58, 1.8 * Math.PI, 0.7 * Math.PI, true);
  ctx.stroke();
  ctx.strokeRect(300, 470, 70, 46);
  ctx.beginPath();
  ctx.moveTo(300, 470);
  ctx.lineTo(335, 498);
  ctx.lineTo(370, 470);
  ctx.stroke();
  // The red INTERNAL stamp, crooked.
  ctx.save();
  ctx.translate(256, 620);
  ctx.rotate(0.08);
  ctx.strokeStyle = 'rgba(178, 34, 34, 0.85)';
  ctx.fillStyle = 'rgba(178, 34, 34, 0.85)';
  ctx.lineWidth = 5;
  ctx.strokeRect(-170, -38, 340, 76);
  ctx.font = `bold 34px ${TYPED}`;
  ctx.textAlign = 'center';
  ctx.fillText('INTERNAL · NFS', 0, 0);
  ctx.font = `bold 18px ${TYPED}`;
  ctx.fillText(STUDIO.toUpperCase(), 0, 26);
  ctx.restore();
  ctx.fillStyle = '#3a3a3a';
  ctx.font = `26px ${HAND}`;
  ctx.textAlign = 'left';
  ctx.fillText('do not sell!!', 40, 80);
  return canvas.toDataURL('image/png');
}

function back(): string {
  const [canvas, ctx] = createCanvas(512, 720);
  board(ctx, 512, 720, 11);
  // A typed note on a piece of paper, two strips of yellowed tape.
  ctx.save();
  ctx.translate(256, 330);
  ctx.rotate(0.03);
  ctx.fillStyle = '#fbf8f0';
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 8;
  ctx.fillRect(-190, -210, 380, 420);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#222';
  ctx.font = `20px ${TYPED}`;
  const lines = ['BUILD 0.9  -  03/12/93', '', 'For lot check (if we', 'still have a publisher).', '', 'Levels 1-3 done.', 'Music: final (Hana).', 'Ending: placeholder.', '', 'Known bugs: the moon', 'is too big. Leave it.'];
  lines.forEach((l, i) => ctx.fillText(l, -165, -165 + i * 30));
  ctx.restore();
  ctx.fillStyle = 'rgba(222, 196, 120, 0.7)';
  ctx.save();
  ctx.translate(140, 128);
  ctx.rotate(-0.4);
  ctx.fillRect(-50, -14, 100, 28);
  ctx.restore();
  ctx.save();
  ctx.translate(380, 540);
  ctx.rotate(-0.35);
  ctx.fillRect(-50, -14, 100, 28);
  ctx.restore();
  ctx.fillStyle = '#1d2a6b';
  ctx.font = `30px ${MARKER}`;
  ctx.fillText(`${COMPOSER.initials} — keep`, 60, 650);
  return canvas.toDataURL('image/png');
}

function spine(): string {
  const [canvas, ctx] = createCanvas(96, 720);
  board(ctx, 96, 720, 13);
  ctx.save();
  ctx.translate(58, 360);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#1d2a6b';
  ctx.font = `46px ${MARKER}`;
  ctx.textAlign = 'center';
  ctx.fillText('MOONPOST proto', 0, 0);
  ctx.restore();
  return canvas.toDataURL('image/png');
}

/** The cart's front: the grey shell edge to edge, its ribs, and the sticker written in biro. */
function cart(): string {
  const W = 480;
  const H = 540;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#8f9093';
  ctx.fillRect(0, 0, W, H);
  // The ribbed grip at the bottom, and the shell's moulded frame.
  ctx.fillStyle = '#7d7e81';
  for (let i = 0; i < 9; i++) ctx.fillRect(40, H - 120 + i * 11, W - 80, 5);
  ctx.strokeStyle = 'rgba(60, 60, 64, 0.5)';
  ctx.lineWidth = 6;
  ctx.strokeRect(22, 22, W - 44, H - 44);
  // The label: a plain white sticker, a little crooked, written on.
  ctx.save();
  ctx.translate(W / 2, 200);
  ctx.rotate(-0.025);
  ctx.fillStyle = '#f6f3ea';
  ctx.fillRect(-180, -140, 360, 260);
  ctx.strokeStyle = 'rgba(80, 100, 160, 0.35)';
  ctx.lineWidth = 2;
  for (let y = -90; y < 110; y += 34) {
    ctx.beginPath();
    ctx.moveTo(-165, y);
    ctx.lineTo(165, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#1b2c8a';
  ctx.textAlign = 'center';
  ctx.font = `56px ${MARKER}`;
  ctx.fillText('MOONPOST', 0, -60);
  ctx.font = `30px ${HAND}`;
  ctx.fillText('v0.9  3/12/93', 0, -4);
  ctx.fillText('music FINAL', 0, 40);
  ctx.fillStyle = '#b22222';
  ctx.font = `bold 26px ${HAND}`;
  ctx.fillText('DO NOT SELL', 0, 92);
  ctx.restore();
  return canvas.toDataURL('image/png');
}
