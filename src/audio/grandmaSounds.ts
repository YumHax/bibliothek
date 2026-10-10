import { Voice } from './ambient';
import { noiseBurst, partials, rand, tone } from './synth';
import { random } from '@/random';

/*
 * The sounds of Mémé's flat (docs/story.md "Mémé"): her old set's programme, the longcase clock's chime, the kettle's
 * whistle, the canary, and the avenue far below the window. Each a `Voice` its prop or builder puts on a `PointSound`.
 */

/**
 * An old set's small speaker: a game show or a soap, voices taking turns (a buzz through formant filters, the
 * syllables of a few tenths of a second), a studio murmur under them, now and then the audience's applause or the
 * show's jingle. Nothing made out. Off: silent (`setOn`).
 */
export class TvChatter extends Voice {
  private on = false;
  private phraseLeft = 0;
  private untilSyllable = 0;
  private speaker = 0;
  private untilApplause = rand(20, 50);
  private untilJingle = rand(60, 140);
  private osc: OscillatorNode | null = null;
  private f1: BiquadFilterNode | null = null;
  private f2: BiquadFilterNode | null = null;
  private envelope: GainNode | null = null;
  private power: GainNode | null = null;
  private speakerIn: AudioNode | null = null;

  constructor() {
    super(0.32);
  }

  /** Switched on or off: the programme comes in or goes with a little click. */
  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    const ctx = this.ctx;
    if (!ctx || !this.power) return;
    this.power.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, on ? 0.25 : 0.03);
    noiseBurst(ctx, this.master!, ctx.currentTime, { band: 3000, q: 2, level: 0.15, length: 0.02, attack: 0 });
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    // A small speaker in a wooden box: no low end, no top.
    const low = ctx.createBiquadFilter();
    low.type = 'highpass';
    low.frequency.value = 260;
    const high = ctx.createBiquadFilter();
    high.type = 'lowpass';
    high.frequency.value = 3600;
    this.power = ctx.createGain();
    this.power.gain.value = this.on ? 1 : 0;
    low.connect(high).connect(this.power).connect(out);
    this.speakerIn = low;

    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 140;
    this.f1 = ctx.createBiquadFilter();
    this.f1.type = 'bandpass';
    this.f1.Q.value = 5;
    this.f2 = ctx.createBiquadFilter();
    this.f2.type = 'bandpass';
    this.f2.Q.value = 7;
    this.envelope = ctx.createGain();
    this.envelope.gain.value = 0;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    this.osc.connect(this.f1).connect(mix);
    this.osc.connect(this.f2).connect(mix);
    mix.connect(this.envelope).connect(low);
    this.keep(this.osc);

    // The studio's murmur, steady under the voices.
    const room = this.loop(ctx, this.noise(ctx, 3));
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 700;
    band.Q.value = 0.8;
    const murmur = ctx.createGain();
    murmur.gain.value = 0.05;
    room.connect(band).connect(murmur).connect(low);
  }

  protected override tick(ctx: AudioContext, dt: number): void {
    if (!this.on || !this.osc || !this.f1 || !this.f2 || !this.envelope || !this.speakerIn) return;
    const now = ctx.currentTime;
    this.untilApplause -= dt;
    if (this.untilApplause <= 0) {
      this.untilApplause = rand(25, 70);
      // Hands clapping: a long swell of broadband noise.
      noiseBurst(ctx, this.speakerIn, now, { band: 2200, q: 0.5, level: 0.35, length: rand(2.5, 4), attack: 0.4, hold: 1 });
    }
    this.untilJingle -= dt;
    if (this.untilJingle <= 0) {
      this.untilJingle = rand(90, 180);
      // The show's jingle: a bright rising triad.
      [523.3, 659.3, 784, 1046.5].forEach((frequency, i) => tone(ctx, this.speakerIn!, now + i * 0.14, { frequency, level: 0.12, length: 0.35, type: 'square' }));
    }
    this.untilSyllable -= dt;
    if (this.untilSyllable > 0) return;
    if (this.phraseLeft <= 0) {
      this.phraseLeft = 4 + Math.floor(random() * 12);
      if (random() < 0.55) this.speaker = 1 - this.speaker;
      this.envelope.gain.setTargetAtTime(0, now, 0.05);
      this.untilSyllable = rand(0.3, 1.2);
      return;
    }
    this.phraseLeft--;
    const length = rand(0.08, 0.24);
    const base = this.speaker === 0 ? 125 : 215;
    this.osc.frequency.setTargetAtTime(base * (1 + 0.05 * this.phraseLeft) * rand(0.9, 1.12), now, 0.04);
    this.f1.frequency.setTargetAtTime(rand(350, 850), now, 0.03);
    this.f2.frequency.setTargetAtTime(rand(1000, 2300), now, 0.03);
    const loud = rand(0.4, 0.85);
    this.envelope.gain.setTargetAtTime(loud, now, 0.02);
    this.envelope.gain.setTargetAtTime(loud * 0.2, now + length * 0.7, 0.03);
    this.untilSyllable = length + rand(0.02, 0.09);
  }
}

