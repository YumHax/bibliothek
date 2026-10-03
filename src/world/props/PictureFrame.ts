import * as THREE from 'three';
import { createCanvas, toTexture, seededRandom } from '@/covers/generated/canvasUtils';
import { paint, timber } from '@/world/materials/palette';
import { layMesh, WALL } from '@/world/surface/layers';
import { Prop, part } from './Prop';

/**
 * `sunset`: soft gradient over a sea line; `mountains`: layered pastel-blue ridges; `abstract`: pastel shapes on cream;
 * `roofs`, `botanical`; `map`: an old chart of a coast; `stillLife`: a bowl of fruit and a jug on a table; `poster`: a
 * screen-printed arcade poster (a pixel ship over a grid sunset).
 */
export type PictureMotif = 'sunset' | 'mountains' | 'abstract' | 'roofs' | 'botanical' | 'map' | 'stillLife' | 'poster';

export interface PictureFrameOptions {
  /** Outer size of the frame. */
  width?: number;
  height?: number;
  motif?: PictureMotif;
  /** Wood colour of the frame. */
  frameColor?: number;
  /** Thickness of the wooden frame bars, in the picture plane. */
  frameWidth?: number;
  /** Width of the off-white mat between frame and picture. */
  matWidth?: number;
  /** Varies the composition of the motif. */
  seed?: number;
}

const FRAME_DEPTH = 0.028;
const BOARD_DEPTH = 0.01;
const CANVAS_W = 512;
const MAT_COLOR = '#f3efe6';

/**
 * A framed picture to hang on a wall: wooden frame bars around an off-white mat and a
 * procedurally painted motif. Local origin is the centre of the picture, on the wall;
 * local +z faces into the room (so `wallMount()` places it like a `Poster`).
 */
export class PictureFrame extends Prop {
  readonly options: Required<PictureFrameOptions>;

  constructor(options: PictureFrameOptions = {}) {
    super();
    this.options = { width: 0.4, height: 0.3, motif: 'sunset', frameColor: 0x3c2f24, frameWidth: 0.022, matWidth: 0.03, seed: 1, ...options };
    this.name = `PictureFrame:${this.options.motif}`;
    const { width, height, frameWidth, frameColor } = this.options;

    const wood = timber(frameColor, 0.5);
    // Four bars, the horizontal ones spanning the full width, sitting proud of the wall.
    const zBar = FRAME_DEPTH / 2;
    part(this, width, frameWidth, FRAME_DEPTH, wood, { y: height / 2 - frameWidth / 2, z: zBar });
    part(this, width, frameWidth, FRAME_DEPTH, wood, { y: -height / 2 + frameWidth / 2, z: zBar });
    part(this, frameWidth, height - 2 * frameWidth, FRAME_DEPTH, wood, { x: -width / 2 + frameWidth / 2, z: zBar });
    part(this, frameWidth, height - 2 * frameWidth, FRAME_DEPTH, wood, { x: width / 2 - frameWidth / 2, z: zBar });

    // Backboard recessed inside the bars, carrying mat + picture as one texture.
    const innerW = width - 2 * frameWidth;
    const innerH = height - 2 * frameWidth;
    const board = part(this, innerW, innerH, BOARD_DEPTH, paint(0x2a221c, 0.8), { z: BOARD_DEPTH / 2 });
    board.castShadow = false;
    const picture = new THREE.Mesh(
      new THREE.PlaneGeometry(innerW, innerH),
      new THREE.MeshStandardMaterial({ map: this.paint(innerW, innerH), roughness: 0.85 }),
    );
    picture.position.z = BOARD_DEPTH + WALL.paper.lift;
    layMesh(picture, WALL.paper);
    picture.receiveShadow = true;
    this.add(picture);
  }

