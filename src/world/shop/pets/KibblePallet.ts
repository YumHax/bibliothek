import * as THREE from 'three';
import type { Furniture } from '../../Furniture';
import { part } from '../../props/Prop';
import { paint, timber } from '../../materials/palette';
import { WALL, onSurface } from '../../surface/layers';
import { createCanvas, seededRandom, toTexture } from '@/graphics/canvas';
import { POSTER, PRINT, setLines } from '../common/lettering';

export interface KibblePalletOptions {
  seed?: number;
}

const PALLET = { width: 0.8, depth: 0.6, height: 0.12 };
const SACK = { width: 0.38, height: 0.13, depth: 0.27 };
/** The brands: the sack's colour, its label's colours and words. */
const BRANDS: readonly { sack: number; band: string; ink: string; lines: [string, string] }[] = [
  { sack: 0xc8402e, band: '#f0c040', ink: '#2a1a10', lines: ['CRUNCHY CAT', 'chicken · 10 kg'] },
  { sack: 0x2e6ab8, band: '#f0ead8', ink: '#1e3a6a', lines: ['WOOF!', 'adult dog · 15 kg'] },
  { sack: 0x3a8a4a, band: '#f4e8b0', ink: '#1e4a22', lines: ['BUNNY MIX', 'hay & carrot · 5 kg'] },
  { sack: 0x5a3a7a, band: '#e8c8f0', ink: '#2a1a3a', lines: ['PURR PREMIUM', 'salmon · 7 kg'] },
];
const PX = { w: 256, h: 128 };

/**
 * Sacks of kibble stacked on a pallet in the corner, four laid flat, two more over them and one stood up against them, each
 * with its brand's label (one canvas for the four brands, each label a patch of it): the pet shop's bulk stock, not
 * the flat's. Static: its parts merge (the labels share one material). Origin on the floor under the pallet's middle,
 * the labels facing +z. Collides as its box.
 */
export class KibblePallet extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: KibblePalletOptions = {}) {
    super();
    this.name = 'KibblePallet';
    const random = seededRandom(options.seed ?? 29);
    const pine = timber(0xb89a6a, 0.8);
    // The pallet: three runners, the top boards across them.
    for (const x of [-1, 0, 1]) part(this, 0.08, PALLET.height - 0.02, PALLET.depth, pine, { x: (x * (PALLET.width - 0.08)) / 2, y: (PALLET.height - 0.02) / 2, z: 0 });
    for (let i = 0; i < 5; i++) part(this, PALLET.width, 0.02, 0.095, pine, { y: PALLET.height - 0.01, z: -PALLET.depth / 2 + 0.05 + i * ((PALLET.depth - 0.1) / 4) });
    const labels = onSurface(new THREE.MeshStandardMaterial({ map: paintLabels(), roughness: 0.7 }), WALL.print);
    let top = PALLET.height;
    for (let layer = 0; layer < 2; layer++) {
      // Two rows on the pallet, the front one only on top of them.
      for (let i = 0; i < 2; i++) {
        const brand = Math.floor(random() * BRANDS.length);
        // Spaced so two turned sacks and their bulging sides never overlap (their tops in one plane would fight).
        const x = (i - 0.5) * (SACK.width + 0.05) + (random() - 0.5) * 0.02;
        const z = layer === 0 ? 0.13 : 0.14;
        this.sack(x, top, z, brand, labels, (random() - 0.5) * 0.06, random);
        if (layer === 0) this.sack(x, top, -0.14, Math.floor(random() * BRANDS.length), labels, (random() - 0.5) * 0.06, random);
      }
      top += SACK.height;
    }
    // One stood on end against the stack.
    const brand = Math.floor(random() * BRANDS.length);
    const standing = new THREE.Group();
    standing.position.set(PALLET.width / 2 - 0.06, PALLET.height + SACK.width / 2, -0.18);
    standing.rotation.set(0, -0.3, Math.PI / 2 - 0.08);
    this.add(standing);
    part(standing, SACK.width, SACK.height, SACK.depth, paint(BRANDS[brand]!.sack, 0.75));
    this.footprint = new THREE.Box3(new THREE.Vector3(-PALLET.width / 2, 0, -PALLET.depth / 2), new THREE.Vector3(PALLET.width / 2, top + 0.02, PALLET.depth / 2));
  }

  /** A sack lying flat, its top `y` the stack's, its label on the face towards +z, a little turned. */
  private sack(x: number, y: number, z: number, brand: number, labels: THREE.Material, yaw: number, random: () => number): void {
    const bag = new THREE.Group();
    bag.position.set(x, y + SACK.height / 2, z);
    bag.rotation.y = yaw;
    this.add(bag);
    const look = BRANDS[brand]!;
    part(bag, SACK.width, SACK.height, SACK.depth, paint(look.sack, 0.75));
    // The folded, sewn ends.
    for (const s of [-1, 1]) part(bag, 0.02, SACK.height * 0.7, SACK.depth * 0.92, paint(look.sack, 0.8), { x: (s * (SACK.width + 0.012)) / 2 });
    // Only the front row's labels show.
    if (z < 0) return;
    const label = new THREE.Mesh(labelGeometry(SACK.width * 0.72, SACK.height * 0.72, brand), labels);
    label.position.set((random() - 0.5) * 0.02, 0, SACK.depth / 2 + WALL.print.lift);
    bag.add(label);
  }
}

/** A plane showing brand `i`'s patch of the labels' canvas (four patches side by side). */
function labelGeometry(width: number, height: number, i: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, height);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / BRANDS.length);
  uv.needsUpdate = true;
  return g;
}

function paintLabels(): THREE.Texture {
  const [canvas, ctx] = createCanvas(PX.w * BRANDS.length, PX.h);
  BRANDS.forEach((brand, i) => {
    const x = i * PX.w;
    ctx.fillStyle = brand.band;
    ctx.fillRect(x, 0, PX.w, PX.h);
    ctx.fillStyle = `#${brand.sack.toString(16).padStart(6, '0')}`;
    ctx.fillRect(x, PX.h * 0.78, PX.w, PX.h * 0.22);
    setLines(ctx, { lines: [brand.lines[0]], x: x + PX.w * 0.06, y: PX.h * 0.06, w: PX.w * 0.88, h: PX.h * 0.46, family: POSTER, color: brand.ink, weight: '400' });
    setLines(ctx, { lines: [brand.lines[1]], x: x + PX.w * 0.1, y: PX.h * 0.52, w: PX.w * 0.8, h: PX.h * 0.24, family: PRINT, color: brand.ink });
    // A paw on the corner.
    ctx.fillStyle = brand.ink;
    const px = x + PX.w * 0.9;
    const py = PX.h * 0.88;
    for (const [dx, dy, r] of [[0, 0, 5], [-6, -7, 2.4], [0, -9, 2.4], [6, -7, 2.4]] as const) {
      ctx.beginPath();
      ctx.arc(px + dx, py + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return toTexture(canvas);
}
