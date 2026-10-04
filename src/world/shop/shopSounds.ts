import { Voice, type AmbientVoice } from '@/audio/ambient';
import { audioBus, startedAudioContext } from '@/audio/audioContext';
import { brownNoise, whiteNoise } from '@/audio/noise';
import { RadioVoice } from '@/audio/kitchenSounds';
import { birdNote } from '@/audio/street/streetVoices';
import { noiseBurst, partials, rand } from '@/audio/synth';
import { random } from '@/random';

/*
 * What the walk-in shops sound like, synthesised like the flat's own room sounds (`audio/ambient`):
 * each an `AmbientVoice` on a `PointSound` at its fixture (the fish tank's bubbler, the TV wall's
 * snow, the pet shop's budgies, the repair shop's radio), and a room tone by the shop window with the
 * street muffled behind the glass. The till's ka-ching is a one-shot, after a sale.
 */

/** The fish tank's air pump: a soft electric buzz, and a stream of bubbles popping at the surface. */
export class TankBubbler extends Voice {
  private untilBubble = 0;

  constructor() {
    super(0.32);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    // The pump's diaphragm: mains hum, mostly its second harmonic, through the cabinet.
    for (const [frequency, level] of [
      [50, 0.05],
      [100, 0.12],
      [200, 0.03],
    ] as const) {
      const osc = this.keep(ctx.createOscillator());
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(out);
    }
    // The water churned by the stone: a faint band of noise.
    const churn = this.loop(ctx, this.noise(ctx, 2));
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    band.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    churn.connect(band).connect(gain).connect(out);
  }

  protected override tick(ctx: AudioContext, dt: number): void {
    this.untilBubble -= dt;
    if (this.untilBubble > 0 || !this.master) return;
    this.untilBubble = rand(0.04, 0.16);
    // A bubble breaking: a sine sweeping up fast, gone in a few hundredths.
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const from = rand(500, 1100);
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(from * rand(1.8, 2.6), now + 0.03);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(rand(0.08, 0.22), now + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    osc.connect(env).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.05);
  }
}

/** A wall of untuned sets: the hiss of snow from a dozen small speakers, and a crackle now and then. */
export class SnowHiss extends Voice {
  private untilCrackle = rand(1, 4);

  constructor() {
    super(0.16);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    const hiss = this.loop(ctx, this.noise(ctx, 3));
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 1800;
    const tinny = ctx.createBiquadFilter();
    tinny.type = 'lowpass';
    tinny.frequency.value = 7000;
    hiss.connect(high).connect(tinny).connect(out);
  }

  protected override tick(ctx: AudioContext, dt: number): void {
    this.untilCrackle -= dt;
    if (this.untilCrackle > 0 || !this.master) return;
    this.untilCrackle = rand(0.8, 5);
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noise(ctx, 0.05);
    const env = ctx.createGain();
    env.gain.setValueAtTime(rand(0.6, 1.2), now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    source.connect(env).connect(this.master);
    source.start(now);
  }
}

/** The pet shop's budgies, chattering in bursts (the hamster's wheel is its own cage's: `pets/hamsterSounds`). */
export class PetShopNoises extends Voice {
  private untilChirp = rand(1, 4);

  constructor() {
    super(0.3);
  }

  protected build(): void {}

  protected override tick(ctx: AudioContext, dt: number): void {
    if (!this.master) return;
    this.untilChirp -= dt;
    if (this.untilChirp <= 0) {
      this.untilChirp = rand(1.5, 7);
      this.chatter(ctx, this.master);
    }
  }

  /** A budgie's burst: three to eight quick warbled notes, high and bright. */
  private chatter(ctx: AudioContext, out: AudioNode): void {
    let at = ctx.currentTime + 0.02;
    const notes = 3 + Math.floor(random() * 6);
    for (let i = 0; i < notes; i++) {
      const from = rand(2600, 4200);
      const length = rand(0.04, 0.1);
      birdNote(ctx, out, { at, from, to: from * rand(0.7, 1.35), sweep: length * 0.8, attack: 0.008, length, level: rand(0.12, 0.28) });
      at += length + rand(0.02, 0.09);
    }
  }
}

/**
 * A shop's room tone by its window: the building's low hum, and the street behind the glass, dull
 * and far (the traffic's rumble, a car going by now and then, swelling and fading).
 */
export class ShopRoomTone extends Voice {
  private untilCar = rand(3, 10);