  /** Paints the mat and, inside it, the chosen motif. */
  private paint(innerW: number, innerH: number): THREE.CanvasTexture {
    const W = CANVAS_W;
    const H = Math.round((W * innerH) / innerW);
    const [canvas, ctx] = createCanvas(W, H);
    const random = seededRandom(this.options.seed * 40503 + 7);

    ctx.fillStyle = MAT_COLOR;
    ctx.fillRect(0, 0, W, H);

    const m = Math.round((W * this.options.matWidth) / innerW);
    const pw = W - 2 * m;
    const ph = H - 2 * m;
    // Bevel of the mat opening: a faint shadow line so the picture reads as recessed.
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(m - 3, m - 3, pw + 6, ph + 6);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(m - 1, m - 1, pw + 2, ph + 2);

    ctx.save();
    ctx.translate(m, m);
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();
    const painters: Record<PictureMotif, MotifPainter> = { sunset: paintSunset, mountains: paintMountains, abstract: paintAbstract, roofs: paintRoofs, botanical: paintBotanical, map: paintMap, stillLife: paintStillLife, poster: paintPoster };
    painters[this.options.motif](ctx, pw, ph, random);
    ctx.restore();

    // Paper grain over the whole thing.
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = `rgba(${random() < 0.5 ? '0,0,0' : '255,255,255'},${(random() * 0.05).toFixed(3)})`;
      ctx.fillRect(random() * W, random() * H, 2, 2);
    }
    return toTexture(canvas, 'facing');
  }
}

type MotifPainter = (ctx: CanvasRenderingContext2D, w: number, h: number, random: () => number) => void;

function verticalGradient(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

/** Pale peach-to-lavender sky, a low sun and a calm sea with a light path under it. */
const paintSunset: MotifPainter = (ctx, w, h, random) => {
  const horizon = h * (0.6 + random() * 0.08);
  ctx.fillStyle = verticalGradient(ctx, 0, horizon, [
    [0, '#cfc3dc'],
    [0.45, '#f1cbb8'],
    [0.85, '#f8d9a6'],
    [1, '#fbe6b8'],
  ]);
  ctx.fillRect(0, 0, w, horizon);

  // Sun sitting on the horizon.
  const sunX = w * (0.35 + random() * 0.3);
  const sunR = w * 0.075;
  const glow = ctx.createRadialGradient(sunX, horizon - sunR * 0.6, sunR * 0.3, sunX, horizon - sunR * 0.6, sunR * 3.5);
  glow.addColorStop(0, 'rgba(255,240,200,0.75)');
  glow.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, horizon);
  ctx.fillStyle = '#fff3cf';
  ctx.beginPath();
  ctx.arc(sunX, horizon - sunR * 0.6, sunR, 0, Math.PI * 2);
  ctx.fill();

  // A few soft cloud streaks.
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 4; i++) {
    const y = horizon * (0.15 + random() * 0.55);
    const len = w * (0.15 + random() * 0.3);
    const x = random() * (w - len);
    ctx.beginPath();
    ctx.ellipse(x + len / 2, y, len / 2, h * 0.012, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sea, with the sun's reflection as a brighter band.
  ctx.fillStyle = verticalGradient(ctx, horizon, h, [
    [0, '#a9bfc9'],
    [0.5, '#8aa4b3'],
    [1, '#7a94a3'],
  ]);
  ctx.fillRect(0, horizon, w, h - horizon);
  ctx.fillStyle = 'rgba(255,236,190,0.35)';
  ctx.beginPath();
  ctx.moveTo(sunX - sunR * 0.8, horizon);
  ctx.lineTo(sunX + sunR * 0.8, horizon);
  ctx.lineTo(sunX + sunR * 2.2, h);
  ctx.lineTo(sunX - sunR * 2.2, h);
  ctx.closePath();
  ctx.fill();
  // Ripples: short horizontal light dashes.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 28; i++) {
    const y = horizon + (h - horizon) * random();
    const len = w * (0.02 + random() * 0.06);
    const x = random() * (w - len);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  // Horizon line.
  ctx.fillStyle = 'rgba(120,140,155,0.5)';
  ctx.fillRect(0, horizon - 1, w, 2);
};

/** Pale sky, a faint sun and four ridges of mountains getting bluer as they come forward. */
const paintMountains: MotifPainter = (ctx, w, h, random) => {
  ctx.fillStyle = verticalGradient(ctx, 0, h, [
    [0, '#e9f0f6'],
    [0.6, '#d3e1ec'],
    [1, '#c4d5e3'],
  ]);
  ctx.fillRect(0, 0, w, h);

  const sunX = w * (0.2 + random() * 0.6);
  const sunY = h * (0.18 + random() * 0.15);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(sunX, sunY, w * 0.05, 0, Math.PI * 2);
  ctx.fill();

  const layers = ['#c7d7e5', '#aac1d4', '#8fa9c0', '#7590a7'];
  layers.forEach((color, layer) => {
    const t = layer / (layers.length - 1);
    const baseY = h * (0.42 + t * 0.32);
    const amplitude = h * (0.16 - t * 0.05);
    const peaks = 3 + layer;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, baseY - amplitude * random() * 0.5);
    for (let i = 0; i <= peaks; i++) {
      const x = (w * (i + random() * 0.6 - 0.3)) / peaks;
      const peakY = baseY - amplitude * (0.5 + random() * 0.5);
      const valleyY = baseY - amplitude * random() * 0.25;
      ctx.lineTo(Math.max(0, Math.min(w, x)), peakY);
      if (i < peaks) ctx.lineTo((w * (i + 0.5 + random() * 0.3 - 0.15)) / peaks, valleyY);
    }
    ctx.lineTo(w, baseY - amplitude * random() * 0.5);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    // Mist at the foot of each ridge blends it into the next one.
    ctx.fillStyle = verticalGradient(ctx, baseY - amplitude * 0.2, baseY + amplitude * 0.5, [
      [0, 'rgba(233,240,246,0)'],
      [1, 'rgba(233,240,246,0.45)'],
    ]);
    ctx.fillRect(0, baseY - amplitude * 0.2, w, amplitude * 0.7);
  });

  // A pale water line at the very bottom.
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, h * 0.94, w, h * 0.06);
};

