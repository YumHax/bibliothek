import { createCanvas } from '@/covers/generated/canvasUtils';
import type { Season } from '@/time/season';
import { lcg } from '@/random';

/*
 * LINDEN AVENUE, PAINTED (`LindenView`): the strips the view's layers sample, each a canvas repeating along the
 * avenue (x) and standing up from the street (y). The facades across (stone, six storeys, the shops under them, the
 * zinc roofs, a side street's gap), the window lights they show at night, the plane trees along both kerbs as the
 * season dresses them, the roadway seen from above (its lanes, the parked cars), and the town far off past the side
 * street. Sizes in metres are the view's (`LINDEN`); each painter returns its canvas.
 */

/** The strips' sizes (m) and pixels per metre. */
export const LINDEN = {
  facades: { period: 60, height: 26, ppm: 16 },
  trees: { period: 24, height: 16, ppm: 14 },
  road: { period: 48, near: 3.5, far: 17.5, ppm: 16 },
  town: { period: 400, height: 60, ppm: 2.5 },
} as const;

type Random = () => number;

/** The facades across the avenue and their night lights (the second canvas: white where a window is lit). */
export function paintFacades(seed: number): { color: HTMLCanvasElement; lights: HTMLCanvasElement } {
  const { period, height, ppm } = LINDEN.facades;
  const W = period * ppm;
  const H = height * ppm;
  const [color, ctx] = createCanvas(W, H);
  const [lights, lit] = createCanvas(W / 4, H / 4);
  lit.fillStyle = '#000';
  lit.fillRect(0, 0, W / 4, H / 4);
  const random = lcg(seed);
  const px = (m: number) => m * ppm;
  const fromGround = (m: number) => H - m * ppm;
  // The side street's gap (a 10 m opening) at the period's start; then buildings of 12 to 18 m to the end.
  let x = 10;
  const stones = ['#d8ccb4', '#e0d6c0', '#cfc2a6', '#d6c8ae', '#e2dac8'];
  while (x < period - 0.5) {
    const width = Math.min(period - x, 12 + random() * 6);
    const storeys = 5 + (random() < 0.4 ? 1 : 0);
    const groundFloor = 4;
    const storey = 3;
    const top = groundFloor + storeys * storey;
    // The stone front.
    ctx.fillStyle = stones[Math.floor(random() * stones.length)]!;
    ctx.fillRect(px(x), fromGround(top), px(width), px(top));
    // String courses over each storey.
    ctx.fillStyle = 'rgba(80,60,40,0.18)';
    for (let s = 0; s <= storeys; s++) ctx.fillRect(px(x), fromGround(groundFloor + s * storey) - 2, px(width), 3);
    // The mansard roof: grey zinc, its dormers, the chimney stacks.
    const roof = 3.5;
    ctx.fillStyle = '#6a7078';
    ctx.beginPath();
    ctx.moveTo(px(x), fromGround(top));
    ctx.lineTo(px(x + width), fromGround(top));
    ctx.lineTo(px(x + width - 1), fromGround(top + roof));
    ctx.lineTo(px(x + 1), fromGround(top + roof));
    ctx.fill();
    for (let cx = x + 1; cx + 2 < x + width; cx += 4 + random() * 2) {
      ctx.fillStyle = '#d8d2c4';
      ctx.fillRect(px(cx + 0.6), fromGround(top + 2.6), px(1.2), px(2.2));
      ctx.fillStyle = '#2a2e36';
      ctx.fillRect(px(cx + 0.8), fromGround(top + 2.3), px(0.8), px(1.5));
    }
    for (let c = 0; c < 2; c++) {
      ctx.fillStyle = '#b8846a';
      ctx.fillRect(px(x + 1.5 + random() * (width - 3)), fromGround(top + roof + 1.4), px(0.9), px(1.6));
    }
    // The windows, a grid of tall French windows; balconies' iron along the second and the fifth.
    const bays = Math.max(3, Math.floor(width / 2.7));
    const bay = width / bays;
    for (let s = 0; s < storeys; s++) {
      const sill = groundFloor + s * storey + 0.6;
      for (let b = 0; b < bays; b++) {
        const wx = x + b * bay + (bay - 1.15) / 2;
        const shutters = random() < 0.3;
        ctx.fillStyle = '#3a4048';
        ctx.fillRect(px(wx), fromGround(sill + 2.05), px(1.15), px(2.05));
        // Curtains or a lamp inside, some panes pale.
        ctx.fillStyle = random() < 0.4 ? '#c8b89a' : '#5a6068';
        ctx.fillRect(px(wx + 0.12), fromGround(sill + 1.9), px(0.4), px(1.75));
        ctx.fillRect(px(wx + 0.63), fromGround(sill + 1.9), px(0.4), px(1.75));
        if (shutters) {
          ctx.fillStyle = '#6a7a5a';
          ctx.fillRect(px(wx - 0.5), fromGround(sill + 2.05), px(0.45), px(2.05));
          ctx.fillRect(px(wx + 1.2), fromGround(sill + 2.05), px(0.45), px(2.05));
        }
        if (random() < 0.38) {
          lit.fillStyle = `rgba(255,255,255,${(0.55 + random() * 0.45).toFixed(2)})`;
          lit.fillRect(px(wx) / 4, fromGround(sill + 2.05) / 4, px(1.15) / 4, px(2.05) / 4);
        }
      }
      if (s === 1 || s === 4) {
        ctx.fillStyle = '#22252a';
        ctx.fillRect(px(x), fromGround(sill + 0.95), px(width), 2);
        for (let r = px(x); r < px(x + width); r += 4) ctx.fillRect(r, fromGround(sill + 0.95), 1, px(0.95));
      }
    }
    // The ground floor: a shop's front under its awning, the building's door.
    const shopColours = ['#7a2a2a', '#2a4a6a', '#2a5a3a', '#6a4a2a'];
    const awning = shopColours[Math.floor(random() * shopColours.length)]!;
    ctx.fillStyle = '#2a2e34';
    ctx.fillRect(px(x + 0.8), fromGround(3.2), px(width - 4), px(3.2));
    ctx.fillStyle = '#a89a7a';
    ctx.fillRect(px(x + 1), fromGround(3), px(width - 4.4), px(2.6));
    ctx.fillStyle = awning;
    ctx.fillRect(px(x + 0.6), fromGround(3.7), px(width - 3.6), px(0.6));
    lit.fillStyle = 'rgba(255,255,255,0.8)';
    lit.fillRect(px(x + 1) / 4, fromGround(3) / 4, px(width - 4.4) / 4, px(2.6) / 4);
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(px(x + width - 2.6), fromGround(3), px(1.4), px(3));
    // A downpipe at the party wall.
    ctx.fillStyle = 'rgba(40,40,44,0.6)';
    ctx.fillRect(px(x + width) - 3, fromGround(top), 2, px(top));
    x += width;
  }
  return { color, lights };
}

