import * as THREE from 'three';
import type { TriBuilder } from '../relief/TriBuilder';
import { CARD_ASPECT, type ShopfrontAtlas } from './shopfrontCanvas';
import { FULL_UV, type TexQuads } from './TexQuads';
import { at, ball, cylinder, pick } from './shapes';
import type { CardId, DisplayId } from './shopfrontPlan';

/** Where a window display's pieces go: what the street's light falls on, what has its own light, the screens, the cards. */
export interface DisplayParts {
  /** Lit by the scene (and softly by the shop at night). */
  solid: TriBuilder;
  /** Lamp shades and aquarium water: their own light. */
  lit: TriBuilder;
  /** CRT glass showing the snow. */
  screens: TexQuads;
  /** Lit quads of the atlas: the test card. */
  glowing: TexQuads;
  /** Painted quads of the atlas: the cards. */
  cards: TexQuads;
  atlas: ShopfrontAtlas;
}

/** The glass stands at z 0.45 in a display's frame: nothing reaches past this. */
const FRONT_Z = 0.42;
const CASES = ['#5a5a5e', '#d8d2c4', '#2a2a2c', '#8a3a2a', '#6a6f74', '#b8b0a0'];
const BLOOMS = ['#e0567a', '#f0f0e8', '#b04ac0', '#f09a3a', '#e84a5a', '#f0d040', '#d87ab8'];
const LEAF = '#4d7a3a';
const COAT = '#9a8e84';

/** A card standing on the display floor (or on something `y` high), leaning back a little. */
function card(parts: DisplayParts, m: THREE.Matrix4, id: CardId, x: number, y: number, z: number, width = 0.26, yaw = 0): void {
  const h = width / CARD_ASPECT;
  parts.cards.quad(m, x, y + h / 2, z, width, h, parts.atlas.tile(id), yaw, -0.14);
}

/**
 * Builds window display `id` into `parts`, in the frame `m` (origin on the display floor in the middle of the window,
 * x along it, y up, z out towards the glass at 0.45), for a window `width` wide. Low-poly pieces, merged with the rest.
 */
export function buildDisplay(id: DisplayId, parts: DisplayParts, m: THREE.Matrix4, width: number, random: () => number): void {
  const half = width / 2 - 0.1;
  DISPLAYS[id](parts, m, half, random);
}

type Builder = (parts: DisplayParts, m: THREE.Matrix4, half: number, random: () => number) => void;

