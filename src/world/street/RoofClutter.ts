import * as THREE from 'three';
import { BRICKS, ROOF_SLOPE, type FacadeStyle } from '../city/facadeStyle';
import type { RoofFurniture } from '../city/roofFurniture';
import type { FacadeSpec } from './streetPlan';
import { FacadeFrame } from './relief/facadeFrame';
import { TriBuilder } from './relief/TriBuilder';
import { snowCovered } from './snowCover';

/** A roof to dress: its facade, the facade's look and size, what stands on it (`city/roofFurniture`). */
export interface DressedRoof {
  spec: FacadeSpec;
  style: FacadeStyle;
  height: number;
  /** How far under the parapet's top the slope starts (`Buildings`' `ROOF_FOOT`). */
  foot: number;
  things: RoofFurniture;
}

const POT = '#a8603e';
const METAL = '#2a2a2c';
const ZINC = '#8a9094';
const UNIT = '#b8bcbe';
const GLASS = '#26313d';
const DISH = '#d8d8d4';

const POT_GEOMETRY = new THREE.CylinderGeometry(0.085, 0.1, 0.36, 8);
const VENT_GEOMETRY = new THREE.CylinderGeometry(0.07, 0.07, 1, 8);
const TANK_GEOMETRY = new THREE.CylinderGeometry(1.1, 1.1, 2.4, 14);
const TANK_CAP = new THREE.ConeGeometry(1.15, 0.9, 14);
const DISH_GEOMETRY = new THREE.CylinderGeometry(0.36, 0.3, 0.06, 14);
const matrix = new THREE.Matrix4();
const local = new THREE.Matrix4();
const turn = new THREE.Matrix4();

/**
 * What stands on the street's roofs, built (the window view paints the same, `city/roofFurniture`): chimney stacks with
 * their caps and clay pots, a dormer per bay of a mansard (cheeks, pane, a little pediment), television aerials,
 * satellite dishes on their brackets, and on a flat roof the air-conditioning units, vent stacks and the odd water
 * tank on its legs. One mesh of vertex colours, snowed on (`snowCovered`). Decoration: nothing collides.
 */
export class RoofClutter extends THREE.Mesh {
  constructor(roofs: readonly DressedRoof[]) {
    const b = new TriBuilder();
    for (const roof of roofs) dress(b, roof);
    const material = snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }));
    super(b.isEmpty ? new THREE.BufferGeometry() : b.build(), material);
    this.name = 'RoofClutter';
    this.castShadow = true;
    this.receiveShadow = true;
    this.visible = !b.isEmpty;
  }
}

