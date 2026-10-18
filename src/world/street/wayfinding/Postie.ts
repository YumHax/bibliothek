import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { Walker } from '../../people/Walker';
import { inHours } from '@/time/clock';
import { SUNDAY_WEEKDAY, type Weekday } from '@/time/wakefulness';
import { uniform } from '../traffic/Emergency';

interface PostieOptions {
  dayNight: DayNight;
  viewer: THREE.Object3D;
  weekday: () => Weekday;
  /** Where the pillar box stands (zone-local, on the pavement) and the way its slot faces. */
  box: { at: THREE.Vector3; yaw: number };
  /** Whether the player posted a card today (she says it is in her bag). */
  postedToday: () => boolean;
}

/** The plate's last collections (`PostBox`'s plate): Monday to Friday at half past five, Saturday at noon. */
const COLLECTION = { weekday: 17.5, saturday: 12 } as const;
const SATURDAY: Weekday = 5;
/** She comes along the pavement from this far off (m), this long before the hour, spends this long at the box (game hours), and is gone the other way. */
const ROUND = { from: 10, early: 0.15, at: 0.12 } as const;
const LINES = ['Last collection! Anything for me, love?', 'Rain or shine. Mostly rain.', 'Postcards are back, you know. Somebody on this street sends them every week.'] as const;

/**
 * The postie who empties Front Street's pillar box at its last collection (`PostBox`'s plate): along our pavement a
 * little before the hour, a few minutes at the box (the door open, the sack filled: hands in front, 'read'), then on
 * up the street and gone. Clicked, a word; with the player's card in the box today, she says it is in the bag. A
 * `Walker` placed by the street's builder (`placeStreetEvents`), absent the rest of the day and on Sundays.
 */
export class Postie extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly walker: Walker;
  private state: 'off' | 'coming' | 'emptying' | 'leaving' = 'off';
  private line = 0;

  constructor(private readonly options: PostieOptions) {
    super();
    this.name = 'Postie';
    this.walker = new Walker({
      viewer: options.viewer,
      seed: 7317,
      look: uniform(7317, 0x2a3d6a, 0xd8b23a, 0x1f2638, 0x2a3d6a),
      speed: 1.1,
      label: 'The postie',
      labelWithin: 5,
      fade: true,
      talk: () => (options.postedToday() ? 'Yours is in the sack. It’ll be there in a day or two, don’t you worry.' : LINES[this.line++ % LINES.length]!),
    });
    this.walker.setPresent(false);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** Today's last collection (game hour), or null on a Sunday. */
  private collection(): number | null {
    const day = this.options.weekday();
    if (day === SUNDAY_WEEKDAY) return null;
    return day === SATURDAY ? COLLECTION.saturday : COLLECTION.weekday;
  }

  update(): void {
    const at = this.collection();
    const hours = this.options.dayNight.state.hours % 24;
    if (this.state === 'off' && at !== null && inHours(hours, [at - ROUND.early, at + ROUND.at / 2])) this.come();
    else if (this.state === 'emptying' && (at === null || !inHours(hours, [at - ROUND.early, at + ROUND.at]))) this.leave();
  }

  /** Along our pavement towards the box. */
  private come(): void {
    const { at, yaw } = this.options.box;
    const along = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const out = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const start = at.clone().addScaledVector(along, -ROUND.from).addScaledVector(out, 0.9);
    const stop = at.clone().addScaledVector(out, 0.75);
    this.state = 'coming';
    this.walker.setPresent(true, start);
    this.walker.walk([stop], () => this.empty());
  }

  /** At the box: the door open, the sack filled. */
  private empty(): void {
    if (this.state !== 'coming') return;
    this.state = 'emptying';
    this.walker.stand(this.options.box.yaw + Math.PI, 'read');
  }

  /** On up the street, and gone past the next corner. */
  private leave(): void {
    const { at, yaw } = this.options.box;
    const along = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const out = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.state = 'leaving';
    this.walker.walk([at.clone().addScaledVector(along, ROUND.from).addScaledVector(out, 0.9)], () => {
      this.walker.setPresent(false);
      this.state = 'off';
    });
  }
}
