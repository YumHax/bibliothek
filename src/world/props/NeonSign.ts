import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { boxMesh } from '../meshUtils';
import { matte, Prop } from './Prop';

export interface NeonSignOptions {
  /** The word(s) in glass tubing. Default ARCADE. */
  text?: string;
  /** Colour of the neon. Default hot pink. */
  color?: number;
  /** Width of the lettering. Default 2. */
  width?: number;
  /** Height of the lettering. Default a third of the width. */
  height?: number;
  /** Intensity of the light the sign throws on the wall and the floor; 0 for none. Default 3. */
  intensity?: number;
  /** Whether a tube stutters now and then, as old neon does. Default true. */
  flicker?: boolean;
  /** Font family of the lettering. Default a rounded bold sans. */
  font?: string;
  seed?: number;
}

const PX_PER_M = 400;
/** The black acrylic panel the tubes are mounted on, and how far the tubes stand off it. */
const PANEL_T = 0.025;
const STANDOFF = 0.03;
const PANEL = matte(0x0b0a0f, 0.4);
const STANDOFF_MAT = matte(0x2a2a30, 0.4);

/**
 * A neon sign: the text as glowing glass tubing (a white-hot core in a coloured halo) on a black
 * panel, with its own coloured point light so the wall and floor around it take the tint. Now and
 * then a tube stutters for a fraction of a second (`flicker`). Wall-hung: origin at the centre, on
 * the wall, +z into the room. Decoration: never collides.
 */
export class NeonSign extends Prop implements Updatable {
  private readonly tubes: THREE.MeshBasicMaterial;
  private readonly light: THREE.PointLight | null;
  private readonly intensity: number;
  private readonly flicker: boolean;
  private readonly random: () => number;
  /** Seconds until the next stutter; while one is on, `stutterLeft` counts it down and `blink` flips every few hundredths. */
  private nextStutter: number;
  private stutterLeft = 0;
  private blinkClock = 0;
  private dim = false;

  constructor(options: NeonSignOptions = {}) {
    super();
    this.name = 'NeonSign';
    const text = options.text ?? 'ARCADE';
    const color = new THREE.Color(options.color ?? 0xff2fa0);
    const width = options.width ?? 2;
    const height = options.height ?? width / 3;
    this.intensity = options.intensity ?? 3;
    this.flicker = options.flicker ?? true;
    this.random = seededRandom((options.seed ?? 1) * 7331);
    this.nextStutter = 2 + this.random() * 6;

    const panel = boxMesh(width + 0.12, height + 0.1, PANEL_T, PANEL, { z: PANEL_T / 2 });
    panel.castShadow = false;
    this.add(panel);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const standoff = boxMesh(0.02, 0.02, STANDOFF, STANDOFF_MAT, { x: sx * (width / 2 - 0.05), y: sy * (height / 2 - 0.02), z: PANEL_T + STANDOFF / 2 });
        standoff.castShadow = false;
        this.add(standoff);
      }
    }

    this.tubes = new THREE.MeshBasicMaterial({ map: paintTubes(text, width, height, color, options.font), transparent: true, toneMapped: false, depthWrite: false });
    const lettering = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.tubes);
    lettering.position.z = PANEL_T + STANDOFF;
    lettering.castShadow = false;
    lettering.receiveShadow = false;
    this.add(lettering);

    if (this.intensity > 0) {
      this.light = new THREE.PointLight(color, this.intensity, 0, 2);
      this.light.position.set(0, 0, 0.35);
      this.light.castShadow = false;
      this.add(this.light);
    } else {
      this.light = null;
    }
  }

  update(dt: number): void {
    if (!this.flicker) return;
    if (this.stutterLeft > 0) {
      this.stutterLeft -= dt;
      this.blinkClock -= dt;
      if (this.blinkClock <= 0) {
        this.blinkClock = 0.03 + this.random() * 0.05;
        this.setDim(this.random() < 0.55);
      }
      if (this.stutterLeft <= 0) {
        this.setDim(false);
        this.nextStutter = 3 + this.random() * 9;
      }
      return;
    }
    this.nextStutter -= dt;
    if (this.nextStutter <= 0) {
      this.stutterLeft = 0.15 + this.random() * 0.35;
      this.blinkClock = 0;
    }
  }

  private setDim(dim: boolean): void {
    if (dim === this.dim) return;
    this.dim = dim;
    this.tubes.opacity = dim ? 0.3 : 1;
    if (this.light) this.light.intensity = dim ? this.intensity * 0.25 : this.intensity;
  }
}

/** The lettering as tubing: a wide soft halo in the colour, a tube stroke over it, a near-white core down the middle. */
function paintTubes(text: string, wM: number, hM: number, color: THREE.Color, font?: string): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(hM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  const family = font ?? '"Arial Rounded MT Bold", "Helvetica Neue", Helvetica, Arial, sans-serif';
  const hex = `#${color.getHexString()}`;
  // Size the font to the box: start tall, shrink until the word fits with a margin.
  let px = Math.round(H * 0.8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  do {
    ctx.font = `bold ${px}px ${family}`;
    px -= 4;
  } while (ctx.measureText(text).width > W * 0.86 && px > 10);
  const x = W / 2;
  const y = H / 2 + px * 0.04;
  // Halo: the colour bled into the dark around the tubes.
  ctx.shadowColor = hex;
  ctx.shadowBlur = px * 0.35;
  ctx.strokeStyle = hex;
  ctx.lineWidth = px * 0.1;
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 3; i++) ctx.strokeText(text, x, y);
  ctx.globalAlpha = 1;
  // The tube itself, then its white-hot core.
  ctx.shadowBlur = px * 0.12;
  ctx.lineWidth = px * 0.085;
  ctx.strokeText(text, x, y);
  ctx.shadowBlur = 0;
  const core = color.clone().lerp(new THREE.Color(0xffffff), 0.8);
  ctx.strokeStyle = `#${core.getHexString()}`;
  ctx.lineWidth = px * 0.035;
  ctx.strokeText(text, x, y);
  return toTexture(canvas, 4);
}
