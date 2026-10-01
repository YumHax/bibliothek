import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Furniture } from '../../Furniture';
import { cylinderMesh } from '../../meshUtils';
import { part } from '../../props/Prop';
import { METAL, paint, standard } from '../../materials/palette';
import { WALL, decal } from '../../surface/layers';
import { createCanvas, seededRandom, toTexture } from '@/graphics/canvas';
import { HAND, setLines } from '../common/lettering';

export interface TreatBinOptions {
  /** What the strip along its front says. */
  label?: string;
  seed?: number;
}

const W = 0.54;
const D = 0.36;
const TOP = 0.9;
const BIN = { width: 0.16, height: 0.14, depth: 0.3 };
/** What is in each bin: biscuit bones, chews, fishy nibbles. */
const TREATS: readonly (readonly number[])[] = [
  [0xc89a5a, 0xb8804a, 0xd8b078],
  [0x8a3a2a, 0xa84a32, 0x6a2a1e],
  [0xd8c8a0, 0xe8a060, 0xc8b890],
];

/**
 * The pick & mix of treats by the counter: a steel stand, three clear bins tilted towards the customer, each heaped
 * with its own treats (biscuit bones, chews, fishy nibbles), a scoop hanging off the rail, and a handwritten strip
 * along the front. The shop's, not the flat's. The bins' plastic is one see-through mesh; the rest merges. Origin
 * on the floor under its middle, the customer's side +z. Collides as its box.
 */
export class TreatBin extends THREE.Group implements Furniture {
  readonly footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, -D / 2), new THREE.Vector3(W / 2, TOP + BIN.height + 0.04, D / 2));

  constructor(options: TreatBinOptions = {}) {
    super();
    this.name = 'TreatBin';
    const random = seededRandom(options.seed ?? 53);
    const steel = METAL.satinSteel();
    // The stand: four legs, a shelf, the tray the bins sit in.
    for (const x of [-1, 1]) for (const z of [-1, 1]) this.add(cylinderMesh(0.012, TOP, steel, { x: (x * (W - 0.03)) / 2, y: TOP / 2, z: (z * (D - 0.03)) / 2 }, { segments: 8 }));
    part(this, W, 0.015, D, steel, { y: 0.2 });
    part(this, W, 0.05, D, paint(0x2f6a6a, 0.5), { y: TOP - 0.015 });
    // The bins, tilted towards the customer, each heaped with its treats.
    const plastic: THREE.BufferGeometry[] = [];
    const tilt = new THREE.Matrix4().makeRotationX(0.25);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * (BIN.width + 0.012);
      const bin = new THREE.Group();
      bin.position.set(x, TOP + 0.01 + BIN.height / 2, 0);
      bin.rotation.x = 0.25;
      this.add(bin);
      plastic.push(new THREE.BoxGeometry(BIN.width, BIN.height, BIN.depth).applyMatrix4(tilt).translate(x, TOP + 0.01 + BIN.height / 2, 0));
      const colours = TREATS[i]!;
      for (let k = 0; k < 16; k++) {
        const c = colours[Math.floor(random() * colours.length)]!;
        const piece = part(bin, 0.03 + random() * 0.015, 0.012, 0.014, paint(c, 0.85), {
          x: (random() - 0.5) * (BIN.width - 0.04),
          y: BIN.height * 0.1 + random() * BIN.height * 0.25,
          z: (random() - 0.5) * (BIN.depth - 0.05),
        });
        piece.rotation.set(random() * 0.6, random() * Math.PI, random() * 0.6);
      }
      // The heap's body under the loose pieces.
      part(bin, BIN.width - 0.01, BIN.height * 0.35, BIN.depth - 0.01, paint(colours[0]!, 0.95), { y: -BIN.height * 0.2 });
    }
    const bins = new THREE.Mesh(mergeGeometries(plastic.map((g) => g.toNonIndexed()))!, standard({ color: 0xeef6f8, roughness: 0.08, transparent: true, opacity: 0.22, depthWrite: false }));
    for (const g of plastic) g.dispose();
    bins.castShadow = false;
    bins.receiveShadow = false;
    this.add(bins);
    // The rail across the front and the scoop hanging from it.
    const rail = cylinderMesh(0.006, W, steel, { y: TOP - 0.07, z: D / 2 + 0.015 }, { segments: 8 });
    rail.rotation.z = Math.PI / 2;
    this.add(rail);
    const scoop = new THREE.Group();
    scoop.position.set(W * 0.34, TOP - 0.17, D / 2 + 0.03);
    part(scoop, 0.015, 0.1, 0.01, paint(0xe8e4dc, 0.4), { y: 0.05 });
    part(scoop, 0.07, 0.05, 0.05, paint(0xe8e4dc, 0.4), { y: -0.02 });
    this.add(scoop);
    // The strip along the front of the tray.
    const strip = decal(W - 0.02, 0.04, new THREE.MeshStandardMaterial({ map: paintStrip(options.label ?? 'PICK & MIX TREATS · a scoop 1c'), roughness: 0.8 }), WALL.print);
    strip.position.set(0, TOP - 0.015, D / 2 + WALL.print.lift);
    this.add(strip);
  }
}

function paintStrip(text: string): THREE.Texture {
  const [canvas, ctx] = createCanvas(512, 48);
  ctx.fillStyle = '#fbf6e4';
  ctx.fillRect(0, 0, 512, 48);
  setLines(ctx, { lines: [text], x: 12, y: 4, w: 488, h: 40, family: HAND, color: '#2f6a6a' });
  return toTexture(canvas);
}
