import { audioBus, startedAudioContext } from './audioContext';
import { whiteNoise } from './noise';
import { random } from '@/random';

const DECAY = Float32Array.from({ length: 65 }, (_, i) => Math.pow(1 - i / 64, 4));

/**
 * The auctioneer's gavel on its sounding block: a hard wooden knock (a falling triangle tone under a short burst of
 * band-passed noise), `times` strokes (the hammer once; a call to order twice). Silent until the audio has started
 * (the hammer can fall with no click of the player's behind it).
 */
export function playGavel(times = 1, level = 0.22): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(audioBus(ctx, 'world'));
  for (let i = 0; i < times; i++) {
    const t = ctx.currentTime + 0.01 + i * 0.22;
    const noise = ctx.createBufferSource();
    noise.buffer = whiteNoise(ctx, 1);
    const shape = ctx.createGain();
    shape.gain.setValueCurveAtTime(DECAY, t, 0.05);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900 + random() * 120;
    band.Q.value = 3;
    noise.connect(shape).connect(band).connect(out);
    noise.start(t, random() * 0.9, 0.05);
    const knock = ctx.createOscillator();
    knock.type = 'triangle';
    knock.frequency.setValueAtTime(320, t);
    knock.frequency.exponentialRampToValueAtTime(110, t + 0.06);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.9, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    knock.connect(env).connect(out);
    knock.start(t);
    knock.stop(t + 0.12);
  }
  window.setTimeout(() => out.disconnect(), 400 + times * 250);
}
