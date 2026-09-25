import { audioBus, startedAudioContext } from '@/audio/audioContext';
import { whiteNoise } from '@/audio/noise';

/*
 * The street door's sounds, synthesised: the door release's buzz while the lock is held open, the
 * lock's clack when it lets go, and the heavy thud of a leaf swinging shut. All of them follow a
 * click, so the audio has started; they sound on the world bus, never muffled (they are in the sas).
 */

/** The door release: a harsh mains hum through a small speaker, until `stop()` (which clacks). */
export function startBuzz(level = 0.07): { stop(): void } {
  const ctx = startedAudioContext();
  if (!ctx) return { stop: () => undefined };
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.exponentialRampToValueAtTime(level, now + 0.03);
  const tone = ctx.createBiquadFilter();
  tone.type = 'bandpass';
  tone.frequency.value = 900;
  tone.Q.value = 0.8;
  tone.connect(out).connect(audioBus(ctx, 'world'));
  const oscillators = [100, 200.6].map((hz, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? 'sawtooth' : 'square';
    osc.frequency.value = hz;
    const gain = ctx.createGain();
    gain.gain.value = i === 0 ? 1 : 0.35;
    osc.connect(gain).connect(tone);
    osc.start(now);
    return osc;
  });
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(level, t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      for (const osc of oscillators) osc.stop(t + 0.06);
      playClack();
    },
  };
}

/** The lock letting go: a short bright knock of metal, a little wood under it. */
export function playClack(level = 0.35): void {
  burst(level, 1500, 3, 0.05, 140);
}

/** A heavy leaf meeting its frame. */
export function playThud(level = 0.4): void {
  burst(level, 380, 1.2, 0.14, 70);
}

/** A band of noise decaying over `decay` s, and a low sine knock at `knock` Hz under it. */
function burst(level: number, band: number, q: number, decay: number, knock: number): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const out = audioBus(ctx, 'world');
  const source = ctx.createBufferSource();
  source.buffer = whiteNoise(ctx, 0.3);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = band;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(level, now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + decay);
  source.connect(filter).connect(env).connect(out);
  source.start(now);
  source.stop(now + decay + 0.02);
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(knock * 1.6, now);
  osc.frequency.exponentialRampToValueAtTime(knock, now + decay);
  const low = ctx.createGain();
  low.gain.setValueAtTime(level * 0.8, now);
  low.gain.exponentialRampToValueAtTime(0.0001, now + decay * 1.4);
  osc.connect(low).connect(out);
  osc.start(now);
  osc.stop(now + decay * 1.5);
}
