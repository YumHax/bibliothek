import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { PIXEL_FONT, drawText } from './games/ArcadeGame';
import { repaintWhenFontLoads } from '@/graphics/fontReady';
import { paintMarquee } from './machineParts';
import { lcg } from '@/random';

/*
 * The upright cabinet's print, painted once per cabinet on canvases: the marquee, the side art
 * (with the stickers of its life in the hall) and the control panel's worn laminate. Pure painters.
 */

/** The marquee: the title on the cabinet's colour swept into its glow, dark bands top and bottom. */
export function paintCabinetMarquee(title: string, color: number, glow: number): THREE.CanvasTexture {
  const base = `#${new THREE.Color(color).getHexString()}`;
  const bright = `#${new THREE.Color(glow).getHexString()}`;
  return paintMarquee(title, {
    height: 128,
    stops: [base, bright],
    diagonal: true,
    ink: '#fffbe6',
    size: title.length > 11 ? 36 : 44,
    textY: 66,
    decorate: (ctx, width, height) => {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, width, 10);
      ctx.fillRect(0, height - 10, width, 10);
    },
  });
}

/**
 * The bezel's print round the tube: black, a frame in the cabinet's glow just outside the glass, a
 * thinner one in its colour, stars in the corners, the title small along the top border and
 * "1 PLAYER" (and "2 PLAYERS" on a two-player game) along the bottom one. Sized to the bezel's
 * front (0.64 x 0.555 m, the 0.58 x 0.435 m glass in its middle).
 */
export function paintBezel(title: string, color: number, glow: number, twoPlayer: boolean): THREE.CanvasTexture {
  const W = 512;
  const H = 444;
  const [canvas, ctx] = createCanvas(W, H);
  // The glass's opening, in pixels (the border is 0.06 m of the 0.64 / 0.555 m face).
  const bx = Math.round((0.03 / 0.64) * W);
  const by = Math.round((0.06 / 0.555) * H);
  const bright = `#${new THREE.Color(glow).getHexString()}`;
  const base = `#${new THREE.Color(color).getHexString()}`;
  const paint = (): void => {
    ctx.fillStyle = '#121216';
    ctx.fillRect(0, 0, W, H);
    // A faint sheen down the print, so the slab reads as glossy card under the glass.
    const sheen = ctx.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.04)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, W, H);
    // The frames round the opening.
    ctx.strokeStyle = bright;
    ctx.lineWidth = 6;
    ctx.strokeRect(bx - 8, by - 8, W - 2 * bx + 16, H - 2 * by + 16);
    ctx.strokeStyle = base;
    ctx.lineWidth = 3;
    ctx.strokeRect(bx - 16, by - 16, W - 2 * bx + 32, H - 2 * by + 32);
    // Stars in the corners.
    for (const [x, y] of [[bx * 0.5 + 2, by * 0.5], [W - bx * 0.5 - 2, by * 0.5], [bx * 0.5 + 2, H - by * 0.5], [W - bx * 0.5 - 2, H - by * 0.5]] as const) {
      ctx.fillStyle = bright;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const d = i % 2 ? 4 : 9;
        ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      ctx.fill();
    }
    drawText(ctx, title, W / 2, by * 0.42, 16, '#fffbe6');
    drawText(ctx, twoPlayer ? '1 PLAYER  ·  2 PLAYERS' : '1 PLAYER', W / 2, H - by * 0.42, 12, bright);
  };
  paint();
  const texture = toTexture(canvas, 'facing');
  repaintWhenFontLoads(`16px ${PIXEL_FONT}`, () => {
    paint();
    texture.needsUpdate = true;
  });
  return texture;
}

/** The stickers people slap on cabinets: a smiley, a star, a band's name, a 1UP, a heart. */
const STICKERS = ['smiley', 'star', 'band', '1up', 'heart', 'skate'] as const;

/**
 * The printed side panel: the cabinet's colour with the game's glow swept across it as a pair of
 * curved bands, a scatter of stars, a darker band at the bottom. The `upper` body's swoosh rises
 * towards the front top; the `base` gets the tail of it and the kick band. Mirrored on the other
 * side, as printed side art is. `wear` adds the life it has had: stickers (some half peeled) and
 * scuffs where shoes and hips go.
 */
