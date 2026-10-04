import { pick } from '@/random';
/*
 * The walk-in shops as seen through their windows from the street (`ShopInteriors`' back walls): the same rooms one
 * walks into (`world/shop/`), painted flat on the back wall of the pane's room. The furniture shop's bed along the
 * back with the dresser and its mirror, the lamps lit, the prints hung salon-style; TV REPAIR's rack of sets all
 * showing snow and its shelf of boxed spares; PAWS & CLAWS' shelves of food and tins, the fish tank glowing on its
 * stand and the budgies' cage; the florist's stepped stand of zinc buckets, the pots on their shelf, plants hanging.
 */

/** The tile's scale: its size in pixels, the canvas x of metres along it, the canvas y of metres over the floor. */
interface WallArt {
  S: number;
  X: (m: number) => number;
  Y: (m: number) => number;
}

type Painter = (ctx: CanvasRenderingContext2D, art: WallArt, palette: readonly string[], random: () => number) => void;

/** The rooms' own walls (`SHOP_PLANS`' finishes), for the pane's side walls and floor. */
export const WALK_IN_ROOM_WALLS = { furniture: '#e8dcc8', electronics: '#c8ccc4', pets: '#e4ecd8', florist: '#eae4dc' } as const;

/** A rectangle from (x0, y0) to (x1, y1) in metres (x along, y up from the floor). */
function rect(ctx: CanvasRenderingContext2D, { X, Y }: WallArt, x0: number, y0: number, x1: number, y1: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1));
}

