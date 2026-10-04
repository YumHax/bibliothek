import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { cloth, paint } from '../../materials/palette';
import { WALL, decal } from '../../surface/layers';
import { cutOut } from '../common/cutout';
import { HAND, PRINT } from '../common/lettering';
import { lcg } from '@/random';

/*
 * What lies on SECOND HOME's counter beside the till: the book of upholstery swatches fanned open for a customer, and
 * the delivery ledger (who gets what up which stairs today) with a biro in its gutter and a tape measure by it. Each
 * stands `on: 'counter'` at a spot of its own (clear of the till in the middle and the bell at the +x end).
 * Decoration: never collides; static, the parts merge (the ledger's pages are one canvas).
 */

/** The samples, in a few colours only (each colour is a draw of its own). */
const SWATCHES: readonly number[] = [0x8fa383, 0xc8785a, 0xc9a552, 0x3e4a5c, 0xd8c8a8, 0x8fa383, 0xc8785a];

/** The swatch book: a board cover and a fan of fabric samples, pinned at one corner. Origin on the counter at its middle. */
export class SwatchBook extends Prop {
  constructor(seed = 4) {
    super();
    this.name = 'SwatchBook';
    const random = lcg(seed);
    const W = 0.12;
    const L = 0.22;
    part(this, W + 0.01, 0.012, L + 0.01, paint(0x2a2826, 0.7), { y: 0.006 });
    // The fan: each sample turned a little further about the rivet at the near corner.
    const pivot = new THREE.Vector3(-W / 2 + 0.015, 0, L / 2 - 0.015);
    SWATCHES.forEach((color, i) => {
      const g = new THREE.Group();
      g.position.set(pivot.x, 0.012 + 0.003 * (i + 1), pivot.z);
      g.rotation.y = -i * 0.09 - random() * 0.02;
      part(g, W, 0.0025, L, cloth(color, 1), { x: W / 2 - 0.015, z: -L / 2 + 0.015 });
      this.add(g);
    });
    this.add(cylinderMesh(0.006, 0.006, paint(0xb8a070, 0.3), { x: pivot.x, y: 0.012 + 0.003 * (SWATCHES.length + 1) + 0.003, z: pivot.z }, { segments: 10 }));
  }
}

/** The delivery ledger open at today's page, a biro across it, a tape measure beside. Origin on the counter at its middle. */
export class DeliveryLedger extends Prop {
  constructor(seed = 8) {
    super();
    this.name = 'DeliveryLedger';
    const W = 0.3;
    const D = 0.21;
    const cover = paint(0x7a2a22, 0.7);
    const paper = paint(0xf2ecdc, 0.9);
    part(this, W + 0.012, 0.008, D + 0.01, cover, { y: 0.004 });
    // Two page blocks, a little raised to the spine.
    for (const sx of [-1, 1]) part(this, W / 2 - 0.004, 0.012, D, paper, { x: (sx * W) / 4, y: 0.008 + 0.006 });
    const pages = decal(W - 0.01, D - 0.008, cutOut(paintPages(seed), 0.9), WALL.paper, 'up');
    pages.position.y += 0.02;
    this.add(pages);
    // The biro in the gutter.
    const pen = cylinderMesh(0.004, 0.14, paint(0x2a4a8a, 0.4), { x: 0.02, y: 0.026, z: 0.01 }, { segments: 8 });
    pen.rotation.set(0, 0.3, Math.PI / 2);
    this.add(pen);
    // The tape measure at its -x side (the till is at its +x), a stub of yellow tape out of it.
    this.add(cylinderMesh(0.035, 0.03, paint(0xe8b830, 0.45), { x: -W / 2 - 0.06, y: 0.015, z: 0.03 }, { segments: 16 }));
    part(this, 0.06, 0.001, 0.014, paint(0xf0d040, 0.5), { x: -W / 2 - 0.06 + 0.05, y: 0.0005, z: 0.07 });
  }
}

/** Today's page: a date, then the deliveries in a biro hand, ruled lines, a few ticked. */
function paintPages(seed: number): THREE.Texture {
  const W = 480;
  const H = 336;
  const [canvas, ctx] = createCanvas(W, H);
  const random = lcg(seed * 17 + 3);
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(90,120,170,0.45)';
  ctx.lineWidth = 1.5;
  for (let y = 44; y < H - 10; y += 26) {
    for (const x0 of [12, W / 2 + 12]) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + W / 2 - 30, y);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#b8302a';
  ctx.font = `700 20px ${PRINT}`;
  ctx.fillText('DELIVERIES', 16, 30);
  ctx.fillStyle = '#1c2a4a';
  ctx.font = `600 17px ${HAND}`;
  const rows = ['Armchair · 5th fl, no lift', 'Bed · Park St 12', 'Dresser · back stairs', 'Kitchen table + 2', 'Rug x2 · Mme Roux', 'Lamp (shade!) · 3rd', 'Sideboard · Fri?', 'Mr. Dupont · wardrobe', 'Mirror · handle w/ care'];
  rows.forEach((row, i) => {
    const col = i < 5 ? 0 : 1;
    const x = col ? W / 2 + 16 : 16;
    const y = 40 + (col ? i - 5 : i) * 26 + (col ? 26 : 0);
    ctx.fillText(row, x, y + (random() - 0.5) * 3);
    if (random() < 0.5) ctx.fillText('✓', x + W / 2 - 50, y);
  });
  return toTexture(canvas);
}
