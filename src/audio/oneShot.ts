import { audioBus, audioContext, type AudioChannel } from './audioContext';
import { whiteNoise } from './noise';

/*
 * The one-shot synth kit: a sound played by a click (the flat's household uses, the kitchen table's console repair),
 * synthesised on the spot on a fresh output and gone after. The player stands at the thing, so no distance model,
 * only a level. Each sound is a few bursts of noise and pings laid on the output's clock.
 */

/** A fresh output and the moment to lay the first sound on it. */
interface OneShot {
  ctx: AudioContext;
  out: GainNode;
  /** When the sound starts: a hair after now, so the first ramp is not already in the past. */
  t: number;
}

/**
 * A fresh output at `level` on `channel`'s bus (the world's, or the UI's for a sound heard over the fade that ducks
 * the room), let go `seconds` later; `lead` is how far ahead of now its clock starts. Null when the context cannot
 * start (no audio yet): the caller plays nothing.
 */
export function oneShot(level: number, seconds: number, channel: Exclude<AudioChannel, 'master'> = 'world', lead = 0.02): OneShot | null {
  let ctx: AudioContext;
  try {
    ctx = audioContext();
  } catch {
    return null;
  }
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(audioBus(ctx, channel));
  window.setTimeout(() => out.disconnect(), (seconds + 0.5) * 1000);
  return { ctx, out, t: ctx.currentTime + lead };
}

/** A burst of band-passed noise (a scuff, a rub, a grain). */
export function burst(ctx: AudioContext, out: AudioNode, t: number, band: number, q: number, level: number, length: number): void {
  const source = ctx.createBufferSource();
  source.buffer = whiteNoise(ctx, 1);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = band;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + Math.min(0.01, length * 0.3));
  env.gain.exponentialRampToValueAtTime(0.0005, t + length);
  source.connect(filter).connect(env).connect(out);
  source.start(t, Math.random() * 0.5);
  source.stop(t + length + 0.02);
}

/** A struck, decaying tone (a clink, a ding, a beep). */
export function ping(ctx: AudioContext, out: AudioNode, t: number, frequency: number, level: number, decay: number, type: OscillatorType = 'sine'): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0005, t + decay);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + decay + 0.02);
}

/** A number between `min` and `max`: the little differences that keep a repeated sound from sounding sampled. */
export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
