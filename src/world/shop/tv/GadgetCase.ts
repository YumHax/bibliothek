import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Furniture } from '../../Furniture';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint, standard, timber, METAL } from '../../materials/palette';
import { labelSheet, typed, type Label } from './labels';
import { RENDER_ORDER, WALL } from '../../surface/layers';

export interface GadgetCaseOptions {
  width?: number;
  /** The wooden cabinet's height; the glass box stands on it. Default 0.6. */
  base?: number;
}

const DEPTH = 0.45;
const GLASS_H = 0.36;
const GLASS = standard({ color: 0xe8f4f4, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2.4 });
const FELT = paint(0x2a3a5a, 1);
const BLACK = paint(0x1e1e20, 0.5);
const GREY = paint(0xb8b4ac, 0.5);

/**
 * The glass case by the till with the small things for sale second-hand (not for the flat): a Walkman with its
 * orange headphones, a grey handheld game console, remote controls, a pocket radio, cassettes, a calculator, each with
 * its little price card on blue felt; a wooden cabinet under the glass box, a sliding door behind. Floor-standing:
 * origin on the floor under its middle, the customer's side +z. Collides as its box.
 */
export class GadgetCase extends Prop implements Furniture {
  private readonly box: THREE.Box3;

  constructor(options: GadgetCaseOptions = {}) {
    super();
    this.name = 'GadgetCase';
    const W = options.width ?? 0.75;
    const B = options.base ?? 0.6;
    const wood = timber(0x6a4a30, 0.55);
    part(this, W, B, DEPTH, wood, { y: B / 2 });
    part(this, W + 0.02, 0.025, DEPTH + 0.02, wood, { y: B + 0.0125 });
    // Felt on the floor of the case, a glass shelf half way up on two brass rails.
    const floor = B + 0.025;
    part(this, W - 0.02, 0.006, DEPTH - 0.02, FELT, { y: floor + 0.003 });
    const shelfY = floor + GLASS_H * 0.5;
    for (const s of [-1, 1]) part(this, 0.012, 0.012, DEPTH - 0.04, METAL.agedBrass(), { x: (s * (W - 0.04)) / 2, y: shelfY - 0.01, z: 0 });
    // The glass: front, sides, top and the back's sliding panes, and the shelf, as one mesh.
    const T = 0.006;
    const panes = [
      new THREE.BoxGeometry(W, GLASS_H, T).translate(0, floor + GLASS_H / 2, DEPTH / 2 - T / 2),
      new THREE.BoxGeometry(W, GLASS_H, T).translate(0, floor + GLASS_H / 2, -DEPTH / 2 + T / 2),
      new THREE.BoxGeometry(T, GLASS_H, DEPTH - 2 * T).translate(-W / 2 + T / 2, floor + GLASS_H / 2, 0),
      new THREE.BoxGeometry(T, GLASS_H, DEPTH - 2 * T).translate(W / 2 - T / 2, floor + GLASS_H / 2, 0),
      new THREE.BoxGeometry(W, T, DEPTH).translate(0, floor + GLASS_H + T / 2, 0),
      new THREE.BoxGeometry(W - 0.03, T, DEPTH - 0.04).translate(0, shelfY, 0),
    ];
    const glass = new THREE.Mesh(mergeGeometries(panes), GLASS);
    for (const pane of panes) pane.dispose();
    glass.renderOrder = RENDER_ORDER.glass;
    this.add(glass);
    // Brass angles on the glass's corners.
    for (const x of [-W / 2, W / 2]) for (const z of [-DEPTH / 2, DEPTH / 2]) part(this, 0.012, GLASS_H + T, 0.012, METAL.agedBrass(), { x, y: floor + (GLASS_H + T) / 2, z });

    const cards: { x: number; y: number; z: number; label: Label }[] = [];
    const price = (x: number, y: number, z: number, text: string): void => {
      cards.push({ x, y, z, label: { width: 0.05, height: 0.028, paint: typed(text, { paper: '#f4f0e2', ink: '#b0302a' }) } });
    };
    // The bottom: the Walkman and its headphones, the handheld, the pocket radio.
    const low = floor + 0.006;
    part(this, 0.11, 0.03, 0.08, paint(0x3a6ab8, 0.4), { x: -W * 0.3, y: low + 0.015, z: 0.02 });
    part(this, 0.06, 0.001, 0.035, paint(0x1a1a1a, 0.2), { x: -W * 0.3, y: low + 0.031, z: 0.02 });
    const phones = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, 6, 16, Math.PI), paint(0x8a8a8e, 0.4));
    phones.position.set(-W * 0.3, low + 0.004, -0.08);
    phones.rotation.x = -Math.PI / 2;
    this.add(phones);
    for (const s of [-1, 1]) this.add(cylinderMesh(0.018, 0.012, paint(0xe8782a, 1), { x: -W * 0.3 + s * 0.05, y: low + 0.006, z: -0.08 }, { segments: 12 }));
    price(-W * 0.3, low + 0.001, 0.12, '12');
    // The handheld: grey, its green screen, the cross and the two buttons.
    const gb = new THREE.Group();
    gb.position.set(0, low, 0.0);
    gb.rotation.x = -Math.PI / 2 + 0.25;
    this.add(gb);
    part(gb, 0.09, 0.148, 0.032, GREY, { y: 0.074, z: 0.016 });
    part(gb, 0.058, 0.05, 0.002, paint(0x8a9a3a, 0.3), { y: 0.11, z: 0.033 });
    part(gb, 0.022, 0.007, 0.004, BLACK, { x: -0.02, y: 0.05, z: 0.033 });
    part(gb, 0.007, 0.022, 0.004, BLACK, { x: -0.02, y: 0.05, z: 0.033 });
    for (const [x, y] of [[0.017, 0.048], [0.03, 0.056]] as const) {
      const button = cylinderMesh(0.006, 0.004, paint(0x8a2a4a, 0.4), { x, y, z: 0.034 }, { segments: 10 });
      button.rotation.x = Math.PI / 2;
      gb.add(button);
    }
    price(0, low + 0.001, 0.12, '25');
    part(this, 0.1, 0.06, 0.03, paint(0xc8402e, 0.45), { x: W * 0.3, y: low + 0.03, z: 0 });
    part(this, 0.07, 0.035, 0.002, paint(0x8a8a8a, 0.4), { x: W * 0.3, y: low + 0.03, z: 0.016 });
    price(W * 0.3, low + 0.001, 0.12, '6');
    // The glass shelf: remotes side by side, a stack of cassettes, a calculator.
    const up = shelfY + 0.003;
    for (let i = 0; i < 3; i++) {
      const remote = part(this, 0.045, 0.018, 0.17, i === 1 ? GREY : BLACK, { x: -W * 0.32 + i * 0.06, y: up + 0.009, z: 0 });
      remote.rotation.y = (i - 1) * 0.08;
    }
    price(-W * 0.26, up + 0.001, 0.14, '2 each');
    for (let i = 0; i < 4; i++) {
      part(this, 0.1, 0.016, 0.065, paint(i % 2 ? 0xe8e2d4 : 0x2a2a2c, 0.35), { x: W * 0.05, y: up + 0.008 + i * 0.016, z: 0.01 }).rotation.y = (i - 1.5) * 0.12;
    }
    price(W * 0.05, up + 0.001, 0.12, '1');
    part(this, 0.07, 0.012, 0.11, paint(0x3a3a3c, 0.45), { x: W * 0.3, y: up + 0.006, z: 0 });
    part(this, 0.05, 0.001, 0.02, paint(0x8a9a7a, 0.2), { x: W * 0.3, y: up + 0.0125, z: -0.035 });
    price(W * 0.3, up + 0.001, 0.12, '3');
    // The price cards, lying flat, on one sheet.
    const meshes = labelSheet(cards.map((c) => c.label), 1400, WALL.print);
    meshes.forEach((mesh, i) => {
      const c = cards[i]!;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(c.x, c.y + 0.002, c.z);
      this.add(mesh);
    });
    this.box = new THREE.Box3(new THREE.Vector3(-W / 2, 0, -DEPTH / 2), new THREE.Vector3(W / 2, floor + GLASS_H + T, DEPTH / 2));
  }

  override get footprint(): THREE.Box3 {
    return this.box;
  }
}