/** Partials of a struck chime rod (a free bar's): ratio to its note, level, seconds to die away. */
const ROD: readonly [ratio: number, level: number, decay: number][] = [
  [1, 0.8, 3.2],
  [2.76, 0.32, 1.6],
  [5.4, 0.12, 0.8],
  [8.93, 0.05, 0.4],
];
/** The quarter's phrase on the rods (the Westminster's last quarter), then the hour on the low rod. */
const PHRASE = [659.3, 830.6, 740, 493.9];
const PHRASE_STEP = 0.7;
const HOUR_ROD = 246.9;
const STROKE_STEP = 1.25;

/**
 * A longcase clock's chime: on the hour, the four notes on its rods, then the hour struck on the low one (`ring`).
 * Nothing in between: the clock's tick is its own `ClockTick`.
 */
export class LongcaseChime extends Voice {
  constructor() {
    super(0.45);
  }

  /** The hour `hour` (0..23) struck now, if the voice is heard. */
  ring(hour: number): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || this.level <= 0) return;
    const strike = (at: number, note: number, level: number) =>
      partials(ctx, out, at, ROD.map(([ratio, partLevel, decay]) => [note * ratio, partLevel, decay] as const), { level, length: 2, attack: 0.004, spread: 0.003 });
    const now = ctx.currentTime + 0.1;
    PHRASE.forEach((note, i) => strike(now + i * PHRASE_STEP, note, 0.35));
    const first = now + PHRASE.length * PHRASE_STEP + 1;
    const strokes = hour % 12 || 12;
    for (let i = 0; i < strokes; i++) strike(first + i * STROKE_STEP, HOUR_ROD, 0.5);
  }

  protected build(): void {}
}

/**
 * A stovetop kettle coming to the boil: the hiss rising under it, then its whistle, a pure tone wavering as the steam
 * pushes through (`setWhistle`: 0 cold, a little a hiss, 1 the full whistle).
 */
export class KettleWhistle extends Voice {
  private amount = 0;
  private whistle: GainNode | null = null;
  private hiss: GainNode | null = null;
  private pipe: OscillatorNode | null = null;

  constructor() {
    super(0.4);
  }

  setWhistle(amount: number): void {
    this.amount = amount;
    const ctx = this.ctx;
    if (!ctx || !this.whistle || !this.hiss || !this.pipe) return;
    const now = ctx.currentTime;
    this.hiss.gain.setTargetAtTime(Math.min(1, amount * 2) * 0.12, now, 0.3);
    const sing = Math.max(0, amount - 0.5) * 2;
    this.whistle.gain.setTargetAtTime(sing * 0.18, now, 0.15);
    this.pipe.frequency.setTargetAtTime(1750 + 450 * sing, now, 0.4);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    this.pipe = ctx.createOscillator();
    this.pipe.frequency.value = 1750;
    // The steam's flutter on the pitch.
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 6.5;
    const depth = ctx.createGain();
    depth.gain.value = 18;
    wobble.connect(depth).connect(this.pipe.frequency);
    this.whistle = ctx.createGain();
    this.whistle.gain.value = 0;
    this.pipe.connect(this.whistle).connect(out);
    this.keep(this.pipe);
    this.keep(wobble);
    const steam = this.loop(ctx, this.noise(ctx, 2));
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 4500;
    band.Q.value = 0.7;
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    steam.connect(band).connect(this.hiss).connect(out);
    this.setWhistle(this.amount);
  }
}