/** The plane trees along a kerb: two to a strip, mottled trunks, their crowns as the season has them. */
export function paintTrees(season: Season, seed: number): HTMLCanvasElement {
  const { period, height, ppm } = LINDEN.trees;
  const W = period * ppm;
  const H = height * ppm;
  const [canvas, ctx] = createCanvas(W, H);
  const random = lcg(seed);
  const px = (m: number) => m * ppm;
  const fromGround = (m: number) => H - m * ppm;
  const leaves = leafColours(season.name);
  for (const tx of [6, 18]) {
    // The trunk and its bark's patches.
    ctx.fillStyle = '#8a8270';
    ctx.fillRect(px(tx - 0.25), fromGround(5.5), px(0.5), px(5.5));
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = random() < 0.5 ? '#b8b294' : '#6a6450';
      ctx.fillRect(px(tx - 0.25 + random() * 0.35), fromGround(random() * 5.2 + 0.3), px(0.12), px(0.3));
    }
    // The boughs: forks up and out.
    ctx.strokeStyle = '#6a6450';
    ctx.lineCap = 'round';
    for (let b = 0; b < 7; b++) {
      const a = -Math.PI / 2 + (random() - 0.5) * 1.6;
      const len = 3 + random() * 4;
      ctx.lineWidth = px(0.18) * (1 - b / 10);
      ctx.beginPath();
      ctx.moveTo(px(tx), fromGround(5));
      ctx.lineTo(px(tx + Math.cos(a) * len), fromGround(5 - Math.sin(a) * len));
      ctx.stroke();
    }
    if (!leaves) {
      // Winter: only twigs at the ends.
      ctx.strokeStyle = 'rgba(90,84,70,0.8)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 90; i++) {
        const cx = tx + (random() - 0.5) * 7;
        const cy = 8 + random() * 6.5;
        ctx.beginPath();
        ctx.moveTo(px(cx), fromGround(cy));
        ctx.lineTo(px(cx + (random() - 0.5) * 0.8), fromGround(cy + random() * 0.8));
        ctx.stroke();
      }
      continue;
    }
    // The crown: overlapping clumps of leaves, darker below, a few holes of sky.
    for (let i = 0; i < 70; i++) {
      const cx = tx + (random() - 0.5) * 7;
      const cy = 6.5 + random() * 8;
      const r = 0.8 + random() * 1.4;
      ctx.fillStyle = leaves[Math.floor(random() * leaves.length)]!;
      ctx.globalAlpha = season.name === 'spring' ? 0.75 : 0.95;
      ctx.beginPath();
      ctx.arc(px(cx), fromGround(cy), px(r), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc(px(tx + (random() - 0.5) * 6), fromGround(7 + random() * 7), px(0.25 + random() * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  return canvas;
}

/** The leaves' colours in a season, or null for bare winter boughs. */
function leafColours(season: Season['name']): string[] | null {
  switch (season) {
    case 'winter':
      return null;
    case 'spring':
      return ['#8ab84a', '#a0c860', '#7aa840'];
    case 'autumn':
      return ['#c8902a', '#d8a83a', '#a86a2a', '#8a8a3a'];
    default:
      return ['#3a6a2a', '#4a7a32', '#2e5a24', '#5a8a3a'];
  }
}

/**
 * The roadway seen from above, between the kerbs (`LINDEN.road`, its v from the near kerb to the far one): the
 * asphalt, the parking lanes along both kerbs with their cars, the dashed middle line, a zebra crossing, two manholes.
 */
export function paintRoad(seed: number): HTMLCanvasElement {
  const { period, near, far, ppm } = LINDEN.road;
  const W = period * ppm;
  const H = (far - near) * ppm;
  const [canvas, ctx] = createCanvas(W, H);
  const random = lcg(seed);
  const px = (m: number) => m * ppm;
  // v runs from the near kerb (top of the canvas) to the far one.
  const at = (d: number) => (d - near) * ppm;
  ctx.fillStyle = '#4a4c50';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(${random() < 0.5 ? '0,0,0' : '255,255,255'},0.05)`;
    ctx.fillRect(random() * W, random() * H, 2, 2);
  }
  // The gutters, darker along each kerb.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, W, px(0.4));
  ctx.fillRect(0, H - px(0.4), W, px(0.4));
  // The dashed middle line and the parking lanes' edges.
  ctx.fillStyle = '#e8e6de';
  const middle = at((near + far) / 2);
  for (let x = 0; x < period; x += 6) ctx.fillRect(px(x), middle - 2, px(3), 4);
  for (const d of [near + 2.1, far - 2.1]) ctx.fillRect(0, at(d) - 1, W, 2);
  // The zebra crossing.
  for (let d = near + 2.2; d < far - 2.2; d += 1) ctx.fillRect(px(30), at(d), px(4), px(0.5));
  // Manholes.
  ctx.fillStyle = '#3a3c40';
  for (const [x, d] of [
    [12, near + 5],
    [40, far - 6],
  ] as const) {
    ctx.beginPath();
    ctx.arc(px(x), at(d), px(0.35), 0, Math.PI * 2);
    ctx.fill();
  }
  // The parked cars, seen from above, nose to tail along both kerbs.
  const paints = ['#8a1e1e', '#e8e8e4', '#2a3a5a', '#3a3a3a', '#6a7a8a', '#c8a03a', '#2a5a3a', '#b8b8b0'];
  for (const d of [near + 1.05, far - 1.05]) {
    for (let x = 1 + random() * 2; x < period - 5; x += 4.6 + random() * 2.5) {
      if (x > 27 && x < 36) continue;
      if (random() < 0.15) continue;
      const length = 3.9 + random() * 0.7;
      const width = 1.75;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(px(x) - 2, at(d - width / 2) - 2, px(length) + 4, px(width) + 4);
      ctx.fillStyle = paints[Math.floor(random() * paints.length)]!;
      ctx.fillRect(px(x), at(d - width / 2), px(length), px(width));
      // The roof and its windscreens, darker glass front and back.
      ctx.fillStyle = 'rgba(20,24,30,0.75)';
      ctx.fillRect(px(x + length * 0.28), at(d - width / 2 + 0.2), px(length * 0.12), px(width - 0.4));
      ctx.fillRect(px(x + length * 0.72), at(d - width / 2 + 0.2), px(length * 0.08), px(width - 0.4));
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(px(x + length * 0.4), at(d - width / 2 + 0.25), px(length * 0.32), px(width - 0.5));
    }
  }
  return canvas;
}

/** The town far off, past the side street: roofs and their chimneys, a church's spire, two towers, all in haze. */
export function paintTown(seed: number): HTMLCanvasElement {
  const { period, height, ppm } = LINDEN.town;
  const W = period * ppm;
  const H = height * ppm;
  const [canvas, ctx] = createCanvas(W, H);
  const random: Random = lcg(seed);
  const px = (m: number) => m * ppm;
  const fromGround = (m: number) => H - m * ppm;
  for (let x = 0; x < period; ) {
    const width = 8 + random() * 20;
    const top = 14 + random() * 12;
    ctx.fillStyle = random() < 0.5 ? '#9aa0a8' : '#a8a49a';
    ctx.fillRect(px(x), fromGround(top), px(width) + 1, px(top));
    ctx.fillStyle = '#7a8088';
    ctx.fillRect(px(x), fromGround(top + 2.5), px(width) + 1, px(2.5));
    x += width;
  }
  // The church: its nave's roof and the spire.
  const cx = period * 0.3;
  ctx.fillStyle = '#8a8a88';
  ctx.fillRect(px(cx - 4), fromGround(38), px(8), px(38));
  ctx.beginPath();
  ctx.moveTo(px(cx - 4), fromGround(38));
  ctx.lineTo(px(cx), fromGround(58));
  ctx.lineTo(px(cx + 4), fromGround(38));
  ctx.fill();
  // Two towers of the new town, further off.
  ctx.fillStyle = '#a8b0bc';
  ctx.fillRect(px(period * 0.62), fromGround(52), px(14), px(52));
  ctx.fillRect(px(period * 0.8), fromGround(44), px(10), px(44));
  return canvas;
}