const DISPLAYS: Record<DisplayId, Builder> = {
  // TV REPAIR: three portable sets stacked on a crate, all tuned to snow, and the REPAIRS card.
  tvStack: (parts, m, half, random) => {
    const { solid } = parts;
    solid.box(m, 0, 0.06, 0.24, 1.08, 0.12, 0.34, '#8a6a44');
    tv(parts, m, -0.27, 0.12, 0.5, 0.38, 0.34, pick(random, CASES), 'snow');
    tv(parts, m, 0.27, 0.12, 0.48, 0.36, 0.34, pick(random, CASES), 'snow');
    tv(parts, m, 0.0, 0.5, 0.44, 0.32, 0.3, pick(random, CASES), 'snow');
    // Its aerial.
    for (const side of [-1, 1]) solid.box(at(m, side * 0.08, 0.95, 0.26, 0, 0, side * -0.45), 0, 0, 0, 0.008, 0.26, 0.008, '#b8bcc0');
    card(parts, m, 'repairs', Math.min(half - 0.14, 0.72), 0, 0.36);
  },
  // TV REPAIR: a set on legs showing the test card, a wireless on the floor, boxes of valves, ALL SETS TESTED.
  tvBench: (parts, m, half, random) => {
    const { solid } = parts;
    const x = -Math.min(0.4, half - 0.3);
    for (const [dx, dz] of [[-0.24, 0.1], [0.24, 0.1], [-0.24, 0.34], [0.24, 0.34]] as const) solid.box(m, x + dx, 0.08, dz, 0.025, 0.16, 0.025, '#2a2420');
    tv(parts, m, x, 0.16, 0.58, 0.46, 0.36, '#6a4a30', 'test');
    // The wireless: a wooden cabinet, its grille cloth and its dial.
    const r = 0.22;
    solid.box(m, r, 0.12, 0.3, 0.38, 0.24, 0.18, '#7a5234');
    solid.box(m, r - 0.06, 0.12, 0.392, 0.22, 0.16, 0.006, '#c8b890');
    solid.box(m, r + 0.13, 0.13, 0.392, 0.08, 0.1, 0.006, '#e8dcb8');
    card(parts, m, 'tested', r, 0.24, 0.3, 0.24);
    // Boxes of valves, stacked.
    const v = Math.min(half - 0.08, 0.62);
    for (let i = 0; i < 6; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      solid.box(m, v - 0.09 + col * 0.075, 0.065 + row * 0.13, 0.3 + (random() - 0.5) * 0.02, 0.065, 0.12, 0.065, pick(random, ['#e8762a', '#efe6d2', '#f0f0f0', '#2e5a8a']));
    }
  },
  // PAWS & CLAWS: a cat asleep in her bed, toy mice, a little scratching post, the card about the rescue cat.
  catBed: (parts, m, half, _random) => {
    const { solid } = parts;
    const x = -0.08;
    const z = 0.23;
    const ring = new THREE.TorusGeometry(0.15, 0.055, 8, 20);
    solid.geometry(at(m, x, 0.055, z, Math.PI / 2, 0, 0, 1, 1, 0.9), ring, '#c86a4a');
    ring.dispose();
    cylinder(solid, m, x, 0, z, 0.15, 0.15, 0.05, '#efe6d2', 16);
    // Curled up: the body, the head tucked in, two ears, the tail round the front.
    ball(solid, m, x, 0.1, z - 0.01, 0.13, 0.07, 0.1, COAT, 0.3);
    ball(solid, m, x + 0.09, 0.1, z + 0.06, 0.055, 0.05, 0.05, COAT, 0.3);
    const ear = new THREE.ConeGeometry(0.018, 0.035, 4);
    for (const side of [-1, 1]) solid.geometry(at(m, x + 0.09 + side * 0.025, 0.155, z + 0.05, 0, 0, side * -0.3), ear, '#7a6e64');
    ear.dispose();
    const tail = new THREE.TorusGeometry(0.1, 0.017, 5, 12, Math.PI * 0.9);
    solid.geometry(at(m, x - 0.01, 0.08, z + 0.01, Math.PI / 2, 0, 0.4), tail, '#7a6e64');
    tail.dispose();
    // Toy mice.
    for (const [mx, mz, color, turn] of [[0.26, 0.36, '#8a8a8a', 0.4], [0.38, 0.24, '#e0a0a8', -0.9]] as const) {
      ball(solid, m, mx, 0.022, mz, 0.035, 0.022, 0.02, color, turn);
      solid.box(at(m, mx, 0.006, mz, 0, turn, 0), -0.06, 0, 0, 0.06, 0.004, 0.004, '#c8a0a0');
    }
    // The scratching post.
    const p = Math.min(half - 0.14, 0.62);
    solid.box(m, p, 0.015, 0.22, 0.28, 0.03, 0.28, '#d8c8a8');
    cylinder(solid, m, p, 0.03, 0.22, 0.04, 0.04, 0.5, '#c8a878', 8);
    solid.box(m, p, 0.545, 0.22, 0.26, 0.03, 0.26, '#d8c8a8');
    solid.box(m, p + 0.1, 0.45, 0.3, 0.004, 0.18, 0.004, '#e8e0d0');
    ball(solid, m, p + 0.1, 0.35, 0.3, 0.025, 0.025, 0.025, '#d9383a');
    card(parts, m, 'adopt', -Math.min(half - 0.14, 0.62), 0, 0.36);
  },
  // PAWS & CLAWS: sacks of food piled up, a pyramid of tins, a small aquarium on its stand.
  petFood: (parts, m, half, random) => {
    const { solid, lit } = parts;
    const bags = ['#c8402e', '#2e6ab8', '#e8b830', '#3a8a4a', '#8a3a8a'];
    const bx = -Math.min(half - 0.36, 0.45);
    for (let i = 0; i < 5; i++) {
      const top = i >= 3;
      const x = bx + (top ? (i - 3.5) * 0.23 : (i - 1) * 0.23);
      const y = top ? 0.3 : 0;
      const turn = (random() - 0.5) * 0.2;
      const bag = at(m, x, y, 0.2 + (random() - 0.5) * 0.04, 0, turn, 0);
      solid.box(bag, 0, 0.15, 0, 0.21, 0.3, 0.12, pick(random, bags));
      solid.box(bag, 0, 0.14, 0.062, 0.15, 0.08, 0.004, '#efe6d2');
    }
    // The tins, three, two and one.
    const tx = 0.05;
    let n = 0;
    for (const [row, count] of [[0, 3], [1, 2], [2, 1]] as const) {
      for (let i = 0; i < count; i++) cylinder(solid, m, tx + (i - (count - 1) / 2) * 0.085, row * 0.062, 0.24, 0.04, 0.04, 0.06, ['#d8d8d0', '#e8b830', '#c8402e'][n++ % 3]!, 10);
    }
    card(parts, m, 'paws', tx, 0, 0.39, 0.22);
    // The aquarium: a stand, the water lit from its hood, gravel, a weed and two fish.
    const ax = Math.min(half - 0.2, 0.5);
    solid.box(m, ax, 0.14, 0.22, 0.4, 0.28, 0.3, '#2f3a3a');
    lit.box(m, ax, 0.42, 0.22, 0.36, 0.24, 0.26, '#3a9ab0');
    solid.box(m, ax, 0.295, 0.22, 0.36, 0.03, 0.26, '#c8b890');
    solid.box(m, ax, 0.56, 0.22, 0.4, 0.04, 0.3, '#1e2626');
    for (const s of [-1, 1]) solid.box(m, ax + s * 0.19, 0.42, 0.22, 0.02, 0.28, 0.3, '#1e2626');
    solid.box(m, ax - 0.1, 0.38, 0.352, 0.02, 0.12, 0.004, '#4d9a4a');
    for (const [fx, fy] of [[0.04, 0.44], [-0.05, 0.49]] as const) solid.box(m, ax + fx, fy, 0.353, 0.035, 0.018, 0.004, '#f09a3a');
  },
  // The florist: a stepped stand of vases, a bouquet in each.
  bouquetTiers: (parts, m, half, random) => {
    const { solid } = parts;
    const w = Math.min(2 * half - 0.2, 1.3);
    const steps: readonly [top: number, z0: number, z1: number][] = [[0.14, 0.28, 0.42], [0.3, 0.15, 0.28], [0.46, 0.03, 0.15]];
    steps.forEach(([top, z0, z1], k) => {
      solid.box(m, 0, top / 2, (z0 + z1) / 2, w, top, z1 - z0, '#e8e2d8');
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * (w / 3) + (k % 2 ? 0.1 : -0.06);
        bouquet(solid, m, x, top, (z0 + z1) / 2, random);
      }
    });
    card(parts, m, 'fresh', w / 2 - 0.1, 0.14, 0.41, 0.2);
  },
  // The florist: zinc buckets of cut flowers, a watering can.
  buckets: (parts, m, half, random) => {
    const { solid } = parts;
    const span = Math.min(half - 0.2, 0.62);
    for (let i = 0; i < 4; i++) {
      const x = -span + (i * 2 * span) / 3;
      const z = i % 2 ? 0.28 : 0.2;
      cylinder(solid, m, x, 0, z, 0.11, 0.085, 0.26, '#9aa4aa', 14);
      cylinder(solid, m, x, 0.25, z, 0.115, 0.115, 0.018, '#7a8488', 14);
      const color = pick(random, BLOOMS);
      for (let k = 0; k < 12; k++) {
        const a = random() * Math.PI * 2;
        const r = random() * 0.08;
        const y = 0.34 + random() * 0.14 - r * 0.6;
        if (k % 4 === 0) ball(solid, m, x + Math.cos(a) * r, y - 0.04, z + Math.sin(a) * r, 0.03, 0.018, 0.03, LEAF, a);
        else ball(solid, m, x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0.03, 0.03, 0.03, color);
      }
      for (let k = 0; k < 4; k++) solid.box(m, x + (k - 1.5) * 0.02, 0.3, z, 0.008, 0.12, 0.008, LEAF);
    }
    // The watering can, at the end.
    const cx = span + 0.1;
    solid.box(m, cx, 0.1, 0.34, 0.12, 0.2, 0.1, '#3f6b4f');
    solid.box(at(m, cx - 0.1, 0.16, 0.34, 0, 0, 0.8), 0, 0, 0, 0.14, 0.018, 0.018, '#3f6b4f');
    solid.box(m, cx, 0.24, 0.34, 0.1, 0.02, 0.02, '#3f6b4f');
  },
  // SECOND HOME: an armchair turned to the street, a side table with books, a standard lamp lit.
  armchair: (parts, m, half, random) => {
    const { solid, lit } = parts;
    const x = -Math.min(0.28, half - 0.35);
    const cover = pick(random, ['#b84a3a', '#3f6b4f', '#6e7b8c']);
    const z = 0.22;
    for (const [dx, dz] of [[-0.26, -0.15], [0.26, -0.15], [-0.26, 0.15], [0.26, 0.15]] as const) solid.box(m, x + dx, 0.05, z + dz, 0.035, 0.1, 0.035, '#3a2a1e');
    solid.box(m, x, 0.2, z, 0.6, 0.2, 0.38, cover);
    solid.box(m, x, 0.33, z + 0.03, 0.44, 0.06, 0.3, new THREE.Color(cover).multiplyScalar(1.12).getStyle());
    solid.box(m, x, 0.56, z - 0.14, 0.6, 0.52, 0.1, cover);
    for (const side of [-1, 1]) {
      solid.box(m, x + side * 0.26, 0.38, z + 0.01, 0.08, 0.16, 0.36, cover);
      cylinder(solid, at(m, 0, 0, 0, Math.PI / 2), x + side * 0.26, z - 0.17, -0.46, 0.045, 0.045, 0.36, cover, 8);
    }
    card(parts, m, 'delivered', x, 0.36, z + 0.04, 0.22);
    // The side table, two books on it.
    const t = Math.min(0.3, half - 0.5);
    cylinder(solid, m, t, 0, 0.24, 0.1, 0.1, 0.02, '#5a3a22', 14);
    cylinder(solid, m, t, 0.02, 0.24, 0.018, 0.018, 0.46, '#5a3a22', 8);
    cylinder(solid, m, t, 0.48, 0.24, 0.15, 0.15, 0.025, '#6a4a2e', 18);
    solid.box(at(m, t, 0.52, 0.24, 0, 0.3, 0), 0, 0, 0, 0.16, 0.03, 0.11, '#2f4f6a');
    solid.box(at(m, t, 0.55, 0.24, 0, -0.2, 0), 0, 0, 0, 0.14, 0.025, 0.1, '#8a2a2a');
    // The standard lamp: a base, the pole, the shade lit.
    const l = Math.min(0.68, half - 0.15);
    cylinder(solid, m, l, 0, 0.24, 0.1, 0.11, 0.03, '#3a2a1e', 14);
    cylinder(solid, m, l, 0.03, 0.24, 0.012, 0.012, 1.34, '#c9a24a', 6);
    cylinder(lit, m, l, 1.25, 0.24, 0.1, 0.16, 0.24, '#f4dca8', 16);
  },
  // SECOND HOME: a chest of drawers with its lamp lit, a framed print leant on the wall, a pile of cushions.
  chest: (parts, m, half, random) => {
    const { solid, lit } = parts;
    const x = -Math.min(0.3, half - 0.42);
    const z = 0.22;
    solid.box(m, x, 0.04, z, 0.68, 0.08, 0.32, '#5a3a22');
    solid.box(m, x, 0.4, z, 0.7, 0.64, 0.34, '#7a5a3a');
    solid.box(m, x, 0.735, z, 0.74, 0.03, 0.37, '#6a4a2e');
    for (let i = 0; i < 3; i++) {
      const y = 0.18 + i * 0.2;
      solid.box(m, x, y, z + 0.172, 0.64, 0.17, 0.008, '#8a6a44');
      for (const side of [-1, 1]) solid.box(m, x + side * 0.18, y, z + 0.182, 0.03, 0.03, 0.014, '#c9a24a');
    }
    // Its lamp.
    cylinder(solid, m, x - 0.18, 0.75, z, 0.05, 0.065, 0.2, '#e8e0cc', 12);
    cylinder(lit, m, x - 0.18, 0.95, z, 0.08, 0.13, 0.16, '#f4dca8', 16);
    // The print, leant back against the wall.
    const p = Math.min(0.4, half - 0.3);
    const lean = at(m, p, 0, 0.1, -0.12);
    solid.box(lean, 0, 0.32, 0, 0.5, 0.62, 0.03, '#3a2a1e');
    solid.box(lean, 0, 0.36, 0.018, 0.4, 0.3, 0.004, '#9ab8d0');
    solid.box(lean, 0, 0.22, 0.021, 0.4, 0.12, 0.004, '#6a8a5a');
    solid.box(lean, 0.1, 0.43, 0.024, 0.06, 0.06, 0.004, '#f0d080');
    // The cushions, piled.
    const c = Math.min(0.7, half - 0.16);
    for (let i = 0; i < 3; i++) solid.box(at(m, c, 0.05 + i * 0.1, 0.3, 0, (random() - 0.5) * 0.6, 0), 0, 0, 0, 0.28, 0.09, 0.28, pick(random, ['#3a6a5a', '#c8a040', '#b85a3a', '#6a4a7a']));
  },
};