/** A lamp's glow: a soft round of light, then the lit shade over it. */
function lampGlow(ctx: CanvasRenderingContext2D, art: WallArt, x: number, y: number, radius: number): void {
  const cx = art.X(x);
  const cy = art.Y(y);
  const r = art.X(radius);
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  glow.addColorStop(0, 'rgba(255, 226, 170, 0.75)');
  glow.addColorStop(1, 'rgba(255, 226, 170, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

export const WALK_IN_WALLS: Record<keyof typeof WALK_IN_ROOM_WALLS, Painter> = {
  furniture: (ctx, art, palette, random) => {
    rect(ctx, art, 0, 0, 2.4, 3.3, WALK_IN_ROOM_WALLS.furniture);
    rect(ctx, art, 0, 0, 2.4, 0.1, '#6a5a48');
    // Prints hung salon-style over the bed.
    for (const [x, y, w, h] of [[0.15, 1.75, 0.35, 0.45], [0.6, 1.9, 0.5, 0.35], [0.62, 1.45, 0.25, 0.3], [0.95, 1.5, 0.22, 0.28], [1.25, 1.8, 0.3, 0.4]] as const) {
      rect(ctx, art, x, y, x + w, y + h, '#4a3624');
      rect(ctx, art, x + 0.03, y + 0.03, x + w - 0.03, y + h - 0.03, pick(random, palette));
    }
    // The bed along the back: its headboard, the bedding, a nightstand with a lamp lit.
    rect(ctx, art, 0.1, 0.1, 1.2, 1.1, '#5a3a22');
    rect(ctx, art, 0.08, 0.3, 1.22, 0.58, '#efe6d2');
    rect(ctx, art, 0.08, 0.3, 1.22, 0.45, pick(random, ['#6e7b8c', '#b84a3a', '#3f6b4f']));
    rect(ctx, art, 1.28, 0.1, 1.55, 0.6, '#7a5a3a');
    rect(ctx, art, 1.37, 0.6, 1.46, 0.78, '#e8e0cc');
    lampGlow(ctx, art, 1.415, 0.86, 0.3);
    rect(ctx, art, 1.32, 0.78, 1.51, 0.95, '#f4dca8');
    // The dresser and its mirror.
    rect(ctx, art, 1.65, 0.1, 2.3, 0.85, '#6a4a2e');
    for (let i = 0; i < 3; i++) rect(ctx, art, 1.69, 0.15 + i * 0.23, 2.26, 0.34 + i * 0.23, '#8a6a44');
    rect(ctx, art, 1.72, 1.0, 2.23, 1.75, '#4a3624');
    rect(ctx, art, 1.76, 1.04, 2.19, 1.71, '#a8b8c0');
    rect(ctx, art, 1.8, 1.4, 1.95, 1.68, 'rgba(255,255,255,0.35)');
    // A standard lamp lit at the end.
    rect(ctx, art, 2.33, 0.1, 2.35, 1.5, '#c9a24a');
    lampGlow(ctx, art, 2.34, 1.55, 0.35);
    rect(ctx, art, 2.24, 1.48, 2.44, 1.7, '#f4dca8');
  },
  electronics: (ctx, art, _palette, random) => {
    rect(ctx, art, 0, 0, 2.4, 3.3, '#b8bcb4');
    // The steel rack of sets, three rows, every screen in snow.
    for (const y of [0.3, 0.8, 1.3, 1.8]) rect(ctx, art, 0, y - 0.03, 1.65, y, '#5a5e62');
    for (const s of [0.02, 0.82, 1.62]) rect(ctx, art, s, 0, s + 0.03, 1.85, '#5a5e62');
    for (const y of [0.3, 0.8, 1.3]) {
      for (let x = 0.07; x < 1.5; ) {
        const w = 0.3 + random() * 0.14;
        const h = 0.26 + random() * 0.14;
        rect(ctx, art, x, y, x + w, y + h, pick(random, ['#5a5a5e', '#d8d2c4', '#2a2a2c', '#8a3a2a', '#6a6f74']));
        const sx0 = art.X(x + 0.04);
        const sx1 = art.X(x + w * 0.72);
        const sy0 = art.Y(y + h - 0.04);
        const sy1 = art.Y(y + 0.05);
        for (let py = sy0; py < sy1; py += 2) {
          for (let px = sx0; px < sx1; px += 2) {
            const g = 90 + Math.floor(random() * 150);
            ctx.fillStyle = `rgb(${g},${g},${g + 12})`;
            ctx.fillRect(px, py, 2, 2);
          }
        }
        x += w + 0.05;
      }
    }
    // The shelf of spares: boxes, a coil of cable.
    for (const y of [0.4, 0.9, 1.4, 1.9]) {
      rect(ctx, art, 1.75, y - 0.025, 2.4, y, '#c9a878');
      for (let x = 1.78; x < 2.34; ) {
        const w = 0.08 + random() * 0.1;
        rect(ctx, art, x, y, x + w, y + 0.08 + random() * 0.16, pick(random, ['#d8c8a0', '#b89a68', '#4a5a6e', '#e8e0d0', '#8a2a22']));
        x += w + 0.015;
      }
    }
    ctx.strokeStyle = '#2a2a2c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(art.X(2.05), art.Y(2.3), art.X(0.1), 0, Math.PI * 2);
    ctx.stroke();
    // A poster of valves on the wall above the rack.
    rect(ctx, art, 0.5, 2.15, 1.1, 2.75, '#efe6d2');
    for (let i = 0; i < 6; i++) rect(ctx, art, 0.56 + i * 0.09, 2.3, 0.6 + i * 0.09, 2.5 + random() * 0.15, '#e8762a');
  },
  pets: (ctx, art, palette, random) => {
    rect(ctx, art, 0, 0, 2.4, 3.3, WALK_IN_ROOM_WALLS.pets);
    // Shelves of food: sacks below, tins and boxes above.
    for (const [k, y] of [0.12, 0.54, 0.96, 1.38].entries()) {
      rect(ctx, art, 0, y - 0.025, 1.2, y, '#c9a878');
      for (let x = 0.03; x < 1.15; ) {
        const w = k === 0 ? 0.18 + random() * 0.05 : 0.06 + random() * 0.07;
        rect(ctx, art, x, y, x + w, y + (k === 0 ? 0.32 : 0.1 + random() * 0.14), pick(random, palette));
        x += w + 0.02;
      }
    }
    // The fish tank on its stand, glowing blue-green, weed and fish in it.
    rect(ctx, art, 1.35, 0, 2.15, 0.8, '#2f3a3a');
    rect(ctx, art, 1.35, 0.8, 2.15, 1.4, '#1e2626');
    const tank = ctx.createLinearGradient(0, art.Y(1.37), 0, art.Y(0.83));
    tank.addColorStop(0, '#7ad0e0');
    tank.addColorStop(1, '#2a7a90');
    ctx.fillStyle = tank;
    ctx.fillRect(art.X(1.38), art.Y(1.37), art.X(0.74), art.Y(0.83) - art.Y(1.37));
    for (let i = 0; i < 5; i++) rect(ctx, art, 1.45 + i * 0.14, 0.83, 1.47 + i * 0.14, 1.0 + random() * 0.25, '#3f8a4a');
    for (let i = 0; i < 6; i++) {
      const x = 1.42 + random() * 0.64;
      const y = 0.9 + random() * 0.4;
      rect(ctx, art, x, y, x + 0.04, y + 0.02, pick(random, ['#f09a3a', '#f0d040', '#e84a5a']));
    }
    // The budgies' cage up in the corner.
    ctx.strokeStyle = '#c9c9c9';
    ctx.lineWidth = 1.5;
    const cx = art.X(1.75);
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 5, art.Y(1.75));
      ctx.lineTo(cx + i * 5, art.Y(2.2));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, art.Y(2.2), 20, Math.PI, 0);
    ctx.stroke();
    for (const [x, c] of [[1.7, '#6fbf4a'], [1.8, '#4a8ad0']] as const) rect(ctx, art, x, 1.9, x + 0.04, 1.97, c);
    // A poster: ADOPT, a paw.
    rect(ctx, art, 0.3, 1.9, 0.8, 2.55, '#f0ead8');
    ctx.fillStyle = '#2f6a6a';
    ctx.beginPath();
    ctx.arc(art.X(0.55), art.Y(2.15), 9, 0, Math.PI * 2);
    ctx.fill();
  },
  florist: (ctx, art, palette, random) => {
    rect(ctx, art, 0, 0, 2.4, 3.3, WALK_IN_ROOM_WALLS.florist);
    // The stepped stand of buckets, three treads.
    for (const [y, x0] of [[0.2, 0.05], [0.45, 0.12], [0.7, 0.2]] as const) {
      rect(ctx, art, x0 - 0.03, y - 0.03, 1.85 - x0 + 0.03, y, '#8a6a44');
      for (let x = x0; x < 1.8 - x0; x += 0.22) {
        rect(ctx, art, x, y, x + 0.16, y + 0.18, '#9aa4aa');
        const color = pick(random, palette);
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 4 ? color : '#4d7a3a';
          ctx.beginPath();
          ctx.arc(art.X(x + 0.02 + random() * 0.12), art.Y(y + 0.2 + random() * 0.14), 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // The shelf of pots.
    for (const y of [0.35, 0.85, 1.35]) {
      rect(ctx, art, 1.95, y - 0.025, 2.4, y, '#c9a878');
      for (let x = 1.97; x < 2.36; x += 0.12) rect(ctx, art, x, y, x + 0.09, y + 0.1 + random() * 0.06, pick(random, ['#b86a44', '#c8784e', '#e8e0d4', '#5a7a8a']));
    }
    // Plants hung from the ceiling, trailing.
    for (const x of [0.3, 1.0, 1.7]) {
      rect(ctx, art, x, 2.6, x + 0.005, 3.3, '#6a5a48');
      rect(ctx, art, x - 0.1, 2.45, x + 0.1, 2.6, '#b86a44');
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = pick(random, ['#4d7a3a', '#6fa35e', '#3f6b3a']);
        ctx.beginPath();
        ctx.arc(art.X(x - 0.14 + random() * 0.28), art.Y(2.55 - random() * 0.6), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // The chalkboard: today's flowers.
    rect(ctx, art, 0.55, 1.35, 1.25, 1.9, '#6a4a30');
    rect(ctx, art, 0.58, 1.38, 1.22, 1.87, '#24302a');
    ctx.fillStyle = 'rgba(240,240,230,0.75)';
    for (let l = 0; l < 3; l++) ctx.fillRect(art.X(0.64), art.Y(1.78 - l * 0.13), art.X(0.3 + random() * 0.25), 2);
  },
};
