import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';

export interface SideboardOptions {
  /** Length along the wall. Default 1.6. */
  width?: number;
  /** Default 0.4. */
  depth?: number;
  /** Height of the top. Default 0.5 (low enough to sit under a projected picture). */
  height?: number;
  /** Carcass and door veneer. Default light oak. */
  wood?: number;
  /** A turntable on the top, its lid up. Default true. */
  turntable?: boolean;
  /** Sleeve colours of the records stacked beside it; empty for none. */
  records?: number[];
}

const LEG_H = 0.12;
const PANEL = 0.02;
/** How far the back legs stand off the wall. */
const OFF_WALL = 0.02;
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3 });
const BLACK = matte(0x1e1d1b, 0.6);
const VINYL = new THREE.MeshStandardMaterial({ color: 0x0f0f11, roughness: 0.35, metalness: 0.1 });
const STEEL = new THREE.MeshStandardMaterial({ color: 0xc4c7cb, metalness: 0.7, roughness: 0.3 });
const SLEEVE_EDGE = matte(0xe8e2d4, 0.9);

/**
 * A low mid-century sideboard against a wall: an oak carcass on four splayed legs, two sliding
 * doors with brass pulls, and on top a turntable with a record on the platter and a short stack
 * of sleeves beside it. Wall-hung with `y: 0`: origin on the floor at the wall, +z into the room.
 * Collides over its whole box.
 */
export class Sideboard extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  /** Height of the top surface: where things stand. */
  readonly topHeight: number;

  constructor(options: SideboardOptions = {}) {
    super();
    this.name = 'Sideboard';
    const width = options.width ?? 1.6;
    const depth = options.depth ?? 0.4;
    const height = options.height ?? 0.5;
    const wood = matte(options.wood ?? 0xb98f63, 0.55);
    const darkWood = matte(new THREE.Color(options.wood ?? 0xb98f63).multiplyScalar(0.72).getHex(), 0.6);
    this.topHeight = height;
    const z = OFF_WALL + depth / 2;
    const bodyH = height - LEG_H;

    // Carcass: top, bottom, two sides, back; the doors fill the front with a thin gap between them.
    part(this, width, PANEL, depth, wood, { y: height - PANEL / 2, z });
    part(this, width, PANEL, depth, wood, { y: LEG_H + PANEL / 2, z });
    for (const sx of [-1, 1]) part(this, PANEL, bodyH, depth, wood, { x: (sx * (width - PANEL)) / 2, y: LEG_H + bodyH / 2, z });
    part(this, width - 2 * PANEL, bodyH - 2 * PANEL, PANEL, darkWood, { y: LEG_H + bodyH / 2, z: OFF_WALL + PANEL / 2 });
    const doorW = (width - 2 * PANEL) / 2 - 0.004;
    const doorH = bodyH - 2 * PANEL - 0.006;
    for (const sx of [-1, 1]) {
      const x = (sx * (doorW + 0.008)) / 2;
      part(this, doorW, doorH, PANEL, darkWood, { x, y: LEG_H + bodyH / 2, z: OFF_WALL + depth - PANEL / 2 - 0.002 });
      // A brass finger pull towards the middle of each door.
      part(this, 0.012, 0.08, 0.006, BRASS, { x: x - sx * (doorW / 2 - 0.05), y: LEG_H + bodyH / 2, z: OFF_WALL + depth + 0.002 }).castShadow = false;
    }
    // Four legs splayed outwards.
    const up = new THREE.Vector3(0, 1, 0);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const head = new THREE.Vector3((sx * (width - 0.12)) / 2, LEG_H, z + (sz * (depth - 0.1)) / 2);
        const foot = new THREE.Vector3(head.x + sx * 0.025, 0, head.z + sz * 0.02);
        const axis = head.clone().sub(foot);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, axis.length(), 10), darkWood);
        leg.quaternion.setFromUnitVectors(up, axis.clone().normalize());
        leg.position.copy(foot).lerp(head, 0.5);
        leg.castShadow = true;
        leg.receiveShadow = true;
        this.add(leg);
      }

    if (options.turntable ?? true) this.buildTurntable(-width * 0.2, z, height);
    const records = options.records ?? [0xb5563e, 0x2f4f6b, 0xe4c46a, 0x4e6b45, 0x2b2b2b];
    if (records.length) this.buildRecords(records, width * 0.24, z + 0.01, height);

    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2 - 0.02, 0, 0), new THREE.Vector3(width / 2 + 0.02, height, OFF_WALL + depth + 0.02));
  }

  /** A plinth, the platter with a record spinning nowhere, the tonearm parked, the lid propped open against the wall. */
  private buildTurntable(x: number, z: number, top: number): void {
    const plinthW = 0.42;
    const plinthD = 0.34;
    const plinthH = 0.05;
    part(this, plinthW, plinthH, plinthD, matte(0x3a2f26, 0.5), { x, y: top + plinthH / 2, z });
    const platterY = top + plinthH;
    this.add(cylinderMesh(0.15, 0.012, STEEL, { x: x - 0.03, y: platterY + 0.006, z }, { segments: 32 }));
    const record = cylinderMesh(0.15, 0.003, VINYL, { x: x - 0.03, y: platterY + 0.0135, z }, { segments: 40 });
    record.castShadow = false;
    this.add(record);
    const label = cylinderMesh(0.045, 0.001, matte(0xd9a441, 0.7), { x: x - 0.03, y: platterY + 0.0155, z }, { segments: 20 });
    label.castShadow = false;
    this.add(label);
    this.add(cylinderMesh(0.004, 0.02, STEEL, { x: x - 0.03, y: platterY + 0.02, z }, { segments: 8 }));
    // Tonearm: pivot post at the back right, the arm resting on its cradle across to the platter's edge.
    const pivotX = x + plinthW / 2 - 0.05;
    const pivotZ = z - plinthD / 2 + 0.06;
    this.add(cylinderMesh(0.014, 0.035, BLACK, { x: pivotX, y: platterY + 0.0175, z: pivotZ }, { segments: 14 }));
    const arm = part(this, 0.008, 0.006, 0.2, STEEL, { x: pivotX - 0.03, y: platterY + 0.038, z: pivotZ + 0.1 });
    arm.rotation.y = 0.25;
    arm.castShadow = false;
    // The dust lid, hinged at the back, standing up open.
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(plinthW, 0.004, plinthD),
      new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.1, transparent: true, opacity: 0.35 }),
    );
    lid.position.set(x, platterY + plinthD / 2, z - plinthD / 2);
    lid.rotation.x = -Math.PI / 2 + 0.2;
    lid.castShadow = false;
    lid.receiveShadow = false;
    this.add(lid);
  }

  /** Sleeves lying flat in a loose pile, each turned a little. */
  private buildRecords(colors: number[], x: number, z: number, top: number): void {
    const size = 0.315;
    const thick = 0.006;
    colors.forEach((color, i) => {
      const cover = matte(color, 0.8);
      // BoxGeometry material order: +x, -x, +y (cover), -y, +z, -z.
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(size, thick, size), [SLEEVE_EDGE, SLEEVE_EDGE, cover, cover, SLEEVE_EDGE, SLEEVE_EDGE]);
      sleeve.position.set(x + (i % 2 ? 0.012 : -0.01), top + thick / 2 + i * thick, z + (i % 3 ? 0.008 : -0.012));
      sleeve.rotation.y = (i - colors.length / 2) * 0.09;
      sleeve.castShadow = i === colors.length - 1;
      sleeve.receiveShadow = true;
      this.add(sleeve);
    });
  }
}
