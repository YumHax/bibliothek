import * as THREE from 'three';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { fabric } from '@/world/materials/finishes';
import { Prop } from './Prop';

export interface CarpetBorderOptions {
  /** The floor it runs round (the room's width and depth), metres. */
  width: number;
  depth: number;
  /** Width of the band, and its distance from the walls. Default 0.22 and 0.12. */
  band?: number;
  inset?: number;
  /** The band's two neon colours. */
  colors?: [number, number];
}

const TILE_M = 0.5;
const THICKNESS = 0.004;

/**
 * A neon border woven into the carpet a little in from the walls: a band of chevrons between two
 * bright lines, running round the whole floor, so the hall reads as a designed space and not just
 * a box with a floor. Four thin strips, lying on the carpet. Place at the zone's origin.
 * Decoration: never collides.
 */
export class CarpetBorder extends Prop {
  constructor(options: CarpetBorderOptions) {
    super();
    this.name = 'CarpetBorder';
    const band = options.band ?? 0.22;
    const inset = options.inset ?? 0.12;
    const [a, b] = options.colors ?? [0x33e0ff, 0xff2fa0];
    const texture = paintBand(a, b);
    const halfW = options.width / 2 - inset - band / 2;
    const halfD = options.depth / 2 - inset - band / 2;
    // Front and back strips along x, the side strips along z between them.
    const strips: [x: number, z: number, length: number, alongX: boolean][] = [
      [0, -halfD, halfW * 2 + band, true],
      [0, halfD, halfW * 2 + band, true],
      [-halfW, 0, halfD * 2 - band, false],
      [halfW, 0, halfD * 2 - band, false],
    ];
    for (const [x, z, length, alongX] of strips) {
      const map = texture.clone();
      map.wrapS = THREE.RepeatWrapping;
      map.repeat.set(length / TILE_M, 1);
      const mat = fabric({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.35, roughness: 1 });
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(length, band), mat);
      strip.rotation.x = -Math.PI / 2;
      if (!alongX) strip.rotation.z = Math.PI / 2;
      strip.position.set(x, THICKNESS, z);
      strip.receiveShadow = true;
      strip.castShadow = false;
      this.add(strip);
    }
  }
}

function paintBand(a: number, b: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(128, 56);
  const hex = (n: number): string => `#${new THREE.Color(n).getHexString()}`;
  ctx.fillStyle = '#100c18';
  ctx.fillRect(0, 0, 128, 56);
  ctx.fillStyle = hex(a);
  ctx.fillRect(0, 3, 128, 4);
  ctx.fillRect(0, 49, 128, 4);
  ctx.strokeStyle = hex(b);
  ctx.lineWidth = 6;
  ctx.lineJoin = 'miter';
  for (let x = -32; x < 160; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x + 16, 16);
    ctx.lineTo(x + 32, 40);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
