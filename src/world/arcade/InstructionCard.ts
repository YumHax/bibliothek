import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { PIXEL_FONT, drawText } from './games/ArcadeGame';
import { arcadeHint } from './arcadeHint';
import { repaintWhenFontLoads } from '@/graphics/fontReady';
import { onKeyLabelsChange } from '@/ui/keys';

interface InstructionCardOptions {
  /** The machine's name, across the top. */
  title: string;
  /** How to play: one line each, e.g. "A / D  MOVE". Split a `·`-separated hint with `hintLines`. */
  lines: readonly string[] | (() => readonly string[]);
  /** The stripe and the title's colour. Default the hall's magenta. */
  accent?: number;
  /** Size of the card, metres. Default 0.16 x 0.09. */
  width?: number;
  height?: number;
}

/** Fine enough to read with the eye parked square in front of it (`CardReading`). */
const PX_PER_M = 3200;

/**
 * The printed card every machine has somewhere on its panel: how to play, in a few short lines,
 * so the keys do not have to live in the HUD. A plane (origin at its centre, facing +z) with a
 * yellowed card, a coloured stripe, the title and the lines; worn at the corners. Decoration.
 */
export class InstructionCard extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> {
  /** Its size, metres. */
  readonly width: number;
  readonly height: number;

  constructor(options: InstructionCardOptions) {
    const width = options.width ?? 0.16;
    const height = options.height ?? 0.09;
    const { texture, repaint } = paintCard(options, width, height);
    super(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7 }));
    this.width = width;
    this.height = height;
    this.name = 'InstructionCard';
    this.receiveShadow = true;
    // The keys rebound in the settings: the card is printed again the next time it is drawn (its lines name the keys).
    watchKeyLabels();
    let printed = labelsVersion;
    this.onBeforeRender = () => {
      if (printed === labelsVersion) return;
      printed = labelsVersion;
      repaint();
    };
  }

  /** Under the crosshair: the print lifts a little out of the hall's dark. */
  setLit(lit: boolean): void {
    this.material.emissiveIntensity = lit ? 0.18 : 0;
  }
}

/** Bumped whenever the key names change (a rebinding, the keyboard layout learnt): one listener for every card, none to leak. */
let labelsVersion = 0;
let watching = false;

function watchKeyLabels(): void {
  if (watching) return;
  watching = true;
  onKeyLabelsChange(() => {
    labelsVersion += 1;
  });
}

/** "A/D move · Space launch" as card lines: each part upper-cased on its own line. */
export function hintLines(hint: string): string[] {
  return hint
    .split('·')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

function paintCard(options: InstructionCardOptions, width: number, height: number): { texture: THREE.Texture; repaint: () => void } {
  const W = Math.round(width * PX_PER_M);
  const H = Math.round(height * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  const accent = `#${new THREE.Color(options.accent ?? 0xff2fa0).getHexString()}`;
  const paint = (): void => paintFace(ctx, options, W, H, accent);
  paint();
  const texture = toTexture(canvas, 'facing');
  const repaint = (): void => {
    paint();
    texture.needsUpdate = true;
  };
  repaintWhenFontLoads(`${Math.round(H * 0.13)}px ${PIXEL_FONT}`, repaint);
  return { texture, repaint };
}

/** The card's print: yellowed paper, the stripe and title, the lines (their key tokens named, `arcadeHint`), INSERT 1 COIN. */
function paintFace(ctx: CanvasRenderingContext2D, options: InstructionCardOptions, W: number, H: number, accent: string): void {
  ctx.fillStyle = '#efe6cf';
  ctx.fillRect(0, 0, W, H);
  // Yellowed towards the edges, where fingers go.
  const edge = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(120,90,30,0.28)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, H * 0.24);
  drawText(ctx, options.title, W / 2, H * 0.125, Math.round(H * 0.13), '#fffbe6');
  const lines = (typeof options.lines === 'function' ? options.lines() : options.lines).slice(0, 4).map((line) => arcadeHint(line).toUpperCase());
  const rowH = (H * 0.66) / Math.max(3, lines.length);
  lines.forEach((line, i) => {
    // Pixel type is square: a character as wide as it is tall.
    const size = Math.min(Math.round(H * 0.095), Math.floor((W * 0.9) / Math.max(8, line.length)));
    drawText(ctx, line, W / 2, H * 0.3 + rowH * (i + 0.5), size, '#2a2230');
  });
  drawText(ctx, 'INSERT 1 COIN', W / 2, H * 0.94, Math.round(H * 0.06), '#6a5a70');
}
