import { audioBus, startedAudioContext } from '@/audio/audioContext';
import { whiteNoise } from '@/audio/noise';

/*
 * What a travel door sounds like, synthesised: the latch as the handle goes down, the shop bell on
 * its spring over a shop's door, the leaf pulled shut behind the player on the other side. They
 * follow a click, so the audio has started; they sound on the world bus.
 */

/** The handle going down and the latch drawing back: a small metal knock, a wooden creak after it. */
export function playLatch(level = 0.22): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const out = audioBus(ctx, 'world');
  burst(ctx, out, now, 1700, 4, level, 0.04);
  burst(ctx, out, now + 0.07, 2300, 6, level * 0.6, 0.03);
  // The hinges: a short rising squeak, faint.
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(520, now + 0.14);
  osc.frequency.linearRampToValueAtTime(760, now + 0.36);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now + 0.14);
  env.gain.exponentialRampToValueAtTime(level * 0.08, now + 0.2);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
  osc.connect(env).connect(out);
  osc.start(now + 0.14);
  osc.stop(now + 0.4);
}

/** The bell on its spring over a shop door: a bright jingle, struck four or five times as it bobs, ringing out. */
export function playShopBell(level = 0.1, delay = 0): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(audioBus(ctx, 'world'));
  let at = ctx.currentTime + delay;
  const strikes = 4 + Math.floor(Math.random() * 2);
  for (let i = 0; i < strikes; i++) {
    const loud = Math.pow(0.62, i);
    for (const [frequency, peak] of [
      [2480, 1],
      [3310, 0.55],
      [5120, 0.25],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency * (1 + (Math.random() - 0.5) * 0.01);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(peak * loud, at + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
      osc.connect(env).connect(out);
      osc.start(at);
      osc.stop(at + 0.62);
    }
    at += 0.07 + Math.random() * 0.05;
  }
  window.setTimeout(() => out.disconnect(), (at - ctx.currentTime + 0.8) * 1000);
}

/** The door swinging shut behind the player: a soft thud of the leaf in its frame, the latch clicking home. */
export function playDoorShut(level = 0.25): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const out = audioBus(ctx, 'world');
  burst(ctx, out, now, 320, 1.2, level, 0.16);
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(110, now);
  osc.frequency.exponentialRampToValueAtTime(65, now + 0.15);
  const low = ctx.createGain();
  low.gain.setValueAtTime(level * 0.7, now);
  low.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  osc.connect(low).connect(out);
  osc.start(now);
  osc.stop(now + 0.22);
  burst(ctx, out, now + 0.05, 2400, 5, level * 0.5, 0.03);
}

/** A band of noise at `at`, decaying over `decay` s. */
function burst(ctx: AudioContext, out: AudioNode, at: number, band: number, q: number, level: number, decay: number): void {
  const source = ctx.createBufferSource();
  source.buffer = whiteNoise(ctx, 0.3);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = band;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(level, at + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  source.connect(filter).connect(env).connect(out);
  source.start(at);
  source.stop(at + decay + 0.02);
}
