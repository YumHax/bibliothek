import * as THREE from 'three';
import type { DayNight } from '../../props/DayNight';
import { CAR_SIZES, carGeometries, vehicleGlass } from '../carModel';
import { snowCovered } from '../snowCover';
import { paint } from '../../materials/palette';
import { EmergencyVehicle, chequers, shade, uniform, type EmergencyOptions, type TrafficStops } from './Emergency';
import { random } from '@/random';
import { LampMaterial } from './lampMaterial';
import { WheelMaterial } from './wheelSpin';
import { VEHICLES } from '../../city/vehicles';

/** How often a patrol pulls a driver over instead, how far behind the pulled-over car it stops (m), how long the word at the window lasts (s). */
const TRAFFIC_STOP = { chance: 0.45, behind: 8, talk: [14, 24] as [number, number] };

/** A driver being pulled over: the car, and whether it has pulled in yet. */
type Pulled = Parameters<TrafficStops['release']>[0];

/**
 * A police car on a call, now and then: a white saloon in its blue and yellow chequer, a light bar
 * on the roof flashing blue and its siren on (`EmergencyVehicle`: the drivers pull over for it).
 * Some days it is a patrol that pulls a driver over (`TrafficStops`): it comes up behind a car,
 * the car pulls in to the kerb with its hazards on, the police car stops behind it, beacons
 * turning, and the officer walks up to the driver's window for a word before letting them go.
 */
export class PoliceCar extends EmergencyVehicle {
  /** The traffic stop under way: the car flagged down (none yet: looking for one), whether the police car is pulling in behind it. */
  private stop: { car: Pulled | null; behind: boolean } | null = null;
  readonly siren = 'police' as const;
  /** Its siren's two tones (Hz) and how long each is held: the two-tone, quick. */
  readonly tones: readonly [number, number] = [960, 770];
  readonly step = 0.32;

  constructor(dayNight: DayNight, options: EmergencyOptions) {
    super(dayNight, options, CAR_SIZES.saloon, 'police', 3.2, [uniform(91, 0x1f2f5a, 0x1f2f5a, 0x1a2340, 0x1a2340)]);
    this.name = 'PoliceCar';
    const g = carGeometries('saloon');
    const lamps = new LampMaterial();
    const wheels = new WheelMaterial(false);
    this.lampFace = lamps;
    this.wheelFace = { material: wheels, radius: VEHICLES.saloon.wheelRadius, base: 2.87 };
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

  protected override crewLines(): readonly string[] {
    return ['Move along, please.', 'Just a routine check.', 'Nothing to worry about.'];
  }

  protected override crewLabel(): string {
    return 'Police officer';
  }

  /** As any call; out on patrol (no call on the street), some days it pulls a driver over. */
  protected override schedule(dt: number): void {
    const was = this.active;
    super.schedule(dt);
    if (was || !this.active) return;
    this.stop = this.scene === 'none' && this.service.cars && random() < TRAFFIC_STOP.chance ? { car: null, behind: false } : null;
    if (this.stop) this.scene = 'toScene';
  }

  protected override animate(dt: number): void {
    super.animate(dt);
    const stop = this.stop;
    const cars = this.service.cars;
    if (!stop || !cars || this.state !== 'driving' || stop.behind) return;
    if (!stop.car) {
      stop.car = cars.flagDown(this.which, this.distance);
      return;
    }
    // Pulled in: the police car stops behind it.
    const at = cars.flaggedAt(stop.car);
    if (at === null) return;
    stop.behind = true;
    this.setStops([{ at: this.pointAt(Math.max(this.distance + 2, at - TRAFFIC_STOP.behind)), dwell: 0 }]);
  }

  protected override arrived(): void {
    const car = this.stop?.car;
    if (!car) {
      super.arrived();
      return;
    }
    this.scene = 'onScene';
    this.signalOverride = 'hazards';
    this.walkToWindow(car);
  }

  protected override finished(): void {
    // A patrol that found nobody to stop, or never got behind them: let them go all the same.
    if (this.stop?.car) this.service.cars?.release(this.stop.car);
    this.stop = null;
    super.finished();
  }

  /** The officer walks up to `car`'s driver's window, has a word, walks back; then the car is let go and the patrol drives on. */
  private walkToWindow(car: Pulled): void {
    const officer = this.crew[0];
    const cars = this.service.cars!;
    if (!officer) {
      cars.release(car);
      this.scene = 'leaving';
      return;
    }
    // The driver's window: on the car's left (the road's side), a little ahead of its middle.
    const lx = -Math.sin(car.yaw);
    const lz = -Math.cos(car.yaw);
    const window = new THREE.Vector3(car.position.x + lx * (car.width / 2 + 0.55) + Math.cos(car.yaw) * 0.2, 0, car.position.z + lz * (car.width / 2 + 0.55) - Math.sin(car.yaw) * 0.2);
    // Round the back of the police car's own side would cross the lane twice: out of the driver's door instead.
    const door = new THREE.Vector3(this.position.x + lx * (this.width / 2 + 0.5), 0, this.position.z + lz * (this.width / 2 + 0.5));
    officer.setPresent(true, door);
    officer.walk([window], () => {
      // Facing the car (Walker's yaw: 0 looks down +z).
      officer.stand(Math.atan2(car.position.x - window.x, car.position.z - window.z), 'hips');
      const [a, b] = TRAFFIC_STOP.talk;
      this.wait(a + random() * (b - a), () => {
        cars.release(car);
        officer.walk([door], () => {
          officer.setPresent(false);
          this.stop = null;
          this.scene = 'leaving';
        });
      });
    });
  }
}
