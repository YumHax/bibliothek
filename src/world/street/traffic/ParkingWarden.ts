import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { Walker } from '../../people/Walker';
import { inHours } from '@/time/clock';
import { SUNDAY_WEEKDAY, type Weekday } from '@/time/wakefulness';
import { seededRng } from '@/random';
import type { ParkedSpot, StreetCars } from '../StreetCars';
import { uniform } from './Emergency';

interface ParkingWardenOptions {
  cars: StreetCars;
  dayNight: DayNight;
  viewer: THREE.Object3D;
  /** The day of the week: no round on Sundays. */
  weekday: () => Weekday;
  /** Her hours, the stretch she walks (x, from and to) and how far out from the middle of the road the kerbside path runs (|z|). */
  hours: readonly [number, number];
  beat: readonly [number, number];
  kerb: number;
}

/** How long she writes a ticket (s), how often a car looked at gets one, how far ahead she looks for the next car (m). */
const ROUND = { writing: 6, ticketed: 0.35, look: 22, pause: [3, 8] as [number, number] };
/** What she says, clicked, and now and then to herself as she writes. */
const LINES = [
  'Two hours, it says. Two hours.',
  'I don’t make the rules, love.',
  'Lovely day for it.',
  'Paid and displayed? Didn’t think so.',
  'That white van by the market? Sunday mornings only. I let him off, he’s got all those boxes.',
  'There’s a tabby who sleeps on the bonnets. Warm engines. I write round her.',
  'Nobody tickets a taxi on the rank. More than my job’s worth.',
  'The bus driver waves every morning. Twelve years, never once missed.',
  'Number 31 again? I know that car. Grandson visits Thursdays.',
] as const;
/** The first lines are hers to mutter writing a ticket; the rest is what she knows of the street, said when asked. */
const MUTTERED = 4;

/**
 * The traffic warden's round (Monday to Saturday, in her hours): she walks the kerbside of one pavement along her
 * beat, stops at parked cars on the way, looks them over, and now and then writes one up: a ticket under its wiper
 * (`StreetCars.ticket`), gone when the car drives off. At the end of the beat she slips round the corner and comes back
 * down the other side. A `Walker` (placed by the street's builder).
 */
export class ParkingWarden extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly walker: Walker;
  private readonly random = seededRng('warden');
  /** Which pavement (-1 ours, 1 the far one) and which way along it she walks. */
  private side: -1 | 1 = -1;
  private heading: -1 | 1 = 1;
  private task: 'off' | 'walking' | 'writing' | 'pausing' = 'off';
  private clock = 0;
  private looking: ParkedSpot | null = null;
  /** Whether the car she is looking at gets a ticket: rolled once, as she reaches it, so the pose and the ticket agree. */
  private writesUp = false;
  private readonly seen = new Set<object>();

  constructor(private readonly options: ParkingWardenOptions) {
    super();
    this.name = 'ParkingWarden';
    this.walker = new Walker({ viewer: options.viewer, seed: 6620, look: uniform(6620, 0x1f2a44, 0xd8c23a, 0x1f2a44, 0x1f2a44), speed: 0.95, lines: LINES, label: 'Traffic warden', labelWithin: 5, fade: true });
    this.walker.setPresent(false);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** Monday to Saturday, in her hours. */
  private get onDuty(): boolean {
    const { dayNight, hours, weekday } = this.options;
    return weekday() !== SUNDAY_WEEKDAY && inHours(dayNight.state.hours, hours);
  }

  update(dt: number): void {
    if (!this.onDuty) {
      if (this.task !== 'off' && !this.walker.isWalking) this.goHome();
      return;
    }
    if (this.task === 'off') this.startBeat();
    this.clock -= dt;
    if (this.task === 'writing' && this.clock <= 0) this.finishWriting();
    else if (this.task === 'pausing' && this.clock <= 0) this.next();
  }

  /** On duty: she comes round the corner at one end of the beat. */
  private startBeat(): void {
    const [from, to] = this.options.beat;
    this.heading = this.random() < 0.5 ? 1 : -1;
    this.side = this.random() < 0.5 ? -1 : 1;
    this.seen.clear();
    this.walker.setPresent(true, this.kerbPoint(this.heading > 0 ? from : to));
    this.next();
  }

  /** The next parked car ahead on her side (within `ROUND.look`), or on to the beat's end. */
  private next(): void {
    // Her hours are over while she walked: home, not on round the beat again.
    if (!this.onDuty) {
      this.goHome();
      return;
    }
    const x = this.walker.position.x;
    const [from, to] = this.options.beat;
    const spot = this.options.cars
      .parkedSpots()
      .filter((s) => Math.sign(s.at[1]) === this.side && s.at[0] >= from && s.at[0] <= to && !this.seen.has(s.car) && this.heading * (s.at[0] - x) > 0.5 && this.heading * (s.at[0] - x) < ROUND.look)
      .sort((a, b) => this.heading * (a.at[0] - b.at[0]))[0];
    if (spot) {
      this.seen.add(spot.car);
      this.looking = spot;
      this.task = 'walking';
      this.walker.walk([this.kerbPoint(spot.at[0])], () => this.inspect(spot));
      return;
    }
    const end = this.heading > 0 ? to : from;
    this.task = 'walking';
    this.walker.walk([this.kerbPoint(end)], () => this.turnRound());
  }

  /** By the car: she looks it over, and may write it up. */
  private inspect(spot: ParkedSpot): void {
    // Facing the car (Walker's yaw: 0 looks down +z): towards the road from her pavement. Writing it up, pad held in
    // front of her ('read'); letting it off, a look over it, hands on hips, and on sooner.
    this.writesUp = this.random() < ROUND.ticketed && !spot.car.active;
    this.walker.stand(this.side < 0 ? 0 : Math.PI, this.writesUp ? 'read' : 'hips');
    this.task = 'writing';
    this.clock = this.writesUp ? ROUND.writing : ROUND.writing * 0.4;
    this.looking = spot;
  }

  private finishWriting(): void {
    const spot = this.looking;
    this.looking = null;
    if (spot && this.writesUp && !spot.car.active) {
      this.options.cars.ticket(spot.car);
      if (this.random() < 0.4) this.walker.say(LINES[Math.floor(this.random() * MUTTERED)]!);
    }
    this.task = 'pausing';
    const [a, b] = ROUND.pause;
    this.clock = (a + this.random() * (b - a)) * 0.3;
  }

  /** At the beat's end: round the corner, and back along the other pavement. */
  private turnRound(): void {
    this.side = this.side < 0 ? 1 : -1;
    this.heading = this.heading > 0 ? -1 : 1;
    this.seen.clear();
    this.walker.setPresent(true, this.kerbPoint(this.walker.position.x));
    this.next();
  }

  /** Off duty: gone round the nearest end of the beat. */
  private goHome(): void {
    this.task = 'off';
    this.walker.setPresent(false);
  }

  /** The kerbside path on her pavement at `x` (zone-local, on the ground). */
  private kerbPoint(x: number): THREE.Vector3 {
    return new THREE.Vector3(x, 0, this.side * this.options.kerb);
  }
}
