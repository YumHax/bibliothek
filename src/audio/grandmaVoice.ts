import { oneShot } from './oneShot';
import { partials } from './synth';
import type { Spatial } from './spatial';
import { random } from '@/random';

/*
 * Mémé's voice and her telephone (docs/grandma.md "Her presence"): her lines heard as a soft babble of little sung
 * syllables, an old lady's pitch with a waver in it (the words are in her bubble), and the rotary set's bell when
 * Gaspard rings. Placed by the caller (`spatial`) on the world bus, so the settings' volume holds.
 */

/** A syllable's length (s), the gap after it, the longest a line's babble runs, seconds per character. */
const SYLLABLE = { min: 0.06, max: 0.12, gap: 0.035 };
const LONGEST_S = 2.4;
const PER_CHAR = 0.03;
/** Her pitch (Hz), how far a syllable wanders from it, the waver (vibrato) rate and depth. */
const PITCH = { base: 395, wander: 0.16, vibratoHz: 6.2, vibrato: 0.025 };
/** A question lifts the last syllables, a statement lets them fall. */
const TUNE = { rise: 0.18, fall: 0.12 };

/** Her line `text` babbled at `level` (at the mouth, already attenuated for distance). */
export function playGrandmaVoice(text: string, level: number, spatial?: Spatial): void {
  const seconds = Math.min(LONGEST_S, Math.max(0.3, text.replace(/\s+/g, '').length * PER_CHAR));
  const o = oneShot(level, seconds + 0.3, { start: 'started', ...(spatial ? { spatial } : {}) });
  if (!o) return;
  const { ctx, out } = o;
  try {
    // A soft reed: a triangle through a vowel-ish band, the waver on its pitch.
    const vowel = ctx.createBiquadFilter();
    vowel.type = 'bandpass';
    vowel.frequency.value = 1100;
    vowel.Q.value = 1.1;
    vowel.connect(out);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = PITCH.vibratoHz;
    const depth = ctx.createGain();
    depth.gain.value = PITCH.base * PITCH.vibrato;
    lfo.connect(depth);
    lfo.start(o.t);
    lfo.stop(o.t + seconds + 0.2);
    const ending = text.trimEnd().slice(-1);
    const tail = ending === '?' ? TUNE.rise : ending === '.' || ending === '!' || ending === '…' ? -TUNE.fall : 0;
    let t = o.t;
    const end = o.t + seconds;
    while (t < end) {
      const length = SYLLABLE.min + random() * (SYLLABLE.max - SYLLABLE.min);
      const along = (t - o.t) / seconds;
      const lift = 1 + (random() * 2 - 1) * PITCH.wander + tail * Math.max(0, (along - 0.6) / 0.4);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(PITCH.base * lift, t);
      osc.frequency.exponentialRampToValueAtTime(PITCH.base * lift * (0.94 + random() * 0.04), t + length);
      depth.connect(osc.frequency);
      vowel.frequency.setValueAtTime(900 + random() * 600, t);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.7 + random() * 0.3, t + length * 0.25);
      env.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(env).connect(vowel);
      osc.start(t);
      osc.stop(t + length + 0.02);
      t += length + SYLLABLE.gap * (0.5 + random());
    }
  } catch {
    // Quiet rather than broken.
  }
}

/** The rotary telephone's bell: two strikes' worth of a fast trill, `rings` times, a pause between. Its length (s). */
export function playRotaryRing(rings: number, level: number, spatial?: Spatial): number {
  const ring = 1.6;
  const pause = 2.4;
  const seconds = rings * (ring + pause);
  const o = oneShot(level, seconds, { start: 'started', ...(spatial ? { spatial } : {}) });
  if (!o) return seconds;
  const { ctx, out, t } = o;
  // The clapper between two bells, twenty strikes a second.
  for (let r = 0; r < rings; r++) {
    const from = t + r * (ring + pause);
    for (let s = 0; s * 0.05 < ring; s++) {
      const bell = s % 2 === 0 ? 1 : 1.07;
      partials(ctx, out, from + s * 0.05, [
        [1150 * bell, 0.5],
        [2780 * bell, 0.25],
        [4130 * bell, 0.12, 0.08],
      ], { length: 0.16, attack: 0.001 });
    }
  }
  return seconds;
}
