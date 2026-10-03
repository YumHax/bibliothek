import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DayNight } from '../../props/DayNight';
import { LORRY, lorryGeometries, vehicleGlass } from '../carModel';
import { snowCovered } from '../snowCover';
import { paint } from '../../materials/palette';
import { bareMetal } from '../metals';
import { EmergencyVehicle, shade, type EmergencyOptions } from './Emergency';
import { LampMaterial } from './lampMaterial';
import { WheelMaterial } from './wheelSpin';

/** The ladder on the roof: how long, how wide, how many rungs, how high over the body. */
const LADDER = { length: 6.6, width: 0.6, rungs: 14, lift: 0.14 } as const;

/**
 * Once in a long while a fire engine: the bin lorry's cab and body in fire red with a white band,
 * roller shutters down its sides, a ladder on the roof, blue lamps over the cab and its siren on
 * (`EmergencyVehicle`: the drivers pull over for it). Slower to get going than a car.
 */
export class FireEngine extends EmergencyVehicle {
  readonly siren = 'fire' as const;
  /** Its siren's two tones (Hz) and how long each is held: low and slow. */
  readonly tones: readonly [number, number] = [650, 520];
  readonly step = 0.85;

  constructor(dayNight: DayNight, options: EmergencyOptions) {
    super(dayNight, options, LORRY, 'fire', 1.5);
    this.name = 'FireEngine';
    const g = lorryGeometries();
    const lamps = new LampMaterial();
    const wheels = new WheelMaterial(false);
    this.lampFace = lamps;
    this.wheelFace = { material: wheels, radius: LORRY.wheelRadius };
    g.beacon.dispose();
    this.add(
      shade(new THREE.Mesh(g.body, snowCovered(new THREE.MeshStandardMaterial({ color: 0xb3221c, roughness: 0.35 })))),
      shade(new THREE.Mesh(g.glass, vehicleGlass())),
      shade(new THREE.Mesh(g.wheels, wheels)),
      new THREE.Mesh(g.lamps, lamps),
    );
    const { length, width, height } = LORRY;
    // The white band, the lockers' roller shutters (bare aluminium) down each side.
    const band = new THREE.Mesh(new THREE.BoxGeometry(length - 0.3, 0.22, width + 0.02), paint(0xf0eee6, 0.5));
    band.position.set(0, 1.0, 0);
    this.add(band);
    const shutters: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) shutters.push(new THREE.BoxGeometry(1.7, 1.6, 0.02).translate(-3.3 + i * 1.9, 2.15, side * (width / 2 - 0.01)));
    }
    this.add(shade(new THREE.Mesh(mergeGeometries(shutters)!, bareMetal({ color: 0xb8bcc0, roughness: 0.35 }))));
    for (const s of shutters) s.dispose();
    // The ladder: two rails and the rungs between them, on the roof.
    const rails: THREE.BufferGeometry[] = [];
    const y = height + LADDER.lift;
    for (const z of [-LADDER.width / 2, LADDER.width / 2]) rails.push(new THREE.BoxGeometry(LADDER.length, 0.08, 0.05).translate(-0.6, y, z));
    for (let i = 0; i < LADDER.rungs; i++) rails.push(new THREE.CylinderGeometry(0.018, 0.018, LADDER.width, 6).rotateX(Math.PI / 2).translate(-0.6 - LADDER.length / 2 + (i + 0.5) * (LADDER.length / LADDER.rungs), y, 0));
    for (const r of rails) r.deleteAttribute('uv');
    this.add(shade(new THREE.Mesh(mergeGeometries(rails.map((r) => (r.index ? r.toNonIndexed() : r)))!, bareMetal({ color: 0xc8ccd0, roughness: 0.3 }))));
    this.lightBar(3.8, 2.98, width - 0.4);
  }
}
