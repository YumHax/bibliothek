import { Voice } from '@/audio/ambient';
import { audioBus, startedAudioContext } from '@/audio/audioContext';
import { brownNoise } from '@/audio/noise';
import { rand, tone } from '@/audio/synth';
import { random } from '@/random';

/*
 * What the cellars sound like: the boiler's low roar and its pump's hum, water dripping from the vault into a
 * puddle (a plip, its ring in the brick), the rat's squeak as it runs.
 */

/** The boiler: a low burner roar and the 50 Hz of its pump. */
export class BoilerHum extends Voice {
  constructor() {
    super(0.3, { follow: 0.6 });
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    const roar = this.loop(ctx, brownNoise(ctx, 4));
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 220;
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0.35;
    roar.connect(lowpass).connect(roarGain).connect(out);
    const pump = this.keep(ctx.createOscillator());
    pump.type = 'sine';
    pump.frequency.value = 50;
    const pumpGain = ctx.createGain();
    pumpGain.gain.value = 0.05;
    pump.connect(pumpGain).connect(out);
    pump.start();
  }
}

/** Water dripping from the vault: a plip every few seconds, now and then two together. */
export class Drips extends Voice {
  private untilDrip = rand(1, 4);
  private out: AudioNode | null = null;

  constructor() {
    super(0.3);
  }

  protected build(_ctx: AudioContext, out: GainNode): void {
    this.out = out;
  }

  protected override tick(ctx: AudioContext, dt: number): void {
    this.untilDrip -= dt;
    if (this.untilDrip > 0 || !this.out) return;
    this.untilDrip = random() < 0.2 ? 0.25 : rand(2.5, 7);
    // One drop: a sine falling fast in pitch, a short ring.
    const from = rand(900, 1600);
    tone(ctx, this.out, ctx.currentTime + 0.01, { frequency: from, to: from * 0.45, glide: 0.09, level: 0.4, length: 0.25, attack: 0.005, curve: 'exponential', floor: 0.0001, tail: 0.05 });
  }
}

/** The rat: two quick squeaks, `level` loud (0..1). */
export function playSqueak(level: number): void {
  const ctx = startedAudioContext();
  if (!ctx || level <= 0) return;
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(audioBus(ctx, 'world'));
  for (const delay of [0, 0.13]) {
    const at = ctx.currentTime + 0.02 + delay;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(3200, at);
    osc.frequency.linearRampToValueAtTime(4200, at + 0.04);
    osc.frequency.linearRampToValueAtTime(2800, at + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.3, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + 0.1);
  }
}

