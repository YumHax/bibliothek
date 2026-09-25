import * as THREE from 'three';
import type { Platform } from '@/catalog/types';
import { part, matte } from './Prop';
import { cylinderMesh, type MeshPosition } from '../meshUtils';

/** A built console (and its controller) with the materials to tint on hover and its overall size. */
export interface ConsoleVisual {
  group: THREE.Group;
  hover: THREE.MeshStandardMaterial[];
  /** Console body size (metres): width, height, depth. */
  size: { w: number; h: number; d: number };
}

type Shape = (platform: Platform, v: ConsoleVisual) => void;

interface PadSpec {
  color: number;
  /** Buttons as [x, z, colour, radius] offsets from the pad centre (pad is 0.12 x 0.05, local +z towards the player). */
  buttons: [number, number, number, number?][];
  dpad?: boolean;
  /** Handles poking towards the player at these x offsets. */
  handles?: number[];
  /** Nintendo 64 trident: centre prong plus wings. */
  trident?: boolean;
  stick?: boolean;
}

/** Where the console sits in its slot and where the pad lies in front of it (local z). */
const CONSOLE_Z = -0.075;
const PAD_POS = new THREE.Vector3(0.05, 0, 0.135);

function tinted(v: ConsoleVisual, color: number, roughness = 0.55): THREE.MeshStandardMaterial {
  const m = matte(color, roughness);
  v.hover.push(m);
  return m;
}

function cylinder(parent: THREE.Object3D, radius: number, height: number, material: THREE.Material, pos: MeshPosition): THREE.Mesh {
  const mesh = cylinderMesh(radius, height, material, pos);
  parent.add(mesh);
  return mesh;
}

function cross(parent: THREE.Object3D, size: number, thick: number, height: number, material: THREE.Material, pos: { x?: number; y?: number; z?: number }): void {
  part(parent, size, height, thick, material, pos);
  part(parent, thick, height, size, material, pos);
}

/** Builds a gamepad in front of the console and a cable back to it. */
function pad(v: ConsoleVisual, spec: PadSpec): void {
  const g = new THREE.Group();
  g.position.copy(PAD_POS);
  g.rotation.y = 0.22;
  const body = tinted(v, spec.color);
  const dark = matte(0x1c1c1e, 0.5);
  const padH = 0.016;
  const w = spec.trident ? 0.1 : 0.12;
  part(g, w, padH, 0.05, body, { y: padH / 2 });
  if (spec.dpad !== false && !spec.trident) cross(g, 0.024, 0.008, 0.004, dark, { x: -0.036, y: padH + 0.002 });
  for (const [x, z, color, r] of spec.buttons) cylinder(g, r ?? 0.0055, 0.004, matte(color, 0.4), { x, y: padH + 0.002, z });
  for (const x of spec.handles ?? []) part(g, 0.028, padH, 0.045, body, { x, y: padH / 2, z: 0.04 });
  if (spec.trident) {
    part(g, 0.026, padH, 0.055, body, { y: padH / 2, z: 0.045 });
    for (const sx of [-1, 1]) {
      const wing = part(g, 0.026, padH, 0.05, body, { x: sx * 0.045, y: padH / 2, z: 0.038 });
      wing.rotation.y = -sx * 0.35;
    }
    cross(g, 0.02, 0.007, 0.004, dark, { x: -0.03, y: padH + 0.002, z: -0.006 });
  }
  if (spec.stick) {
    cylinder(g, 0.004, 0.012, matte(0x5c5c64, 0.5), { y: padH + 0.006, z: 0.035 });
    cylinder(g, 0.007, 0.003, matte(0x5c5c64, 0.5), { y: padH + 0.013, z: 0.035 });
  }
  v.group.add(g);

  // Cable: from the back edge of the pad to the console's front (both in the slot's space).
  g.updateMatrix();
  const from = new THREE.Vector3(-0.01, padH / 2, -0.025).applyMatrix4(g.matrix);
  const to = new THREE.Vector3(-0.02, 0.012, CONSOLE_Z + v.size.d / 2);
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(-0.03, -0.006, 0.01));
  mid.y = 0.003;
  const curve = new THREE.CatmullRomCurve3([from, mid, to]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.0025, 5), dark);
  cable.castShadow = true;
  v.group.add(cable);
}

/** Puts the console body group at its slot position. */
function body(v: ConsoleVisual, w: number, h: number, d: number): THREE.Group {
  v.size = { w, h, d };
  const g = new THREE.Group();
  g.position.z = CONSOLE_Z;
  v.group.add(g);
  return g;
}

