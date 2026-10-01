import * as THREE from 'three';
import { Prop } from '../../props/Prop';
import { cylinderMesh } from '../../meshUtils';
import { METAL, paint } from '../../materials/palette';
import { WALL, onSurface } from '../../surface/layers';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { POSTER, setLines } from '../common/lettering';

export interface DonationTinOptions {
  /** The wrapper's words, the first bigger. */
  lines?: string[];
}

const R = 0.045;
const H = 0.13;

/**
 * The animal rescue's collecting tin on the counter: a painted tin wrapped in its paper band (a paw, the rescue's
 * name), a slot in the lid, a coin or two beside it. The shop's, not the flat's. Origin on the counter under the tin.
 * Decoration: never collides.
 */
export class DonationTin extends Prop {
  constructor(options: DonationTinOptions = {}) {
    super();
    this.name = 'DonationTin';
    this.add(cylinderMesh(R, H, paint(0xe8b830, 0.45), { y: H / 2 }, { segments: 20 }));
    this.add(cylinderMesh(R + 0.002, 0.008, METAL.satinSteel(), { y: H + 0.004 }, { segments: 20 }));
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.006), paint(0x1a1a1a, 0.8));
    slot.rotation.x = -Math.PI / 2;
    slot.position.y = H + 0.0085;
    this.add(slot);
    // The paper band round it: a curved strip of the wrapper, facing the customer.
    const [canvas, ctx] = createCanvas(320, 160);
    ctx.fillStyle = '#f0ead8';
    ctx.fillRect(0, 0, 320, 160);
    ctx.fillStyle = '#2f6a6a';
    ctx.fillRect(0, 0, 320, 26);
    ctx.fillRect(0, 134, 320, 26);
    setLines(ctx, { lines: options.lines ?? ['RESCUE FUND', 'every coin feeds a stray'], x: 12, y: 32, w: 296, h: 96, family: POSTER, color: '#2f6a6a', weight: '400' });
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.0015, R + 0.0015, H * 0.6, 20, 1, true, -Math.PI / 2, Math.PI),
      onSurface(new THREE.MeshStandardMaterial({ map: toTexture(canvas), roughness: 0.85 }), WALL.paper),
    );
    band.position.y = H / 2;
    this.add(band);
    for (const [x, z] of [[0.07, 0.02], [0.085, -0.015]] as const) this.add(cylinderMesh(0.011, 0.002, METAL.brass(), { x, y: 0.001, z }, { segments: 14 }));
  }
}
