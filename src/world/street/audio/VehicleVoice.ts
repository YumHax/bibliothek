import * as THREE from 'three';
import { horn } from '@/audio/street/streetVoices';
import type { SpatialOut } from '@/audio/spatial';
import type { CarVoice } from '../StreetCars';
import { falloff, type StreetEar } from './streetEar';
import type { SoundGraph, SoundPart } from './soundGraph';
import { airBrakes, bikeBell, binClatter, brakeSqueal, brakesOff, carDoor, crate, doorPsst, freewheelTick, reverseBeep, splash, tyreScreech, vanDoor } from './vehicleCues';
import { random } from '@/random';
import { damp } from '@/math/damp';

/** Which scripted vehicle a voice is, when it is one (the bus's brakes and doors, the van's crates, the lorry's bins). */
export type VehicleRole = 'bus' | 'van' | 'lorry';

/** How an engine sounds: its wave, idle pitch (Hz), how far it revs over a gear, the low-pass that is its body, its level. */
interface Character {
  wave: OscillatorType;
  idle: number;
  rev: number;
  body: number;
  level: number;
  /** A second voice an interval above (the engine's other cylinder bank, a diesel's clatter), relative level. */
  second: number;
  ratio: number;
  /** Gear changes at these speeds (m/s); none for a scooter's automatic or a bike. */
  gears: readonly number[];
  /** How far it carries (m at half level), and its tyres' level. */
  reach: number;
  tyres: number;
  /** How present it is close by (the heavy ones fill the street). */
  presence: number;
}

const CHARACTERS: Record<string, Character> = {
  hatch: { wave: 'sawtooth', idle: 40, rev: 1.5, body: 300, level: 0.12, second: 0.25, ratio: 2.01, gears: [3.2, 6.4, 9.5], reach: 8, tyres: 1, presence: 0.25 },
  saloon: { wave: 'sawtooth', idle: 33, rev: 1.3, body: 220, level: 0.1, second: 0.4, ratio: 1.5, gears: [3.6, 7.2, 11], reach: 8, tyres: 1, presence: 0.25 },
  diesel: { wave: 'square', idle: 29, rev: 1.2, body: 260, level: 0.13, second: 0.5, ratio: 4.02, gears: [3, 6, 9.5], reach: 8.5, tyres: 1.1, presence: 0.27 },
  heavy: { wave: 'sawtooth', idle: 24, rev: 1.1, body: 380, level: 0.3, second: 0.45, ratio: 3.01, gears: [2.5, 5, 8], reach: 10.5, tyres: 1.4, presence: 0.55 },
  scooter: { wave: 'square', idle: 95, rev: 1.6, body: 1400, level: 0.06, second: 0.3, ratio: 2, gears: [], reach: 9, tyres: 0.5, presence: 0.22 },
  motorbike: { wave: 'sawtooth', idle: 48, rev: 1.9, body: 700, level: 0.16, second: 0.35, ratio: 1.5, gears: [4, 8, 12], reach: 12, tyres: 0.6, presence: 0.35 },
  bike: { wave: 'sine', idle: 1, rev: 0, body: 100, level: 0, second: 0, ratio: 1, gears: [], reach: 5, tyres: 0.35, presence: 0.12 },
};

const SOUND_SPEED = 343;
/** Below this (m/s) a vehicle is standing. */
const STANDING = 0.05;
/** A voice nobody drives for this long (s) lets its sources go; they are made again when a car is lent it. */
const IDLE_RELEASE = 1.2;
/** Slowing harder than this (m/s²) from above `SQUEAL_FROM` m/s may squeal the brakes; harder than `SKID_AT`, the tyres skid. */
const BRAKING = { squealAt: 3.2, squealFrom: 3, skidAt: 7, squealChance: 0.3, heavySquealChance: 0.75 };
/** A reversing lorry's, bus's or van's beeper: one pip a second. */
const BEEP_EVERY = 1;

/** What a voice keeps sounding while a car is lent it: its sources, made on demand (`SoundPart`). */
interface Nodes {
  part: SoundPart;
  leg: SpatialOut;
  level: GainNode;
  tyres: BiquadFilterNode;
  tyreGain: GainNode;
  splashGain: GainNode;
  /** The engine, none for a bike. */
  engine: { osc: OscillatorNode; second: OscillatorNode; secondGain: GainNode; body: BiquadFilterNode; gain: GainNode } | null;
  /** The gearbox's whine in reverse. */
  reverse: { osc: OscillatorNode; gain: GainNode } | null;
  /** The lorry's compactor. */
  whine: { osc: OscillatorNode; gain: GainNode } | null;
}

