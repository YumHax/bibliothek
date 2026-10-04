import * as THREE from 'three';
import { Prop, part } from '../../props/Prop';
import { cylinderMesh } from '../../meshUtils';
import { paint, standard } from '../../materials/palette';
import { WALL, onSurface } from '../../surface/layers';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { HAND, setLines } from '../common/lettering';
import { lcg } from '@/random';

export interface TreatJarOptions {
  /** The label's words. */
  label?: string[];
  seed?: number;
}

const R = 0.065;
const H = 0.16;

/**
 * A glass jar of dog biscuits on the counter, its red lid off beside it, a handwritten label on the glass ("one for
 * every good dog"): the biscuits heaped inside, bone-shaped. The shop's, not the flat's. Origin on the counter under
 * the jar. Decoration: never collides.
 */
export class TreatJar extends Prop {
  constructor(options: TreatJarOptions = {}) {
    super();
    this.name = 'TreatJar';
    const random = lcg(options.seed ?? 19);
    // The biscuits: a heap filling the jar two thirds, a few loose ones on top.
    this.add(cylinderMesh(R - 0.006, H * 0.62, paint(0xc8904a, 0.95), { y: H * 0.31 + 0.005 }, { segments: 16 }));
    const biscuit = paint(0xd8a060, 0.9);
    for (let i = 0; i < 6; i++) {
      const b = part(this, 0.04, 0.01, 0.014, biscuit, { x: (random() - 0.5) * R, y: H * 0.64 + random() * 0.012, z: (random() - 0.5) * R });
      b.rotation.set(random() * 0.5, random() * Math.PI, random() * 0.5);
    }
    const glass = cylinderMesh(R, H, standard({ color: 0xeef6f4, roughness: 0.05, transparent: true, opacity: 0.2, depthWrite: false }), { y: H / 2 }, { segments: 20 });
    glass.castShadow = false;
    this.add(glass);
    // The lid set down beside it.
    this.add(cylinderMesh(R + 0.006, 0.02, paint(0xc83a3a, 0.45), { x: R * 2 + 0.02, y: 0.01, z: -0.02 }, { segments: 20 }));
    // The label, a card taped to the glass.
    const [canvas, ctx] = createCanvas(240, 150);
    ctx.fillStyle = '#fbf6e4';
    ctx.fillRect(0, 0, 240, 150);
    setLines(ctx, { lines: options.label ?? ['FREE!', 'one for every', 'good dog'], x: 10, y: 8, w: 220, h: 134, family: HAND, color: '#c83a3a', firstScale: 1.6 });
    const arc = 0.08 / R;
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(R + WALL.notice.lift, R + WALL.notice.lift, 0.05, 12, 1, true, -arc / 2, arc),
      onSurface(new THREE.MeshStandardMaterial({ map: toTexture(canvas), roughness: 0.85 }), WALL.notice),
    );
    label.position.y = H * 0.45;
    this.add(label);
  }
}
