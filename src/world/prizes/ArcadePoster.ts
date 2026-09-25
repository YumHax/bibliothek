import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { boxMesh } from '../meshUtils';
import { matte, Prop } from '../props/Prop';
import { type OwnedPrizes, showWhenOwned } from './ownedPrize';

export interface ArcadePosterOptions {
  prizes: OwnedPrizes;
  /** The prize that brings it home. Default 'poster'. */
  prizeId?: string;
  width?: number;
  height?: number;
}

/**
 * The arcade poster won at the prize counter, framed on the bedroom wall: NEON SHERIFF's one-sheet
 * (a neon cowboy against a pink sunset over the saloon, the title in chrome letters, "NOW AT THE
 * ARCADE"). Hidden until the prize is owned. Wall-hung: origin at its centre on the wall, +z into
 * the room. Decoration: never collides.
 */
export class ArcadePoster extends Prop {
  private readonly unsubscribe: () => void;

  constructor(options: ArcadePosterOptions) {
    super();
    this.name = 'ArcadePoster';
    const width = options.width ?? 0.5;
    const height = options.height ?? 0.7;
    const art = new THREE.Group();
    art.add(boxMesh(width + 0.04, height + 0.04, 0.02, matte(0x111114, 0.4), { z: 0.01 }));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: paintPoster(), roughness: 0.35 }));
    face.position.z = 0.021;
    art.add(face);
    this.add(art);
    this.unsubscribe = showWhenOwned(options.prizes, options.prizeId ?? 'poster', art, null);
  }

  dispose(): void {
    this.unsubscribe();
  }
}

function paintPoster(): THREE.Texture {
  const W = 500;
  const H = 700;
  const [canvas, ctx] = createCanvas(W, H);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#12051f');
  sky.addColorStop(0.45, '#6a1a5a');
  sky.addColorStop(0.62, '#ff5a8a');
  sky.addColorStop(0.64, '#1a0a1a');
  sky.addColorStop(1, '#0a0510');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // A striped sun going down behind the saloon.
  ctx.save();
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.62, 150, Math.PI, 0);
  ctx.clip();
  const sun = ctx.createLinearGradient(0, H * 0.62 - 150, 0, H * 0.62);
  sun.addColorStop(0, '#ffe066');
  sun.addColorStop(1, '#ff2fa0');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#6a1a5a';
  for (let y = H * 0.62 - 60; y < H * 0.62; y += 18) ctx.fillRect(0, y, W, 6);
  ctx.restore();
  // The saloon's silhouette and the neon cowboy.
  ctx.fillStyle = '#0a0510';
  ctx.fillRect(60, H * 0.5, W - 120, H * 0.14);
  ctx.fillRect(130, H * 0.45, W - 260, H * 0.06);
  ctx.strokeStyle = '#33e0ff';
  ctx.lineWidth = 6;
  ctx.shadowColor = '#33e0ff';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 70, H * 0.3);
  ctx.lineTo(W / 2 + 70, H * 0.3); // hat brim
  ctx.moveTo(W / 2 - 35, H * 0.3);
  ctx.lineTo(W / 2 - 30, H * 0.24);
  ctx.lineTo(W / 2 + 30, H * 0.24);
  ctx.lineTo(W / 2 + 35, H * 0.3);
  ctx.moveTo(W / 2, H * 0.32);
  ctx.lineTo(W / 2, H * 0.52); // body
  ctx.moveTo(W / 2, H * 0.36);
  ctx.lineTo(W / 2 + 90, H * 0.34); // gun arm
  ctx.moveTo(W / 2, H * 0.52);
  ctx.lineTo(W / 2 - 40, H * 0.63);
  ctx.moveTo(W / 2, H * 0.52);
  ctx.lineTo(W / 2 + 40, H * 0.63);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // The title in chrome, the tagline.
  const chrome = ctx.createLinearGradient(0, 40, 0, 150);
  chrome.addColorStop(0, '#ffffff');
  chrome.addColorStop(0.5, '#9ad6ff');
  chrome.addColorStop(0.52, '#3a2a6a');
  chrome.addColorStop(1, '#ffb3c6');
  ctx.fillStyle = chrome;
  ctx.font = 'bold 74px "Press Start 2P", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEON', W / 2, 105);
  ctx.fillText('SHERIFF', W / 2, 185);
  ctx.fillStyle = '#ffd23a';
  ctx.font = 'bold 26px "Press Start 2P", Impact, sans-serif';
  ctx.fillText('NOW AT THE ARCADE', W / 2, H - 70);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '16px sans-serif';
  ctx.fillText('ONE COIN · SIX SHOTS · NO MERCY', W / 2, H - 36);
  return toTexture(canvas, 4);
}
