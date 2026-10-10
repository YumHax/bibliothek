import * as THREE from 'three';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { sharedCanvasTexture } from '../materials/sharedResources';
import { paint, shared } from '../materials/palette';
import { Prop } from '../props/Prop';

/** The doily's thickness (m): a slab of cotton thread. */
export const DOILY_THICKNESS = 0.0015;
const SEGMENTS = 48;

/** The lace, once for the page: rings of petals and holes round a rosette, a scalloped rim, the gaps see-through. */
function laceCanvas(): HTMLCanvasElement {
  const S = 256;
  const [canvas, ctx] = createCanvas(S, S);
  const c = S / 2;
  ctx.fillStyle = '#f4efe2';
  ctx.beginPath();
  // The scalloped rim: a wave round the circle.
  for (let i = 0; i <= 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    const r = c * (0.93 + 0.06 * Math.cos(a * 24));
    if (i === 0) ctx.moveTo(c + r * Math.cos(a), c + r * Math.sin(a));
    else ctx.lineTo(c + r * Math.cos(a), c + r * Math.sin(a));
  }
  ctx.fill();
  // The holes: rings of round eyes, and the petals' gaps of the rosette.
  ctx.globalCompositeOperation = 'destination-out';
  for (const [ring, count, size] of [
    [0.82, 36, 0.035],
    [0.66, 24, 0.05],
    [0.48, 18, 0.04],
    [0.3, 12, 0.035],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const a = ((i + (ring > 0.5 ? 0.5 : 0)) / count) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(c + ring * c * Math.cos(a), c + ring * c * Math.sin(a), size * c, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(c + 0.14 * c * Math.cos(a), c + 0.14 * c * Math.sin(a), 0.07 * c, 0.025 * c, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/** The lace's material: cut out where the thread is not (alpha test, so it draws with the opaque things). */
function lace(): THREE.MeshStandardMaterial {
  return shared('grandma-doily-lace', () => new THREE.MeshStandardMaterial({ map: sharedCanvasTexture('grandma-doily-lace', laceCanvas), alphaTest: 0.5, roughness: 0.95, side: THREE.DoubleSide }));
}

/**
 * A crocheted lace doily lying on a surface (Mémé's sideboard, her side table, under the phone): a round of white
 * cotton, its holes cut out of the top. Origin on the surface under its middle; whatever stands on it stands
 * `DOILY_THICKNESS` higher. `stretch` makes it an oval (a runner under the set). Decoration: never collides.
 */
export class Doily extends Prop {
  readonly contactShadow = false;

  constructor(radius = 0.12, stretch = 1) {
    super();
    this.name = 'Doily';
    // The rim a plain band; the top and bottom the lace (the bottom seen through the holes is the same lace).
    const geometry = new THREE.CylinderGeometry(radius, radius, DOILY_THICKNESS, SEGMENTS);
    const mesh = new THREE.Mesh(geometry, [paint(0xf4efe2, 0.95), lace(), lace()]);
    mesh.position.y = DOILY_THICKNESS / 2;
    mesh.scale.x = stretch;
    mesh.receiveShadow = true;
    this.add(mesh);
  }
}
