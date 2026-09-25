import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { startedAudioContext } from '@/audio/audioContext';
import type { Furniture, OccupancyAware } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '../props/outdoors/wakefulness';
import type { CarVoice } from './StreetCars';

export interface StreetSoundOptions {
  /** The ears (the camera). */
  listener: THREE.Object3D;
  /** The cars driving through: each one is heard where it is. */
  cars: readonly CarVoice[];
}

const MASTER = 0.5;

interface Engine {
  gain: GainNode;
  pan: StereoPannerNode;
  tone: OscillatorNode;
  hiss: BiquadFilterNode;
}

/**
 * What the street sounds like out here (synthesised, like `StreetAmbience` through the windows,
 * but heard in the open): the city's distant traffic rumble following how awake it is, each
 * driving car's tyres and engine where the car is (louder and to its side as it passes, hissier
 * on a wet road), the rain's hiss, sparrows now and then by day. Only while the player is in the
 * street (`setOccupied`); nothing before the page's first gesture started the audio.
 */
export class StreetSound extends THREE.Group implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rumble: GainNode | null = null;
  private rain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly engines: Engine[] = [];
  private occupied = false;
  private birdClock = 3;
  private readonly ear = new THREE.Vector3();
  private readonly car = new THREE.Vector3();
  private readonly facing = new THREE.Vector3();

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
    const rightX = -this.facing.z;
    const rightZ = this.facing.x;
    const rightLen = Math.hypot(rightX, rightZ) || 1;
    const { cars } = this.options;
    for (let i = 0; i < cars.length; i++) {
      const voice = cars[i]!;
      const engine = this.engines[i];
      if (!engine) continue;
      let level = 0;
      let pan = 0;
      if (voice.active) {
        this.car.copy(voice.position);
        this.localToWorld(this.car);
        const dx = this.car.x - this.ear.x;
        const dz = this.car.z - this.ear.z;
        const d = Math.hypot(dx, dz) || 1;
        level = (0.25 + voice.speed / 9) / (1 + (d * d) / 60);
        pan = ((dx * rightX + dz * rightZ) / (d * rightLen)) * 0.85;
        engine.tone.frequency.setTargetAtTime(38 + voice.speed * 5, now, 0.2);
        engine.hiss.frequency.setTargetAtTime(700 + s.wetness * 1600 + voice.speed * 40, now, 0.3);
      }
      engine.gain.gain.setTargetAtTime(level * 0.5, now, 0.15);
      engine.pan.pan.setTargetAtTime(pan, now, 0.1);
    }

    // Sparrows by day in dry weather.
    this.birdClock -= dt;
    if (this.birdClock <= 0) {
      this.birdClock = 2 + Math.random() * 6;
      if (s.daylight > 0.4 && s.rain < 0.1) this.chirp(ctx);
    }
  }

  private build(): AudioContext | null {
    const ctx = startedAudioContext();
    if (!ctx) return null;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.setTargetAtTime(this.occupied ? MASTER : 0, ctx.currentTime, 0.6);
    this.master.connect(ctx.destination);

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

    // One voice per car that can drive through: tyre noise plus a low engine note.
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
      this.engines.push({ gain, pan, tone, hiss: tyres });
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
  }
}
