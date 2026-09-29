import { audioBus, startedAudioContext } from './audioContext';
import { whiteNoise } from './noise';
import { spatialInput, type Spatial } from './spatial';

/** A rummage: this many cases knocked about, this far apart (s). */
const RUMMAGE = { min: 3, max: 7, gapMin: 0.07, gapMax: 0.24 };
/** A crate dragged on the concrete: how long (s), and the scrape's band (Hz). */
const SCRAPE = { min: 0.35, max: 0.8, band: 900 };

/**
 * Someone going through a crate of games at a stall: a handful of plastic cases and cardboard boxes
 * knocking together, a little apart, each a short burst of band-passed noise over a hollow knock.
 * `level` 0..1 at the stall (the caller attenuates for distance); `spatial` places it.
 */
export function playRummage(level: number, spatial?: Spatial): void {
  const ctx = startedAudioContext();
  if (!ctx || level < 0.002) return;
  const count = RUMMAGE.min + Math.floor(Math.random() * (RUMMAGE.max - RUMMAGE.min + 1));
  const out = ctx.createGain();
  out.gain.value = level;
  const seconds = count * RUMMAGE.gapMax + 0.5;
  out.connect(spatialInput(ctx, audioBus(ctx, 'world'), spatial, seconds));
  const noise = whiteNoise(ctx, 1);
  let t = ctx.currentTime + 0.02;
  for (let i = 0; i < count; i++) {
    const cardboard = Math.random() < 0.3;
    const peak = 0.5 + Math.random() * 0.5;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = (cardboard ? 900 : 1700 + Math.random() * 900);
    band.Q.value = cardboard ? 1.2 : 2.5;
    const env = ctx.createGain();
    env.gain.setValueAtTime(peak, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + (cardboard ? 0.05 : 0.04));
    source.connect(band).connect(env).connect(out);
    source.start(t, Math.random() * 0.9, 0.08);

    const knock = ctx.createOscillator();
    knock.type = 'triangle';
    knock.frequency.setValueAtTime((cardboard ? 150 : 230) * (0.9 + Math.random() * 0.2), t);
    knock.frequency.exponentialRampToValueAtTime(90, t + 0.05);
    const knockEnv = ctx.createGain();
    knockEnv.gain.setValueAtTime(peak * 0.5, t);
    knockEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    knock.connect(knockEnv).connect(out);
    knock.start(t);
    knock.stop(t + 0.08);
    t += RUMMAGE.gapMin + Math.random() * (RUMMAGE.gapMax - RUMMAGE.gapMin);
  }
  window.setTimeout(() => out.disconnect(), seconds * 1000);
}

/**
 * A crate or a trestle dragged a little way on the concrete: low, rough noise swelling and
 * falling in a few jerks. `level` and `spatial` as `playRummage`.
 */
export function playCrateScrape(level: number, spatial?: Spatial): void {
  const ctx = startedAudioContext();
  if (!ctx || level < 0.002) return;
  const length = SCRAPE.min + Math.random() * (SCRAPE.max - SCRAPE.min);
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(spatialInput(ctx, audioBus(ctx, 'world'), spatial, length + 0.5));
  const t = ctx.currentTime + 0.02;
  const source = ctx.createBufferSource();
  source.buffer = whiteNoise(ctx, 2);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.setValueAtTime(SCRAPE.band * (0.8 + Math.random() * 0.4), t);
  band.frequency.linearRampToValueAtTime(SCRAPE.band * 0.6, t + length);
  band.Q.value = 1.4;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  // Two or three jerks: the crate sticks and gives.
  const jerks = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < jerks; i++) {
    const at = t + (length * i) / jerks;
    env.gain.exponentialRampToValueAtTime(0.6 + Math.random() * 0.4, at + 0.05);
    env.gain.exponentialRampToValueAtTime(0.08, at + length / jerks);
  }
  env.gain.exponentialRampToValueAtTime(0.0001, t + length + 0.05);
  source.connect(band).connect(env).connect(out);
  source.start(t, Math.random() * 1, length + 0.1);
  window.setTimeout(() => out.disconnect(), (length + 0.5) * 1000);
}
