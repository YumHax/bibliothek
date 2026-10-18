import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { QUALITY } from '@/graphics/quality';
import { createCanvas, repeatTexture, toTexture } from '@/covers/generated/canvasUtils';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { markShared, sharedCanvasTexture } from '../materials/sharedResources';
import { INSET, PROUD } from '../props/joinery';
import { METAL, coverageKeepsAlpha, shared, standard, timber } from '../materials/palette';
import { WALL, layMesh } from '../surface/layers';
import { STAIRWELL_PLAN as plan } from './stairwellPlan';
import { STOREYS, landingY } from '@/world/measures/building';
import { mirrorScratchesTexture } from './liftAttic';
import { FoldingGate } from './FoldingGate';

/*
 * The old lift's ironwork and car, as built (the `Lift` runs them): the cage the full height of the shaft, a folding
 * gate on every landing under a scrolled frieze with a brass dial that shows where the car is, and the panelled
 * wooden car with its mirror, dome lamp, handrail and brass panel; and the sizes they share with the `Lift`.
 */

/** The floors it stops at: every landing, ours (0) down to the entrance hall's (`STOREYS`). */
export const STOPS = Array.from({ length: STOREYS + 1 }, (_, k) => k);
export const GATE_HEIGHT = 2.15;
export const CAGE = { x0: plan.car.x0 - 0.05, x1: plan.car.x1 + 0.05, z0: plan.car.z0 - 0.05, z1: plan.car.z1 + 0.05 };
const TOP = landingY(0) + 2.8;
/** The cage's iron: posts, the rail round it at every landing (`TRANSOM`, over the gate) and at its foot. */
const POST = 0.05;
const TRANSOM = { h: 0.06, d: 0.04, gap: 0.005 };
/** The brass dial over each gate, its needle on the car's floor: radius, depth of its case, the strip closing its flat side, the needle off its face. */
const DIAL = { r: 0.15, d: 0.016, strip: 0.012, needle: 0.006 };
/** The car's walls, and the raised panels on them. */
const WALL_T = 0.03;
const PANEL_T = 0.012;
/** The car's brass panel, on its east wall near the gate: its middle's height, its size, how far it stands from the gate, its thickness and how deep it is set in the wall. */
const PANEL = { y: 1.25, h: 0.44, d: 0.2, fromGate: 0.3, t: 0.02, set: 0.005 };
/** The panel's buttons: two columns of three, ours top left, the ground floor bottom right; the keyhole over them. */
const KEY = { across: 0.045, top: 0.07, pitch: 0.085, keyhole: 0.17 };
const WOOD = timber(0x4e2a1a, 0.5);
const VENEER = timber(0x7b4a2b, 0.42);
const FLOORING = timber(0x3a2216, 0.65);
/** The lift's brass (each button lights a copy of its own on hover): kept across the stairwell's unloads. */
export const BRASS = markShared(new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 1, roughness: 0.32, emissive: 0xffb050, emissiveIntensity: 0 }));
// Painted wrought iron: a dielectric (metalness 0).
const IRON = standard({ color: 0x1c1d20, roughness: 0.45, metalness: 0 });
const MIRROR = standard({ color: 0xc8d2d8, metalness: 1, roughness: 0.06 });

/** A car's box (local): its floor's rectangle, and its height. */
interface CarBox {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  height: number;
}

/** Where floor `k`'s button stands on the panel of the car `box` (car-local, on the panel's face): `k` -1 is the roof's keyhole. */
export function panelSpot(box: CarBox, k: number): { x: number; y: number; z: number } {
  const z = box.z1 - PANEL.fromGate;
  const x = box.x1 - WALL_T - PANEL.t + PANEL.set;
  if (k < 0) return { x, y: PANEL.y + KEY.keyhole, z };
  return { x, y: PANEL.y + KEY.top - Math.floor(k / 2) * KEY.pitch, z: z + (k % 2 === 0 ? -KEY.across : KEY.across) };
}

/** The car's floor in the shaft as a share of its run: 0 on our landing, 1 at the entrance hall (the dials' needles). */
export function runShare(y: number): number {
  return (landingY(0) - y) / (landingY(0) - landingY(STOREYS));
}

/** What `buildCage` returns: each landing's gate, and its dial's needle (turned by the `Lift`). */
interface Cage {
  gates: Map<number, FoldingGate>;
  needles: Map<number, THREE.Object3D>;
}

