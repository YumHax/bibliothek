import * as THREE from 'three';
import { markShared } from '../props/Prop';
import { createCanvas } from '@/covers/generated/canvasUtils';

/** How bright the pool is at level 1 (additive, so small numbers go a long way on a dark carpet). */
const STRENGTH = 0.32;

/**
 * The patch of light a screen throws on the carpet in front of it: a soft elliptical glow in the
 * screen's colour, drawn additively on the floor (no light source: a point light per machine
 * would cost every pixel of the frame). The machine sets its level every frame from what its
 * screen is doing (brighter while a game runs, a flicker with the action). Adds colour without
 * touching the canvas alpha (see docs/graphics.md). Origin at its centre on the floor.
 */
export class GlowPool extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  constructor(color: number, width: number, depth: number) {
    const material = new THREE.MeshBasicMaterial({ map: radialTexture(), color, transparent: true, depthWrite: false, toneMapped: false, opacity: STRENGTH * 0.6 });
    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.SrcAlphaFactor;
    material.blendDst = THREE.OneFactor;
    material.blendSrcAlpha = THREE.ZeroFactor;
    material.blendDstAlpha = THREE.OneFactor;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    super(new THREE.PlaneGeometry(width, depth), material);
    this.name = 'GlowPool';
    this.rotation.x = -Math.PI / 2;
    this.position.y = 0.004;
    this.renderOrder = 1;
  }

  /** 0 (screen dark) .. 1 (a game running flat out). */
  setLevel(level: number): void {
    this.material.opacity = STRENGTH * THREE.MathUtils.clamp(level, 0, 1.4);
  }
}

let texture: THREE.CanvasTexture | null = null;
function radialTexture(): THREE.CanvasTexture {
  if (texture) return texture;
  const [canvas, ctx] = createCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  texture = markShared(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
