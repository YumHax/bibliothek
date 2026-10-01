import * as THREE from 'three';
import type { TriBuilder } from '../relief/TriBuilder';
import type { TexQuads } from './TexQuads';
import type { SpillAtlas } from './spillCanvas';
import { at, ball, cylinder, pick } from './shapes';

/** What a shop puts out on the pavement (`STREET_PLAN.shopSpill`). */
export type SpillPiece = 'flowerBuckets' | 'flowerTiers' | 'aBoard' | 'saleBench' | 'dogBowls' | 'kibbleSack' | 'brokenTv';

const BLOOMS = ['#e0567a', '#f0f0e8', '#b04ac0', '#f09a3a', '#e84a5a', '#f0d040', '#d87ab8'];
const LEAVES = ['#4d7a3a', '#6fa35e', '#3f6b3a'];
const ZINC = '#9aa4aa';
const WOOD = '#8a6a44';

/** A piece's footprint on the pavement (its own x across, z out to the street), for its collider. */
export interface SpillFootprint {
  width: number;
  depth: number;
}

/**
 * Builds `piece` into `solid` (vertex colours) and `quads` (the spill atlas's painted faces), in the frame `m` (origin
 * on the pavement at the piece's spot, +z towards the street); returns its footprint.
 */
export function buildSpill(piece: SpillPiece, solid: TriBuilder, quads: TexQuads, atlas: SpillAtlas, m: THREE.Matrix4, random: () => number): SpillFootprint {
  return PIECES[piece](solid, quads, atlas, m, random);
}

type Builder = (solid: TriBuilder, quads: TexQuads, atlas: SpillAtlas, m: THREE.Matrix4, random: () => number) => SpillFootprint;

