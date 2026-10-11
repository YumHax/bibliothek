import * as THREE from 'three';
import { BRICKS, type FacadeStyle } from '../city/facadeStyle';
import { roofSlopeOf } from './roofSlope';
import type { RoofFurniture } from '../city/roofFurniture';
import type { FacadeSpec } from './streetPlan';
import { FacadeFrame } from './relief/facadeFrame';
import { TriBuilder } from './relief/TriBuilder';
import { snowCovered } from './snowCover';
import { gapAt } from '../surface/layers';

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
/** A dormer's glass in front of its face (one mesh: a real gap), holding as far as the roofs are seen from. */
const PANE = gapAt(100);

const POT_GEOMETRY = new THREE.CylinderGeometry(0.085, 0.1, 0.36, 8);
const VENT_GEOMETRY = new THREE.CylinderGeometry(0.07, 0.07, 1, 8);
const TANK_GEOMETRY = new THREE.CylinderGeometry(1.1, 1.1, 2.4, 14);
const TANK_CAP = new THREE.ConeGeometry(1.15, 0.9, 14);
const DISH_GEOMETRY = new THREE.CylinderGeometry(0.36, 0.3, 0.06, 14);
/** A ridge's or a mansard's break's zinc roll, a unit long along x. */
const ROLL_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 7).rotateZ(Math.PI / 2);
/** An oeil-de-boeuf's round pane and its stone ring, facing +z. */
const OEIL_PANE = new THREE.CircleGeometry(1, 18);
const OEIL_RING = new THREE.TorusGeometry(1, 0.16, 6, 18);
/** A segmental dormer head's arc: steps across. */
const ARC = 8;
const matrix = new THREE.Matrix4();
const local = new THREE.Matrix4();
const turn = new THREE.Matrix4();

/**
 * What stands on the street's roofs, built (the window view paints the same, `city/roofFurniture`): chimney stacks with
 * their caps and clay pots, the dormers of a mansard (cheeks, pane, and the head its building has: a little pediment,
 * a segmental arch or a zinc hood, now and then a round oeil-de-boeuf between them, the odd bay without), the zinc roll
 * along a pitched roof's ridge and a mansard's break, television aerials,
 * satellite dishes on their brackets, and on a flat roof the air-conditioning units, vent stacks and the odd water
 * tank on its legs. One mesh of vertex colours, snowed on (`snowCovered`). Decoration: nothing collides.
 */
export class RoofClutter extends THREE.Mesh {
  /** Where each chimney's pots end (zone-local): the smoke rises from there (`ChimneySmoke`). */
  readonly chimneyTops: THREE.Vector3[] = [];

  constructor(roofs: readonly DressedRoof[]) {
    const b = new TriBuilder();
    const tops: THREE.Vector3[] = [];
    for (const roof of roofs) dress(b, roof, tops);
    const material = snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }));
    super(b.isEmpty ? new THREE.BufferGeometry() : b.build(), material);
    this.name = 'RoofClutter';
    this.castShadow = true;
    this.receiveShadow = true;
    this.visible = !b.isEmpty;
    this.chimneyTops = tops;
  }
}

