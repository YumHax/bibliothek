import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { createCanvas, toTexture, repeatTexture } from '@/covers/generated/canvasUtils';
import { boxMesh } from '../meshUtils';
import { markShared } from '../materials/sharedResources';
import { PROUD } from '../props/joinery';
import { coverageKeepsAlpha, paint, standard } from '../materials/palette';
import { STAIRWELL_PLAN as plan, STOREYS, landingY } from './stairwellPlan';
import { scratchedCodeTexture } from './liftAttic';

/*
 * The old lift's ironwork and car, as built (the `Lift` runs them): the cage the full height of the shaft with a
 * folding gate on every landing, the wooden car with its mirror, lamp and brass panel, and the sizes both share.
 */

/** The floors it stops at: every landing, ours (0) down to the entrance hall's (`STOREYS`). */
export const STOPS = Array.from({ length: STOREYS + 1 }, (_, k) => k);
/** The car's panel: one button a floor, this far apart (m), round this height in the car. */
export const PANEL_PITCH = 0.075;
const PANEL_Y = 1.2;
/** The panel's brass plate on the car's east wall (height, depth along the wall). */
const PANEL_H = PANEL_PITCH * (STOREYS + 1) + 0.05;
const PANEL_D = 0.16;
export const GATE_HEIGHT = 2.15;
export const CAGE = { x0: plan.car.x0 - 0.05, x1: plan.car.x1 + 0.05, z0: plan.car.z0 - 0.05, z1: plan.car.z1 + 0.05 };
const TOP = landingY(0) + 2.8;
const WOOD = paint(0x5a3120, 0.45);
/** The lift's brass (each button lights a copy of its own on hover): kept across the stairwell's unloads. */
export const BRASS = markShared(new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 1, roughness: 0.32, emissive: 0xffb050, emissiveIntensity: 0 }));
// Painted wrought iron: a dielectric (metalness 0).
const IRON = standard({ color: 0x1c1d20, roughness: 0.45, metalness: 0 });

/** Floor `k`'s button on the panel, over the car's floor: ours at the top, the hall's at the bottom. */
export function panelY(k: number): number {
  return PANEL_Y + (STOREYS / 2 - k) * PANEL_PITCH;
}

/** A point `along` the panel from its middle, towards the car's gate (+z), local z. */
export function panelZ(along: number): number {
  return (plan.car.z0 + plan.car.z1) / 2 + along;
}

/**
 * The iron cage the full height of the shaft, added to `into`: four posts, lattice on three sides, a gate on every
 * landing and lattice between. Returns the gates by landing (each pivots on its west post: scaling in x folds it).
 */
export function buildCage(into: THREE.Object3D): Map<number, THREE.Mesh> {
  const gates = new Map<number, THREE.Mesh>();
  const height = TOP;
  for (const x of [CAGE.x0, CAGE.x1]) {
    for (const z of [CAGE.z0, CAGE.z1]) {
      into.add(boxMesh(0.05, height, 0.05, IRON, { x, y: height / 2, z }));
    }
  }
  const lattice = coverageKeepsAlpha(new THREE.MeshStandardMaterial({ map: latticeTexture(), color: 0x2a2b2e, metalness: 0, roughness: 0.5, alphaTest: 0.5, alphaToCoverage: QUALITY.msaa > 0, side: THREE.DoubleSide }));
  const panel = (width: number, h: number): THREE.PlaneGeometry => {
    const g = new THREE.PlaneGeometry(width, h);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width * 4, uv.getY(i) * h * 4);
    return g;
  };
  const w = CAGE.x1 - CAGE.x0;
  const d = CAGE.z1 - CAGE.z0;
  const sides: [THREE.PlaneGeometry, number, number, number][] = [
    [panel(d, height), CAGE.x0, (CAGE.z0 + CAGE.z1) / 2, Math.PI / 2],
    [panel(d, height), CAGE.x1, (CAGE.z0 + CAGE.z1) / 2, Math.PI / 2],
    [panel(w, height), (CAGE.x0 + CAGE.x1) / 2, CAGE.z0, 0],
  ];
  for (const [g, x, z, yaw] of sides) {
    const mesh = new THREE.Mesh(g, lattice);
    mesh.position.set(x, height / 2, z);
    mesh.rotation.y = yaw;
    into.add(mesh);
  }
  // The front: a gate on every landing, lattice between.
  for (let k = 0; k <= STOREYS; k++) {
    const y = landingY(k);
    const g = panel(w - 0.1, GATE_HEIGHT);
    // Pivot on the west post, so scaling in x folds it towards there.
    g.translate((w - 0.1) / 2, GATE_HEIGHT / 2, 0);
    const gate = new THREE.Mesh(g, lattice);
    gate.position.set(CAGE.x0 + 0.05, y, plan.car.z1 + 0.04);
    into.add(gate);
    gates.set(k, gate);
    const above = k === 0 ? TOP - (y + GATE_HEIGHT) : landingY(k - 1) - (y + GATE_HEIGHT);
    if (above > 0.05) {
      const fill = new THREE.Mesh(panel(w, above), lattice);
      fill.position.set((CAGE.x0 + CAGE.x1) / 2, y + GATE_HEIGHT + above / 2, plan.car.z1 + 0.05);
      into.add(fill);
    }
  }
  return gates;
}

