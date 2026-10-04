import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { paint } from '../materials/palette';
import { Prop, part } from './Prop';

interface SealedCartonModelOptions {
  /** What is written on it in marker ("ATTIC CLEAR-OUT"). */
  label: string;
  /** How many things are in it: the carton is as big as its load (3 to 7). */
  items: number;
  /** A tag on its side (a price, a lot number); none: no tag. */
  tag?: string;
}

const CARDBOARD = paint(0xa8794a, 0.92);
const TAPE = paint(0xcfa86e, 0.35);
const STRAP = paint(0x3a3a3c, 0.7);

/**
 * A sealed carton of odds and ends (`economy/boxLots.ts`): brown cardboard, the flaps taped shut both ways, a strip
 * of string round it, what it is scrawled in marker on a strip of masking tape on the lid, a paper tag hanging on the
 * front. As big as its load. Floor-standing, origin on the floor at its middle, +z its front. Looks only: the
 * wrappers (the market's corner, the saleroom's stand, the hallway) own the click.
 */
export class SealedCartonModel extends Prop {
  readonly size: THREE.Vector3;
  /** The tape on the lid: what catches the light when the carton is looked at (`HoverGlint.of`). */
  readonly tape: THREE.Mesh[];
  private readonly textures: THREE.Texture[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor(options: SealedCartonModelOptions) {
    super();
    this.name = 'SealedCarton';
    const k = THREE.MathUtils.clamp((options.items - 3) / 4, 0, 1);
    const w = 0.4 + k * 0.16;
    const h = 0.28 + k * 0.1;
    const d = 0.32 + k * 0.08;
    this.size = new THREE.Vector3(w, h, d);
    part(this, w, h, d, CARDBOARD, { y: h / 2 });
    // Tape across the lid's join and down both faces, and the string round it the other way.
    this.tape = [part(this, w + 0.004, 0.003, 0.06, TAPE, { y: h + 0.0015 }), part(this, 0.06, 0.003, d + 0.004, TAPE, { y: h + 0.003 })];
    for (const mesh of [
      ...this.tape,
      part(this, 0.06, h * 0.45, 0.003, TAPE, { y: h * 0.775, z: d / 2 + 0.0015 }),
      part(this, 0.06, h * 0.45, 0.003, TAPE, { y: h * 0.775, z: -d / 2 - 0.0015 }),
      part(this, 0.006, 0.004, d + 0.012, STRAP, { x: w * 0.3, y: h + 0.004 }),
      part(this, 0.006, h, 0.004, STRAP, { x: w * 0.3, y: h / 2, z: d / 2 + 0.004 }),
      part(this, 0.006, h, 0.004, STRAP, { x: w * 0.3, y: h / 2, z: -d / 2 - 0.004 }),
    ]) mesh.castShadow = false;
    // The marker on masking tape across the lid, beside the tape's cross.
    const labelMat = this.material(labelTexture(options.label));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.42, 0.07), labelMat);
    label.rotation.x = -Math.PI / 2;
    // A millimetre over the tape it crosses (whose top is h + 4.5 mm).
    label.position.set(-w * 0.22, h + 0.0055, d * 0.18);
    this.add(label);
    if (options.tag) {
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.055), this.material(tagTexture(options.tag)));
      tag.position.set(-w * 0.25, h * 0.55, d / 2 + 0.006);
      tag.rotation.z = 0.08;
      this.add(tag);
    }
  }

  dispose(): void {
    for (const t of this.textures) t.dispose();
    for (const m of this.materials) m.dispose();
  }

  private material(texture: THREE.Texture): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 });
    this.textures.push(texture);
    this.materials.push(mat);
    return mat;
  }
}

/** Black marker on a strip of masking tape. */
function labelTexture(text: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(384, 72);
  ctx.fillStyle = '#e8dcb8';
  ctx.fillRect(0, 0, 384, 72);
  ctx.fillStyle = '#16140f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let px = 40;
  do {
    ctx.font = `bold ${px}px "Comic Sans MS", "Marker Felt", cursive`;
    px -= 2;
  } while (ctx.measureText(text).width > 360 && px > 14);
  ctx.fillText(text, 192, 38);
  return toTexture(canvas);
}

/** A paper tag with a lot number or a price. */
function tagTexture(text: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(180, 110);
  ctx.fillStyle = '#f3ecd8';
  ctx.fillRect(0, 0, 180, 110);
  ctx.strokeStyle = '#8a7a5a';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 172, 102);
  ctx.fillStyle = '#2a1a10';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText(text, 90, 58);
  return toTexture(canvas);
}