function dress(b: TriBuilder, { spec, style, height, foot, things }: DressedRoof, tops: THREE.Vector3[]): void {
  const frame = new FacadeFrame(spec);
  const m = frame.matrix(0, 0);
  const footY = height - foot;
  // The roof's top over the street and how far back from the wall it is: the ridge, the mansard's top, behind a flat roof's parapet.
  const slope = roofSlopeOf(spec, style);
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
    tops.push(frame.point(s, y1 + 0.55, back));
  }
  if (slope) {
    // The zinc roll along the ridge (a pitched roof's) or the mansard's break (where its steep slope meets the top).
    const ridgeBack = -slope.run;
    const roll = style.roof === 'pitched' ? 0.075 : 0.05;
    turn.makeScale(frame.length + 0.1, roll, roll);
    matrix.copy(at(m, frame.length / 2, topY + roll * 0.3, ridgeBack)).multiply(turn);
    b.geometry(matrix, ROLL_GEOMETRY, style.roof === 'pitched' ? new THREE.Color(style.roofColor).multiplyScalar(0.72) : ZINC);
  }
  if (style.roof === 'mansard' && slope) {
    // Up the slope, so far back: the slope's setback at a height over its foot.
    const setback = (y: number): number => (slope.run * (y - footY)) / slope.rise;
    for (const dormer of things.dormers) {
      if (dormer.kind === 'oeil') {
        oeil(b, m, style, dormer.s, footY, setback);
        continue;
      }
      const w = dormer.width;
      const y0 = footY + 0.5;
      const y1 = footY + 2.1;
      const front = -(setback(y0) + 0.04);
      const back = -setback(y1 + 0.5) - 0.1;
      const depth = front - back;
      b.box(m, dormer.s, (y0 + y1) / 2, (front + back) / 2, w + 0.3, y1 - y0, depth, style.trim);
      // The pane and its bar, on the dormer's face.
      b.quad(m, [dormer.s - w / 2, footY + 0.7, front + PANE], [dormer.s + w / 2, footY + 0.7, front + PANE], [dormer.s + w / 2, footY + 1.9, front + PANE], [dormer.s - w / 2, footY + 1.9, front + PANE], GLASS);
      b.box(m, dormer.s, footY + 1.3, front + PANE + 0.015, 0.05, 1.2, 0.02, style.frame);
      const fz = front + 0.05;
      const half = w / 2 + 0.25;
      if (dormer.kind === 'pediment') {
        // Its pediment: a triangle at the front, two slopes back.
        const apex = y1 + 0.45;
        b.triangle(m, [dormer.s - half, y1, fz], [dormer.s + half, y1, fz], [dormer.s, apex, fz], new THREE.Color(style.trim).multiplyScalar(0.92));
        b.quad(m, [dormer.s, apex, fz], [dormer.s + half, y1, fz], [dormer.s + half, y1, back], [dormer.s, apex, back], style.roofColor);
        b.quad(m, [dormer.s - half, y1, fz], [dormer.s, apex, fz], [dormer.s, apex, back], [dormer.s - half, y1, back], style.roofColor);
      } else if (dormer.kind === 'segment') {
        // A segmental arch: the face a fan under its curve, the zinc bent over it back to the slope.
        const rise = 0.32;
        const curve = Array.from({ length: ARC + 1 }, (_, i): [number, number] => [dormer.s - half + (2 * half * i) / ARC, y1 + rise * Math.sin((Math.PI * i) / ARC)]);
        const face = new THREE.Color(style.trim).multiplyScalar(0.94);
        for (let i = 0; i < ARC; i++) {
          const [s0, h0] = curve[i]!;
          const [s1, h1] = curve[i + 1]!;
          b.triangle(m, [s0, y1, fz], [s1, y1, fz], [s1, h1, fz], face);
          b.triangle(m, [s0, y1, fz], [s1, h1, fz], [s0, h0, fz], face);
          b.quad(m, [s1, h1, fz], [s1, h1, back], [s0, h0, back], [s0, h0, fz], ZINC);
        }
      } else {
        // A flat zinc hood standing out over the face, a lip at its front.
        b.box(m, dormer.s, y1 + 0.06, (fz + 0.12 + back) / 2, 2 * half + 0.1, 0.1, fz + 0.12 - back, ZINC);
        // (Its lip's face 5 cm before the hood's: never one plane with it, seen from down the street.)
        b.box(m, dormer.s, y1 - 0.02, fz + 0.14, 2 * half + 0.1, 0.08, 0.06, new THREE.Color(ZINC).multiplyScalar(0.8));
      }
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

/** An oeil-de-boeuf: a round window in a small body out of the slope, a stone ring round it, a zinc dome over it. */
function oeil(b: TriBuilder, m: THREE.Matrix4, style: FacadeStyle, s: number, footY: number, setback: (y: number) => number): void {
  const r = 0.3;
  const cy = footY + 1.15;
  const y0 = cy - r - 0.15;
  const y1 = cy + r + 0.12;
  const front = -(setback(y0) + 0.04);
  const back = -setback(y1 + 0.3) - 0.1;
  b.box(m, s, (y0 + y1) / 2, (front + back) / 2, 2 * r + 0.3, y1 - y0, front - back, style.trim);
  turn.makeScale(r, r, 1);
  matrix.copy(at(m, s, cy, front + PANE)).multiply(turn);
  b.geometry(matrix, OEIL_PANE, GLASS);
  turn.makeScale(r + 0.03, r + 0.03, 0.4);
  matrix.copy(at(m, s, cy, front + PANE * 2)).multiply(turn);
  b.geometry(matrix, OEIL_RING, new THREE.Color(style.trim).multiplyScalar(0.9));
  // (A radius whose upright facet stands 5 cm clear of the body's sides: the roll's heptagon has one at 0.9 of it.)
  turn.makeScale(front - back + 0.1, r + 0.27, r + 0.27);
  matrix.copy(at(m, s, y1, (front + back) / 2)).multiply(local.makeRotationY(Math.PI / 2)).multiply(turn);
  b.geometry(matrix, ROLL_GEOMETRY, ZINC);
}
