import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { outdoorsInput, startedAudioContext } from '@/audio/audioContext';
import { ringTheHour } from '@/audio/churchBells';
import type { Furniture, OccupancyAware } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '../props/outdoors/wakefulness';
import type { CarVoice } from './StreetCars';
import { STREET_PLAN } from './streetPlan';

export interface StreetSoundOptions {
  /** The ears (the camera). */
  listener: THREE.Object3D;
  /** Everything driving through (cars, the bus, the van, the bin lorry): each one is heard where it is. */
  cars: readonly CarVoice[];
}

const MASTER = 0.5;
/** Game hours the church clock strikes between (inclusive), so nobody is woken. */
const BELL_HOURS = [8, 21] as const;
/** Real seconds between two distant sirens: by day, and at night (more often). */
const SIREN_EVERY = { day: [150, 420], night: [80, 240] } as const;

/** What a road user may say about itself beyond `CarVoice` (the vehicles' fork adds these; read defensively). */
interface VoiceExtras {
  readonly honks?: number;
  readonly kind?: string;
}

interface Engine {
  gain: GainNode;
  pan: StereoPannerNode;
  tone: OscillatorNode;
  toneGain: GainNode;
  hiss: BiquadFilterNode;
  /** The voice's horn count last heard (a new one plays the horn). */
  honks: number;
  heavy: boolean;
}

/**
 * What the street sounds like out here (synthesised, like `StreetAmbience` through the windows,
 * but heard in the open): the city's distant traffic rumble following how awake it is, each
 * driving vehicle's tyres and engine where it is (louder and to its side as it passes, hissier
 * on a wet road; the bus and the bin lorry a deep diesel), a horn when a driver loses patience
 * (`honks`), the rain's hiss, sparrows now and then by day, a siren far off now and then (more
 * at night), and the church clock beyond the park striking the hours from 8:00 to 21:00, a
 * quarter chime first. Only while the player is in the street (`setOccupied`); nothing before the
 * page's first gesture started the audio.
 */
