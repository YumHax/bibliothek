import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Platform } from '@/catalog/types';
import { part, matte } from './Prop';
import { cylinderMesh, type MeshPosition } from '../meshUtils';
import { paint, shared } from '../materials/palette';
import { markShared, sharedCanvasTexture } from '../materials/sharedResources';
import { WALL, decal } from '../surface/layers';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { nowPlaying } from '../screen/nowPlaying';

/**
 * Where a console takes its game, in the space of `parent` (the console's body): the middle of the
 * slot's mouth, the way in, and how the media is turned once in (its label +z and top +y turned
 * by `rotation`). A cartridge goes in contacts first as deep as its spec's `insert`; a disc is laid
 * on the spindle at `mouth`. `press` is a last push once in (the NES's press down); `door`, what
 * swings open first (the NES's flap, the PlayStation's lid) about its pivot's x axis.
 */
export interface MediaSlot {
  parent: THREE.Object3D;
  mouth: THREE.Vector3;
  /** Unit vector pointing into the console. */
  inward: THREE.Vector3;
  rotation: THREE.Quaternion;
  press?: THREE.Vector3;
  door?: { pivot: THREE.Object3D; angle: number };
  /** How far out of the slot a cartridge lines up before going in, when less than its whole length (a shelf too close above). */
  lineUp?: number;
  /** The whole cartridge goes in, whatever its shell (the NES's bay; a Famicom cart pushed in on an adapter). */
  swallows?: boolean;
}

/** A built console (and its controller) with the materials to tint on hover and its overall size. */
interface ConsoleVisual {
  group: THREE.Group;
  hover: THREE.MeshStandardMaterial[];
  /** Console body size (metres): width, height, depth. */
  size: { w: number; h: number; d: number };
  /** Where its game goes in; absent on a console that takes none (the generic box). */
  slot?: MediaSlot;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const BACK = new THREE.Vector3(0, 0, -1);
/** Media turned so: label up, top towards the player (a cartridge pushed in flat, contacts first, into the NES). */
const LABEL_UP_TOP_OUT = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
/** A disc lying label up. */
const FACE_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
/** Label towards the back (the Game Boy's slot is behind its screen). */
const LABEL_BACK = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

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

/** A material of the console's own, tinted on hover (`ConsoleVisual.hover`); every other look is a shared `paint`. */
function tinted(v: ConsoleVisual, color: number, roughness = 0.55): THREE.MeshStandardMaterial {
  const m = matte(color, roughness);
  v.hover.push(m);
  return m;
}

/**
 * A power LED of the console's own: dark paint until a longplay of `platform` is on a screen,
 * then lit (read from `screen/nowPlaying` just before the mesh is drawn, so nothing ticks).
 */
function powerLed(parent: THREE.Object3D, platform: Platform, color: number, size: [number, number, number], pos: MeshPosition): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0 });
  const mesh = part(parent, size[0], size[1], size[2], material, pos);
  mesh.castShadow = false;
  mesh.onBeforeRender = () => {
    material.emissiveIntensity = nowPlaying.platform === platform.id ? 1.8 : 0;
  };
  return mesh;
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
  const dark = paint(0x1c1c1e, 0.5);
  const padH = 0.016;
  const w = spec.trident ? 0.1 : 0.12;
  part(g, w, padH, 0.05, body, { y: padH / 2 });
  if (spec.dpad !== false && !spec.trident) cross(g, 0.024, 0.008, 0.004, dark, { x: -0.036, y: padH + 0.002 });
  for (const [x, z, color, r] of spec.buttons) cylinder(g, r ?? 0.0055, 0.004, paint(color, 0.4), { x, y: padH + 0.002, z });
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
    cylinder(g, 0.004, 0.012, paint(0x5c5c64, 0.5), { y: padH + 0.006, z: 0.035 });
    cylinder(g, 0.007, 0.003, paint(0x5c5c64, 0.5), { y: padH + 0.013, z: 0.035 });
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

/** How far a moulded hump sinks into the rounded base under it (its foot hidden in the base's top, never on it). */
const HUMP_SINK = 0.008;

/** Rounded body blocks, one geometry per size for the page (the SNES's and the N64's moulded shells). */
const roundedBodies = new Map<string, THREE.BufferGeometry>();

