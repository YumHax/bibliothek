import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { paint } from '../materials/palette';
import { COURTYARD_YARD as yard } from '../outlook/outlookPlan';
import type { Vec2 } from '../street/streetPlan';

const HIGH = 2.4;

/**
 * What stops the player in the walked courtyard besides the facades (`StreetBounds`): the workshop's back wall, the
 * bins, the shed, the sandpit's frame, the bikes along the wing, the rack's posts and the chestnut's trunk, as boxes in
 * the street's frame (`COURTYARD_YARD`, which `Courtyard` draws them from). Nothing is drawn.
 */
export class YardBounds extends THREE.Group implements Furniture {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  readonly colliders: THREE.Box3[] = [];

  constructor(trunkRadius: number) {
    super();
    this.name = 'YardBounds';
    const box = (x0: number, z0: number, x1: number, z1: number, high = HIGH): void => {
      this.colliders.push(new THREE.Box3(new THREE.Vector3(Math.min(x0, x1), 0, Math.min(z0, z1)), new THREE.Vector3(Math.max(x0, x1), high, Math.max(z0, z1))));
    };
    const { workshop, bins, shed, sandpit, bikes, rack, chestnut } = yard;
    box(workshop.x1 - 0.2, workshop.z0, workshop.x1, workshop.z1);
    for (const { at: [x, z] } of bins) box(x - 0.31, z - 0.38, x + 0.31, z + 0.38, 1.1);
    box(shed.x0, shed.z0, shed.x1, shed.z1);
    box(sandpit.x0, sandpit.z0, sandpit.x1, sandpit.z1, 0.3);
    const bikeZ = bikes.map((b) => b.at[1]);
    box(bikes[0]!.at[0] - 0.12, Math.min(...bikeZ) - 0.9, bikes[0]!.at[0] + 0.3, Math.max(...bikeZ) + 0.9, 1.1);
    const [rx, rz] = rack.at;
    for (const side of [-1, 1]) box(rx + (side * rack.width) / 2 - 0.05, rz - 0.05, rx + (side * rack.width) / 2 + 0.05, rz + 0.05);
    const [tx, tz] = chestnut.at;
    box(tx - trunkRadius, tz - trunkRadius, tx + trunkRadius, tz + trunkRadius, 3);
  }
}

/**
 * Bin day: black bin bags left by the bins (`COURTYARD_PLAN.binDay.bags`, street frame), a lumpy sack each. One mesh
 * per bag, sharing one material; they do not collide (the bins do).
 */
export function binBags(spots: readonly Vec2[]): THREE.Group & Furniture {
  const group = new THREE.Group() as THREE.Group & { footprint: THREE.Box3; contactShadow: boolean };
  group.name = 'BinBags';
  group.footprint = new THREE.Box3();
  group.contactShadow = false;
  const plastic = paint(0x141416, 0.32);
  const sack = new THREE.SphereGeometry(0.26, 12, 8);
  spots.forEach(([x, z], i) => {
    const bag = new THREE.Mesh(sack, plastic);
    bag.position.set(x, 0.24, z);
    bag.scale.set(1 + (i % 2) * 0.15, 1.05, 0.9);
    bag.rotation.y = i * 1.3;
    bag.castShadow = true;
    bag.receiveShadow = true;
    group.add(bag);
  });
  return group;
}
