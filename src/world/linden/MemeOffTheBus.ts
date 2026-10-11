import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Prop } from '../props/Prop';
import { Walker } from '../people/Walker';
import { memeLook } from '../grandma/familyLooks';
import { GRANDMA } from '@/grandma/grandma';
import { RIDE_WORDS, type SharedRide } from '@/grandma/sharedRide';
import { pick, random } from '@/random';
import type { Vec2 } from '../measures/street';

/** Seconds after the curtain lifts before she turns to the player and speaks, and before she sets off. */
const SPEAK_AFTER = 0.8;
const SET_OFF_AFTER = 2.6;

/**
 * MÉMÉ OFF THE 38 (docs/grandma.md "Around her flat"): a morning she rode the bus with the player (`SharedRide`), she
 * steps off with them at the stop, her shopping in hand, says a word and walks home ahead of them over the zebra to
 * number 14, and goes in; the flat then has her back at home. Once a shared ride (`walkHome`). Placed at the zone's
 * origin; `walker` is placed by the builder.
 */
export class MemeOffTheBus extends Prop implements Updatable {
  readonly walker: Walker;
  private clock = -1;
  private spoken = false;
  private setOff = false;

  constructor(private readonly options: { viewer: THREE.Object3D; ride: SharedRide; day: () => number; path: readonly Vec2[] }) {
    super();
    this.name = 'MemeOffTheBus';
    this.walker = new Walker({ viewer: options.viewer, seed: 1931, look: memeLook(), speed: 0.55, label: `${GRANDMA.name} · on her way home`, speaker: GRANDMA.name, lines: ['Go on up, love, I’m right behind you. Well. In front of you.'], corners: 0.5 });
    this.walker.setPresent(false);
  }

  setOccupied(occupied: boolean): void {
    if (!occupied || this.clock >= 0 || !this.options.ride.walkHome(this.options.day())) return;
    const [x, z] = this.options.path[0]!;
    this.walker.setPresent(true, new THREE.Vector3(x, 0, z));
    this.walker.hold('shopping');
    this.walker.stand(0, 'stand', 'viewer');
    this.clock = 0;
    this.spoken = false;
    this.setOff = false;
  }

  update(dt: number): void {
    if (this.clock < 0) return;
    this.clock += dt;
    if (!this.spoken && this.clock >= SPEAK_AFTER) {
      this.spoken = true;
      this.walker.gesture('wave');
      this.walker.speak(pick(random, RIDE_WORDS.offTheBus));
    }
    if (!this.setOff && this.clock >= SET_OFF_AFTER) {
      this.setOff = true;
      this.walker.walk(
        this.options.path.slice(1).map(([px, pz]) => new THREE.Vector3(px, 0, pz)),
        () => {
          this.walker.setPresent(false);
          this.clock = -1;
        },
      );
    }
  }
}