const SHAPES: Record<string, Shape> = {
  nes(_p, v) {
    const g = body(v, 0.255, 0.089, 0.203);
    const grey = tinted(v, 0xbdbdb8);
    const dark = matte(0x3e3e42, 0.6);
    const red = matte(0x9b1b1b, 0.5);
    const { w, d } = v.size;
    part(g, w, 0.045, d, grey, { y: 0.0225 });
    part(g, w, 0.044, d * 0.5, grey, { y: 0.067, z: -d * 0.25 });
    part(g, w * 0.62, 0.044, d * 0.5, dark, { x: -w * 0.19, y: 0.067, z: d * 0.25 });
    part(g, w * 0.38, 0.044, d * 0.5, grey, { x: w * 0.31, y: 0.067, z: d * 0.25 });
    part(g, w * 0.62 - 0.004, 0.004, 0.004, red, { x: -w * 0.19, y: 0.085, z: d * 0.5 - 0.001 }); // red pinstripe, 1 mm proud of the dark panel
    part(g, 0.022, 0.006, 0.012, red, { x: w * 0.22, y: 0.092, z: d * 0.3 }); // power
    part(g, 0.022, 0.006, 0.012, dark, { x: w * 0.36, y: 0.092, z: d * 0.3 }); // reset
    pad(v, { color: 0xb3b3ae, buttons: [[0.02, 0.008, 0xb01c1c], [0.038, 0.008, 0xb01c1c]] });
  },
  snes(_p, v) {
    const g = body(v, 0.2, 0.072, 0.19);
    const grey = tinted(v, 0xc9c9cf);
    const purple = matte(0x5b4b9e, 0.5);
    const { w, d } = v.size;
    part(g, w, 0.05, d, grey, { y: 0.025 });
    part(g, w * 0.5, 0.022, d * 0.72, tinted(v, 0xb9b9c2), { y: 0.061, z: -d * 0.05 });
    part(g, w * 0.34, 0.004, 0.012, matte(0x2a2a30), { y: 0.052, z: -d * 0.3 }); // cartridge slot
    for (const x of [-0.03, 0.03]) part(g, 0.028, 0.006, 0.014, purple, { x, y: 0.053, z: d * 0.32 });
    pad(v, {
      color: 0xc9c9cf,
      buttons: [
        [0.032, 0.0, 0xd12b2b],
        [0.044, 0.01, 0xe8c12b],
        [0.02, 0.01, 0x2e9b45],
        [0.032, 0.02, 0x2757b8],
      ],
    });
  },
  gb(_p, v) {
    // A handheld, standing upright and leaning back a little.
    const g = body(v, 0.09, 0.148, 0.032);
    g.position.z = -0.03;
    g.rotation.x = -0.14;
    const shell = tinted(v, 0xc7c3ba);
    const bezel = matte(0x3f3f4a, 0.5);
    const { w, h, d } = v.size;
    part(g, w, h, d, shell, { y: h / 2 });
    part(g, w * 0.84, h * 0.42, 0.002, bezel, { y: h * 0.72, z: d / 2 + 0.001 });
    part(g, w * 0.5, h * 0.27, 0.002, matte(0x8fa860, 0.9), { y: h * 0.72, z: d / 2 + 0.0025 });
    cross(g, 0.02, 0.007, 0.003, matte(0x2a2a2e), { x: -w * 0.25, y: h * 0.32, z: d / 2 + 0.001 });
    const magenta = matte(0x9a2f6a, 0.45);
    for (const [x, y] of [
      [w * 0.15, h * 0.3],
      [w * 0.3, h * 0.36],
    ]) {
      const b = cylinder(g, 0.006, 0.003, magenta, { x, y, z: d / 2 + 0.001 });
      b.rotation.x = Math.PI / 2;
    }
  },
  megadrive(_p, v) {
    const g = body(v, 0.28, 0.07, 0.212);
    const black = tinted(v, 0x1c1c1e, 0.5);
    const { w, d } = v.size;
    part(g, w, 0.05, d, black, { y: 0.025 });
    part(g, w * 0.5, 0.018, d * 0.8, tinted(v, 0x26262a, 0.5), { x: w * 0.15, y: 0.059 });
    cylinder(g, 0.05, 0.008, matte(0x2c2c30, 0.5), { x: -w * 0.18, y: 0.054 });
    cylinder(g, 0.022, 0.004, matte(0x111114, 0.5), { x: -w * 0.18, y: 0.06 });
    part(g, 0.05, 0.002, 0.012, matte(0xb8962e, 0.4), { x: -w * 0.3, y: 0.051, z: d * 0.38 }); // "16-bit" badge
    part(g, 0.012, 0.005, 0.006, matte(0xc0392b, 0.4), { x: w * 0.35, y: 0.0525, z: d * 0.4 }); // power LED
    pad(v, { color: 0x222226, buttons: [[0.018, 0.012, 0x4a4a50], [0.032, 0.006, 0x4a4a50], [0.046, 0.0, 0x4a4a50]] });
  },
  n64(_p, v) {
    const g = body(v, 0.26, 0.073, 0.19);
    const charcoal = tinted(v, 0x3b3b43, 0.6);
    const { w, d } = v.size;
    part(g, w, 0.045, d, charcoal, { y: 0.0225 });
    part(g, w * 0.36, 0.028, d * 0.86, charcoal, { y: 0.059 });
    for (const sx of [-1, 1]) part(g, w * 0.26, 0.014, d * 0.8, tinted(v, 0x34343b, 0.6), { x: sx * w * 0.33, y: 0.052 });
    part(g, w * 0.26, 0.004, 0.014, matte(0x1a1a1e), { y: 0.074, z: -d * 0.1 }); // cartridge slot
    part(g, 0.018, 0.005, 0.01, matte(0xc0392b, 0.4), { x: -w * 0.3, y: 0.061, z: d * 0.25 }); // power
    pad(v, {
      color: 0x8d8d95,
      trident: true,
      stick: true,
      buttons: [
        [0.03, -0.012, 0x1d5fbf, 0.005],
        [0.02, -0.004, 0x2b9b48, 0.005],
        [0.042, -0.008, 0xe3c229, 0.0035],
        [0.038, -0.018, 0xe3c229, 0.0035],
        [0.046, 0.001, 0xe3c229, 0.0035],
        [0.03, 0.004, 0xe3c229, 0.0035],
      ],
    });
  },
  ps1(_p, v) {
    const g = body(v, 0.26, 0.06, 0.185);
    const grey = tinted(v, 0xbfbdb5, 0.55);
    const { w, d } = v.size;
    part(g, w, 0.045, d, grey, { y: 0.0225 });
    cylinder(g, 0.055, 0.012, tinted(v, 0xc6c4bc, 0.55), { x: -w * 0.08, y: 0.051, z: -d * 0.05 });
    part(g, 0.024, 0.008, 0.016, grey, { x: w * 0.36, y: 0.049, z: -d * 0.1 }); // power button
    part(g, 0.024, 0.008, 0.016, grey, { x: w * 0.36, y: 0.049, z: d * 0.15 }); // open button
    part(g, 0.006, 0.003, 0.006, matte(0x3fa85c, 0.4), { x: w * 0.42, y: 0.046, z: d * 0.38 }); // LED
    for (const x of [-w * 0.32, -w * 0.16]) part(g, 0.02, 0.012, 0.004, matte(0x2a2a2e), { x, y: 0.02, z: d / 2 + 0.002 });
    pad(v, {
      color: 0x8f8d88,
      handles: [-0.038, 0.038],
      buttons: [
        [0.034, -0.012, 0x3fa85c],
        [0.046, -0.002, 0xd23b3b],
        [0.034, 0.008, 0x3b64c8],
        [0.022, -0.002, 0xd75c9e],
      ],
    });
  },
};

