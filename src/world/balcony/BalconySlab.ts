import * as THREE from 'three';
import { Prop, part, matte } from '../props/Prop';

export interface BalconySlabOptions {
  width: number;
  depth: number;
  /** Stone slab under the floor, and how far it runs out past the railing. */
  thickness: number;
  lip: number;
  /** Railing height and the gap between two of its bars. */
  railHeight: number;
  barSpacing: number;
}

const STONE = matte(0xb9b1a3, 0.85);
const STONE_EDGE = matte(0xa39b8c, 0.9);
const IRON = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.45, metalness: 0.6 });
const BAR = 0.014;
const RAIL = 0.035;
/** How far above the railing's top the colliders reach: no leaning out and falling six floors. */
const GUARD = 0.4;

/**
 * The balcony itself: a stone slab with a moulded edge, its floor at the zone's y 0, and a
 * wrought-iron railing along its front and both sides (square bars in one instanced mesh, a flat
 * top rail, a lower rail, posts at the corners). The railing is the balcony's colliders; the
 * building's front behind it is the collection room's wall. Local frame: origin at the floor's
 * middle, +z towards the street.
 */
export class BalconySlab extends Prop {
  readonly colliders: THREE.Box3[];

  constructor(options: BalconySlabOptions) {
    super();
    this.name = 'BalconySlab';
    const { width: w, depth: d, thickness: t, lip, railHeight: h, barSpacing } = options;
    // The slab, its top the floor, reaching back under the wall a little.
    const slab = part(this, w + 2 * lip, t, d + lip + 0.1, STONE, { y: -t / 2, z: lip / 2 - 0.05 });
    slab.receiveShadow = true;
    part(this, w + 2 * lip + 0.04, 0.05, 0.04, STONE_EDGE, { y: -t + 0.025, z: d / 2 + lip + 0.01 });

    // Railing: posts, rails, bars, all a hair inside the slab's edge.
    const front = d / 2 - 0.03;
    const side = w / 2 - 0.03;
    for (const x of [-side, side]) for (const z of [-d / 2 + 0.03, front]) part(this, 0.04, h, 0.04, IRON, { x, y: h / 2, z });
    for (const y of [h - RAIL / 2, 0.1]) {
      part(this, w - 0.06, RAIL * (y > 0.5 ? 1 : 0.6), RAIL * (y > 0.5 ? 1.4 : 0.6), IRON, { y, z: front });
      for (const x of [-side, side]) part(this, RAIL * (y > 0.5 ? 1.4 : 0.6), RAIL * (y > 0.5 ? 1 : 0.6), d - 0.06, IRON, { x, y, z: 0 });
    }
    const bars: THREE.Vector3[] = [];
    for (let x = -side + barSpacing; x < side - barSpacing / 2; x += barSpacing) bars.push(new THREE.Vector3(x, 0, front));
    for (let z = -d / 2 + barSpacing; z < front - barSpacing / 2; z += barSpacing) bars.push(new THREE.Vector3(-side, 0, z), new THREE.Vector3(side, 0, z));
    const barMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(BAR, h - 0.1, BAR), IRON, bars.length);
    const m = new THREE.Matrix4();
    bars.forEach((p, i) => barMesh.setMatrixAt(i, m.makeTranslation(p.x, 0.05 + (h - 0.1) / 2, p.z)));
    barMesh.castShadow = true;
    this.add(barMesh);
    // A scroll of ironwork in the middle of the front, between the rails.
    const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.008, 6, 24), IRON);
    scroll.position.set(0, h * 0.55, front);
    scroll.castShadow = true;
    this.add(scroll);

    const top = h + GUARD;
    this.colliders = [
      new THREE.Box3(new THREE.Vector3(-w / 2, 0, front - 0.02), new THREE.Vector3(w / 2, top, front + 0.3)),
      new THREE.Box3(new THREE.Vector3(-w / 2 - 0.3, 0, -d / 2), new THREE.Vector3(-side + 0.02, top, front + 0.3)),
      new THREE.Box3(new THREE.Vector3(side - 0.02, 0, -d / 2), new THREE.Vector3(w / 2 + 0.3, top, front + 0.3)),
    ];
  }
}