/**
 * One road user's sound where it is (its sources made only while a car is lent it, `SoundPart`): its tyres on the road (hissier wet, with a swish through
 * the puddles), its engine by what it is (a hatch's buzz, a saloon's hum, a diesel van's or taxi's
 * clatter, the bus's and lorry's deep diesel, a scooter's two-stroke, a motorbike's growl; a bike
 * has none, its freewheel ticking while it coasts and its bell rung when it has to brake), the
 * engine revving up each gear and dropping at the change, all shifted by its approach (Doppler),
 * louder near, to its side and duller behind. Its horn when the driver loses patience (`honks`).
 * The scripted vehicles' moments: the bus's air brakes, doors and release, the van's back doors
 * and crates, the bin lorry's compactor and bins. What `CarVoice` tells of the driving: brakes squealing now and then
 * as it pulls up hard (a skid on a sudden stop), the gearbox whining in reverse (and the beeper of the heavy ones and
 * vans), a door shut as someone gets in or out (`doorSlams`).
 */
export class VehicleVoice {
  private nodes: Nodes | null = null;
  private idleFor = 0;
  private character: Character;
  private kindKey = '';
  private honks: number;
  private doors: number;
  private distance = -1;
  private closing = 0;
  private lastSpeed = 0;
  private standingFor = 0;
  private movingFor = 0;
  private doorsOpen = false;
  private nextCrate = 0;
  private nextBin = 0;
  private nextSplash = 2;
  private coastClock = 1;
  private coasting = false;
  private tickClock = 0;
  private bellCooldown = 5;
  private wasAtStop = false;
  private wasBraking = false;
  private beepClock = 0;
  private readonly world = new THREE.Vector3();

  constructor(
    private readonly g: SoundGraph,
    private readonly voice: CarVoice,
    private readonly role: VehicleRole | null,
    /** 0..1, this voice's own draw (a little difference in pitch between two cars of a kind). */
    private readonly tint: number,
  ) {
    this.character = CHARACTERS.hatch!;
    this.honks = voice.honks;
    this.doors = voice.doorSlams ?? 0;
  }

  /** The sources for what is driving now: tyres and spray for all, an engine unless it is a bike, a gearbox, the lorry's compactor. */
  private build(): Nodes {
    const part = this.g.part();
    const leg = part.leg();
    const level = part.gain();
    level.connect(leg.input);
    const tyres = part.filter('bandpass', 800, 0.6);
    const tyreGain = part.gain(1);
    part.loop().connect(tyres).connect(tyreGain).connect(level);
    const splashGain = part.gain();
    part.loop().connect(part.filter('highpass', 2400, 0.7)).connect(splashGain).connect(level);
    const c = this.character;
    let engine: Nodes['engine'] = null;
    let reverse: Nodes['reverse'] = null;
    if (this.kindKey !== 'bike') {
      const body = part.filter('lowpass', c.body, 0.8);
      const gain = part.gain();
      const osc = part.oscillator(c.wave, c.idle);
      osc.connect(body);
      const second = part.oscillator('triangle', c.idle * c.ratio);
      const secondGain = part.gain(c.second);
      second.connect(secondGain).connect(body);
      body.connect(gain).connect(level);
      engine = { osc, second, secondGain, body, gain };
      const rev = part.oscillator('sine', 700);
      const revGain = part.gain();
      rev.connect(part.filter('bandpass', 900, 3)).connect(revGain).connect(level);
      reverse = { osc: rev, gain: revGain };
    }
    let whine: Nodes['whine'] = null;
    if (this.role === 'lorry') {
      const osc = part.oscillator('sawtooth', 170);
      const gain = part.gain();
      osc.connect(part.filter('bandpass', 900, 2)).connect(gain).connect(level);
      whine = { osc, gain };
    }
    return { part, leg, level, tyres, tyreGain, splashGain, engine, reverse, whine };
  }

  private release(): void {
    this.nodes?.part.release();
    this.nodes = null;
  }

