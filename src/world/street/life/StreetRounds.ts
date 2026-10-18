import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { inHours } from '@/time/clock';
import { Walker } from '../../people/Walker';
import { randomLook, type PersonLook } from '../../people/looks';
import { shopDoors, type ShopDoor } from '@/world/city/facades';
import { SHOP_HOURS } from '../shops/shopHours';
import { frontVariant } from '../shopfronts/shopfrontPlan';
import type { Vec2 } from '../streetPlan';
import { WALKABLE } from '@/world/measures/street';
import { Figure } from './Figure';
import { rainGear, streetLook } from './streetLook';
import type { TalkRole } from './streetTalk';
import { pick, random, within } from '@/random';

/** The street's rounds by the clock (`STREET_PLAN.rounds`). */
export interface RoundsSpec {
  /** The night shift's walk to work and home (along a pavement), and their hours. */
  nightShift: { path: readonly Vec2[]; hours: readonly (readonly [number, number])[] };
  /** The sweeper's slow round along our kerb at dawn. */
  sweeper: { path: readonly Vec2[]; hours: readonly [number, number] };
  /** Rémi from the PARKSIDE CAFE with the day's crusts for the pigeons, at closing: where he stands, facing. */
  crumbs: { at: Vec2; yaw: number; off: Vec2; seconds: number };
}

interface StreetRoundsOptions {
  spec: RoundsSpec;
  viewer: THREE.Object3D;
  place: (walker: Walker, at: THREE.Vector3) => void;
  talk: (role: TalkRole) => string;
  /** Calls the nearest flock to crumbs at a point (`Pigeons.feedAt`). */
  feed?: (at: Vec2) => boolean;
  /** Rémi's lines (his card's): what he says when clicked at it. */
  remi?: { name: string; lines: readonly string[]; look: PersonLook };
  /** Someone went through a door at `at` (a shop's bell). */
  onDoor?: (at: Vec2) => void;
  drawDistance: number;
  fade: number;
}

/** A shopkeeper shutting up is only sent out this close to the player (unseen, the shutter rolls down by itself). */
const CLOSER_WITHIN = 30;
/** Seconds at the shutter (pulling it down), and a look up and down the street after. */
const AT_SHUTTER = [6, 10] as const;
/** The night shift: how often one goes by in their hours (s). */
const SHIFT_EVERY = [90, 240] as const;
/** The sweeper's pace (slow, sweeping), how often a stop to sweep (s). */
const SWEEP_PACE = 0.45;
/** Rémi throws the crusts this often while there (s). */
const THROW_EVERY = [2.5, 4.5] as const;
const CRUMBS_BELOW_DAYLIGHT = 0.12;

interface Closer {
  figure: Figure;
  busy: boolean;
}

/**
 * What the street does by the clock with someone to do it: at each shop's closing hour, the shopkeeper out at the
 * door pulling the shutter down (only in the player's sight; the shutter rolls down on its own anyway), then off home
 * along the pavement; a night-shift worker going to work late in the evening and home at dawn; the street sweeper's
 * slow round along our kerb at first light, in green hi-vis; and at the PARKSIDE CAFE's closing time Rémi with the
 * day's crusts at the corner by his café, the pigeons coming down to him (his card says he does). Dressed for the
 * season, umbrellas in the rain; a click gets a word.
 */