/**
 * The iron cage the full height of the shaft, added to `into`: four posts, a rail round it at every landing, barred
 * lattice on three sides; on the front, a folding gate on every landing (from its west post) and over it a scrolled
 * frieze up to the next landing, with a brass dial whose needle follows the car.
 */
export function buildCage(into: THREE.Object3D): Cage {
  const gates = new Map<number, FoldingGate>();
  const needles = new Map<number, THREE.Object3D>();
  const w = CAGE.x1 - CAGE.x0;
  const d = CAGE.z1 - CAGE.z0;
  const cx = (CAGE.x0 + CAGE.x1) / 2;
  const cz = (CAGE.z0 + CAGE.z1) / 2;
  into.add(ironwork(w, d, cx, cz));
  const bars = cutOut('lift-bars', latticeTexture);
  const sides: [number, number, number, number][] = [
    [d, CAGE.x0, cz, Math.PI / 2],
    [d, CAGE.x1, cz, Math.PI / 2],
    [w, cx, CAGE.z0, 0],
  ];
  for (const [width, x, z, yaw] of sides) {
    const mesh = new THREE.Mesh(tiled(width, TOP, 4, 2), bars);
    mesh.position.set(x, TOP / 2, z);
    mesh.rotation.y = yaw;
    into.add(mesh);
  }
  const frieze = cutOut('lift-frieze', friezeTexture);
  for (const k of STOPS) {
    const y = landingY(k);
    const gate = new FoldingGate(plan.car.x1 - plan.car.x0, GATE_HEIGHT);
    gate.position.set(plan.car.x0, y, plan.car.z1 + 0.04);
    into.add(gate);
    gates.set(k, gate);
    const foot = y + GATE_HEIGHT + TRANSOM.gap + TRANSOM.h;
    const above = (k === 0 ? TOP : landingY(k - 1)) - foot;
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, above), frieze);
    fill.position.set(cx, foot + above / 2, CAGE.z1);
    into.add(fill);
    needles.set(k, dial(into, cx, foot));
  }
  return { gates, needles };
}

/** The posts and the rails round the cage at every landing (over the gate, and at the foot of the three barred sides), one mesh. */
function ironwork(w: number, d: number, cx: number, cz: number): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const box = (bw: number, bh: number, bd: number, x: number, y: number, z: number): void => {
    parts.push(new THREE.BoxGeometry(bw, bh, bd).translate(x, y, z));
  };
  for (const x of [CAGE.x0, CAGE.x1]) for (const z of [CAGE.z0, CAGE.z1]) box(POST, TOP, POST, x, TOP / 2, z);
  for (const k of STOPS) {
    const y = landingY(k);
    const over = y + GATE_HEIGHT + TRANSOM.gap + TRANSOM.h / 2;
    // Each rail runs into the posts at its ends.
    box(w, TRANSOM.h, TRANSOM.d, cx, over, CAGE.z1);
    for (const at of [over, y + TRANSOM.h / 2]) {
      box(w, TRANSOM.h, TRANSOM.d, cx, at, CAGE.z0);
      box(TRANSOM.d, TRANSOM.h, d, CAGE.x0, at, cz);
      box(TRANSOM.d, TRANSOM.h, d, CAGE.x1, at, cz);
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts)!, IRON);
  for (const part of parts) part.dispose();
  mesh.receiveShadow = true;
  mesh.name = 'LiftIronwork';
  return mesh;
}

/** The brass dial over a gate, its flat side on the rail at `foot`, centred on `x`: returns its needle's pivot. */
function dial(into: THREE.Object3D, x: number, foot: number): THREE.Object3D {
  const brass = METAL.brass();
  // Its back against the frieze, its foot on the rail.
  const caseZ = CAGE.z1 + DIAL.d / 2 + PROUD;
  const shell = new THREE.Mesh(dialCase(), brass);
  shell.position.set(x, foot, caseZ);
  shell.rotation.x = -Math.PI / 2;
  into.add(shell);
  // The strip closing its flat side, a little proud of it.
  into.add(boxMesh(2 * DIAL.r, DIAL.strip, DIAL.d + 2 * PROUD, brass, { x, y: foot + DIAL.strip / 2 - INSET, z: caseZ }));
  const faceZ = caseZ + DIAL.d / 2;
  const centre = foot + DIAL.strip;
  const face = new THREE.Mesh(new THREE.CircleGeometry(DIAL.r * 0.88, 32, 0, Math.PI), shared('lift-dial', () => new THREE.MeshStandardMaterial({ map: dialTexture(), metalness: 1, roughness: 0.45 })));
  face.position.set(x, centre, faceZ + WALL.sign.lift);
  into.add(layMesh(face, WALL.sign));
  const pivot = new THREE.Group();
  pivot.position.set(x, centre, faceZ + DIAL.needle);
  const needle = boxMesh(0.007, DIAL.r * 0.62, 0.003, IRON, { y: DIAL.r * 0.25 });
  needle.castShadow = false;
  pivot.add(needle);
  const hub = cylinderMesh(0.012, 0.008, brass);
  hub.rotation.x = Math.PI / 2;
  pivot.add(hub);
  into.add(pivot);
  return pivot;
}

