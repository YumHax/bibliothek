import { Voice } from './ambient';
import { noiseBurst, rand, tone } from './synth';
import { random } from '@/random';

/*
 * What the flat hears of itself and of the building, synthesised like the room's other sounds
 * (`ambient.ts`): the radiators ticking as they warm and cool, the neighbours through the
 * bedroom's party wall, the stairwell behind the front door. Each is an `AmbientVoice` on a
 * `PointSound`; they are rare and quiet, a room tone rather than an event.
 */

/**
 * A radiator's metal working as the water in it warms or cools: now and then a short run of dry
 * ticks and pings (a few, irregular, a little apart), sometimes a faint gurgle of water in the
 * pipes. Long silences between.
 */
export class RadiatorTick extends Voice {
  private untilRun = rand(6, 30);
  private ticksLeft = 0;
  private untilTick = 0;
  private burst: AudioBuffer | null = null;
  private gurgle: AudioBuffer | null = null;

  constructor() {
    super(0.28);
  }

  protected build(ctx: AudioContext): void {
    this.burst = this.noise(ctx, 0.03);
    this.gurgle = this.noise(ctx, 1.6);
  }

  protected override tick(ctx: AudioContext, dt: number): void {
    if (!this.master || !this.burst) return;
    if (this.ticksLeft > 0) {
      this.untilTick -= dt;
      if (this.untilTick > 0) return;
      this.ticksLeft--;
      this.untilTick = rand(0.12, 1.4);
      noiseBurst(ctx, this.master, ctx.currentTime, { band: rand(1900, 4200), q: 12, level: rand(0.25, 0.7), length: 0.04, attack: 0, floor: 0.0001, noise: this.burst, offset: 0 });
      return;
    }
    this.untilRun -= dt;
    if (this.untilRun > 0) return;
    this.untilRun = rand(25, 80);
    this.ticksLeft = 2 + Math.floor(random() * 6);
    this.untilTick = 0;
    if (random() < 0.3 && this.gurgle) this.gurgleOnce(ctx);
  }

  /** Water moving in the pipe: low band-passed noise, its centre wobbling, swelling and fading over a second. */
  private gurgleOnce(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.gurgle;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 6;
    band.frequency.setValueAtTime(300, now);
    for (let t = 0.1; t < 1.5; t += 0.1) band.frequency.linearRampToValueAtTime(rand(220, 620), now + t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
    source.connect(band).connect(gain).connect(this.master!);
    source.start(now);
    source.stop(now + 1.6);
  }
}

interface NeighbourVoicesOptions {
  /** Whether it is night: they talk less, and later on not at all. */
  night?: () => boolean;
}

/**
 * The neighbours through a party wall: two muffled voices taking turns (a buzz through formant
 * filters, syllables of a few tenths of a second, the pitch rising and falling by phrase), no word
 * ever made out, everything above 450 Hz eaten by the bricks. A conversation of half a minute to a
 * minute and a half, then silence for a few minutes; once in a while their television instead, a
 * steadier murmur with a laugh track's swell.
 */
export class NeighbourVoices extends Voice {
  private untilTalk = rand(10, 40);
  private talkLeft = 0;
  private phraseLeft = 0;
  private untilSyllable = 0;
  private speaker = 0;
  private tv = false;
  private osc: OscillatorNode | null = null;
  private f1: BiquadFilterNode | null = null;
  private f2: BiquadFilterNode | null = null;
  private envelope: GainNode | null = null;
  private murmur: GainNode | null = null;