  update(dt: number, ear: StreetEar, toWorld: (local: THREE.Vector3) => THREE.Vector3, sky: { wetness: number }, occupied: boolean, busAtStop: boolean): void {
    const g = this.g;
    const now = g.now;
    const voice = this.voice;
    if (!voice.active) {
      this.distance = -1;
      this.standingFor = 0;
      this.honks = voice.honks;
      this.doors = voice.doorSlams ?? 0;
      this.wasBraking = false;
      if (this.nodes) {
        this.nodes.level.gain.setTargetAtTime(0, now, 0.15);
        this.setWhine(false, now);
        this.idleFor += dt;
        if (this.idleFor > IDLE_RELEASE) this.release();
      }
      return;
    }
    this.idleFor = 0;
    // A bike has no engine: a slot changing between a bike and a motor vehicle is made again.
    if (this.recharacter() && this.nodes && (this.nodes.engine === null) !== (this.kindKey === 'bike')) this.release();
    const n = (this.nodes ??= this.build());
    const c = this.character;
    toWorld(this.world.copy(voice.position));
    const d = Math.max(0.5, ear.distance(this.world));
    // The approach, smoothed over a few frames: what shifts the pitch.
    const rate = this.distance < 0 || dt <= 0 ? 0 : (d - this.distance) / dt;
    this.closing = damp(this.closing, THREE.MathUtils.clamp(rate, -30, 30), 6, dt);
    this.distance = d;
    const doppler = SOUND_SPEED / (SOUND_SPEED + this.closing);
    const speed = voice.speed;
    const near = falloff(d, c.reach);
    n.level.gain.setTargetAtTime(c.presence * (1 + speed / 9) * near * 0.5, now, 0.12);
    const side = ear.spatial(this.world);
    n.leg.set(side.pan, side.walls, false, side.rear ?? 0);
    const reversing = voice.reversing === true && speed > STANDING;

    // The engine: up each gear and down at the change; idling when it stands; held in first, whining, in reverse.
    if (n.engine) {
      const gear = reversing ? 0.2 + Math.min(0.6, speed / 3) : gearFraction(speed, c.gears);
      const pitch = c.idle * (1 + 0.06 * (this.tint - 0.5)) * (1 + c.rev * gear) * doppler;
      n.engine.osc.frequency.setTargetAtTime(pitch, now, 0.12);
      n.engine.second.frequency.setTargetAtTime(pitch * c.ratio, now, 0.12);
      n.engine.gain.gain.setTargetAtTime(c.level * (speed < STANDING ? 0.7 : 1), now, 0.2);
    }
    if (n.reverse) {
      n.reverse.gain.gain.setTargetAtTime(reversing ? 0.05 : 0, now, 0.15);
      if (reversing) n.reverse.osc.frequency.setTargetAtTime((520 + speed * 380) * doppler, now, 0.1);
    }
    // The tyres: hissier and higher wet, a swish of spray at speed.
    const wet = sky.wetness;
    n.tyres.frequency.setTargetAtTime((700 + wet * 1600 + speed * 40) * doppler, now, 0.3);
    n.tyreGain.gain.setTargetAtTime(c.tyres * Math.min(1, 0.2 + speed / 6), now, 0.2);
    n.splashGain.gain.setTargetAtTime(0.6 * wet * Math.min(1, speed / 7) * c.tyres, now, 0.3);

    const out = (seconds: number): AudioNode => this.g.shot(ear.spatial(this.world), seconds);
    const heard = near * (1 + speed / 9);
    // The horn (a bike's is its bell).
    if (voice.honks > this.honks && occupied) {
      if (this.kindKey === 'bike') bikeBell(g, out(1.5), Math.min(1, heard * 2));
      else this.horn(out(2), heard);
    }
    this.honks = voice.honks;
    // Its doors: someone getting in or out (a taxi's fare, a driver back at a parked car).
    const doors = voice.doorSlams ?? 0;
    if (doors > this.doors && occupied && d < 30) carDoor(g, out(1.2), Math.min(1, falloff(d, 6) * 1.5), this.kindKey === 'diesel' && voice.model === 'van');
    this.doors = doors;
    if (!occupied) {
      this.lastSpeed = speed;
      this.wasBraking = voice.braking === true;
      return;
    }

    this.braking(dt, speed, d, wet, out, heard);
    // Backing up: the heavy ones and the vans beep.
    if (reversing && (this.role !== null || voice.kind === 'van' || voice.model === 'van')) {
      this.beepClock -= dt;
      if (this.beepClock <= 0) {
        this.beepClock = BEEP_EVERY;
        if (d < 45) reverseBeep(g, out(0.6), heard);
      }
    } else this.beepClock = 0;

    // Standing and setting off.
    const standing = speed < STANDING;
    if (standing) {
      if (this.standingFor === 0 && this.movingFor > 1 && this.lastSpeed >= STANDING) this.arrived(out, heard);
      this.standingFor += dt;
      this.movingFor = 0;
      this.whileStanding(dt, out, heard);
    } else {
      if (this.standingFor > 0.8) this.setOff(out, heard);
      this.standingFor = 0;
      this.movingFor += dt;
      this.setWhine(false, now);
    }
    // The bus's doors at the stop.
    if (this.role === 'bus' && busAtStop !== this.wasAtStop) {
      this.wasAtStop = busAtStop;
      if (d < 40) doorPsst(g, out(1.5), heard);
    }
    // A puddle now and then on a wet road.
    if (wet > 0.45 && speed > 3 && d < 16) {
      this.nextSplash -= dt;
      if (this.nextSplash <= 0) {
        this.nextSplash = 1.5 + random() * 3;
        splash(g, out(1.2), heard * wet);
      }
    }
    if (this.kindKey === 'bike') this.bike(dt, speed, d, out, heard);
    this.lastSpeed = speed;
  }

