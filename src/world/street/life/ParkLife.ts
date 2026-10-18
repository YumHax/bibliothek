import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { inHours } from '@/time/clock';
import { Walker } from '../../people/Walker';
import { PLAYGROUND } from '../../city/park';
import type { Vec2 } from '../streetPlan';
import { FLAT_IN_STREET } from '@/world/measures/street';
import { Figure } from './Figure';
import { streetLook } from './streetLook';
import type { TalkRole } from './streetTalk';
import { pick, random, within } from '@/random';
import type { PlaygroundSwing } from '../StreetParkFeatures';

interface ParkLifeOptions {
  viewer: THREE.Object3D;
  place: (walker: Walker, at: THREE.Vector3) => void;
  talk: (role: TalkRole) => string;
  /** Inside the gardens by the gate (zone-local): where they come in from and go out by. */
  gate: Vec2;
  /** The gardens' opening hours (game hours). */
  hours: readonly [number, number];
  /** Where the brisk walker turns back (zone-local), along the gravel path from the gate. */
  walkTo: Vec2;
  /** Where the old man stands to feed the pigeons (zone-local), and the crumbs' fall in front of him. */
  feeder: { at: Vec2; yaw: number };
  /** Calls the nearest flock to crumbs at a point (`Pigeons.feedAt`). */
  feed?: (at: Vec2) => boolean;
  drawDistance: number;
  fade: number;
  /** Fewer of them (low quality): only the children and their parent. */
  fewer?: boolean;
  /** The playground's swings (`StreetParkFeatures`): a child rides one, swinging it. */
  swings?: readonly PlaygroundSwing[];
  /** A swing's creak, a ride down the slide (`audio/StreetCues`). */
  cues?: { swing(at: Vec2): void; slide(at: Vec2): void };
}

/** Each piece of the playground, as a child stands at it (offsets from the playground's middle, from `StreetParkFeatures`' layout), and how. */
const PIECES: readonly { at: Vec2; yaw: number; sit?: number; ride?: 'swing' | 'slide' }[] = [
  { at: [-3.5, -0.6], yaw: Math.PI, ride: 'swing' },
  { at: [3, -2.9], yaw: 0, ride: 'slide' },
  { at: [-2.6, 3.6], yaw: Math.PI / 2 },
  { at: [4.2, 2.05], yaw: 0, sit: 0.33 },
];
/**
 * The slide (offsets from the playground's middle, `StreetParkFeatures`' layout): the ladder's foot, the platform, the
 * chute's top and bottom (with their heights over the lawn); seconds up the ladder and down the chute.
 */
const SLIDE = { foot: [3, -2.45] as Vec2, platform: [3, -1.6] as Vec2, top: [3, -0.95, 1.47] as const, bottom: [3, 0.9, 0.13] as const, climb: 1.6, down: 1.1 };
/** On a swing: how high they pump it (radians), seated this high at rest; a creak each half swing above this. */
const SWING_RIDE = { push: 0.55, seat: 0.5, creakAbove: 0.18, half: Math.PI / Math.sqrt(9.81 / 1.82) };
/** A ride under way: on a swing, up the ladder, down the chute. */
type Ride = { kind: 'swing'; swing: PlaygroundSwing; creak: number } | { kind: 'climb' } | { kind: 'slide'; t: number };
/** Where the parent watches from (offset from the playground's middle). */
const PARENT_AT: Vec2 = [0.5, -6.2];
/** A child stays at a piece this long (s); now and then a hop for joy, a call to be watched. */
const AT_PIECE = [6, 16] as const;
const WATCH_ME = ['Watch me!', 'Look! Look!', 'Again!', 'Higher!'];
/** The children are out in these hours (and the gardens' own). */
const PLAY_HOURS = [9.5, 19.5] as const;
/** Children run between the pieces. */
const RUN = 1.55;
/** The brisk walker's pace, and the hours they are out (before and after work). */
const BRISK = 1.65;
const BRISK_HOURS: readonly (readonly [number, number])[] = [[7.6, 10], [17, 20]];
/** The pigeon feeder's hours, a throw of crumbs this often (s), how long they stay. */
const FEEDER_HOURS = [10, 16.5] as const;
const THROW_EVERY = [3, 6] as const;
const FEEDER_STAY = [70, 150] as const;
/** Seconds between two visits of each of them. */
const BREAK = [40, 120] as const;