let dialCaseGeometry: THREE.BufferGeometry | null = null;
/** The dial's case: a half-round brass box, its round side up once laid on its back (`rotation.x` -π/2). */
function dialCase(): THREE.BufferGeometry {
  dialCaseGeometry ??= markShared(new THREE.CylinderGeometry(DIAL.r, DIAL.r, DIAL.d, 28, 1, false, -Math.PI / 2, Math.PI));
  return dialCaseGeometry;
}

/** A see-through iron pattern (the bars, the frieze), cut out by its alpha: one material for the page under `key`. */
function cutOut(key: string, paint: () => THREE.CanvasTexture): THREE.MeshStandardMaterial {
  return shared(key, () => coverageKeepsAlpha(new THREE.MeshStandardMaterial({ map: paint(), color: 0x2a2b2e, metalness: 0, roughness: 0.5, alphaTest: 0.5, alphaToCoverage: QUALITY.msaa > 0, side: THREE.DoubleSide })));
}

/** A plane `width` by `height` whose uvs repeat `perU` times a metre across and `perV` up. */
function tiled(width: number, height: number, perU: number, perV: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(width, height);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width * perU, uv.getY(i) * height * perV);
  return g;
}

/**
 * The car, built into `car` (its floor at y 0): the shell (`buildCarShell`) on the stairwell's car box. The `Lift`
 * places its buttons on the panel (`panelSpot`).
 */
export function buildCar(car: THREE.Group, lamp: THREE.Material): void {
  buildCarShell(car, plan.car, lamp);
}

/**
 * A car of the old lift in `box` (its floor at y 0), the stairwell's and the attic's alike: a parquet floor with a brass
 * sill, dark wooden walls with raised veneer panels, a brass handrail across the back under a framed mirror (the
 * scratches of years of keys on it), the ceiling's frosted dome lit by `lamp`, a fascia over the opening and the brass
 * panel on the east wall by the gate, its buttons left to the caller.
 */