export class StreetSound extends THREE.Group implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private far: GainNode | null = null;
  private farPan: StereoPannerNode | null = null;
  private rumble: GainNode | null = null;
  private rain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly engines: Engine[] = [];
  private occupied = false;
  private birdClock = 3;
  private sirenClock = 40 + Math.random() * 120;
  private lastHour = -1;
  private bellsUntil = 0;
  private readonly ear = new THREE.Vector3();
  private readonly car = new THREE.Vector3();
  private readonly facing = new THREE.Vector3();
  private readonly church = new THREE.Vector3(STREET_PLAN.church[0], 20, STREET_PLAN.church[1]);

  constructor(private readonly dayNight: DayNight, private readonly options: StreetSoundOptions) {
    super();
    this.name = 'StreetSound';
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(occupied ? MASTER : 0, this.ctx.currentTime, 0.4);
    // Arriving mid-hour does not strike it.
    this.lastHour = Math.floor(this.dayNight.state.hours);
  }

  dispose(): void {
    for (const e of this.engines) e.tone.stop();
    this.master?.disconnect();
    this.ctx = null;
  }

  update(dt: number): void {
    const ctx = this.ctx ?? this.build();
    if (!ctx || !this.master || !this.rumble || !this.rain) return;
    const s = this.dayNight.state;
    const now = ctx.currentTime;
    const awake = wakefulnessAt(s.hours);
    this.rumble.gain.setTargetAtTime(0.06 + 0.22 * awake, now, 2);
    this.rain.gain.setTargetAtTime(0.45 * s.rain + 0.08 * s.wetness * awake, now, 2);

    this.options.listener.getWorldPosition(this.ear);
    this.options.listener.getWorldDirection(this.facing);
    const { cars } = this.options;
    for (let i = 0; i < cars.length; i++) {
      const voice = cars[i]!;
      const engine = this.engines[i];
      if (!engine) continue;
      const extras = voice as CarVoice & VoiceExtras;
      const heavy = extras.kind === 'bus' || extras.kind === 'lorry';
      if (heavy !== engine.heavy) {
        engine.heavy = heavy;
        engine.toneGain.gain.setTargetAtTime(heavy ? 0.32 : 0.12, now, 0.1);
      }
      let level = 0;
      let pan = 0;
      if (voice.active) {
        this.car.copy(voice.position);
        this.localToWorld(this.car);
        const d = Math.hypot(this.car.x - this.ear.x, this.car.z - this.ear.z) || 1;
        level = ((heavy ? 0.55 : 0.25) + voice.speed / 9) / (1 + (d * d) / (heavy ? 110 : 60));
        pan = this.panOf(this.car);
        engine.tone.frequency.setTargetAtTime(heavy ? 26 + voice.speed * 3.2 : 38 + voice.speed * 5, now, 0.2);
        engine.hiss.frequency.setTargetAtTime(700 + s.wetness * 1600 + voice.speed * 40, now, 0.3);
        const honks = extras.honks ?? 0;
        if (honks > engine.honks && this.occupied) this.horn(ctx, level, pan, heavy);
        engine.honks = honks;
      } else engine.honks = extras.honks ?? 0;
      engine.gain.gain.setTargetAtTime(level * 0.5, now, 0.15);
      engine.pan.pan.setTargetAtTime(pan, now, 0.1);
    }

    // Sparrows by day in dry weather.
    this.birdClock -= dt;
    if (this.birdClock <= 0) {
      this.birdClock = 2 + Math.random() * 6;
      if (s.daylight > 0.4 && s.rain < 0.1) this.chirp(ctx);
    }

    if (!this.occupied) return;
    // A siren far off, now and then.
    this.sirenClock -= dt;
    if (this.sirenClock <= 0) {
      const [a, b] = s.night ? SIREN_EVERY.night : SIREN_EVERY.day;
      this.sirenClock = a + Math.random() * (b - a);
      this.siren(ctx);
    }
    // The church clock on the full hour (never over the last hour's strokes).
    const hour = Math.floor(s.hours);
    if (hour !== this.lastHour) {
      const struck = this.lastHour >= 0 && (hour === (this.lastHour + 1) % 24);
      this.lastHour = hour;
      if (struck && hour >= BELL_HOURS[0] && hour <= BELL_HOURS[1] && now >= this.bellsUntil && this.far && this.farPan) {
        this.farPan.pan.setTargetAtTime(this.panOf(this.localToWorld(this.church.set(STREET_PLAN.church[0], 20, STREET_PLAN.church[1]))), now, 0.05);
        this.bellsUntil = ringTheHour(ctx, this.far, now + 0.05, hour, 0.05);
      }
    }
  }

  /** Where a world point is, left (-1) to right (1) of the listener's view. */
  private panOf(world: THREE.Vector3): number {
    const dx = world.x - this.ear.x;
    const dz = world.z - this.ear.z;
    const d = Math.hypot(dx, dz) || 1;
    const rightX = -this.facing.z;
    const rightZ = this.facing.x;
    const len = Math.hypot(rightX, rightZ) || 1;
    return ((dx * rightX + dz * rightZ) / (d * len)) * 0.85;
  }

  private build(): AudioContext | null {
    const ctx = startedAudioContext();
    if (!ctx) return null;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.setTargetAtTime(this.occupied ? MASTER : 0, ctx.currentTime, 0.6);
    // Through the street's filter: heard muffled from the building's sas with the door shut.
    this.master.connect(outdoorsInput(ctx));

    const length = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const white = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) white[i] = Math.random() * 2 - 1;
    const brown = ctx.createBuffer(1, length, ctx.sampleRate);
    const b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * white[i]!) / 1.02;
      b[i] = last * 3.5;
    }

    this.rumble = ctx.createGain();
    this.rumble.gain.value = 0;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 320;
    this.loop(ctx, brown).connect(low).connect(this.rumble).connect(this.master);

    this.rain = ctx.createGain();
    this.rain.gain.value = 0;
    const hiss = ctx.createBiquadFilter();
    hiss.type = 'bandpass';
    hiss.frequency.value = 3000;
    hiss.Q.value = 0.35;
    this.loop(ctx, this.noise).connect(hiss).connect(this.rain).connect(this.master);

    // Far-off sounds (the bells, sirens) come through the air muffled: a lowpass and a pan of their own.
    this.far = ctx.createGain();
    const farLow = ctx.createBiquadFilter();
    farLow.type = 'lowpass';
    farLow.frequency.value = 2400;
    this.farPan = ctx.createStereoPanner();
    this.far.connect(farLow).connect(this.farPan).connect(this.master);

    // One voice per vehicle that can drive through: tyre noise plus a low engine note.
    for (let i = 0; i < this.options.cars.length; i++) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      const tyres = ctx.createBiquadFilter();
      tyres.type = 'bandpass';
      tyres.frequency.value = 800;
      tyres.Q.value = 0.6;
      this.loop(ctx, this.noise).connect(tyres).connect(gain);
      const tone = ctx.createOscillator();
      tone.type = 'sawtooth';
      tone.frequency.value = 45;
      const toneGain = ctx.createGain();
      toneGain.gain.value = 0.12;
      const toneFilter = ctx.createBiquadFilter();
      toneFilter.type = 'lowpass';
      toneFilter.frequency.value = 220;
      tone.connect(toneFilter).connect(toneGain).connect(gain);
      tone.start();
      gain.connect(pan).connect(this.master);
      const voice = this.options.cars[i] as CarVoice & VoiceExtras;
      this.engines.push({ gain, pan, tone, toneGain, hiss: tyres, honks: voice.honks ?? 0, heavy: false });
    }
    return ctx;
  }

  private loop(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start(0, Math.random() * buffer.duration);
    return source;
  }

  /** A horn: two detuned reedy tones, a short blast or two (the bus's lower and longer). */
  private horn(ctx: AudioContext, level: number, pan: number, heavy: boolean): void {
    if (!this.master) return;
    const t = ctx.currentTime + 0.02;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = heavy ? 700 : 1100;
    band.Q.value = 0.9;
    band.connect(panner).connect(this.master);
    const blasts = Math.random() < 0.4 ? 2 : 1;
    const length = heavy ? 0.7 : 0.32;
    const loud = Math.min(0.5, 0.15 + level * 1.2);
    for (let n = 0; n < blasts; n++) {
      const start = t + n * (length + 0.12);
      for (const f of heavy ? [233, 294] : [415, 523]) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = f;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, start);
        env.gain.linearRampToValueAtTime(loud * 0.25, start + 0.015);
        env.gain.setValueAtTime(loud * 0.25, start + length - 0.03);
        env.gain.linearRampToValueAtTime(0, start + length);
        osc.connect(env).connect(band);
        osc.start(start);
        osc.stop(start + length + 0.02);
      }
    }
    window.setTimeout(() => panner.disconnect(), (blasts * (length + 0.12) + 0.5) * 1000);
  }

  /** A two-tone siren far off, drifting past: it swells, its pitch sags as it goes (a whiff of Doppler), it fades. */
  private siren(ctx: AudioContext): void {
    if (!this.master) return;
    const t = ctx.currentTime + 0.05;
    const length = 9 + Math.random() * 6;
    const panner = ctx.createStereoPanner();
    const from = Math.random() * 1.6 - 0.8;
    panner.pan.setValueAtTime(from, t);
    panner.pan.linearRampToValueAtTime(-from * 0.6, t + length);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 1800;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.03, t + length * 0.45);
    env.gain.linearRampToValueAtTime(0, t + length);
    env.connect(low).connect(panner).connect(this.master);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    // The French two-tone (la, si), half a second each, slipping down a little as it passes.
    const step = 0.55;
    for (let i = 0; t + i * step < t + length; i++) {
      const bend = 1 - 0.03 * THREE.MathUtils.smoothstep((i * step) / length, 0.4, 0.6);
      osc.frequency.setValueAtTime((i % 2 ? 488 : 435) * bend, t + i * step);
    }
    osc.connect(env);
    osc.start(t);
    osc.stop(t + length + 0.05);
    window.setTimeout(() => panner.disconnect(), (length + 1) * 1000);
  }

  /** A sparrow: two or three quick falling chirps. */
  private chirp(ctx: AudioContext): void {
    if (!this.master) return;
    const t = ctx.currentTime + 0.02;
    const notes = 2 + Math.floor(Math.random() * 3);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.master);
    for (let i = 0; i < notes; i++) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const start = t + i * (0.09 + Math.random() * 0.05);
      const f = 3800 + Math.random() * 1400;
      osc.frequency.setValueAtTime(f, start);
      osc.frequency.exponentialRampToValueAtTime(f * 0.7, start + 0.06);
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(0.05, start + 0.01);
      env.gain.linearRampToValueAtTime(0, start + 0.07);
      osc.connect(env).connect(pan);
      osc.start(start);
      osc.stop(start + 0.08);
    }
    window.setTimeout(() => pan.disconnect(), 1000);
  }
}