/** The car, built into `car` (its floor at y 0): floor, wooden walls on three sides, a mirror, the ceiling and its `lamp`, the button panel. */
export function buildCar(car: THREE.Group, lamp: THREE.Material): void {
  const box = plan.car;
  const w = box.x1 - box.x0;
  const d = box.z1 - box.z0;
  const cx = (box.x0 + box.x1) / 2;
  const cz = (box.z0 + box.z1) / 2;
  const add = (g: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], x: number, y: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    car.add(mesh);
    return mesh;
  };
  // The floor stands PROUD of the floor it stops at: at the bottom, the hall's stone runs under the car.
  // The wooden boxes, bevelled on the better qualities (`boxMesh`): their edges catch the car's lamp.
  const board = (bw: number, bh: number, bd: number, x: number, y: number, z: number): void => {
    const mesh = boxMesh(bw, bh, bd, WOOD, { x, y, z });
    mesh.castShadow = true;
    car.add(mesh);
  };
  board(w, 0.08, d, cx, -0.04 + PROUD, cz);
  board(0.03, box.height, d, box.x0 + 0.015, box.height / 2, cz);
  board(0.03, box.height, d, box.x1 - 0.015, box.height / 2, cz);
  board(w, box.height, 0.03, cx, box.height / 2, box.z0 + 0.015);
  board(w, 0.06, d, cx, box.height + 0.03, cz);
  add(new THREE.PlaneGeometry(w * 0.6, 1.1), standard({ color: 0xc8d2d8, metalness: 1, roughness: 0.06 }), cx, 1.35, box.z0 + 0.03 + PROUD); // the mirror, on the back panel's face
  // Scratched into the varnish under the mirror, long ago: the old code (`ATTIC_PLAN.liftCode`), easy to miss.
  const scratches = add(new THREE.PlaneGeometry(0.3, 0.07), new THREE.MeshStandardMaterial({ map: scratchedCodeTexture(), transparent: true, roughness: 0.7, depthWrite: false }), cx + 0.12, 0.66, box.z0 + 0.03 + PROUD);
  scratches.castShadow = false;
  scratches.receiveShadow = false;
  const bulb = add(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16), lamp, cx, box.height - 0.02, cz);
  bulb.castShadow = false;
  const plate = new THREE.MeshStandardMaterial({ map: panelTexture(), metalness: 1, roughness: 0.4 });
  add(new THREE.BoxGeometry(0.02, PANEL_H, PANEL_D), [BRASS, plate, BRASS, BRASS, BRASS, BRASS], box.x1 - 0.035, PANEL_Y, cz);
}

/** The panel's face: each floor's name engraved left of its button (the face looks -x: its left is -z). */
function panelTexture(): THREE.CanvasTexture {
  const px = 400;
  const [canvas, ctx] = createCanvas(Math.round((PANEL_D / PANEL_H) * px), px);
  ctx.fillStyle = '#c9a75b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#3a2a14';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const k of STOPS) {
    const top = PANEL_Y + PANEL_H / 2 - panelY(k);
    ctx.fillText(plan.floorNames[k]!, canvas.width * 0.28, (top / PANEL_H) * px, canvas.width * 0.5);
  }
  return toTexture(canvas, 'facing');
}

/** Diamond lattice of flat iron: an open pattern (alpha) that tiles. */
function latticeTexture(): THREE.CanvasTexture {
  const size = 64;
  const [canvas, ctx] = createCanvas(size, size);
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(size, size);
  ctx.moveTo(size, 0);
  ctx.lineTo(0, size);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, 3);
  const texture = toTexture(canvas, 'facing');
  repeatTexture(texture);
  return texture;
}
