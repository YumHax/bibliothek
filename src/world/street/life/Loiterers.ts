import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { Walker } from '../../people/Walker';
import type { Season } from '@/time/season';
import { randomLook } from '../../people/looks';
import { isShopOpen } from '../shops/shopHours';
import type { ShopKind, Vec2 } from '../streetPlan';
import { Figure } from './Figure';
import type { TalkRole } from './streetTalk';
import { random, within } from '@/random';

/** A spot where a few people stand together a while (`STREET_PLAN.loiterers`). */
export interface LoiterSpec {
  kind: 'smokers' | 'chatting';
  /** Where each of them stands (they face the middle of the group). */
  at: readonly Vec2[];
  /** Game hours they are there (past 24: after midnight). */
  hours: readonly [number, number];
  /** Only while this kind of shop is open (the bar they smoke outside). */
  shop?: ShopKind;
  /** Only in dry weather. */
  dry?: boolean;
}

interface LoiterersOptions {
  spots: readonly LoiterSpec[];
  viewer: THREE.Object3D;
  place: (walker: Walker, at: THREE.Vector3) => void;
  talk: (role: TalkRole) => string;
  drawDistance: number;
  fade: number;
  season: Season['name'];
}

/** A group stays this many real seconds, then goes back in (or off); the spot stays empty this long. */
const STAY = [40, 110] as const;
const BREAK = [20, 70] as const;
/** Seconds between two looks at the clock; a word between them every few seconds. */
const CHECK_EVERY = 1;
const CHAT_EVERY = [2.5, 6] as const;
/** A stranger's caption shows only this close. */
const LABEL_WITHIN = 4;

interface Group {
  spec: LoiterSpec;
  figures: Figure[];
  centre: THREE.Vector3;
  there: boolean;
  /** Real seconds until they go, or until the next lot comes out. */
  clock: number;
  chat: number;
  /** The first look after activation: whoever is due is there already. */
  fresh: boolean;
}

/**
 * People standing about together rather than passing: smokers outside the bars of an evening (a cigarette each,
 * its tip glowing, the bar open), two neighbours catching up on the pavement by day. They fade in on the spot (out
 * of the bar's door, round the corner), talk among themselves (a word each in turn, eyes on whoever speaks), stay a
 * while and fade out again; another lot later. Clicking one gets a word of their own (`talk`).
 */
export class Loiterers extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly groups: Group[] = [];
  private readonly eye = new THREE.Vector3();
  private readonly gaze = new THREE.Vector3();
  private checkClock = CHECK_EVERY;

  constructor(private readonly dayNight: DayNight, private readonly options: LoiterersOptions) {
    super();
    this.name = 'Loiterers';
    let seed = 7100;
    for (const spec of options.spots) {
      const centre = new THREE.Vector3();
      for (const [x, z] of spec.at) centre.add(new THREE.Vector3(x, 0, z));
      centre.divideScalar(spec.at.length);
      const role: TalkRole = spec.kind === 'smokers' ? 'smoker' : 'chatting';
      const figures = spec.at.map(() => {
        const s = seed++;
        const walker = new Walker({
          viewer: options.viewer,
          seed: s,
          look: randomLook(s + 200, 'shopper', { season: options.season, age: spec.kind === 'chatting' && s % 3 === 0 ? 'elder' : 'adult' }),
          talk: () => options.talk(role),
          label: spec.kind === 'smokers' ? 'Smoking outside · say hello' : 'Chatting · say hello',
          labelWithin: LABEL_WITHIN,
          fade: true,
        });
        walker.traverse((o) => {
          o.castShadow = false;
        });
        options.place(walker, new THREE.Vector3());
        return new Figure(walker);
      });
      this.groups.push({ spec, figures, centre, there: false, clock: 0, chat: 1, fresh: true });
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setZoneActive(active: boolean): void {
    if (!active) return;
    for (const g of this.groups) g.fresh = true;
    this.checkClock = CHECK_EVERY;
  }

  update(dt: number): void {
    this.options.viewer.getWorldPosition(this.eye);
    const s = this.dayNight.state;
    this.checkClock += dt;
    const check = this.checkClock >= CHECK_EVERY;
    if (check) this.checkClock = 0;
    for (const g of this.groups) {
      g.clock -= dt;
      if (check) {
        const due = this.due(g.spec, s.hours, s.rain);
        if (!g.there && due && (g.fresh || g.clock <= 0)) this.arrive(g, g.fresh);
        else if (g.there && (!due || g.clock <= 0)) this.go(g);
        g.fresh = false;
      }
      if (g.there) this.talk(g, dt);
      for (const f of g.figures) f.update(dt, this.eye, this.options.drawDistance, this.options.fade);
    }
  }

  private due(spec: LoiterSpec, hours: number, rain: number): boolean {
    const [from, to] = spec.hours;
    const h = hours < from && hours + 24 < to ? hours + 24 : hours;
    if (h < from || h >= to) return false;
    if (spec.dry && rain > 0.05) return false;
    return !spec.shop || isShopOpen(spec.shop, hours);
  }

  private arrive(g: Group, instantly: boolean): void {
    g.there = true;
    g.clock = within(random, STAY);
    g.figures.forEach((f, i) => {
      const [x, z] = g.spec.at[i]!;
      f.show(new THREE.Vector3(x, 0, z), instantly);
      // Facing in, towards the middle of the group.
      const yaw = Math.atan2(g.centre.x - x, g.centre.z - z);
      const smoker = g.spec.kind === 'smokers';
      f.walker.stand(yaw, smoker ? (i % 2 ? 'crossed' : 'stand') : i % 2 ? 'pockets' : 'hips');
      f.walker.hold(smoker && i % 2 === 0 ? 'cigarette' : null);
    });
  }

  private go(g: Group): void {
    g.there = false;
    g.clock = within(random, BREAK);
    for (const f of g.figures) f.hide();
  }

  /** One of them says something to the others now and then; the others look at them while they do. */
  private talk(g: Group, dt: number): void {
    g.chat -= dt;
    if (g.chat > 0) return;
    g.chat = within(random, CHAT_EVERY);
    const talker = g.figures[Math.floor(random() * g.figures.length)]!;
    const seconds = 1.2 + random() * 2.2;
    talker.walker.talkAlong(seconds);
    talker.walker.getWorldPosition(this.gaze);
    this.gaze.y += 1.55;
    const at = this.gaze.clone();
    for (const f of g.figures) f.walker.setFocus(f === talker ? null : at);
  }
}

