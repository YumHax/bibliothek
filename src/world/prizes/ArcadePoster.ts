import * as THREE from 'three';
import { boxMesh } from '../meshUtils';
import { Prop } from '../props/Prop';
import { paint } from '../materials/palette';
import { layMesh, WALL } from '../surface/layers';
import { type OwnedPrizes, showWhenOwned } from './ownedPrize';
import { paintArcadePoster } from '../arcade/posterArt';

interface ArcadePosterOptions {
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
    art.add(boxMesh(width + 0.04, height + 0.04, 0.02, paint(0x111114, 0.4), { z: 0.01 }));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: paintPoster(), roughness: 0.35 }));
    face.position.z = 0.02 + WALL.framed.lift; // off the frame's face
    layMesh(face, WALL.framed);
    art.add(face);
    this.add(art);
    this.unsubscribe = showWhenOwned(options.prizes, options.prizeId ?? 'poster', art, null);
  }

  dispose(): void {
    this.unsubscribe();
  }
}

function paintPoster(): THREE.Texture {
  return paintArcadePoster({
    title: ['NEON', 'SHERIFF'],
    tagline: 'NOW AT THE ARCADE',
    small: 'ONE COIN · SIX SHOTS · NO MERCY',
    sky: ['#12051f', '#6a1a5a', '#ff5a8a'],
    sun: ['#ffe066', '#ff2fa0'],
    figure: paintCowboy,
  });
}

/** The saloon's silhouette on the horizon and the neon cowboy over it. */
function paintCowboy(ctx: CanvasRenderingContext2D, W: number, H: number): void {
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
}
