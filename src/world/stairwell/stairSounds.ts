import { Voice, type AmbientVoice } from '@/audio/ambient';
import { audioBus, startedAudioContext } from '@/audio/audioContext';
import { brownNoise, whiteNoise } from '@/audio/noise';

/*
 * What the stairwell sounds like, synthesised like the flat's room sounds (`audio/ambient`): the
 * hall's tone (a big stone box: a low air, the building breathing), the neighbours behind their
 * doors while they are home (a television, a piano being practised, a dog; each an `AmbientVoice`
 * on a `PointSound` behind its door, the door and the walls muffling it), the street behind the
 * street door. The one-shots (a light's relay, a neighbour's latch) ring on in the stone: a short
 * echo shared by all of them (`stairEcho`).
 */

/** The stairwell's air: a low, slow rumble of the building and the street far below, and a faint hiss high up the shaft. */
export class HallTone extends Voice {
  constructor() {
    super(0.3, { follow: 0.5 });
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    const low = this.loop(ctx, brownNoise(ctx, 4));
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 160;
    const lowGain = ctx.createGain();
    lowGain.gain.value = 0.22;
    low.connect(lowpass).connect(lowGain).connect(out);
    const air = this.loop(ctx, this.noise(ctx, 3));
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2400;
    band.Q.value = 0.5;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.012;
    air.connect(band).connect(airGain).connect(out);
  }
}

/** How the street is behind the door: how awake the city is (0 at 3 am .. 1 by day), how hard it rains (0..1). */
interface StreetOutside {
  wakefulness: number;
  rain: number;
}

/**
 * The street through the building's street door: its traffic dull and far (thinner at night, a car going by now and
 * then, fewer late), the rain drumming on the pavement beyond it when it rains: what the street itself sounds like.
 */
export class StreetBehindDoor extends Voice {
  private untilCar = rand(4, 12);
  private rumbleGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private outsideClock = 0;
  private awake = 1;

  constructor(private readonly outside: () => StreetOutside) {
    super(0.35, { follow: 0.4 });
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    const rumble = this.loop(ctx, brownNoise(ctx, 4));
    const door = ctx.createBiquadFilter();
    door.type = 'lowpass';
    door.frequency.value = 300;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0.25;
    rumble.connect(door).connect(this.rumbleGain).connect(out);
    // The rain through the door: a hiss, dulled by the wood.
    const rain = this.loop(ctx, whiteNoise(ctx, 3));
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    band.Q.value = 0.4;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(band).connect(this.rainGain).connect(out);
    this.outsideClock = 0;
  }

  protected override tick(ctx: AudioContext, dt: number): void {
    this.outsideClock -= dt;
    if (this.outsideClock <= 0) {
      this.outsideClock = 1;
      const { wakefulness, rain } = this.outside();
      this.awake = wakefulness;
      const now = ctx.currentTime;
      this.rumbleGain?.gain.setTargetAtTime(0.25 * (0.3 + 0.7 * wakefulness), now, 0.8);
      this.rainGain?.gain.setTargetAtTime(0.18 * Math.min(1, rain * 1.4), now, 0.8);
    }
    this.untilCar -= dt;
    if (this.untilCar > 0 || !this.master) return;
    // Fewer cars as the city sleeps.
    this.untilCar = rand(7, 20) / Math.max(0.15, this.awake);
    const now = ctx.currentTime;
    const run = rand(2.5, 4);
    const source = ctx.createBufferSource();
    source.buffer = whiteNoise(ctx, 5);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(200, now);
    low.frequency.linearRampToValueAtTime(480, now + run / 2);
    low.frequency.linearRampToValueAtTime(180, now + run);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(rand(0.15, 0.3), now + run / 2);
    env.gain.exponentialRampToValueAtTime(0.0001, now + run);
    source.connect(low).connect(env).connect(this.master);
    source.start(now);
    source.stop(now + run + 0.05);
  }
}

/** A neighbour's television through their door: a murmur of voices, a laugh track swelling now and then, a jingle between. */
export class DoorTelevision extends Voice {
  private murmur: GainNode | null = null;
  private door: AudioNode | null = null;
  private untilSwell = rand(4, 12);

