import { audioContext } from './audioContext';

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
  out.connect(ctx.destination);

  const length = Math.floor(ctx.sampleRate * 0.06);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = (down ? 1300 : 2100) * (0.9 + Math.random() * 0.2);
  band.Q.value = 2.5;
  noise.connect(band).connect(out);
  noise.start(t);

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