  constructor() {
    super(0.4, { follow: 0.4 });
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    const rumble = this.loop(ctx, brownNoise(ctx, 4));
    const glass = ctx.createBiquadFilter();
    glass.type = 'lowpass';
    glass.frequency.value = 380;
    const gain = ctx.createGain();
    gain.gain.value = 0.18;
    rumble.connect(glass).connect(gain).connect(out);
    const hum = this.keep(ctx.createOscillator());
    hum.frequency.value = 100;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.012;
    hum.connect(humGain).connect(out);
  }

  protected override tick(ctx: AudioContext, dt: number): void {
    this.untilCar -= dt;
    if (this.untilCar > 0 || !this.master) return;
    this.untilCar = rand(6, 22);
    // A car going past outside: noise through the glass, swelling over a second or two and fading.
    const now = ctx.currentTime;
    const run = rand(2.5, 4.5);
    const source = ctx.createBufferSource();
    source.buffer = whiteNoise(ctx, 5);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(260, now);
    low.frequency.linearRampToValueAtTime(620, now + run / 2);
    low.frequency.linearRampToValueAtTime(240, now + run);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(rand(0.12, 0.25), now + run / 2);
    env.gain.exponentialRampToValueAtTime(0.0001, now + run);
    source.connect(low).connect(env).connect(this.master);
    source.start(now);
    source.stop(now + run + 0.05);
  }
}

/**
 * A shop's radio, left on all day: the kitchen radio's endless pop (`RadioVoice`), switched on the first time it is
 * heard (a click brought the player in, so the audio runs). Given the radio set it plays from (`kitchen/Radio`), it is
 * that set's voice: switched on with its dial lit, and a click on the set switches it off for good.
 */
export class ShopRadio implements AmbientVoice {
  private readonly radio: RadioVoice;
  private started = false;

  constructor(private readonly set: { readonly sound: RadioVoice; setOn(on: boolean): void } | null = null) {
    this.radio = set?.sound ?? new RadioVoice();
  }

  setLevel(level: number): void {
    if (!this.started && level > 0.002 && startedAudioContext()) {
      this.started = true;
      if (this.set) this.set.setOn(true);
      else this.radio.setOn(true);
    }
    this.radio.setLevel(level * 0.55);
  }

  update(): void {
    this.radio.update();
  }

  /** Where the set stands: the side it is heard from and the walls between (the radio's own `setSpatial`). */
  setSpatial(pan: number, walls: number): void {
    this.radio.setSpatial(pan, walls);
  }

  setZoneActive(active: boolean): void {
    if (!active) this.radio.setLevel(0);
  }

  dispose(): void {
    this.radio.dispose();
  }
}

/** The shop's bursts strike from silence in 3 ms and die to 0.0001, cut from the first 0.3 s of the noise, as they always did. */
const GRAIN = { attack: 0.003, curve: 'exponential', floor: 0.0001, offset: 0 } as const;

/** The till after a sale: the drawer's bell (two bright partials ringing out) and its rattle as it shoots open. */
export function playTill(level = 0.12): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(audioBus(ctx, 'world'));
  // The keys: two dry clicks.
  for (const at of [0, 0.09]) noiseBurst(ctx, out, now + at, { ...GRAIN, band: 2600, q: 4, level: 0.5, length: 0.02, noise: whiteNoise(ctx, 0.3) });
  // The bell: three partials ringing out over nearly a second.
  partials(ctx, out, now + 0.2, [
    [2093, 0.7],
    [2637, 0.45],
    [4186, 0.15],
  ], { length: 0.9, attack: 0.003, curve: 'exponential', floor: 0.0001, tail: 0.05 });
  // The drawer: a rattle of coins and wood.
  noiseBurst(ctx, out, now + 0.24, { ...GRAIN, band: 1400, q: 1.5, level: 0.6, length: 0.16, noise: whiteNoise(ctx, 0.3) });
  window.setTimeout(() => out.disconnect(), 1500);
}

