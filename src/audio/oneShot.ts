import { audioBus, audioContext, foregroundInput, startedAudioContext, type AudioChannel } from './audioContext';
import { spatialInput, type Spatial } from './spatial';

/*
 * Where a one-shot sound lands: a fresh output at a level on a bus, let go once the sound is over. Every click-made
 * sound (a latch, a bell, the household's uses) is a few of the kit's bursts and tones (`synth.ts`) laid on this
 * output's clock; the output knows the bus and, if the sound is placed, the side and the walls it is heard from.
 */

/** A fresh output and the moment to lay the first sound on it. */
interface OneShot {
  ctx: AudioContext;
  out: GainNode;
  /** When the sound starts: a hair after now, so the first ramp is not already in the past. */
  t: number;
}

/** A mixer channel, or `foreground`: the world's volume without the scene's duck (a sound the player is making). */
type OneShotChannel = Exclude<AudioChannel, 'master'> | 'foreground';

export interface OneShotOptions {
  /** Where it plays. Default `world`. */
  channel?: OneShotChannel;
  /** Where it is heard from (`spatial.ts`): a leg with the side and the walls in front of the bus. Default straight ahead, in the open. */
  spatial?: Spatial;
  /** How far ahead of now the clock starts (s). Default 0.02. */
  lead?: number;
  /** Seconds past `seconds` before the output is let go. Default 0.5. */
  free?: number;
  /**
   * `gesture` (default): the sound follows a click, so the context is asked for (created or resumed if need be).
   * `started`: a sound nobody clicked for, played only if a gesture already started the audio.
   */
  start?: 'gesture' | 'started';
}

/**
 * A fresh output at `level` on a bus, let go `seconds` later (plus `free`). Null when there is nothing to play
 * through (no audio yet, or a level nobody would hear): the caller plays nothing.
 */
export function oneShot(level: number, seconds: number, options: OneShotOptions = {}): OneShot | null {
  if (level <= 0.001) return null;
  const ctx = options.start === 'started' ? startedAudioContext() : audioContext();
  if (!ctx) return null;
  const channel = options.channel ?? 'world';
  const bus = channel === 'foreground' ? foregroundInput(ctx) : audioBus(ctx, channel);
  const free = options.free ?? 0.5;
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(spatialInput(ctx, bus, options.spatial, seconds + free));
  window.setTimeout(() => out.disconnect(), (seconds + free) * 1000);
  return { ctx, out, t: ctx.currentTime + (options.lead ?? 0.02) };
}

/** `oneShot` with the sound laid on at once by `build`; whether anything could play (for a caller that reports it). */
export function shot(level: number, seconds: number, options: OneShotOptions, build: (o: OneShot) => void): boolean {
  const o = oneShot(level, seconds, options);
  if (!o) return false;
  build(o);
  return true;
}
