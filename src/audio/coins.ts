import { audioBus, audioContext } from './audioContext';

/** Partials of a struck coin (Hz): inharmonic, bright, short. */
const PARTIALS = [2350, 3900, 5600];

/**
 * A few coins changing hands: `count` metallic clinks a little apart, each a handful of decaying
 * inharmonic partials. Called at the moment of a sale (a click started the audio already).
 */
export function playCoins(count = 3, level = 0.12): void {
  const ctx = audioContext();
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(audioBus(ctx, 'world'));
  let t = ctx.currentTime + 0.01;
  for (let i = 0; i < count; i++) {
    const pitch = 0.9 + Math.random() * 0.25;
    for (const [k, f] of PARTIALS.entries()) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f * pitch;
      const env = ctx.createGain();
      const peak = 1 / (k + 1.5);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peak, t + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0005, t + 0.18 + 0.1 / (k + 1));
      osc.connect(env).connect(out);
      osc.start(t);
      osc.stop(t + 0.35);
    }
    t += 0.06 + Math.random() * 0.07;
  }
  window.setTimeout(() => out.disconnect(), (t - ctx.currentTime + 0.5) * 1000);
}