export function buildCarShell(car: THREE.Object3D, box: CarBox, lamp: THREE.Material): void {
  const w = box.x1 - box.x0;
  const d = box.z1 - box.z0;
  const h = box.height;
  const cx = (box.x0 + box.x1) / 2;
  const cz = (box.z0 + box.z1) / 2;
  const add = <M extends THREE.Mesh>(mesh: M): M => {
    car.add(mesh);
    return mesh;
  };
  // The floor stands PROUD of the floor it stops at: at the bottom, the hall's stone runs under the car.
  add(boxMesh(w, 0.08, d, FLOORING, { x: cx, y: -0.04 + PROUD, z: cz }));
  add(boxMesh(w - 2 * WALL_T, SILL.h, SILL.d, METAL.brass(), { x: cx, y: PROUD + SILL.h / 2 - INSET, z: box.z1 - SILL.d / 2 - PROUD }));
  add(boxMesh(WALL_T, h, d, WOOD, { x: box.x0 + WALL_T / 2, y: h / 2, z: cz }));
  add(boxMesh(WALL_T, h, d, WOOD, { x: box.x1 - WALL_T / 2, y: h / 2, z: cz }));
  add(boxMesh(w, h, WALL_T, WOOD, { x: cx, y: h / 2, z: box.z0 + WALL_T / 2 }));
  // The roof up to 5 cm over the car (the attic's lintel's plaster stands there, `AtticShell`), not into its plane.
  add(boxMesh(w, 0.05, d, WOOD, { x: cx, y: h + 0.025, z: cz }));
  // The fascia over the opening, between the side walls.
  add(boxMesh(w - 2 * WALL_T - 2 * INSET, 0.12, WALL_T, WOOD, { x: cx, y: h - 0.06, z: box.z1 - WALL_T / 2 - PROUD }));
  // Raised panels: low and high on the side walls, low on the back (the mirror over it); on the east wall the high one stops short of the brass panel.
  const west = box.x0 + WALL_T + PANEL_T / 2 - INSET;
  const east = box.x1 - WALL_T - PANEL_T / 2 + INSET;
  const along = { z0: box.z0 + WALL_T + 0.06, z1: box.z1 - 0.07 };
  const brassFront = box.z1 - PANEL.fromGate + PANEL.d / 2 + 0.05;
  const panelAt = (x: number, y0: number, y1: number, z0: number, z1: number): void => {
    add(boxMesh(PANEL_T, y1 - y0, z1 - z0, VENEER, { x, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }));
  };
  panelAt(west, 0.12, 0.84, along.z0, along.z1);
  panelAt(west, 1.0, 1.96, along.z0, along.z1);
  panelAt(east, 0.12, 0.84, along.z0, along.z1);
  panelAt(east, 1.0, 1.96, along.z0, box.z1 - PANEL.fromGate - PANEL.d / 2 - 0.05);
  // Past the brass panel, a narrow one up to the opening.
  if (brassFront < along.z1 - 0.04) panelAt(east, 1.0, 1.96, brassFront, along.z1);
  const back = box.z0 + WALL_T + PANEL_T / 2 - INSET;
  add(boxMesh(w - 2 * WALL_T - 0.12, 0.72, PANEL_T, VENEER, { x: cx, y: 0.48, z: back }));
  // The handrail across the back, on two brackets.
  const railZ = box.z0 + WALL_T + 0.05;
  const rail = add(cylinderMesh(0.016, w - 2 * WALL_T - 0.16, METAL.brass(), { x: cx, y: 0.92, z: railZ }));
  rail.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const bracket = add(cylinderMesh(0.008, 0.05 + INSET, METAL.brass(), { x: cx + side * (w / 2 - WALL_T - 0.14), y: 0.92, z: box.z0 + WALL_T + 0.025 - INSET / 2 }));
    bracket.rotation.x = Math.PI / 2;
  }
  // The mirror in its brass frame, over the rail.
  const mirror = { w: w * 0.6, y0: 1.0, y1: 1.95 };
  const glassZ = box.z0 + WALL_T + PROUD;
  add(new THREE.Mesh(new THREE.PlaneGeometry(mirror.w, mirror.y1 - mirror.y0), MIRROR)).position.set(cx, (mirror.y0 + mirror.y1) / 2, glassZ);
  const frame = 0.025;
  const frameZ = box.z0 + WALL_T + FRAME_D / 2 - INSET;
  add(boxMesh(mirror.w + 2 * frame, frame, FRAME_D, METAL.brass(), { x: cx, y: mirror.y0 - frame / 2, z: frameZ }));
  add(boxMesh(mirror.w + 2 * frame, frame, FRAME_D, METAL.brass(), { x: cx, y: mirror.y1 + frame / 2, z: frameZ }));
  for (const side of [-1, 1]) add(boxMesh(frame, mirror.y1 - mirror.y0, FRAME_D, METAL.brass(), { x: cx + side * (mirror.w / 2 + frame / 2), y: (mirror.y0 + mirror.y1) / 2, z: frameZ }));
  // Scratched into the glass's lower edge over the years: keys, initials, a heart, and somewhere in them the old code.
  const scratches = new THREE.Mesh(new THREE.PlaneGeometry(mirror.w, 0.2), new THREE.MeshStandardMaterial({ map: mirrorScratchesTexture(), transparent: true, roughness: 0.5, depthWrite: false }));
  scratches.position.set(cx, mirror.y0 + 0.1, glassZ + WALL.print.lift);
  add(layMesh(scratches, WALL.print));
  // The ceiling's lamp: a frosted dome in a brass ring.
  add(cylinderMesh(0.13, 0.02, METAL.brass(), { x: cx, y: h - 0.01 + INSET, z: cz }));
  const dome = add(new THREE.Mesh(domeGeometry(), lamp));
  dome.position.set(cx, h - 0.02 + INSET, cz);
  dome.rotation.x = Math.PI;
  // The brass panel on the east wall, buried in it, its face engraved (the keyhole's word, the maker's plate).
  const plate = new THREE.MeshStandardMaterial({ map: plateTexture(), metalness: 1, roughness: 0.4 });
  add(new THREE.Mesh(new THREE.BoxGeometry(PANEL.t, PANEL.h, PANEL.d), [BRASS, plate, BRASS, BRASS, BRASS, BRASS])).position.set(box.x1 - WALL_T - PANEL.t / 2 + PANEL.set, PANEL.y, box.z1 - PANEL.fromGate);
}