export class StreetRounds extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly closers: Closer[] = [];
  /** The shops that shut with a shutter, where they are, and the day each was last shut up (by its own clock). */
  private readonly shops: { door: ShopDoor; close: number; shutOn: number }[];
  private readonly shift: Figure;
  private shiftClock = within(random, [10, 60]);
  private readonly sweeper: Figure;
  private sweeping = false;
  private sweptOn = -1;
  private readonly remi: Figure | null;
  /** The PARKSIDE CAFE's door, Rémi's way out. */
  private readonly cafe: ShopDoor | null;
  private remiOn = -1;
  private remiState: 'away' | 'going' | 'there' | 'leaving' = 'away';
  private remiClock = 0;
  private remiThrow = 0;
  /** A day count of the clock's own (a new one each time the hour goes round midnight). */
  private day = 0;
  private lastHours = NaN;
  private readonly eye = new THREE.Vector3();
  private readonly local = new THREE.Vector3();

  constructor(private readonly dayNight: DayNight, private readonly options: StreetRoundsOptions) {
    super();
    this.name = 'StreetRounds';
    const make = (seed: number, look: PersonLook, label: string, talk: () => string, speed = 1): Figure => {
      const walker = new Walker({ viewer: options.viewer, seed, look, speed, talk, label, labelWithin: 4, corners: 0.5, fade: true, stopsToTalk: true });
      walker.traverse((o) => {
        o.castShadow = false;
      });
      options.place(walker, new THREE.Vector3());
      return new Figure(walker);
    };
    for (let i = 0; i < 2; i++) this.closers.push({ figure: make(1901 + i * 9, streetLook(1901 + i * 9), 'Shopkeeper · say goodnight', () => options.talk('closing')), busy: false });
    this.shops = shopDoors()
      .filter((d) => Math.abs(d.at[1]) > 11.5 && frontVariant(d.facade.detail, d.shop.kind) === 'plain' && SHOP_HOURS[d.shop.kind] && SHOP_HOURS[d.shop.kind]!.close < 24)
      .map((door) => ({ door, close: SHOP_HOURS[door.shop.kind]!.close, shutOn: -1 }));
    this.shift = make(1931, workLook(1931, 0x2c4a6e, 0xd8d0b8), 'Night shift · say hello', () => options.talk('nightShift'));
    this.sweeper = make(1941, workLook(1941, 0x2f8a3a, 0xd8e84a), 'Street sweeper · say morning', () => options.talk('sweeper'), 1);
    this.cafe = shopDoors().find((d) => d.shop.name === 'PARKSIDE CAFE') ?? null;
    const remi = options.remi;
    this.remi = remi ? make(1951, remi.look, `${remi.name} · say hello`, () => pick(random, remi.lines)) : null;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    if (!Number.isNaN(this.lastHours) && s.hours < this.lastHours - 12) this.day++;
    this.lastHours = s.hours;
    this.options.viewer.getWorldPosition(this.eye);
    this.local.copy(this.eye);
    this.worldToLocal(this.local);
    this.frameDt = dt;
    this.shutUp(s.hours);
    this.nightShift(dt, s.hours);
    this.sweep(s.hours);
    this.crumbs(dt, s.hours, s.daylight, s.rain);
    const all = [...this.closers.map((c) => c.figure), this.shift, this.sweeper, this.remi];
    for (const f of all) f?.update(dt, this.eye, this.options.drawDistance, this.options.fade);
  }

  /** A shop just past its closing hour, near the player: its keeper out to pull the shutter down, then home. */
  private shutUp(hours: number): void {
    for (const shop of this.shops) {
      const close = shop.close % 24;
      if (shop.shutOn === this.day || !inHours(hours, [close, close + 0.1])) continue;
      shop.shutOn = this.day;
      const [x, z] = shop.door.at;
      if (x > WALKABLE.maxX || Math.hypot(this.local.x - x, this.local.z - z) > CLOSER_WITHIN) continue;
      const closer = this.closers.find((c) => !c.busy);
      if (!closer) continue;
      closer.busy = true;
      const out = Math.sign(z) * -0.7;
      const at = new THREE.Vector3(x, 0, z + out);
      const walker = closer.figure.walker;
      closer.figure.show(new THREE.Vector3(x, 0, z));
      this.options.onDoor?.(shop.door.at);
      walker.walk([at], () => {
        // Facing the shopfront, reaching for the shutter.
        walker.stand(Math.atan2(0, -out), 'stand');
        walker.gesture('straighten');
        let left = within(random, AT_SHUTTER);
        const tick = (dt: number): boolean => (left -= dt) <= 0;
        this.waits.push({ tick, then: () => {
          walker.gesture('lookAround');
          rainGear(walker, this.dayNight.state, null);
          const away = at.clone().add(new THREE.Vector3((random() < 0.5 ? -1 : 1) * 7, 0, 0));
          walker.walk([away], () => {
            closer.figure.hide();
            closer.busy = false;
          });
        } });
      });
    }
    // Pending waits (the shutter pulled down): ticked here, game time.
    for (let i = this.waits.length - 1; i >= 0; i--) {
      const w = this.waits[i]!;
      if (w.tick(this.frameDt)) {
        this.waits.splice(i, 1);
        w.then();
      }
    }
  }

  private readonly waits: { tick: (dt: number) => boolean; then: () => void }[] = [];
  private frameDt = 0;

  /** Someone off to the night shift late in the evening, home from it at dawn: along their pavement, now and then. */
  private nightShift(dt: number, hours: number): void {
    const { nightShift } = this.options.spec;
    if (this.shift.shown) return;
    if (!nightShift.hours.some((h) => inHours(hours, h))) return;
    if ((this.shiftClock -= dt) > 0) return;
    this.shiftClock = within(random, SHIFT_EVERY);
    const path = nightShift.path.map(v3);
    if (random() < 0.5) path.reverse();
    this.shift.show(path[0]!.clone());
    rainGear(this.shift.walker, this.dayNight.state, null);
    this.shift.walker.walk(path.slice(1), () => this.shift.hide());
  }

  /** The sweeper's round at first light, once a day: slowly along our kerb, end to end. */
  private sweep(hours: number): void {
    const { sweeper } = this.options.spec;
    if (this.sweeping || this.sweptOn === this.day || !inHours(hours, sweeper.hours)) return;
    this.sweeping = true;
    this.sweptOn = this.day;
    const path = sweeper.path.map(v3);
    this.sweeper.show(path[0]!.clone());
    this.sweeper.walker.setPace(SWEEP_PACE);
    this.sweeper.walker.walk(path.slice(1), () => {
      this.sweeper.hide();
      this.sweeping = false;
    });
  }

  /** Rémi at the café's closing: out with the crusts to the corner (by day and dry), a throw now and then, home. */
  private crumbs(dt: number, hours: number, daylight: number, rain: number): void {
    const remi = this.remi;
    if (!remi) return;
    const { crumbs } = this.options.spec;
    const cafe = this.cafe;
    const close = SHOP_HOURS.cafe?.close ?? 20;
    const walker = remi.walker;
    if (this.remiState === 'away') {
      if (this.remiOn === this.day || !cafe || !inHours(hours, [close, close + 0.2])) return;
      this.remiOn = this.day;
      if (daylight < CRUMBS_BELOW_DAYLIGHT || rain > 0.1) return;
      this.remiState = 'going';
      remi.show(v3(cafe.at));
      this.options.onDoor?.(cafe.at);
      walker.walk([v3(crumbs.at)], () => {
        this.remiState = 'there';
        this.remiClock = crumbs.seconds;
        this.remiThrow = 0.5;
        walker.stand(crumbs.yaw, 'stand');
      });
    } else if (this.remiState === 'there') {
      if ((this.remiThrow -= dt) <= 0) {
        this.remiThrow = within(random, THROW_EVERY);
        walker.gesture('wipeHands');
        this.options.feed?.([crumbs.at[0] + Math.sin(crumbs.yaw) * 1.3, crumbs.at[1] + Math.cos(crumbs.yaw) * 1.3]);
      }
      if ((this.remiClock -= dt) <= 0) {
        this.remiState = 'leaving';
        walker.walk([v3(crumbs.off)], () => {
          remi.hide();
          this.remiState = 'away';
        });
      }
    }
  }
}

/** A work look: the person's own face and build, a cap and a jacket in the work's colours. */
function workLook(seed: number, jacket: number, accent: number): PersonLook {
  const look: PersonLook = { ...randomLook(seed + 200, 'vendor'), hat: 'cap', hatColor: jacket, top: 'jacket', topColor: jacket, topAccent: accent, longSleeves: true, trousers: 0x2a2d33 };
  delete look.apron;
  return look;
}

function v3([x, z]: readonly [number, number]): THREE.Vector3 {
  return new THREE.Vector3(x, 0, z);
}
