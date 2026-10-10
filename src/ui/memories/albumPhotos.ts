import { seededRng } from '@/random';

/*
 * The album's prints when no still was taken this session (a memory seen before a reload, `MemoryProjector.still`):
 * an old sepia snapshot drawn on a canvas, a few soft shapes of what the memory is about (the tree, the shelves, the
 * cabinet…), a faded vignette, a grain. Drawn once per memory and kept.
 */

const SIZE = { w: 360, h: 270 } as const;
/** The print's browns, from the shadows to the paper's light. */
const SEPIA = ['#2e2117', '#5a4330', '#8a6a4a', '#b8966c', '#e2cba2'] as const;

type Painter = (ctx: CanvasRenderingContext2D) => void;

/** A soft shape: filled in sepia tone `tone`, blurred a little so it reads as an old print, not a drawing. */
function shape(ctx: CanvasRenderingContext2D, tone: number, draw: () => void, blur = 2): void {
  ctx.save();
  ctx.filter = `blur(${blur}px)`;
  ctx.fillStyle = SEPIA[tone]!;
  ctx.beginPath();
  draw();
  ctx.fill();
  ctx.restore();
}

/** A person, seen from across the room: a head and shoulders (`h` tall, feet at `y`). */
function figure(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, tone = 0): void {
  shape(ctx, tone, () => {
    ctx.ellipse(x, y - h + h * 0.12, h * 0.12, h * 0.13, 0, 0, Math.PI * 2);
    ctx.roundRect(x - h * 0.2, y - h * 0.74, h * 0.4, h * 0.74, h * 0.12);
  });
}

const MOTIFS: Record<string, Painter> = {
  // The tree in the corner, the two armchairs, the child on the rug.
  christmas95: (ctx) => {
    shape(ctx, 1, () => {
      ctx.moveTo(70, 40);
      ctx.lineTo(130, 200);
      ctx.lineTo(10, 200);
    });
    figure(ctx, 210, 210, 110, 1);
    figure(ctx, 300, 210, 120, 0);
    figure(ctx, 130, 230, 60, 0);
  },
  // Félix's shelves, floor to ceiling, the child on the floor before the set.
  wednesdays: (ctx) => {
    for (let x = 20; x < 340; x += 80) shape(ctx, 1, () => ctx.rect(x, 20, 64, 200));
    shape(ctx, 0, () => ctx.rect(150, 160, 70, 50));
    figure(ctx, 185, 255, 60, 0);
  },
  // A cabinet's glowing screen, the teenager and Félix before it.
  arcade: (ctx) => {
    shape(ctx, 0, () => ctx.rect(120, 30, 120, 220));
    shape(ctx, 4, () => ctx.rect(140, 60, 80, 60), 4);
    figure(ctx, 150, 260, 120, 1);
    figure(ctx, 240, 260, 150, 0);
  },
  // The table, two men either side of it.
  row: (ctx) => {
    shape(ctx, 1, () => ctx.rect(80, 170, 200, 20));
    figure(ctx, 90, 250, 150, 0);
    figure(ctx, 270, 250, 150, 0);
  },
  // A door ajar, a bag at the feet.
  leaving: (ctx) => {
    shape(ctx, 4, () => ctx.rect(200, 20, 90, 240), 3);
    shape(ctx, 1, () => ctx.rect(110, 200, 60, 50));
    figure(ctx, 160, 260, 160, 0);
  },
  // Rows of chairs before a rostrum.
  sale: (ctx) => {
    shape(ctx, 1, () => ctx.rect(140, 60, 80, 60));
    for (let row = 0; row < 3; row++) for (let x = 30 + row * 10; x < 340; x += 50) shape(ctx, 0, () => ctx.rect(x, 170 + row * 30, 30, 22));
  },
  // A ring of keys held out.
  keys: (ctx) => {
    shape(ctx, 1, () => ctx.ellipse(170, 140, 70, 40, 0.3, 0, Math.PI * 2));
    shape(ctx, 0, () => {
      ctx.arc(200, 120, 20, 0, Math.PI * 2);
      ctx.rect(215, 116, 90, 10);
    });
  },
};

/** A window's light, for a memory with no motif of its own. */
const ANY: Painter = (ctx) => {
  shape(ctx, 4, () => ctx.rect(140, 40, 90, 120), 6);
  figure(ctx, 120, 260, 150, 0);
};

const drawn = new Map<string, string>();

/** The print of memory `id`, drawn (a data URL), or '' where the browser draws no canvas. */
export function drawnPrint(id: string): string {
  const cached = drawn.get(id);
  if (cached !== undefined) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE.w;
  canvas.height = SIZE.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  // The room's light: brighter high on the left, as a window would.
  const light = ctx.createLinearGradient(0, 0, SIZE.w, SIZE.h);
  light.addColorStop(0, SEPIA[4]);
  light.addColorStop(1, SEPIA[2]);
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, SIZE.w, SIZE.h);
  ctx.globalAlpha = 0.8;
  (MOTIFS[id] ?? ANY)(ctx);
  ctx.globalAlpha = 1;
  // The corners gone dark, as a print's do.
  const vignette = ctx.createRadialGradient(SIZE.w / 2, SIZE.h / 2, SIZE.h * 0.3, SIZE.w / 2, SIZE.h / 2, SIZE.w * 0.65);
  vignette.addColorStop(0, 'rgba(46, 33, 23, 0)');
  vignette.addColorStop(1, 'rgba(46, 33, 23, 0.65)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, SIZE.w, SIZE.h);
  // A grain, the same for every print of this memory.
  const grain = seededRng(`album-print-${id}`);
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = grain() < 0.5 ? 'rgba(255, 240, 210, 0.08)' : 'rgba(30, 20, 10, 0.1)';
    ctx.fillRect(grain() * SIZE.w, grain() * SIZE.h, 1.5, 1.5);
  }
  const url = canvas.toDataURL('image/jpeg', 0.8);
  drawn.set(id, url);
  return url;
}
