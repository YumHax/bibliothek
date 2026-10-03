import * as THREE from 'three';
import { FLOOR, RENDER_ORDER, onSurface } from '../surface/layers';
import { radialGlow } from '@/world/materials/glowTextures';
import { additive } from '@/world/materials/blend';

/** How bright the pool is at level 1 (additive, so small numbers go a long way on a dark carpet). */
const STRENGTH = 0.32;

/**
 * The patch of light a screen throws on the carpet in front of it: a soft elliptical glow in the
 * screen's colour, drawn additively on the floor (no light source: a point light per machine
 * would cost every pixel of the frame). The machine sets its level every frame from what its
 * screen is doing (brighter while a game runs, a flicker with the action). Adds colour without
 * touching the canvas alpha (see docs/graphics.md). Lies on the floor as `FLOOR.glowPool`. Origin at
 * its centre on the floor.
 */
export class GlowPool extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  constructor(color: number, width: number, depth: number) {
    const material = new THREE.MeshBasicMaterial({ map: radialGlow({ width: 128, height: 128, stops: [[0, 1], [0.35, 0.55], [1, 0]] }), color, transparent: true, depthWrite: false, opacity: STRENGTH * 0.6 });
    additive(material);
    super(new THREE.PlaneGeometry(width, depth), onSurface(material, FLOOR.glowPool));
    this.name = 'GlowPool';
    this.rotation.x = -Math.PI / 2;
    this.position.y = FLOOR.glowPool.lift;
    this.renderOrder = RENDER_ORDER.groundGlow;
  }

  /** 0 (screen dark) .. 1 (a game running flat out). */
  setLevel(level: number): void {
    this.material.opacity = STRENGTH * THREE.MathUtils.clamp(level, 0, 1.4);
  }
}