/** A moulded block: `part()` with its edges rounded by `radius` (the plastic's curve, not the bevel's few millimetres). */
function moulded(parent: THREE.Object3D, w: number, h: number, d: number, radius: number, material: THREE.Material, pos: MeshPosition): THREE.Mesh {
  const key = `${w}|${h}|${d}|${radius}`;
  let geometry = roundedBodies.get(key);
  if (!geometry) roundedBodies.set(key, (geometry = markShared(new RoundedBoxGeometry(w, h, d, 3, radius))));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * Lettering printed on a console's shell (a logo, POWER / RESET): `lines` in `ink`, centred on a transparent ground,
 * cut out with an alpha test (no blending, no draw order), laid on the face as a print (`WALL.print`). `facing`
 * `up` lies on a top at `pos`, `out` stands on a front facing +z. Its texture and material are one for the page.
 */
function lettering(parent: THREE.Object3D, key: string, w: number, h: number, lines: readonly { text: string; font: string; color: string }[], pos: MeshPosition, facing: 'up' | 'out'): void {
  const px = 256;
  const pxH = Math.max(16, Math.round((px * h) / w));
  const texture = sharedCanvasTexture(`console-print|${key}`, () => {
    const [canvas, ctx] = createCanvas(px, pxH);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      ctx.fillStyle = line.color;
      ctx.font = line.font;
      ctx.fillText(line.text, px / 2, ((i + 0.5) * pxH) / lines.length, px - 8);
    });
    return canvas;
  }, { anisotropy: 'grazing' });
  const material = shared(`console-print|${key}`, () => new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, roughness: 0.5 }));
  const print = decal(w, h, material, WALL.print, facing);
  print.castShadow = false;
  print.position.x += pos.x ?? 0;
  print.position.y += pos.y ?? 0;
  print.position.z += pos.z ?? 0;
  parent.add(print);
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
  nes(p, v) {
    const g = body(v, 0.255, 0.089, 0.203);
    const grey = tinted(v, 0xbdbdb8);
    const dark = paint(0x3e3e42, 0.6);
    const red = paint(0x9b1b1b, 0.5);
    const { w, d } = v.size;
    part(g, w, 0.045, d, grey, { y: 0.0225 });
    part(g, w, 0.044, d * 0.5, grey, { y: 0.067, z: -d * 0.25 });
    part(g, w * 0.62, 0.044, d * 0.5, dark, { x: -w * 0.19, y: 0.067, z: d * 0.25 });
    part(g, w * 0.38, 0.044, d * 0.5, grey, { x: w * 0.31, y: 0.067, z: d * 0.25 });
    part(g, w * 0.62 - 0.004, 0.004, 0.004, red, { x: -w * 0.19, y: 0.085, z: d * 0.5 - 0.001 }); // red pinstripe, 1 mm proud of the dark panel
    part(g, 0.022, 0.006, 0.012, red, { x: w * 0.22, y: 0.092, z: d * 0.3 }); // power
    part(g, 0.022, 0.006, 0.012, dark, { x: w * 0.36, y: 0.092, z: d * 0.3 }); // reset
    // POWER and RESET printed under their buttons, the logo along the lid's front edge, ribs over the back half.
    lettering(g, 'nes-power', 0.026, 0.006, [{ text: 'POWER', font: 'bold 44px system-ui, sans-serif', color: '#2a2a2e' }], { x: w * 0.22, y: 0.089, z: d * 0.3 + 0.013 }, 'up');
    lettering(g, 'nes-reset', 0.026, 0.006, [{ text: 'RESET', font: 'bold 44px system-ui, sans-serif', color: '#2a2a2e' }], { x: w * 0.36, y: 0.089, z: d * 0.3 + 0.013 }, 'up');
    lettering(
      g,
      'nes-logo',
      0.11,
      0.016,
      [
        { text: 'Nintendo', font: 'italic bold 30px Georgia, serif', color: '#2a2a2e' },
        { text: 'ENTERTAINMENT SYSTEM', font: 'bold 22px system-ui, sans-serif', color: '#2a2a2e' },
      ],
      { x: -w * 0.24, y: 0.089, z: -0.016 },
      'up',
    );
    for (let i = 0; i < 6; i++) part(g, w * 0.4, 0.0015, 0.004, grey, { x: w * 0.24, y: 0.089 + 0.00075, z: -d * 0.42 + i * 0.012 });
    powerLed(g, p, 0xd0281c, [0.006, 0.004, 0.002], { x: -w * 0.4, y: 0.03, z: d / 2 + 0.001 }); // power LED, front left
    // The flap over the cartridge bay, hinged along its top: it swings in as the cartridge is pushed through.
    const doorW = 0.132;
    const doorH = 0.032;
    const pivot = new THREE.Group();
    pivot.position.set(-w * 0.19, 0.084, d / 2 + 0.0025);
    part(pivot, doorW, doorH, 0.003, grey, { y: -doorH / 2 });
    g.add(pivot);
    v.slot = { parent: g, mouth: new THREE.Vector3(-w * 0.19, 0.069, d / 2), inward: BACK.clone(), rotation: LABEL_UP_TOP_OUT.clone(), press: new THREE.Vector3(0, -0.012, 0), door: { pivot, angle: 1.35 }, swallows: true };
    pad(v, { color: 0xb3b3ae, buttons: [[0.02, 0.008, 0xb01c1c], [0.038, 0.008, 0xb01c1c]] });
  },
  snes(_p, v) {
    const g = body(v, 0.2, 0.072, 0.242);
    const grey = tinted(v, 0xc9c9cf);
    const purple = paint(0x5b4b9e, 0.5);
    const { w, d } = v.size;
    // The moulded shell: a soft-edged base, the rounded hump of the slot on it, its logo on the base's front.
    moulded(g, w, 0.05, d, 0.016, grey, { y: 0.025 });
    moulded(g, w * 0.8, 0.022 + HUMP_SINK, d * 0.62, 0.01, tinted(v, 0xb9b9c2), { y: 0.061 - HUMP_SINK / 2, z: -d * 0.08 });
    lettering(
      g,
      'snes-logo',
      0.07,
      0.014,
      [
        { text: 'SUPER NINTENDO', font: 'bold 34px system-ui, sans-serif', color: '#4a4a52' },
        { text: 'ENTERTAINMENT SYSTEM', font: 'bold 22px system-ui, sans-serif', color: '#5b4b9e' },
      ],
      { x: 0, y: 0.05, z: d * 0.38 },
      'up',
    );
    part(g, 0.142, 0.001, 0.024, paint(0x1c1c20), { y: 0.0725, z: -d * 0.12 }); // the slot's spring flaps
    part(g, 0.016, 0.006, 0.02, purple, { y: 0.0745, z: d * 0.08 }); // eject lever
    for (const x of [-0.06, 0.06]) part(g, 0.028, 0.006, 0.014, purple, { x, y: 0.053, z: d * 0.36 });
    v.slot = { parent: g, mouth: new THREE.Vector3(0, 0.072, -d * 0.12), inward: DOWN.clone(), rotation: new THREE.Quaternion() };
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
    const bezel = paint(0x3f3f4a, 0.5);
    const { w, h, d } = v.size;
    part(g, w, h, d, shell, { y: h / 2 });
    // The cartridge goes in at the back of the top edge, label out the back; about 12 mm shows.
    v.slot = { parent: g, mouth: new THREE.Vector3(0, h, -d / 2 + 0.0055), inward: DOWN.clone(), rotation: LABEL_BACK.clone(), lineUp: 0.03 };
    part(g, w * 0.84, h * 0.42, 0.002, bezel, { y: h * 0.72, z: d / 2 + 0.001 });
    part(g, w * 0.5, h * 0.27, 0.002, paint(0x8fa860, 0.9), { y: h * 0.72, z: d / 2 + 0.0025 });
    cross(g, 0.02, 0.007, 0.003, paint(0x2a2a2e), { x: -w * 0.25, y: h * 0.32, z: d / 2 + 0.001 });
    const magenta = paint(0x9a2f6a, 0.45);
    for (const [x, y] of [
      [w * 0.15, h * 0.3],
      [w * 0.3, h * 0.36],
    ]) {
      const b = cylinder(g, 0.006, 0.003, magenta, { x, y, z: d / 2 + 0.001 });
      b.rotation.x = Math.PI / 2;
    }
  },
  megadrive(p, v) {
    const g = body(v, 0.28, 0.07, 0.212);
    const black = tinted(v, 0x1c1c1e, 0.5);
    const { w, d } = v.size;
    part(g, w, 0.05, d, black, { y: 0.025 });
    part(g, w * 0.5, 0.018, d * 0.8, tinted(v, 0x26262a, 0.5), { x: w * 0.15, y: 0.059 });
    cylinder(g, 0.05, 0.008, paint(0x2c2c30, 0.5), { x: -w * 0.18, y: 0.054 });
    cylinder(g, 0.022, 0.004, paint(0x111114, 0.5), { x: -w * 0.18, y: 0.06 });
    part(g, 0.05, 0.002, 0.012, paint(0xb8962e, 0.4), { x: -w * 0.3, y: 0.051, z: d * 0.38 }); // "16-bit" badge
    powerLed(g, p, 0xc0392b, [0.012, 0.005, 0.006], { x: w * 0.35, y: 0.0525, z: d * 0.4 }); // power LED
    part(g, 0.112, 0.001, 0.022, paint(0x0c0c0e, 0.6), { x: w * 0.15, y: 0.0685, z: -d * 0.12 }); // the slot's dust flaps
    v.slot = { parent: g, mouth: new THREE.Vector3(w * 0.15, 0.068, -d * 0.12), inward: DOWN.clone(), rotation: new THREE.Quaternion() };
    pad(v, { color: 0x222226, buttons: [[0.018, 0.012, 0x4a4a50], [0.032, 0.006, 0x4a4a50], [0.046, 0.0, 0x4a4a50]] });
  },
  n64(p, v) {
    const g = body(v, 0.26, 0.073, 0.19);
    const charcoal = tinted(v, 0x3b3b43, 0.6);
    const { w, d } = v.size;
    // The moulded shell: a soft-edged base, the round-backed hump on it, the logo on the base's front.
    moulded(g, w, 0.045, d, 0.008, charcoal, { y: 0.0225 }); // tight: the side wings sit out near its edges
    moulded(g, w * 0.56, 0.028 + HUMP_SINK, d * 0.86, 0.012, charcoal, { y: 0.059 - HUMP_SINK / 2 });
    lettering(g, 'n64-logo', 0.06, 0.012, [{ text: 'NINTENDO 64', font: 'bold 40px system-ui, sans-serif', color: '#c9c9cf' }], { x: -w * 0.2, y: 0.0225, z: d / 2 }, 'out');
    for (const sx of [-1, 1]) part(g, w * 0.2, 0.014, d * 0.8, tinted(v, 0x34343b, 0.6), { x: sx * w * 0.38, y: 0.052 });
    part(g, 0.122, 0.001, 0.022, paint(0x1a1a1e), { y: 0.0735, z: -d * 0.1 }); // the slot's spring flaps
    v.slot = { parent: g, mouth: new THREE.Vector3(0, 0.073, -d * 0.1), inward: DOWN.clone(), rotation: new THREE.Quaternion() };
    powerLed(g, p, 0xc0392b, [0.018, 0.005, 0.01], { x: -w * 0.3, y: 0.061, z: d * 0.25 }); // power LED
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
  ps1(p, v) {
    const g = body(v, 0.27, 0.06, 0.188);
    const grey = tinted(v, 0xbfbdb5, 0.55);
    const { w, d } = v.size;
    part(g, w, 0.045, d, grey, { y: 0.0225 });
    // The round lid, hinged at its back: it lifts, the disc goes on the spindle, it shuts.
    const lidR = 0.066;
    const lidX = -w * 0.08;
    const lidZ = -d * 0.05;
    const pivot = new THREE.Group();
    pivot.position.set(lidX, 0.057, lidZ - lidR);
    cylinder(pivot, lidR, 0.012, tinted(v, 0xc6c4bc, 0.55), { y: -0.006, z: lidR });
    g.add(pivot);
    cylinder(g, 0.006, 0.004, paint(0x3a3a3e, 0.5), { x: lidX, y: 0.047, z: lidZ }); // the spindle, under the lid
    v.slot = { parent: g, mouth: new THREE.Vector3(lidX, 0.0496, lidZ), inward: DOWN.clone(), rotation: FACE_UP.clone(), door: { pivot, angle: -1.2 } };
    part(g, 0.024, 0.008, 0.016, grey, { x: w * 0.36, y: 0.049, z: -d * 0.1 }); // power button
    part(g, 0.024, 0.008, 0.016, grey, { x: w * 0.36, y: 0.049, z: d * 0.15 }); // open button
    powerLed(g, p, 0x3fa85c, [0.006, 0.003, 0.006], { x: w * 0.42, y: 0.046, z: d * 0.38 }); // power LED
    for (const x of [-w * 0.32, -w * 0.16]) part(g, 0.02, 0.012, 0.004, paint(0x2a2a2e), { x, y: 0.02, z: d / 2 + 0.002 });
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
  powerLed(g, p, 0xc0392b, [0.02, 0.005, 0.01], { x: w * 0.35, y: 0.0475, z: d * 0.3 }); // power LED
  pad(v, { color: accent.clone().multiplyScalar(0.85).getHex(), buttons: [[0.024, 0.006, 0x2a2a2e], [0.04, 0.006, 0x2a2a2e]] });
}

/** Builds the low-poly console (and controller) for `platform`, laid out around a slot's floor centre. */
export function buildConsole(platform: Platform): ConsoleVisual {
  const visual: ConsoleVisual = { group: new THREE.Group(), hover: [], size: { w: 0, h: 0, d: 0 } };
  visual.group.name = `Console:${platform.id}`;
  (SHAPES[platform.id] ?? generic)(platform, visual);
  return visual;
}
