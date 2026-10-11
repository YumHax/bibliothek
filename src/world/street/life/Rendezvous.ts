import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { inHours } from '@/time/clock';
import { Walker } from '../../people/Walker';
import type { Vec2 } from '../streetPlan';
import { Figure } from './Figure';
import { rainGear, streetLook } from './streetLook';
import type { TalkRole } from './streetTalk';
import { pick, random, within } from '@/random';

/** Where someone waits for a friend (`STREET_PLAN.rendezvous`): the spot, the way they face, and which way each comes from and both go off. */
export interface RendezvousSpec {
  at: Vec2;
  yaw: number;
  /** Where the one waiting comes from, the friend comes from, and where both walk off to (along the pavement, zone-local). */
  from: Vec2;
  friendFrom: Vec2;
  off: Vec2;
  hours: readonly [number, number];
}

interface RendezvousOptions {
  spec: RendezvousSpec;
  viewer: THREE.Object3D;
  place: (walker: Walker, at: THREE.Vector3) => void;
  talk: (role: TalkRole) => string;
  drawDistance: number;
  fade: number;
}

/** Seconds between two meetings there, how long the friend keeps them waiting, a look at the watch this often; the friend does not come this often. */
const BREAK = [60, 200] as const;
const LATE = [20, 70] as const;
const WATCH_EVERY = [6, 11] as const;
const STOOD_UP = 0.25;
const HELLO = ['There you are!', 'Sorry, sorry! The bus…', 'At last!'];
/** Gives up waiting after this long (s) if nobody came. */
const GIVE_UP = 55;

type Phase = 'away' | 'arriving' | 'waiting' | 'greeting' | 'leaving';

/**
 * Someone waiting by the pillar clock for a friend: they walk up, stand, look at the clock, at their watch, about
 * them; a while later the friend hurries up ("Sorry! The bus…"), a wave, a word, and off they go together along the
 * pavement. Now and then nobody comes: a sigh, a shrug, and they go off alone. In the spec's hours, never in the rain
 * (umbrellas up otherwise as they walk). A click gets a word from each.
 */
export class Rendezvous extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly waiter: Figure;
  private readonly friend: Figure;
  private phase: Phase = 'away';
  private clock = within(random, [10, 40]);
  private watch = 0;
  private stoodUp = false;
  /** Something to do in a moment (game seconds, ticked by `update`). */
  private after: { left: number; then: () => void } | null = null;
  private readonly eye = new THREE.Vector3();
  private readonly gaze = new THREE.Vector3();
  private readonly friendGaze = new THREE.Vector3();

  constructor(private readonly dayNight: DayNight, private readonly options: RendezvousOptions) {
    super();
    this.name = 'Rendezvous';
    const make = (seed: number, label: string, role: TalkRole): Figure => {
      const walker = new Walker({ viewer: options.viewer, seed, look: streetLook(seed), speed: 1.1, talk: () => options.talk(role), label, labelWithin: 4, corners: 0.5, fade: true, stopsToTalk: true });
      walker.traverse((o) => {
        o.castShadow = false;
      });
      options.place(walker, new THREE.Vector3());
      return new Figure(walker);
    };
    this.waiter = make(1801, 'Waiting for someone · say hello', 'waiting');
    this.friend = make(1811, 'Passer-by · say hello', 'passer');
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const { spec } = this.options;
    const due = inHours(s.hours, spec.hours) && s.rain < 0.1;
    this.clock -= dt;
    if (this.after && (this.after.left -= dt) <= 0) {
      const then = this.after.then;
      this.after = null;
      then();
    }
    const w = this.waiter.walker;
    switch (this.phase) {
      case 'away':
        if (due && this.clock <= 0) this.arrive();
        break;
      case 'waiting':
        if ((this.watch -= dt) <= 0) {
          this.watch = within(random, WATCH_EVERY);
          w.gesture(random() < 0.6 ? 'checkWatch' : 'lookAround');
        }
        // The friend turns up when they said they would (late); stood up, they give up a while after.
        if (this.clock <= 0 && !this.stoodUp) this.friendComes();
        else if (this.clock <= -GIVE_UP || (!due && this.clock <= 0)) this.giveUp();
        break;
      default:
        break;
    }
    this.options.viewer.getWorldPosition(this.eye);
    this.waiter.update(dt, this.eye, this.options.drawDistance, this.options.fade);
    this.friend.update(dt, this.eye, this.options.drawDistance, this.options.fade);
  }

  private arrive(): void {
    const { spec } = this.options;
    this.phase = 'arriving';
    this.stoodUp = random() < STOOD_UP;
    this.waiter.show(v3(spec.from));
    rainGear(this.waiter.walker, this.dayNight.state, null);
    this.waiter.walker.walk([v3(spec.at)], () => {
      this.phase = 'waiting';
      this.clock = within(random, LATE);
      this.watch = 2;
      this.waiter.walker.stand(spec.yaw, random() < 0.5 ? 'pockets' : 'crossed');
    });
  }

  /** The friend hurries up; a wave, a word between them; off together. */
  private friendComes(): void {
    const { spec } = this.options;
    this.phase = 'greeting';
    const meet = v3(spec.at).add(new THREE.Vector3(Math.sin(spec.yaw) * 0.9, 0, Math.cos(spec.yaw) * 0.9));
    this.friend.show(v3(spec.friendFrom));
    this.friend.walker.setPace(1.3);
    this.friend.walker.walk([meet], () => {
      const f = this.friend.walker;
      const w = this.waiter.walker;
      f.setPace(1);
      f.stand(Math.atan2(spec.at[0] - meet.x, spec.at[1] - meet.z), 'stand');
      w.getWorldPosition(this.gaze);
      this.gaze.y += 1.55;
      f.setFocus(this.gaze);
      f.getWorldPosition(this.friendGaze);
      this.friendGaze.y += 1.55;
      w.stand(Math.atan2(meet.x - spec.at[0], meet.z - spec.at[1]), 'stand', this.friendGaze);
      f.say(pick(random, HELLO), 1.6);
      w.gesture('wave');
      w.react('good');
      f.talkAlong(2.4);
      this.after = { left: 4.5, then: () => this.goOff(true) };
    });
  }

  /** Nobody came: a sigh, a shrug, off alone. */
  private giveUp(): void {
    this.phase = 'leaving';
    const w = this.waiter.walker;
    w.gesture('sigh');
    this.after = { left: 1.6, then: () => this.goOff(false) };
  }

  private goOff(together: boolean): void {
    const { spec } = this.options;
    this.phase = 'leaving';
    const off = v3(spec.off);
    const s = this.dayNight.state;
    rainGear(this.waiter.walker, s, null);
    this.waiter.walker.walk([off], () => {
      this.waiter.hide();
      this.friend.hide();
      this.phase = 'away';
      this.clock = within(random, BREAK);
    });
    if (together) {
      rainGear(this.friend.walker, s, null);
      this.friend.walker.walk([off.clone().add(new THREE.Vector3(0, 0, 0.45))]);
    }
  }
}

function v3([x, z]: Vec2): THREE.Vector3 {
  return new THREE.Vector3(x, 0, z);
}