/**
 * A canary in its cage: by day a song now and then (runs of quick chirps gliding up and down, a trill at the end),
 * at night nothing. `sing` starts one at once (the player whistled to it).
 */
export class CanarySong extends Voice {
  private untilSong = rand(4, 12);

  constructor(private readonly awake: () => boolean) {
    super(0.3);
  }

  sing(): void {
    const ctx = this.ctx;
    if (ctx && this.master) this.song(ctx, this.master);
  }

  protected build(): void {}

  protected override tick(ctx: AudioContext, dt: number): void {
    this.untilSong -= dt;
    if (this.untilSong > 0) return;
    this.untilSong = rand(8, 26);
    if (this.awake() && this.master) this.song(ctx, this.master);
  }

  private song(ctx: AudioContext, out: AudioNode): void {
    let at = ctx.currentTime + 0.05;
    const runs = 2 + Math.floor(random() * 3);
    for (let r = 0; r < runs; r++) {
      const base = rand(2600, 4200);
      const count = 3 + Math.floor(random() * 6);
      const step = rand(0.06, 0.11);
      const up = random() < 0.5;
      for (let i = 0; i < count; i++) {
        tone(ctx, out, at, { frequency: base, toRatio: up ? 1.35 : 0.7, glide: step * 0.8, level: 0.16, length: step * 0.9, attack: 0.004 });
        at += step;
      }
      at += rand(0.08, 0.3);
    }
    // The trill: one note beaten fast.
    const trill = rand(3000, 3800);
    for (let i = 0; i < 10; i++) tone(ctx, out, at + i * 0.035, { frequency: trill, level: 0.12, length: 0.03, attack: 0.002 });
  }
}

/**
 * The avenue two floors down, through the window: the low bed of the town's traffic, a car going by now and then, a
 * bus pulling away, sparrows in the plane trees by day. `busy` (0..1) is how much traffic there is now, `daylight` lets
 * the birds in.
 */
export class DistantAvenue extends Voice {
  private untilCar = rand(3, 9);
  private untilBird = rand(2, 8);
  private bedGain: GainNode | null = null;

  constructor(private readonly busy: () => number, private readonly daylight: () => number) {
    super(0.4);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    const rumble = this.loop(ctx, this.noise(ctx, 3));
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 380;
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0.05 + 0.1 * this.busy();
    rumble.connect(low).connect(this.bedGain).connect(out);
  }

  protected override tick(ctx: AudioContext, dt: number): void {
    const out = this.master;
    if (!out) return;
    const busy = this.busy();
    this.bedGain?.gain.setTargetAtTime(0.05 + 0.1 * busy, ctx.currentTime, 2);
    this.untilCar -= dt;
    if (this.untilCar <= 0) {
      this.untilCar = rand(4, 14) / (0.3 + busy);
      // A car passing: noise swelling and falling, its tyres' band sweeping down as it goes by.
      const bus = random() < 0.15;
      noiseBurst(ctx, out, ctx.currentTime, { band: bus ? 500 : 900, bandTo: bus ? 300 : 500, filter: 'lowpass', level: bus ? 0.4 : 0.28, length: rand(3, 5), attack: rand(1.2, 2), curve: 'exponential', floor: 0.0005 });
    }
    this.untilBird -= dt;
    if (this.untilBird <= 0) {
      this.untilBird = rand(3, 12);
      if (this.daylight() < 0.3) return;
      // A sparrow's cheeps, two or three.
      const at = ctx.currentTime;
      const n = 2 + Math.floor(random() * 2);
      for (let i = 0; i < n; i++) tone(ctx, out, at + i * rand(0.12, 0.2), { frequency: rand(3800, 5200), toRatio: 0.75, level: 0.05, length: 0.07, attack: 0.003 });
    }
  }
}