interface Actor {
  figure: Figure;
  state: 'away' | 'going' | 'there' | 'leaving';
  clock: number;
}

/**
 * Life in the park's gardens (beyond the gate, in its hours, by day and dry): two children going from piece to piece of
 * the playground (running, a hop, "Watch me!"), a parent standing by with their eyes on them; a brisk walker out and
 * back along the gravel path before and after work; an old man feeding the pigeons by the pond's fence, the nearest
 * flock coming down round his feet (`feed`). All come in by the gate, fade in there and out again; dressed for the
 * season. A click gets a word (`talk`). The park's strollers further out are `ParkStrollers`.
 */
export class ParkLife extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly kids: (Actor & { piece: number; ride: Ride | null })[] = [];
  private readonly grownUp: Actor;
  private readonly brisk: Actor | null;
  private readonly feeder: (Actor & { throwIn: number }) | null;
  private readonly centre: THREE.Vector3;
  private readonly eye = new THREE.Vector3();
  private readonly gaze = new THREE.Vector3();

  constructor(private readonly dayNight: DayNight, private readonly options: ParkLifeOptions) {
    super();
    this.name = 'ParkLife';
    this.centre = new THREE.Vector3(PLAYGROUND.x + FLAT_IN_STREET.x, 0, PLAYGROUND.z + FLAT_IN_STREET.z);
    const make = (seed: number, label: string, role: TalkRole, age?: 'child' | 'elder', speed = 1): Figure => {
      const walker = new Walker({ viewer: options.viewer, seed, look: streetLook(seed, age), speed, talk: () => options.talk(role), label, labelWithin: 5, corners: 0.6, fade: true, stopsToTalk: role !== 'jogger' });
      walker.traverse((o) => {
        o.castShadow = false;
      });
      options.place(walker, new THREE.Vector3());
      return new Figure(walker);
    };
    for (let i = 0; i < 2; i++) this.kids.push({ figure: make(1601 + i * 7, 'Child · say hi', 'playground', 'child', 1), state: 'away', clock: 3 + i * 4, piece: i, ride: null });
    this.grownUp = { figure: make(1621, 'Parent · say hello', 'parent'), state: 'away', clock: 2 };
    this.brisk = options.fewer ? null : { figure: make(1633, 'Out walking · say hello', 'jogger', undefined, 1.2), state: 'away', clock: 10 };
    this.feeder = options.fewer ? null : { figure: make(1647, 'Feeding the pigeons · say hello', 'feeder', 'elder', 0.75), state: 'away', clock: 25, throwIn: 0 };
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const fine = s.daylight > 0.3 && s.rain < 0.08 && s.snow < 0.2 && inHours(s.hours, this.options.hours);
    this.options.viewer.getWorldPosition(this.eye);
    this.playground(dt, fine && inHours(s.hours, PLAY_HOURS));
    if (this.brisk) this.briskWalk(this.brisk, dt, fine && BRISK_HOURS.some((h) => inHours(s.hours, h)));
    if (this.feeder) this.feeding(this.feeder, dt, fine && inHours(s.hours, FEEDER_HOURS));
    const all = [...this.kids, this.grownUp, this.brisk, this.feeder];
    for (const a of all) a?.figure.update(dt, this.eye, this.options.drawDistance, this.options.fade);
  }

  private gate(): THREE.Vector3 {
    return v3(this.options.gate);
  }

  private piecePoint(i: number): THREE.Vector3 {
    const p = PIECES[i % PIECES.length]!;
    return this.centre.clone().add(new THREE.Vector3(p.at[0], 0, p.at[1]));
  }

  /** The children and their parent: in together through the gate, home together. */
  private playground(dt: number, open: boolean): void {
    const parent = this.grownUp;
    parent.clock -= dt;
    if (parent.state === 'away' && open && parent.clock <= 0) {
      parent.state = 'going';
      parent.figure.show(this.gate());
      const watch = this.centre.clone().add(new THREE.Vector3(PARENT_AT[0], 0, PARENT_AT[1]));
      parent.figure.walker.walk([watch], () => {
        parent.state = 'there';
        parent.clock = within(random, [300, 600]);
        parent.figure.walker.stand(Math.atan2(this.centre.x - watch.x, this.centre.z - watch.z), random() < 0.5 ? 'crossed' : 'hips');
      });
      for (const kid of this.kids) {
        kid.state = 'going';
        kid.figure.show(this.gate().add(new THREE.Vector3(0.6 * (kid.piece + 1), 0, 0.4)));
        kid.figure.walker.setPace(RUN);
        this.toPiece(kid);
      }
    } else if (parent.state === 'there') {
      // Eyes on one of the children, now this one, now the other.
      const kid = this.kids[Math.floor((parent.clock / 7) % this.kids.length)];
      if (kid) {
        kid.figure.walker.getWorldPosition(this.gaze);
        this.gaze.y += 1;
        parent.figure.walker.setFocus(this.gaze);
      }
      if (!open || parent.clock <= 0) {
        parent.state = 'leaving';
        parent.figure.walker.say(pick(random, ['Time to go!', 'Home, you two. Now.', 'Come on, tea time!']));
        for (const k of this.kids) {
          this.getOff(k);
          k.state = 'leaving';
          k.figure.walker.setPace(1.25);
          k.figure.walker.walk([this.gate()], () => k.figure.hide());
        }
        parent.figure.walker.walk([this.gate()], () => {
          parent.figure.hide();
          parent.state = 'away';
          parent.clock = within(random, BREAK) * 3;
          for (const k of this.kids) k.state = 'away';
        });
      }
    }
    for (const kid of this.kids) {
      if (kid.ride) this.riding(kid, dt);
      if (kid.state !== 'there') continue;
      kid.clock -= dt;
      if (kid.clock <= 0) {
        this.getOff(kid);
        kid.piece = (kid.piece + 1 + Math.floor(random() * 2)) % PIECES.length;
        // Not on the other one's piece.
        if (this.kids.some((k) => k !== kid && k.piece === kid.piece)) kid.piece = (kid.piece + 1) % PIECES.length;
        kid.state = 'going';
        this.toPiece(kid);
      }
    }
  }

  /** A child runs to their piece (by the playground's middle) and plays there a while: on a swing, down the slide. */
  private toPiece(kid: Actor & { piece: number; ride: Ride | null }): void {
    const piece = PIECES[kid.piece % PIECES.length]!;
    const walker = kid.figure.walker;
    const via = this.centre.clone().add(new THREE.Vector3(0.5 * (kid.piece - 1.5), 0, 0.3));
    const swing = piece.ride === 'swing' ? this.freeSwing() : undefined;
    if (swing) {
      // In front of the seat, turned round, sat on it and off: pumping it higher.
      walker.walk([via, new THREE.Vector3(swing.rest.x, 0, swing.rest.z + 0.55)], () => {
        kid.state = 'there';
        kid.clock = within(random, AT_PIECE) * 1.5;
        kid.ride = { kind: 'swing', swing, creak: SWING_RIDE.half };
        swing.push = SWING_RIDE.push;
        walker.sit(0, SWING_RIDE.seat, 'lap');
        if (random() < 0.5) walker.say(pick(random, WATCH_ME), 1.4);
      });
      return;
    }
    if (piece.ride === 'slide') {
      // Up the ladder to the platform, then down the chute on their seat.
      walker.walk([via, this.offset(SLIDE.foot)], () => {
        kid.ride = { kind: 'climb' };
        walker.walk([this.offset(SLIDE.platform)], () => {
          kid.ride = { kind: 'slide', t: 0 };
          walker.sit(0, 0.06, 'lap');
          this.options.cues?.slide([walker.position.x, walker.position.z]);
        });
      });
      return;
    }
    const to = this.piecePoint(kid.piece);
    walker.walk([via, to], () => {
      kid.state = 'there';
      kid.clock = within(random, AT_PIECE);
      if (piece.sit !== undefined) walker.sit(piece.yaw, piece.sit, 'lap');
      else walker.stand(piece.yaw, random() < 0.5 ? 'cheer' : 'stand');
      if (random() < 0.5) walker.gesture('cheerHop');
      if (random() < 0.35) walker.say(pick(random, WATCH_ME), 1.4);
    });
  }

  /** A point off the playground's middle (zone-local, on the lawn). */
  private offset([x, z]: Vec2): THREE.Vector3 {
    return this.centre.clone().add(new THREE.Vector3(x, 0, z));
  }

  /** A swing nobody is on. */
  private freeSwing(): PlaygroundSwing | undefined {
    return this.options.swings?.find((s) => !s.player && !this.kids.some((k) => k.ride?.kind === 'swing' && k.ride.swing === s));
  }

  /**
   * A ride's frame: on the swing, carried with its seat (a creak at each end of a high swing); up the ladder, rising
   * as they near the platform; down the chute, on their seat from its top to its bottom, then up and off.
   */
  private riding(kid: Actor & { ride: Ride | null }, dt: number): void {
    const ride = kid.ride!;
    const walker = kid.figure.walker;
    if (ride.kind === 'swing') {
      const { seat, rest } = ride.swing;
      walker.position.set(seat.x, seat.y - rest.y, seat.z);
      if ((ride.creak -= dt) <= 0) {
        ride.creak += SWING_RIDE.half;
        if (Math.abs(ride.swing.angle) > SWING_RIDE.creakAbove) this.options.cues?.swing([seat.x, seat.z]);
      }
      return;
    }
    if (ride.kind === 'climb') {
      const foot = this.offset(SLIDE.foot);
      const platform = this.offset(SLIDE.platform);
      const done = 1 - Math.hypot(walker.position.x - platform.x, walker.position.z - platform.z) / Math.max(0.01, foot.distanceTo(platform));
      walker.position.y = SLIDE.top[2] * THREE.MathUtils.clamp(done, 0, 1);
      return;
    }
    ride.t += dt / SLIDE.down;
    const k = Math.min(1, ride.t);
    const [x, zTop, yTop] = SLIDE.top;
    const [, zBottom, yBottom] = SLIDE.bottom;
    const c = this.centre;
    walker.position.set(c.x + x, THREE.MathUtils.lerp(yTop, yBottom, k * k), c.z + THREE.MathUtils.lerp(zTop, zBottom, k * k));
    if (k >= 1) {
      kid.ride = null;
      walker.position.y = 0;
      walker.stand(0, 'cheer');
      walker.gesture('cheerHop');
      if (random() < 0.4) walker.say(pick(random, WATCH_ME), 1.4);
      kid.state = 'there';
      kid.clock = within(random, AT_PIECE) * 0.5;
    }
  }

  /** Off whatever they ride: the swing left to settle, back on the lawn. */
  private getOff(kid: Actor & { ride: Ride | null }): void {
    const ride = kid.ride;
    if (!ride) return;
    if (ride.kind === 'swing') ride.swing.push = 0;
    kid.ride = null;
    kid.figure.walker.position.y = 0;
  }

  /** The brisk walker: in by the gate, along the path to its turn, back, out; every so often in their hours. */
  private briskWalk(a: Actor, dt: number, out: boolean): void {
    a.clock -= dt;
    if (a.state !== 'away' || !out || a.clock > 0) return;
    a.state = 'going';
    a.figure.show(this.gate());
    // Some days the pram comes too (a slower round).
    const pram = random() < 0.35;
    a.figure.walker.hold(pram ? 'pram' : null);
    a.figure.walker.setPace(pram ? 0.75 : BRISK);
    a.figure.walker.walk([v3(this.options.walkTo), this.gate()], () => {
      a.figure.hide();
      a.state = 'away';
      a.clock = within(random, BREAK);
    });
  }

  /** The pigeons' friend: to his spot by the fence, crumbs every few seconds (the flock comes down), then home. */
  private feeding(a: Actor & { throwIn: number }, dt: number, out: boolean): void {
    const walker = a.figure.walker;
    const { at, yaw } = this.options.feeder;
    a.clock -= dt;
    if (a.state === 'away' && out && a.clock <= 0) {
      a.state = 'going';
      a.figure.show(this.gate());
      walker.walk([v3(at)], () => {
        a.state = 'there';
        a.clock = within(random, FEEDER_STAY);
        a.throwIn = 1;
        walker.stand(yaw, 'stand');
      });
    } else if (a.state === 'there') {
      if ((a.throwIn -= dt) <= 0) {
        a.throwIn = within(random, THROW_EVERY);
        walker.gesture(random() < 0.6 ? 'wipeHands' : 'insertCoin');
        this.options.feed?.([at[0] + Math.sin(yaw) * 1.4, at[1] + Math.cos(yaw) * 1.4]);
      }
      if (a.clock <= 0 || !out) {
        a.state = 'leaving';
        walker.walk([this.gate()], () => {
          a.figure.hide();
          a.state = 'away';
          a.clock = within(random, BREAK) * 2;
        });
      }
    }
  }
}

function v3([x, z]: Vec2): THREE.Vector3 {
  return new THREE.Vector3(x, 0, z);
}
