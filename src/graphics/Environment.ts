import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Updatable } from '@/core/Engine';

/** Strength of the reflections in a fully lit room; the room's own lamps and hemisphere do the rest. */
const MAX_INTENSITY = 0.24;
/** Per second: switching a lamp dims the reflections along with it, without a pop. */
const RATE = 4;

/**
 * Something to reflect: a small studio room (three.js's `RoomEnvironment`) prefiltered once
 * into a PMREM and set as the scene's environment, so glossy plastic, glass and metal catch
 * highlights instead of reading flat. Image-based light also brightens the diffuse a little, so
 * its intensity follows how lit the player's room is (`level`, 0 dark .. 1 lamp or sun): a room
 * with the lights off at night must not glow with a studio's reflections.
 */
export class Environment implements Updatable {
  private intensity = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly level: () => number,
  ) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    // Starts dark and eases up on the first frames (`level` is only read once the loop runs).
    scene.environmentIntensity = 0;
  }

  update(dt: number): void {
    const target = MAX_INTENSITY * THREE.MathUtils.clamp(this.level(), 0, 1);
    this.intensity += (target - this.intensity) * (1 - Math.exp(-RATE * dt));
    this.scene.environmentIntensity = this.intensity;
  }
}
