import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { repaintWhenFontLoads } from '@/graphics/fontReady';
import { boxMesh } from '../meshUtils';
import { Prop } from '../props/Prop';
import { paint } from '../materials/palette';
import { layMesh, WALL } from '../surface/layers';
import { lcg } from '@/random';
import { PIXEL_FONT } from './games/ArcadeGame';

export interface ArcadeMuralOptions {
  width?: number;
  height?: number;
  /** The words sprayed across it. */
  words?: string;
  seed?: number;
}

const PX_PER_M = 400;
/** The hardboard's thickness. */
const BOARD_T = 0.012;

/**
 * The airbrushed panel every nineties arcade had over its machines: a purple night over a neon
 * grid, mountains in two tones of pink, lightning, a sprinkle of stars, the words in chrome with
 * a soft spray halo. A hardboard panel screwed to the wall (a thin black edge round it).
 * Wall-hung: origin at its centre on the wall, +z into the room. Decoration: never collides.
 */
export class ArcadeMural extends Prop {
  constructor(options: ArcadeMuralOptions = {}) {
    super();
    this.name = 'ArcadeMural';
    const width = options.width ?? 2.6;
    const height = options.height ?? 0.55;
    this.add(boxMesh(width + 0.02, height + 0.02, BOARD_T, paint(0x0c0a10, 0.5), { z: BOARD_T / 2 }));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: paintMural(width, height, options.words ?? 'PLAYER ONE', options.seed ?? 1), roughness: 0.6 }));
    face.position.z = BOARD_T + WALL.framed.lift;
    layMesh(face, WALL.framed);
    face.receiveShadow = true;
    this.add(face);
  }
}

function paintMural(width: number, height: number, words: string, seed: number): THREE.Texture {
  const W = Math.round(width * PX_PER_M);
  const H = Math.round(height * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  const paintIt = (): void => {
    const random = lcg(seed * 7919);
    const horizon = H * 0.66;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#0d0420');
    sky.addColorStop(0.6, '#3a0f5a');
    sky.addColorStop(1, '#c2307a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon);
    ctx.fillStyle = '#08030f';
    ctx.fillRect(0, horizon, W, H - horizon);
    // Stars, sprayed: soft dots.
    for (let i = 0; i < 90; i++) {
      const x = random() * W;
      const y = random() * horizon * 0.8;
      const r = 0.6 + random() * 1.6;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + random() * 0.6})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Two ranges of mountains, the far one paler.
    for (const [tone, rise, step] of [['#5a1a6a', 0.42, 70], ['#2a0a3a', 0.26, 46]] as const) {
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      for (let x = 0; x <= W + step; x += step) ctx.lineTo(x, horizon - H * rise * (0.35 + random() * 0.65));
      ctx.lineTo(W, horizon);
      ctx.fill();
    }
    // The neon grid on the ground.
    ctx.strokeStyle = '#ff2fa0';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    for (let i = -20; i <= 20; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * 30, horizon);
      ctx.lineTo(W / 2 + i * 160, H);
      ctx.stroke();
    }
    for (let k = 1; k < 7; k++) {
      const y = horizon + (H - horizon) * Math.pow(k / 7, 1.7);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Lightning bolts either side.
    ctx.strokeStyle = '#33e0ff';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#33e0ff';
    ctx.shadowBlur = 14;
    for (const x0 of [W * 0.12, W * 0.88]) {
      ctx.beginPath();
      let x = x0;
      let y = 6;
      ctx.moveTo(x, y);
      while (y < horizon * 0.85) {
        x += (random() - 0.5) * 40;
        y += 14 + random() * 18;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // The words: a sprayed halo, then chrome.
    const size = Math.min(Math.round(H * 0.32), Math.floor((W * 0.7) / Math.max(1, words.length)));
    ctx.font = `${size}px ${PIXEL_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff7ad9';
    ctx.shadowBlur = size * 0.8;
    ctx.fillStyle = '#ff7ad9';
    ctx.fillText(words, W / 2, H * 0.38);
    ctx.shadowBlur = 0;
    const chrome = ctx.createLinearGradient(0, H * 0.38 - size / 2, 0, H * 0.38 + size / 2);
    chrome.addColorStop(0, '#ffffff');
    chrome.addColorStop(0.48, '#9ad6ff');
    chrome.addColorStop(0.52, '#3a2a6a');
    chrome.addColorStop(1, '#ffb3c6');
    ctx.fillStyle = '#12051f';
    ctx.fillText(words, W / 2 + 4, H * 0.38 + 4);
    ctx.fillStyle = chrome;
    ctx.fillText(words, W / 2, H * 0.38);
  };
  paintIt();
  const texture = toTexture(canvas, 'facing');
  repaintWhenFontLoads(`40px ${PIXEL_FONT}`, () => {
    paintIt();
    texture.needsUpdate = true;
  });
  return texture;
}
