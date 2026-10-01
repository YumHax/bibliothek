import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Prop, part } from '../../props/Prop';
import { mergeStaticParts } from '../../zone/mergeStatic';
import { cloth, paint } from '../../materials/palette';
import { CatBed } from '../../cat/CatBed';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { HAND, setLines } from '../common/lettering';

export interface ShopCatOptions {
  /** The fur and the tabby's darker stripes. Default a grey-brown tabby. */
  fur?: number;
  stripes?: number;
  /** The bed's colour. */
  bed?: number;
  /** What the little tent card beside the bed says (none if empty). */
  card?: string[];
}

/** How deep the cat breathes, and how fast. */
const BREATH = { depth: 0.035, rate: 1.6 };

/**
 * The shop's own cat, asleep in the window: curled nose to tail in a round bed (`cat/CatBed`), a simple low-poly
 * cat (a round back, the head tucked on the paws, the ears, the tail wrapped round the front), breathing slowly, and a
 * tent card beside the bed saying who she is. The same cat the street sees through the glass (docs/shops.md). Not
 * the rescue cat for sale: the shop's. Origin on the surface under the bed's middle. Decoration: never collides.
 */
export class ShopCat extends Prop implements Updatable {
  private readonly body: THREE.Group;
  private time = Math.random() * 10;

  constructor(options: ShopCatOptions = {}) {
    super();
    this.name = 'ShopCat';
    const bed = new CatBed({ color: options.bed ?? 0x8a6a8a, diameter: 0.4 });
    this.add(bed);
    const fur = cloth(options.fur ?? 0x8a7a6a);
    const dark = cloth(options.stripes ?? 0x4a3e34);
    const pale = cloth(0xe8e0d4);
    this.body = new THREE.Group();
    this.body.position.y = 0.06;
    this.body.rotation.y = 0.5;
    this.add(this.body);
    // The back, a round loaf, and the stripes across it.
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10).scale(1.25, 0.62, 1), fur);
    back.position.set(0, 0.058, -0.01);
    this.body.add(back);
    for (let i = 0; i < 4; i++) {
      const x = -0.07 + i * 0.045;
      // The back's cross-section where the stripe crosses it (the loaf is 0.125 long each way), the stripe on it.
      const k = Math.sqrt(1 - (x / 0.125) ** 2) + 0.02;
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 4, 16, Math.PI), dark);
      stripe.scale.set(k, 0.62 * k, 1);
      stripe.rotation.y = Math.PI / 2;
      stripe.position.set(x, 0.058, -0.01);
      this.body.add(stripe);
    }
    // The head on the front paws, turned in.
    const head = new THREE.Group();
    head.position.set(0.1, 0.045, 0.06);
    head.rotation.y = -0.9;
    this.body.add(head);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10).scale(1, 0.85, 1.05), fur));
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8).scale(1, 0.7, 1), pale);
    muzzle.position.set(0.035, -0.012, 0);
    head.add(muzzle);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.035, 4), fur);
      ear.position.set(-0.005, 0.042, s * 0.026);
      ear.rotation.set(s * 0.35, 0, 0.2);
      head.add(ear);
      // Shut eyes: a dark line each.
      part(head, 0.004, 0.003, 0.014, paint(0x1e1a18, 0.6), { x: 0.044, y: 0.008, z: s * 0.017 });
    }
    const paws = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6).scale(1.6, 0.6, 1), pale);
    paws.position.set(0.12, 0.012, 0.09);
    paws.rotation.y = -0.9;
    this.body.add(paws);
    // The tail, wrapped round the front, its tip darker.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.12, 0.02, -0.03),
      new THREE.Vector3(-0.1, 0.018, 0.08),
      new THREE.Vector3(0.0, 0.016, 0.12),
      new THREE.Vector3(0.1, 0.016, 0.115),
    ]);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.018, 7, false), fur);
    this.body.add(tail);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), dark);
    tip.position.set(0.1, 0.016, 0.115);
    this.body.add(tip);
    this.body.traverse((o) => (o.castShadow = true));
    // The cat breathes as a whole: her parts merge within her.
    mergeStaticParts(this.body);

    if (options.card?.length) this.add(tentCard(options.card));
  }

  update(dt: number): void {
    this.time += dt;
    const breath = 1 + BREATH.depth * Math.sin(this.time * BREATH.rate);
    this.body.scale.set(1, breath, 1 + (breath - 1) * 0.4);
  }
}

/** A folded card standing beside the bed, its words on the face towards +z. */
function tentCard(lines: string[]): THREE.Object3D {
  const W = 0.12;
  const H = 0.075;
  const [canvas, ctx] = createCanvas(360, 225);
  ctx.fillStyle = '#fbf6e4';
  ctx.fillRect(0, 0, 360, 225);
  ctx.fillStyle = '#2f6a6a';
  ctx.fillRect(0, 0, 360, 22);
  setLines(ctx, { lines, x: 16, y: 34, w: 328, h: 176, family: HAND, color: '#2a2622' });
  const card = new THREE.Group();
  card.position.set(0.2, 0, 0.14);
  card.rotation.y = -0.35;
  const face = new THREE.MeshStandardMaterial({ map: toTexture(canvas), roughness: 0.85 });
  const plain = paint(0xfbf6e4, 0.85);
  const lean = 0.28;
  for (const s of [1, -1]) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(W, H), s > 0 ? face : plain);
    leaf.position.set(0, (H / 2) * Math.cos(lean), (s * H * Math.sin(lean)) / 2);
    leaf.rotation.x = -s * lean;
    if (s < 0) leaf.rotation.y = Math.PI;
    card.add(leaf);
  }
  return card;
}
