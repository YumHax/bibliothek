import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { RIVAL_COLLECTOR, rivalAtMarket, rivalOnFrontStreet, type RivalCollector } from '@/economy/rivalCollector';
import { isMet } from '@/social/standing';
import type { SocialServices } from '@/social/talk';
import { inHours } from '@/time/clock';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { bodyOf, talkHook } from '../../people/socialHook';
import { victorHook } from '../../people/victorTalk';
import { Walker } from '../../people/Walker';
import { isShopOpen } from '../shops/shopHours';
import type { Vec2 } from '../streetPlan';
import { TOWNSFOLK_PLAN, type Round } from './townsfolkPlan';

interface TownRoundsOptions {
  viewer: THREE.Object3D;
  /** The game day: Victor walks to the market on his days there (and his suitcase days). */
  day: () => number;
  social?: SocialServices;
  rival?: RivalCollector;
  /** Joins a walker to the zone (ticked, clickable, in the people budget). */
  place: (walker: Walker, at: THREE.Vector3) => void;
}

/** Seconds to fade in out of a door or out of sight, and back. */
const FADE_S = 0.7;
/** Lou's seed (her card's `look.seed` less the 200 a `Walker` adds). */
const LOU_SEED = 5;
const LOU_LINES = ['Five minutes. Don’t tell Rémi I take five minutes.', 'Fresh air. Well. Front Street air.', 'If anyone asks, I’m counting the cups.'];

/** A walker on a round: where they are in it, and their fade. */
interface OnRound {
  walker: Walker;
  /** Which round they are on (null: in, out of sight), and the game day it was started. */
  round: Round | null;
  /** The last round set off on and its game day (each walked once a day, however long its hours last). */
  last: Round | null;
  started: number;
  fade: number;
  /** Going through the door at the end: fading out. */
  leaving: boolean;
}

/**
 * Front Street's known people going about their day (docs/social.md "Front Street and the arcade"): Victor Crane's
 * espresso at nine at the SUNNY SIDE CAFE and his walk on to the flea market by RETRO GAMES' door on his market and
 * suitcase days (`townsfolkPlan`: Lou's "nine sharp, then the market"), and Lou out by the café's door on her break.
 * Each fades in where the round begins (joined late, that far along it) and out through the door at its end. Both
 * are clickable: Victor's conversation is the rivalry's (`victorHook`), Lou's the barista's own in the street.
 */
export class TownRounds extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly victor: OnRound;
  private readonly lou: Walker;
  private louOut = false;
  private louFade = 0;

  constructor(private readonly dayNight: DayNight, private readonly options: TownRoundsOptions) {
    super();
    this.name = 'TownRounds';
    const { viewer, social, rival } = options;
    const victor = new Walker({ viewer, seed: RIVAL_COLLECTOR.seed, label: `${RIVAL_COLLECTOR.label} · chat`, speaker: RIVAL_COLLECTOR.short, lines: ['Can’t stop. Espresso, then the market. In that order, always.'], fade: true, stopsToTalk: true, ...(rival ? { social: victorHook(social, rival, 'street', () => this.victor.walker) } : {}) });
    this.victor = { walker: victor, round: null, last: null, started: -1, fade: 0, leaving: false };
    this.lou = new Walker({ viewer, seed: LOU_SEED, label: 'Barista · on a break', speaker: () => (isMet('lou') ? 'Lou' : undefined), lines: LOU_LINES, fade: true, social: talkHook(social, 'lou', () => ({ person: 'lou', place: 'street', body: bodyOf(this.lou) })) });
    for (const w of [victor, this.lou]) {
      w.traverse((o) => {
        o.castShadow = false;
      });
      options.place(w, new THREE.Vector3());
      w.setPresent(false);
      w.setFade(0);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const hours = this.dayNight.state.hours;
    this.updateVictor(hours, dt);
    this.updateLou(hours, dt);
  }

  /** On his days at the market: the café at nine, then the market. Out of a round, he is in (not drawn). */
  private updateVictor(hours: number, dt: number): void {
    const v = this.victor;
    const day = this.options.day();
    const plan = TOWNSFOLK_PLAN.victor;
    const hisDay = rivalAtMarket(day) || rivalOnFrontStreet(day);
    const due = !hisDay ? null : inHours(hours, plan.toCafe.hours) ? plan.toCafe : inHours(hours, plan.toMarket.hours) ? plan.toMarket : null;
    if (due && (v.last !== due || v.started !== day)) this.startRound(v, due, hours, day);
    // The zone ticks the walkers themselves (`place`): only their rounds and fades are kept here.
    if (v.round) {
      // Through the door at the end (the walk is longer than its hours on the game's clock: it is finished all the same).
      if (!v.leaving && !v.walker.isWalking) v.leaving = true;
      v.fade = Math.max(0, Math.min(1, v.fade + (v.leaving ? -dt : dt) / FADE_S));
      v.walker.setFade(v.fade);
      if (v.leaving && v.fade <= 0) {
        v.round = null;
        v.walker.setPresent(false);
      }
    }
  }

  /** Sets `v` off on `round`, that far along it as the hour says (joined late). */
  private startRound(v: OnRound, round: Round, hours: number, day: number): void {
    const [from, to] = round.hours;
    const share = Math.min(0.9, Math.max(0, (hours - from) / (to - from)));
    const points = alongFrom(round.path, share);
    const first = points[0]!;
    v.round = round;
    v.last = round;
    v.started = day;
    v.leaving = false;
    v.fade = 0;
    v.walker.setPresent(true, new THREE.Vector3(first[0], 0, first[1]));
    v.walker.walk(points.slice(1).map(([x, z]) => new THREE.Vector3(x, 0, z)));
  }

  /** Lou by the café's door in her breaks, while the café is open. */
  private updateLou(hours: number, dt: number): void {
    const plan = TOWNSFOLK_PLAN.lou;
    const out = isShopOpen('cafe', hours) && plan.breaks.some((b) => inHours(hours, b));
    if (out && !this.louOut) {
      this.louOut = true;
      this.lou.setPresent(true, new THREE.Vector3(plan.at[0], 0, plan.at[1]));
      this.lou.stand(plan.yaw, 'pockets');
    }
    if (!this.louOut) return;
    this.louFade = Math.max(0, Math.min(1, this.louFade + (out ? dt : -dt) / FADE_S));
    this.lou.setFade(this.louFade);
    if (!out && this.louFade <= 0) {
      this.louOut = false;
      this.lou.setPresent(false);
    }
  }
}

/** The rest of `path` from `share` (0..1) of its length on: the point there, then the points after it. */
function alongFrom(path: readonly Vec2[], share: number): Vec2[] {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  let left = total * share;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const leg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= leg) {
      const t = leg > 0 ? left / leg : 0;
      return [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ...path.slice(i)];
    }
    left -= leg;
  }
  return [path[path.length - 1]!];
}
