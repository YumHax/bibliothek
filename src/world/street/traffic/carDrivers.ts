import * as THREE from 'three';
import { Walker } from '../../people/Walker';
import { randomLook } from '../../people/looks';
import { DRIVER_SEAT } from '../carModel';
import type { SeasonName } from '@/time/season';
import type { Bay, Car } from './Car';

/** How far along the pavement a driver comes from (or goes off to), and how far from the car's side they walk. */
const STROLL = { along: 8, kerb: 1.5, side: 0.5 } as const;
/** What a driver says, clicked on the way to their car or from it. */
const LINES = ['Just popping out.', 'Can’t find my keys. Oh, there.', 'Parking round here, honestly.', 'Back in five minutes. Famous last words.', 'Shopping. Always shopping.'] as const;

/**
 * The people who drive the parked cars: someone walks along the pavement to a parked car, round its nose to the
 * driver's door and gets in (the door shuts) before it pulls out; someone gets out of a car that has just parked and
 * walks off along the pavement, fading out. A small pool of `Walker`s, placed in the zone by the street's builder
 * (`walkers`); none free, the car goes (or stays) without anyone seen.
 */
export class CarDrivers {
  readonly walkers: readonly Walker[];
  private readonly busy = new Set<Walker>();

  constructor(viewer: THREE.Object3D, count: number, season?: SeasonName) {
    this.walkers = Array.from({ length: count }, (_, i) => {
      const seed = 4410 + i * 37;
      const walker = new Walker({ viewer, seed, look: randomLook(seed, 'shopper', season ? { season } : undefined), speed: 1.25, lines: LINES, label: 'Passer-by', labelWithin: 4, fade: true });
      walker.setPresent(false);
      return walker;
    });
  }

  /** Someone walks to `car` in `bay` and gets in; `seated` once the door has shut on them. False: nobody free. */
  board(car: Car, bay: Bay, seated: () => void): boolean {
    const walker = this.free();
    if (!walker) return false;
    const way = this.way(car, bay);
    this.busy.add(walker);
    walker.setPresent(true, way[0]);
    walker.walk(way.slice(1), () => {
      walker.setPresent(false);
      this.busy.delete(walker);
      seated();
    });
    return true;
  }

  /** Someone gets out of `car`, just parked in `bay`, and walks off along the pavement. */
  alight(car: Car, bay: Bay): void {
    const walker = this.free();
    if (!walker) return;
    const way = this.way(car, bay).reverse();
    this.busy.add(walker);
    walker.setPresent(true, way[0]);
    walker.walk(way.slice(1), () => {
      walker.setPresent(false);
      this.busy.delete(walker);
    });
  }

  private free(): Walker | undefined {
    return this.walkers.find((w) => !this.busy.has(w) && !w.isPresent);
  }

  /**
   * From along the pavement to the driver's door of `car` in `bay`: the pavement, the kerb by the car's nose, round
   * the nose (the driver sits on the left, the road's side), the door. Zone-local, on the ground.
   */
  private way(car: Car, bay: Bay): THREE.Vector3[] {
    const fx = Math.cos(bay.yaw);
    const fz = -Math.sin(bay.yaw);
    // Left of the heading (-sin, -cos): the driver's side, towards the road for a car parked on the right.
    const lx = fz;
    const lz = -fx;
    const [x, z] = bay.at;
    const halfWidth = car.width / 2;
    const nose = car.length / 2 + 0.7;
    const point = (along: number, left: number): THREE.Vector3 => new THREE.Vector3(x + fx * along + lx * left, 0, z + fz * along + lz * left);
    const seat = DRIVER_SEAT[car.model].x;
    // A pavement walked from ahead or behind, on the side away from the driver's door.
    const from = (car.slot % 2 === 0 ? 1 : -1) * STROLL.along;
    return [
      point(from, -halfWidth - STROLL.kerb),
      point(nose, -halfWidth - STROLL.kerb),
      point(nose, 0),
      point(nose - 0.4, halfWidth + STROLL.side),
      point(seat, halfWidth + STROLL.side),
    ];
  }
}