/** Any platform without a dedicated look: a box in its accent colour with a matching pad. */
function generic(p: Platform, v: ConsoleVisual): void {
  const g = body(v, 0.24, 0.06, 0.19);
  const accent = new THREE.Color(p.accentColor);
  const main = tinted(v, accent.getHex(), 0.55);
  const { w, d } = v.size;
  part(g, w, 0.045, d, main, { y: 0.0225 });
  part(g, w * 0.6, 0.015, d * 0.7, tinted(v, accent.clone().multiplyScalar(0.7).getHex(), 0.55), { y: 0.0525 });
  part(g, 0.02, 0.005, 0.01, matte(0xc0392b, 0.4), { x: w * 0.35, y: 0.0475, z: d * 0.3 });
  pad(v, { color: accent.clone().multiplyScalar(0.85).getHex(), buttons: [[0.024, 0.006, 0x2a2a2e], [0.04, 0.006, 0x2a2a2e]] });
}

/** Builds the low-poly console (and controller) for `platform`, laid out around a slot's floor centre. */
export function buildConsole(platform: Platform): ConsoleVisual {
  const visual: ConsoleVisual = { group: new THREE.Group(), hover: [], size: { w: 0, h: 0, d: 0 } };
  visual.group.name = `Console:${platform.id}`;
  (SHAPES[platform.id] ?? generic)(platform, visual);
  return visual;
}
