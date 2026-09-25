import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { outdoorsInput, startedAudioContext } from '@/audio/audioContext';
import type { Furniture, OccupancyAware } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { isShopOpen } from '../shops/shopHours';
import { STREET_PLAN, WALKABLE, shopDoors, type ShopKind, type Vec2 } from '../streetPlan';

export interface ShopSoundsOptions {
  /** The ears (the camera). */
  listener: THREE.Object3D;
}

const MASTER = 0.6;
/** Shops further along than this past the walkable street are not heard (the roadworks are in between). */
const HEARD_BEYOND = 6;
/** Speech bands the chatter's voices talk in (noise through each, switched on in phrases). */
const FORMANTS = [460, 640, 820, 1050, 1300];

type SourceKind = 'arcade' | 'chatter' | 'laundry';

interface Voice {
  gain: GainNode;
  talking: boolean;
  phrase: number;
  syllable: number;
}

interface Source {
  kind: SourceKind;
  /** Zone-local, a little out on the pavement in front of the door. */
  at: THREE.Vector3;
  /** How loud it is right now (0..1), from the clock and the weather. */
  level: () => number;
  /** Loudness at 1 m and how far it carries (the distance at which it has halved). */
  loudness: number;
  reach: number;
  gain?: GainNode;
  pan?: StereoPannerNode;
  voices: Voice[];
  /** Seconds to the next clink (a glass, a cup) or bleep (a cabinet). */
  next: number;
  now: number;
}

/**
 * What comes out of the shops onto the pavement (synthesised, positional: louder near, to the side
 * it is on): the arcade's cabinets bleeping and its crowd murmuring through the door at every
 * hour; the chatter and the clink of cups and glasses from the cafés and bars while they are open
 * (`isShopOpen`), from their terraces too when those are out and it is dry, the bars livelier in
 * the evening; the laundry's machines humming; and a shop bell over a door when someone goes in or
 * out (`ring`). Only while the player is in the street (`setOccupied`); nothing before the page's
 * first gesture started the audio.
 */
