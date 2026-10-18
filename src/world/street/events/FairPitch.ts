import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { inHours } from '@/time/clock';
import type { Furniture } from '../../Furniture';
import type { Walker } from '../../people/Walker';
import { disposeTree } from '../../materials/sharedResources';

/** The zone the Fair's things are placed in (`Zone`'s calls the pitch passes on). */
interface PitchZone {
  place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F;
  remove(item: Furniture): void;
  toLocal(point: THREE.Vector3): THREE.Vector3;
}

interface FairPitchOptions {
  zone: PitchZone;
  /** The game hour now, and the hours the stalls are out (`STREET_PLACES.fair.hours`). */
  hours: () => number;
  open: readonly [number, number];
  /** Sets the stalls out through `pitch` (the builder's: the stalls, their keepers, the raffle, the crêpe cart). */
  setUp: (pitch: Pitch) => void;
}

/** Where the stalls are set out: the zone's own calls, recorded so all of it can be packed away (a `StallHost`). */
export class Pitch {
  private readonly placed = new Set<Furniture>();
  private readonly people: Walker[] = [];

  constructor(private readonly zone: PitchZone) {}

  place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F {
    this.placed.add(item);
    return this.zone.place(item, position, rotationY);
  }

  remove(item: Furniture): void {
    this.placed.delete(item);
    this.zone.remove(item);
  }

  toLocal(point: THREE.Vector3): THREE.Vector3 {
    return this.zone.toLocal(point);
  }

  /** A keeper set behind a stall (placed by the street's own `placeWalker`): walks off at closing. */
  keep(person: Walker): void {
    this.people.push(person);
  }

  /** Everything set out taken in (and freed), the keepers gone. */
  packAway(): void {
    for (const item of this.placed) {
      this.zone.remove(item);
      item.dispose?.();
      disposeTree(item);
    }
    this.placed.clear();
    for (const person of this.people) person.setPresent(false);
  }
}

/**
 * The Grand Flea Fair's pavement stalls kept to their hours (`STREET_PLACES.fair.hours`): nothing is out before the
 * morning's opening, the stalls are set up the moment it comes (or at once when the street is built in their hours),
 * and at the evening's closing everything set up is packed away (the copies, the drum, the cart; the keepers walk
 * off). One Fair a day: set up once, packed once.
 */
export class FairPitch extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly pitch: Pitch;
  private state: 'waiting' | 'out' | 'packed' = 'waiting';

  constructor(private readonly options: FairPitchOptions) {
    super();
    this.name = 'FairPitch';
    this.pitch = new Pitch(options.zone);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(): void {
    const open = inHours(this.options.hours(), this.options.open);
    if (this.state === 'waiting' && open) {
      this.state = 'out';
      this.options.setUp(this.pitch);
    } else if (this.state === 'out' && !open) {
      this.state = 'packed';
      this.pitch.packAway();
    }
  }
}
