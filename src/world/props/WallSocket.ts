import * as THREE from 'three';
import { Prop, part, matte } from './Prop';

export interface WallSocketOptions {
  /** Height of the plate's centre above the floor. Default 0.3. */
  height?: number;
  /** One or two outlets side by side. Default 2. */
  gangs?: 1 | 2;
  /**
   * A cable per plugged outlet (left first): the local point it runs to (x along the wall,
   * y up from the floor, z out from the wall), e.g. the back of a TV stand. It drops from the plug
   * to the floor, runs along it and rises into the device. Fewer cables than gangs leave outlets free.
   */
  cables?: [x: number, y: number, z: number][];
  /** Colour of the cables. Default black. */
  cableColor?: number;
}

const PLATE = 0.082;
const PLATE_DEPTH = 0.009;
const CABLE_RADIUS = 0.0032;
/** A cable lies a hair over the floor (clear of the rug-level contact shadows). */
const ON_FLOOR = 0.013;

/**
 * A European wall socket: a white plate with one or two round outlets, and the cables of whatever
 * is plugged in, sagging down to the floor and snaking off to their devices (tubes along a
 * Catmull-Rom curve). Wall-hung with `y: 0`: origin on the floor at the wall, +z into the room.
 * Decor: never collides, nothing to click.
 */
export class WallSocket extends Prop {
  /** Its cables lie on the floor: no contact shadow under them. */
  readonly contactShadow = false;

  constructor(options: WallSocketOptions = {}) {
    super();
    this.name = 'WallSocket';
    const height = options.height ?? 0.3;
    const gangs = options.gangs ?? 2;
    const plastic = matte(0xf3f1ec, 0.35);
    const dark = matte(0x2a2a2c, 0.6);
    const pitch = PLATE;
    const outlets = Array.from({ length: gangs }, (_, i) => (i - (gangs - 1) / 2) * pitch);

    part(this, PLATE * gangs, PLATE, PLATE_DEPTH, plastic, { y: height, z: PLATE_DEPTH / 2 }).castShadow = false;
    for (const x of outlets) {
      const well = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.004, 20), dark);
      well.rotation.x = Math.PI / 2;
      well.position.set(x, height, PLATE_DEPTH + 0.0005);
      this.add(well);
    }

    const cableMat = matte(options.cableColor ?? 0x18181a, 0.55);
    const plugMat = matte(options.cableColor === undefined ? 0x202022 : options.cableColor, 0.45);
    (options.cables ?? []).slice(0, gangs).forEach((end, i) => {
      const x = outlets[i]!;
      const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.03, 16), plugMat);
      plug.rotation.x = Math.PI / 2;
      plug.position.set(x, height, PLATE_DEPTH + 0.015);
      plug.castShadow = true;
      this.add(plug);
      this.add(cable(new THREE.Vector3(x, height - 0.01, PLATE_DEPTH + 0.03), new THREE.Vector3(...end), cableMat));
    });
  }
}

/** A cable from the plug (`from`) down to the floor, across it and up into the device (`to`). */
function cable(from: THREE.Vector3, to: THREE.Vector3, material: THREE.Material): THREE.Mesh {
  const out = from.z + 0.02;
  const points = [
    from,
    new THREE.Vector3(from.x, from.y - 0.05, out),
    new THREE.Vector3(from.x + (to.x - from.x) * 0.05, ON_FLOOR + 0.03, out + 0.01),
    new THREE.Vector3(from.x + (to.x - from.x) * 0.2, ON_FLOOR, out + (to.z - out) * 0.4 + 0.02),
    new THREE.Vector3(from.x + (to.x - from.x) * 0.65, ON_FLOOR, to.z + 0.03),
    new THREE.Vector3(to.x, ON_FLOOR + 0.02, to.z),
    to,
  ];
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, CABLE_RADIUS, 6, false), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
