import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { matte } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface SideTableOptions {
  /** Radius of the round top. */
  radius?: number;
  /** Height of the top surface above the floor. */
  height?: number;
  /** Wood colour (light oak by default). */
  wood?: number;
  /** Colour of the mug on top. */
  mug?: number;
  /** Cover colours of the magazine stack, bottom first (2-3 entries). */
  covers?: number[];
}

const TOP_THICKNESS = 0.025;
const SEGMENTS = 32;
const MUG_R = 0.04;
const MUG_H = 0.09;
const PAGES = matte(0xf0e9d8, 0.9);

/**
 * A small round side table on three splayed legs, with a ceramic mug and a short stack of
 * magazines on top. Local origin is the centre of the foot on the floor; +y is up.
 * A real collider: its footprint is the cylinder's bounding box.
 */
export class SideTable extends THREE.Group implements Furniture {
  readonly options: Required<SideTableOptions>;
  /** Height of the top surface: where things stand. */
  readonly topHeight: number;

  constructor(options: SideTableOptions = {}) {
    super();
    this.name = 'SideTable';
    this.options = {
      radius: 0.22,
      height: 0.5,
      wood: 0xb98f63,
      mug: 0xf1ede6,
      covers: [0x6f7f8c, 0xb56b5a, 0x8a9a6c],
      ...options,
    };
    this.topHeight = this.options.height;
    this.buildTable();
    this.buildMug(0.085, 0.06);
    this.buildMagazines(-0.05, -0.035);
  }

  get footprint(): THREE.Box3 {
    const r = this.options.radius;
    return new THREE.Box3(new THREE.Vector3(-r, 0, -r), new THREE.Vector3(r, this.options.height, r));
  }

  private buildTable(): void {
    const { radius, height, wood } = this.options;
    const oak = woodMaterial(wood, 0.55);
    const darkOak = woodMaterial(new THREE.Color(wood).multiplyScalar(0.8).getHex(), 0.6);

    const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.97, TOP_THICKNESS, SEGMENTS), oak);
    top.position.y = height - TOP_THICKNESS / 2;
    top.castShadow = true;
    top.receiveShadow = true;
    this.add(top);

    // A short hub under the top the legs plug into.
    const hubH = 0.05;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, hubH, 16), darkOak);
    hub.position.y = height - TOP_THICKNESS - hubH / 2;
    hub.castShadow = true;
    this.add(hub);

    // Three legs, each running from the hub out to a wider stance on the floor.
    const topR = 0.035;
    const floorR = radius * 0.82;
    const legTopY = height - TOP_THICKNESS - hubH * 0.6;
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const foot = new THREE.Vector3(Math.cos(angle) * floorR, 0.01, Math.sin(angle) * floorR);
      const head = new THREE.Vector3(Math.cos(angle) * topR, legTopY, Math.sin(angle) * topR);
      const axis = head.clone().sub(foot);
      const length = axis.length();
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, length, 10), oak);
      leg.quaternion.setFromUnitVectors(up, axis.normalize());
      leg.position.copy(foot).lerp(head, 0.5);
      leg.castShadow = true;
      leg.receiveShadow = true;
      this.add(leg);
    }
  }

  /** An open ceramic mug with a half-ring handle facing +x, standing at (x, z) on the top. */
  private buildMug(x: number, z: number): void {
    const ceramic = new THREE.MeshStandardMaterial({ color: this.options.mug, roughness: 0.4, side: THREE.DoubleSide });
    const mug = new THREE.Group();
    mug.position.set(x, this.topHeight, z);
    mug.rotation.y = -0.6; // handle turned a little towards the room

    const body = new THREE.Mesh(new THREE.CylinderGeometry(MUG_R, MUG_R * 0.92, MUG_H, 24, 1, true), ceramic);
    body.position.y = MUG_H / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(MUG_R * 0.92, 24), ceramic);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.004;
    // Coffee left in the bottom.
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(MUG_R * 0.93, 24), matte(0x2a1a10, 0.25));
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = MUG_H * 0.3;
    // Handle: half a torus in the vertical x/y plane, bulging out along +x.
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 8, 16, Math.PI), ceramic);
    handle.rotation.z = -Math.PI / 2;
    handle.position.set(MUG_R - 0.002, MUG_H / 2, 0);
    handle.castShadow = true;
    mug.add(body, bottom, coffee, handle);
    this.add(mug);
  }

  /** Two or three thin magazines stacked with a small twist, centred at (x, z) on the top. */
  private buildMagazines(x: number, z: number): void {
    const covers = this.options.covers.slice(0, 3);
    const thickness = 0.011;
    let y = this.topHeight;
    covers.forEach((color, i) => {
      const w = 0.17 - i * 0.008;
      const d = 0.23 - i * 0.01;
      const cover = matte(color, 0.75);
      // BoxGeometry material order: +x, -x (spine), +y (cover), -y, +z, -z.
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, thickness, d), [PAGES, cover, cover, cover, PAGES, PAGES]);
      mesh.position.set(x + (i % 2 ? 0.012 : -0.008), y + thickness / 2, z + (i % 2 ? -0.01 : 0.006));
      mesh.rotation.y = (i - 1) * 0.22 + (i % 2 ? -0.08 : 0.05);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
      y += thickness;
    });
  }
}