  /** Pulling up: now and then the brakes squeal (the heavy ones more often); a sudden stop from speed skids the tyres. */
  private braking(dt: number, speed: number, d: number, wet: number, out: (seconds: number) => AudioNode, heard: number): void {
    const braking = this.voice.braking === true;
    const decel = dt > 0 ? (this.lastSpeed - speed) / dt : 0;
    if (braking && !this.wasBraking && this.kindKey !== 'bike' && d < 40) {
      if (decel > BRAKING.skidAt && this.lastSpeed > 5) tyreScreech(this.g, out(1.2), Math.min(1, heard * 1.5), wet);
      else if (decel > BRAKING.squealAt && this.lastSpeed > BRAKING.squealFrom) {
        const heavy = this.kindKey === 'heavy';
        if (random() < (heavy ? BRAKING.heavySquealChance : BRAKING.squealChance) * (1 - 0.6 * wet)) brakeSqueal(this.g, out(1.2), heard, heavy);
      }
    }
    this.wasBraking = braking;
  }

  /** Its character from what it is (it can change: a car slot is a new car each time round); true when it changed. */
  private recharacter(): boolean {
    const kind: string = this.voice.kind;
    const model = this.voice.model;
    let key: string;
    if (kind === 'bus' || kind === 'lorry' || kind === 'fire') key = 'heavy';
    // Traffic's kinds (`StreetCars.VehicleKind`): a courier rides a scooter with a box, 'moto' is a motorbike.
    else if (kind === 'bike' || kind === 'scooter') key = kind;
    else if (kind === 'courier') key = 'scooter';
    else if (kind === 'moto' || kind === 'motorbike') key = 'motorbike';
    else if (kind === 'police') key = 'saloon';
    else if (kind === 'van' || kind === 'ambulance' || model === 'van' || this.voice.taxi) key = 'diesel';
    else key = model === 'saloon' ? 'saloon' : 'hatch';
    if (key === this.kindKey) return false;
    this.kindKey = key;
    this.character = CHARACTERS[key] ?? CHARACTERS.hatch!;
    const engine = this.nodes?.engine;
    if (engine) {
      const now = this.g.now;
      engine.osc.type = this.character.wave;
      engine.body.frequency.setTargetAtTime(this.character.body, now, 0.05);
      engine.secondGain.gain.setTargetAtTime(this.character.second, now, 0.05);
    }
    return true;
  }

  /** Just pulled up. */
  private arrived(out: (seconds: number) => AudioNode, heard: number): void {
    if (this.role === 'bus') airBrakes(this.g, out(2.5), heard);
    else if (this.role === 'lorry') brakesOff(this.g, out(1), heard * 0.8);
    this.doorsOpen = false;
    this.nextCrate = 2.5 + random() * 2;
    this.nextBin = 2.5 + random();
  }

