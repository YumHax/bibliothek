import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { MONO } from '@/covers/generated/canvasUtils';

/** How a screen says it has no picture: a tuner's `snow` (a CRT) or a projector's blue source `slate`. */
export type SignalLook = 'snow' | 'slate';
/** What it shows: nothing (the set is off), looking for a signal, or none found. */
export type SignalScene = 'idle' | 'search' | 'nosignal';

/** Size of the canvas: blocky on purpose, an on-screen display is not sharp. */
const W = 320;
const H = 240;
/** The snow's own resolution, scaled up without smoothing. */
const SNOW_W = 160;
const SNOW_H = 120;
/** Repaints a second: snow flickers, a slate only animates its dots. */
const SNOW_FPS = 20;
const SLATE_FPS = 4;
const OSD_GREEN = '#46ff78';
const SLATE_BLUE = '#1b3fae';

/**
 * The one canvas and texture a `VideoSurface` draws its no-picture looks on, reused for every
 * message (never a new canvas per state): repainted while it animates (`update`), untouched while idle.
 */
export class SignalCanvas {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly snowCtx: CanvasRenderingContext2D;
  private readonly snowImage: ImageData;
  private scene: SignalScene = 'idle';
  private since = 0;
  private elapsed = 0;
  /** Where the rolling bar of brighter snow is, 0..1 down the picture. */
  private roll = Math.random();

  constructor(
    private readonly look: SignalLook,
    /** The idle glass colour (a switched-off tube's grey-green). */
    private readonly idleColor: string,
    /** The channel the OSD shows over the snow. */
    private readonly channel = 3,
  ) {
    const [canvas, ctx] = createCanvas(W, H);
    this.ctx = ctx;
    const [, snowCtx] = createCanvas(SNOW_W, SNOW_H);
    this.snowCtx = snowCtx;
    this.snowImage = snowCtx.createImageData(SNOW_W, SNOW_H);
    this.texture = toTexture(canvas);
    this.paint();
  }

  get current(): SignalScene {
    return this.scene;
  }

  show(scene: SignalScene): void {
    this.scene = scene;
    this.elapsed = 0;
    this.since = 0;
    this.paint();
  }

  update(dt: number): void {
    if (this.scene === 'idle') return;
    this.elapsed += dt;
    this.since += dt;
    this.roll = (this.roll + dt * 0.18) % 1;
    if (this.since < 1 / (this.look === 'snow' ? SNOW_FPS : SLATE_FPS)) return;
    this.since = 0;
    this.paint();
  }

  dispose(): void {
    this.texture.dispose();
  }

  private paint(): void {
    const { ctx } = this;
    if (this.scene === 'idle') {
      ctx.fillStyle = this.look === 'snow' ? this.idleColor : '#000';
      ctx.fillRect(0, 0, W, H);
    } else if (this.look === 'snow') this.paintSnow();
    else this.paintSlate();
    this.texture.needsUpdate = true;
  }

  /** Static with a slow rolling bar; the channel number top right, "NO SIGNAL" once the search gave up. */
  private paintSnow(): void {
    const { ctx } = this;
    const lost = this.scene === 'nosignal';
    const { data } = this.snowImage;
    const bar = this.roll * SNOW_H;
    for (let y = 0; y < SNOW_H; y++) {
      const d = Math.abs(y - bar);
      const row = (lost ? 0.55 : 1) * (0.8 + 0.25 * Math.max(0, 1 - Math.min(d, SNOW_H - d) / 14));
      for (let x = 0; x < SNOW_W; x++) {
        const i = (y * SNOW_W + x) * 4;
        const v = (Math.random() * 190 + 30) * row;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v + 10;
        data[i + 3] = 255;
      }
    }
    this.snowCtx.putImageData(this.snowImage, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.snowCtx.canvas, 0, 0, W, H);

    ctx.font = `bold 22px ${MONO}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    this.osd(`CH ${String(this.channel).padStart(2, '0')}`, W - 18, 16);
    if (lost) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold 26px ${MONO}`;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(W / 2 - 88, H / 2 - 22, 176, 44);
      this.osd('NO SIGNAL', W / 2, H / 2);
    }
  }

  /** On-screen display text: bright green with a hard black drop, like a tuner's. */
  private osd(text: string, x: number, y: number): void {
    this.ctx.fillStyle = '#000';
    this.ctx.fillText(text, x + 2, y + 2);
    this.ctx.fillStyle = OSD_GREEN;
    this.ctx.fillText(text, x, y);
  }

  /** A projector's blue screen: "Source search" with walking dots, or "No signal" in a box. */
  private paintSlate(): void {
    const { ctx } = this;
    ctx.fillStyle = SLATE_BLUE;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8eefc';
    if (this.scene === 'search') {
      ctx.font = `18px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`Source search${'.'.repeat(Math.floor(this.elapsed * 2) % 4)}`, 18, 16);
    } else {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `20px ${MONO}`;
      ctx.strokeStyle = '#e8eefc';
      ctx.lineWidth = 2;
      ctx.strokeRect(W / 2 - 80, H / 2 - 20, 160, 40);
      ctx.fillText('No signal', W / 2, H / 2);
    }
  }
}
