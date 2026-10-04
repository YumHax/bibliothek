import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { sirenVoice, twoTone } from '@/audio/street/streetVoices';
import type { SpatialOut } from '@/audio/spatial';
import type { Furniture, OccupancyAware } from '../../Furniture';
import type { ActivityAware } from '../../zone/lifecycle';
import type { Vec2 } from '../streetPlan';
import { SoundGraph } from './soundGraph';
import { StreetEar, falloff } from './streetEar';
import { random } from '@/random';

/** Someone on the street who barks now and then (a counter that only goes up) where they are (zone-local). */
interface Barker {
  readonly barks: number;
  readonly position: THREE.Vector3;
}

/** A vehicle with a siren on (the ambulance, a police car, a fire engine): heard two-tone and doppler-shifted while `sirenOn`. */
export interface SirenVoice {
  readonly position: THREE.Vector3;
  readonly sirenOn: boolean;
  /** Its two tones (Hz) and how long each is held (s); the ambulance's hi-lo by default. */
  readonly tones?: readonly [number, number];
  readonly step?: number;
}

interface StreetCuesOptions {
  listener: THREE.Object3D;
  /** The crossing's lights: the beeper sounds while the green man is lit (quicker while he flashes). */
  crossing: { readonly walkersGreen: boolean; readonly walkersFlashing: boolean };
  /** Where the beeper boxes are (the signal posts, zone-local). */
  beepers: readonly Vec2[];
  barkers: readonly Barker[];
  sirens: readonly SirenVoice[];
}

const MASTER = 0.55;
/** A sound this far off is at half its level (metres), per kind. */
const HALF = { flutter: 7, bark: 14, beep: 5, rattle: 9, siren: 28, coo: 4, meow: 6 } as const;
/** The beeper's pitch and its pulse (seconds between beeps) while green, and while flashing. */
const BEEP = { hz: 2400, every: 0.9, flashing: 0.3 };
/** The near siren (hi-lo, like the window's) and the speed of sound for its doppler. */
const SIREN_TONES: [number, number] = [880, 660];
const SIREN_STEP = 0.65;
const SOUND_SPEED = 343;

/**
 * The street's one-off sounds, where they happen (synthesised, through the street's bus, so the
 * sas's door muffles them like the rest): pigeons' wings clattering as a flock takes off
 * (`flutter`) and their cooing (`coo`), a dog's bark (`barkers`, or `barkAt`), the stray cat's
 * meow and hiss (`meow`, `catHiss`), the crossing's beeper while the green man is lit, a roller
 * shutter's rattle as it rolls (`rattle`), and each passing siren (`sirens`), louder and higher
 * coming, lower going. Each is louder the nearer, to its side, duller behind the head. Only while
 * the player is in the street (`setOccupied`); let go while the zone is dormant.
 */
export class StreetCues extends THREE.Group implements Furniture, Updatable, OccupancyAware, ActivityAware {
  readonly contactShadow = false;
  private graph: SoundGraph | null = null;
  private sirens: { osc: OscillatorNode; gain: GainNode; leg: SpatialOut; distance: number }[] = [];
  private occupied = false;
  private active = true;
  private beepClock = 0;
  private readonly heard: number[];
  private readonly ear: StreetEar;
  private readonly point = new THREE.Vector3();

  constructor(private readonly options: StreetCuesOptions) {
    super();
    this.name = 'StreetCues';
    this.ear = new StreetEar(options.listener);
    this.heard = options.barkers.map((b) => b.barks);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.graph?.setLevel(occupied ? MASTER : 0, 0.3);
  }

  setZoneActive(active: boolean): void {
    this.active = active;
    if (!active) this.teardown();
  }

  dispose(): void {
    this.teardown();
  }

  /** A flock of pigeons taking off at `at`: a flurry of wing claps. */
  flutter([x, z]: Vec2): void {
    const g = this.ready();
    const heard = g && this.at(x, 0.3, z, HALF.flutter, 2);
    if (!g || !heard) return;
    const band = g.filter('bandpass', 1400, 0.9);
    band.connect(heard.out);
    const t = g.now + 0.02;
    // Wing claps: a dozen short noise bursts, quick at first, thinning out as the flock climbs away.
    for (let i = 0, when = 0; i < 14; i++, when += 0.035 + i * 0.012 + random() * 0.03) {
      g.burst(band, t + when, 0.05, 0.22 * heard.level * (1 - i / 16));
    }
  }