export class ShopSounds extends THREE.Group implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly sources: Source[] = [];
  private occupied = false;
  private readonly ear = new THREE.Vector3();
  private readonly facing = new THREE.Vector3();
  private readonly spot = new THREE.Vector3();

  constructor(private readonly dayNight: DayNight, private readonly options: ShopSoundsOptions) {
    super();
    this.name = 'ShopSounds';
    const hours = (): number => this.dayNight.state.hours;
    const out = (at: Vec2, yaw: number, by = 0.6): THREE.Vector3 => new THREE.Vector3(at[0] + Math.sin(yaw) * by, 1.4, at[1] + Math.cos(yaw) * by);
    for (const door of shopDoors()) {
      if (door.at[0] > WALKABLE.maxX + HEARD_BEYOND || door.at[0] < WALKABLE.minX - HEARD_BEYOND) continue;
      const kind: ShopKind = door.shop.kind;
      if (kind === 'arcade') {
        this.sources.push(source('arcade', out(door.at, door.yaw, 0.3), () => 1, 0.5, 5));
      } else if (kind === 'cafe' || kind === 'bar') {
        const bar = kind === 'bar';
        this.sources.push(source('chatter', out(door.at, door.yaw), () => (isShopOpen(kind, hours()) ? liveliness(bar, hours()) : 0), 0.35, 3.5));
      } else if (kind === 'laundry') {
        this.sources.push(source('laundry', out(door.at, door.yaw, 0.3), () => (isShopOpen(kind, hours()) ? 1 : 0), 0.25, 3));
      }
    }
    // The terraces: out in the dry, while their hours say so.
    for (const terrace of STREET_PLAN.terraces) {
      const [open, close] = terrace.hours;
      const mid = new THREE.Vector3((terrace.from[0] + terrace.to[0]) / 2, 1.1, (terrace.from[1] + terrace.to[1]) / 2);
      const level = (): number => {
        const s = this.dayNight.state;
        const h = s.hours < open && s.hours + 24 < close ? s.hours + 24 : s.hours;
        const out = h >= open && h < close && s.rain < 0.15 && s.snow < 0.15;
        return out ? 0.35 + 0.15 * terrace.customers : 0;
      };
      this.sources.push(source('chatter', mid, level, 0.3, 3));
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(occupied ? MASTER : 0, this.ctx.currentTime, 0.5);
  }

  dispose(): void {
    this.master?.disconnect();
    this.ctx = null;
  }

  /** A shop bell over a door (zone-local floor point): someone went in or came out. */
  ring(at: Vec2): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.occupied) return;
    const where = this.spot.set(at[0], 2.3, at[1]);
    const { gain, pan } = this.placeFor(where, 0.5, 4);
    if (gain < 0.004) return;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.master);
    const t = ctx.currentTime + 0.01;
    // Two strikes of a little brass bell: a bright partial and a lower one, each ringing out.
    for (const [i, delay] of [0, 0.16].entries()) {
      for (const [f, level, decay] of [[2350, 1, 0.9], [3720, 0.5, 0.5], [5480, 0.25, 0.3]] as const) {
        const osc = ctx.createOscillator();
        osc.frequency.value = f * (i ? 1.01 : 1);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t + delay);
        env.gain.linearRampToValueAtTime(gain * level * 0.12 * (i ? 0.7 : 1), t + delay + 0.004);
        env.gain.exponentialRampToValueAtTime(0.0001, t + delay + decay);
        osc.connect(env).connect(panner);
        osc.start(t + delay);
        osc.stop(t + delay + decay + 0.05);
      }
    }
    window.setTimeout(() => panner.disconnect(), 1500);
  }

  update(dt: number): void {
    const ctx = this.ctx ?? this.build();
    if (!ctx || !this.master || !this.occupied) return;
    const now = ctx.currentTime;
    this.options.listener.getWorldPosition(this.ear);
    this.options.listener.getWorldDirection(this.facing);
    for (const s of this.sources) {
      if (!s.gain || !s.pan) continue;
      const level = s.level();
      this.localToWorld(this.spot.copy(s.at));
      const { gain, pan } = this.placeFor(this.spot, s.loudness, s.reach, true);
      s.now = gain * level;
      s.gain.gain.setTargetAtTime(s.now, now, 0.3);
      s.pan.pan.setTargetAtTime(pan, now, 0.1);
      if (s.now < 0.003) continue;
      this.talk(ctx, s, dt);
      s.next -= dt;
      if (s.next > 0) continue;
      if (s.kind === 'chatter') {
        s.next = 0.8 + Math.random() * 3.5 / Math.max(0.3, level);
        this.clink(ctx, s);
      } else if (s.kind === 'arcade') {
        s.next = 0.12 + Math.random() * 0.6;
        this.bleep(ctx, s);
      }
    }
  }

  /** Gain and pan of a sound at `world` for the listener: `loudness` at 1 m, halved at `reach`; silent past ~8 reaches. */
  private placeFor(world: THREE.Vector3, loudness: number, reach: number, alreadyWorld = false): { gain: number; pan: number } {
    if (!alreadyWorld) this.localToWorld(world);
    const dx = world.x - this.ear.x;
    const dz = world.z - this.ear.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d > reach * 8) return { gain: 0, pan: 0 };
    const rightX = -this.facing.z;
    const rightZ = this.facing.x;
    const len = Math.hypot(rightX, rightZ) || 1;
    return { gain: loudness / (1 + (d * d) / (reach * reach)), pan: ((dx * rightX + dz * rightZ) / (d * len)) * 0.8 };
  }

  private build(): AudioContext | null {
    const ctx = startedAudioContext();
    if (!ctx) return null;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.setTargetAtTime(this.occupied ? MASTER : 0, ctx.currentTime, 0.6);
    this.master.connect(outdoorsInput(ctx)); // muffled from the building's sas (`world/airlock`)
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const white = this.noise.getChannelData(0);
    for (let i = 0; i < white.length; i++) white[i] = Math.random() * 2 - 1;

    for (const s of this.sources) {
      s.gain = ctx.createGain();
      s.gain.gain.value = 0;
      s.pan = ctx.createStereoPanner();
      s.gain.connect(s.pan).connect(this.master);
      if (s.kind === 'laundry') this.hum(ctx, s.gain);
      else {
        // Voices talking over each other (the arcade's crowd is fewer and further in).
        const count = s.kind === 'arcade' ? 2 : 3;
        for (let i = 0; i < count; i++) {
          const band = ctx.createBiquadFilter();
          band.type = 'bandpass';
          band.frequency.value = FORMANTS[Math.floor(Math.random() * FORMANTS.length)]! * (0.9 + Math.random() * 0.2);
          band.Q.value = 3;
          const gain = ctx.createGain();
          gain.gain.value = 0;
          this.loop(ctx, this.noise).connect(band).connect(gain).connect(s.gain);
          s.voices.push({ gain, talking: false, phrase: Math.random() * 2, syllable: 0 });
        }
        // A low bed of room noise under the voices.
        const low = ctx.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.value = 300;
        const bed = ctx.createGain();
        bed.gain.value = 0.25;
        this.loop(ctx, this.noise).connect(low).connect(bed).connect(s.gain);
      }
    }
    return ctx;
  }

  /** The chatter's phrases and syllables (as `CrowdMurmur` does): each voice talks a while, pauses, talks again. */
  private talk(ctx: AudioContext, s: Source, dt: number): void {
    for (const voice of s.voices) {
      voice.phrase -= dt;
      if (voice.phrase <= 0) {
        voice.talking = !voice.talking;
        voice.phrase = voice.talking ? 0.7 + Math.random() * 2.4 : 0.5 + Math.random() * 2.5;
        if (!voice.talking) voice.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      }
      if (!voice.talking) continue;
      voice.syllable -= dt;
      if (voice.syllable <= 0) {
        voice.syllable = 0.09 + Math.random() * 0.15;
        voice.gain.gain.setTargetAtTime(0.3 + Math.random() * 0.7, ctx.currentTime, 0.03);
      }
    }
  }

  /** A cup on a saucer, a glass on a glass: two quick inharmonic pings. */
  private clink(ctx: AudioContext, s: Source): void {
    if (!s.gain) return;
    const t = ctx.currentTime + 0.01;
    const f = 2600 + Math.random() * 1800;
    for (const [ratio, level] of [[1, 1], [2.76, 0.4]] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f * ratio;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.12 * level, t + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(env).connect(s.gain);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  /** A cabinet's blip, a short square-wave arpeggio up or down. */
  private bleep(ctx: AudioContext, s: Source): void {
    if (!s.gain) return;
    const t = ctx.currentTime + 0.01;
    const notes = 1 + Math.floor(Math.random() * 3);
    const base = 330 * 2 ** (Math.floor(Math.random() * 12) / 12);
    const up = Math.random() < 0.5;
    for (let i = 0; i < notes; i++) {
      const osc = ctx.createOscillator();
      osc.type = Math.random() < 0.6 ? 'square' : 'triangle';
      osc.frequency.value = base * 2 ** (((up ? 1 : -1) * i * 4) / 12);
      const env = ctx.createGain();
      const at = t + i * 0.07;
      env.gain.setValueAtTime(0.05, at);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.065);
      osc.connect(env).connect(s.gain);
      osc.start(at);
      osc.stop(at + 0.07);
    }
  }

  /** The laundry's machines: a low motor hum and the drum's slow slosh. */
  private hum(ctx: AudioContext, out: GainNode): void {
    const motor = ctx.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.value = 98;
    const motorLow = ctx.createBiquadFilter();
    motorLow.type = 'lowpass';
    motorLow.frequency.value = 260;
    const motorGain = ctx.createGain();
    motorGain.gain.value = 0.25;
    motor.connect(motorLow).connect(motorGain).connect(out);
    motor.start();
    const slosh = ctx.createBiquadFilter();
    slosh.type = 'bandpass';
    slosh.frequency.value = 500;
    slosh.Q.value = 0.8;
    const sloshGain = ctx.createGain();
    sloshGain.gain.value = 0.3;
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 0.7;
    const depth = ctx.createGain();
    depth.gain.value = 0.25;
    wobble.connect(depth).connect(sloshGain.gain);
    wobble.start();
    if (this.noise) this.loop(ctx, this.noise).connect(slosh).connect(sloshGain).connect(out);
  }

  private loop(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    node.start(0, Math.random() * buffer.duration);
    return node;
  }
}

function source(kind: SourceKind, at: THREE.Vector3, level: () => number, loudness: number, reach: number): Source {
  return { kind, at, level, loudness, reach, voices: [], next: Math.random() * 2, now: 0 };
}

/** How busy a café or bar sounds at `hours`: cafés at breakfast and lunch, bars in the evening and late. */
function liveliness(bar: boolean, hours: number): number {
  if (bar) return 0.45 + 0.55 * THREE.MathUtils.smoothstep(hours, 17, 21) + (hours < 3 ? 0.4 : 0);
  const breakfast = Math.exp(-(((hours - 8.5) / 1.5) ** 2));
  const lunch = Math.exp(-(((hours - 12.8) / 1.2) ** 2));
  return 0.35 + 0.5 * Math.max(breakfast, lunch);
}
