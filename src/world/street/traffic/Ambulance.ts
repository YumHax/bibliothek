import * as THREE from 'three';
import type { DayNight } from '../../props/DayNight';
import { CAR_SIZES, carGeometries } from '../carModel';
import { snowCovered } from '../snowCover';
import { paint, standard } from '../../materials/palette';
import { EmergencyVehicle, chequers, shade, type EmergencyOptions } from './Emergency';
import { LampMaterial } from './lampMaterial';
import { WheelMaterial } from './wheelSpin';
import { VEHICLES } from '../../city/vehicles';

export type AmbulanceOptions = EmergencyOptions;

/**
 * Now and then an ambulance comes through (as the window view sees one pass): a white van-bodied
 * ambulance in its yellow and green chequer, blue lamps flashing on its roof and its siren on, a
 * little quicker than the traffic (`EmergencyVehicle`: the drivers pull over for it).
 */
export class Ambulance extends EmergencyVehicle {
  readonly siren = 'ambulance' as const;

  constructor(dayNight: DayNight, options: AmbulanceOptions) {
    super(dayNight, options, CAR_SIZES.van, 'ambulance', 2.8);
    this.name = 'Ambulance';
    const g = carGeometries('van');
    const lamps = new LampMaterial();
    const wheels = new WheelMaterial(false);
    this.lampFace = lamps;
    this.wheelFace = { material: wheels, radius: VEHICLES.van.wheelRadius };
    this.add(
      shade(new THREE.Mesh(g.body, snowCovered(new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.35 })))),
      shade(new THREE.Mesh(g.glass, standard({ color: 0x1a232b, roughness: 0.06 }))),
      shade(new THREE.Mesh(g.wheels, wheels)),
      new THREE.Mesh(g.lamps, lamps),
    );
    chequers(this, CAR_SIZES.van, [paint(0x2f8a4a, 0.5), paint(0xe8d23a, 0.5)], 0.95);
    const { length, width, height } = CAR_SIZES.van;
    this.lightBar(length / 2 - 1.1, height + 0.04, width - 0.3);
  }
}
