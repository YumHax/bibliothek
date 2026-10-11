import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { paint } from '../materials/palette';
import { getPrize } from '@/economy/Prizes';
import { playJingle, playYoyo } from '@/audio/prizeSounds';
import { prizeModel } from './prizeModel';
import { type OwnedPrizes, showWhenOwned } from './ownedPrize';

interface HangingToyOptions {
  prizes: OwnedPrizes;
  /** The prize hung there: the yo-yo is thrown, the keyring jingles. */
  prizeId: 'yoyo' | 'keyring';
}

/** The string from the board to the toy at rest (m), and how far a throw takes the yo-yo down. */
const STRING = { yoyo: 0.12, keyring: 0.05 } as const;
const THROW = { drop: 0.36, seconds: 1.15 };
const STRING_MATERIAL = paint(0xeeeeee, 0.7);

/**
 * A prize hung under the prize shelf's bottom board on a string: the neon yo-yo (a click throws it: it spins down to
 * the end of its string and climbs back, whirring) or the joystick keyring (a click sets it swinging with a jingle).
 * Hidden (and unclickable) until the prize is owned. Origin at the board's underside where the string is tied;
 * decoration, never collides.
 */
export class HangingToy extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly body = new THREE.Group();
  /** At the string's end: the yo-yo spins about it (its axle), the keyring hangs from it by its ring. */
  private readonly end = new THREE.Group();
  private readonly string: THREE.Mesh;
  private readonly unsubscribe: () => void;
  private readonly rest: number;
  private owned = false;
  /** Seconds left of a throw (the yo-yo) or of a swing (the keyring). */
  private moving = 0;

  constructor(private readonly options: HangingToyOptions) {
    super();
    this.name = 'HangingToy';
    const prize = getPrize(options.prizeId)!;
    this.rest = STRING[options.prizeId];
    // The string: a unit-long thread scaled to its length, tied at the origin.
    this.string = cylinderMesh(0.0008, 1, STRING_MATERIAL, { y: -0.5 }, { segments: 4 });
    const thread = new THREE.Group();
    thread.add(this.string);
    this.body.add(thread);
    const toy = prizeModel(prize.kind, prize.color);
    // The yo-yo by its axle (its centre), the keyring by the top of its ring.
    toy.position.y = options.prizeId === 'yoyo' ? -0.028 : -0.047;
    this.end.add(toy);
    this.body.add(this.end);
    this.add(this.body);
    this.hang(this.rest, 0);
    const hitbox = invisibleHitbox(0.08, 0.2, 0.08, { y: -0.1 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.unsubscribe = showWhenOwned(options.prizes, options.prizeId, this.body, hitbox, (owned) => (this.owned = owned));
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {}

  label(): string | null {
    if (!this.owned) return null;
    return this.options.prizeId === 'yoyo' ? 'Neon yo-yo · throw it' : 'Joystick keyring · give it a flick';
  }

  activate(): void {
    if (!this.owned || this.moving > 0) return;
    this.moving = THROW.seconds;
    if (this.options.prizeId === 'yoyo') playYoyo();
    else playJingle();
  }

  update(dt: number): void {
    if (this.moving <= 0) return;
    this.moving = Math.max(0, this.moving - dt);
    const k = 1 - this.moving / THROW.seconds;
    if (this.options.prizeId === 'yoyo') {
      // Down to the end of the string and back up, spinning all the way.
      const out = Math.sin(k * Math.PI);
      this.hang(this.rest + THROW.drop * out, k * 40);
    } else {
      // A swing that dies away.
      this.body.rotation.z = Math.sin(k * Math.PI * 6) * 0.5 * (1 - k);
    }
    if (this.moving === 0) {
      this.hang(this.rest, 0);
      this.body.rotation.z = 0;
    }
  }

  dispose(): void {
    this.unsubscribe();
  }

  /** The toy `length` below the knot, the yo-yo turned `spin` radians about its axle. */
  private hang(length: number, spin: number): void {
    this.string.parent!.scale.y = length;
    this.end.position.y = -length;
    if (this.options.prizeId === 'yoyo') this.end.rotation.z = spin;
  }
}