/** The car's brass sill along the opening (height, depth). */
const SILL = { h: 0.01, d: 0.05 };
/** The mirror frame's depth off the back wall. */
const FRAME_D = 0.012;

let dome: THREE.BufferGeometry | null = null;
/** The lamp's frosted dome: a half sphere, its open side up until turned over. */
function domeGeometry(): THREE.BufferGeometry {
  dome ??= markShared(new THREE.SphereGeometry(0.11, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  return dome;
}

/** The panel's face (it looks -x: its left is -z): a double border, TOIT over the keyhole, the maker's plate at the foot. */
function plateTexture(): THREE.CanvasTexture {
  return sharedCanvasTexture('lift-plate', () => {
    const px = 600;
    const [canvas, ctx] = createCanvas(Math.round((PANEL.d / PANEL.h) * px), px);
    const W = canvas.width;
    ctx.fillStyle = '#c9a75b';
    ctx.fillRect(0, 0, W, px);
    ctx.strokeStyle = '#5a4520';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, W - 16, px - 16);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(15, 15, W - 30, px - 30);
    ctx.fillStyle = '#3a2a14';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const at = (y: number): number => ((PANEL.h / 2 - y) / PANEL.h) * px;
    ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText('TOIT', W / 2, at(KEY.keyhole) - 38);
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('DELAUNAY', W / 2, px - 78);
    ctx.font = '15px Georgia, serif';
    ctx.fillText('PARIS · 1928', W / 2, px - 56);
    ctx.fillText('4 PERSONS · 300 KG', W / 2, px - 34);
    return canvas;
  }, { anisotropy: 'facing' });
}

/** The dial's face: brass, a fine rim, the floors round the top half from ours (left) to the ground floor (right), ticks between. */
function dialTexture(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  const c = size / 2;
  ctx.fillStyle = '#d8bf86';
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5a4520';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(c, c, c - 6, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#2a1d0c';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const k of STOPS) {
    const a = Math.PI - (k / STOREYS) * Math.PI;
    ctx.fillText(floorMark(k), c + 92 * Math.cos(a), c - 92 * Math.sin(a));
    if (k === STOREYS) continue;
    const t = Math.PI - ((k + 0.5) / STOREYS) * Math.PI;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c + 108 * Math.cos(t), c - 108 * Math.sin(t));
    ctx.lineTo(c + 118 * Math.cos(t), c - 118 * Math.sin(t));
    ctx.stroke();
  }
  return toTexture(canvas, 'facing');
}

/** Floor `k`'s mark on a dial or a button: "5" for the 5th, "G" for the ground floor. */
export function floorMark(k: number): string {
  return plan.floorNames[k]!.replace(/(st|nd|rd|th)$/, '');
}

/** Upright flat bars, two a tile (0.25 m), a tie across the top and a ring between them: an open pattern (alpha) that tiles. */
function latticeTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(64, 128);
  ctx.clearRect(0, 0, 64, 128);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.fillRect(14, 0, 5, 128);
  ctx.fillRect(46, 0, 5, 128);
  ctx.fillRect(0, 0, 64, 4);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(32, 64, 10, 0, Math.PI * 2);
  ctx.stroke();
  return repeatTexture(toTexture(canvas));
}

/** The frieze over a gate: a frame, bars in its upper part, and along its foot scrolls either side of the dial. */
function friezeTexture(): THREE.CanvasTexture {
  const W = 288;
  const H = 252;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  const band = H - 92;
  ctx.fillRect(0, band - 3, W, 6);
  for (let x = 24; x < W - 12; x += 24) ctx.fillRect(x - 2, 4, 5, band - 4);
  // The scrolls, mirrored about the middle, clear of the dial (the middle third).
  ctx.lineWidth = 5;
  for (const side of [-1, 1]) {
    for (const [dx, r, turn] of [
      [52, 26, 1],
      [104, 20, -1],
    ] as const) {
      scroll(ctx, W / 2 + side * (W / 2 - dx), band + 46, r, side * turn);
    }
  }
  return toTexture(canvas);
}

/** A C-scroll: a spiral winding in from radius `r` round (x, y), clockwise for `turn` 1. */
function scroll(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, turn: number): void {
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const a = turn * t * Math.PI * 3.2;
    const rr = r * (1 - 0.8 * t);
    const px = x + rr * Math.cos(a);
    const py = y + rr * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}