  constructor() {
    super(0.28);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    const door = throughDoor(ctx, out);
    this.door = door;
    const noise = this.loop(ctx, this.noise(ctx, 3));
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 1.3;
    this.murmur = ctx.createGain();
    this.murmur.gain.value = 0.35;
    noise.connect(band).connect(this.murmur).connect(door);
    // The voices' rhythm: the murmur's loudness wobbling at a syllable's rate.
    const lfo = this.keep(ctx.createOscillator());
    lfo.frequency.value = 3.1;
    const depth = ctx.createGain();
    depth.gain.value = 0.18;
    lfo.connect(depth).connect(this.murmur.gain);
  }

  protected override tick(ctx: AudioContext, dt: number): void {
    this.untilSwell -= dt;
    if (this.untilSwell > 0 || !this.murmur || !this.door) return;
    this.untilSwell = rand(6, 18);
    const now = ctx.currentTime;
    if (Math.random() < 0.7) {
      // The studio laughing.
      this.murmur.gain.setTargetAtTime(0.7, now, 0.25);
      this.murmur.gain.setTargetAtTime(0.35, now + 1.6, 0.5);
      return;
    }
    // A jingle: four dull notes, the set's little speaker through the door.
    const door = this.door;
    const root = 220 * Math.pow(2, Math.floor(rand(0, 5)) / 12);
    [0, 4, 7, 12].forEach((step, i) => {
      const at = now + i * 0.18;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = root * Math.pow(2, step / 12);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.08, at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);
      osc.connect(env).connect(door);
      osc.start(at);
      osc.stop(at + 0.2);
    });
  }
}

/** Someone practising the piano behind their door, badly: a scale, a phrase, a wrong note, a stop, starting again. */
export class DoorPiano extends Voice {
  private untilNote = rand(1, 3);
  private phrase: number[] = [];
  private out: AudioNode | null = null;

  constructor() {
    super(0.3);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    this.out = throughDoor(ctx, out, 1400);
  }

  protected override tick(ctx: AudioContext, dt: number): void {
    this.untilNote -= dt;
    if (this.untilNote > 0 || !this.out) return;
    if (!this.phrase.length) {
      // A new try: up the scale of C, or the same little tune again.
      const scale = [0, 2, 4, 5, 7, 9, 11, 12];
      this.phrase = Math.random() < 0.5 ? scale.slice(0, 3 + Math.floor(Math.random() * 6)) : [4, 2, 0, 2, 4, 4, 4];
      this.untilNote = rand(2.5, 7);
      return;
    }
    let step = this.phrase.shift()!;
    // The wrong note, then a stop to start the phrase over.
    if (Math.random() < 0.12) {
      step += Math.random() < 0.5 ? 1 : -1;
      this.phrase = [];
    }
    this.untilNote = this.phrase.length ? rand(0.32, 0.5) : rand(2.5, 6);
    pianoNote(ctx, this.out, 261.6 * Math.pow(2, step / 12));
  }
}

/** A dog behind a door: long silences, then a bark or two, once in a while a grumble. */
export class DoorDog extends Voice {
  private untilBark = rand(10, 40);
  private door: AudioNode | null = null;

  constructor() {
    super(0.32);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    this.door = throughDoor(ctx, out, 900);
  }

  protected override tick(ctx: AudioContext, dt: number): void {
    this.untilBark -= dt;
    const door = this.door;
    if (this.untilBark > 0 || !door) return;
    this.untilBark = rand(25, 80);
    const barks = Math.random() < 0.6 ? 1 : 2;
    for (let i = 0; i < barks; i++) bark(ctx, door, ctx.currentTime + i * rand(0.28, 0.4));
  }
}

/**
 * A voice heard only while `on()` (the neighbour is home, the hour suits them): silent otherwise
 * whatever its `PointSound` sets, so a flat nobody is in stays quiet.
 */
export function whileHome(voice: AmbientVoice, on: () => boolean): AmbientVoice {
  return {
    setLevel: (level) => voice.setLevel(on() ? level : 0),
    update: (dt) => voice.update(dt),
    setSpatial: voice.setSpatial ? (pan, walls) => voice.setSpatial!(pan, walls) : undefined,
    dispose: () => voice.dispose(),
    setZoneActive: voice.setZoneActive ? (active) => voice.setZoneActive!(active) : undefined,
  };
}

