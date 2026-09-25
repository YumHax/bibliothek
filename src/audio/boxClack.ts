import { audioBus, audioContext } from './audioContext';
import { whiteNoise } from './noise';

/** Length of the clack's noise (s), and its decay: a cubic fall from full to nothing over it. */
const CLACK_S = 0.06;
const DECAY = Float32Array.from({ length: 65 }, (_, i) => Math.pow(1 - i / 64, 3));

/**
 * The hollow clack of a plastic game case (or a cardboard box) knocking against a table: a
 * short burst of band-passed noise with a quick knock under it. `down` is a box set back
 * (lower, duller), otherwise one picked up. Called on a click, so the audio is already running.
 */
export function playBoxClack(down = false, level = 0.1): void {
  const ctx = audioContext();
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
  band.frequency.value = (down ? 1300 : 2100) * (0.9 + Math.random() * 0.2);
  band.Q.value = 2.5;
  noise.connect(shape).connect(band).connect(out);
  noise.start(t, Math.random() * (1 - CLACK_S), CLACK_S);

  const knock = ctx.createOscillator();
  knock.type = 'triangle';
  knock.frequency.setValueAtTime(down ? 190 : 260, t);
  knock.frequency.exponentialRampToValueAtTime(90, t + 0.05);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.6, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  knock.connect(env).connect(out);
  knock.start(t);
  knock.stop(t + 0.1);
  window.setTimeout(() => out.disconnect(), 300);
}