/** What a clerk's chore sounds like: a watering can's sprinkle, a tin of fish flakes shaken, a knuckle on a set's case. */
export type ChoreSound = 'water' | 'feed' | 'tap';

/** One of the clerk's chores, heard at `level` (0..1, the distance already applied). */
export function playChore(kind: ChoreSound, level: number): void {
  const ctx = startedAudioContext();
  if (!ctx || level < 0.005) return;
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(audioBus(ctx, 'world'));
  switch (kind) {
    case 'water':
      // Water through the rose onto leaves: a hiss rising and falling over a second and a half, patters in it.
      noiseSwell(ctx, out, now, 4200, 0.8, 0.25, 1.6);
      for (let t = 0.1; t < 1.5; t += rand(0.03, 0.09)) noiseBurst(ctx, out, now + t, { ...GRAIN, band: rand(1800, 3400), q: 6, level: rand(0.05, 0.15), length: 0.02, noise: whiteNoise(ctx, 0.3) });
      break;
    case 'feed':
      for (let i = 0; i < 3; i++) noiseBurst(ctx, out, now + i * 0.16, { ...GRAIN, band: 3600, q: 2, level: 0.35, length: 0.07, noise: whiteNoise(ctx, 0.3) });
      break;
    case 'tap':
      for (const at of [0, 0.22]) {
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(240, now + at);
        osc.frequency.exponentialRampToValueAtTime(120, now + at + 0.06);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, now + at);
        env.gain.exponentialRampToValueAtTime(0.5, now + at + 0.003);
        env.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.09);
        osc.connect(env).connect(out);
        osc.start(now + at);
        osc.stop(now + at + 0.1);
        noiseBurst(ctx, out, now + at, { ...GRAIN, band: 900, q: 2, level: 0.3, length: 0.04, noise: whiteNoise(ctx, 0.3) });
      }
      break;
  }
  window.setTimeout(() => out.disconnect(), 2200);
}

/** A band of noise swelling to `level` and fading over `length` s. */
function noiseSwell(ctx: AudioContext, out: AudioNode, at: number, band: number, q: number, level: number, length: number): void {
  const source = ctx.createBufferSource();
  source.buffer = whiteNoise(ctx, length + 0.1);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = band;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(level, at + length * 0.3);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(env).connect(out);
  source.start(at);
  source.stop(at + length + 0.05);
}

/**
 * A fluorescent tube's ballast (`common/TubeBatten`): a thin mains hum, 100 Hz and its harmonics through a band, and a
 * tick of crackle when the tube stutters. Silent while the tubes are off (`setLit`).
 */
export class TubeHum extends Voice {
  private gate: GainNode | null = null;
  private lit = true;
  private crackles = 0;

  constructor() {
    super(0.05);
  }

  setLit(on: boolean): void {
    this.lit = on;
    if (this.ctx && this.gate) this.gate.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  }

  /** The tube drops out for a moment: a few ticks of crackle. */
  stutter(): void {
    if (this.lit) this.crackles = 3 + Math.floor(random() * 4);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    this.gate = ctx.createGain();
    this.gate.gain.value = this.lit ? 1 : 0;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 240;
    band.Q.value = 0.8;
    for (const [frequency, level] of [
      [100, 0.5],
      [200, 0.35],
      [300, 0.18],
      [400, 0.08],
    ] as const) {
      const osc = this.keep(ctx.createOscillator());
      osc.frequency.value = frequency * rand(0.998, 1.002);
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(band);
    }
    band.connect(this.gate).connect(out);
  }

  protected override tick(ctx: AudioContext): void {
    if (this.crackles <= 0 || !this.master || random() > 0.3) return;
    this.crackles--;
    noiseBurst(ctx, this.master, ctx.currentTime, { ...GRAIN, band: rand(2500, 4500), q: 4, level: rand(0.3, 0.6), length: 0.03, noise: whiteNoise(ctx, 0.3) });
  }
}