/** A portable set at (x, y) on the display floor, its front at the glass: the case, a dark bezel, the screen (`snow` or the test card), two knobs. */
function tv(parts: DisplayParts, m: THREE.Matrix4, x: number, y: number, w: number, h: number, d: number, color: string, screen: 'snow' | 'test'): void {
  const { solid } = parts;
  const z = FRONT_Z - d / 2;
  solid.box(m, x, y + h / 2, z, w, h, d, color);
  const sw = w * 0.66;
  const sh = h * 0.7;
  const sx = x - w * 0.12;
  const sy = y + h * 0.52;
  solid.box(m, sx, sy, FRONT_Z + 0.004, sw + 0.04, sh + 0.04, 0.008, '#1a1a1c');
  if (screen === 'snow') parts.screens.quad(m, sx, sy, FRONT_Z + 0.011, sw, sh, FULL_UV);
  else parts.glowing.quad(m, sx, sy, FRONT_Z + 0.011, sw, sh, parts.atlas.tile('testcard'));
  for (const k of [0.62, 0.36]) solid.box(m, x + w * 0.36, y + h * k, FRONT_Z + 0.008, 0.035, 0.035, 0.016, '#c8c0b0');
}

/** A vase on a step at (x, y, z) with a bouquet in it: stems, leaves, a dome of flowers of one or two colours. */
function bouquet(b: TriBuilder, m: THREE.Matrix4, x: number, y: number, z: number, random: () => number): void {
  cylinder(b, m, x, y, z, 0.045, 0.035, 0.15, pick(random, ['#e8e2d8', '#5a7a8a', '#c8784e', '#2f3d48']), 10);
  for (let k = 0; k < 3; k++) b.box(m, x + (k - 1) * 0.015, y + 0.2, z, 0.006, 0.1, 0.006, LEAF);
  const a = pick(random, BLOOMS);
  const c = pick(random, BLOOMS);
  for (let k = 0; k < 9; k++) {
    const angle = random() * Math.PI * 2;
    const r = random() * 0.06;
    const color = k < 2 ? LEAF : k % 3 ? a : c;
    ball(b, m, x + Math.cos(angle) * r, y + 0.27 + (0.06 - r) * 0.7, z + Math.sin(angle) * r * 0.8, 0.03, 0.028, 0.03, color);
  }
}