  /** A pigeon cooing at `at`: the soft, throaty "croo-croo-crooo", two or three phrases. */
  coo([x, z]: Vec2): void {
    const g = this.ready();
    const heard = g && this.at(x, 0.2, z, HALF.coo, 3);
    if (!g || !heard) return;
    const t = g.now + 0.02;
    const base = 260 + random() * 60;
    const notes = [0.28, 0.22, 0.6];
    let when = t;
    for (const [i, length] of notes.entries()) {
      const osc = g.ctx.createOscillator();
      osc.frequency.setValueAtTime(base * (i === 2 ? 1.08 : 1), when);
      osc.frequency.linearRampToValueAtTime(base * (i === 2 ? 0.88 : 0.95), when + length);
      // The throat's flutter.
      const flutter = g.ctx.createOscillator();
      flutter.frequency.value = 28;
      const depth = g.gain(18);
      flutter.connect(depth).connect(osc.frequency);
      const env = g.gain();
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(0.09 * heard.level, when + length * 0.3);
      env.gain.linearRampToValueAtTime(0, when + length);
      osc.connect(env).connect(heard.out);
      for (const node of [osc, flutter]) {
        node.start(when);
        node.stop(when + length + 0.02);
      }
      when += length + 0.08;
    }
  }

  /** The stray cat's meow at `at`: a rising then falling nasal vowel. */
  meow([x, z]: Vec2): void {
    const g = this.ready();
    const heard = g && this.at(x, 0.3, z, HALF.meow, 2);
    if (!g || !heard) return;
    const t = g.now + 0.02;
    const length = 0.5 + random() * 0.3;
    const pitch = 520 + random() * 180;
    const osc = g.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitch * 0.8, t);
    osc.frequency.linearRampToValueAtTime(pitch * 1.25, t + length * 0.4);
    osc.frequency.linearRampToValueAtTime(pitch * 0.75, t + length);
    // The mouth opening and closing: a formant sweeping up through "eee-ow".
    const mouth = g.filter('bandpass', 900, 3);
    mouth.frequency.setValueAtTime(800, t);
    mouth.frequency.linearRampToValueAtTime(1600, t + length * 0.4);
    mouth.frequency.linearRampToValueAtTime(700, t + length);
    const env = g.gain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.14 * heard.level, t + 0.06);
    env.gain.setValueAtTime(0.14 * heard.level, t + length * 0.7);
    env.gain.linearRampToValueAtTime(0, t + length);
    osc.connect(mouth).connect(env).connect(heard.out);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  /** The stray cat hissing at `at` (cornered, or at the dog). */
  catHiss([x, z]: Vec2): void {
    const g = this.ready();
    const heard = g && this.at(x, 0.3, z, HALF.meow, 2);
    if (!g || !heard) return;
    const hiss = g.filter('highpass', 3500, 0.7);
    hiss.connect(heard.out);
    g.shaped(hiss, g.now + 0.02, [[0.04, 0.2 * heard.level], [0.6, 0.12 * heard.level], [0.8, 0]]);
  }

  /** A dog's bark at `at` (zone-local), for someone who tells it to bark now rather than through `barkers`. */
  barkAt([x, z]: Vec2): void {
    const g = this.ready();
    if (g) this.bark(g, this.point.set(x, 0.5, z));
  }

  /** A roller shutter rolling at `at`: a ratcheting rattle for the few seconds it takes. */
  rattle([x, z]: Vec2): void {
    const g = this.ready();
    const heard = g && this.at(x, 2, z, HALF.rattle, 5);
    if (!g || !heard) return;
    const band = g.filter('bandpass', 700, 1.4);
    band.connect(heard.out);
    const t = g.now + 0.02;
    // The slats clacking over the drum, 22 a second, a little uneven.
    for (let when = 0; when < 3.6; when += 0.045 + random() * 0.012) g.burst(band, t + when, 0.02, 0.1 * heard.level);
  }

  update(dt: number): void {
    if (!this.active) return;
    const g = this.graph ?? this.build();
    if (!g) return;
    this.ear.update();
    const { barkers, crossing } = this.options;
    for (let i = 0; i < barkers.length; i++) {
      const b = barkers[i]!;
      if (b.barks !== this.heard[i] && this.occupied) this.bark(g, this.point.copy(b.position));
      this.heard[i] = b.barks;
    }
    // The beeper: from whichever post is nearer.
    if (crossing.walkersGreen || crossing.walkersFlashing) {
      this.beepClock -= dt;
      if (this.beepClock <= 0) {
        this.beepClock = crossing.walkersFlashing ? BEEP.flashing : BEEP.every;
        if (this.occupied) this.beep(g);
      }
    } else this.beepClock = 0;
    this.updateSiren(g.now, dt);
  }

  /** Each siren on: its two tones, shifted by its approach, from where it is. */
  private updateSiren(now: number, dt: number): void {
    for (const [i, siren] of this.sirens.entries()) {
      const on = this.options.sirens[i];
      if (!on?.sirenOn) {
        siren.distance = -1;
        siren.gain.gain.setTargetAtTime(0, now, 0.4);
        continue;
      }
      this.localToWorld(this.point.copy(on.position));
      const d = this.ear.distance(this.point);
      const closing = siren.distance < 0 || dt <= 0 ? 0 : (d - siren.distance) / dt;
      siren.distance = d;
      const doppler = SOUND_SPEED / (SOUND_SPEED + THREE.MathUtils.clamp(closing, -40, 40));
      siren.osc.frequency.setTargetAtTime(twoTone(on.tones ?? SIREN_TONES, on.step ?? SIREN_STEP, now) * doppler, now, 0.015);
      siren.gain.gain.setTargetAtTime(0.16 * falloff(d, HALF.siren), now, 0.15);
      const side = this.ear.spatial(this.point);
      siren.leg.set(side.pan, 0, false, side.rear ?? 0);
    }
  }

  /** A dog's bark or two at `position` (zone-local; overwritten): a gruff voiced yelp falling in pitch. */
  private bark(g: SoundGraph, position: THREE.Vector3): void {
    const heard = this.at(position.x, 0.5, position.z, HALF.bark, 2);
    if (!heard) return;
    const t = g.now + 0.02;
    const times = random() < 0.5 ? 1 : 2;
    const pitch = 330 + random() * 180;
    for (let i = 0; i < times; i++) {
      const at = t + i * 0.28;
      const osc = g.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(pitch * 1.25, at);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.7, at + 0.13);
      const formant = g.filter('bandpass', 900, 1.6);
      const gain = g.gain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.28 * heard.level, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
      osc.connect(formant).connect(gain).connect(heard.out);
      osc.start(at);
      osc.stop(at + 0.18);
      // The breathy edge of it.
      g.burst(formant, at, 0.08, 0.12 * heard.level);
    }
  }

  /** One pip of the crossing's beeper, from the nearer post. */
  private beep(g: SoundGraph): void {
    let best: { x: number; z: number; d: number } | null = null;
    for (const [x, z] of this.options.beepers) {
      this.localToWorld(this.point.set(x, 1.2, z));
      const d = this.ear.distance(this.point);
      if (!best || d < best.d) best = { x, z, d };
    }
    const heard = best && this.at(best.x, 1.2, best.z, HALF.beep, 0.5);
    if (!heard) return;
    const t = g.now + 0.01;
    const osc = g.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = BEEP.hz;
    const gain = g.gain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05 * heard.level, t + 0.004);
    gain.gain.setValueAtTime(0.05 * heard.level, t + 0.05);
    gain.gain.linearRampToValueAtTime(0, t + 0.06);
    osc.connect(gain).connect(heard.out);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  /** How loud (0..1) a sound at zone-local (x, y, z) is, half as loud at `halfAt` metres, and an input placed there for `seconds`; null if inaudible. */
  private at(x: number, y: number, z: number, halfAt: number, seconds: number): { level: number; out: AudioNode } | null {
    const g = this.graph;
    if (!g) return null;
    this.ear.update();
    this.localToWorld(this.point.set(x, y, z));
    const level = falloff(this.ear.distance(this.point), halfAt);
    if (level < 0.01) return null;
    return { level, out: g.shot(this.ear.spatial(this.point), seconds) };
  }

  /** The graph once started and this in the street, else null (nothing to hear). */
  private ready(): SoundGraph | null {
    if (!this.occupied || !this.active) return null;
    return this.graph ?? this.build();
  }

  private teardown(): void {
    this.graph?.stop();
    this.graph = null;
    this.sirens = [];
  }

  private build(): SoundGraph | null {
    const g = SoundGraph.create(this.occupied ? MASTER : 0);
    if (!g) return null;
    this.graph = g;
    this.sirens = this.options.sirens.map(() => {
      const leg = g.leg();
      const { osc, gain } = sirenVoice(g.ctx, leg.input, 2600);
      g.keep(osc);
      return { osc, gain, leg, distance: -1 };
    });
    return g;
  }
}