const PIECES: Record<SpillPiece, Builder> = {
  // Three zinc buckets of cut flowers and a potted fern, bunched by the window.
  flowerBuckets: (solid, _quads, _atlas, m, random) => {
    for (const [x, z, h] of [[-0.2, -0.04, 0.34], [0.12, -0.08, 0.3], [0.02, 0.14, 0.26]] as const) {
      cylinder(solid, m, x, 0, z, 0.12, 0.095, h, ZINC, 14);
      cylinder(solid, m, x, h - 0.02, z, 0.125, 0.125, 0.02, '#7a8488', 14);
      bunch(solid, m, x, h, z, 0.1, pick(random, BLOOMS), random);
    }
    cylinder(solid, m, 0.3, 0, 0.12, 0.09, 0.07, 0.18, '#b86a44', 10);
    foliage(solid, m, 0.3, 0.2, 0.12, 0.14, random);
    return { width: 0.72, depth: 0.5 };
  },
  // A stepped wooden stand of potted plants, three treads rising to the wall.
  flowerTiers: (solid, _quads, _atlas, m, random) => {
    const w = 0.95;
    const steps: readonly [top: number, z0: number, z1: number][] = [[0.18, 0.05, 0.2], [0.36, -0.08, 0.05], [0.54, -0.2, -0.08]];
    for (const [top, z0, z1] of steps) {
      solid.box(m, 0, top - 0.015, (z0 + z1) / 2, w, 0.03, z1 - z0, WOOD);
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.3 + (random() - 0.5) * 0.05;
        const z = (z0 + z1) / 2;
        cylinder(solid, m, x, top, z, 0.065, 0.05, 0.12, pick(random, ['#b86a44', '#c8784e', '#e8e0d4']), 10);
        if (random() < 0.5) bunch(solid, m, x, top + 0.12, z, 0.06, pick(random, BLOOMS), random);
        else foliage(solid, m, x, top + 0.13, z, 0.1, random);
      }
    }
    // Its legs, short at the front, up to the top tread at the back.
    for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) {
      solid.box(m, x, 0.27, -0.19, 0.04, 0.54, 0.04, WOOD);
      solid.box(m, x, 0.09, 0.19, 0.04, 0.18, 0.04, WOOD);
    }
    return { width: w, depth: 0.45 };
  },
  // A chalk board on its A-frame, the two boards a little apart at the foot.
  aBoard: (solid, quads, atlas, m) => {
    const lean = 0.2;
    for (const side of [1, -1]) {
      const face = at(m, 0, 0, side * 0.09, side * -lean);
      solid.box(face, 0, 0.45, 0, 0.52, 0.86, 0.025, '#5a3a22');
      quads.quad(face, 0, 0.47, side * 0.0135, 0.44, 0.74, atlas.tile('board'), side > 0 ? 0 : Math.PI);
    }
    solid.box(m, 0, 0.87, 0, 0.5, 0.03, 0.05, '#3a2616');
    return { width: 0.55, depth: 0.4 };
  },
  // A slatted bench from the shop with its SALE tag on a string.
  saleBench: (solid, quads, atlas, m) => {
    const w = 1.0;
    const wood = '#9a6a3a';
    for (let i = 0; i < 4; i++) solid.box(m, 0, 0.44, -0.14 + i * 0.09, w, 0.025, 0.07, wood);
    for (let i = 0; i < 3; i++) solid.box(at(m, 0, 0.62 + i * 0.1, -0.2, -0.12), 0, 0, 0, w, 0.06, 0.02, wood);
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) {
      solid.box(m, x, 0.22, 0.12, 0.05, 0.44, 0.05, '#5a3a22');
      solid.box(m, x, 0.47, -0.19, 0.05, 0.94, 0.05, '#5a3a22');
      solid.box(m, x, 0.58, -0.02, 0.05, 0.04, 0.34, '#5a3a22');
    }
    solid.box(m, w / 2 - 0.2, 0.33, 0.14, 0.004, 0.2, 0.004, '#e8e0d0');
    quads.twoSided(m, w / 2 - 0.2, 0.18, 0.145, 0.12, 0.12, atlas.tile('sale'), atlas.tile('sale'), 0, 0.003);
    return { width: w, depth: 0.42 };
  },
  // The dogs' water: a low wooden stand with two steel bowls, the card on a stick.
  dogBowls: (solid, quads, atlas, m) => {
    solid.box(m, 0, 0.06, 0, 0.5, 0.12, 0.26, WOOD);
    for (const x of [-0.12, 0.12]) {
      cylinder(solid, m, x, 0.12, 0, 0.1, 0.08, 0.06, '#c8ccd0', 14);
      cylinder(solid, m, x, 0.17, 0, 0.085, 0.085, 0.004, x < 0 ? '#5a8aa8' : '#8a6a44', 14);
    }
    solid.box(m, 0.2, 0.3, -0.08, 0.012, 0.48, 0.012, '#5a3a22');
    quads.twoSided(m, 0.2, 0.5, -0.075, 0.2, 0.2, atlas.tile('dogs'), atlas.tile('dogs'), 0, 0.004);
    return { width: 0.5, depth: 0.28 };
  },
  // A big sack of kibble by the door, its top rolled over, its label.
  kibbleSack: (solid, _quads, _atlas, m) => {
    solid.box(m, 0, 0.26, 0, 0.36, 0.52, 0.22, '#c8402e');
    solid.box(m, 0, 0.55, 0, 0.34, 0.06, 0.2, '#a8321f');
    solid.box(m, 0, 0.28, 0.112, 0.26, 0.14, 0.004, '#efe6d2');
    ball(solid, m, 0, 0.3, 0.116, 0.05, 0.05, 0.004, '#e8b830');
    return { width: 0.38, depth: 0.25 };
  },
  // A dead television on the step, its screen cracked, the note taped on top.
  brokenTv: (solid, quads, atlas, m) => {
    solid.box(m, 0, 0.19, 0, 0.46, 0.38, 0.4, '#6a6f74');
    solid.box(m, -0.05, 0.2, 0.203, 0.32, 0.28, 0.008, '#1a1a1c');
    quads.quad(m, -0.05, 0.2, 0.211, 0.28, 0.24, atlas.tile('cracked'));
    for (const y of [0.28, 0.16]) solid.box(m, 0.17, y, 0.206, 0.04, 0.04, 0.014, '#c8c0b0');
    quads.quad(m, 0.02, 0.382, 0.02, 0.2, 0.2, atlas.tile('free'), 0.2, -Math.PI / 2);
    // A bent aerial.
    solid.box(at(m, 0.1, 0.46, -0.05, 0, 0, 0.9), 0, 0, 0, 0.008, 0.2, 0.008, '#b8bcc0');
    return { width: 0.48, depth: 0.42 };
  },
};

/** A bunch of cut flowers over a bucket's rim at (x, y, z): stems, a few leaves, a dome of blooms. */
function bunch(b: TriBuilder, m: THREE.Matrix4, x: number, y: number, z: number, radius: number, color: string, random: () => number): void {
  for (let k = 0; k < 4; k++) b.box(m, x + (k - 1.5) * 0.02, y + 0.06, z, 0.008, 0.14, 0.008, LEAVES[0]!);
  for (let k = 0; k < 11; k++) {
    const angle = random() * Math.PI * 2;
    const r = random() * radius;
    const top = y + 0.12 + (radius - r) * 0.8;
    const leaf = k % 4 === 0;
    ball(b, m, x + Math.cos(angle) * r, leaf ? top - 0.05 : top, z + Math.sin(angle) * r, 0.032, leaf ? 0.018 : 0.03, 0.032, leaf ? pick(random, LEAVES) : color, angle);
  }
}

/** A mound of leaves over a pot at (x, y, z). */
function foliage(b: TriBuilder, m: THREE.Matrix4, x: number, y: number, z: number, radius: number, random: () => number): void {
  for (let k = 0; k < 9; k++) {
    const angle = random() * Math.PI * 2;
    const r = random() * radius;
    ball(b, m, x + Math.cos(angle) * r, y + (radius - r) * 0.7, z + Math.sin(angle) * r, 0.06, 0.035, 0.05, pick(random, LEAVES), angle);
  }
}