  constructor(private readonly options: NeighbourVoicesOptions = {}) {
    super(0.5);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    // The wall: a steep low-pass over everything that comes through it.
    const wall = ctx.createBiquadFilter();
    wall.type = 'lowpass';
    wall.frequency.value = 450;
    wall.Q.value = 0.4;
    const wall2 = ctx.createBiquadFilter();
    wall2.type = 'lowpass';
    wall2.frequency.value = 700;
    wall.connect(wall2).connect(out);

    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 130;
    this.f1 = ctx.createBiquadFilter();
    this.f1.type = 'bandpass';
    this.f1.Q.value = 5;
    this.f1.frequency.value = 500;
    this.f2 = ctx.createBiquadFilter();
    this.f2.type = 'bandpass';
    this.f2.Q.value = 7;
    this.f2.frequency.value = 1200;
    this.envelope = ctx.createGain();
    this.envelope.gain.value = 0;
    const mix = ctx.createGain();
    mix.gain.value = 0.9;
    this.osc.connect(this.f1).connect(mix);
    this.osc.connect(this.f2).connect(mix);
    mix.connect(this.envelope).connect(wall);
    this.keep(this.osc);

    // The television's bed: noise shaped like speech, never parsed.
    const noise = this.loop(ctx, this.noise(ctx, 3));
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 380;
    band.Q.value = 1.2;
    this.murmur = ctx.createGain();
    // Rebuilt in the middle of their programme (the voice was let go while unheard): the set is still on.
    this.murmur.gain.value = this.tv && this.talkLeft > 0 ? 0.18 : 0;
    noise.connect(band).connect(this.murmur).connect(wall);
  }

  protected override tick(ctx: AudioContext, dt: number): void {
    if (!this.osc || !this.f1 || !this.f2 || !this.envelope || !this.murmur) return;
    const now = ctx.currentTime;
    if (this.talkLeft <= 0) {
      this.untilTalk -= dt;
      if (this.untilTalk > 0) return;
      const night = this.options.night?.() ?? false;
      // At night mostly quiet: most evenings end early next door.
      if (night && random() < 0.7) {
        this.untilTalk = rand(90, 240);
        return;
      }
      this.tv = random() < 0.3;
      this.talkLeft = rand(30, 90);
      this.phraseLeft = 0;
      if (this.tv) this.murmur.gain.setTargetAtTime(0.18, now, 1.5);
      return;
    }
    this.talkLeft -= dt;
    if (this.talkLeft <= 0) {
      this.untilTalk = rand(100, 260);
      this.envelope.gain.setTargetAtTime(0, now, 0.1);
      this.murmur.gain.setTargetAtTime(0, now, 2);
      return;
    }
    if (this.tv) {
      // A laugh track's swell now and then over the steady murmur.
      if (random() < dt / 12) {
        this.murmur.gain.setTargetAtTime(0.35, now, 0.3);
        this.murmur.gain.setTargetAtTime(0.18, now + 1.4, 0.6);
      }
      return;
    }
    this.untilSyllable -= dt;
    if (this.untilSyllable > 0) return;
    if (this.phraseLeft <= 0) {
      // Between phrases a pause, often the other one answering.
      this.phraseLeft = 3 + Math.floor(random() * 10);
      if (random() < 0.6) this.speaker = 1 - this.speaker;
      this.envelope.gain.setTargetAtTime(0, now, 0.06);
      this.untilSyllable = rand(0.4, 1.6);
      return;
    }
    this.phraseLeft--;
    const length = rand(0.09, 0.28);
    const base = this.speaker === 0 ? 115 : 205;
    // The pitch drifts down over a phrase, lifts on its first syllables.
    const pitch = base * (1 + 0.04 * this.phraseLeft) * rand(0.9, 1.12);
    this.osc.frequency.setTargetAtTime(pitch, now, 0.05);
    this.f1.frequency.setTargetAtTime(rand(300, 800), now, 0.03);
    this.f2.frequency.setTargetAtTime(rand(900, 2100), now, 0.03);
    const loud = rand(0.35, 0.8);
    this.envelope.gain.setTargetAtTime(loud, now, 0.025);
    this.envelope.gain.setTargetAtTime(loud * 0.25, now + length * 0.7, 0.03);
    this.untilSyllable = length + rand(0.02, 0.1);
  }
}

/**
 * The stairwell behind the front door: at long, irregular intervals someone climbing the stairs
 * (a run of footfalls, louder then fainter), the lift (its motor's hum rising and falling, a chime
 * at the floor), or a door on the landing pulled shut (a thud and the latch). Heard through the
 * door, so low and dull.
 */
export class StairwellSounds extends Voice {
  private untilEvent = rand(15, 50);
  private steps = 0;
  private stepIndex = 0;
  private untilStep = 0;
  private stepGap = 0.5;
  private burst: AudioBuffer | null = null;
  private out: AudioNode | null = null;

