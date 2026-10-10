import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { markShared, sharedCanvasTexture } from '../materials/sharedResources';
import { cylinderMesh } from '../meshUtils';
import { part } from '../props/Prop';
import { METAL, paint, shared, timber } from '../materials/palette';
import { PROUD, SEAM } from '../props/joinery';

const H = 0.88;
const D = 0.45;
const OFF_WALL = 0.02;
const TOP = 0.025;
const PLINTH = 0.08;
/** How far the top overhangs the front and each side, the doors' thickness, a knob's length, a tin's lid. */
const OVER = 0.012;
const FACE = 0.018;
const KNOB = 0.022;
const LID = 0.012;
/** The tins on top: their label, colour, radius and height. */
const TINS: readonly [label: string, color: number, r: number, h: number][] = [
  ['FLOUR', 0xd8c8a0, 0.07, 0.2],
  ['SUGAR', 0x9ab8c8, 0.06, 0.17],
  ['COFFEE', 0xb84a3a, 0.055, 0.15],
  ['TEA', 0x4a7a5a, 0.045, 0.12],
];

/** The tins' labels, once for the page: a band of cream with the word in a 1950s script. */
function labelsCanvas(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(512, 64 * TINS.length);
  TINS.forEach(([label], i) => {
    ctx.fillStyle = '#f2ead6';
    ctx.fillRect(0, i * 64, 512, 64);
    ctx.fillStyle = '#3a2a1a';
    ctx.font = 'italic bold 38px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // The word round the tin, twice, so it reads from the front whichever way it was put down.
    ctx.fillText(label, 128, i * 64 + 34);
    ctx.fillText(label, 384, i * 64 + 34);
  });
  return canvas;
}

/** Tin `i`'s label material: the shared canvas, its row picked by the texture's offset. */
function labelOf(i: number): THREE.MeshStandardMaterial {
  return shared(`grandma-tin-label-${i}`, () => {
    // A copy of the shared canvas's texture for this row, kept for the page with its material.
    const map = markShared(sharedCanvasTexture('grandma-tin-labels', labelsCanvas).clone());
    map.repeat.set(1, 1 / TINS.length);
    map.offset.set(0, 1 - (i + 1) / TINS.length);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map, roughness: 0.6 });
  });
}

/**
 * The low dresser beside Mémé's cooker (`furnishGrandmaDecor`): a painted cupboard of two doors and a drawer under a
 * scrubbed wooden top, her row of enamel tins on it (flour, sugar, coffee, tea) and the bread bin. Origin on the floor
 * at the wall, front towards +z; `wall` placement with `y: 0`. Collides.
 */
export class KitchenDresser extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  readonly topHeight = H;

  constructor(width = 0.8) {
    super();
    this.name = 'KitchenDresser';
    const painted = paint(0xd8dcc0, 0.55);
    const z = OFF_WALL + D / 2;
    part(this, width - 0.04, PLINTH, D - 0.04, paint(0x3a3a32, 0.7), { y: PLINTH / 2, z });
    const bodyH = H - PLINTH - TOP;
    part(this, width, bodyH, D, painted, { y: PLINTH + bodyH / 2, z });
    part(this, width + 2 * OVER, TOP, D + OVER, timber(0xc8a878, 0.7), { y: H - TOP / 2 + SEAM, z: OFF_WALL + (D + OVER) / 2 });
    // The drawer's front and the two doors, apart from each other, proud of the carcass; their brass knobs.
    const front = OFF_WALL + D;
    const drawerH = 0.14;
    const doorH = bodyH - drawerH - 3 * 0.02;
    const doorW = (width - 0.06) / 2;
    const face = paint(0xe4e6cc, 0.5);
    const faceZ = front + PROUD + FACE / 2;
    part(this, width - 0.04, drawerH, FACE, face, { y: H - TOP - 0.02 - drawerH / 2, z: faceZ });
    for (const s of [-1, 1]) part(this, doorW - SEAM, doorH, FACE, face, { x: s * (doorW / 2 + 0.01), y: PLINTH + 0.02 + doorH / 2, z: faceZ });
    const brass = METAL.agedBrass();
    const knob = (x: number, y: number) => {
      const k = cylinderMesh(0.014, KNOB, brass, { x, y, z: front + PROUD + FACE + KNOB / 2 }, { segments: 12 });
      k.rotation.x = Math.PI / 2;
      this.add(k);
    };
    knob(0, H - TOP - 0.02 - drawerH / 2);
    for (const s of [-1, 1]) knob(s * 0.06, PLINTH + 0.02 + doorH * 0.7);
    // The tins, tallest at the back left.
    const top = H + 2 * SEAM;
    let x = -width / 2 + 0.1;
    TINS.forEach(([, color, r, h], i) => {
      const enamel = paint(color, 0.3);
      const tz = z - 0.06 + (i % 2) * 0.05;
      const body = cylinderMesh(r, h, enamel, { x, y: top + h / 2, z: tz }, { segments: 20 });
      this.add(body);
      const label = new THREE.Mesh(new THREE.CylinderGeometry(r + PROUD, r + PROUD, h * 0.32, 20, 1, true), labelOf(i));
      label.position.set(x, top + h * 0.5, tz);
      this.add(label);
      this.add(cylinderMesh(r + PROUD, LID, paint(0xe8e2d4, 0.4), { x, y: top + h + SEAM + LID / 2, z: tz }, { segments: 20 }));
      x += 2 * r + 0.025;
    });
    // The bread bin: a rolled-top box at the right end.
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.3, 20, 1, false, 0, Math.PI), paint(0xe8e0c8, 0.35));
    // Its axis along the wall, the round of it up.
    bin.rotation.z = Math.PI / 2;
    bin.position.set(width / 2 - 0.17, top, z);
    bin.castShadow = true;
    this.add(bin);
    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2, 0, 0), new THREE.Vector3(width / 2, H, OFF_WALL + D + 0.03));
  }
}