export function paintSideArt(color: number, glow: number, part: 'base' | 'upper', wear: number): THREE.CanvasTexture {
  const W = 256;
  const H = part === 'base' ? 288 : 352;
  const [canvas, ctx] = createCanvas(W, H);
  const base = new THREE.Color(color);
  const bright = new THREE.Color(glow);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, W, H);
  // A vertical shade: darker at the bottom, so the tall side does not read as one flat plane.
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(255,255,255,0.06)');
  shade.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round';
  const band = (offset: number, width: number, alpha: number): void => {
    ctx.strokeStyle = `rgba(${Math.round(bright.r * 255)},${Math.round(bright.g * 255)},${Math.round(bright.b * 255)},${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    if (part === 'upper') {
      ctx.moveTo(-20, H * 0.95 + offset);
      ctx.bezierCurveTo(W * 0.3, H * 0.9 + offset, W * 0.55, H * 0.35 + offset, W + 20, H * 0.05 + offset);
    } else {
      ctx.moveTo(-20, H * 0.4 + offset);
      ctx.bezierCurveTo(W * 0.4, H * 0.5 + offset, W * 0.7, H * 0.2 + offset, W + 20, -H * 0.3 + offset);
    }
    ctx.stroke();
  };
  band(0, 26, 0.9);
  band(38, 10, 0.55);
  band(-30, 6, 0.35);
  // Stars.
  const random = lcg(color ^ glow ^ (part === 'base' ? 0x55 : 0xaa));
  for (let i = 0; i < (part === 'upper' ? 26 : 12); i++) {
    const x = random() * W;
    const y = random() * H;
    const r = 1 + random() * 2.5;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + random() * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (part === 'base') {
    // The kick band and a thin glow line above it.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, H - 28, W, 28);
    ctx.fillStyle = `#${bright.getHexString()}`;
    ctx.fillRect(0, H - 32, W, 3);
    // Scuffs from shoes along the bottom.
    for (let i = 0; i < Math.round(wear * 14); i++) {
      ctx.strokeStyle = `rgba(20,16,14,${0.2 + random() * 0.3})`;
      ctx.lineWidth = 1 + random() * 2;
      const x = random() * W;
      const y = H - 40 - random() * 50;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 10 + random() * 30, y + (random() - 0.5) * 6);
      ctx.stroke();
    }
  }
  // Stickers, at hand height on the base and anywhere on the upper body.
  const stickers = Math.round(wear * (part === 'upper' ? 3 : 2) + random() * 1.2);
  for (let i = 0; i < stickers; i++) {
    const kind = STICKERS[Math.floor(random() * STICKERS.length)]!;
    const x = W * (0.15 + random() * 0.7);
    const y = part === 'base' ? H * (0.15 + random() * 0.4) : H * (0.2 + random() * 0.6);
    drawSticker(ctx, kind, x, y, 18 + random() * 12, (random() - 0.5) * 0.6, random() < wear * 0.5);
  }
  // A worn edge: the print rubbed at the front corner, where hands and hips go.
  const rub = ctx.createRadialGradient(0, H * 0.6, 0, 0, H * 0.6, W * 0.5);
  rub.addColorStop(0, `rgba(255,255,255,${0.06 + wear * 0.1})`);
  rub.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rub;
  ctx.fillRect(0, 0, W, H);
  return toTexture(canvas, 'facing');
}

/** One sticker at (x, y), `r` its half size, turned by `angle`; `peeled` folds a corner back. */
function drawSticker(ctx: CanvasRenderingContext2D, kind: (typeof STICKERS)[number], x: number, y: number, r: number, angle: number, peeled: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 2;
  switch (kind) {
    case 'smiley':
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-r * 0.4, -r * 0.35, r * 0.18, r * 0.3);
      ctx.fillRect(r * 0.22, -r * 0.35, r * 0.18, r * 0.3);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.arc(0, r * 0.05, r * 0.55, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      break;
    case 'star':
      ctx.fillStyle = '#ff2fa0';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const d = i % 2 ? r * 0.45 : r;
        ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
      }
      ctx.fill();
      break;
    case 'band':
      ctx.fillStyle = '#111';
      ctx.fillRect(-r * 1.4, -r * 0.5, r * 2.8, r);
      ctx.shadowBlur = 0;
      drawText(ctx, 'RIOT', 0, 0, Math.round(r * 0.7), '#e8e8e8');
      break;
    case '1up':
      ctx.fillStyle = '#33e0ff';
      ctx.fillRect(-r, -r * 0.6, r * 2, r * 1.2);
      ctx.shadowBlur = 0;
      drawText(ctx, '1UP', 0, 0, Math.round(r * 0.7), '#10263a');
      break;
    case 'heart':
      ctx.fillStyle = '#e8303a';
      ctx.beginPath();
      ctx.moveTo(0, r * 0.8);
      ctx.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.35);
      ctx.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.3, -r * 0.1, 0, r * 0.8);
      ctx.fill();
      break;
    case 'skate':
      ctx.fillStyle = '#7ee787';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.3, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      drawText(ctx, 'SK8', 0, 0, Math.round(r * 0.6), '#12301a');
      break;
  }
  if (peeled) {
    // The corner lifting: its paper back shows, a shadow under it.
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f2efe6';
    ctx.beginPath();
    ctx.moveTo(r * 0.5, -r * 0.9);
    ctx.lineTo(r * 1.0, -r * 0.9);
    ctx.lineTo(r * 1.0, -r * 0.4);
    ctx.fill();
  }
  ctx.restore();
}

/** The control panel's surface: black laminate, rubbed shiny where the hands go, with cigarette burns and scratches from a life in the hall. */
export function paintPanel(seed: number, wear: number): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(0, 0, W, H);
  const random = lcg(seed ^ 0x3c3c);
  for (let i = 0; i < 2 + Math.round(wear * 3); i++) {
    const x = random() * W;
    const y = random() * H;
    const r = 3 + random() * 5;
    const burn = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
    burn.addColorStop(0, 'rgba(10,6,4,0.95)');
    burn.addColorStop(0.45, 'rgba(70,40,20,0.7)');
    burn.addColorStop(1, 'rgba(70,40,20,0)');
    ctx.fillStyle = burn;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.8, r * 1.2, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < Math.round(wear * 25); i++) {
    ctx.strokeStyle = `rgba(200,200,210,${0.05 + random() * 0.12})`;
    ctx.lineWidth = 1;
    const x = random() * W;
    const y = random() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 40, y + (random() - 0.5) * 12);
    ctx.stroke();
  }
  return toTexture(canvas, 'facing');
}