  constructor() {
    super(0.55);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    this.burst = this.noise(ctx, 0.12);
    const door = ctx.createBiquadFilter();
    door.type = 'lowpass';
    door.frequency.value = 900;
    door.connect(out);
    this.out = door;
  }

  protected override tick(ctx: AudioContext, dt: number): void {
    if (!this.out || !this.burst) return;
    if (this.stepIndex < this.steps) {
      this.untilStep -= dt;
      if (this.untilStep > 0) return;
      // Loudest halfway, as the climber passes the landing.
      const t = this.stepIndex / Math.max(1, this.steps - 1);
      const level = 0.25 + 0.75 * Math.sin(Math.PI * t);
      knock(ctx, this.out, rand(90, 140), level * rand(0.7, 1), this.burst, 0.09);
      this.stepIndex++;
      this.untilStep = this.stepGap * rand(0.85, 1.15);
      return;
    }
    this.untilEvent -= dt;
    if (this.untilEvent > 0) return;
    this.untilEvent = rand(60, 180);
    const roll = random();
    if (roll < 0.45) {
      this.steps = 10 + Math.floor(random() * 16);
      this.stepIndex = 0;
      this.stepGap = rand(0.38, 0.6);
      this.untilStep = 0;
    } else if (roll < 0.75) {
      this.lift(ctx);
    } else {
      this.doorShut(ctx);
    }
  }

  /** The lift going past: a low motor hum and a whine easing in and out over ten seconds, then its chime. */
  private lift(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const run = rand(7, 12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 2);
    gain.gain.setValueAtTime(0.35, now + run - 2);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + run);
    gain.connect(this.out!);
    for (const [frequency, level] of [
      [55, 0.6],
      [110, 0.35],
      [330, 0.08],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(frequency * 0.97, now);
      osc.frequency.linearRampToValueAtTime(frequency, now + 2);
      osc.frequency.setValueAtTime(frequency, now + run - 2);
      osc.frequency.linearRampToValueAtTime(frequency * 0.95, now + run);
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(gain);
      osc.start(now);
      osc.stop(now + run + 0.1);
    }
    // The chime at the floor, two soft notes.
    for (const [delay, pitch] of [
      [run - 1.2, 1318],
      [run - 0.8, 1046],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = pitch;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now + delay);
      g.gain.exponentialRampToValueAtTime(0.25, now + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.9);
      osc.connect(g).connect(this.out!);
      osc.start(now + delay);
      osc.stop(now + delay + 1);
    }
  }

  /** A neighbour's door on the landing: a heavy thud, the latch's click a moment after. */
  private doorShut(ctx: AudioContext): void {
    knock(ctx, this.out!, 70, 1, this.burst!, 0.25);
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.burst;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2200;
    band.Q.value = 5;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.4, now + 0.125);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    source.connect(band).connect(gain).connect(this.out!);
    source.start(now + 0.12);
  }
}

/** A knock through the wall: low-passed noise under a sine dropping in pitch, both swelling in 5 ms and gone in `seconds`. */
function knock(ctx: AudioContext, out: AudioNode, frequency: number, level: number, burst: AudioBuffer, seconds: number): void {
  const now = ctx.currentTime;
  noiseBurst(ctx, out, now, { band: frequency * 3, filter: 'lowpass', level, length: seconds, attack: 0.005, curve: 'exponential', floor: 0.0001, noise: burst, offset: 0 });
  tone(ctx, out, now, { frequency: frequency * 1.6, to: frequency, level: level * 0.8, length: seconds, attack: 0.005, curve: 'exponential', floor: 0.0001 });
}
