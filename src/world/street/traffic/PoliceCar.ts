import * as THREE from 'three';
import type { DayNight } from '../../props/DayNight';
import { CAR_SIZES, carGeometries, vehicleGlass } from '../carModel';
import { snowCovered } from '../snowCover';
import { paint } from '../../materials/palette';
import { EmergencyVehicle, chequers, shade, type EmergencyOptions } from './Emergency';
import { LampMaterial } from './lampMaterial';
import { WheelMaterial } from './wheelSpin';
import { VEHICLES } from '../../city/vehicles';

/**
 * A police car on a call, now and then: a white saloon in its blue and yellow chequer, a light bar
 * on the roof flashing blue and its siren on (`EmergencyVehicle`: the drivers pull over for it).
 */
export class PoliceCar extends EmergencyVehicle {
  readonly siren = 'police' as const;
  /** Its siren's two tones (Hz) and how long each is held: the two-tone, quick. */
  readonly tones: readonly [number, number] = [960, 770];
  readonly step = 0.32;

  constructor(dayNight: DayNight, options: EmergencyOptions) {
    super(dayNight, options, CAR_SIZES.saloon, 'police', 3.2);
    this.name = 'PoliceCar';
    const g = carGeometries('saloon');
    const lamps = new LampMaterial();
    const wheels = new WheelMaterial(false);
    this.lampFace = lamps;
    this.wheelFace = { material: wheels, radius: VEHICLES.saloon.wheelRadius };
    this.add(
      shade(new THREE.Mesh(g.body, snowCovered(new THREE.MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.3 })))),
      shade(new THREE.Mesh(g.glass, vehicleGlass())),
      shade(new THREE.Mesh(g.wheels, wheels)),
      new THREE.Mesh(g.lamps, lamps),
    );
    chequers(this, CAR_SIZES.saloon, [paint(0x1f3f8a, 0.45), paint(0xe2d23a, 0.45)], 0.5, 0.15, 0.55);
    const { height, width } = CAR_SIZES.saloon;
    this.lightBar(-0.35, height + 0.03, width - 0.5);
  }
}
