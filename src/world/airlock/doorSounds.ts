import { whiteNoise } from '@/audio/noise';
import { shot } from '@/audio/oneShot';
import { noiseBurst, tone } from '@/audio/synth';
import { audioBus, startedAudioContext } from '@/audio/audioContext';

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
  knock(level, 1500, 3, 0.05, 140);
}

/** A heavy leaf meeting its frame. */
export function playThud(level = 0.4): void {
  knock(level, 380, 1.2, 0.14, 70);
}

/** A band of noise decaying over `decay` s, and a low sine knock at `knock` Hz under it, dying over half as long again. */
function knock(level: number, band: number, q: number, decay: number, knock: number): void {
  shot(level, decay * 1.5, { start: 'started', lead: 0 }, ({ ctx, out, t }) => {
    noiseBurst(ctx, out, t, { band, q, level: 1, length: decay, attack: 0, floor: 0.0001, noise: whiteNoise(ctx, 0.3), offset: 0 });
    tone(ctx, out, t, { frequency: knock * 1.6, to: knock, glide: decay, level: 0.8, length: decay * 1.4, attack: 0, floor: 0.0001, tail: decay * 0.1 });
  });
}
