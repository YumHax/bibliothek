import * as THREE from 'three';
import type { Platform } from '@/catalog/types';
import { createCanvas, toTexture, fitFontSize, wrapLines, FONT } from '@/covers/generated/canvasUtils';
import { contrastText, css } from '@/covers/generated/palette';
import { Prop, part, matte } from './Prop';

/** Draws a poster on a canvas of `w` x `h` pixels. */
export type PosterPainter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const CANVAS_W = 512;

/**
 * A framed poster on a wall, painted procedurally. Local +z faces into the room; use
 * `wallMount()` to place it. `repaint()` swaps the picture (e.g. when the collection changes).
 */
export class Poster extends Prop {
  private readonly picture: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly canvasH: number;

  constructor(
    readonly width: number,
    readonly height: number,
    painter: PosterPainter,
  ) {
    super();
    this.name = 'Poster';
    this.canvasH = Math.round((CANVAS_W * height) / width);

    part(this, width + 0.05, height + 0.05, 0.02, matte(0x1e1a18, 0.5), { z: 0.01 });
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.03, height + 0.03), matte(0xf4f1ea, 0.9));
    mat.position.z = 0.0205;
    mat.receiveShadow = true;
    this.picture = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ roughness: 0.75 }));
    this.picture.position.z = 0.022;
    this.picture.receiveShadow = true;
    this.add(mat, this.picture);
    this.repaint(painter);
  }

  repaint(painter: PosterPainter): void {
    const [canvas, ctx] = createCanvas(CANVAS_W, this.canvasH);
    painter(ctx, CANVAS_W, this.canvasH);
    const previous = this.picture.material.map;
    this.picture.material.map = toTexture(canvas, 4);
    this.picture.material.needsUpdate = true;
    previous?.dispose();
  }

  // --- Painters -----------------------------------------------------------------------------

  /** The collection's own poster: a wall of tiny cartridges under a big "BIBLIOTHEK". */
  static bibliothek(gameCount: number, platforms: Platform[]): PosterPainter {
    return (ctx, w, h) => {
      ctx.fillStyle = '#141826';
      ctx.fillRect(0, 0, w, h);

      // Cartridge grid in the platforms' accent colours.
      const accents = platforms.length ? platforms.map((p) => new THREE.Color(p.accentColor)) : [new THREE.Color(0x8a8a8a)];
      const cols = 7;
      const rows = 6;
      const margin = w * 0.09;
      const gridW = w - 2 * margin;
      const cell = gridW / cols;
      const cw = cell * 0.72;
      const ch = cw * 1.15;
      const top = h * 0.1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const base = accents[i % accents.length].clone();
          const tint = 0.75 + 0.5 * (((i * 7919) % 13) / 13);
          base.multiplyScalar(tint);
          const x = margin + c * cell + (cell - cw) / 2;
          const y = top + r * (ch + cell * 0.28);
          ctx.fillStyle = css(base);
          ctx.fillRect(x, y, cw, ch);
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(x + cw * 0.15, y + ch * 0.18, cw * 0.7, ch * 0.42); // label
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(x, y + ch - ch * 0.12, cw, ch * 0.12); // connector
        }
      }

      // Title block.
      const titleY = h * 0.73;
      ctx.fillStyle = '#f2ead8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const title = 'BIBLIOTHEK';
      const size = fitFontSize(ctx, title, w * 0.84, 96, 40, FONT, '900');
      ctx.font = `900 ${size}px ${FONT}`;
      ctx.fillText(title, w / 2, titleY);
      ctx.fillStyle = '#c9a44a';
      ctx.fillRect(w * 0.12, titleY + 18, w * 0.76, 3);
      ctx.fillStyle = '#b9b3a4';
      ctx.font = `600 ${Math.round(w * 0.045)}px ${FONT}`;
      ctx.fillText('A  V I D E O  G A M E  C O L L E C T I O N', w / 2, titleY + 56);
      const systems = platforms.length === 1 ? '1 SYSTEM' : `${platforms.length} SYSTEMS`;
      ctx.font = `500 ${Math.round(w * 0.04)}px ${FONT}`;
      ctx.fillStyle = '#8f9bb3';
      ctx.fillText(`${gameCount} GAMES  ·  ${systems}`, w / 2, titleY + 96);

      ctx.strokeStyle = 'rgba(242,234,216,0.35)';
      ctx.lineWidth = 3;
      ctx.strokeRect(w * 0.04, h * 0.03, w * 0.92, h * 0.94);
    };
  }

  /** A typographic poster for one platform: stripes in its accent colour and its short name writ large. */
  static platform(platform: Platform): PosterPainter {
    return (ctx, w, h) => {
      const accent = new THREE.Color(platform.accentColor);
      const dark = accent.clone().multiplyScalar(0.45);
      const light = accent.clone().lerp(new THREE.Color(0xffffff), 0.25);
      ctx.fillStyle = css(dark);
      ctx.fillRect(0, 0, w, h);

      // Diagonal stripes.
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-Math.PI / 6);
      const stripe = w * 0.09;
      for (let i = -12; i < 12; i++) {
        ctx.fillStyle = i % 2 ? css(accent) : css(light);
        ctx.globalAlpha = 0.25;
        ctx.fillRect(-w, i * stripe, 2 * w, stripe * 0.55);
      }
      ctx.restore();

      // Big short name in a plate.
      const plateH = h * 0.34;
      const plateY = h * 0.33;
      ctx.fillStyle = css(accent);
      ctx.fillRect(0, plateY, w, plateH);
      ctx.fillStyle = contrastText(accent);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const size = fitFontSize(ctx, platform.shortName, w * 0.8, Math.round(plateH * 0.8), 30, FONT, '900');
      ctx.font = `900 ${size}px ${FONT}`;
      ctx.fillText(platform.shortName, w / 2, plateY + plateH / 2);

      // Full name below, wrapped.
      ctx.fillStyle = '#f5f2ea';
      ctx.font = `700 ${Math.round(w * 0.06)}px ${FONT}`;
      ctx.textBaseline = 'alphabetic';
      const lines = wrapLines(ctx, platform.name.toUpperCase(), w * 0.8, 3);
      lines.forEach((line, i) => ctx.fillText(line, w / 2, plateY + plateH + h * 0.09 + i * w * 0.075));

      ctx.font = `600 ${Math.round(w * 0.035)}px ${FONT}`;
      ctx.fillStyle = 'rgba(245,242,234,0.7)';
      ctx.fillText('B I B L I O T H E K   S E R I E S', w / 2, h * 0.09);
      ctx.strokeStyle = 'rgba(245,242,234,0.4)';
      ctx.lineWidth = 3;
      ctx.strokeRect(w * 0.04, h * 0.03, w * 0.92, h * 0.94);
    };
  }
}