/** Overlapping pastel discs and slabs on cream, with one thin ink line for tension. */
const paintAbstract: MotifPainter = (ctx, w, h, random) => {
  ctx.fillStyle = '#f5f0e6';
  ctx.fillRect(0, 0, w, h);
  const palette = ['#f0c6b4', '#a9c6c2', '#e6d3a0', '#b8c4d9', '#d9b8c4', '#c9d3b3'];
  const pick = () => palette[Math.floor(random() * palette.length)];

  ctx.globalAlpha = 0.85;
  const shapes = 5 + Math.floor(random() * 3);
  for (let i = 0; i < shapes; i++) {
    ctx.fillStyle = pick();
    const cx = w * (0.15 + random() * 0.7);
    const cy = h * (0.15 + random() * 0.7);
    if (random() < 0.55) {
      const r = Math.min(w, h) * (0.12 + random() * 0.2);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const rw = w * (0.15 + random() * 0.3);
      const rh = h * (0.12 + random() * 0.35);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((random() - 0.5) * 0.3);
      ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;

  // One or two thin dark lines.
  ctx.strokeStyle = 'rgba(60,50,45,0.7)';
  ctx.lineWidth = 3;
  const lines = 1 + Math.floor(random() * 2);
  for (let i = 0; i < lines; i++) {
    ctx.beginPath();
    if (random() < 0.5) {
      const y = h * (0.2 + random() * 0.6);
      ctx.moveTo(w * 0.1, y);
      ctx.lineTo(w * 0.9, y + (random() - 0.5) * h * 0.2);
    } else {
      ctx.arc(w * (0.3 + random() * 0.4), h * (0.3 + random() * 0.4), Math.min(w, h) * (0.15 + random() * 0.2), 0, Math.PI * 2);
    }
    ctx.stroke();
  }
};

/** A print of the town's roofs: rows of gables and chimneys in slate and terracotta under a pale sky, a church spire. */
const paintRoofs: MotifPainter = (ctx, w, h, random) => {
  ctx.fillStyle = verticalGradient(ctx, 0, h, [
    [0, '#dfe7ee'],
    [1, '#f3ecdf'],
  ]);
  ctx.fillRect(0, 0, w, h);
  // A spire behind the roofs.
  const sx = w * (0.2 + random() * 0.6);
  ctx.fillStyle = '#9aa4ae';
  ctx.beginPath();
  ctx.moveTo(sx - w * 0.025, h * 0.5);
  ctx.lineTo(sx, h * 0.12);
  ctx.lineTo(sx + w * 0.025, h * 0.5);
  ctx.fill();
  const rows = ['#8e9aa6', '#6f7c89', '#b86a4e', '#9a5540'];
  rows.forEach((colour, row) => {
    const base = h * (0.42 + row * 0.16);
    for (let x = -random() * w * 0.1; x < w; ) {
      const width = w * (0.12 + random() * 0.12);
      const peak = base - h * (0.08 + random() * 0.08);
      // The house front under its gable, then the roof.
      ctx.fillStyle = row % 2 ? '#e8dcc6' : '#d9ccb4';
      ctx.fillRect(x, base, width, h - base);
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x + width / 2, peak);
      ctx.lineTo(x + width, base);
      ctx.closePath();
      ctx.fill();
      if (random() < 0.6) {
        ctx.fillStyle = '#7a4a3a';
        ctx.fillRect(x + width * 0.68, peak + (base - peak) * 0.2, width * 0.08, (base - peak) * 0.45);
      }
      // A window or two under the gable.
      ctx.fillStyle = 'rgba(60, 70, 80, 0.55)';
      ctx.fillRect(x + width * 0.3, base + h * 0.03, width * 0.14, h * 0.05);
      ctx.fillRect(x + width * 0.58, base + h * 0.03, width * 0.14, h * 0.05);
      x += width * (0.85 + random() * 0.2);
    }
  });
};

/** A botanical plate: a fern frond and a sprig on cream paper, the plant's name inked under it. */
const paintBotanical: MotifPainter = (ctx, w, h, random) => {
  ctx.fillStyle = '#f4eedf';
  ctx.fillRect(0, 0, w, h);
  const stem = (x0: number, y0: number, length: number, lean: number, leaves: number, colour: string): void => {
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = Math.max(1.5, w * 0.008);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    const x1 = x0 + lean * length;
    const y1 = y0 - length;
    ctx.quadraticCurveTo(x0 + lean * length * 0.2, y0 - length * 0.6, x1, y1);
    ctx.stroke();
    for (let i = 1; i <= leaves; i++) {
      const t = i / (leaves + 1);
      const x = x0 + (x1 - x0) * t * t;
      const y = y0 + (y1 - y0) * t;
      const size = length * 0.16 * (1 - t * 0.7);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(x + side * size * 0.7, y - size * 0.1, size * 0.75, size * 0.22, side * -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  stem(w * (0.45 + random() * 0.1), h * 0.84, h * 0.66, 0.15 - random() * 0.3, 11, '#5f7a4a');
  stem(w * 0.62, h * 0.84, h * 0.4, 0.3, 6, '#7d9460');
  // A few seed heads on the sprig, and the name.
  ctx.fillStyle = '#b8864a';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(w * (0.66 + i * 0.03), h * (0.44 + random() * 0.05), w * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(60, 50, 40, 0.75)';
  ctx.font = `italic ${Math.round(h * 0.055)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(random() < 0.5 ? 'Polypodium vulgare' : 'Athyrium filix-femina', w / 2, h * 0.94, w * 0.8);
};

/** An old chart: foxed paper, a coast with its hatching, rhumb lines out of a compass rose, a title cartouche. */
const paintMap: MotifPainter = (ctx, w, h, random) => {
  ctx.fillStyle = '#eadcb8';
  ctx.fillRect(0, 0, w, h);
  // Foxing: brown blooms at random, darker towards the edges.
  for (let i = 0; i < 14; i++) {
    const x = random() * w;
    const y = random() * h;
    const r = Math.min(w, h) * (0.04 + random() * 0.12);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(150,110,60,0.16)');
    g.addColorStop(1, 'rgba(150,110,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // The coast: a wandering line from the top to the bottom, land to its left.
  const coast: [number, number][] = [];
  let x = w * (0.35 + random() * 0.15);
  for (let y = -10; y <= h + 10; y += h / 24) {
    x += (random() - 0.5) * w * 0.09;
    coast.push([Math.max(w * 0.12, Math.min(w * 0.7, x)), y]);
  }
  ctx.fillStyle = '#dfcb98';
  ctx.beginPath();
  ctx.moveTo(0, -10);
  for (const [cx, cy] of coast) ctx.lineTo(cx, cy);
  ctx.lineTo(0, h + 10);
  ctx.closePath();
  ctx.fill();
  // Hatching along the shore on the sea side, then the line itself.
  ctx.strokeStyle = 'rgba(80,60,40,0.35)';
  ctx.lineWidth = 1;
  for (const [cx, cy] of coast) {
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.moveTo(cx + k * 5, cy - 4);
      ctx.lineTo(cx + k * 5, cy + 4);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(70,50,35,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  coast.forEach(([cx, cy], i) => (i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy)));
  ctx.stroke();
  // Rhumb lines out of the rose, over the sea.
  const roseX = w * 0.74;
  const roseY = h * 0.62;
  ctx.strokeStyle = 'rgba(120,70,50,0.3)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(roseX, roseY);
    ctx.lineTo(roseX + Math.cos(a) * w, roseY + Math.sin(a) * w);
    ctx.stroke();
  }
  // The rose: an eight-point star.
  const r = Math.min(w, h) * 0.09;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const long = i % 2 === 0 ? r : r * 0.55;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(120,45,35,0.8)' : 'rgba(70,50,35,0.7)';
    ctx.beginPath();
    ctx.moveTo(roseX, roseY);
    ctx.lineTo(roseX + Math.cos(a - 0.3) * long * 0.3, roseY + Math.sin(a - 0.3) * long * 0.3);
    ctx.lineTo(roseX + Math.cos(a) * long, roseY + Math.sin(a) * long);
    ctx.lineTo(roseX + Math.cos(a + 0.3) * long * 0.3, roseY + Math.sin(a + 0.3) * long * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  // The cartouche, top right, and a border rule.
  ctx.strokeStyle = 'rgba(70,50,35,0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(w * 0.56, h * 0.08, w * 0.36, h * 0.16);
  ctx.fillStyle = 'rgba(70,50,35,0.85)';
  ctx.font = `italic ${Math.round(h * 0.05)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(random() < 0.5 ? 'Carte de la Côte' : 'Mare Nostrum', w * 0.74, h * 0.18, w * 0.32);
  ctx.strokeRect(6, 6, w - 12, h - 12);
};

/** A bowl of fruit and a jug on a table under a dark wall, lit from the left: flat masses, soft edges. */
const paintStillLife: MotifPainter = (ctx, w, h, random) => {
  const table = h * (0.62 + random() * 0.06);
  ctx.fillStyle = verticalGradient(ctx, 0, table, [
    [0, '#3d3a36'],
    [1, '#5a5148'],
  ]);
  ctx.fillRect(0, 0, w, table);
  ctx.fillStyle = verticalGradient(ctx, table, h, [
    [0, '#9c7a55'],
    [1, '#6f5439'],
  ]);
  ctx.fillRect(0, table, w, h - table);
  // The cloth hanging over the table's edge.
  ctx.fillStyle = '#e8e0cf';
  ctx.beginPath();
  ctx.moveTo(w * 0.1, table);
  ctx.lineTo(w * 0.55, table);
  ctx.lineTo(w * 0.5, h);
  ctx.lineTo(w * 0.16, h);
  ctx.closePath();
  ctx.fill();
  // The jug, behind at the right.
  const jx = w * (0.66 + random() * 0.08);
  ctx.fillStyle = '#6e8fa3';
  ctx.beginPath();
  ctx.ellipse(jx, table - h * 0.16, w * 0.11, h * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(jx - w * 0.05, table - h * 0.42, w * 0.1, h * 0.14);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(jx - w * 0.05, table - h * 0.2, w * 0.025, h * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  // The bowl and its fruit, in front at the left.
  const bx = w * 0.36;
  const fruit = ['#d4a02a', '#b8412e', '#8aa243', '#d97a2b', '#b8412e'];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = fruit[i]!;
    const fx = bx + (i - 2) * w * 0.065 + (random() - 0.5) * w * 0.02;
    const fy = table - h * (0.1 + (i % 2) * 0.06);
    ctx.beginPath();
    ctx.arc(fx, fy, w * (0.045 + random() * 0.015), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#cfc4ae';
  ctx.beginPath();
  ctx.ellipse(bx, table - h * 0.05, w * 0.2, h * 0.07, 0, 0, Math.PI);
  ctx.fill();
  // Light from the left, shade to the right.
  const light = ctx.createLinearGradient(0, 0, w, 0);
  light.addColorStop(0, 'rgba(255,235,200,0.12)');
  light.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);
};

/** A two-colour screen print for an arcade game: a pixel ship over a grid running to a striped sun, a title in block letters. */
const paintPoster: MotifPainter = (ctx, w, h, random) => {
  const inks = [
    ['#1f2a44', '#f06543', '#f7c548'],
    ['#2a1f3d', '#3fc1c9', '#f5e663'],
  ][random() < 0.5 ? 0 : 1]!;
  const [ground, hot, warm] = inks as [string, string, string];
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  const horizon = h * 0.58;
  // The sun, cut by stripes.
  const sx = w / 2;
  const r = Math.min(w, h) * 0.26;
  ctx.fillStyle = warm;
  ctx.beginPath();
  ctx.arc(sx, horizon, r, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = ground;
  for (let i = 0; i < 5; i++) ctx.fillRect(sx - r, horizon - r * 0.12 - i * r * 0.17, 2 * r, r * 0.05 + i * 0.012 * r);
  // The grid running to the horizon.
  ctx.strokeStyle = hot;
  ctx.lineWidth = 2;
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(sx + i * w * 0.02, horizon);
    ctx.lineTo(sx + i * w * 0.16, h);
    ctx.stroke();
  }
  for (let k = 1; k <= 7; k++) {
    const y = horizon + (h - horizon) * (k / 7) ** 1.8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // The ship: blocks of a pixel sprite.
  const px = Math.round(w * 0.02);
  const sprite = ['..#..', '.###.', '#####', '#.#.#'];
  const ox = sx - (sprite[0]!.length * px) / 2;
  const oy = horizon + (h - horizon) * 0.35;
  ctx.fillStyle = warm;
  sprite.forEach((row, j) => [...row].forEach((c, i) => c === '#' && ctx.fillRect(ox + i * px, oy + j * px, px, px)));
  // The title, top.
  ctx.fillStyle = hot;
  ctx.font = `bold ${Math.round(h * 0.11)}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(random() < 0.5 ? 'STAR RUN' : 'NIGHT DRIVE', w / 2, h * 0.2, w * 0.86);
  ctx.fillStyle = warm;
  ctx.font = `${Math.round(h * 0.035)}px "Courier New", monospace`;
  ctx.fillText('INSERT COIN · 1 PLAYER', w / 2, h * 0.27, w * 0.8);
};
