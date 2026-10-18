import { audioBus, audioContext } from './audioContext';
import { whiteNoise } from './noise';
import { random } from '@/random';

/** Length of the clack's noise (s), and its decay: a cubic fall from full to nothing over it. */
const CLACK_S = 0.06;
const DECAY = Float32Array.from({ length: 65 }, (_, i) => Math.pow(1 - i / 64, 3));

/**
 * The hollow clack of a plastic game case (or, `cardboard`, the softer pat of a card box) knocking against a table: a
 * short burst of band-passed noise with a quick knock under it. `down` is a box set back
 * (lower, duller), otherwise one picked up. Called on a click, so the audio is already running.
 */
export function playBoxClack(down = false, level = 0.1, cardboard = false): void {
  const ctx = audioContext();
  if (!ctx) return;
  const t = ctx.currentTime + 0.005;
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(audioBus(ctx, 'world'));

  // A slice of the shared noise, a different one each time, shaped by the decay.
  const noise = ctx.createBufferSource();
  noise.buffer = whiteNoise(ctx, 1);
  const shape = ctx.createGain();
  shape.gain.setValueCurveAtTime(DECAY, t, CLACK_S);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  // Card is a duller, softer pat than a plastic case's clack.
  band.frequency.value = (down ? 1300 : 2100) * (cardboard ? 0.4 : 1) * (0.9 + random() * 0.2);
  band.Q.value = cardboard ? 1.2 : 2.5;
  noise.connect(shape).connect(band).connect(out);
  noise.start(t, random() * (1 - CLACK_S), CLACK_S);

  const knock = ctx.createOscillator();
  knock.type = 'triangle';
  knock.frequency.setValueAtTime((down ? 190 : 260) * (cardboard ? 0.6 : 1), t);
  knock.frequency.exponentialRampToValueAtTime(90, t + 0.05);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.6, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  knock.connect(env).connect(out);
  knock.start(t);
  knock.stop(t + 0.1);
  window.setTimeout(() => out.disconnect(), 300);
}

/** The crackle of shrink-wrap torn off a sealed box: a third of a second of bright, fluttering noise. */
export function playWrapTear(level = 0.08): void {
  const ctx = audioContext();
  if (!ctx) return;
  const t = ctx.currentTime + 0.005;
  const length = 0.35;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t);
  // A few crackles: the film giving in bursts as the thumb runs along it.
  for (let i = 0; i < 6; i++) {
    const at = t + (i / 6) * length + random() * 0.02;
    out.gain.linearRampToValueAtTime(level * (0.5 + random() * 0.5), at);
    out.gain.linearRampToValueAtTime(level * 0.15, at + 0.03);
  }
  out.gain.linearRampToValueAtTime(0, t + length);
  out.connect(audioBus(ctx, 'world'));
  const noise = ctx.createBufferSource();
  noise.buffer = whiteNoise(ctx, 1);
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 3200;
  noise.connect(high).connect(out);
  noise.start(t, random() * (1 - length), length);
  window.setTimeout(() => out.disconnect(), 600);
}