/** The timer relay of a landing's lights: a dry clack (softer as it lets go), ringing on down the stairwell. */
export function playRelay(level: number, on: boolean): void {
  const ctx = startedAudioContext();
  if (!ctx || level < 0.004) return;
  const now = ctx.currentTime;
  const out = stairOut(ctx, level);
  burst(ctx, out, now, on ? 2200 : 1700, 5, on ? 0.9 : 0.5, 0.025);
  burst(ctx, out, now + 0.012, 600, 2, on ? 0.5 : 0.3, 0.05);
}

/** A neighbour's door on the landing: the latch, and a moment later the leaf meeting its frame. */
export function playNeighbourDoor(level: number): void {
  const ctx = startedAudioContext();
  if (!ctx || level < 0.004) return;
  const now = ctx.currentTime;
  const out = stairOut(ctx, level);
  burst(ctx, out, now, 1800, 4, 0.6, 0.04);
  burst(ctx, out, now + 0.55, 300, 1.2, 1, 0.18);
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(100, now + 0.55);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.72);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now + 0.55);
  env.gain.exponentialRampToValueAtTime(0.7, now + 0.556);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
  osc.connect(env).connect(out);
  osc.start(now + 0.55);
  osc.stop(now + 0.8);
  burst(ctx, out, now + 0.6, 2600, 5, 0.4, 0.03);
}

/** The stone's echo, one per context: a couple of short delays feeding back through a low-pass, onto the world bus. */
const echoes = new WeakMap<BaseAudioContext, AudioNode>();

/** Where a one-shot of the stairwell goes: `level` into the world bus, and a share of it into the stone's echo. */
function stairOut(ctx: AudioContext, level: number): GainNode {
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(audioBus(ctx, 'world'));
  out.connect(stairEcho(ctx));
  window.setTimeout(() => out.disconnect(), 2500);
  return out;
}

function stairEcho(ctx: AudioContext): AudioNode {
  let input = echoes.get(ctx);
  if (input) return input;
  const send = ctx.createGain();
  send.gain.value = 0.35;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.13;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.42;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 1600;
  send.connect(delay).connect(damp).connect(feedback).connect(delay);
  damp.connect(audioBus(ctx, 'world'));
  input = send;
  echoes.set(ctx, input);
  return input;
}

/** What comes through a door: everything above `cutoff` Hz eaten by the wood, into `out`. */
function throughDoor(ctx: AudioContext, out: AudioNode, cutoff = 600): AudioNode {
  const door = ctx.createBiquadFilter();
  door.type = 'lowpass';
  door.frequency.value = cutoff;
  door.Q.value = 0.4;
  door.connect(out);
  return door;
}

/** A piano's note: a few harmonics struck and decaying, the higher ones sooner. */
function pianoNote(ctx: AudioContext, out: AudioNode, frequency: number): void {
  const now = ctx.currentTime;
  [1, 2, 3, 4].forEach((harmonic, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency * harmonic * (1 + i * 0.0015);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.35 / (harmonic * harmonic), now + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 1.6 / harmonic);
    osc.connect(env).connect(out);
    osc.start(now);
    osc.stop(now + 1.7 / harmonic);
  });
}

/** One bark: a rough tone dropping in pitch through a mouth-shaped band, with a breath of noise. */
function bark(ctx: AudioContext, out: AudioNode, at: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(rand(380, 460), at);
  osc.frequency.exponentialRampToValueAtTime(rand(180, 230), at + 0.16);
  const mouth = ctx.createBiquadFilter();
  mouth.type = 'bandpass';
  mouth.frequency.value = 700;
  mouth.Q.value = 1.5;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.6, at + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
  osc.connect(mouth).connect(env).connect(out);
  osc.start(at);
  osc.stop(at + 0.22);
  burst(ctx, out, at, 1200, 1, 0.25, 0.12);
}

/** A band of noise at `at`, decaying over `decay` s. */
function burst(ctx: AudioContext, out: AudioNode, at: number, band: number, q: number, level: number, decay: number): void {
  const source = ctx.createBufferSource();
  source.buffer = whiteNoise(ctx, 0.3);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = band;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(level, at + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  source.connect(filter).connect(env).connect(out);
  source.start(at);
  source.stop(at + decay + 0.02);
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