function dress(b: TriBuilder, { spec, style, height, foot, things }: DressedRoof): void {
  const frame = new FacadeFrame(spec);
  const m = frame.matrix(0, 0);
  const footY = height - foot;
  // The roof's top over the street and how far back from the wall it is: the ridge, the mansard's top, behind a flat roof's parapet.
  const slope = style.roof === 'flat' ? null : ROOF_SLOPE[style.roof];
  const topY = slope ? footY + slope.rise : height - 0.25;
  const topBack = slope ? slope.run : 1.6;
  for (const chimney of things.chimneys) {
    const s = chimney.s + chimney.width / 2;
    const back = -(topBack + (style.roof === 'mansard' ? 0.7 : 0.1));
    const y0 = topY - 1;
    const y1 = topY + chimney.rise;
    const stack = chimney.brick ? new THREE.Color(BRICKS[Math.floor(chimney.s * 7) % BRICKS.length]!).multiplyScalar(0.88) : new THREE.Color(style.wall).multiplyScalar(0.85);
    b.box(m, s, (y0 + y1) / 2, back, chimney.width, y1 - y0, 0.62, stack);
    b.box(m, s, y1 + 0.07, back, chimney.width + 0.12, 0.14, 0.74, stack.clone().multiplyScalar(1.18));
    for (let k = 0; k < chimney.pots; k++) {
      const ps = chimney.s + 0.2 + k * ((chimney.width - 0.4) / Math.max(1, chimney.pots - 1));
      b.geometry(at(m, chimney.pots === 1 ? s : ps, y1 + 0.32, back), POT_GEOMETRY, POT);
    }
  }
  if (style.roof === 'mansard' && slope) {
    // Up the slope, so far back: the slope's setback at a height over its foot.
    const setback = (y: number): number => (slope.run * (y - footY)) / slope.rise;
    for (const dormer of things.dormers) {
      const w = dormer.width;
      const y0 = footY + 0.5;
      const y1 = footY + 2.1;
      const front = -(setback(y0) + 0.04);
      const back = -setback(y1 + 0.5) - 0.1;
      const depth = front - back;
      b.box(m, dormer.s, (y0 + y1) / 2, (front + back) / 2, w + 0.3, y1 - y0, depth, style.trim);
      // The pane and its bar, on the dormer's face.
      b.quad(m, [dormer.s - w / 2, footY + 0.7, front + 0.006], [dormer.s + w / 2, footY + 0.7, front + 0.006], [dormer.s + w / 2, footY + 1.9, front + 0.006], [dormer.s - w / 2, footY + 1.9, front + 0.006], GLASS);
      b.box(m, dormer.s, footY + 1.3, front + 0.012, 0.05, 1.2, 0.01, style.frame);
      // Its pediment: a triangle at the front and back, two slopes between.
      const cap0 = y1;
      const apex = y1 + 0.45;
      const half = w / 2 + 0.25;
      const fz = front + 0.05;
      b.triangle(m, [dormer.s - half, cap0, fz], [dormer.s + half, cap0, fz], [dormer.s, apex, fz], new THREE.Color(style.trim).multiplyScalar(0.92));
      b.quad(m, [dormer.s, apex, fz], [dormer.s + half, cap0, fz], [dormer.s + half, cap0, back], [dormer.s, apex, back], style.roofColor);
      b.quad(m, [dormer.s - half, cap0, fz], [dormer.s, apex, fz], [dormer.s, apex, back], [dormer.s - half, cap0, back], style.roofColor);
    }
  }
  if (things.aerial) {
    const s = things.aerial.s;
    const back = -(topBack + 0.3);
    b.box(m, s, topY + 1.2, back, 0.05, 2.4, 0.05, METAL);
    for (const [y, span] of [[2.2, 0.9], [1.8, 0.7], [1.4, 0.5]] as const) b.box(m, s, topY + y, back, span, 0.035, 0.035, METAL);
    b.box(m, s, topY + 2.0, back, 0.03, 0.03, 0.8, METAL);
  }
  if (things.dish) {
    // On a bracket off the parapet, looking up over the street.
    const s = things.dish.s;
    b.box(m, s, height + 0.25, -0.2, 0.04, 0.5, 0.04, ZINC);
    turn.makeRotationX(Math.PI / 2 - 0.45);
    matrix.copy(at(m, s, height + 0.62, -0.12)).multiply(turn);
    b.geometry(matrix, DISH_GEOMETRY, DISH);
    b.box(m, s, height + 0.62, 0.1, 0.03, 0.03, 0.4, ZINC);
  }
  for (const unit of things.units) b.box(m, unit.s + 0.45, height - 0.25 + 0.33, -0.7, 0.9, 0.65, 0.55, UNIT);
  for (const vent of things.vents) {
    turn.makeScale(1, vent.height, 1);
    matrix.copy(at(m, vent.s + 0.07, height - 0.25 + vent.height / 2, -1.3)).multiply(turn);
    b.geometry(matrix, VENT_GEOMETRY, METAL);
  }
  if (things.tank) {
    const s = things.tank.s + 1.2;
    const back = -3.2;
    const base = height - 0.25;
    for (const [ds, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as const) b.box(m, s + ds, base + 0.8, back + dz, 0.12, 1.6, 0.12, '#2a2724');
    b.geometry(at(m, s, base + 2.8, back), TANK_GEOMETRY, '#5a4a3c');
    b.geometry(at(m, s, base + 4.45, back), TANK_CAP, '#4a3c30');
  }
}

/** The facade frame's matrix `m` moved to (s, y, out). */
function at(m: THREE.Matrix4, s: number, y: number, out: number): THREE.Matrix4 {
  return local.identity().makeTranslation(s, y, out).premultiply(m);
}
