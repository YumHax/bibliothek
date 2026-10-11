import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Prop } from '../props/Prop';
import { Walker } from '../people/Walker';
import { randomLook, type PersonLook } from '../people/looks';
import { Dog } from '../street/life/Dog';
import { inHours } from '@/time/clock';
import type { Vec2 } from '../measures/street';

/** How far ahead of her the dog trots, and how far to her right. */
const LEAD = { ahead: 0.7, side: 0.35 };

/** What Mrs Bassot says, clicked. */
const BASSOT_LINES = [
  'You’re Odette’s grandchild! She never stops talking about you.',
  'Biscotte barks at the radiator, you know. Every night. The vet says she’s “sensitive”.',
  'Don’t mind her, she only bites the postman.',
  'Your grandmother brought me soup when I had my hip done. A saint, that woman. A stubborn saint.',
  'If you’re going up, tell Odette I’ve got her magazine. She’ll know.',
] as const;

interface DogWalkOptions {
  viewer: THREE.Object3D;
  /** Her building's door (where she comes out and goes back in), and the walk there and back. */
  from: Vec2;
  path: readonly Vec2[];
  /** The hours she takes the dog out (game hours, [from, to) each). */
  hours: readonly (readonly [number, number])[];
  hour: () => number;
  day: () => number;
}

/** Mrs Bassot: in her sixties, her raincoat and headscarf, the lead in her hand. */
function bassotLook(): PersonLook {
  return { ...randomLook(1957, 'shopper', { age: 'elder', season: 'autumn' }), coat: true, scarf: 0x8f2a2a, bag: undefined, hat: undefined, smile: true };
}

/**
 * MRS BASSOT AND BISCOTTE (docs/grandma.md "Around her flat"): Mémé's neighbour downstairs at number 14 and her dog,
 * out on Linden Avenue at their hours (`LINDEN_PLAN.dogWalk`): she comes out of the door, walks the dog along her
 * side and back, and goes in again; once a walk an hour, only while the player is on the avenue. Clicked, she says a
 * word (Odette, the radiator, the postman). The dog is the street's (`street/life/Dog`), trotting ahead on her right.
 * Placed at the zone's origin; `walker` is placed by the builder (it is clicked).
 */
export class DogWalk extends Prop implements Updatable {
  readonly walker: Walker;
  private readonly dog = new Dog(3);
  private readonly target = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private inside = false;
  /** The walk under way's key (day and slot), and the last one done. */
  private walked: string | null = null;
  private out = false;

  constructor(private readonly options: DogWalkOptions) {
    super();
    this.name = 'DogWalk';
    this.walker = new Walker({ viewer: options.viewer, seed: 1957, look: bassotLook(), speed: 0.7, lines: BASSOT_LINES, label: 'Mrs Bassot · chat', speaker: 'Mrs Bassot', stopsToTalk: true, corners: 0.6 });
    this.walker.setPresent(false);
    this.dog.visible = false;
    this.add(this.dog);
  }

  setOccupied(occupied: boolean): void {
    this.inside = occupied;
  }

  update(dt: number): void {
    if (!this.out) {
      if (this.inside) this.maybeSetOff();
      return;
    }
    // The dog trots a little ahead of her, on her right; sits when she stops.
    const yaw = this.walker.facingYaw;
    this.ahead.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.target.copy(this.walker.position).addScaledVector(this.ahead, LEAD.ahead);
    this.target.x += -this.ahead.z * LEAD.side;
    this.target.z += this.ahead.x * LEAD.side;
    this.target.y = 0;
    this.dog.trot(dt, this.target, this.walker.isWalking);
  }

  /** At one of her hours, with the player out here, and not walked this slot yet: out of the door with the dog. */
  private maybeSetOff(): void {
    const { hours, hour, day, from, path } = this.options;
    const slot = hours.findIndex(([a, b]) => inHours(hour(), [a, b]));
    if (slot < 0) return;
    const key = `${day()}:${slot}`;
    if (this.walked === key) return;
    this.walked = key;
    this.out = true;
    const door = new THREE.Vector3(from[0], 0, from[1]);
    this.walker.setPresent(true, door);
    this.dog.position.copy(door);
    this.dog.visible = true;
    this.walker.setPose('lead');
    this.walker.walk(
      path.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      () => {
        // Back at the door: in they go.
        this.walker.setPresent(false);
        this.dog.visible = false;
        this.out = false;
      },
    );
  }
}
