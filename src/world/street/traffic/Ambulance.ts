import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DayNight } from '../../props/DayNight';
import { CAR_SIZES, carGeometries } from '../carModel';
import { nightnessOf } from '../streetAir';
import { snowCovered } from '../snowCover';
import { paint, standard } from '../../materials/palette';
import type { Vec2 } from '../streetPlan';
import { ScriptedVehicle, type CollisionSet } from './ScriptedVehicle';
import type { StreetTraffic } from './StreetTraffic';
import type { SirenVoice } from '../audio/StreetCues';

export interface AmbulanceOptions {
  traffic: StreetTraffic;
  viewer: THREE.Object3D;
  /** The way it comes (the traffic's first route: up Park Street, along Front Street, into the side street). */
  route: readonly Vec2[];
  stopFor: number;
  collisions?: CollisionSet;
  /** Real seconds between two (drawn between these), and before the first. */
  every: readonly [number, number];
  first: readonly [number, number];
  /** Cruising speed (m/s): quicker than the cars. */
  cruise: number;
}

/** The blue lamps' flash: four a second, the two sides alternating. */
const FLASH_HZ = 4;

/**
 * Now and then an ambulance comes down Front Street (as the window view sees one pass): a white
 * van-bodied ambulance in its yellow and green chequer, blue lamps flashing on its roof and its
 * siren on (`sirenOn`, heard by `StreetCues`), a little quicker than the traffic. It drives the
 * traffic's first route like the bus and the lorry (`ScriptedVehicle`: it still queues and stops for
 * people), appearing at the route's start out of sight and gone at its end.
 */
export class Ambulance extends ScriptedVehicle implements SirenVoice {
  private readonly blues: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
  private readonly lamps: THREE.MeshBasicMaterial;
  private clock: number;
  private flash = 0;

  constructor(private readonly dayNight: DayNight, private readonly ambulance: AmbulanceOptions) {
    super({ traffic: ambulance.traffic, viewer: ambulance.viewer, route: ambulance.route, cruise: ambulance.cruise, size: CAR_SIZES.van, kind: 'van', stopFor: ambulance.stopFor, collisions: ambulance.collisions, accel: 2.8 });
    this.name = 'Ambulance';
    const [a, b] = ambulance.first;
    this.clock = a + Math.random() * (b - a);
    const g = carGeometries('van');
    this.lamps = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x666666 });
    this.add(
      shade(new THREE.Mesh(g.body, snowCovered(new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.35 })))),
      shade(new THREE.Mesh(g.glass, standard({ color: 0x1a232b, roughness: 0.06 }))),
      shade(new THREE.Mesh(g.wheels, paint(0x151515, 0.85))),
      new THREE.Mesh(g.lamps, this.lamps),
    );
    const { length, width, height } = CAR_SIZES.van;
    // The chequered band down each side: yellow and green squares.
    const yellow = paint(0xe8d23a, 0.5);
    const green = paint(0x2f8a4a, 0.5);
    const squares = 12;
    const square = (length - 0.8) / squares;
    const tiles: [THREE.BufferGeometry[], THREE.BufferGeometry[]] = [[], []];
    for (const side of [-1, 1]) {
      for (let i = 0; i < squares; i++) {
        for (let row = 0; row < 2; row++) {
          tiles[(i + row) % 2]!.push(new THREE.BoxGeometry(square, 0.16, 0.01).translate(-length / 2 + 0.4 + square * (i + 0.5), 0.95 + row * 0.16, side * (width / 2 + 0.056)));
        }
      }
    }
    // One mesh per colour.
    tiles.forEach((list, k) => {
      this.add(new THREE.Mesh(mergeGeometries(list)!, k ? yellow : green));
      for (const g of list) g.dispose();
    });
    // The light bar over the cab: two blue lamps.
    this.blues = [new THREE.MeshBasicMaterial({ color: 0x0a1030 }), new THREE.MeshBasicMaterial({ color: 0x0a1030 })];
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, width - 0.3), paint(0x202226, 0.5));
    bar.position.set(length / 2 - 1.1, height + 0.04, 0);
    this.add(bar);
    for (const [i, side] of [-1, 1].entries()) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.42), this.blues[i]!);
      lamp.position.set(length / 2 - 1.1, height + 0.12, side * (width / 2 - 0.4));
      this.add(lamp);
    }
  }

  get sirenOn(): boolean {
    return this.active;
  }

  protected schedule(dt: number): void {
    if (this.active) return;
    this.clock -= dt;
    if (this.clock > 0) return;
    const [a, b] = this.ambulance.every;
    this.clock = a + Math.random() * (b - a);
    this.depart();
  }

  protected animate(dt: number): void {
    const night = THREE.MathUtils.smoothstep(nightnessOf(this.dayNight.state), 0.2, 0.6);
    this.lamps.color.setScalar(0.4 + 2.4 * night);
    this.flash = (this.flash + dt * FLASH_HZ) % 1;
    const left = this.flash < 0.5;
    this.blues[0].color.setRGB(left ? 0.3 : 0.02, left ? 0.6 : 0.04, left ? 3 : 0.2);
    this.blues[1].color.setRGB(left ? 0.02 : 0.3, left ? 0.04 : 0.6, left ? 0.2 : 3);
  }
}

function shade(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
