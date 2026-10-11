import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { CAR_SIZES, carGeometries, vehicleGlass, type CarModelId } from '../street/carModel';
import { snowCovered } from '../street/snowCover';
import { LampMaterial } from '../street/traffic/lampMaterial';
import { WheelMaterial } from '../street/traffic/wheelSpin';
import type { ParkedShape } from '../city/parkedCars';
import type { Vec2 } from '../measures/street';

/** A car parked along the avenue's kerb (`LINDEN_PLAN.parked`). */
interface Parked {
  at: Vec2;
  yaw: number;
  shape: ParkedShape;
  paint: number;
}

/**
 * The cars parked along Linden Avenue: the street's models (`carModel`), standing for good (nobody drives off on this
 * stretch: the works have closed it to through traffic), solid. Each shape's geometries are made once and shared by
 * the cars of that shape; the paint is the car's own. Zone-local, origin at the zone's.
 */
export class LindenCars extends THREE.Group implements Furniture {
  readonly colliders: THREE.Box3[] = [];

  constructor(cars: readonly Parked[]) {
    super();
    this.name = 'LindenCars';
    const geometries = new Map<CarModelId, ReturnType<typeof carGeometries>>();
    const glass = vehicleGlass();
    const wheels = new WheelMaterial(false);
    const lamps = new LampMaterial();
    for (const car of cars) {
      let g = geometries.get(car.shape);
      if (!g) geometries.set(car.shape, (g = carGeometries(car.shape)));
      const body = new THREE.Group();
      body.position.set(car.at[0], 0, car.at[1]);
      body.rotation.y = car.yaw;
      const paint = snowCovered(new THREE.MeshStandardMaterial({ color: car.paint, roughness: 0.35, metalness: 0.2 }));
      const parts = [new THREE.Mesh(g.body, paint), new THREE.Mesh(g.glass, glass), new THREE.Mesh(g.wheels, wheels), new THREE.Mesh(g.lamps, lamps)];
      for (const mesh of parts) {
        mesh.castShadow = mesh.material !== glass && mesh.material !== lamps;
        mesh.receiveShadow = mesh.material !== lamps;
        body.add(mesh);
      }
      this.add(body);
      // Its footprint: along the kerb (nose to +x or -x).
      const { length, width } = CAR_SIZES[car.shape];
      const along = Math.abs(Math.cos(car.yaw)) > 0.5;
      const [hx, hz] = along ? [length / 2, width / 2] : [width / 2, length / 2];
      this.colliders.push(new THREE.Box3(new THREE.Vector3(car.at[0] - hx, 0, car.at[1] - hz), new THREE.Vector3(car.at[0] + hx, 1.4, car.at[1] + hz)));
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }
}