  /** The van unloading, the lorry emptying bins. */
  private whileStanding(dt: number, out: (seconds: number) => AudioNode, heard: number): void {
    if (this.role === 'van') {
      if (!this.doorsOpen && this.standingFor > 1.6) {
        this.doorsOpen = true;
        vanDoor(this.g, out(1.5), heard);
      }
      if (this.standingFor > 3) {
        this.nextCrate -= dt;
        if (this.nextCrate <= 0) {
          this.nextCrate = 2 + random() * 4;
          crate(this.g, out(1), heard);
        }
      }
    } else if (this.role === 'lorry' && this.standingFor > 2.5) {
      this.setWhine(true, this.g.now, heard);
      this.nextBin -= dt;
      if (this.nextBin <= 0) {
        this.nextBin = 0.6 + random() * 1.8;
        binClatter(this.g, out(1), heard);
      }
    }
  }

  /** Setting off again. */
  private setOff(out: (seconds: number) => AudioNode, heard: number): void {
    if (this.role === 'bus' || this.role === 'lorry') brakesOff(this.g, out(1), heard);
    if (this.role === 'van' && this.doorsOpen) vanDoor(this.g, out(1.5), heard);
    this.doorsOpen = false;
  }

  private setWhine(on: boolean, now: number, heard = 0): void {
    const whine = this.nodes?.whine;
    if (!whine) return;
    whine.gain.gain.setTargetAtTime(on ? 0.1 * heard : 0, now, 0.5);
    if (on) whine.osc.frequency.setTargetAtTime(170 + 70 * (0.5 + 0.5 * Math.sin(now * 0.8)), now, 0.3);
  }

  /** A bike: its freewheel ticking while it coasts, its bell when it has to brake near someone, now and then for nothing. */
  private bike(dt: number, speed: number, d: number, out: (seconds: number) => AudioNode, heard: number): void {
    this.coastClock -= dt;
    if (this.coastClock <= 0) {
      this.coasting = !this.coasting;
      this.coastClock = this.coasting ? 1.5 + random() * 2.5 : 2 + random() * 4;
    }
    if (this.coasting && speed > 1 && d < 12) {
      this.tickClock -= dt;
      if (this.tickClock <= 0) {
        // The pawls click past a ratchet of ~24 teeth: faster the faster the wheel turns, a burst a frame.
        const every = 1 / Math.min(40, speed * 7);
        const target = out(0.3);
        for (let t = 0; t < 0.1; t += every) freewheelTick(this.g, target, this.g.now + 0.02 + t, Math.min(1, heard * 3));
        this.tickClock = 0.1;
      }
    }
    this.bellCooldown -= dt;
    const braking = this.lastSpeed - speed > 2.5 * dt && this.lastSpeed > 2;
    if (this.bellCooldown <= 0 && d < 16 && (braking || random() < dt / 90)) {
      this.bellCooldown = 8 + random() * 6;
      bikeBell(this.g, out(1.5), Math.min(1, heard * 2.5));
    }
  }

  /** A horn: two reedy tones, a short blast or two (the bus's and the lorry's lower and longer). */
  private horn(out: AudioNode, heard: number): void {
    const heavy = this.kindKey === 'heavy';
    const scooter = this.kindKey === 'scooter' || this.kindKey === 'motorbike';
    horn(this.g.ctx, out, {
      pitches: heavy ? [233, 294] : scooter ? [560, 600] : [415 + this.tint * 40, 523 + this.tint * 40],
      blasts: random() < 0.4 ? 2 : 1,
      length: heavy ? 0.7 : scooter ? 0.2 : 0.32,
      gap: 0.12,
      level: Math.min(0.5, 0.15 + heard * 0.6) * 0.25,
      attack: 0.015,
      release: 0.03,
      filter: { type: 'bandpass', frequency: heavy ? 700 : 1100, q: 0.9 },
    }, this.g.now + 0.02);
  }
}

/** 0..1 through the current gear at `speed` (0 at a change, 1 just before the next); a smooth rise with no gears. */
function gearFraction(speed: number, gears: readonly number[]): number {
  if (gears.length === 0) return Math.min(1, speed / 8);
  let from = 0;
  for (const to of gears) {
    if (speed < to) return 0.15 + 0.85 * ((speed - from) / (to - from));
    from = to;
  }
  return 0.6 + Math.min(0.4, (speed - from) / 10);
}
